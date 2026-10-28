"use client";

// Runs the AI over every sheet of the open project (lib/sheet-reference-ai), a few sheets per request, and saves
// what it found for each bid package in the project's "drawing-references-ai" draft, so every package's "On the
// drawings" list and its highlights come from it. One run per tab; the estimator starts it, since it reads the
// whole drawing set (a few dollars of AI for a large set).

import { useSyncExternalStore } from "react";
import type { DrawingReference, SheetText } from "./drawing-references";
import type { TradePackage } from "./procurement";
import { referenceBatches, type SheetReferenceAnswer } from "./sheet-reference-ai";
import { SCANNED_PAGE_TEXT } from "./project-files";
import { writeDraft } from "./use-local-draft";

export const AI_REFERENCES_KEY = "drawing-references-ai";
/** One AI pass over a project's sheets. `key` names the sheets it read; `packages` the packages it looked for. */
export type AiReferences = { key: string; model: string; at: string; packages: string[]; refs: Record<string, DrawingReference[]>; read: number; failed: string[]; cost?: number };

/** `cost`: dollars the run's Claude requests have cost so far (lib/ai-cost), 0 on DeepSeek. */
export type ReferenceRun = { running: boolean; projectId: string; done: number; total: number; failed: string[]; cost: number };
let snapshot: ReferenceRun = { running: false, projectId: "", done: 0, total: 0, failed: [], cost: 0 };
const listeners = new Set<() => void>();
const set = (change: Partial<ReferenceRun>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(l => l()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
let controller: AbortController | null = null;
const PARALLEL = 3;

type Pkg = Pick<TradePackage, "id" | "name" | "code"> & { sections: string[] };

async function post(input: unknown, signal: AbortSignal): Promise<SheetReferenceAnswer & { model: string; cost: number | null }> {
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job: "sheet-references", input }), signal });
  const body = await response.json().catch(() => ({ error: `The AI request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `The AI request failed (${response.status}).`);
  return body;
}

/** Reads every sheet with printed text and saves what the AI found; `key` names this set of sheets. */
export async function findReferencesWithAi(projectId: string, key: string, sheets: SheetText[], packages: Pkg[]): Promise<void> {
  if (snapshot.running || !packages.length) return;
  controller = new AbortController();
  const signal = controller.signal;
  const readable = sheets.filter(s => s.text.trim().length >= SCANNED_PAGE_TEXT);
  const queue = referenceBatches(readable);
  set({ running: true, projectId, done: 0, total: queue.length, failed: [], cost: 0 });
  const found = new Map<string, DrawingReference[]>(packages.map(p => [p.id, []]));
  const failed: string[] = [];
  let model = "", unreadSheets = 0, inARow = 0;
  const input = { packages: packages.map(p => ({ id: p.id, name: p.name, code: p.code, sections: p.sections })) };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let batch = queue.shift(); batch && !signal.aborted; batch = queue.shift()) {
      try {
        const answer = await post({ ...input, sheets: batch.map(s => ({ sheet: s.sheet, title: s.title, discipline: s.discipline, text: s.text })) }, signal);
        model = answer.model; inARow = 0;
        set({ cost: snapshot.cost + (answer.cost ?? 0) });
        for (const s of answer.sheets) {
          const sheet = batch.find(b => b.sheet === s.sheet);
          if (sheet) for (const p of s.packages) found.get(p.id)?.push({ docId: sheet.docId, page: sheet.page, sheet: sheet.sheet, title: sheet.title, discipline: sheet.discipline, lines: p.lines });
        }
      } catch (error) {
        if (signal.aborted) break;
        unreadSheets += batch.length; inARow++;
        failed.push(`${batch.map(s => s.sheet).join(", ")}: ${error instanceof Error ? error.message : "could not be read"}`);
        // A missing key or a service that keeps failing stops the run instead of failing every sheet.
        if (inARow >= 3 || /isn't set up|API key|401|402/i.test(failed.at(-1)!)) { unreadSheets += queue.flat().length; queue.length = 0; }
      }
      set({ done: snapshot.done + 1, failed: [...failed] });
    }
  }));
  const order = new Map(sheets.map((s, i) => [`${s.docId}:${s.page}`, i]));
  const refs = Object.fromEntries([...found].map(([id, list]) => [id, list.sort((a, b) => (order.get(`${a.docId}:${a.page}`) ?? 0) - (order.get(`${b.docId}:${b.page}`) ?? 0))]));
  if (!signal.aborted && model) {
    try { writeDraft<AiReferences>(projectId, AI_REFERENCES_KEY, { key, model, at: new Date().toISOString(), packages: packages.map(p => p.id), refs, read: readable.length - unreadSheets, failed, cost: snapshot.cost }); }
    catch { failed.push("The results could not be saved in this browser (storage is full)."); }
  }
  controller = null;
  set({ running: false, failed: [...failed] });
}

/** Stops the run; nothing is saved for a stopped run. */
export const stopReferences = () => controller?.abort();

export const useReferenceRun = (): ReferenceRun => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

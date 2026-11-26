"use client";

// The browser's side of the AI memory (/api/memory): reading entries for the memory screen and for scans, adding,
// approving and retiring them, and sending corrections to learn from. A scan never waits on the memory: if it can't
// be reached, the scan reads without it and says so.

import { useEffect, useState } from "react";
import { bidSheets, leaveOutSheets, type MemoryChange, type MemoryEntry, type MemoryInput, type MemoryKind, type MemoryOrigin, type MemoryStatus } from "./memory";
import { readDraft } from "./use-local-draft";
import type { MemoryCounts } from "./memory-store";
import type { LeveledLine } from "./word-levels";

/** Who changes the memory, until accounts exist (the name the app shows). */
export const MEMORY_ACTOR = "Marcel Khoury";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", "x-by": MEMORY_ACTOR, ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error ?? `The AI memory couldn't be reached (${response.status}).`), { status: response.status, entry: body?.entry as MemoryEntry | undefined });
  return body as T;
}

export type MemoryFilter = { status?: MemoryStatus[]; kind?: MemoryKind[]; origin?: MemoryOrigin[]; project?: string; projectOnly?: string; trades?: string[]; q?: string; limit?: number; offset?: number };
export function fetchMemory(filter: MemoryFilter = {}): Promise<MemoryEntry[]> {
  const params = new URLSearchParams();
  if (filter.status?.length) params.set("status", filter.status.join(","));
  if (filter.kind?.length) params.set("kind", filter.kind.join(","));
  if (filter.origin?.length) params.set("origin", filter.origin.join(","));
  if (filter.project) params.set("project", filter.project);
  if (filter.projectOnly) params.set("projectOnly", filter.projectOnly);
  if (filter.trades?.length) params.set("trades", filter.trades.join("|"));
  if (filter.q?.trim()) params.set("q", filter.q.trim());
  if (filter.limit) params.set("limit", String(filter.limit));
  if (filter.offset) params.set("offset", String(filter.offset));
  return call<{ entries: MemoryEntry[] }>(`/api/memory?${params}`).then(r => r.entries);
}
export const memoryCounts = () => call<{ counts: MemoryCounts }>("/api/memory?counts=1").then(r => r.counts);
export const addMemory = (entry: MemoryInput) => call<{ entry: MemoryEntry; created: boolean }>("/api/memory", { method: "POST", body: JSON.stringify({ entry }) });
export const changeMemory = (entry: Pick<MemoryEntry, "id" | "version">, change: MemoryChange) =>
  call<{ entry: MemoryEntry }>("/api/memory", { method: "PATCH", body: JSON.stringify({ id: entry.id, version: entry.version, change }) }).then(r => r.entry);
export const learnMemory = (learn: MemoryInput[]) => call<{ added: number; seenAgain: number }>("/api/memory", { method: "POST", body: JSON.stringify({ learn }) });
/**
 * A Word scope checklist's lines, each with its list level (lib/scope-checklist, lib/word-levels), read on the server: a
 * browser can't read the old .doc format.
 */
export async function checklistText(file: File): Promise<LeveledLine[]> {
  const response = await fetch("/api/checklist-text", { method: "POST", body: file, cache: "no-store", headers: { "content-type": "application/octet-stream" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body?.lines)) throw new Error(body?.error ?? `The file couldn't be read (${response.status}).`);
  return body.lines;
}
/** Approves or retires many entries at once; resolves to how many changed. */
export const setMemoryStatus = (ids: string[], to: MemoryStatus) => call<{ changed: number }>("/api/memory", { method: "POST", body: JSON.stringify({ status: { ids, to } }) }).then(r => r.changed);

/** The API's page size, and how many pages a scan reads at most (20,000 entries). */
export const MEMORY_PAGE = 500;
const MAX_PAGES = 40;

/**
 * What a scan of this project may read: every approved entry for the whole company and for this project, page by page.
 * One page isn't enough: the API returns at most 500, newest first, so once hundreds of wording examples are approved
 * a single page leaves out the trade split and the rules. Read once per run; contextPack and planMemory then pick what
 * each step needs. Resolves to [] (and the reason) when the memory can't be reached.
 */
/** The imported bid sheets a project leaves out of its scans (lib/memory leaveOutSheets), saved with the project. */
export const LEFT_OUT_SHEETS_KEY = "memory-left-out-sheets";

export async function memoryForScan(projectId: string): Promise<{ entries: MemoryEntry[]; sheets: { sheet: string; entries: number }[]; error: string | null }> {
  try {
    const entries = new Map<string, MemoryEntry>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await fetchMemory({ status: ["approved"], project: projectId, limit: MEMORY_PAGE, offset: page * MEMORY_PAGE });
      for (const entry of batch) entries.set(entry.id, entry);
      if (batch.length < MEMORY_PAGE) break;
    }
    const all = [...entries.values()];
    return { entries: leaveOutSheets(all, readDraft<string[]>(projectId, LEFT_OUT_SHEETS_KEY, [])), sheets: bidSheets(all), error: null };
  } catch (error) { return { entries: [], sheets: [], error: error instanceof Error ? error.message : String(error) }; }
}

/**
 * The approved memory for the open project, for screens that show what the AI will read (Write scopes with AI): read
 * when the screen opens and when the project changes. Empty while loading or when the memory can't be reached.
 */
export function useScanMemory(projectId: string | null): MemoryEntry[] {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  useEffect(() => {
    if (!projectId) { setEntries([]); return; }
    let live = true;
    memoryForScan(projectId).then(r => { if (live) setEntries(r.entries); });
    return () => { live = false; };
  }, [projectId]);
  return entries;
}

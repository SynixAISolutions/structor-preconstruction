"use client";

// The automatic scope run (Danial, 26 Oct: "it is supposed to run on upload"): as soon as a drawing set or
// project manual is stored, the AI adds the bid packages the files call for, reads every trade and puts what
// it finds in the bid forms for Approve scopes. It runs in this browser tab, one project at a time, while you
// use any page; its progress is saved after every trade, so a closed tab picks up where it stopped the next
// time the project is open. While it runs the tab asks before closing (the browser's own box: a page can't
// replace it), and reloads from inside the app ask with our own (askToLeave).

import { useEffect, useSyncExternalStore } from "react";
import { addRunToBidForms, recordRun, type ExtractionState } from "./extraction";
import { addPage, DrawingFlipRuleError, type DrawingFlipState } from "./drawing-flip";
import { addPackage, type Procurement } from "./procurement";
import { findManual, drawingRegister, type StoredDocument } from "./project-files";
import { useProjectDocuments } from "./project-files-client";
import { tradesToAdd } from "./project-scopes";
import { readTradeScope } from "./scope-reading";
import { readDraft, writeDraft } from "./use-local-draft";
import { MAX_SAVED_RUNS, NO_RUNS, runTarget, stillToRead, tradesToRead, type AutoRun, type AutoTrade, type SavedRuns } from "./auto-scope-plan";
import { sampleProcurement } from "./data/procurement";
import { sampleExtraction } from "./data/extraction";
import { sampleDrawingFlip } from "./data/drawing-flip";

export const RUNS_KEY = "ai-scope-runs";
const PARALLEL_TRADES = 3;

type Snapshot = { run: AutoRun | null; leave: boolean };
let snapshot: Snapshot = { run: null, leave: false };
const listeners = new Set<() => void>();
const emit = (change: Partial<Snapshot>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(l => l()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

let active: string | null = null;
const waiting = new Map<string, StoredDocument[]>();

const savedRuns = (projectId: string): SavedRuns => readDraft<SavedRuns>(projectId, RUNS_KEY, NO_RUNS);
function save(run: AutoRun) {
  const runs = [run, ...savedRuns(run.projectId).runs.filter(r => r.id !== run.id)].slice(0, MAX_SAVED_RUNS);
  try { writeDraft<SavedRuns>(run.projectId, RUNS_KEY, { runs }); } catch { /* storage full: the run goes on, unsaved */ }
  emit({ run: run.status === "running" ? run : null });
}

// ── Leaving while the AI works ──
const holdTab = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
let answer: ((leave: boolean) => void) | null = null;
export const isRunning = () => active !== null;
/** Our "Please don't close this tab" box: resolves true when the person chooses to leave anyway. */
export function askToLeave(): Promise<boolean> {
  if (!isRunning()) return Promise.resolve(true);
  return new Promise(resolve => { answer?.(false); answer = resolve; emit({ leave: true }); });
}
export function answerLeave(leave: boolean) {
  if (leave) window.removeEventListener("beforeunload", holdTab);
  answer?.(leave); answer = null; emit({ leave: false });
}

/** Starts the run for a project's files when they hold a new upload and haven't been read yet. */
export function ensureRun(projectId: string, documents: StoredDocument[]) {
  const target = runTarget(documents);
  if (!target) return;
  if (active === projectId && snapshot.run?.key === target.key) return;
  const previous = savedRuns(projectId).runs.find(r => r.key === target.key) ?? null;
  if (previous?.status === "done") return;
  if (active) { waiting.set(projectId, documents); return; }
  void start(projectId, documents, target, previous);
}

async function start(projectId: string, documents: StoredDocument[], target: { key: string; documents: StoredDocument[] }, previous: AutoRun | null) {
  active = projectId;
  window.addEventListener("beforeunload", holdTab);
  const manual = findManual(documents);
  const at = () => new Date().toISOString();

  // 1. The bid packages the files call for, standard trades and Marcel's CSI groups, added as found.
  let procurement = readDraft<Procurement>(projectId, "procurement", sampleProcurement);
  const newTrades: string[] = [];
  for (const trade of tradesToAdd(procurement.packages, { sections: manual?.sections ?? [], sheets: drawingRegister(documents) })) {
    try { procurement = addPackage(procurement, trade); newTrades.push(trade.name); } catch { /* a trade of that name exists */ }
  }
  if (newTrades.length) writeDraft(projectId, "procurement", procurement);

  // 2. Every trade with sections or sheets, skipping those a stopped run already finished.
  const readable = tradesToRead(procurement.packages, documents);
  const queued = (t: (typeof readable)[number]): AutoTrade => ({ packageId: t.pkg.id, name: t.pkg.name, status: "queued", added: 0, note: "" });
  let run: AutoRun = previous
    ? { ...previous, status: "running", newTrades: [...new Set([...previous.newTrades, ...newTrades])], trades: readable.map(t => previous.trades.find(x => x.packageId === t.pkg.id && x.status === "done") ?? queued(t)) }
    : { id: crypto.randomUUID(), projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades, trades: readable.map(queued), added: 0, duplicates: 0 };
  save(run);
  const setTrade = (packageId: string, change: Partial<AutoTrade>, totals: Partial<Pick<AutoRun, "added" | "duplicates">> = {}) => {
    run = { ...run, ...totals, trades: run.trades.map(t => t.packageId === packageId ? { ...t, ...change } : t) };
    save(run);
  };

  const queue = stillToRead(readable, previous);
  const controller = new AbortController();
  await Promise.all(Array.from({ length: Math.min(PARALLEL_TRADES, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { pkg, sections, sheets } = next;
      setTrade(pkg.id, { status: "reading", note: "" });
      try {
        const outcome = await readTradeScope({
          pkg, manual, sections, sheets, signal: controller.signal,
          onProgress: p => { const note = p.total ? `Reading part ${Math.min(p.done + 1, p.total)} of ${p.total}` : p.note; if (run.trades.find(t => t.packageId === pkg.id)?.note !== note) setTrade(pkg.id, { note }); },
          addFlipPages: pages => {
            try {
              const flip = pages.reduce((state, page) => state.pages.some(x => x.sheet === page.sheet) ? state : addPage(state, page), readDraft<DrawingFlipState>(projectId, "drawing-flip", sampleDrawingFlip));
              writeDraft(projectId, "drawing-flip", flip);
              return null;
            } catch (error) { return error instanceof DrawingFlipRuleError ? Object.values(error.errors)[0] ?? "A sheet could not be added to Drawing Flip." : "A sheet could not be added to Drawing Flip."; }
          },
        });
        if (!outcome.input.drafts.length && !outcome.input.error) { setTrade(pkg.id, { status: "done", note: "Nothing new found." }); continue; }
        const input = { ...outcome.input, notes: { failures: outcome.failures.map(f => `${f.section} · pages ${f.pages}: ${f.error}`), screening: outcome.dropped.map(d => `${d.what}: ${d.reason}`) } };
        // Read the latest copies now: the team may have changed the bid forms while the AI read.
        const extraction = recordRun(readDraft<ExtractionState>(projectId, "extraction", sampleExtraction), readDraft<Procurement>(projectId, "procurement", sampleProcurement), input);
        const added = addRunToBidForms({ extraction, procurement: readDraft<Procurement>(projectId, "procurement", sampleProcurement) }, extraction.runs.at(-1)!.id);
        writeDraft(projectId, "extraction", added.extraction);
        writeDraft(projectId, "procurement", added.procurement);
        const failed = !!outcome.input.error && !outcome.input.drafts.length;
        setTrade(pkg.id, { status: failed ? "failed" : "done", added: added.added, note: outcome.input.error ?? (outcome.failures.length ? `${outcome.failures.length} request(s) failed.` : "") }, { added: run.added + added.added, duplicates: run.duplicates + added.duplicates });
      } catch (error) {
        setTrade(pkg.id, { status: "failed", note: error instanceof Error ? error.message : "The reading failed." });
      }
    }
  }));

  run = { ...run, status: "done", finishedAt: at() };
  save(run);
  active = null;
  window.removeEventListener("beforeunload", holdTab);
  if (answer) answerLeave(false);
  const [nextProject, nextDocs] = waiting.entries().next().value ?? [];
  if (nextProject) { waiting.delete(nextProject); ensureRun(nextProject, nextDocs!); }
}

/**
 * Watches the open project's files and starts the run when a new drawing set or manual is stored, from
 * whatever page uploaded it. Returns the run in progress (any project) and whether the leave box is open.
 */
export function useAutoScopes(projectId: string): Snapshot {
  const { documents, ready } = useProjectDocuments(projectId);
  const key = ready ? runTarget(documents)?.key ?? "" : "";
  useEffect(() => { if (ready && key) ensureRun(projectId, documents); }, [projectId, key, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

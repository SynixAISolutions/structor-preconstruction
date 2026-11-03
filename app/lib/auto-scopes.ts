"use client";

// The automatic scope run (Danial, 26 Oct: "it is supposed to run on upload"): as soon as a drawing set or
// project manual is stored, the AI adds the bid packages the files call for, reads every trade and puts what
// it finds in the bid forms for Approve scopes. It runs in this browser tab, one project at a time, while you
// use any page; its progress is saved after every trade, so a closed tab picks up where it stopped the next
// time the project is open. While it runs the tab asks before closing (the browser's own box: a page can't
// replace it), and reloads from inside the app ask with our own (askToLeave).

import { useEffect, useState, useSyncExternalStore } from "react";
import { addRunToBidForms, recordRun, type ExtractionState } from "./extraction";
import { addPage, DrawingFlipRuleError, type DrawingFlipState } from "./drawing-flip";
import { addPackage, type Procurement } from "./procurement";
import { drawingRegister, specificationSections, type StoredDocument } from "./project-files";
import { storedDocuments, uploadsSettleIn, useProjectDocuments } from "./project-files-client";
import { sectionsByTrade, tradesToAdd } from "./project-scopes";
import { applyBidPackagePlan } from "./bid-package-ai";
import { planBidPackages } from "./bid-package-client";
import { aiReader } from "./ai-reader-client";
import { AUTO_READ_UNDER, estimateCost } from "./ai-cost";
import { findReferencesWithAi, loadSheetTexts, PARALLEL_REFERENCES, referenceRunNow } from "./sheet-reference-client";
import { ocrScannedSheets, sheetOcrNow } from "./sheet-text-ocr";
import { referenceWork, SHEET_REFERENCE_LIMITS } from "./sheet-reference-ai";
import { AI_REQUESTS_AT_ONCE, aiTimes } from "./ai-pool";
import { OCR_WORKERS, ocrWork } from "./sheet-ocr";
import { blendPace, checkShare, FIRST_PACE, measurePace, secondsLeft, steadyLeft, tradesLeft, type Pace, type TradeLeft } from "./run-time-left";
import { readTradeScope } from "./scope-reading";
import { readDraft, writeDraft } from "./use-local-draft";
import { DRAFT_CHANGED, sharedReady, useSharedStatus } from "./shared-sync";
import { biggestFirst, MAX_SAVED_RUNS, NO_RUNS, readingWork, runTarget, stillToRead, tradesToRead, type AutoRun, type AutoTrade, type SavedRuns, type TradeToRead } from "./auto-scope-plan";
import { sampleProcurement } from "./data/procurement";
import { sampleExtraction } from "./data/extraction";
import { sampleDrawingFlip } from "./data/drawing-flip";

export const RUNS_KEY = "ai-scope-runs";
const PARALLEL_TRADES = 6;

/** `left`: the seconds until the run in progress is done (lib/run-time-left), and the share of the run's time gone by,
 * never less than it was, for the progress card's bar. */
type Snapshot = { run: AutoRun | null; leave: boolean; left: { seconds: number; share: number } | null };
let snapshot: Snapshot = { run: null, leave: false, left: null };
const listeners = new Set<() => void>();
const emit = (change: Partial<Snapshot>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(l => l()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

let active: string | null = null;
const waiting = new Map<string, StoredDocument[]>();

const savedRuns = (projectId: string): SavedRuns => readDraft<SavedRuns>(projectId, RUNS_KEY, NO_RUNS);
let tab = "";
const thisTab = () => tab ||= crypto.randomUUID();
/** How long a run another browser is reading stays theirs without word from it (it says so every 30 s while it reads). */
const OTHER_TAB_FOR = 120_000;
function save(unstamped: AutoRun) {
  const run = unstamped.status === "running" ? { ...unstamped, tab: thisTab(), beat: new Date().toISOString() } : unstamped;
  const runs = [run, ...savedRuns(run.projectId).runs.filter(r => r.id !== run.id)].slice(0, MAX_SAVED_RUNS);
  try { writeDraft<SavedRuns>(run.projectId, RUNS_KEY, { runs }); } catch { /* storage full: the run goes on, unsaved */ }
  emit({ run: run.status === "running" ? run : null });
}

// ── Time left ──
// How fast the AI and this computer worked on the last run, kept in this browser for the next run's first estimate.
const PACE_KEY = "structor-ai-run-pace";
function keptPace(): Pace {
  try {
    const kept = JSON.parse(localStorage.getItem(PACE_KEY) ?? "null") ?? {};
    return { ...FIRST_PACE, ...Object.fromEntries(Object.entries(kept).filter(([k, v]) => k in FIRST_PACE && typeof v === "number" && Number.isFinite(v) && v > 0)) };
  } catch { return FIRST_PACE; }
}
const keepPace = (pace: Pace) => { try { localStorage.setItem(PACE_KEY, JSON.stringify(pace)); } catch { /* the next run starts from the 2 Nov pace */ } };
/** Each trade's work as its files suggest it: a specification request for every five pages of a section, and its sheets. */
const ledgerOf = <P extends { id: string }>(trades: TradeToRead<P>[], done: (id: string) => boolean = () => false) =>
  new Map<string, TradeLeft>(trades.map(t => [t.pkg.id, { estimate: { parts: t.sections.reduce((n, s) => n + Math.ceil((s.last - s.first + 1) / 5), 0), sections: t.sections.length, sheets: t.sheets.length }, counts: null, done: done(t.pkg.id) }]));

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

let settleTimer: ReturnType<typeof setTimeout> | null = null;
/** Looks again at the projects waiting for uploads to settle, with their latest files. */
function retryWaiting(ms: number) {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = null;
    if (active) return; // the run in progress picks up the waiting projects when it ends
    for (const [projectId, docs] of [...waiting]) { waiting.delete(projectId); ensureRun(projectId, storedDocuments(projectId) ?? docs); }
  }, Math.min(ms, 15_000));
}

/**
 * Starts the run for a project's files when they hold a new upload and haven't been read yet, once every upload in
 * this tab has finished (title blocks included) and a minute has passed for the next file, so the AI reads the whole set.
 */
export function ensureRun(projectId: string, documents: StoredDocument[]) {
  const target = runTarget(documents);
  if (!target) return;
  if (active === projectId && snapshot.run?.key === target.key) return;
  const previous = savedRuns(projectId).runs.find(r => r.key === target.key) ?? null;
  if (previous?.status === "done") return;
  // Someone else's browser is reading these files right now (shared saving): its findings arrive with the project.
  if (previous?.status === "running" && previous.tab && previous.tab !== thisTab() && Date.now() - Date.parse(previous.beat ?? "") < OTHER_TAB_FOR) return;
  const settle = uploadsSettleIn();
  if (settle > 0) { waiting.set(projectId, documents); retryWaiting(settle); return; }
  if (active) { waiting.set(projectId, documents); return; }
  void start(projectId, documents, target, previous);
}

async function start(projectId: string, documents: StoredDocument[], target: { key: string; documents: StoredDocument[] }, previous: AutoRun | null) {
  active = projectId;
  window.addEventListener("beforeunload", holdTab);
  const at = () => new Date().toISOString();

  // 1. The bid packages, set by the AI from the manual's sections and the drawing index (Danial, 28 Oct: "YOU CANT
  // WRITE THE WHOLE LIST U NEED AI"): which packages, and which sections and sheets each carries. A stopped run
  // picking up keeps the packages it set. Only when the AI can't be asked do Marcel's CSI groups stand in, and the
  // run says so.
  const controller = new AbortController();
  let procurement = readDraft<Procurement>(projectId, "procurement", sampleProcurement);
  let newTrades: string[] = [], packagesBy = previous?.packagesBy;

  // The time left, every five seconds (lib/run-time-left): what each trade still has (`ledger`, from what its files
  // suggest until it starts, then from its own counts), the drawing search and the scanned sheets, at the pace measured
  // since the run began. Until the AI sets the packages, Marcel's CSI trades stand in for them.
  const pace0 = keptPace(), counters0 = { requests: aiTimes(), ocr: ocrWork() };
  const began = Date.now();
  let pace = pace0, shown: { seconds: number; at: number } | null = null, share = 0, setupFrom: number | null = previous ? null : Date.now();
  let ledger = ledgerOf(tradesToRead([...procurement.packages, ...tradesToAdd(procurement.packages, { sections: specificationSections(documents), sheets: drawingRegister(documents) })], documents));
  let searchLeft = Math.ceil(drawingRegister(documents).length / SHEET_REFERENCE_LIMITS.sheets), searching = false;
  const tick = () => {
    const checks = checkShare([...ledger.values()]);
    pace = blendPace(pace0, { ...measurePace(counters0, { requests: aiTimes(), ocr: ocrWork() }), checkShare: checks.n ? checks : undefined });
    const ocrRun = sheetOcrNow(), search = referenceRunNow();
    const references = searching && search.running && search.projectId === projectId ? search.total - search.done : searchLeft;
    const work = { setup: setupFrom === null ? null : (Date.now() - setupFrom) / 1000, ...tradesLeft([...ledger.values()], pace), references, scannedTiles: ocrRun.running ? (ocrRun.total - ocrRun.done) * pace.sheetTiles : 0 };
    shown = steadyLeft(shown, secondsLeft(work, pace, { pool: AI_REQUESTS_AT_ONCE, ocr: OCR_WORKERS, references: PARALLEL_REFERENCES }), Date.now());
    const gone = (Date.now() - began) / 1000;
    share = Math.max(share, gone / (gone + shown.seconds || 1));
    emit({ left: { seconds: shown.seconds, share } });
  };
  const ticking = setInterval(tick, 5_000);
  tick();
  // Says every 30 s that this tab is still reading, for other browsers (save stamps it).
  const beating = setInterval(() => { if (snapshot.run?.id) save(snapshot.run); }, 30_000);

  if (!previous) {
    emit({ run: { id: "", projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades: [], trades: [], added: 0, duplicates: 0 } });
    try {
      const plan = await planBidPackages(documents, procurement.packages, controller.signal);
      // The latest copy: the team may have changed the packages while the AI read.
      const applied = applyBidPackagePlan(readDraft<Procurement>(projectId, "procurement", sampleProcurement), plan);
      procurement = applied.procurement; newTrades = applied.added;
      packagesBy = `AI ${plan.model}${plan.unassigned.length ? `; ${plan.unassigned.length} section${plan.unassigned.length === 1 ? "" : "s"} in no package` : ""}`;
    } catch (error) {
      packagesBy = `The AI couldn't set the bid packages (${error instanceof Error ? error.message : "AI error"}), so they follow the CSI divisions`;
      for (const trade of tradesToAdd(procurement.packages, { sections: specificationSections(documents), sheets: drawingRegister(documents) })) {
        try { procurement = addPackage(procurement, trade); newTrades.push(trade.name); } catch { /* a trade of that name exists */ }
      }
    }
    writeDraft(projectId, "procurement", procurement);
  }
  setupFrom = null;

  // 1b. Scanned sheets have no text to search: each is read once with OCR in the background and saved for everyone
  // (lib/sheet-text-ocr, free, about a minute a sheet), while the trades are read (Danial, 28 Oct: "Make it automatic").
  const ocr = ocrScannedSheets(storedDocuments(projectId) ?? documents).catch(() => {});

  // 2. Every trade with sections or sheets, skipping those a stopped run already finished. With Claude, the upload is
  // read in full only when that costs under $2 (Danial, 28 Oct: "be smart with how we use this limited credits";
  // "Yes, under $2"), like Wyre reading a small set: two drawings and two specification sections. A larger set waits
  // for the estimator to pick trades in Write scopes.
  const reader = await aiReader().catch(() => null);
  const all = tradesToRead(procurement.packages, documents);
  const assigned = sectionsByTrade(specificationSections(documents), procurement.packages);
  const refPackages = procurement.packages.map(p => ({ id: p.id, name: p.name, code: p.code, sections: (assigned.get(p.id) ?? []).map(s => `${s.section} ${s.title}`) }));
  let sheetTexts: Awaited<ReturnType<typeof loadSheetTexts>> | null = null, fullCost: number | undefined;
  if (reader && !reader.autoScopes) {
    sheetTexts = await loadSheetTexts(documents).catch(() => null);
    fullCost = (estimateCost(reader.model, readingWork(all)) ?? 0) + (sheetTexts ? estimateCost(reader.model, referenceWork(sheetTexts.sheets, refPackages)) ?? 0 : 0);
  }
  const scopesLater = fullCost !== undefined && fullCost >= AUTO_READ_UNDER;
  const readable = scopesLater ? [] : all;
  ledger = ledgerOf(readable, id => !!previous?.trades.some(t => t.packageId === id && t.status === "done"));
  const queued = (t: (typeof readable)[number]): AutoTrade => ({ packageId: t.pkg.id, name: t.pkg.name, status: "queued", added: 0, note: "" });
  let run: AutoRun = previous
    ? { ...previous, status: "running", newTrades: [...new Set([...previous.newTrades, ...newTrades])], trades: readable.map(t => previous.trades.find(x => x.packageId === t.pkg.id && x.status === "done") ?? queued(t)), scopesLater, fullCost }
    : { id: crypto.randomUUID(), projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades, packagesBy, trades: readable.map(queued), added: 0, duplicates: 0, scopesLater, fullCost };
  save(run);
  const setTrade = (packageId: string, change: Partial<AutoTrade>, totals: Partial<Pick<AutoRun, "added" | "duplicates">> = {}) => {
    run = { ...run, ...totals, trades: run.trades.map(t => t.packageId === packageId ? { ...t, ...change } : t) };
    save(run);
  };

  // 3, alongside the trades: where each package is on the drawings, when the run reads everything
  // (lib/sheet-reference-client). It starts once the scanned sheets are searchable, so every sheet is looked at, and its
  // requests share the tab's pool (lib/ai-pool), so they fill the slots the last trades leave idle (2 Nov: 52 requests,
  // two minutes, used to wait for the last trade).
  let searchable = false;
  const references = !scopesLater && refPackages.length ? (async () => {
    await ocr;
    searchable = true;
    const texts = await loadSheetTexts(storedDocuments(projectId) ?? documents).catch(() => null) ?? sheetTexts;
    searching = true;
    if (texts?.sheets.some(s => s.text.trim())) await findReferencesWithAi(projectId, texts.key, texts.sheets, refPackages).catch(() => {});
    searchLeft = 0;
  })() : null;
  if (!references) searchLeft = 0;

  // The biggest trades start first; every request shares the tab's pool (lib/ai-pool), so the last trades use every slot.
  const queue = biggestFirst(stillToRead(readable, previous));
  await Promise.all(Array.from({ length: Math.min(PARALLEL_TRADES, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { pkg, sections, sheets } = next;
      setTrade(pkg.id, { status: "reading", note: "" });
      try {
        const outcome = await readTradeScope({
          pkg, sections, sheets, signal: controller.signal,
          onProgress: p => {
            const left = ledger.get(pkg.id);
            if (left) left.counts = p.counts;
            const note = p.total ? `Reading part ${Math.min(p.done + 1, p.total)} of ${p.total}` : p.note;
            if (run.trades.find(t => t.packageId === pkg.id)?.note !== note) setTrade(pkg.id, { note });
          },
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
        const notes = [outcome.failures.length ? `${outcome.failures.length} request(s) failed.` : "", added.held ? `${added.held} held back: the words they quote aren't printed on the sheet.` : ""].filter(Boolean).join(" ");
        setTrade(pkg.id, { status: failed ? "failed" : "done", added: added.added, note: outcome.input.error ?? notes }, { added: run.added + added.added, duplicates: run.duplicates + added.duplicates });
      } catch (error) {
        setTrade(pkg.id, { status: "failed", note: error instanceof Error ? error.message : "The reading failed." });
      }
      const left = ledger.get(pkg.id);
      if (left) left.done = true;
    }
  }));

  if (references) {
    run = { ...run, stage: searchable ? "Finding every package on the drawings" : "Making the scanned sheets searchable, then finding every package on the drawings" };
    save(run);
    if (!searchable) void ocr.then(() => { if (run.status === "running") { run = { ...run, stage: "Finding every package on the drawings" }; save(run); } });
    await references;
  }

  clearInterval(ticking);
  clearInterval(beating);
  keepPace(pace);
  emit({ left: null });
  run = { ...run, status: "done", finishedAt: at() };
  save(run);
  active = null;
  window.removeEventListener("beforeunload", holdTab);
  if (answer) answerLeave(false);
  const [nextProject, nextDocs] = waiting.entries().next().value ?? [];
  if (nextProject) { waiting.delete(nextProject); ensureRun(nextProject, storedDocuments(nextProject) ?? nextDocs!); }
}

/**
 * Watches the open project's files and starts the run when a new drawing set or manual is stored, from
 * whatever page uploaded it. Returns the run in progress (any project) and whether the leave box is open.
 */
export function useAutoScopes(projectId: string): Snapshot & { elsewhere: AutoRun | null } {
  const { documents, ready } = useProjectDocuments(projectId);
  const key = ready ? runTarget(documents)?.key ?? "" : "";
  // Not before the project's shared copy is in: a run someone else did or is doing must not start again here.
  useSharedStatus();
  const pulled = sharedReady(projectId);
  useEffect(() => { if (ready && key && pulled) ensureRun(projectId, documents); }, [projectId, key, ready, pulled]); // eslint-disable-line react-hooks/exhaustive-deps
  // A run another browser is reading right now (shared saving): its progress, as it arrives with the project.
  const [elsewhere, setElsewhere] = useState<AutoRun | null>(null);
  useEffect(() => {
    const look = () => {
      const run = savedRuns(projectId).runs.find(r => r.status === "running") ?? null;
      setElsewhere(run && run.tab && run.tab !== thisTab() && Date.now() - Date.parse(run.beat ?? "") < OTHER_TAB_FOR ? run : null);
    };
    look();
    const timer = setInterval(look, 15_000);
    window.addEventListener(DRAFT_CHANGED, look);
    return () => { clearInterval(timer); window.removeEventListener(DRAFT_CHANGED, look); };
  }, [projectId]);
  return { ...useSyncExternalStore(subscribe, () => snapshot, () => snapshot), elsewhere };
}

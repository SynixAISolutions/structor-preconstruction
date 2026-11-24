"use client";

// The automatic scope run (Danial, 26 Oct: "it is supposed to run on upload"): as soon as a drawing set or
// project manual is stored, the AI adds the bid packages the files call for, reads every trade and puts what
// it finds in the bid forms for Approve scopes. It runs in this browser tab, one project at a time, while you
// use any page; its progress is saved after every trade, so a closed tab picks up where it stopped the next
// time the project is open. While it runs the tab asks before closing (the browser's own box: a page can't
// replace it), and reloads from inside the app ask with our own (askToLeave).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { addRunToBidForms, placeHighlights, recordRun, type ExtractionState } from "./extraction";
import { addPage, DrawingFlipRuleError, type DrawingFlipState } from "./drawing-flip";
import { addPackage, type Procurement } from "./procurement";
import { drawingRegister, specificationSections, type StoredDocument } from "./project-files";
import { readStoredText, storedDocuments, uploadsSettleIn, useProjectDocuments } from "./project-files-client";
import { readersBySection, sectionOwners, sectionsByTrade, sheetsByTrade, tradesToAdd } from "./project-scopes";
import { applyBidPackagePlan } from "./bid-package-ai";
import { planBidPackages } from "./bid-package-client";
import { aiReader } from "./ai-reader-client";
import { estimateCost } from "./ai-cost";
import { findReferencesWithAi, loadSheetTexts, PARALLEL_REFERENCES, referenceRunNow } from "./sheet-reference-client";
import { ocrScannedManualPages, ocrScannedSheets, sheetOcrNow } from "./sheet-text-ocr";
import { referenceWork, SHEET_REFERENCE_LIMITS } from "./sheet-reference-ai";
import { AI_REQUESTS_AT_ONCE, aiTimes } from "./ai-pool";
import { OCR_WORKERS, ocrWork } from "./sheet-ocr";
import { blendPace, checkShare, FIRST_PACE, measurePace, secondsLeft, steadyLeft, tradesLeft, type Pace, type TradeLeft } from "./run-time-left";
import { readTradeScope } from "./scope-reading";
import { leftOut, planMemory, rememberedSections, tradeMemory } from "./memory";
import { borrowedTags, tagFamilies } from "./finish-schedule";
import { memoryForScan } from "./memory-client";
import { tradeLines } from "./memory-check";
import { readDraft, writeDraft } from "./use-local-draft";
import { writeGeneralScope } from "./general-scope-client";
import { DRAFT_CHANGED, sharedReady, useSharedStatus } from "./shared-sync";
import { addedSince, biggestFirst, canReadEveryTrade, changedSince, filesToCompare, heldElsewhere, MAX_SAVED_RUNS, NO_RUNS, onlyChanged, readingWork, runTarget, runToUpdate, stillToRead, tradesToRead, waitsForGoAhead, type AutoRun, type AutoTrade, type SavedRuns, type TradeToRead } from "./auto-scope-plan";
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
let browser = "";
/** This browser, the same in every tab: a run another tab of it was reading is picked up sooner after a reload. */
const thisBrowser = () => browser ||= (() => {
  try { const kept = localStorage.getItem("structor-browser"); if (kept) return kept; const made = crypto.randomUUID(); localStorage.setItem("structor-browser", made); return made; }
  catch { return thisTab(); }
})();
const me = () => ({ tab: thisTab(), browser: thisBrowser() });
/** Whether the run is another tab's (this browser's or someone else's), for the progress card's wording. */
export const readingIn = (run: AutoRun): "tab" | "browser" => run.browser === thisBrowser() ? "tab" : "browser";
function save(unstamped: AutoRun) {
  const run = unstamped.status === "running" ? { ...unstamped, tab: thisTab(), browser: thisBrowser(), beat: new Date().toISOString() } : unstamped;
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
  if (previous && heldElsewhere(previous, me())) return;
  const settle = uploadsSettleIn();
  if (settle > 0) { waiting.set(projectId, documents); retryWaiting(settle); return; }
  if (active) { waiting.set(projectId, documents); return; }
  void start(projectId, documents, target, previous);
}

/**
 * Reads every trade of a run that set the bid packages only because reading them all cost too much to start unasked
 * (Danial, 19 Nov: "i want to run it on all scope items like a whole project"). It is the same run as after an upload:
 * the scope items go to the bid forms for approval, each trade gets its general scope, and the packages are found on
 * the drawings. Returns why it can't start, or null when it started.
 */
export function readEveryTrade(projectId: string, documents: StoredDocument[]): string | null {
  if (active) return "The AI is already reading in this tab. Read every trade when it finishes.";
  const target = runTarget(documents);
  const previous = target ? savedRuns(projectId).runs.find(r => r.key === target.key) ?? null : null;
  if (!target || !previous || !canReadEveryTrade(previous)) return "There is nothing waiting to be read: the project's latest files have been read already, or are being read.";
  if (heldElsewhere(previous, me())) return "Someone else's browser is reading these files now.";
  void start(projectId, documents, target, { ...previous, readAll: true });
  return null;
}

/**
 * Reads the project manuals' scanned pages with OCR (Project files, for manuals stored before 19 Nov: Whittier's Vol 2
 * printed Divisions 27 and 28 as images), then the sections they add, in the trades they belong to, the way a revision's
 * changed sections are read. A run still waiting for Read every trade, or a first run to come, reads them with the rest.
 * Resolves to what it did, for the page to say.
 */
export async function readScannedSpecifications(projectId: string, documents: StoredDocument[]): Promise<string> {
  if (active) return "The AI is reading in this tab. Read the scanned pages when it finishes.";
  const { pages, added } = await ocrScannedManualPages(documents);
  if (!pages) return "No scanned specification page could be read.";
  const read = `${pages} scanned page${pages === 1 ? "" : "s"} read`;
  if (!added.length) return `${read}; they hold no section that wasn't already found.`;
  const now = storedDocuments(projectId) ?? documents, target = runTarget(now);
  const last = target ? savedRuns(projectId).runs.find(r => r.key === target.key) ?? null : null;
  if (!target || !last || last.status !== "done" || last.scopesLater || active) return `${read}: ${added.length} new section${added.length === 1 ? "" : "s"}, read with the other trades.`;
  void start(projectId, now, target, { id: crypto.randomUUID(), projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: new Date().toISOString(), finishedAt: null, newTrades: [], packagesBy: last.packagesBy, trades: [], added: 0, duplicates: 0, update: { since: last.id, sheets: [], sections: added, scanned: true } });
  return `${read}: ${added.length} new section${added.length === 1 ? "" : "s"} (${added.slice(0, 6).join(", ")}${added.length > 6 ? "…" : ""}), now read in their trades.`;
}

async function start(projectId: string, documents: StoredDocument[], target: { key: string; documents: StoredDocument[] }, previous: AutoRun | null) {
  active = projectId;
  window.addEventListener("beforeunload", holdTab);
  const at = () => new Date().toISOString();

  // 0. The manuals' scanned pages first (19 Nov: Whittier's Vol 2 printed Divisions 27 and 28 as images, 60 pages the AI
  // never saw): their sections exist only once OCR has read them, and the packages and trades are set from the sections.
  // Free, in this tab, read once and saved for everyone; nothing to do on the next run.
  const showOcr = setInterval(() => { const o = sheetOcrNow(); if (o.running && o.total) emit({ run: { ...(snapshot.run ?? { id: "", projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades: [], trades: [], added: 0, duplicates: 0 }), ocr: { done: o.done, total: o.total } } }); }, 2_000);
  const scanned = await ocrScannedManualPages(documents).catch(() => null);
  clearInterval(showOcr);
  if (scanned?.pages) documents = storedDocuments(projectId) ?? documents;

  // 1. The bid packages, set by the AI from the manual's sections and the drawing index (Danial, 28 Oct: "YOU CANT
  // WRITE THE WHOLE LIST U NEED AI"): which packages, and which sections and sheets each carries. A stopped run
  // picking up keeps the packages it set. Only when the AI can't be asked do Marcel's CSI groups stand in, and the
  // run says so.
  const controller = new AbortController();
  let procurement = readDraft<Procurement>(projectId, "procurement", sampleProcurement);
  // After a revision (Marcel, 24 Oct): the last finished run on other files. Its bid packages stay, and only the
  // sheets and sections whose text changed since are read (lib/auto-scope-plan changedSince).
  const prior = previous?.update ? savedRuns(projectId).runs.find(r => r.id === previous.update!.since) ?? null : previous ? null : runToUpdate(savedRuns(projectId).runs, target.key);
  let newTrades: string[] = [], packagesBy = previous?.packagesBy ?? prior?.packagesBy;

  // The time left, every five seconds (lib/run-time-left): what each trade still has (`ledger`, from what its files
  // suggest until it starts, then from its own counts), the drawing search and the scanned sheets, at the pace measured
  // since the run began. Until the AI sets the packages, Marcel's CSI trades stand in for them.
  const pace0 = keptPace(), counters0 = { requests: aiTimes(), ocr: ocrWork() };
  const began = Date.now();
  let pace = pace0, shown: { seconds: number; at: number } | null = null, share = 0, setupFrom: number | null = previous || prior ? null : Date.now();
  let ledger = prior ? new Map<string, TradeLeft>() : ledgerOf(tradesToRead([...procurement.packages, ...tradesToAdd(procurement.packages, { sections: specificationSections(documents), sheets: drawingRegister(documents) })], documents));
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

  // After a revision, first: which sheets and sections changed, from their page text against the versions the last run read.
  let update = previous?.update;
  if (prior && !update) {
    emit({ run: { id: "", projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades: [], trades: [], added: 0, duplicates: 0, stage: "Finding what changed since the last reading" } });
    const before = new Set(prior.key.split("|"));
    const texts = new Map<string, Map<number, string>>();
    await Promise.all(filesToCompare(documents, before).map(async d => texts.set(d.id, new Map((await readStoredText(d).catch(() => [])).map(p => [p.page, p.text])))));
    update = { since: prior.id, ...changedSince(documents, before, (id, page) => texts.get(id)?.get(page)) };
  }
  // What the contractor's estimators have taught the AI (lib/memory), read once: its trade split sets the packages and
  // which sections each trade reads, and each trade's scan gets the part that applies. When the memory can't be reached
  // the run reads without it, as it did before the memory existed.
  const memory = await memoryForScan(projectId);
  // 1. The bid packages: on a first run, and after a revision that brings sheet numbers or sections no package lists yet
  // (a discipline's drawings sent later), so the AI places them before the trades are read.
  const added = prior && !previous ? addedSince(documents, new Set(prior.key.split("|"))) : { sheets: [], sections: [] };
  if (!previous && (!prior || added.sheets.length || added.sections.length)) {
    if (prior) setupFrom = Date.now();
    emit({ run: { id: "", projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades: [], trades: [], added: 0, duplicates: 0, update } });
    try {
      const plan = await planBidPackages(documents, procurement.packages, controller.signal, planMemory(memory.entries, projectId));
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
  const split = rememberedSections(memory.entries, procurement.packages, projectId, specificationSections(documents).map(s => s.section));
  // A trade's approved exclusions can hand its drawing sheets to the trade that carries the work (site demolition to Earthwork).
  const leaves = (pkg: { code: string; name: string }) => leftOut(memory.entries, pkg, projectId);
  const all = tradesToRead(procurement.packages, documents, split.byPackage, split.partial, leaves);
  const handed = sheetsByTrade(drawingRegister(documents), procurement.packages, leaves).handed;
  const assigned = sectionsByTrade(specificationSections(documents), procurement.packages, split.byPackage, split.partial);
  const readers = readersBySection(assigned, procurement.packages);
  const owners = sectionOwners(readers, procurement.packages, split.partial);
  const borrowed = borrowedTags(memory.entries, projectId);
  const refPackages = procurement.packages.map(p => ({ id: p.id, name: p.name, code: p.code, sections: (assigned.get(p.id) ?? []).map(s => `${s.section} ${s.title}`) }));
  // The drawing search runs again only when sheets changed.
  const candidates = update ? onlyChanged(all, update) : all, search = !update || update.sheets.length > 0;
  let sheetTexts: Awaited<ReturnType<typeof loadSheetTexts>> | null = null, fullCost: number | undefined;
  if (reader && !reader.autoScopes) {
    sheetTexts = await loadSheetTexts(documents).catch(() => null);
    fullCost = (estimateCost(reader.model, readingWork(candidates)) ?? 0) + (sheetTexts && search ? estimateCost(reader.model, referenceWork(sheetTexts.sheets, refPackages)) ?? 0 : 0);
  }
  const scopesLater = waitsForGoAhead(fullCost, previous?.readAll);
  const readable = scopesLater ? [] : candidates;
  // Tags the memory borrows from other projects' bid forms, checked against every tag family this project's drawings
  // print (lib/finish-schedule). Unreadable drawings: no line is dropped.
  const printedTexts = borrowed.size && readable.length ? sheetTexts ?? await loadSheetTexts(documents).catch(() => null) : null;
  const printed = printedTexts ? tagFamilies(printedTexts.sheets.map(s => s.text)) : undefined;
  ledger = ledgerOf(readable, id => !!previous?.trades.some(t => t.packageId === id && t.status === "done"));
  const queued = (t: (typeof readable)[number]): AutoTrade => ({ packageId: t.pkg.id, name: t.pkg.name, status: "queued", added: 0, note: "" });
  let run: AutoRun = previous
    ? { ...previous, status: "running", finishedAt: null, newTrades: [...new Set([...previous.newTrades, ...newTrades])], trades: readable.map(t => previous.trades.find(x => x.packageId === t.pkg.id && x.status === "done") ?? queued(t)), scopesLater, fullCost }
    : { id: crypto.randomUUID(), projectId, key: target.key, documents: target.documents.map(d => d.name), status: "running", startedAt: at(), finishedAt: null, newTrades, packagesBy, trades: readable.map(queued), added: 0, duplicates: 0, scopesLater, fullCost, update };
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
  const references = !scopesLater && search && refPackages.length ? (async () => {
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
          pkg, sections, sheets, signal: controller.signal, memory: tradeMemory(memory.entries, pkg, projectId, sections, readers, split.partial.get(pkg.id), handed.get(pkg.id)),
          owners, leavesOut: leaves(pkg), borrowed, printed, memoryLines: tradeLines(memory.entries, pkg, projectId),
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
        const runId = extraction.runs.at(-1)!.id;
        const added = addRunToBidForms({ extraction, procurement: readDraft<Procurement>(projectId, "procurement", sampleProcurement) }, runId);
        // Its highlights go on Drawing Flip in the trade's colour, awaiting review there, linked to the lines just added.
        const shown = placeHighlights({ ...added, flip: readDraft<DrawingFlipState>(projectId, "drawing-flip", sampleDrawingFlip) }, runId);
        writeDraft(projectId, "extraction", shown.extraction);
        writeDraft(projectId, "procurement", added.procurement);
        if (shown.placed) writeDraft(projectId, "drawing-flip", shown.flip);
        const failed = !!outcome.input.error && !outcome.input.drafts.length;
        const notes = [outcome.failures.length ? `${outcome.failures.length} request(s) failed.` : "", added.held ? `${added.held} held back: the words they quote aren't printed on the sheet.` : ""].filter(Boolean).join(" ");
        setTrade(pkg.id, { status: failed ? "failed" : "done", added: added.added, note: outcome.input.error ?? notes }, { added: run.added + added.added, duplicates: run.duplicates + added.duplicates });
        // Then its general scope, the few lines Marcel's bid forms use (18 Nov): one short request from the items just added.
        if (added.added) await writeGeneralScope(projectId, pkg.id, "Structor AI", controller.signal).catch(() => null);
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
  const latest = useRef({ ready, documents });
  latest.current = { ready, documents };
  useEffect(() => {
    const look = () => {
      const run = savedRuns(projectId).runs.find(r => r.status === "running") ?? null;
      const held = !!run && heldElsewhere(run, me());
      setElsewhere(held ? run : null);
      // The other tab stopped saying it reads (closed, or this tab reloaded): pick the run up here.
      if (run && !held && run.tab !== thisTab() && latest.current.ready && sharedReady(projectId)) ensureRun(projectId, storedDocuments(projectId) ?? latest.current.documents);
    };
    look();
    const timer = setInterval(look, 15_000);
    window.addEventListener(DRAFT_CHANGED, look);
    return () => { clearInterval(timer); window.removeEventListener(DRAFT_CHANGED, look); };
  }, [projectId]);
  return { ...useSyncExternalStore(subscribe, () => snapshot, () => snapshot), elsewhere };
}

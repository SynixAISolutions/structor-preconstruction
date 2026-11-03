// The automatic scope run after an upload (Marcel, 24 Oct; Danial, 26 Oct: "it is supposed to run on upload ...
// as it finds something new it should just add it to the scope list"): which upload starts a run, which trades
// it reads, and how a run is told. Pure; lib/auto-scopes runs it in the browser.

import { drawingLog, drawingRegister, latestDocuments, specificationSections, type StoredDocument, type VolumeSection } from "./project-files";
import type { TradePackage } from "./procurement";
import { sectionsByTrade, sheetsForTrade } from "./project-scopes";
import { dollars } from "./ai-cost";

/**
 * Files uploaded from this moment start a run by themselves. Drawings and manuals stored before it were
 * read with Write scopes with AI, if at all; opening an older project doesn't start a long run unasked.
 */
export const AUTO_SCOPES_FROM = "2026-10-27T00:00:00.000Z";

export type AutoTradeStatus = "queued" | "reading" | "done" | "failed";
export type AutoTrade = { packageId: string; name: string; status: AutoTradeStatus; added: number; note: string };
/** One automatic run over a project's current drawings and manual. `key` names those exact files. */
export type AutoRun = {
  id: string; projectId: string; key: string; documents: string[];
  status: "running" | "done"; startedAt: string; finishedAt: string | null;
  /** Bid packages the run created: the AI's (lib/bid-package-ai), or Marcel's CSI list when the AI couldn't be asked. */
  newTrades: string[];
  /** Who set the bid packages: the AI's model, or why the CSI list stood in for it. */
  packagesBy?: string;
  /** The run set the bid packages only: reading everything with Claude cost too much, so trades are read when the estimator picks them in Write scopes. */
  scopesLater?: boolean;
  /** What reading everything was estimated to cost, in dollars, when Claude reads. */
  fullCost?: number;
  /** What the run is doing after the trades, for the progress card ("Making the scanned sheets searchable…"). */
  stage?: string;
  /** A run after a new revision (Marcel, 24 Oct: "uploading a new drawing revision should trigger a scope update"):
   * only the sheets and specification sections whose text changed since the run named `since` were read. */
  update?: { since: string; sheets: string[]; sections: string[] };
  /** The browser tab reading, and when it last said it still was: with shared saving (3 Nov) another person's browser
   * sees the run and leaves it to that tab instead of reading the same files again. */
  tab?: string; browser?: string; beat?: string;
  trades: AutoTrade[];
  /** Scope lines added to bid forms for approval, and lines skipped as already there. */
  added: number; duplicates: number;
};
export type SavedRuns = { runs: AutoRun[] };
export const NO_RUNS: SavedRuns = { runs: [] };
export const MAX_SAVED_RUNS = 20;

/** The files a run reads: the current drawing sets and project manual, when one of them is a new upload. */
export function runTarget(docs: StoredDocument[], from = AUTO_SCOPES_FROM): { key: string; documents: StoredDocument[] } | null {
  const latest = latestDocuments(docs).filter(d => d.kind === "drawings" || d.kind === "manual");
  if (!latest.some(d => d.uploadedAt >= from)) return null;
  return { key: latest.map(d => d.id).sort().join("|"), documents: latest };
}

export type TradeToRead<P> = { pkg: P; sections: VolumeSection[]; sheets: ReturnType<typeof drawingRegister> };
/** Every trade with specification sections (from every specification volume) or drawing sheets to read, in bid-package order. */
export function tradesToRead<P extends Pick<TradePackage, "id" | "division" | "code" | "sections" | "sheets">>(packages: P[], docs: StoredDocument[]): TradeToRead<P>[] {
  const register = drawingRegister(docs);
  const assigned = sectionsByTrade(specificationSections(docs), packages);
  return packages.map(pkg => ({ pkg, sections: assigned.get(pkg.id) ?? [], sheets: sheetsForTrade(register, pkg) })).filter(t => t.sections.length || t.sheets.length);
}

/**
 * What reading these trades sends to the AI, for lib/ai-cost estimateCost: a request for every five manual pages of
 * a trade and one for each of its sheets, which sends the sheet's image and text.
 */
export function readingWork(trades: Pick<TradeToRead<unknown>, "sections" | "sheets">[]): { requests: number; chars: number; images: number } {
  let requests = 0, pages = 0, sheets = 0;
  for (const t of trades) {
    const n = t.sections.reduce((sum, s) => sum + s.last - s.first + 1, 0);
    pages += n; sheets += t.sheets.length; requests += Math.ceil(n / 5) + t.sheets.length;
  }
  return { requests, chars: pages * 3_500 + sheets * 4_000, images: sheets };
}

/**
 * Trades with the most to read first (Danial, 30 Oct: "speed up the tail"): the big MEP trades, read last, kept the run
 * going for minutes after the rest had finished. Started first, their long readings overlap the small trades'.
 */
export const biggestFirst = <T extends Pick<TradeToRead<unknown>, "sections" | "sheets">>(trades: T[]): T[] =>
  trades.map(trade => ({ trade, requests: readingWork([trade]).requests })).sort((a, b) => b.requests - a.requests).map(x => x.trade);

// ── After a revision ──
// A new drawing set, a few revised sheets or a new manual used to start a run over every trade (about $1.70 on
// Project 1 for a single sheet). Now the run reads only what changed since the last finished run: sheets whose
// current version's text differs from the version that run read, and specification sections whose pages differ.
// A sheet with no text either way (a scan) counts as changed: nothing tells it apart.

const plain = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const sectionKey = (section: string) => section.replace(/\s+/g, "");
type Text = (docId: string, page: number) => string | undefined;

/** The current sheets and sections not in the earlier run's files, each with the version that run read, if any. */
function newParts(docs: StoredDocument[], before: ReadonlySet<string>) {
  const sheets = drawingLog(docs).sheets.filter(s => !before.has(s.current.doc.id))
    .map(s => ({ sheet: s.sheet, now: { doc: s.current.doc, page: s.current.page }, was: [...s.versions].reverse().find(v => before.has(v.doc.id)) ?? null }));
  const earlier = new Map(specificationSections(docs.filter(d => before.has(d.id))).map(s => [sectionKey(s.section), s]));
  const sections = specificationSections(docs).filter(s => !before.has(s.doc.id)).map(s => ({ section: s.section, now: s, was: earlier.get(sectionKey(s.section)) ?? null }));
  return { sheets, sections };
}

/** The files whose page text tells what changed: the new ones and the earlier versions they replace. */
export function filesToCompare(docs: StoredDocument[], before: ReadonlySet<string>): StoredDocument[] {
  const { sheets, sections } = newParts(docs, before);
  const out = new Map<string, StoredDocument>();
  for (const s of sheets) { out.set(s.now.doc.id, s.now.doc); if (s.was) out.set(s.was.doc.id, s.was.doc); }
  for (const s of sections) { out.set(s.now.doc.id, s.now.doc); if (s.was) out.set(s.was.doc.id, s.was.doc); }
  return [...out.values()];
}

/** Sheet numbers and section numbers whose text changed since the run that read the files in `before`. */
export function changedSince(docs: StoredDocument[], before: ReadonlySet<string>, text: Text): { sheets: string[]; sections: string[] } {
  const { sheets, sections } = newParts(docs, before);
  const pages = (doc: StoredDocument, first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => plain(text(doc.id, first + i))).join(" ");
  return {
    sheets: sheets.filter(s => { const now = plain(text(s.now.doc.id, s.now.page)); return !s.was || !now || now !== plain(text(s.was.doc.id, s.was.page)); }).map(s => s.sheet),
    sections: sections.filter(s => { const now = pages(s.now.doc, s.now.first, s.now.last); return !s.was || !now.trim() || now !== pages(s.was.doc, s.was.first, s.was.last); }).map(s => s.section),
  };
}

/** Sheet numbers and sections that weren't in the earlier run's files at all (a discipline's drawings sent later): no
 * bid package lists them yet, so the AI places them in packages before the trades are read. */
export function addedSince(docs: StoredDocument[], before: ReadonlySet<string>): { sheets: string[]; sections: string[] } {
  const { sheets, sections } = newParts(docs, before);
  return { sheets: sheets.filter(s => !s.was).map(s => s.sheet), sections: sections.filter(s => !s.was).map(s => s.section) };
}

/** The trades to read after a revision: each with only its changed sections and sheets; trades with neither drop out. */
export const onlyChanged = <T extends TradeToRead<unknown>>(trades: T[], changed: { sheets: string[]; sections: string[] }): T[] => {
  const sheets = new Set(changed.sheets), sections = new Set(changed.sections.map(sectionKey));
  return trades.map(t => ({ ...t, sections: t.sections.filter(s => sections.has(sectionKey(s.section))), sheets: t.sheets.filter(r => sheets.has(r.sheet)) })).filter(t => t.sections.length || t.sheets.length);
};

/** The last finished run on other files, which a new upload's run updates; null when there is none. */
export const runToUpdate = (runs: AutoRun[], key: string): AutoRun | null => runs.find(r => r.status === "done" && r.key !== key) ?? null;

/**
 * Whether a running run belongs to another tab still reading it, so this one leaves it alone: it said so less than two
 * minutes ago from another browser, or less than 45 s ago from another tab of this one (a tab says so every 30 s, so a
 * reloaded tab picks up its own run within the minute).
 */
export function heldElsewhere(run: Pick<AutoRun, "status" | "tab" | "browser" | "beat">, me: { tab: string; browser: string }, now = Date.now()): boolean {
  if (run.status !== "running" || !run.tab || run.tab === me.tab) return false;
  return now - Date.parse(run.beat ?? "") < (run.browser === me.browser ? 45_000 : 120_000);
}

/** Trades a run still has to read: a run stopped by a closed tab picks up after the trades it finished. */
export const stillToRead = <T extends { pkg: { id: string } }>(trades: T[], previous: AutoRun | null): T[] =>
  trades.filter(t => !previous?.trades.some(x => x.packageId === t.pkg.id && x.status === "done"));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The files a run read, as people say it: "Drawings.pdf", "Drawings.pdf and Manual.pdf", "Drawings.pdf and 2 more". */
export const runFiles = (run: Pick<AutoRun, "documents">) => run.documents.length <= 2 ? run.documents.join(" and ") : `${run.documents[0]} and ${run.documents.length - 1} more`;
export const runProgress = (run: AutoRun) => ({ done: run.trades.filter(t => t.status === "done" || t.status === "failed").length, total: run.trades.length });

/** What a finished run did, for the notification center. */
export function runSummary(run: AutoRun): string {
  const failed = run.trades.filter(t => t.status === "failed").length;
  const scoped = run.trades.filter(t => t.added > 0).length;
  if (run.update && !run.update.sheets.length && !run.update.sections.length) return "Revision: nothing changed on the drawings or in the specifications";
  return [
    run.update ? `Revision: ${plural(run.update.sheets.length, "changed sheet")} and ${plural(run.update.sections.length, "changed section")} read again` : "",
    run.scopesLater ? `Bid packages set; reading every trade would cost about ${dollars(run.fullCost ?? 0)}, so choose trades in Write scopes with AI` : run.added ? `${plural(run.added, "scope item")} added to ${plural(scoped, "trade")} for approval` : "No new scope items",
    run.newTrades.length ? `${plural(run.newTrades.length, "new bid package")}` : "",
    run.packagesBy && !run.packagesBy.startsWith("AI ") ? run.packagesBy : "",
    run.duplicates ? `${run.duplicates} already in the bid forms` : "",
    failed ? `${plural(failed, "trade")} could not be read` : "",
  ].filter(Boolean).join(" · ");
}


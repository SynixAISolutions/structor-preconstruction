// A trade's bid-form lines from the notes on every drawing sheet (Danial, 25 Nov: "scan all sheets at once and assign every
// text to the trade it fits"). The AI's read of every sheet (lib/sheet-reference-ai) sorts each printed note (keynotes,
// sheet notes, schedule rows, legends, callouts) to the trades that price it. Each trade's scan then writes its lines from
// all of its notes, as text, instead of only the six sheets its title rules pick (Whittier: 102 of 424 sheets were read;
// the read of every sheet had placed the trades on 376). A line goes on the bid form only with a note it quotes, and its
// highlight sits on that note on the sheet. Pure: the AI job is lib/ai-jobs-more "drawing-notes", the reading
// lib/scope-reading.

import type { Citation, DraftInput } from "./extraction";
import type { Dropped } from "./ai-jobs";
import { quoteOnPage } from "./ai-jobs";

/** One sheet's notes sorted to a trade, with where the sheet is. */
/** `discipline`: the sheet's, from the drawing register ("Architectural demolition"). */
export type TradeNote<D> = { doc: D; page: number; sheet: string; title: string; discipline?: string; lines: string[] };
/** The notes a request carries: a few dozen sheets' worth. */
export const DRAWING_NOTES_LIMITS = { sheets: 25, chars: 30_000, existing: 150, findings: 60 };

/**
 * The notes the read of every sheet (`read`, saved as "drawing-references-ai") sorted to `packageId`, on the sheets as
 * they are now (`key`, as lib/sheet-reference-client loadSheetTexts names them: a read of an older set gives none), in
 * register order. `skip`: sheets the trade already reads whole, as images ("docId:page").
 */
export function tradeNotes<D extends { id: string }>(
  read: { key: string; refs: Record<string, { docId: string; page: number; lines: string[] }[]> } | null | undefined,
  key: string, register: { doc: D; page: number; sheet: string; title: string; discipline?: string }[], packageId: string, skip: Set<string> = new Set(),
): TradeNote<D>[] {
  if (!read || !key || read.key !== key) return [];
  const lines = new Map((read.refs[packageId] ?? []).map(r => [`${r.docId}:${r.page}`, r.lines]));
  return register.flatMap(row => {
    const at = `${row.doc.id}:${row.page}`, notes = lines.get(at);
    return notes?.length && !skip.has(at) ? [{ doc: row.doc, page: row.page, sheet: row.sheet, title: row.title, ...(row.discipline ? { discipline: row.discipline } : {}), lines: [...new Set(notes)] }] : [];
  });
}

/** Requests of at most DRAWING_NOTES_LIMITS.sheets sheets and .chars characters of notes, in order. */
export function noteBatches<T extends { lines: string[] }>(notes: T[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [], chars = 0;
  for (const n of notes) {
    const size = n.lines.reduce((s, l) => s + l.length + 3, 0);
    if (current.length && (current.length >= DRAWING_NOTES_LIMITS.sheets || chars + size > DRAWING_NOTES_LIMITS.chars)) { out.push(current); current = []; chars = 0; }
    current.push(n); chars += size;
  }
  if (current.length) out.push(current);
  return out;
}

export type NotesSheet = { sheet: string; title: string; page: number; lines: string[] };
export type DrawingNotesJob = { pkg: { id: string; name: string; code: string }; document: string; sheets: NotesSheet[]; existing: string[]; memory?: string };

/**
 * The AI's lines that hold up: each with at least one citation whose quote is one of the cited sheet's notes (or a
 * piece of one), as scope findings citing the drawing file, its page and sheet. The line's source is its first sheet.
 */
export function screenDrawingNotes(output: unknown, job: DrawingNotesJob): { drafts: DraftInput[]; dropped: Dropped[] } {
  const found = Array.isArray((output as { lines?: unknown })?.lines) ? (output as { lines: unknown[] }).lines : [];
  const drafts: DraftInput[] = [], dropped: Dropped[] = [];
  for (const f of found.slice(0, DRAWING_NOTES_LIMITS.findings)) {
    const o = (f ?? {}) as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
    if (!title) continue;
    const citations: Citation[] = (Array.isArray(o.citations) ? o.citations : []).flatMap((c): Citation[] => {
      const r = (c ?? {}) as Record<string, unknown>;
      const sheet = job.sheets.find(s => s.sheet === (typeof r.sheet === "string" ? r.sheet.trim() : ""));
      const quote = typeof r.quote === "string" ? r.quote.trim().slice(0, 600) : "";
      return sheet && quote && quoteOnPage(quote, sheet.lines.join("\n")) ? [{ document: job.document, page: sheet.page, sheet: sheet.sheet, quote }] : [];
    });
    if (!citations.length) { dropped.push({ what: title.slice(0, 80), reason: "Its quote isn't one of the notes on the sheet it cites, so it isn't on the bid form." }); continue; }
    drafts.push({ kind: "scope", key: `notes-${citations[0].sheet}-${drafts.length + 1}`, packageId: job.pkg.id, title, detail: typeof o.detail === "string" ? o.detail.trim().slice(0, 600) : "", source: citations[0].sheet ?? "", citations });
  }
  if (found.length > DRAWING_NOTES_LIMITS.findings) dropped.push({ what: `${found.length - DRAWING_NOTES_LIMITS.findings} more lines`, reason: `Over the ${DRAWING_NOTES_LIMITS.findings}-line limit for one request.` });
  return { drafts, dropped };
}

/** A demolition sheet: its discipline or title says so ("Architectural demolition", "DEMOLITION - LEVEL 01"). */
const onDemolitionSheet = (n: { title: string; discipline?: string }) => /demolition/i.test(n.discipline ?? "") || /\bDEMOLITION\b/i.test(n.title);
const REMOVAL = /^(?:remove|demolish|demo)\b/i;
const PUT_BACK = /\b(?:re-?install|reinstallation|re-?use in the new work|for reuse)\b/i;

/**
 * A trade's lines from its notes that remove existing work shown only on the demolition sheets ("Remove the existing
 * gypsum bulkheads where keynoted D.57", written for Whittier's Drywall on 25 Nov) are the demolition trade's: left to it
 * (`demolition`, the project's demolition package) with a note. A line that puts the work back (remove and reinstall)
 * stays, and so does every line when the project has no demolition trade, or this trade is it.
 */
export function leaveRemovals<D>(drafts: DraftInput[], pkg: { id: string; name: string }, notes: TradeNote<D>[], demolition: { id: string; name: string } | null): { drafts: DraftInput[]; dropped: Dropped[] } {
  if (!demolition || demolition.id === pkg.id) return { drafts, dropped: [] };
  const demoSheets = new Set(notes.filter(onDemolitionSheet).map(n => n.sheet));
  const dropped: Dropped[] = [], gone = new Set<string>();
  for (const d of drafts) {
    if (d.kind !== "scope" || d.packageId !== pkg.id || !REMOVAL.test(d.title) || PUT_BACK.test(`${d.title} ${d.detail}`)) continue;
    if (!d.citations.length || !d.citations.every(c => c.sheet && demoSheets.has(c.sheet))) continue;
    gone.add(d.key);
    dropped.push({ what: d.title, reason: `Removing existing work shown on the demolition sheets is ${demolition.name}'s, so this line is left to that trade.` });
  }
  return { drafts: drafts.filter(d => !gone.has(d.key) && !(d.kind === "region" && d.scopeKeys?.some(k => gone.has(k)))), dropped };
}

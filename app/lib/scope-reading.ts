"use client";

// Reading one trade's scope with the AI (Marcel, 15 Oct: from the project manual and the drawings): its
// specification sections, merged into bid-form lines when the findings run long, then up to six of its
// drawing sheets with their highlights, the quotes the AI read from a sheet's image checked on it with OCR.
// Shared by Write scopes with AI and the automatic run after an upload (lib/auto-scopes), so both read a
// trade the same way.

import { extractDrawingScope, extractTradeScope, chunkPages, type ScopeRunResult } from "./ai-client";
import { checkMemoryLines, consolidateScope } from "./ai-more-client";
import type { PageInput } from "./drawing-flip";
import type { ManualSection } from "./manual-sections";
import type { TradePackage } from "./procurement";
import type { RegisterRow, VolumeSection } from "./project-files";
import { readPageTextBoxes, readStoredText, renderStoredPage } from "./project-files-client";
import { findInSheetImage } from "./sheet-ocr";
import { checkImageQuotes, pinFindings, type TextBox } from "./text-anchor";
import { NO_COUNTS, type TradeCounts } from "./run-time-left";
import { checkScheduleTags, dropBorrowedTags, isFinishSchedule, type ReadPage, type ScheduleSheet, type TagOwner } from "./finish-schedule";
import { lineCheckDrafts, planLineCheck, type CheckPage, type ExistingLine, type MemoryLine } from "./memory-check";

/** `counts` says how far the reading is in requests and sheets, for the automatic run's time left (lib/run-time-left). */
export type TradeReadProgress = { note: string; done: number; total: number; counts: TradeCounts };

/** One trade's specification and drawing readings as one run (both documents cited). */
export const mergeRuns = (a: ScopeRunResult, b: ScopeRunResult): ScopeRunResult => {
  const drafts = [...a.input.drafts, ...b.input.drafts];
  return {
    input: { ...a.input, documents: [...a.input.documents, ...b.input.documents.filter(d => !a.input.documents.some(x => x.name === d.name))], drafts, finishedAt: b.input.finishedAt, error: drafts.length ? undefined : a.input.error ?? b.input.error },
    dropped: [...a.dropped, ...b.dropped], failures: [...a.failures, ...b.failures], drawingPages: [...(a.drawingPages ?? []), ...(b.drawingPages ?? [])],
  };
};

/**
 * Reads a trade: its `sections`, each from the specification volume it is in (lib/project-files
 * specificationSections), and its `sheets`, side by side (2 Nov: the sheets waited for the specification, so a big
 * trade's sheet images and their OCR checks, the slowest part of a run, only started once its last page was read).
 * `addFlipPages` puts the sheets that carry a highlight on Drawing Flip (it returns why it couldn't, or null).
 * Resolves to the run to record, specification findings first, or throws when the trade has nothing to read.
 */
export async function readTradeScope(args: {
  pkg: Pick<TradePackage, "id" | "name" | "code">; sections: VolumeSection[]; sheets: RegisterRow[];
  signal: AbortSignal; onProgress: (progress: TradeReadProgress) => void; addFlipPages: (pages: PageInput[]) => string | null;
  /** The contractor's approved memory for this trade (lib/memory contextPack); empty reads as before. */
  memory?: string;
  /**
   * Who carries a section on this project (lib/project-scopes sectionOwners). With it, the trade's finish schedules
   * are checked once both halves are read (lib/finish-schedule checkScheduleTags): its tags no line names get a line,
   * and lines from the schedule for another trade's tags are left to that trade.
   */
  owners?: (section: string) => TagOwner[];
  /** The trade's approved "doesn't carry" lines (lib/memory leftOut), so a finish tag for work it leaves out gets no line. */
  leavesOut?: string[];
  /**
   * Tags the memory borrows from other projects' bid forms (lib/finish-schedule borrowedTags): a line naming one that
   * nothing the trade read prints is left out (dropBorrowedTags).
   */
  borrowed?: Set<string>;
  /**
   * The tag families printed on the project's drawings (lib/finish-schedule tagFamilies over every sheet's text), for
   * that check. Without it the check is skipped: nothing is dropped on what one trade read alone.
   */
  printed?: Set<string>;
  /**
   * Every line the contractor's memory gives this trade (lib/memory-check tradeLines). Each one the reading didn't
   * write is looked for on the pages it read, and written where a page calls for it.
   */
  memoryLines?: MemoryLine[];
}): Promise<ScopeRunResult> {
  const { pkg, sections: stored, sheets, signal, memory } = args;
  // Every specification page and drawing sheet the reading read, with its text, for checkTags.
  const readPages: ReadPage[] = [];
  // The same pages with where each is (its section, or its sheet), for the memory check.
  const checkPages: CheckPage[] = [];
  // Both halves report at once: "Reading part 3 of 46 · Reading drawing sheet 2 of 6".
  const notes = { specification: stored.length ? "Loading section text…" : "", sheets: sheets.length ? "Reading drawing sheets…" : "" };
  const counts: TradeCounts = { ...NO_COUNTS, specDone: !stored.length };
  const say = (half: keyof typeof notes, note: string) => { notes[half] = note; args.onProgress({ note: [notes.specification, notes.sheets].filter(Boolean).join(" · "), done: 0, total: 0, counts: { ...counts } }); };
  say("specification", notes.specification);

  async function readSpecification(): Promise<ScopeRunResult | null> {
    let outcome: ScopeRunResult | null = null;
    // One reading per volume, so every finding cites the file its words are in.
    const volumes = await Promise.all([...Map.groupBy(stored, s => s.doc.id).values()].map(async group => {
      const doc = group[0].doc;
      const text = await readStoredText(doc, { first: Math.min(...group.map(s => s.first)), last: Math.max(...group.map(s => s.last)) });
      const sections: ManualSection[] = group.map(s => ({ section: s.section, title: s.title, firstPage: s.first, lastPage: s.last, pages: text.filter(p => p.page >= s.first && p.page <= s.last && p.text.trim()) })).filter(s => s.pages.length);
      return { doc, sections, chunks: sections.reduce((n, s) => n + chunkPages(s.pages).length, 0) };
    }));
    for (const { doc, sections } of volumes) for (const s of sections) for (const p of s.pages) {
      readPages.push({ document: doc.name, page: p.page, text: p.text });
      checkPages.push({ document: doc.name, page: p.page, text: p.text, where: s.section, sheet: null });
    }
    const total = volumes.reduce((n, v) => n + v.chunks, 0);
    counts.parts = total;
    let before = 0;
    for (const { doc, sections, chunks } of volumes) {
      if (!sections.length || signal.aborted) continue;
      const read = await extractTradeScope({ pkg, manual: { name: doc.name, pageCount: doc.pageCount }, sections, memory, signal, onProgress: done => { counts.partsDone = before + done; say("specification", `Reading part ${Math.min(before + done + 1, total)} of ${total}`); } });
      before += chunks;
      outcome = outcome ? mergeRuns(outcome, read) : read;
    }
    // One finding per paragraph → one line per thing the subcontractor prices. Specification findings
    // only: drawing findings are already one per item, and their highlights point at their keys.
    if (outcome && outcome.input.drafts.length > 12 && !signal.aborted) {
      say("specification", "Writing bid-form lines…");
      try {
        const lines = await consolidateScope(pkg.name, outcome.input.drafts, signal, Object.fromEntries(stored.map(s => [s.section, s.title])), (done, asked) => { counts.lines = asked; counts.linesDone = done; });
        outcome.input = { ...outcome.input, drafts: lines.drafts };
        if (lines.merged) outcome.dropped.push({ what: `${lines.merged} paragraph findings`, reason: `Merged into ${lines.drafts.filter(d => d.kind === "scope").length} bid-form lines${lines.dropped ? `; ${lines.dropped} judged boilerplate` : ""}.` });
      } catch (error) {
        outcome.dropped.push({ what: "Bid-form lines", reason: `Could not merge findings (${error instanceof Error ? error.message : "AI error"}); every paragraph finding is listed.` });
      }
    }
    counts.specDone = true;
    say("specification", "");
    return outcome;
  }

  // The finish schedules this trade read, for checkTags once both halves are in.
  const schedules: { row: RegisterRow; text: string; aspects: Map<number, number> }[] = [];

  async function readSheets(): Promise<ScopeRunResult[]> {
    const runs: ScopeRunResult[] = [];
    let done = 0;
    for (const rows of Map.groupBy(sheets, r => r.doc.id).values()) {
      if (signal.aborted) break;
      const doc = rows[0].doc, aspects = new Map<number, number>();
      const text = await readStoredText(doc, { first: Math.min(...rows.map(r => r.page)), last: Math.max(...rows.map(r => r.page)) });
      for (const row of rows.filter(r => isFinishSchedule(r.title))) schedules.push({ row, text: text.find(p => p.page === row.page)?.text ?? "", aspects });
      for (const row of rows) {
        const pageText = text.find(p => p.page === row.page)?.text ?? "";
        readPages.push({ document: doc.name, page: row.page, text: pageText });
        if (pageText.trim()) checkPages.push({ document: doc.name, page: row.page, text: pageText, where: row.sheet, sheet: row.sheet });
      }
      const drawn = await extractDrawingScope({
        pkg, document: doc.name, pageCount: doc.pageCount, memory, signal, onProgress: d => { counts.sheetsRead = done + d; say("sheets", `Reading drawing sheet ${Math.min(done + d + 1, sheets.length)} of ${sheets.length}`); },
        pages: rows.map(r => ({ page: r.page, sheet: r.sheet, text: text.find(p => p.page === r.page)?.text ?? "" })),
        render: page => renderStoredPage(doc, page, 2000, true).then(r => { aspects.set(page, r.aspect); return { image: r.image }; }),
      });
      done += rows.length;
      counts.sheetsRead = done; counts.sheetsSettled = done;
      // Quotes the AI read from a sheet's image, not its text layer, are looked for on the image with OCR: one
      // that isn't printed there holds its finding back from the bid form (lib/extraction notOnSheet). The sheets are
      // checked side by side, spread over the OCR workers (lib/sheet-ocr).
      const ocr = new Map<string, TextBox[]>();
      await Promise.all((drawn.drawingPages ?? []).map(async p => {
        const quotes = [...new Set(drawn.input.drafts.flatMap(d => d.citations).filter(c => c.verification === "image" && c.document === doc.name && c.page === p.page).map(c => c.quote))];
        if (!quotes.length || signal.aborted) return;
        counts.checks++;
        try {
          const read = await findInSheetImage(doc, p.page, quotes, r => say("sheets", `Checking the AI's quotes on sheet ${p.sheet}: reading the image, part ${r.done + 1} of ${r.total}`), signal);
          ocr.set(p.sheet, read.words);
          drawn.input = { ...drawn.input, drafts: checkImageQuotes(drawn.input.drafts, { document: doc.name, page: p.page }, read.words, read.wholeSheet) };
        } catch (error) {
          drawn.dropped.push({ what: `Quotes read from sheet ${p.sheet}'s image`, reason: `Not checked on the sheet (${error instanceof Error ? error.message : "OCR failed"}); check them against the sheet yourself.` });
        }
        counts.checksDone++;
        say("sheets", notes.sheets);
      }));
      // Marks go where the cited words are printed; the AI's own outlines stay only where the text can't place them.
      const boxes = new Map<string, TextBox[]>();
      await Promise.all((drawn.drawingPages ?? []).map(async p => { try { boxes.set(p.sheet, await readPageTextBoxes(doc, p.page)); } catch { /* no text layer: outlines stay approximate */ } }));
      // Text-first, like Wyre (28 Oct): a highlight sits on the printed words or isn't made; the AI's outline alone is dropped.
      drawn.input = { ...drawn.input, drafts: pinFindings(drawn.input.drafts, boxes, ocr, false) };
      const highlighted = new Set(drawn.input.drafts.filter(d => d.kind === "region").map(d => (d as { sheet: string }).sheet));
      const flipError = args.addFlipPages((drawn.drawingPages ?? []).filter(p => highlighted.has(p.sheet)).map(p => ({ sheet: p.sheet, title: rows.find(r => r.page === p.page)?.title ?? p.sheet, discipline: rows.find(r => r.page === p.page)?.discipline ?? "", revision: "", documentId: doc.id, documentName: doc.name, pageNumber: p.page, aspect: aspects.get(p.page) })));
      if (flipError) drawn.dropped.push({ what: "Drawing highlights", reason: flipError });
      runs.push(drawn);
    }
    say("sheets", "");
    return runs;
  }

  /**
   * The tag checks (lib/finish-schedule) over every line the trade's reading wrote: lines naming a tag borrowed from
   * another project go, then the finish schedules add this trade's tags no line names.
   */
  async function checkTags(outcome: ScopeRunResult): Promise<void> {
    // A reading that failed outright stays failed: legend lines alone would make it look done.
    if (outcome.input.error && !outcome.input.drafts.length) return;
    if (args.borrowed?.size && args.printed) {
      const kept = dropBorrowedTags({ drafts: outcome.input.drafts, pkg, pages: readPages, printed: args.printed, borrowed: args.borrowed });
      outcome.dropped.push(...kept.dropped);
      outcome.input = { ...outcome.input, drafts: kept.drafts };
    }
    const read: ScheduleSheet[] = schedules.filter(s => s.text.trim()).map(s => ({ document: s.row.doc.name, page: s.row.page, sheet: s.row.sheet, text: s.text }));
    if (!read.length || !args.owners) return;
    const checked = checkScheduleTags({ drafts: outcome.input.drafts, pkg, schedules: read, owners: args.owners, leavesOut: args.leavesOut });
    outcome.dropped.push(...checked.dropped);
    outcome.input = { ...outcome.input, drafts: checked.drafts };
    if (!checked.added.length) return;
    // Each added line is highlighted on its printed row, and its sheet goes on Drawing Flip.
    const boxes = new Map<string, TextBox[]>();
    await Promise.all(schedules.map(async s => { try { boxes.set(s.row.sheet, await readPageTextBoxes(s.row.doc, s.row.page)); } catch { /* no text layer: no highlight */ } }));
    const added = pinFindings(checked.added, boxes, new Map(), false);
    outcome.input = { ...outcome.input, drafts: [...checked.drafts, ...added] };
    const tags = checked.added.map(d => d.kind === "scope" ? d.title.replace(/^Include (\S+).*$/, "$1") : "").filter(Boolean);
    outcome.dropped.push({ what: "Finish legend", reason: `Added a line for ${tags.join(", ")}: the legend lists ${tags.length === 1 ? "it" : "them"} for this trade and no line named ${tags.length === 1 ? "it" : "them"}.` });
    const highlighted = new Set(added.filter(d => d.kind === "region").map(d => (d as { sheet: string }).sheet));
    const flipError = args.addFlipPages(schedules.filter(s => highlighted.has(s.row.sheet)).map(s => ({ sheet: s.row.sheet, title: s.row.title, discipline: s.row.discipline ?? "", revision: "", documentId: s.row.doc.id, documentName: s.row.doc.name, pageNumber: s.row.page, aspect: s.aspects.get(s.row.page) })));
    if (flipError) outcome.dropped.push({ what: "Finish legend highlights", reason: flipError });
  }

  /**
   * The contractor's lines for this trade (lib/memory-check), each the reading didn't write looked for on the pages it
   * read: written where a page calls for it, with the page's words; the rest reported, never written.
   */
  async function checkLines(outcome: ScopeRunResult): Promise<void> {
    const lines = args.memoryLines ?? [];
    if (!lines.length || (outcome.input.error && !outcome.input.drafts.length)) return;
    const existing: ExistingLine[] = outcome.input.drafts.flatMap(d => d.kind === "scope" ? [{ text: `${d.title} ${d.detail}`, source: d.source, cites: d.citations.map(c => `${c.document}#${c.page}`) }] : []);
    const plan = planLineCheck(lines, checkPages, existing);
    let found = 0, failed = 0;
    if (plan.requests.length) {
      say("specification", "Checking your bid-form lines on this project…");
      try {
        const checked = await checkMemoryLines(pkg, plan.requests, signal, (done, total) => say("specification", `Checking your bid-form lines on this project: ${Math.min(done + 1, total)} of ${total}`));
        const added = lineCheckDrafts(checked.answers, pkg.id, existing);
        found = added.length; failed = checked.failed;
        outcome.input = { ...outcome.input, drafts: [...outcome.input.drafts, ...added] };
        outcome.dropped.push(...checked.dropped);
      } catch (error) {
        if (signal.aborted) return;
        outcome.dropped.push({ what: "Your bid-form lines", reason: `Not checked on this project (${error instanceof Error ? error.message : "AI error"}).` });
        return;
      } finally { say("specification", ""); }
    }
    const notFound = lines.length - plan.covered - found;
    outcome.dropped.push({ what: "Your bid-form lines", reason: `${lines.length} lines from your bid forms and scope checklists checked against the pages read: ${plan.covered} already written, ${found} found and added with their quotes, ${notFound} not called for on these pages${plan.unplaced.length ? ` (${plan.unplaced.length} of them on no page at all)` : ""}${failed ? `; ${failed} check request(s) failed` : ""}.` });
  }

  const [specification, drawings] = await Promise.all([stored.length ? readSpecification() : null, sheets.length ? readSheets() : []]);
  const outcome = drawings.reduce<ScopeRunResult | null>((run, drawn) => run ? mergeRuns(run, drawn) : drawn, specification);
  if (!outcome) throw new Error("This trade has no specification sections or drawing sheets to read.");
  if (!signal.aborted) await checkTags(outcome);
  if (!signal.aborted) await checkLines(outcome);
  return outcome;
}

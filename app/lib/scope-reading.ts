"use client";

// Reading one trade's scope with the AI (Marcel, 15 Oct: from the project manual and the drawings): its
// specification sections, merged into bid-form lines when the findings run long, then up to six of its
// drawing sheets with their highlights, the quotes the AI read from a sheet's image checked on it with OCR.
// Shared by Write scopes with AI and the automatic run after an upload (lib/auto-scopes), so both read a
// trade the same way.

import { extractDrawingScope, extractTradeScope, chunkPages, type ScopeRunResult } from "./ai-client";
import { consolidateScope } from "./ai-more-client";
import type { PageInput } from "./drawing-flip";
import type { ManualSection } from "./manual-sections";
import type { TradePackage } from "./procurement";
import type { RegisterRow, VolumeSection } from "./project-files";
import { readPageTextBoxes, readStoredText, renderStoredPage } from "./project-files-client";
import { findInSheetImage } from "./sheet-ocr";
import { checkImageQuotes, pinFindings, type TextBox } from "./text-anchor";
import { NO_COUNTS, type TradeCounts } from "./run-time-left";

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
}): Promise<ScopeRunResult> {
  const { pkg, sections: stored, sheets, signal } = args;
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
    const total = volumes.reduce((n, v) => n + v.chunks, 0);
    counts.parts = total;
    let before = 0;
    for (const { doc, sections, chunks } of volumes) {
      if (!sections.length || signal.aborted) continue;
      const read = await extractTradeScope({ pkg, manual: { name: doc.name, pageCount: doc.pageCount }, sections, signal, onProgress: done => { counts.partsDone = before + done; say("specification", `Reading part ${Math.min(before + done + 1, total)} of ${total}`); } });
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

  async function readSheets(): Promise<ScopeRunResult[]> {
    const runs: ScopeRunResult[] = [];
    let done = 0;
    for (const rows of Map.groupBy(sheets, r => r.doc.id).values()) {
      if (signal.aborted) break;
      const doc = rows[0].doc, aspects = new Map<number, number>();
      const text = await readStoredText(doc, { first: Math.min(...rows.map(r => r.page)), last: Math.max(...rows.map(r => r.page)) });
      const drawn = await extractDrawingScope({
        pkg, document: doc.name, pageCount: doc.pageCount, signal, onProgress: d => { counts.sheetsRead = done + d; say("sheets", `Reading drawing sheet ${Math.min(done + d + 1, sheets.length)} of ${sheets.length}`); },
        pages: rows.map(r => ({ page: r.page, sheet: r.sheet, text: text.find(p => p.page === r.page)?.text ?? "" })),
        render: page => renderStoredPage(doc, page, 2000).then(r => { aspects.set(page, r.aspect); return { image: r.image }; }),
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

  const [specification, drawings] = await Promise.all([stored.length ? readSpecification() : null, sheets.length ? readSheets() : []]);
  const outcome = drawings.reduce<ScopeRunResult | null>((run, drawn) => run ? mergeRuns(run, drawn) : drawn, specification);
  if (!outcome) throw new Error("This trade has no specification sections or drawing sheets to read.");
  return outcome;
}

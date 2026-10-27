"use client";

// Reading one trade's scope with the AI (Marcel, 15 Oct: from the project manual and the drawings): its
// specification sections, merged into bid-form lines when the findings run long, then up to six of its
// drawing sheets with their highlights. Shared by Write scopes with AI and the automatic run after an
// upload (lib/auto-scopes), so both read a trade the same way.

import { extractDrawingScope, extractTradeScope, chunkPages, type ScopeRunResult } from "./ai-client";
import { consolidateScope } from "./ai-more-client";
import type { PageInput } from "./drawing-flip";
import type { ManualSection } from "./manual-sections";
import type { TradePackage } from "./procurement";
import type { RegisterRow, StoredDocument, StoredSection } from "./project-files";
import { readStoredText, renderStoredPage } from "./project-files-client";

export type TradeReadProgress = { note: string; done: number; total: number };

/** One trade's specification and drawing readings as one run (both documents cited). */
export const mergeRuns = (a: ScopeRunResult, b: ScopeRunResult): ScopeRunResult => {
  const drafts = [...a.input.drafts, ...b.input.drafts];
  return {
    input: { ...a.input, documents: [...a.input.documents, ...b.input.documents.filter(d => !a.input.documents.some(x => x.name === d.name))], drafts, finishedAt: b.input.finishedAt, error: drafts.length ? undefined : a.input.error ?? b.input.error },
    dropped: [...a.dropped, ...b.dropped], failures: [...a.failures, ...b.failures], drawingPages: [...(a.drawingPages ?? []), ...(b.drawingPages ?? [])],
  };
};

/**
 * Reads a trade: `sections` from `manual`, then `sheets`. `addFlipPages` puts the sheets that carry a
 * highlight on Drawing Flip (it returns why it couldn't, or null). Resolves to the run to record, or
 * throws when the trade has nothing to read.
 */
export async function readTradeScope(args: {
  pkg: Pick<TradePackage, "id" | "name" | "code">; manual: StoredDocument | null; sections: StoredSection[]; sheets: RegisterRow[];
  signal: AbortSignal; onProgress: (progress: TradeReadProgress) => void; addFlipPages: (pages: PageInput[]) => string | null;
}): Promise<ScopeRunResult> {
  const { pkg, manual, sections: stored, sheets, signal, onProgress } = args;
  onProgress({ note: stored.length ? "Loading section text…" : "Reading drawing sheets…", done: 0, total: 0 });
  let outcome: ScopeRunResult | null = null;
  if (stored.length && manual) {
    const text = await readStoredText(manual, { first: Math.min(...stored.map(s => s.first)), last: Math.max(...stored.map(s => s.last)) });
    const sections: ManualSection[] = stored.map(s => ({ section: s.section, title: s.title, firstPage: s.first, lastPage: s.last, pages: text.filter(p => p.page >= s.first && p.page <= s.last && p.text.trim()) })).filter(s => s.pages.length);
    const total = sections.reduce((n, s) => n + chunkPages(s.pages).length, 0);
    onProgress({ note: "", done: 0, total });
    outcome = await extractTradeScope({ pkg, manual: { name: manual.name, pageCount: manual.pageCount }, sections, signal, onProgress: (done, all) => onProgress({ note: "", done, total: all }) });
  }
  // One finding per paragraph → one line per thing the subcontractor prices. Specification findings
  // only: drawing findings are already one per item, and their highlights point at their keys.
  if (outcome && outcome.input.drafts.length > 12 && !signal.aborted) {
    onProgress({ note: "Writing bid-form lines…", done: 0, total: 0 });
    try {
      const lines = await consolidateScope(pkg.name, outcome.input.drafts, signal, Object.fromEntries(stored.map(s => [s.section, s.title])));
      outcome.input = { ...outcome.input, drafts: lines.drafts };
      if (lines.merged) outcome.dropped.push({ what: `${lines.merged} paragraph findings`, reason: `Merged into ${lines.drafts.filter(d => d.kind === "scope").length} bid-form lines${lines.dropped ? `; ${lines.dropped} judged boilerplate` : ""}.` });
    } catch (error) {
      outcome.dropped.push({ what: "Bid-form lines", reason: `Could not merge findings (${error instanceof Error ? error.message : "AI error"}); every paragraph finding is listed.` });
    }
  }
  if (sheets.length && !signal.aborted) {
    let done = 0;
    for (const rows of Map.groupBy(sheets, r => r.doc.id).values()) {
      const doc = rows[0].doc, aspects = new Map<number, number>();
      const text = await readStoredText(doc, { first: Math.min(...rows.map(r => r.page)), last: Math.max(...rows.map(r => r.page)) });
      const drawn = await extractDrawingScope({
        pkg, document: doc.name, pageCount: doc.pageCount, signal, onProgress: d => onProgress({ note: `Reading drawing sheet ${Math.min(done + d + 1, sheets.length)} of ${sheets.length}`, done: 0, total: 0 }),
        pages: rows.map(r => ({ page: r.page, sheet: r.sheet, text: text.find(p => p.page === r.page)?.text ?? "" })),
        render: page => renderStoredPage(doc, page, 2000).then(r => { aspects.set(page, r.aspect); return { image: r.image }; }),
      });
      done += rows.length;
      const highlighted = new Set(drawn.input.drafts.filter(d => d.kind === "region").map(d => (d as { sheet: string }).sheet));
      const flipError = args.addFlipPages((drawn.drawingPages ?? []).filter(p => highlighted.has(p.sheet)).map(p => ({ sheet: p.sheet, title: rows.find(r => r.page === p.page)?.title ?? p.sheet, discipline: rows.find(r => r.page === p.page)?.discipline ?? "", revision: "", documentId: doc.id, documentName: doc.name, pageNumber: p.page, aspect: aspects.get(p.page) })));
      if (flipError) drawn.dropped.push({ what: "Drawing highlights", reason: flipError });
      outcome = outcome ? mergeRuns(outcome, drawn) : drawn;
    }
  }
  if (!outcome) throw new Error("This trade has no specification sections or drawing sheets to read.");
  return outcome;
}

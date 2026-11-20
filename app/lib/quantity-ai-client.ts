"use client";

// Runs the AI quantity pass for one trade (lib/quantity-ai) in the browser: each planned sheet rendered and its text
// read from Project files, one request a sheet, in order. What comes back is proposals; applyAiQuantities puts them
// on the lines, Not checked.

import type { Dropped } from "./ai-jobs";
import type { QuantityItem, QuantityProposal, SheetQuantity } from "./quantity-ai";
import type { RegisterRow } from "./project-files";

export type QuantityRun = { proposals: QuantityProposal[]; dropped: Dropped[]; failures: { sheet: string; error: string }[]; cost: number | null; sheets: number };

export async function findQuantities(args: {
  pkg: { id: string; name: string; code: string };
  plan: { row: RegisterRow; items: QuantityItem[] }[];
  signal?: AbortSignal; onProgress?: (done: number, total: number) => void;
}): Promise<QuantityRun> {
  const { renderStoredPage, readStoredText } = await import("./project-files-client");
  const { aiJob } = await import("./ai-more-client");
  const run: QuantityRun = { proposals: [], dropped: [], failures: [], cost: null, sheets: 0 };
  for (const [i, { row, items }] of args.plan.entries()) {
    if (args.signal?.aborted) break;
    try {
      const [{ image }, text] = await Promise.all([
        renderStoredPage(row.doc, row.page, 2000, true),
        readStoredText(row.doc, { first: row.page, last: row.page }).then(p => p.find(x => x.page === row.page)?.text ?? "").catch(() => ""),
      ]);
      const result = await aiJob<{ sheet: string; quantities: SheetQuantity[]; dropped: Dropped[]; cost?: number | null }>("scope-quantities",
        { pkg: args.pkg, document: row.doc.name, sheet: row.sheet, page: row.page, text: text.slice(0, 60_000), image, items }, args.signal);
      run.proposals.push(...result.quantities.map(q => ({ ...q, document: row.doc.name, page: row.page, sheet: result.sheet || row.sheet })));
      run.dropped.push(...result.dropped.map(d => ({ ...d, what: `${row.sheet}: ${d.what}` })));
      if (typeof result.cost === "number") run.cost = (run.cost ?? 0) + result.cost;
      run.sheets++;
    } catch (error) {
      run.failures.push({ sheet: row.sheet, error: error instanceof Error ? error.message : String(error) });
      if (args.signal?.aborted) break;
    }
    args.onProgress?.(i + 1, args.plan.length);
  }
  return run;
}

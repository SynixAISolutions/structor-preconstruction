// A scope item's quantity from Quantity takeoffs (Marcel's issues log, item 19: "make sure we have quantity take offs
// next to every item in the detailed scopes"). The takeoff is where quantities are measured, trade by trade; a bid-form
// line takes its figure from one of the trade's takeoff lines, remembers which, and says so when that line changes
// afterwards. Pure; lib/procurement holds the quantity and its rules.

import type { TakeoffRow } from "./data/preconstruction";
import type { QuantityInput, ScopeItem } from "./procurement";

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
/** How many words of the takeoff line's description the scope line shares, as a share of the shorter one. */
function overlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}

/**
 * The trade's takeoff lines a scope item can take its quantity from: lines with a quantity and unit, the one priced from
 * this very item first (added through Add to estimate), then those sharing the most words with it. Nothing is chosen
 * for the estimator.
 */
export function takeoffChoices(rows: TakeoffRow[], item: Pick<ScopeItem, "id" | "title" | "detail">, packageId: string): TakeoffRow[] {
  const fromItem = (r: TakeoffRow) => r.origin?.kind === "scope" && r.origin.scopeId === item.id;
  return rows
    .filter(r => r.packageId === packageId && r.quantity > 0 && r.unit.trim() && r.item.trim())
    .map(r => ({ r, score: fromItem(r) ? 2 : overlap(`${item.title} ${item.detail}`, `${r.item} ${r.source}`) }))
    .sort((a, b) => b.score - a.score)
    .map(({ r }) => r);
}

/** A takeoff line as a scope quantity: checked only when the takeoff line itself has been reviewed. */
export const quantityFromTakeoff = (row: TakeoffRow): QuantityInput => ({
  value: row.quantity, unit: row.unit, origin: "takeoff", ref: row.id, checked: row.reviewed,
  basis: `Quantity takeoffs: ${row.item.trim()}${row.source.trim() ? ` · ${row.source.trim()}` : ""}`,
});

/**
 * Whether a quantity taken from a takeoff line still agrees with it: "changed" with the line as it is now, "gone" when
 * the line was deleted, null when it agrees (or the quantity didn't come from a takeoff).
 */
export function takeoffDrift(item: Pick<ScopeItem, "quantity">, rows: TakeoffRow[]): { kind: "changed"; row: TakeoffRow } | { kind: "gone" } | null {
  const q = item.quantity;
  if (!q || q.origin !== "takeoff" || !q.ref) return null;
  const row = rows.find(r => r.id === q.ref);
  if (!row) return { kind: "gone" };
  const same = Math.round(row.quantity * 100) / 100 === q.value && row.unit.trim().toUpperCase() === q.unit;
  return same ? null : { kind: "changed", row };
}

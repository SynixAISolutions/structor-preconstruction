// Takeoff by trade (Marcel's issues log, item 16, 18 Nov: "Have the take off be very detailed like the scopes written for
// every trade, and make sure it divides them up by trade where could add unit prices and get a rough idea for plugs in
// leveling - see example on one drive under - templates, takeoff folder"). His example is a ROM unit-pricing workbook
// with a tab per trade: # · Scope Description · MCN Qty · Unit · Bidder Qty · Unit Price · Extended · Scope Status ·
// Qualifications. Here a trade's takeoff is its own bid-form lines (the lines for every trade aside: they're conditions,
// not measured work), each with the quantity it carries (lib/scope-quantity) and the contractor's unit price
// (lib/procurement setScopeUnitPrice). So the takeoff is exactly as detailed as the scope, and a line a bidder leaves
// out can be plugged from that very line. Nothing is priced for the estimator: a benchmark or an estimate line's rate
// is offered, and used only when someone picks it. Money is summed in cents. Pure; the workbook is
// lib/takeoff-workbook, the screen app/ui/takeoff-by-trade.

import type { TakeoffRow } from "./data/preconstruction";
import { quantityLabel, unitPriceLabel, type Procurement, type ScopeItem } from "./procurement";
import { benchmarkFor, unitKey, type Benchmark } from "./unit-costs";

/** Why a line has no extended amount: no quantity, no price, or a price per another unit than its quantity's now. */
export type TakeoffIssue = "no-quantity" | "unpriced" | "unit-changed" | null;
export type TakeoffLine = { item: ScopeItem; number: number; extended: number | null; issue: TakeoffIssue };
export type TradeTakeoff = {
  packageId: string; code: string; name: string; owner: string; division: string;
  lines: TakeoffLine[];
  /** Σ extended, to the cent; lines without one count nothing. */
  total: number;
  quantified: number; priced: number;
  /** Lines whose quantity nobody has checked yet. */
  unchecked: number;
  approved: number;
};

const cents = (n: number) => Math.round(n * 100);

/** A line's extended amount, to the cent, and why it has none. */
export function lineExtended(item: Pick<ScopeItem, "quantity" | "unitPrice">): { extended: number | null; issue: TakeoffIssue } {
  const q = item.quantity, p = item.unitPrice;
  if (!q) return { extended: null, issue: "no-quantity" };
  if (!p) return { extended: null, issue: "unpriced" };
  if (unitKey(p.unit) !== unitKey(q.unit)) return { extended: null, issue: "unit-changed" };
  return { extended: cents(q.value * p.rate) / 100, issue: null };
}

/** One trade's takeoff: its own lines in bid-form order; with `approvedOnly`, only the approved ones. */
export function tradeTakeoff(state: Procurement, packageId: string, approvedOnly = false): TradeTakeoff {
  const pkg = state.packages.find(p => p.id === packageId);
  const own = state.scopes.filter(s => !s.allTrades && s.packageId === packageId && (!approvedOnly || s.status === "approved"));
  const lines = own.map((item, i) => ({ item, number: i + 1, ...lineExtended(item) }));
  return {
    packageId, code: pkg?.code ?? "", name: pkg?.name ?? "", owner: pkg?.owner ?? "", division: pkg?.division ?? "",
    lines, total: lines.reduce((sum, l) => sum + cents(l.extended ?? 0), 0) / 100,
    quantified: lines.filter(l => l.item.quantity).length, priced: lines.filter(l => l.extended !== null).length,
    unchecked: lines.filter(l => l.item.quantity && !l.item.quantity.checked).length,
    approved: lines.filter(l => l.item.status === "approved").length,
  };
}

/** Every trade's takeoff, in the order of the trades. */
export const takeoffByTrade = (state: Procurement, approvedOnly = false): TradeTakeoff[] => state.packages.map(p => tradeTakeoff(state, p.id, approvedOnly));

export const ISSUE_LABEL: Record<Exclude<TakeoffIssue, null>, string> = {
  "no-quantity": "No quantity yet", unpriced: "No unit price yet", "unit-changed": "Priced per another unit",
};

// ── Prices offered ──

export type PriceSuggestion = { rate: number; origin: "benchmark" | "estimate"; label: string; basis: string };

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * Prices a line can take, per the unit of its quantity, for the estimator to pick from: the rate of the Quantity
 * takeoffs line its quantity came from, and the unit cost database's median for the same or closest item (`list` is
 * the benchmarks of other jobs: a job never benchmarks itself). Nothing when the line has no quantity.
 */
export function priceSuggestions(item: Pick<ScopeItem, "title" | "quantity">, division: string | null, rows: TakeoffRow[], list: Benchmark[]): PriceSuggestion[] {
  const q = item.quantity;
  if (!q) return [];
  const out: PriceSuggestion[] = [];
  const row = q.origin === "takeoff" && q.ref ? rows.find(r => r.id === q.ref) : undefined;
  if (row && row.rate > 0 && unitKey(row.unit) === unitKey(q.unit)) {
    out.push({ rate: row.rate, origin: "estimate", label: `${money(row.rate)} / ${q.unit} from the estimate line`, basis: `Rate of the Quantity takeoffs line "${row.item.trim().slice(0, 120)}"${row.reviewed ? "" : " (not reviewed yet)"}` });
  }
  const bench = benchmarkFor({ item: item.title, unit: q.unit, division }, list);
  if (bench && bench.median > 0) {
    const range = bench.low === bench.high ? "" : `, ${money(bench.low)}–${money(bench.high)}`;
    out.push({ rate: bench.median, origin: "benchmark", label: `${money(bench.median)} / ${q.unit} benchmark (${bench.count} price${bench.count === 1 ? "" : "s"})`,
      basis: `Unit cost database: median of ${bench.count} price${bench.count === 1 ? "" : "s"} from ${bench.jobs} job${bench.jobs === 1 ? "" : "s"}${range}, for "${bench.item.slice(0, 120)}"` });
  }
  return out;
}

// ── Plugs in leveling ──

/** What a line's own takeoff gives a plug: its quantity, and its unit price when it has one per that quantity's unit. */
export type LinePlug = { quantity: number; unit: string; rate: number | null; source: string; checked: boolean };

/**
 * The plug for a bid-form line a bidder excluded, from the line itself (leveling's lines are the published form's, by
 * id): no matching or AI needed when the line has its quantity. Null when it has none.
 */
export function linePlug(item: Pick<ScopeItem, "quantity" | "unitPrice"> | undefined): LinePlug | null {
  const q = item?.quantity;
  if (!q) return null;
  const { issue } = lineExtended(item!);
  const p = issue === null ? item!.unitPrice! : null;
  const priced = p ? ` × ${unitPriceLabel(p)} (${p.basis})` : "";
  return { quantity: q.value, unit: q.unit, rate: p ? p.rate : null, checked: q.checked,
    source: `This line's takeoff: ${quantityLabel(q)} (${q.basis}${q.checked ? "" : "; not checked yet"})${priced}.` };
}

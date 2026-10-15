// MCN's own estimate, trade by trade, and how it compares with the leveled bids and the budget.
//
// Marcel (7 Oct):
//   07:44–08:51  Quantity takeoffs organized like Scopes & bid forms: open Demolition, Concrete, …
//                to see that trade's items, add items inside it, and see each trade's owner and
//                GC estimate on the way back out. Model quantities belong in their trade too.
//   14:55–15:55  Let the budget use MCN's in-house estimate instead of a bid, and show a variance
//                report between that estimate and the leveled bids, to see why they differ.
//
// The estimate lines are the "takeoffs" rows (data/preconstruction.ts TakeoffRow). Money is summed
// in cents. Nothing here picks a bid or a budget basis for the estimator: the report lays the
// numbers side by side, and applying the estimate to a budget line is budget.ts's applyEstimateValue.

import { CSI_DIVISIONS } from "./csi";
import { trades, type TakeoffOrigin, type TakeoffRow } from "./data/preconstruction";
import type { BudgetLine, BudgetState, LevelingCandidate } from "./budget";
import type { Procurement, TradePackage } from "./procurement";
import type { QuantityDraft } from "./extraction";

export class EstimateRuleError extends Error {
  constructor(message: string) { super(message); this.name = "EstimateRuleError"; }
}
const fail = (message: string): never => { throw new EstimateRuleError(message); };
const newId = () => crypto.randomUUID();
const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;
/** One line's amount, to the cent. */
export const lineAmount = (row: Pick<TakeoffRow, "quantity" | "rate">): number => dollars(cents(row.quantity * row.rate));
const total = (rows: TakeoffRow[]) => dollars(rows.reduce((sum, r) => sum + cents(r.quantity * r.rate), 0));

/** The older trade label for a package's division, e.g. "09 · Finishes". */
const divisionLabel = (division: string) => trades.find(t => t.startsWith(`${division} `)) ?? `${division} · ${CSI_DIVISIONS[division] ?? "Other"}`;

/**
 * The trade a line belongs to. A line saved before trades existed is placed by its division
 * label when exactly one package has that division; otherwise it stays unassigned (null).
 */
export function packageOfRow(row: TakeoffRow, packages: TradePackage[]): string | null {
  if (row.packageId !== undefined) return row.packageId && packages.some(p => p.id === row.packageId) ? row.packageId : null;
  const division = row.division.slice(0, 2);
  const matches = packages.filter(p => p.division === division);
  return matches.length === 1 ? matches[0].id : null;
}

/** Every line with its trade written down, so later edits keep it. Unchanged rows keep their identity. */
export function placeRows(rows: TakeoffRow[], packages: TradePackage[]): TakeoffRow[] {
  let changed = false;
  const placed = rows.map(r => { if (r.packageId !== undefined) return r; changed = true; return { ...r, packageId: packageOfRow(r, packages) }; });
  return changed ? placed : rows;
}

// ── Reading: the trade list ─────────────────────────────────────────────────

export type TradeEstimate = {
  packageId: string; name: string; code: string; owner: string;
  items: TakeoffRow[];
  /** Σ quantity × rate; 0 when the trade has no lines. */
  total: number;
  /** Lines nobody has marked reviewed, and lines without a rate. */
  unreviewed: number; unpriced: number;
};
export type EstimateByTrade = { trades: TradeEstimate[]; unassigned: TakeoffRow[]; total: number };

/** Every trade package in procurement order with its lines and total; lines with no trade listed apart. */
export function estimateByTrade(rows: TakeoffRow[], procurement: Procurement): EstimateByTrade {
  const byTrade = new Map<string, TakeoffRow[]>();
  const unassigned: TakeoffRow[] = [];
  for (const row of rows) {
    const id = packageOfRow(row, procurement.packages);
    if (id) byTrade.set(id, [...(byTrade.get(id) ?? []), row]); else unassigned.push(row);
  }
  const list = procurement.packages.map(p => {
    const items = byTrade.get(p.id) ?? [];
    return { packageId: p.id, name: p.name, code: p.code, owner: p.owner, items, total: total(items), unreviewed: items.filter(r => !r.reviewed).length, unpriced: items.filter(r => !(r.rate > 0)).length };
  });
  return { trades: list, unassigned, total: total(rows) };
}

// ── Actions on the lines ────────────────────────────────────────────────────

export type EstimateItemInput = { packageId: string | null; item: string; unit: string; quantity: number; rate: number; source?: string };

function clean(input: EstimateItemInput, procurement: Procurement) {
  const item = input.item?.trim() || fail("Describe the item.");
  const unit = input.unit?.trim() || fail("Enter the unit, e.g. SF, LF, EA.");
  if (!(typeof input.quantity === "number" && Number.isFinite(input.quantity) && input.quantity > 0)) fail("The quantity must be a number above 0.");
  if (!(typeof input.rate === "number" && Number.isFinite(input.rate) && input.rate >= 0)) fail("The unit rate must be 0 or more.");
  if (!Number.isSafeInteger(cents(input.quantity * input.rate))) fail("The quantity and rate produce an amount that is too large.");
  const pkg = input.packageId === null ? null : procurement.packages.find(p => p.id === input.packageId) ?? fail("That trade package doesn't exist.");
  return { item, unit, quantity: input.quantity, rate: input.rate, source: input.source?.trim() ?? "", packageId: pkg?.id ?? null, division: pkg ? divisionLabel(pkg.division) : "" };
}

/** A line typed in by the estimator, inside a trade ("Add item" in that trade). */
export function addEstimateItem(rows: TakeoffRow[], procurement: Procurement, input: EstimateItemInput): TakeoffRow[] {
  return [...rows, { id: newId(), ...clean(input, procurement), reviewed: false }];
}

/** The model quantity row fields this needs (Quantity takeoffs → Model quantities). */
export type ModelQuantityInput = { rowId: string; label: string; unit: string; value: number | null; source: string };

/**
 * Prices a model quantity in a trade. The model's value is copied and remembered, so a later model
 * change shows up as drift (modelDrift) instead of silently changing the estimate.
 */
export function addModelQuantity(rows: TakeoffRow[], procurement: Procurement, packageId: string, row: ModelQuantityInput, rate: number): TakeoffRow[] {
  if (row.value === null) fail(`${row.label} has no measured quantity in the model.`);
  if (rows.some(r => r.origin?.kind === "model" && r.origin.rowId === row.rowId && r.packageId === packageId)) fail(`${row.label} is already in this trade's estimate.`);
  const origin: TakeoffOrigin = { kind: "model", rowId: row.rowId, measured: row.value! };
  return [...rows, { id: newId(), ...clean({ packageId, item: row.label, unit: row.unit, quantity: row.value!, rate, source: row.source }, procurement), reviewed: false, origin }];
}

/** Prices an accepted AI quantity finding in its trade. */
export function addAcceptedQuantity(rows: TakeoffRow[], procurement: Procurement, draft: QuantityDraft, rate: number): TakeoffRow[] {
  if (draft.status !== "accepted") fail("Accept the quantity finding before pricing it.");
  if (rows.some(r => r.origin?.kind === "ai" && r.origin.draftId === draft.id)) fail(`${draft.item} is already in the estimate.`);
  const source = draft.citations.map(c => c.sheet ?? `${c.document} p.${c.page}`).join(", ");
  return [...rows, { id: newId(), ...clean({ packageId: draft.packageId, item: draft.item, unit: draft.unit, quantity: draft.quantity, rate, source }, procurement), reviewed: false, origin: { kind: "ai", draftId: draft.id } }];
}

/** Changing what a line says or costs needs a fresh review; moving it to another trade does not. */
export function editEstimateItem(rows: TakeoffRow[], procurement: Procurement, id: string, changes: Partial<EstimateItemInput>): TakeoffRow[] {
  const row = rows.find(r => r.id === id) ?? fail("That estimate line no longer exists.");
  const next = { ...row, ...clean({ packageId: packageOfRow(row, procurement.packages), item: row.item, unit: row.unit, quantity: row.quantity, rate: row.rate, source: row.source, ...changes }, procurement) };
  const reworded = (["item", "unit", "quantity", "rate", "source"] as const).some(k => next[k] !== row[k]);
  if (!reworded && next.packageId === row.packageId) return rows;
  return rows.map(r => r.id === id ? { ...next, reviewed: reworded ? false : row.reviewed } : r);
}

export function setItemReviewed(rows: TakeoffRow[], id: string, reviewed: boolean): TakeoffRow[] {
  const row = rows.find(r => r.id === id) ?? fail("That estimate line no longer exists.");
  return row.reviewed === reviewed ? rows : rows.map(r => r.id === id ? { ...r, reviewed } : r);
}

export function removeEstimateItem(rows: TakeoffRow[], id: string): TakeoffRow[] {
  if (!rows.some(r => r.id === id)) fail("That estimate line no longer exists.");
  return rows.filter(r => r.id !== id);
}

/** A model-sourced line whose model value has changed since it was priced: the current value, else null. */
export function modelDrift(row: TakeoffRow, currentValue: number | null): number | null {
  if (row.origin?.kind !== "model" || currentValue === null) return null;
  return Math.abs(currentValue - row.origin.measured) > 1e-6 ? currentValue : null;
}

// ── Which budget lines a trade lands on ─────────────────────────────────────

export type TradeBudget = {
  lines: BudgetLine[];
  /** "linked": lines the estimator tied to the trade; "suggested": matched by CSI code, not yet confirmed. */
  basis: "linked" | "suggested" | "ambiguous" | "none";
  /** The budget codes considered when not linked; several when ambiguous. */
  codes: string[];
};

/** "09 29 00" → "09290"; "09200" → "09200". */
const fiveDigits = (code: string) => code.replace(/\s/g, "").slice(0, 5).padEnd(5, "0");
const commonPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };

/**
 * The direct budget lines for a trade. Lines linked to it (budget.ts linkBudgetLine) win.
 * Otherwise the code sharing the longest prefix with the trade's section, then the nearest number
 * (Marcel's budget uses 5-digit codes: drywall 09 29 00 → 09200, steel 05 12 00 → 05000 not 05500).
 * Every line with that code counts, across cost centers. A tie is "ambiguous": link one by hand.
 */
export function budgetLinesForTrade(budget: BudgetState, pkg: TradePackage): TradeBudget {
  const direct = budget.lines.filter(l => l.classification === "direct" && !l.byOwner);
  const linked = direct.filter(l => l.packageId === pkg.id);
  if (linked.length) return { lines: linked, basis: "linked", codes: [...new Set(linked.map(l => l.csiCode ?? ""))] };
  const target = fiveDigits(pkg.code);
  const codes = [...new Set(direct.filter(l => !l.packageId && l.csiCode?.replace(/\s/g, "").startsWith(pkg.division)).map(l => l.csiCode!))];
  if (!codes.length) return { lines: [], basis: "none", codes: [] };
  const score = (code: string) => [commonPrefix(fiveDigits(code), target), -Math.abs(Number(fiveDigits(code)) - Number(target))];
  const ranked = codes.map(code => ({ code, s: score(code) })).sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1]);
  const best = ranked.filter(r => r.s[0] === ranked[0].s[0] && r.s[1] === ranked[0].s[1]).map(r => r.code);
  if (best.length > 1) return { lines: [], basis: "ambiguous", codes: best };
  return { lines: direct.filter(l => l.csiCode === best[0] && !l.packageId), basis: "suggested", codes: best };
}

// ── Variance report ─────────────────────────────────────────────────────────

export type BidFigure = { bidderName: string; value: number; basis: "base" | "provisional" | "reviewed"; from: "leveling" | "budget-forecast" };

export type VarianceRow = {
  packageId: string; name: string; owner: string;
  /** MCN's estimate; null when the trade has no estimate lines. */
  estimate: number | null; estimateLines: number; estimateUnreviewed: number;
  /** The leveled bid this trade is compared with (see varianceReport). */
  bid: BidFigure | null;
  budget: number | null; forecast: number | null; budgetBasis: TradeBudget["basis"];
  /** bid − estimate: positive means the bid is above MCN's estimate. Percent of the estimate, one decimal. */
  bidOverEstimate: { amount: number; percent: number | null } | null;
  /** budget − estimate: positive means the estimate fits inside the budget. */
  budgetOverEstimate: number | null;
};

/**
 * One row per trade: MCN's estimate beside the leveled bid and the budget. The bid is the lowest
 * eligible, current reviewed total among `candidates` for that trade (from the open leveling
 * workspace), else the bid already applied to the trade's budget forecast. Trade totals only:
 * leveling compares scope answers, not priced quantities, so line-by-line matching isn't possible.
 */
export function varianceReport(input: { rows: TakeoffRow[]; procurement: Procurement; budget: BudgetState; candidates?: LevelingCandidate[] }): VarianceRow[] {
  const { trades: estimates } = estimateByTrade(input.rows, input.procurement);
  return input.procurement.packages.map(pkg => {
    const est = estimates.find(t => t.packageId === pkg.id)!;
    const tb = budgetLinesForTrade(input.budget, pkg);
    const sumOf = (values: number[]) => dollars(values.reduce((s, v) => s + cents(v), 0));
    const leveled = (input.candidates ?? [])
      .filter(c => c.packageId === pkg.id && c.eligible && !c.stale && c.reviewedTotal !== null)
      .sort((a, b) => a.reviewedTotal! - b.reviewedTotal!)[0];
    const applied = tb.lines.map(l => l.forecastSource).find(f => f && f.packageId === pkg.id);
    const bid: BidFigure | null = leveled ? { bidderName: leveled.bidderName, value: leveled.reviewedTotal!, basis: "reviewed", from: "leveling" }
      : applied ? { bidderName: applied.bidderName, value: applied.value, basis: applied.basis, from: "budget-forecast" } : null;
    const estimate = est.items.length ? est.total : null;
    const budget = tb.lines.length ? sumOf(tb.lines.map(l => l.budget)) : null;
    const forecast = tb.lines.length && tb.lines.some(l => l.forecast !== null) ? sumOf(tb.lines.map(l => l.forecast ?? l.budget)) : null;
    return {
      packageId: pkg.id, name: pkg.name, owner: pkg.owner,
      estimate, estimateLines: est.items.length, estimateUnreviewed: est.unreviewed,
      bid, budget, forecast, budgetBasis: tb.basis,
      bidOverEstimate: estimate !== null && bid ? { amount: dollars(cents(bid.value) - cents(estimate)), percent: estimate > 0 ? Math.round(((bid.value - estimate) / estimate) * 1000) / 10 : null } : null,
      budgetOverEstimate: estimate !== null && budget !== null ? dollars(cents(budget) - cents(estimate)) : null,
    };
  });
}

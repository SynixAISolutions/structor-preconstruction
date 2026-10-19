// The GC's number with its range (ideas 20 Oct, #1 "bid-day confidence"): what the project's total
// would be if every trade landed at the low or the high end of what the evidence supports, and which
// trades drive the difference. Rules, not a simulation: each range comes from numbers already in the
// project (reviewed bids, the in-house estimate, the budget) and says why. The two assumed bands are
// parameters the estimator can change. Pure, in cents.

import type { LevelingCandidate } from "./budget";
import type { VarianceRow } from "./estimate";

export type TradeRange = { packageId: string; name: string; carried: number; low: number; high: number; basis: "bid" | "estimate" | "budget"; reasons: string[] };
export type BidConfidence = { total: number; low: number; high: number; trades: TradeRange[]; drivers: TradeRange[]; withoutNumber: string[] };
export type ConfidenceBands = { estimateBand: number; budgetBand: number; spreadFlag: number; estimateFlag: number };
export const DEFAULT_BANDS: ConfidenceBands = { estimateBand: 0.15, budgetBand: 0.1, spreadFlag: 0.1, estimateFlag: 0.15 };

const cents = (n: number) => Math.round(n * 100), dollars = (c: number) => c / 100;
const pct = (a: number, b: number) => `${Math.round(Math.abs(a - b) / b * 100)}%`;

/**
 * Per trade:
 * - with reviewed bids: carried at the lowest. The range takes in the next bid when the lowest is more
 *   than `spreadFlag` under it (it may be missing scope), and the in-house estimate when the bid differs
 *   from it by more than `estimateFlag` or is the only reviewed bid
 * - no reviewed bid: carried at the in-house estimate ± `estimateBand`
 * - neither: carried at the budget ± `budgetBand`
 * Bids priced on an older bid form, or with unresolved gaps, are named in the reasons.
 */
export function bidConfidence(rows: VarianceRow[], candidates: LevelingCandidate[], bands: ConfidenceBands = DEFAULT_BANDS): BidConfidence {
  const trades: TradeRange[] = [], withoutNumber: string[] = [];
  for (const row of rows) {
    const mine = candidates.filter(c => c.packageId === row.packageId);
    const reviewed = mine.filter(c => c.eligible && !c.stale && c.reviewedTotal !== null).map(c => c.reviewedTotal!).sort((a, b) => a - b);
    const stale = mine.filter(c => c.stale).length, unresolved = mine.filter(c => c.eligible && !c.stale && c.reviewedTotal === null && c.provisionalTotal !== null).length;
    const reasons: string[] = [];
    let carried: number, values: number[], basis: TradeRange["basis"];
    const E = row.estimate, B = row.budget;
    if (reviewed.length) {
      const [L, S] = reviewed;
      carried = L; values = [L]; basis = "bid";
      if (S !== undefined && (S - L) / L > bands.spreadFlag) { values.push(S); reasons.push(`The lowest bid is ${pct(L, S)} under the next one; it may be missing scope.`); }
      if (reviewed.length === 1) reasons.push("Only one reviewed bid.");
      if (E !== null && E > 0 && (reviewed.length === 1 || Math.abs(L - E) / E > bands.estimateFlag)) { values.push(E); reasons.push(`The bid is ${pct(L, E)} ${L > E ? "over" : "under"} the in-house estimate.`); }
    } else if (E !== null && E > 0) {
      carried = E; basis = "estimate"; values = [E * (1 - bands.estimateBand), E * (1 + bands.estimateBand)];
      reasons.push(`No reviewed bid yet: carried at the in-house estimate, ±${Math.round(bands.estimateBand * 100)}%.`);
      if (row.estimateUnreviewed) reasons.push(`${row.estimateUnreviewed} estimate line${row.estimateUnreviewed === 1 ? " is" : "s are"} not reviewed.`);
    } else if (B !== null && B > 0) {
      carried = B; basis = "budget"; values = [B * (1 - bands.budgetBand), B * (1 + bands.budgetBand)];
      reasons.push(`No bid or estimate yet: carried at the budget, ±${Math.round(bands.budgetBand * 100)}%.`);
    } else { withoutNumber.push(row.name); continue; }
    if (stale) reasons.push(`${stale} bid${stale === 1 ? " was" : "s were"} priced on an older bid form.`);
    if (unresolved) reasons.push(`${unresolved} bid${unresolved === 1 ? " has" : "s have"} unresolved scope gaps.`);
    trades.push({ packageId: row.packageId, name: row.name, carried: dollars(cents(carried)), low: dollars(cents(Math.min(...values))), high: dollars(cents(Math.max(...values))), basis, reasons });
  }
  const sum = (k: "carried" | "low" | "high") => dollars(trades.reduce((s, t) => s + cents(t[k]), 0));
  const drivers = trades.filter(t => t.high > t.low || t.reasons.length).sort((a, b) => (b.high - b.low) - (a.high - a.low)).slice(0, 5);
  return { total: sum("carried"), low: sum("low"), high: sum("high"), trades, drivers, withoutNumber };
}

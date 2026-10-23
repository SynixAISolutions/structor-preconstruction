// Bid sheet summary (Marcel, 22 Oct, Budget summary): "the bid leveling maybe should have a summary page …
// the summary of every trade's number, only the trades, the lowest sub". Modelled on the Bid Sheet tab of
// his Jelleff Rec live bid sheet: per trade the estimator, the previous budget, the number carried, the
// delta, the cost per square foot, and every bidder's number side by side.
//
// Read-only. The carried number is the Budget page's lowest sub (lowestTradeBid): the lowest reviewed
// leveling total, else the lowest submitted base bid, labelled by its basis. Nothing here picks a bidder.

import type { BudgetState, LevelingCandidate } from "./budget";
import { lowestBid, tradeBids, tradeForBudgetLine, type LowBid } from "./budget-comparison";
import type { Procurement } from "./procurement";
import type { Submission } from "./submissions";
import { EMPTY_VE, type VeState } from "./value-engineering";

export type BidSheetRow = {
  packageId: string; code: string; trade: string; owner: string;
  /** The trade's in-house budget: the budget lines only this trade lands on (null when it has none of its own). */
  budget: number | null;
  /** The number carried: the lowest reviewed total, else the lowest base bid; null without bids. */
  carried: LowBid | null;
  /** carried − budget, as the sheet's "Delta (New − old)". */
  delta: number | null;
  perSquareFoot: number | null;
  /** Every current bid, lowest first. */
  bids: LowBid[];
};
export type BidSheetSummary = {
  rows: BidSheetRow[];
  /** Sums over the trades that have the figure; the budget total counts each line once. */
  total: { budget: number; carried: number; delta: number; perSquareFoot: number | null };
  /** Trades with no current bid yet. */
  withoutBids: number;
};

export type BidSheetInput = {
  procurement: Procurement; submissions: Submission[]; candidates: LevelingCandidate[];
  directory: { id: string; company: string }[]; budget: BudgetState;
  /** The project's gross square feet, for cost per square foot. */
  squareFeet: number | null;
  ve?: VeState;
};

const cents = (v: number) => Math.round(v * 100) / 100;

export function bidSheetSummary(input: BidSheetInput): BidSheetSummary {
  const { procurement, budget } = input;
  const sf = input.squareFeet && input.squareFeet > 0 ? input.squareFeet : null;
  const direct = budget.lines.filter(l => l.classification === "direct" && !l.byOwner);
  const owner = new Map(direct.map(l => [l.id, tradeForBudgetLine(budget, procurement, l)?.id ?? null]));
  const rows = procurement.packages.map(pkg => {
    const lines = direct.filter(l => owner.get(l.id) === pkg.id);
    const own = lines.length ? cents(lines.reduce((sum, l) => sum + l.budget, 0)) : null;
    const bids = tradeBids(procurement, input.submissions, pkg.id, input.candidates, input.directory, input.ve ?? EMPTY_VE);
    const carried = lowestBid(bids);
    return {
      packageId: pkg.id, code: pkg.code, trade: pkg.name, owner: pkg.owner, budget: own, carried,
      delta: carried && own !== null ? cents(carried.value - own) : null,
      perSquareFoot: carried && sf ? cents(carried.value / sf) : null,
      bids,
    };
  });
  const sum = (values: (number | null)[]) => cents(values.reduce<number>((s, v) => s + (v ?? 0), 0));
  const carried = sum(rows.map(r => r.carried?.value ?? null));
  return {
    rows,
    total: { budget: sum(rows.map(r => r.budget)), carried, delta: sum(rows.map(r => r.delta)), perSquareFoot: sf ? cents(carried / sf) : null },
    withoutBids: rows.filter(r => !r.carried).length,
  };
}

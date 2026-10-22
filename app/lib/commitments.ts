// Budget commitments, worked out from awards (Danial, 22 Oct: automate the budget's committed value).
// A budget line's committed cost is the subcontract sum of every executed award on its trade. An award
// selected but not yet executed (Exhibit A in progress, subcontract drafted or partly signed) is a
// pending commitment, kept apart. Nothing is copied into the budget: cancelling or re-awarding changes
// the figures by itself, and every page reads the same numbers through withCommitments.
//
// Where the amount goes: the budget line the award names; else the trade's one budget line; else the
// trade's lines split with the estimator's split (the Budget page's, as for the lowest sub budget,
// exact to the cent). With no split it is not guessed: those lines say "Split needed". Lines no award
// covers keep the value typed on them (self-performed work, purchase orders, owner-direct costs).

import { awardStage, type AwardStage, type AwardState } from "./award";
import type { BudgetState } from "./budget";
import { lowestSubLineValue } from "./budget-comparison";
import { budgetLinesForTrade } from "./estimate";
import type { Procurement } from "./procurement";

export type CommitmentSource = { awardId: string; company: string; trade: string; amount: number; stage: string; counts: "committed" | "pending" };
export type LineCommitment = {
  committed: number; pending: number; sources: CommitmentSource[];
  /** Trades whose award can't reach this line until the estimator splits them between their lines. */
  splitNeeded: string[];
  /** The value typed on the line, which the awards replace. */
  typed: number;
};
/** An active award that reaches no budget line, and why. */
export type UnplacedAward = CommitmentSource & { reason: string };
export type Commitments = { lines: Record<string, LineCommitment>; unplaced: UnplacedAward[]; committed: number; pending: number };

const cents = (v: number) => Math.round(v * 100);
const sum = (values: number[]) => values.reduce((n, v) => n + cents(v), 0) / 100;
/** "exhibit-agreed" → "exhibit agreed". */
export const stageLabel = (stage: AwardStage) => stage.replace(/-/g, " ");

export function budgetCommitments(budget: BudgetState, awards: AwardState, procurement: Procurement): Commitments {
  const lines: Record<string, LineCommitment> = {};
  const line = (id: string) => lines[id] ??= { committed: 0, pending: 0, sources: [], splitNeeded: [], typed: budget.lines.find(l => l.id === id)?.committed ?? 0 };
  const unplaced: UnplacedAward[] = [];
  for (const award of awards.awards) {
    if (award.cancelled) continue;
    const stage = awardStage(award);
    const pkg = procurement.packages.find(p => p.id === award.packageId);
    const source: CommitmentSource = { awardId: award.id, company: award.leveling.bidderName, trade: pkg?.name ?? award.packageId, amount: award.amount, stage: stageLabel(stage), counts: stage === "executed" ? "committed" : "pending" };
    const add = (id: string, amount: number) => { const l = line(id); l[source.counts] = sum([l[source.counts], amount]); l.sources.push({ ...source, amount }); };
    if (award.budgetLineId) {
      if (budget.lines.some(l => l.id === award.budgetLineId)) add(award.budgetLineId, award.amount);
      else unplaced.push({ ...source, reason: "Its budget line no longer exists: link the award to another line." });
      continue;
    }
    if (!pkg) { unplaced.push({ ...source, reason: "Its trade package no longer exists." }); continue; }
    const match = budgetLinesForTrade(budget, pkg);
    if (!match.lines.length) {
      unplaced.push({ ...source, reason: match.basis === "ambiguous" ? `Several budget lines could be ${pkg.name}'s (${match.codes.join(", ")}): link one on the Budget page.` : `No budget line matches ${pkg.name}: add or link one on the Budget page.` });
      continue;
    }
    const shares = match.lines.map(l => ({ id: l.id, value: lowestSubLineValue(budget, pkg, l.id, award.amount) }));
    if (shares.some(s => s.value === null)) {
      for (const l of match.lines) line(l.id).splitNeeded.push(pkg.name);
      unplaced.push({ ...source, reason: `Split ${pkg.name} between its ${match.lines.length} budget lines on the Budget page.` });
      continue;
    }
    for (const s of shares) add(s.id, s.value!);
  }
  const all = Object.values(lines);
  return { lines, unplaced, committed: sum(all.map(l => l.committed)), pending: sum(all.map(l => l.pending)) };
}

/** The budget as every page reads it: a line an award reaches carries its executed awards' sum as committed. */
export function withCommitments(budget: BudgetState, commitments: Commitments): BudgetState {
  return { ...budget, lines: budget.lines.map(l => commitments.lines[l.id]?.sources.length ? { ...l, committed: commitments.lines[l.id].committed } : l) };
}

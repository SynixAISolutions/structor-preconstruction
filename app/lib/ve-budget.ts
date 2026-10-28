// Accepted value engineering in the budget (Marcel, 24 Oct: accepting a VE item lowers the related trade in the
// budget and marks it "VE applied"). An accepted idea linked to a trade package lowers that trade's budget lines
// by its accepted cost impact, shared by their budgets when the trade has several (one per cost center), and each
// line lists what was applied. The typed budget is never changed, so reopening the idea brings the number back.
// Pure; lib/forecasts costPlan applies it before commitments and forecasts, so every total reads the same plan.

import type { BudgetState } from "./budget";
import { budgetLinesForTrade } from "./estimate";
import type { Procurement } from "./procurement";
import type { VeState } from "./value-engineering";

/** What one accepted idea took off one budget line (negative = a saving). */
export type VeOnLine = { ideaId: string; number: string; amount: number };
/** An accepted idea that reaches no budget line, and why. */
export type VeUnplaced = { ideaId: string; number: string; reason: string };

const cents = (n: number) => Math.round(n * 100);

/**
 * The budget with every accepted, trade-linked idea applied. Shares are split by line budget to the cent; the last
 * line takes the rounding so the shares add up to the accepted impact exactly.
 */
export function withAcceptedVe(budget: BudgetState, ve: VeState, procurement: Procurement): { budget: BudgetState; unplaced: VeUnplaced[] } {
  const applied = new Map<string, VeOnLine[]>(), unplaced: VeUnplaced[] = [];
  for (const idea of ve.ideas) {
    if (idea.decision?.outcome !== "accepted" || idea.decision.acceptedImpact === null) continue;
    const pkg = idea.packageId ? procurement.packages.find(p => p.id === idea.packageId) : undefined;
    if (!pkg) { unplaced.push({ ideaId: idea.id, number: idea.number, reason: idea.packageId ? "Its trade package no longer exists." : "Link it to a trade package to apply it to the budget." }); continue; }
    const { lines, basis } = budgetLinesForTrade(budget, pkg);
    if (!lines.length) { unplaced.push({ ideaId: idea.id, number: idea.number, reason: basis === "ambiguous" ? `${pkg.name} matches more than one budget line: link one to it in the budget.` : `${pkg.name} has no budget line yet.` }); continue; }
    const impact = cents(idea.decision.acceptedImpact), base = lines.reduce((n, l) => n + cents(l.budget), 0);
    let left = impact;
    lines.forEach((line, i) => {
      const share = i === lines.length - 1 ? left : base ? Math.round(impact * cents(line.budget) / base) : Math.round(impact / lines.length);
      left -= share;
      applied.set(line.id, [...(applied.get(line.id) ?? []), { ideaId: idea.id, number: idea.number, amount: share / 100 }]);
    });
  }
  if (!applied.size) return { budget, unplaced };
  return {
    budget: { ...budget, lines: budget.lines.map(line => { const ve = applied.get(line.id); return ve ? { ...line, budget: (cents(line.budget) + ve.reduce((n, v) => n + cents(v.amount), 0)) / 100, veApplied: ve } : line; }) },
    unplaced,
  };
}

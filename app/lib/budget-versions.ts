import { budgetTotals, validateLineInput, type BudgetState } from "./budget";
import { ESTIMATE_STAGES, type EstimateStage } from "./projects";

/** A budget version's stage: the estimate stages, construction documents among them since 17 Nov. */
export const BUDGET_VERSION_STAGES = ESTIMATE_STAGES;
export type BudgetVersionStage = EstimateStage;
export type BudgetVersion = { id: string; projectId: string; name: string; stage: BudgetVersionStage; reason: string; by: string; at: string; budget: BudgetState };
const cents = (v: number) => Math.round(v * 100);

export function saveBudgetVersion(versions: BudgetVersion[], budget: BudgetState, input: Omit<BudgetVersion, "id" | "budget">): BudgetVersion[] {
  if (!input.projectId || !input.name.trim() || !input.reason.trim() || !input.by.trim()) throw new Error("Enter a version name, change explanation and author.");
  if (!BUDGET_VERSION_STAGES.some(s => s.value === input.stage)) throw new Error("Choose an estimate stage.");
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("The saved date is invalid.");
  if (!budget.lines.length && !budget.allowances.length) throw new Error("Add budget lines before saving a version.");
  if (budget.lines.some(l => Object.keys(validateLineInput(l)).length)) throw new Error("Correct invalid budget values before saving a version.");
  if (budget.allowances.some(a => !Number.isFinite(a.amount) || a.amount < 0)) throw new Error("Correct invalid allowance values before saving a version.");
  return [...versions, { ...input, name: input.name.trim(), reason: input.reason.trim(), id: crypto.randomUUID(), budget: structuredClone(budget) }];
}

function contributions(budget: BudgetState) {
  const ids = new Set(budget.lines.map(l => l.id));
  return [
    ...budget.lines.map(l => ({ id: `line:${l.id}`, description: l.description, center: l.costCenter, basis: `${l.classification}${l.byOwner ? " · by owner" : ""}`, amount: l.byOwner ? 0 : l.budget })),
    ...budget.allowances.map(a => ({ id: `allowance:${a.id}`, description: a.name, center: a.costCenter, basis: `Allowance · ${a.status}${a.budgetLineId && ids.has(a.budgetLineId) ? " · inside budget line" : ""}`, amount: a.status === "included" && (!a.budgetLineId || !ids.has(a.budgetLineId)) ? a.amount : 0 })),
  ];
}

/** An accepted value-engineering idea as the trend reads it (lib/value-engineering's VeIdea has these). */
export type TrendVe = { number: string; description: string; decision: { outcome: string; at: string; acceptedImpact: number | null } | null };
export type TrendStep = {
  id: string; name: string; stage: string; at: string; reason: string; by: string; total: number;
  /** Change from the step before; null for the first. */
  delta: number | null;
  /** The lines that moved the most since the step before, largest first (at most five). */
  drivers: { description: string; center: string; change: string; delta: number }[];
  /** Value engineering accepted after the step before and up to this one. */
  ve: { number: string; description: string; impact: number | null }[];
};

/**
 * The budget's story across its saved versions, oldest first (Marcel's features list, item 15: "show trend of budget
 * from SD phase to GMP phase, also it would show if there were any accepted VEs and it would basically be a story line
 * with graphs that shows why the budget went up or down during different iterations"). Each step says what the total
 * was, by how much it moved, which lines moved it, and which VE was accepted in between, with the reason the team gave
 * when it saved the version. `current`, when given and different from the last version, ends the story as "Working budget".
 */
export function budgetTrend(versions: BudgetVersion[], ve: TrendVe[] = [], current?: { budget: BudgetState; at: string }): TrendStep[] {
  const sorted = [...versions].sort((a, b) => a.at.localeCompare(b.at));
  const all: BudgetVersion[] = [...sorted];
  if (current && sorted.length) {
    const last = sorted[sorted.length - 1];
    const now: BudgetVersion = { id: "working", projectId: last.projectId, name: "Working budget", stage: last.stage, reason: "Not saved as a version yet.", by: "", at: current.at, budget: current.budget };
    if (compareBudgetVersions(last, now).rows.some(r => r.change !== "Unchanged")) all.push(now);
  }
  const accepted = ve.filter(v => v.decision?.outcome === "accepted");
  return all.map((v, i) => {
    const prev = i ? all[i - 1] : null;
    const total = budgetTotals(v.budget).totalBudget;
    const comparison = prev ? compareBudgetVersions(prev, v) : null;
    return {
      id: v.id, name: v.name, stage: BUDGET_VERSION_STAGES.find(s => s.value === v.stage)?.label ?? v.stage, at: v.at, reason: v.reason, by: v.by, total,
      delta: comparison ? comparison.delta : null,
      drivers: comparison ? comparison.rows.filter(r => r.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5).map(r => ({ description: r.description, center: r.center, change: r.change, delta: r.delta })) : [],
      ve: prev ? accepted.filter(x => x.decision!.at > prev.at && x.decision!.at <= v.at).map(x => ({ number: x.number, description: x.description, impact: x.decision!.acceptedImpact })) : [],
    };
  });
}

export function compareBudgetVersions(before: BudgetVersion, after: BudgetVersion) {
  if (before.projectId !== after.projectId) throw new Error("Choose versions from the same project.");
  const old = new Map(contributions(before.budget).map(l => [l.id, l]));
  const next = new Map(contributions(after.budget).map(l => [l.id, l]));
  const rows = [...new Set([...old.keys(), ...next.keys()])].map(id => {
    const a = old.get(id), b = next.get(id);
    const changed = !a || !b || a.description !== b.description || a.center !== b.center || a.basis !== b.basis || a.amount !== b.amount;
    return { id, description: b?.description ?? a!.description, center: b?.center ?? a!.center, before: a?.amount ?? 0, after: b?.amount ?? 0,
      delta: (cents(b?.amount ?? 0) - cents(a?.amount ?? 0)) / 100, change: !a ? "Added" : !b ? "Removed" : changed ? "Changed" : "Unchanged", basis: b?.basis ?? a!.basis };
  });
  const beforeTotal = budgetTotals(before.budget).totalBudget, afterTotal = budgetTotals(after.budget).totalBudget;
  return { rows, beforeTotal, afterTotal, delta: (cents(afterTotal) - cents(beforeTotal)) / 100 };
}

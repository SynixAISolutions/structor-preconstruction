import { budgetTotals, validateLineInput, type BudgetState } from "./budget";
import { ESTIMATE_STAGES, type EstimateStage } from "./projects";

export const BUDGET_VERSION_STAGES = [...ESTIMATE_STAGES, { value: "cd", label: "Construction documents" }] as const;
export type BudgetVersionStage = EstimateStage | "cd";
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

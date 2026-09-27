// Jelleff sample budget and allowances. Direct lines and allowances keep the values of the
// earlier Budget summary and Allowances previews (initialCosts / initialAllowances). The three
// indirect lines are illustrative placeholders until Marcel's real budget file arrives.

import type { BudgetAllowance, BudgetClass, BudgetLine, BudgetState } from "../budget";

const at = "2026-09-16T15:00:00.000Z";
const line = (id: string, costCenter: string, classification: BudgetClass, csiCode: string | null, description: string, owner: string, budget: number, forecast: number, approved: boolean): BudgetLine => ({
  id, costCenter, classification, csiCode, description, owner, budget, forecast, committed: 0,
  status: approved ? "approved" : "draft", approval: approved ? { by: "Marcel Khoury", at } : null,
  source: { kind: "sample" }, forecastSource: null, updatedAt: at,
});
const allowance = (id: string, name: string, amount: number, costCenter: string, source: string, status: BudgetAllowance["status"], owner: string, budgetLineId: string | null = null): BudgetAllowance =>
  ({ id, name, amount, costCenter, owner, source, status, budgetLineId, updatedAt: at });

export const sampleBudget: BudgetState = {
  lines: [
    line("c1", "Modernization", "direct", "02", "Demolition", "Safi", 520000, 498000, false),
    line("c2", "Modernization", "direct", "03", "Concrete", "Vijay", 780000, 762000, true),
    line("c3", "Modernization", "direct", "05", "Structural steel", "Naija", 1120000, 1155000, false),
    line("c4", "Modernization", "direct", "23", "Mechanical", "Vijay", 2350000, 2275000, false),
    line("c5", "Modernization", "direct", "26", "Electrical", "Naija", 1650000, 1590000, true),
    line("c6", "New addition", "direct", "03", "Concrete", "Vijay", 980000, 945000, false),
    line("c7", "New addition", "direct", "05", "Structural steel", "Naija", 1800000, 1740000, false),
    line("c8", "New addition", "direct", "07", "Roofing & envelope", "Vijay", 1300000, 1280000, false),
    line("c9", "Site work", "direct", "31", "Earthwork", "", 640000, 622000, true),
    line("c10", "Site work", "direct", "32", "Exterior improvements", "", 820000, 850000, false),
    line("c11", "Site work", "direct", "33", "Site utilities", "", 460000, 447000, false),
    line("i1", "Project-wide", "indirect", null, "General liability insurance (sample)", "", 185000, 185000, false),
    line("i2", "Project-wide", "indirect", null, "Contingency (sample)", "", 620000, 620000, false),
    line("i3", "Project-wide", "indirect", null, "General contractor fee (sample)", "", 500000, 500000, false),
  ],
  allowances: [
    allowance("a1", "Public art allowance", 500000, "Site work", "Owner requirements · Public art", "review", "Safi"),
    allowance("a2", "Unforeseen existing conditions", 175000, "Modernization", "General requirements · Existing conditions", "included", "Vijay"),
    allowance("a3", "AV equipment selection", 85000, "Modernization", "Division 27 · Communications", "review", "Naija"),
    allowance("a4", "Landscape establishment", 45000, "Site work", "Division 32 · Exterior improvements", "included", "Safi", "c10"),
  ],
};

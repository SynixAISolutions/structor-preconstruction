// The owner's budget, read from its file (Marcel, 24 Oct: the Budget folder in Project files takes the owner's
// budget and earlier estimates, "the budget upload is optional and the AI extracts from it"). The AI lists the
// file's cost lines, each with the page and words it comes from (lib/ai-jobs-more "budget-lines"); the estimator
// ticks the ones to keep. A ticked line fills the budget line for the same trade, or becomes a new one. Pure.

import { addBudgetLine, editBudgetLine, type BudgetClass, type BudgetLine, type BudgetState } from "./budget";
import { csiDivision } from "./csi";

export type OwnerBudgetLine = { description: string; csiCode: string | null; classification: BudgetClass; amount: number; page: number; quote: string };
/** One reading of a budget file, kept with the project ("owner-budget-reading") so it isn't read again. */
export type OwnerBudgetReading = { docId: string; docName: string; model: string; at: string; lines: OwnerBudgetLine[] };
export const OWNER_BUDGET_KEY = "owner-budget-reading";

const words = (text: string) => new Set(text.toLowerCase().replace(/&/g, " and ").split(/[^a-z]+/).filter(w => w.length >= 4 && !["work", "works", "systems", "system", "and", "other", "general", "misc"].includes(w)));
const divisionOf = (code: string | null) => {
  const value = (code ?? "").trim();
  return !value ? null : /^\d{2}$/.test(value) ? value : /^\d{5}$/.test(value) ? value.slice(0, 2) : csiDivision(value);
};

/** The budget line a read line fills: the same description, or the same CSI division with a word in common. */
export function matchBudgetLine(lines: BudgetLine[], found: OwnerBudgetLine, taken: ReadonlySet<string> = new Set()): BudgetLine | null {
  const open = lines.filter(l => !taken.has(l.id) && !l.byOwner && l.classification === found.classification);
  const same = open.find(l => l.description.trim().toLowerCase() === found.description.trim().toLowerCase());
  if (same) return same;
  const division = divisionOf(found.csiCode), mine = words(found.description);
  return open.find(l => division !== null && divisionOf(l.csiCode) === division && [...words(l.description)].some(w => mine.has(w))) ?? null;
}

/** Puts the chosen lines in the budget, in `costCenter` for new ones: a matching line takes the amount as its budget,
 * the others are added as draft lines. */
export function applyOwnerBudget(state: BudgetState, found: OwnerBudgetLine[], costCenter: string, by: string, at?: string): { state: BudgetState; updated: number; added: number } {
  let next = state, updated = 0, added = 0;
  const taken = new Set<string>();
  for (const line of found) {
    const match = matchBudgetLine(next.lines, line, taken);
    if (match) {
      taken.add(match.id);
      if (match.budget !== line.amount) { next = editBudgetLine(next, match.id, { budget: line.amount }, by, at); updated++; }
      continue;
    }
    next = addBudgetLine(next, { costCenter, classification: line.classification, csiCode: line.csiCode, description: line.description, budget: line.amount, forecast: null, committed: 0 }, by, at);
    taken.add(next.lines.at(-1)!.id);
    added++;
  }
  return { state: next, updated, added };
}

/** Whether a quote carries the amount: its digits appear in the quote's ("$1,250,000" or "1,250,000.00" for
 * 1250000, "1,250" in a table stated in thousands). */
export function quoteHasAmount(quote: string, amount: number): boolean {
  const digits = quote.replace(/[^0-9]/g, ""), cents = Math.round(amount * 100);
  const forms = [String(Math.round(amount)), String(cents)];
  if (cents % 100_000 === 0) forms.push(String(cents / 100_000));
  return forms.some(form => digits.includes(form));
}

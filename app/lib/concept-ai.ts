// The AI step of the concept budget (15 Oct, Marcel: "the AI would create a budget based off of
// similar projects that have already been uploaded… this has 500,000 SF of addition, this is tax
// exempt, this is a First Source project, this is a project labor agreement project").
//
// The AI only ranks the stored historical projects by similarity and proposes the factors with
// their reasons; lib/historical-budget generateConceptBudget still does all the arithmetic, and no
// cost is ever taken from the AI.

import type { BudgetHistory, ConceptFactors } from "./historical-budget";
import type { Project } from "./projects";

export type ComparableFacts = Omit<BudgetHistory, "lines" | "source"> & { costPerSf: number };
export type ConceptSuggestion = { comparables: { id: string; name: string; score: number; reasons: string }[]; factors: ConceptFactors; notes: string[] };

/** What the AI sees of each historical project: its facts and overall cost per SF, not its lines. */
export function comparableFacts(history: BudgetHistory[]): ComparableFacts[] {
  return history.slice(0, 50).map(({ lines, source: _source, ...facts }) => ({ ...facts, costPerSf: facts.squareFeet > 0 ? Math.round(lines.filter(l => !l.byOwner).reduce((n, l) => n + l.amount, 0) / facts.squareFeet * 100) / 100 : 0 }));
}

/** The project's facts the comparison uses. */
export const targetFacts = (p: Project) => ({ name: p.name, type: p.type, location: p.location, squareFeet: p.squareFeet, workType: p.workType, renovationSquareFeet: p.renovationSquareFeet, additionSquareFeet: p.additionSquareFeet, taxStatus: p.taxStatus, certifications: p.certifications, estimateStage: p.estimateStage });

/**
 * Screens the ranking and factors: only stored projects, once each, best first, at most 10; a profile
 * factor between 0.5 and 2; location and cost indexes positive (kept from the best comparable when the
 * AI gives none); and a basis whenever any factor changes the historical costs.
 */
export function screenConceptSuggestion(output: unknown, records: ComparableFacts[]): ConceptSuggestion {
  const o = (output ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const comparables = (Array.isArray(o.comparables) ? o.comparables : []).slice(0, 30).flatMap(c => {
    const x = (c ?? {}) as Record<string, unknown>;
    const record = records.find(r => r.id === x.id);
    if (!record || seen.has(record.id)) return [];
    seen.add(record.id);
    const score = Math.max(0, Math.min(100, Math.round(Number(x.score)) || 0));
    return [{ id: record.id, name: record.name, score, reasons: typeof x.reasons === "string" ? x.reasons.trim().slice(0, 500) : "" }];
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  const f = (o.factors ?? {}) as Record<string, unknown>;
  const best = records.find(r => r.id === comparables[0]?.id);
  const index = (v: unknown, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 1000) / 1000 : fallback; };
  const profile = Number(f.profileFactor);
  const factors: ConceptFactors = {
    locationIndex: index(f.locationIndex, best?.locationIndex ?? 1), costIndex: index(f.costIndex, best?.costIndex ?? 1),
    profileFactor: Number.isFinite(profile) && profile >= 0.5 && profile <= 2 ? Math.round(profile * 1000) / 1000 : 1,
    basis: typeof f.basis === "string" ? f.basis.trim().slice(0, 800) : "",
  };
  const notes: string[] = [];
  const chosen = records.filter(r => comparables.some(c => c.id === r.id));
  const changes = factors.profileFactor !== 1 || chosen.some(r => r.locationIndex !== factors.locationIndex || r.costIndex !== factors.costIndex);
  if (changes && !factors.basis) factors.basis = "Suggested by AI from the projects' differences; confirm the indexes against your cost index source.";
  if (Number.isFinite(profile) && (profile < 0.5 || profile > 2)) notes.push("The AI's profile factor was outside 0.5 to 2 and was reset to 1.");
  if (!comparables.length) notes.push("No stored historical project was found comparable.");
  return { comparables, factors, notes };
}

// Suggested bidders for a bid package (Marcel's Software Features list, item 5: "each [package] would have suggested
// subcontractors based on project type and certifications required"). The trade still decides who is offered
// (lib/procurement inviteCandidates); this only ranks those companies and says why each one is suggested:
//   1. it holds a certification this project requires (CBE, MBE, First Source…), from the directory's percents;
//   2. it does this kind of project (the company's project types in the directory);
//   3. it is Qualified; 4. it is local to the project.
// Pure: no React, no storage.

import type { CompanyCertification } from "./compliance";

export type SuggestionProject = { type: string; certifications: string[]; location: string };
export type SuggestionCompany = { id: string; company: string; status?: string; location?: string; certifications?: CompanyCertification[]; projectTypes?: string[] };
export type Suggestion<C extends SuggestionCompany> = { company: C; score: number; reasons: string[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "Washington, DC" → "DC"; "Fairfax, VA" → "VA"; the last part of a location, when it reads like a state. */
export function stateOf(location = ""): string {
  const last = location.split(",").map(p => p.trim()).filter(Boolean).at(-1) ?? "";
  return /^[A-Za-z]{2}$/.test(last) ? last.toUpperCase() : "";
}

const WEIGHTS = { certification: 3, projectType: 2, qualified: 1, reviewRequired: -1, local: 1 } as const;

/** Why one company suits this project; empty when nothing beyond the trade matches. */
export function suggestionReasons(company: SuggestionCompany, project: SuggestionProject): { score: number; reasons: string[] } {
  let score = 0; const reasons: string[] = [];
  const held = new Map((company.certifications ?? []).filter(c => c.percent > 0).map(c => [norm(c.program), c]));
  for (const program of project.certifications) {
    const match = held.get(norm(program));
    if (match) { score += WEIGHTS.certification; reasons.push(`${match.program} ${Number.isInteger(match.percent) ? match.percent : match.percent.toFixed(2)}%`); }
  }
  if (project.type && (company.projectTypes ?? []).some(t => norm(t) === norm(project.type))) { score += WEIGHTS.projectType; reasons.push(`Does ${project.type} work`); }
  if (company.status === "Qualified") { score += WEIGHTS.qualified; reasons.push("Qualified"); }
  if (company.status === "Review required") score += WEIGHTS.reviewRequired;
  const here = stateOf(project.location);
  if (here && stateOf(company.location) === here) { score += WEIGHTS.local; reasons.push(`Local (${here})`); }
  return { score, reasons };
}

/** The companies best suited to this project first; ties keep alphabetical order, so the list is stable. */
export function rankBidders<C extends SuggestionCompany>(companies: C[], project: SuggestionProject): Suggestion<C>[] {
  return companies
    .map(company => ({ company, ...suggestionReasons(company, project) }))
    .sort((a, b) => b.score - a.score || a.company.company.localeCompare(b.company.company));
}

/** Directory form values → project types, kept to the app's list (lib/projects PROJECT_TYPES), deduplicated. */
export function cleanProjectTypes(values: unknown[], allowed: readonly string[]): string[] {
  const byName = new Map(allowed.map(t => [norm(t), t]));
  return [...new Set(values.map(v => byName.get(norm(String(v)))).filter((t): t is string => !!t))];
}

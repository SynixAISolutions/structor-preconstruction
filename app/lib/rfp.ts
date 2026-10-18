// Project details read from the RFP (15 Oct: "upload the project directly as a file with RFPs and
// add all the details"). The AI proposes each detail with its page and the words it relied on
// (lib/ai-jobs-more "rfp-facts"); a person accepts them before the project record changes.

import { CERTIFICATION_PROGRAMS, ESTIMATE_STAGES, PROJECT_TYPES, normalizeProject, type Project } from "./projects";

export const RFP_FIELDS = {
  name: "Project name", location: "Location / address", type: "Project type", architect: "Architect",
  description: "Short description (owner, scope, delivery method)", value: "Budget or estimated construction cost (USD)",
  squareFeet: "Total building area (SF)", renovationSquareFeet: "Renovation area (SF)", additionSquareFeet: "Addition / new area (SF)",
  workType: "Work type: new, renovation, addition or both", due: "Bid / proposal due date", rfi: "Last day for questions (RFIs)",
  start: "Construction start", finish: "Construction completion", taxStatus: "Tax status: taxable or non-taxable",
  estimateStage: "Design stage of the documents: concept, schematic, dd or cd", certifications: "Participation programs, e.g. CBE, MBE, First Source",
} as const;
export type RfpField = keyof typeof RFP_FIELDS;
export type RfpFact = { field: RfpField; value: string | number | string[]; page: number; quote: string };

const DATE_FIELDS = new Set<RfpField>(["due", "rfi", "start", "finish"]);
const NUMBER_FIELDS = new Set<RfpField>(["value", "squareFeet", "renovationSquareFeet", "additionSquareFeet"]);
const KEYWORDS = /due|deadline|square feet|\bS\.?F\.?\b|gross|area|budget|estimate|construction cost|tax|first source|CBE|MBE|WBE|LEED|architect|owner|schedule|substantial completion|notice to proceed|renovat|addition|new construction|delivery method|design development|construction documents|questions|RFI/i;

/** The pages worth sending: the first three, then those mentioning dates, areas, money, tax or programs, up to `max`. */
export function rfpPages(pages: { page: number; text: string }[], max = 24): { page: number; text: string }[] {
  const useful = pages.filter(p => p.text.trim());
  const picked = new Set([...useful.slice(0, 3), ...useful.filter(p => KEYWORDS.test(p.text))].slice(0, max).map(p => p.page));
  return useful.filter(p => picked.has(p.page));
}

/** A fact's value in the project record's own shape, or null when it can't be one. */
export function normalizeFact(field: RfpField, value: unknown): RfpFact["value"] | null {
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (DATE_FIELDS.has(field)) {
    // "February 2, 2026" parses as local midnight: read the local date parts, not the UTC ones.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : (() => { const d = new Date(text); return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    const d = new Date(`${iso}T00:00:00Z`);
    return iso && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
  }
  if (NUMBER_FIELDS.has(field)) { const n = Math.round(Number(text.replace(/[$,\s]|sf|sq\.?\s*ft\.?/gi, ""))); return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null; }
  if (field === "workType") { const w = text.toLowerCase(); return ["new", "renovation", "addition", "both"].find(v => w === v || (v === "new" && /new construction/.test(w))) ?? null; }
  if (field === "taxStatus") { const t = text.toLowerCase(); return /non|exempt/.test(t) ? "non-taxable" : /taxable/.test(t) ? "taxable" : null; }
  if (field === "estimateStage") { const s = text.toLowerCase(); return ESTIMATE_STAGES.find(e => s === e.value || s.includes(e.label.toLowerCase()))?.value ?? (/construction doc/.test(s) ? "cd" : null); }
  if (field === "type") return PROJECT_TYPES.find(t => t.toLowerCase() === text.toLowerCase()) ?? (text ? text.slice(0, 80) : null);
  if (field === "certifications") {
    const list = (Array.isArray(value) ? value : text.split(/[,;/]/)).map(v => String(v).trim()).filter(Boolean);
    const known = list.map(v => CERTIFICATION_PROGRAMS.find(p => p.toLowerCase() === v.toLowerCase()) ?? v.slice(0, 40));
    return known.length ? [...new Set(known)] : null;
  }
  return text ? text.slice(0, field === "description" ? 600 : 160) : null;
}

export type RfpComparison = { rows: (RfpFact & { label: string; current: string; proposed: string; same: boolean; conflict: boolean })[]; issues: string[] };

const shown = (v: unknown) => Array.isArray(v) ? v.join(", ") : v === null || v === undefined || v === 0 ? "" : String(v);

/**
 * The RFP review as a comparison (never a silent overwrite): each field's current and proposed value
 * with its page and quote; a conflict when the project already holds a different value; and issues
 * worth a look before accepting (dates out of order, a renovation/addition split with one side).
 */
export function compareRfpFacts(project: Project, facts: RfpFact[]): RfpComparison {
  const rows = facts.map(f => {
    const current = shown((project as unknown as Record<string, unknown>)[f.field]), proposed = shown(f.value);
    const same = current.toLowerCase() === proposed.toLowerCase();
    return { ...f, label: RFP_FIELDS[f.field], current, proposed, same, conflict: !!current && !same };
  });
  const value = (field: RfpField) => (facts.find(f => f.field === field)?.value ?? (project as unknown as Record<string, unknown>)[field]) as string | number | undefined;
  const issues: string[] = [];
  const due = value("due"), rfi = value("rfi"), start = value("start"), finish = value("finish");
  if (rfi && due && String(rfi) > String(due)) issues.push("The last day for questions falls after the bid due date.");
  if (start && finish && String(finish) < String(start)) issues.push("Construction completion falls before construction start.");
  const workType = value("workType"), reno = value("renovationSquareFeet"), add = value("additionSquareFeet");
  if (workType === "both" && !(Number(reno) > 0 && Number(add) > 0)) issues.push("Renovation and addition work needs both areas; one is missing.");
  const area = facts.find(f => f.field === "squareFeet");
  if (area && Number(area.value) < 1000) issues.push(`A building area of ${area.value} SF is unusually small; check the units.`);
  return { rows, issues };
}

/** The project with the accepted facts applied; area totals follow the work type as the project form does. */
export function applyRfpFacts(project: Project, facts: RfpFact[]): Project {
  const changes: Record<string, unknown> = {};
  for (const f of facts) changes[f.field] = f.value;
  return normalizeProject({ ...project, ...changes } as unknown as Record<string, unknown>);
}

// Everything the RFP asks for, as one list (Marcel's process doc: "Area to upload RFP, divides list of requirements
// into one comprehensive list of items that are required on the job. Includes all major items as well such as saivings
// clause, subcontractor qualifications, even items to be submitted before winning the contract."). The AI lists them
// from the RFP and its addenda, each with the page and words it comes from (lib/ai-jobs-more "rfp-requirements"); each
// team then follows its own: Contracts the rules that apply, Marketing what the response must hold, Preconstruction the
// costs to include. A later reading keeps what people recorded and flags what it no longer finds. Pure.

import { normalizeFact } from "./rfp";

export const REQUIREMENT_GROUPS = ["Proposal submission", "Contract & legal", "Subcontractors & participation", "Costs to include", "Schedule & deadlines", "Job requirements"] as const;
export type RequirementGroup = (typeof REQUIREMENT_GROUPS)[number];
export const REQUIREMENT_TEAMS = ["Contracts", "Marketing", "Preconstruction"] as const;
export type RequirementTeam = (typeof REQUIREMENT_TEAMS)[number];
export const REQUIREMENT_STATUSES = [{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "na", label: "Not applicable" }] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]["value"];

/** Who reads each group first (the process doc's RFP review); a person can hand any line to another team. */
export const TEAM_FOR_GROUP: Record<RequirementGroup, RequirementTeam> = {
  "Proposal submission": "Marketing", "Contract & legal": "Contracts", "Subcontractors & participation": "Contracts",
  "Costs to include": "Preconstruction", "Schedule & deadlines": "Preconstruction", "Job requirements": "Preconstruction",
};

export type FoundRequirement = { text: string; group: RequirementGroup; due: string | null; page: number; quote: string };
export type RfpRequirement = FoundRequirement & {
  id: string; team: RequirementTeam; status: RequirementStatus; note: string; origin: "ai" | "manual";
  /** The file it was read from, and the revisions of that file; empty for a line added by hand. */
  docId: string; docName: string; series: string;
  /** The latest full reading of its file no longer finds it. */
  missing: boolean;
};
/** One reading of a file. `failedPages` were not read, so that reading flagged nothing as missing. */
export type RequirementReading = { docId: string; docName: string; model: string; at: string; pages: number; failedPages: number; capped: boolean; cost: number | null };
export type RequirementsState = { items: RfpRequirement[]; readings: RequirementReading[] };
export const EMPTY_REQUIREMENTS: RequirementsState = { items: [], readings: [] };
export const REQUIREMENTS_KEY = "rfp-requirements";

/** How much of a file is read, and how many pages go in one request, so one answer has room for every line on them. */
export const MAX_REQUIREMENT_PAGES = 150, REQUIREMENT_BATCH_PAGES = 8;

const squeeze = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
/** The same wording gets the same id in every browser, so two readings merge in the shared copy instead of doubling. */
const idOf = (text: string) => {
  let hash = 2166136261;
  for (const c of squeeze(text)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `req-${(hash >>> 0).toString(36)}`;
};

export const requirementBatches = <T,>(pages: T[], size = REQUIREMENT_BATCH_PAGES): T[][] =>
  Array.from({ length: Math.ceil(pages.length / size) }, (_, i) => pages.slice(i * size, (i + 1) * size));

/** What survives of the AI's answer: a known group, once each, with its quote on the page it cites. A due date stays
 * only when the quote holds its day; the requirement stands without it. */
export function screenRequirements(output: unknown, pages: { page: number; text: string }[]): FoundRequirement[] {
  const list = (output as { requirements?: unknown })?.requirements, seen = new Set<string>();
  return (Array.isArray(list) ? list : []).slice(0, 200).flatMap(entry => {
    const o = (entry ?? {}) as Record<string, unknown>;
    const text = clean(o.text, 300), quote = clean(o.quote, 500), page = Number(o.page);
    const group = REQUIREMENT_GROUPS.find(g => g === o.group), source = pages.find(p => p.page === page);
    if (!text || !group || !source || squeeze(quote).length < 6 || !squeeze(source.text).includes(squeeze(quote)) || seen.has(squeeze(text))) return [];
    seen.add(squeeze(text));
    const date = o.due === null || o.due === undefined ? null : normalizeFact("due", o.due);
    const due = typeof date === "string" && new RegExp(`(^|\\D)0?${Number(date.slice(8))}(\\D|$)`).test(quote) ? date : null;
    return [{ text, group, due, page, quote }];
  });
}

/** Puts one reading of a file in the list. A line found again keeps its team, status and note and takes its new page;
 * a new one starts open with its group's team. After a full reading, lines of that file it didn't find are flagged
 * (a dropped requirement, or the AI missing it: a person decides), never removed. */
export function mergeReading(state: RequirementsState, doc: { id: string; name: string; series: string }, found: FoundRequirement[], reading: Pick<RequirementReading, "model" | "at" | "pages" | "failedPages" | "capped" | "cost">): { state: RequirementsState; added: number; kept: number; missing: number } {
  const items = [...state.items], taken = new Set<string>();
  let added = 0, kept = 0;
  for (const line of found) {
    const text = squeeze(line.text), quote = squeeze(line.quote);
    const match = items.find(i => !taken.has(i.id) && squeeze(i.text) === text)
      ?? items.find(i => !taken.has(i.id) && i.origin === "ai" && i.series === doc.series && squeeze(i.quote) === quote);
    if (match) {
      // The same wording seen twice in this reading, or repeated by another file, stays one line where it first came from.
      taken.add(match.id);
      kept++;
      if (match.series === doc.series) items[items.indexOf(match)] = { ...match, docId: doc.id, docName: doc.name, page: line.page, quote: line.quote, due: line.due ?? match.due, missing: false };
      continue;
    }
    if (items.some(i => squeeze(i.text) === text)) continue;
    const item: RfpRequirement = { ...line, id: idOf(line.text), team: TEAM_FOR_GROUP[line.group], status: "open", note: "", origin: "ai", docId: doc.id, docName: doc.name, series: doc.series, missing: false };
    items.push(item);
    taken.add(item.id);
    added++;
  }
  let missing = 0;
  const flagged = items.map(i => {
    if (reading.failedPages > 0 || i.origin !== "ai" || i.series !== doc.series || taken.has(i.id) || i.status === "na") return i;
    missing++;
    return { ...i, missing: true };
  });
  return { state: { items: flagged, readings: [...state.readings.filter(r => r.docId !== doc.id), { docId: doc.id, docName: doc.name, ...reading }] }, added, kept, missing };
}

/** The newest revisions not read yet, oldest upload first. */
export const unreadFiles = <T extends { id: string; uploadedAt: string }>(files: T[], state: RequirementsState): T[] =>
  files.filter(f => !state.readings.some(r => r.docId === f.id)).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

/** Adds a line by hand; throws when it has no words or is already on the list. */
export function addRequirement(state: RequirementsState, input: { text: string; group: RequirementGroup; team?: RequirementTeam; due?: string | null }): RequirementsState {
  const text = clean(input.text, 300);
  if (!text) throw new Error("Write the requirement.");
  if (state.items.some(i => squeeze(i.text) === squeeze(text))) throw new Error("That requirement is already on the list.");
  return { ...state, items: [...state.items, { text, group: input.group, due: input.due || null, page: 0, quote: "", id: idOf(text), team: input.team ?? TEAM_FOR_GROUP[input.group], status: "open", note: "", origin: "manual", docId: "", docName: "", series: "", missing: false }] };
}

export function updateRequirement(state: RequirementsState, id: string, patch: Partial<Pick<RfpRequirement, "team" | "status" | "note" | "due">>): RequirementsState {
  return { ...state, items: state.items.map(i => i.id === id ? { ...i, ...patch } : i) };
}

/** Only a line added by hand, or one its file no longer holds: the AI's lines are marked Not applicable, so the record stays. */
export const canRemove = (item: RfpRequirement) => item.origin === "manual" || item.missing;
export function removeRequirement(state: RequirementsState, id: string): RequirementsState {
  return { ...state, items: state.items.filter(i => i.id !== id || !canRemove(i)) };
}

export type RequirementFilter = { query?: string; team?: RequirementTeam | ""; status?: RequirementStatus | "missing" | "" };
export function filterRequirements(items: RfpRequirement[], { query = "", team = "", status = "" }: RequirementFilter): RfpRequirement[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(i => (!team || i.team === team)
    && (!status || (status === "missing" ? i.missing : i.status === status))
    && words.every(w => `${i.text} ${i.quote} ${i.note} ${i.docName}`.toLowerCase().includes(w)));
}

/** The list by group, in the order a reader goes through it: by file and page, hand-added lines last. */
export function requirementsByGroup(items: RfpRequirement[]): { group: RequirementGroup; items: RfpRequirement[]; open: number }[] {
  return REQUIREMENT_GROUPS.map(group => {
    const lines = items.filter(i => i.group === group).sort((a, b) => Number(!a.docId) - Number(!b.docId) || a.docName.localeCompare(b.docName) || a.page - b.page);
    return { group, items: lines, open: lines.filter(i => i.status === "open").length };
  }).filter(g => g.items.length);
}

export function requirementSummary(items: RfpRequirement[], today: string) {
  const count = (test: (i: RfpRequirement) => boolean) => items.filter(test).length;
  return {
    total: items.length, open: count(i => i.status === "open"), done: count(i => i.status === "done"), na: count(i => i.status === "na"), missing: count(i => i.missing),
    overdue: count(i => i.status === "open" && !!i.due && i.due < today),
    teams: REQUIREMENT_TEAMS.map(team => ({ team, open: count(i => i.team === team && i.status === "open"), total: count(i => i.team === team) })),
  };
}

export function requirementRows(items: RfpRequirement[]): (string | number)[][] {
  const status = (i: RfpRequirement) => REQUIREMENT_STATUSES.find(s => s.value === i.status)?.label ?? i.status;
  return [["Group", "Requirement", "Team", "Due", "Status", "Note", "File", "Page", "Quote"],
    ...requirementsByGroup(items).flatMap(g => g.items.map(i => [g.group, i.text, i.team, i.due ?? "", i.missing ? `${status(i)} (not in the latest reading)` : status(i), i.note, i.docName || "Added by hand", i.page || "", i.quote]))];
}

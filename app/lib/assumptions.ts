// Assumptions and clarifications (Marcel's features list, item 35: "Called Assumptions and Clarifications or Basis of
// Estimate under preconstruction budget - Allow division leaders to list assumptions and clarifications, and read sub
// proposals to create a list of assumptions and clarifications for every trade that is then lumped into one major
// document that shows all list of assumptions and clarifications").
//
// Per trade package: what the team assumes and clarifies, typed by the division leader, and items taken from the
// subcontractors' proposals (their clarifications and exclusions, as submitted in the bid portal). Nothing is invented:
// a proposal's line is copied word for word and keeps where it came from. Stored per project under "assumptions".
// Pure; the screen renders the trades and the document.

import { possessive } from "./format";

export type AssumptionKind = "assumption" | "clarification";
export const ASSUMPTION_KINDS: { value: AssumptionKind; label: string; plural: string }[] = [
  { value: "assumption", label: "Assumption", plural: "Assumptions" },
  { value: "clarification", label: "Clarification", plural: "Clarifications" },
];
/** Where an item came from: typed by the team, or copied from a subcontractor's proposal. */
export type AssumptionSource = { type: "team" } | { type: "proposal"; submissionId: string; revision: number; company: string; from: "clarification" | "exclusion" };
export type AssumptionItem = { id: string; packageId: string; kind: AssumptionKind; text: string; source: AssumptionSource; by: string; at: string };
export type AssumptionsState = { items: AssumptionItem[] };
export const EMPTY_ASSUMPTIONS: AssumptionsState = { items: [] };

export class AssumptionRuleError extends Error {
  constructor(message: string) { super(message); this.name = "AssumptionRuleError"; }
}
const fail = (message: string): never => { throw new AssumptionRuleError(message); };
const newId = () => Math.random().toString(36).slice(2, 10);
export const MAX_ASSUMPTION_TEXT = 1000;
const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

type PackageRef = { id: string; name: string; code: string; owner: string };

function clean(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) fail("Write the assumption or clarification.");
  if (t.length > MAX_ASSUMPTION_TEXT) fail(`Keep it under ${MAX_ASSUMPTION_TEXT.toLocaleString("en-US")} characters.`);
  return t;
}

/** Adds the team's own item to a trade. The same words twice in one trade's list are refused. */
export function addAssumption(state: AssumptionsState, packages: PackageRef[], input: { packageId: string; kind: AssumptionKind; text: string; source?: AssumptionSource }, by: string, at = new Date().toISOString()): AssumptionsState {
  if (!packages.some(p => p.id === input.packageId)) fail("Choose a trade package.");
  if (!ASSUMPTION_KINDS.some(k => k.value === input.kind)) fail("Choose assumption or clarification.");
  const text = clean(input.text);
  if (state.items.some(i => i.packageId === input.packageId && same(i.text, text))) fail("That's already on this trade's list.");
  return { items: [...state.items, { id: newId(), packageId: input.packageId, kind: input.kind, text, source: input.source ?? { type: "team" }, by: by.trim() || "Team", at }] };
}

/** Changes an item's words or kind. A proposal's item keeps its source, so the document still says where it came from. */
export function editAssumption(state: AssumptionsState, id: string, patch: { kind?: AssumptionKind; text?: string }, by: string, at = new Date().toISOString()): AssumptionsState {
  const item = state.items.find(i => i.id === id) ?? fail("That item no longer exists.");
  const text = patch.text === undefined ? item.text : clean(patch.text);
  if (patch.kind !== undefined && !ASSUMPTION_KINDS.some(k => k.value === patch.kind)) fail("Choose assumption or clarification.");
  if (state.items.some(i => i.id !== id && i.packageId === item.packageId && same(i.text, text))) fail("That's already on this trade's list.");
  return { items: state.items.map(i => i.id === id ? { ...i, kind: patch.kind ?? i.kind, text, by: by.trim() || i.by, at } : i) };
}

export const removeAssumption = (state: AssumptionsState, id: string): AssumptionsState => ({ items: state.items.filter(i => i.id !== id) });

/** A bid as this reads it (lib/submissions' Submission has all of these). */
export type ProposalSubmission = { id: string; packageId: string; bidderId: string; revisions: { number: number; clarifications: string[]; exclusions: string[] }[] };
/** One subcontractor's latest proposal lines for a trade. */
export type ProposalNotes = { submissionId: string; revision: number; company: string; lines: { from: "clarification" | "exclusion"; text: string; taken: boolean }[] };

/**
 * What each subcontractor's latest submitted proposal for a trade clarifies or excludes, company by company, marking the
 * lines already on the trade's list. Proposals with neither are left out.
 */
export function proposalNotes(state: AssumptionsState, submissions: ProposalSubmission[], packageId: string, companyName: (bidderId: string) => string): ProposalNotes[] {
  const listed = state.items.filter(i => i.packageId === packageId);
  return submissions.filter(s => s.packageId === packageId && s.revisions.length).flatMap(s => {
    const latest = s.revisions[s.revisions.length - 1];
    const lines = [
      ...latest.clarifications.map(text => ({ from: "clarification" as const, text })),
      ...latest.exclusions.map(text => ({ from: "exclusion" as const, text: excludesText(text) })),
    ].filter(l => l.text.trim()).map(l => ({ ...l, taken: listed.some(i => same(i.text, l.text)) }));
    return lines.length ? [{ submissionId: s.id, revision: latest.number, company: companyName(s.bidderId), lines }] : [];
  }).sort((a, b) => a.company.localeCompare(b.company));
}

/** A proposal's exclusion as a clarification of what the price leaves out: "Excludes: permits". */
export const excludesText = (exclusion: string) => /^excl/i.test(exclusion.trim()) ? exclusion.trim() : `Excludes: ${exclusion.trim()}`;

/** Takes one proposal line onto the trade's list, word for word, as a clarification unless chosen otherwise. */
export function takeFromProposal(state: AssumptionsState, packages: PackageRef[], packageId: string, notes: ProposalNotes, line: { from: "clarification" | "exclusion"; text: string }, by: string, kind: AssumptionKind = "clarification", at = new Date().toISOString()): AssumptionsState {
  return addAssumption(state, packages, { packageId, kind, text: line.text, source: { type: "proposal", submissionId: notes.submissionId, revision: notes.revision, company: notes.company, from: line.from } }, by, at);
}

/** Takes every line of one company's proposal not yet on the list. */
export function takeAllFromProposal(state: AssumptionsState, packages: PackageRef[], packageId: string, notes: ProposalNotes, by: string, at = new Date().toISOString()): AssumptionsState {
  return notes.lines.filter(l => !l.taken).reduce((s, line) => s.items.some(i => i.packageId === packageId && same(i.text, line.text)) ? s : takeFromProposal(s, packages, packageId, notes, line, by, "clarification", at), state);
}

export type TradeAssumptions = { packageId: string; trade: string; code: string; owner: string; assumptions: AssumptionItem[]; clarifications: AssumptionItem[] };

/** Every trade with items, in CSI order: the "one major document" Marcel asked for, as sections. */
export function assumptionsByTrade(state: AssumptionsState, packages: PackageRef[]): TradeAssumptions[] {
  return packages.map(p => {
    const mine = state.items.filter(i => i.packageId === p.id);
    return { packageId: p.id, trade: p.name, code: p.code, owner: p.owner, assumptions: mine.filter(i => i.kind === "assumption"), clarifications: mine.filter(i => i.kind === "clarification") };
  }).filter(t => t.assumptions.length || t.clarifications.length)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.trade.localeCompare(b.trade));
}

/** Where an item came from, in words for the document. */
export const sourceText = (item: AssumptionItem): string => item.source.type === "proposal" ? `from ${possessive(item.source.company)} proposal (V${item.source.revision})` : "";

/** The whole document as Markdown: one section per trade, assumptions then clarifications. */
export function assumptionsMarkdown(projectName: string, trades: TradeAssumptions[], date: string): string {
  const list = (items: AssumptionItem[]) => items.map(i => `- ${i.text}${i.source.type === "proposal" ? ` _(${sourceText(i)})_` : ""}`).join("\n");
  return [
    `# Assumptions and clarifications: ${projectName}`, `Prepared ${date}.`,
    ...trades.map(t => [`## ${t.code ? `${t.code} ` : ""}${t.trade}`, t.assumptions.length ? `### Assumptions\n\n${list(t.assumptions)}` : "", t.clarifications.length ? `### Clarifications\n\n${list(t.clarifications)}` : ""].filter(Boolean).join("\n\n")),
  ].join("\n\n");
}

// Section coverage (Close the gap, part 2, 20 Oct): every specification section against the trades, so
// work no bid form carries (firestopping, blocking, toilet accessories…) and work two trades both carry
// are found before bids, not as change orders. Built from what the project already holds: the manual's
// sections, the trade packages (sectionsByTrade gives a section its expected trade) and the bid-form
// lines that cite a section in their source. Pure; assigning goes through procurement addScope.
//
// What it does not claim: an unassigned section is a question for the estimator, not a confirmed
// omission; a whole section is not always one owner (supply, install and firestopping can be different
// trades), so a split is a recorded decision, and so is "not applicable", with a reason.

import type { StoredSection } from "./project-files";
import { STANDARD_TRADES, addScope, type Procurement } from "./procurement";
import { sectionsByTrade } from "./project-scopes";

/**
 * - unassigned: no bid-form line cites it and no trade package covers its division
 * - expected: a package covers its division (a suggestion), but no line cites it yet
 * - multiple: lines in two or more trades cite it, with no split recorded (two subs may price it)
 * - draft: one trade's lines cite it, none of them approved yet
 * - approved: one trade carries it in an approved line
 * - split: two or more trades carry it under a recorded split of the work
 * - not-applicable: recorded as not applicable to this project, with a reason
 */
export type CoverageStatus = "unassigned" | "multiple" | "expected" | "draft" | "approved" | "split" | "not-applicable";
const ORDER: CoverageStatus[] = ["unassigned", "multiple", "expected", "draft", "approved", "split", "not-applicable"];

export type CoverageDecision =
  | { section: string; kind: "not-applicable"; reason: string; by: string; at: string }
  | { section: string; kind: "split"; parts: { packageId: string; portion: string }[]; by: string; at: string };
/** Decisions by section code; saved per project. */
export type CoverageDecisions = Record<string, CoverageDecision>;

export type CoverageRow = {
  section: string; title: string; first: number; last: number;
  /** The manual these pages are in, so the screen can open the section at its source. */
  source: { documentId: string; name: string; revision: number } | null;
  /** Suggestions only: the package covering its division, else the standard trade that usually does. */
  expected: string | null;
  suggest: { id: string; name: string; code: string } | null;
  /** Trades whose bid-form lines cite the section; `published` = the trade's issued bid form cites it. */
  carriedBy: { packageId: string; scopes: { id: string; title: string; approved: boolean }[]; published: boolean }[];
  decision: CoverageDecision | null;
  status: CoverageStatus;
  note: string;
  /** A decision that no longer matches the bid forms (a split trade without a line, or lines still citing a not-applicable section). */
  conflict: string | null;
};

const sectionCodes = (source: string) => [...source.matchAll(/\b(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?\b/g)].map(m => `${m[1]} ${m[2]} ${m[3]}${m[4] ? `.${m[4]}` : ""}`);
/** A line cites a section by its exact code, or by its parent: "10 14 23" carries 10 14 23.16. */
const cites = (source: string, section: string) => sectionCodes(source).some(code => code === section || section.startsWith(`${code}.`));
export class CoverageRuleError extends Error {
  constructor(message: string) { super(message); this.name = "CoverageRuleError"; }
}
const fail = (message: string): never => { throw new CoverageRuleError(message); };

/** One row per manual section outside Divisions 00/01 (General carries those); the open questions first. */
export function sectionCoverage(
  input: { sections: StoredSection[]; manual?: { id: string; name: string; revision: number } | null },
  procurement: Procurement, decisions: CoverageDecisions = {},
): { rows: CoverageRow[]; counts: Record<CoverageStatus, number> } {
  const expectedBy = new Map<string, string>();
  for (const [packageId, list] of sectionsByTrade(input.sections, procurement.packages)) for (const s of list) expectedBy.set(s.section, packageId);
  const name = (id: string) => procurement.packages.find(p => p.id === id)?.name ?? id;
  const lines = procurement.scopes.filter(scope => !scope.allTrades);
  const source = input.manual ? { documentId: input.manual.id, name: input.manual.name, revision: input.manual.revision } : null;

  const rows = input.sections.filter(s => !/^0[01]/.test(s.section)).map((s): CoverageRow => {
    const expected = expectedBy.get(s.section) ?? null;
    const standard = expected ? null : [...sectionsByTrade([s], STANDARD_TRADES.map(t => ({ ...t, division: t.code.slice(0, 2) })))].find(([, list]) => list.length)?.[0];
    const suggest = STANDARD_TRADES.find(t => t.id === standard) ?? null;
    const citing = new Map<string, { id: string; title: string; approved: boolean }[]>();
    for (const l of lines) if (cites(l.source, s.section)) citing.set(l.packageId, [...(citing.get(l.packageId) ?? []), { id: l.id, title: l.title, approved: l.status === "approved" }]);
    const carriedBy = [...citing.entries()].map(([packageId, scopes]) => ({
      packageId, scopes, published: !!procurement.packages.find(p => p.id === packageId)?.published?.items.some(i => cites(i.source, s.section)),
    }));
    const trades = carriedBy.map(c => c.packageId), decision = decisions[s.section] ?? null;
    let status: CoverageStatus, note: string, conflict: string | null = null;
    if (decision?.kind === "not-applicable") {
      [status, note] = ["not-applicable", `Not applicable: ${decision.reason} (${decision.by}, ${decision.at.slice(0, 10)}).`];
      if (trades.length) conflict = `${trades.map(name).join(" and ")} still cite${trades.length === 1 ? "s" : ""} it in the bid form.`;
    } else if (decision?.kind === "split") {
      [status, note] = ["split", `Split: ${decision.parts.map(p => `${name(p.packageId)}: ${p.portion}`).join("; ")}.`];
      const missing = decision.parts.filter(p => !trades.includes(p.packageId)).map(p => name(p.packageId));
      const extra = trades.filter(t => !decision.parts.some(p => p.packageId === t)).map(name);
      conflict = [missing.length ? `No ${missing.join(" or ")} bid-form line cites it yet.` : "", extra.length ? `${extra.join(" and ")} also cite${extra.length === 1 ? "s" : ""} it, outside the split.` : ""].filter(Boolean).join(" ") || null;
    } else if (trades.length > 1) {
      [status, note] = ["multiple", `Cited by ${trades.map(name).join(" and ")}: two subs may price it. Keep it in one trade, or record how the work is split.`];
    } else if (trades.length === 1) {
      const approved = carriedBy[0].scopes.some(x => x.approved);
      [status, note] = approved ? ["approved", `Carried by ${name(trades[0])}.`] : ["draft", `In a draft ${name(trades[0])} line, not approved yet.`];
    } else if (expected) {
      [status, note] = ["expected", `Its division is ${name(expected)}'s, but no bid-form line cites it yet.`];
    } else {
      [status, note] = ["unassigned", `No bid form cites it and no trade covers its division. Check whether it applies, then assign it${suggest ? ` (usually ${suggest.name})` : ""}, split it or mark it not applicable.`];
    }
    return { section: s.section, title: s.title, first: s.first, last: s.last, source, expected, suggest, carriedBy, decision, status, note, conflict };
  });
  rows.sort((a, b) => Number(!a.conflict) - Number(!b.conflict) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.section.localeCompare(b.section));
  const counts = Object.fromEntries(ORDER.map(k => [k, 0])) as Record<CoverageStatus, number>;
  for (const r of rows) counts[r.status]++;
  return { rows, counts };
}

/**
 * Gives a section to a trade: a draft bid-form line citing the section and its pages, reviewed like any
 * other line. Repeating it does nothing (the trade already has a line citing the section). It never
 * changes an issued bid form or an Exhibit A; see `assignmentWarnings`.
 */
export function assignSection(state: Procurement, row: Pick<CoverageRow, "section" | "title" | "first" | "last">, packageId: string, by: string, at?: string): Procurement {
  if (state.scopes.some(s => s.packageId === packageId && !s.allTrades && cites(s.source, row.section))) return state;
  const pages = row.first === row.last ? `p. ${row.first}` : `pp. ${row.first}–${row.last}`;
  return addScope(state, { packageId, title: `${row.title} (Section ${row.section})`, detail: "Provide the work of this specification section.", source: `${row.section} · manual ${pages}`, origin: "specification" }, by, at);
}

/** What assigning to a trade affects, to show before the estimator confirms. */
export function assignmentWarnings(state: Procurement, packageId: string, opts: { awarded?: boolean } = {}): string[] {
  const pkg = state.packages.find(p => p.id === packageId) ?? fail("That trade package no longer exists.");
  return [
    pkg.published ? `${pkg.name}'s bid form is published (version ${pkg.published.version}). This adds a draft line; the issued form stays as it is until you republish, and bids on the older version will then need resubmitting.` : "",
    opts.awarded ? `${pkg.name} is already awarded. Its Exhibit A does not change; agree any added work with the subcontractor separately.` : "",
  ].filter(Boolean);
}

export function markNotApplicable(decisions: CoverageDecisions, section: string, reason: string, by: string, at: string): CoverageDecisions {
  const why = String(reason ?? "").trim().slice(0, 500);
  if (why.length < 3) fail("Say why this section does not apply to the project.");
  return { ...decisions, [section]: { section, kind: "not-applicable", reason: why, by, at } };
}

/** Records how two or more trades share a section's work, each with its portion (supply, install, firestopping…). */
export function recordSplit(decisions: CoverageDecisions, procurement: Procurement, section: string, parts: { packageId: string; portion: string }[], by: string, at: string): CoverageDecisions {
  const clean = parts.map(p => ({ packageId: p.packageId, portion: String(p.portion ?? "").trim().slice(0, 200) }));
  if (clean.length < 2 || new Set(clean.map(p => p.packageId)).size !== clean.length) fail("A split needs two or more different trades.");
  for (const p of clean) {
    if (!procurement.packages.some(k => k.id === p.packageId)) fail("A trade in the split no longer exists.");
    if (!p.portion) fail("Describe each trade's part of the work.");
  }
  return { ...decisions, [section]: { section, kind: "split", parts: clean, by, at } };
}

export function clearDecision(decisions: CoverageDecisions, section: string): CoverageDecisions {
  if (!decisions[section]) return decisions;
  const { [section]: _, ...rest } = decisions;
  return rest;
}

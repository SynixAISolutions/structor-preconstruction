// The contractor's standard scope under every trade (Marcel's issues log, item 17, 18 Nov: "See general scope for every
// single trade under templates - general scopes - we should have the general language be under every trade for every
// single project, this is different than the section you have for general language already in the software").
//
// MCN's per-trade scope checklists are already in the AI memory (lib/scope-checklist, approved 24 Nov), but a scan only
// writes a checklist line where the project's pages call for it (lib/memory-check). This is the other half Marcel asked
// for: the trade's checklist as printed, put on its bid form on any project, every line once, whatever the drawings say.
// The lines become ordinary scope items, so they publish, export and reach the subcontractor portal like any other; the
// estimator edits or removes them per project. Pure: the browser loads the trade's entries (lib/memory-client).

import { isChecklistEntry, needsFilling } from "./scope-checklist";
import { tradeTags, type MemoryEntry } from "./memory";
import { addScope, type Procurement, type ScopeItem, type TradePackage } from "./procurement";

/** How a standard line is marked on the bid form: `Standard scope · 09A Drywall and ACT`. */
export const STANDARD_SOURCE = "Standard scope";

/**
 * One line of a trade's checklist. `own`: it comes from the trade's own checklist (see ownChecklists), not another one
 * from the same division. `fillIn`: it has blanks or a condition ("within ___ weeks", "[AS APPLICABLE]") that only this
 * project can settle, so it goes on the form as a draft for the estimator to complete.
 */
export type StandardLine = { key: string; title: string; detail: string; section: "includes" | "excludes"; order: number; checklist: string; own: boolean; fillIn: boolean };

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const ORDER = /^checklist:[^:]*:[^:]*:(includes|excludes):(\d+)$/;
/** A checklist exclusion is stored as a rule: "Drywall doesn't carry: Painting of gypsum board." */
const DOESNT_CARRY = /^.*?\bdoesn['’]t carry:\s*/i;

/** A trade or checklist name for comparing: "Doors, frames & hardware" → "doors frames hardware". */
const words = (s: string) => norm(s).replace(/\b(and|of|the|for)\b/g, " ").replace(/\s+/g, " ").trim();
/** "03A Concrete" → "concrete": a checklist's own name, without its code. */
const ownName = (checklist: string) => words(checklist.replace(/^\s*\d{2}[a-z]?\b/i, ""));

/**
 * Which of the checklists matched to a trade are the trade's own. The checklist import tags every checklist in a
 * division with the division's trade as well as its own name (Danial, 27 Nov, on the preview: Concrete matched 03A
 * Concrete but also both 03B precast checklists and 03E playground surfacing). The trade's own: a checklist named as
 * the trade ("03A Concrete"); else those whose name holds the trade's or is held in it ("04A Unit Masonry" and "04J
 * Masonry Cleaning and Restoration" for Masonry, "07D Waterproofing" for "Waterproofing, air barrier & joint
 * sealants"); else, when no name says, all of them (Site concrete's only checklist is "02F Curbs, Gutters and Walks").
 */
export function ownChecklists(trade: string, checklists: string[]): Set<string> {
  const name = words(trade);
  const holds = (a: string, b: string) => !!a && !!b && ` ${a} `.includes(` ${b} `);
  const exact = checklists.filter(c => !!name && ownName(c) === name);
  if (exact.length) return new Set(exact);
  const near = checklists.filter(c => holds(ownName(c), name) || holds(name, ownName(c)));
  return new Set(near.length ? near : checklists);
}

/** The trade's own checklists first, then by checklist; in each, what the trade carries, then its exclusions, as printed. */
const byChecklist = (a: StandardLine, b: StandardLine) => Number(b.own) - Number(a.own) || a.checklist.localeCompare(b.checklist)
  || (a.section === b.section ? 0 : a.section === "includes" ? -1 : 1) || a.order - b.order;

/**
 * The trade's standard lines: from the contractor's scope checklists in the memory, company-wide and approved, matched
 * to the package by its code or name (as scans match them), as printed and in order, by checklist, the trade's own
 * first. A wording that repeats (two checklists, a bid sheet line with the same words) is listed once, under the
 * trade's own checklist when that has it.
 */
export function standardScopeFor(pkg: Pick<TradePackage, "code" | "name">, entries: MemoryEntry[]): StandardLine[] {
  const tags = new Set(tradeTags(pkg));
  const found = entries.filter(e => e.status === "approved" && e.projectId === null && isChecklistEntry(e) && e.trades.some(t => tags.has(t)));
  const own = ownChecklists(pkg.name, [...new Set(found.map(e => e.source.checklist ?? ""))]);
  const lines = found.map((e): StandardLine => {
    const section = e.kind === "rule" ? "excludes" : "includes";
    const text = section === "excludes" ? e.text.replace(DOESNT_CARRY, "") : e.text;
    const title = section === "excludes" ? `Excluded: ${text}` : text;
    const order = e.events.map(x => x.match(ORDER)).find(m => m && m[1] === section);
    const checklist = e.source.checklist ?? "";
    // Blanks and conditions as the checklist import reads them (lib/scope-checklist needsFilling), in the line or its sub-items.
    const fillIn = needsFilling(text) || (!!e.detail && needsFilling(e.detail));
    return { key: norm(title), title, detail: e.detail, section, order: order ? Number(order[2]) : Number.MAX_SAFE_INTEGER, checklist, own: own.has(checklist), fillIn };
  }).sort(byChecklist);
  const seen = new Set<string>();
  return lines.filter(l => { if (!l.key || seen.has(l.key)) return false; seen.add(l.key); return true; });
}

/** The lines a trade gets unless the estimator picks otherwise: its own checklists'. */
export const defaultStandard = (lines: StandardLine[]): StandardLine[] => lines.filter(l => l.own);

export type ChecklistGroup = { checklist: string; own: boolean; lines: StandardLine[] };
/** The trade's standard lines by checklist, in the order standardScopeFor gives (its own checklists first). */
export function checklistGroups(lines: StandardLine[]): ChecklistGroup[] {
  const groups = new Map<string, ChecklistGroup>();
  for (const l of lines) {
    const g = groups.get(l.checklist) ?? { checklist: l.checklist, own: l.own, lines: [] };
    g.lines.push(l);
    groups.set(l.checklist, g);
  }
  return [...groups.values()];
}

/** The standard lines already on a package's bid form. */
export const standardOnForm = (state: Pick<Procurement, "scopes">, packageId: string): ScopeItem[] =>
  state.scopes.filter(s => s.packageId === packageId && !s.allTrades && s.source.startsWith(`${STANDARD_SOURCE} ·`));

/** The trade's standard lines not on its bid form yet (a line with the same wording counts as there, however it got there). */
export function missingStandard(state: Pick<Procurement, "scopes">, packageId: string, lines: StandardLine[]): StandardLine[] {
  const have = new Set(state.scopes.filter(s => s.packageId === packageId && !s.allTrades).map(s => norm(s.title)));
  return lines.filter(l => !have.has(l.key));
}

/**
 * Puts the trade's missing standard lines on its bid form. They're the contractor's own wording, so they're approved
 * at once, except fill-in lines, which stay drafts until this project's value is written. Returns how many were added.
 */
export function addStandardScope(state: Procurement, packageId: string, lines: StandardLine[], by: string, at = new Date().toISOString()): { state: Procurement; added: number } {
  let next = state, added = 0;
  for (const line of missingStandard(state, packageId, lines)) {
    next = addScope(next, { packageId, title: line.title, detail: line.detail, source: `${STANDARD_SOURCE} · ${line.checklist || "checklist"}`, origin: "estimator" }, by, at);
    if (!line.fillIn) {
      const id = next.scopes.at(-1)!.id;
      next = { ...next, scopes: next.scopes.map(s => s.id === id ? { ...s, status: "approved" as const, history: [...s.history, { kind: "approved" as const, at, by }] } : s) };
    }
    added++;
  }
  return { state: next, added };
}

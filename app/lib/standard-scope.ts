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
 * One line of a trade's checklist. `fillIn`: it has blanks or a condition ("within ___ weeks", "[AS APPLICABLE]") that
 * only this project can settle, so it goes on the form as a draft for the estimator to complete.
 */
export type StandardLine = { key: string; title: string; detail: string; section: "includes" | "excludes"; order: number; checklist: string; fillIn: boolean };

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const ORDER = /^checklist:[^:]*:[^:]*:(includes|excludes):(\d+)$/;
/** A checklist exclusion is stored as a rule: "Drywall doesn't carry: Painting of gypsum board." */
const DOESNT_CARRY = /^.*?\bdoesn['’]t carry:\s*/i;

/**
 * The trade's standard lines: from the contractor's scope checklists in the memory, company-wide and approved, matched
 * to the package by its code or name (as scans match them), as printed and in order, what the trade carries first and
 * its exclusions after. A wording that repeats (two checklists, a bid sheet line with the same words) is listed once.
 */
export function standardScopeFor(pkg: Pick<TradePackage, "code" | "name">, entries: MemoryEntry[]): StandardLine[] {
  const tags = new Set(tradeTags(pkg));
  const seen = new Set<string>();
  const lines: StandardLine[] = [];
  for (const e of entries) {
    if (e.status !== "approved" || e.projectId !== null || !isChecklistEntry(e) || !e.trades.some(t => tags.has(t))) continue;
    const section = e.kind === "rule" ? "excludes" : "includes";
    const text = section === "excludes" ? e.text.replace(DOESNT_CARRY, "") : e.text;
    const title = section === "excludes" ? `Excluded: ${text}` : text;
    const key = norm(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const order = e.events.map(x => x.match(ORDER)).find(m => m && m[1] === section);
    // Blanks and conditions as the checklist import reads them (lib/scope-checklist needsFilling), in the line or its sub-items.
    const fillIn = needsFilling(text) || (!!e.detail && needsFilling(e.detail));
    lines.push({ key, title, detail: e.detail, section, order: order ? Number(order[2]) : Number.MAX_SAFE_INTEGER, checklist: e.source.checklist ?? "", fillIn });
  }
  return lines.sort((a, b) => (a.section === b.section ? 0 : a.section === "includes" ? -1 : 1) || a.checklist.localeCompare(b.checklist) || a.order - b.order);
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

// A trade's general scope (Marcel, 18 Nov meeting): "we need to have tabs here, one called detailed scope tab ... and one
// other tab called general scope", written the way his bid forms are: "very general, summarized" — his Whittier demolition
// form reads "asbestos abatement, historic building selective demolition, 1930s building full raze including foundation,
// trench cutting, removing windows ... site demolition", where the app lists "remove aluminum windows, frames, and sashes"
// again and again. The detailed items stay (he wants them for the subcontractors and for quantities); the AI lumps them
// into a few general lines, each saying which detailed items it covers, so nothing is lost and nothing invented.
// Kept on the trade package (TradePackage.general). Pure; the AI job is "general-scope" (lib/ai-jobs-more).

import type { Procurement, ScopeItem, TradePackage } from "./procurement";

export type GeneralLine = { id: string; text: string; /** The detailed scope items (ids) this line covers. */ members: string[]; /** Changed by hand since the AI wrote it. */ edited?: boolean };
export type GeneralScope = { lines: GeneralLine[]; /** The detailed items it was written from (generalBasis), to tell when it's out of date. */ basis: string; at: string; by: string; model: string };

/** The AI's input: the trade and its detailed items, numbered from 0 (the answer refers to them by number). */
export type GeneralScopeInput = { trade: string; code: string; items: { title: string; detail: string }[] };
// 19 Nov, tried live on Whittier's selective demolition (62 items): asked only to "stay general", the AI wrote 15 long
// sentences ("... the flagged door and frame at D.4.1, which must be measured and documented and held for architect
// approval before removal"). The prompt now asks for headings of at most 10 words and at most 10 lines; 12 is the hard cap.
export const GENERAL_MAX_ITEMS = 400, GENERAL_MAX_LINES = 12;

/** The detailed items a general scope is written from: the trade's own (not the all-trades ones, which are the General section). */
export const generalItems = (state: Pick<Procurement, "scopes">, packageId: string): ScopeItem[] =>
  state.scopes.filter(s => s.packageId === packageId && !s.allTrades);

/** A short fingerprint of the items, by id and words: a general scope written from other items is out of date. */
export function generalBasis(items: Pick<ScopeItem, "id" | "title">[]): string {
  let h = 2166136261;
  for (const ch of items.map(i => `${i.id}:${i.title}`).sort().join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `${items.length}:${h.toString(36)}`;
}

export function generalScopeInput(pkg: Pick<TradePackage, "name" | "code">, items: Pick<ScopeItem, "title" | "detail">[]): GeneralScopeInput {
  return { trade: pkg.name, code: pkg.code, items: items.slice(0, GENERAL_MAX_ITEMS).map(i => ({ title: i.title, detail: i.detail })) };
}

const newId = () => Math.random().toString(36).slice(2, 10);
const clean = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 400);

/**
 * The AI's lines on the package: each line's members (item numbers) become item ids; lines with no words or no item are
 * left out, and an item claimed twice stays with the first line. Replaces the package's general scope.
 */
export function applyGeneralScope(state: Procurement, packageId: string, lines: { text: string; members: number[] }[], model: string, by: string, at = new Date().toISOString()): Procurement {
  const items = generalItems(state, packageId).slice(0, GENERAL_MAX_ITEMS), used = new Set<number>();
  const out: GeneralLine[] = [];
  for (const line of lines.slice(0, GENERAL_MAX_LINES)) {
    const text = clean(line.text ?? "");
    const members = (line.members ?? []).filter(m => Number.isInteger(m) && m >= 0 && m < items.length && !used.has(m));
    if (!text || !members.length) continue;
    members.forEach(m => used.add(m));
    out.push({ id: newId(), text, members: members.map(m => items[m].id) });
  }
  if (!out.length) throw new Error("The AI's answer had no general lines that cover this trade's items.");
  const general: GeneralScope = { lines: out, basis: generalBasis(items), at, by, model };
  return { ...state, packages: state.packages.map(p => p.id === packageId ? { ...p, general } : p) };
}

/** Whether the package's general scope was written from different detailed items than it has now. */
export const generalStale = (state: Procurement, pkg: TradePackage): boolean =>
  !!pkg.general && pkg.general.basis !== generalBasis(generalItems(state, pkg.id));

/** Detailed items no general line covers (added since, or left out by the AI). */
export const uncovered = (state: Procurement, pkg: TradePackage): ScopeItem[] => {
  const covered = new Set(pkg.general?.lines.flatMap(l => l.members) ?? []);
  return generalItems(state, pkg.id).filter(i => !covered.has(i.id));
};

function change(state: Procurement, packageId: string, apply: (g: GeneralScope) => GeneralScope): Procurement {
  const pkg = state.packages.find(p => p.id === packageId);
  if (!pkg?.general) throw new Error("This trade has no general scope yet.");
  return { ...state, packages: state.packages.map(p => p.id === packageId ? { ...p, general: apply(pkg.general!) } : p) };
}
/** Rewords a line by hand; it keeps the items it covers. */
export const editGeneralLine = (state: Procurement, packageId: string, lineId: string, text: string): Procurement => {
  const t = clean(text);
  if (!t) throw new Error("Write the line, or remove it.");
  return change(state, packageId, g => ({ ...g, lines: g.lines.map(l => l.id === lineId ? { ...l, text: t, edited: true } : l) }));
};
export const removeGeneralLine = (state: Procurement, packageId: string, lineId: string): Procurement =>
  change(state, packageId, g => ({ ...g, lines: g.lines.filter(l => l.id !== lineId) }));
/** Adds a line of the estimator's own, covering no detailed item. */
export const addGeneralLine = (state: Procurement, packageId: string, text: string): Procurement => {
  const t = clean(text);
  if (!t) throw new Error("Write the line.");
  return change(state, packageId, g => ({ ...g, lines: [...g.lines, { id: newId(), text: t, members: [], edited: true }] }));
};

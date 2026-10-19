// Revision ripple (ideas 20 Oct, #8): a new drawing revision or addendum, turned into the bid-form
// changes it implies, trade by trade. The revision comparison AI already lists what changed on each
// sheet and which trade it touches (ai-jobs-more "revision-diff"). This groups those changes by trade
// package, says which trades already have bids priced on the current form, and adds the changes to
// the trade's bid form as draft lines. Publishing the revised form is still the estimator's step; it
// raises the bid-form version, so bids priced earlier become stale (submissions isStale) and the to-do
// already asks those bidders to resubmit. Pure.

import type { RevisionChange } from "./ai-jobs-more";
import { addScope, type Procurement } from "./procurement";
import type { Submission } from "./submissions";

export type SheetChanges = { sheet: string; revision: string; changes: RevisionChange[] };
export type RippleChange = RevisionChange & { sheet: string; revision: string };
export type RippleTrade = { packageId: string; name: string; changes: RippleChange[]; published: boolean; bids: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
// ponytail: name matching plus a few common aliases; use the trade's CSI code if the diff ever returns one.
const ALIASES: Record<string, string[]> = { drywall: ["gypsum", "framing", "ceilings", "acoustical ceilings"], doors: ["openings", "hardware", "frames"], flooring: ["tile", "carpet", "resilient"], painting: ["coatings", "paint"] };

/** The package an AI trade name refers to: same name, one containing the other, or a known alias. */
export function packageForTrade(trade: string, packages: Procurement["packages"]): string | null {
  const t = norm(trade);
  if (!t) return null;
  const exact = packages.find(p => norm(p.name) === t) ?? packages.find(p => norm(p.name).includes(t) || t.includes(norm(p.name)));
  if (exact) return exact.id;
  const alias = Object.entries(ALIASES).find(([, names]) => names.some(n => t.includes(n)))?.[0];
  return packages.find(p => alias && norm(p.name).includes(alias))?.id ?? null;
}

/** The changes grouped by trade package (biggest first), with what is already priced; changes no package matches are listed apart. */
export function revisionRipple(sheets: SheetChanges[], procurement: Procurement, submissions: Submission[]): { trades: RippleTrade[]; unmatched: RippleChange[] } {
  const byPackage = new Map<string, RippleChange[]>(), unmatched: RippleChange[] = [];
  for (const { sheet, revision, changes } of sheets) for (const change of changes) {
    const id = packageForTrade(change.trade, procurement.packages);
    if (id) byPackage.set(id, [...(byPackage.get(id) ?? []), { ...change, sheet, revision }]); else unmatched.push({ ...change, sheet, revision });
  }
  const trades = [...byPackage].map(([packageId, changes]) => {
    const pkg = procurement.packages.find(p => p.id === packageId)!;
    const bids = submissions.filter(s => s.packageId === packageId && s.status !== "draft").length;
    return { packageId, name: pkg.name, changes, published: !!pkg.published, bids };
  }).sort((a, b) => b.changes.length - a.changes.length || a.name.localeCompare(b.name));
  return { trades, unmatched };
}

const sourceOf = (c: RippleChange) => `${c.sheet} · ${c.revision}`;

/** Adds the trade's changes to its bid form as draft lines citing the sheet and revision; a change already there is not added twice. */
export function applyRipple(state: Procurement, trade: RippleTrade, by: string, at?: string): Procurement {
  return trade.changes.reduce((s, c) => s.scopes.some(x => x.packageId === trade.packageId && x.title === c.title && x.source === sourceOf(c)) ? s
    : addScope(s, { packageId: trade.packageId, title: c.title, detail: `${c.kind} in ${c.revision}${c.detail ? `: ${c.detail}` : ""}`, source: sourceOf(c), origin: "drawing" }, by, at), state);
}

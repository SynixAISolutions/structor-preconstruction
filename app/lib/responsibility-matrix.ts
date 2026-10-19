// The scope responsibility matrix (ideas 20 Oct, #4): every specification section against the trades,
// so work nobody carries (firestopping, blocking, access doors…) and work two trades both carry are
// found before bids, not as change orders. Built from what the project already holds: the manual's
// sections, the trade packages (sectionsByTrade gives each section its expected trade) and the bid-form
// scope lines that cite a section in their source. Pure; assigning goes through procurement addScope.

import type { StoredSection } from "./project-files";
import { STANDARD_TRADES, addScope, type Procurement } from "./procurement";
import { sectionsByTrade } from "./project-scopes";

export type MatrixStatus = "orphan" | "unwritten" | "double" | "covered";
export type MatrixRow = {
  section: string; title: string; page: number;
  /** The trade the section's CSI code points to, or null when no package covers that division. */
  expected: string | null;
  /** For an orphan: the standard trade that usually carries its division, to add as a package. */
  suggest: { id: string; name: string; code: string } | null;
  /** Trades whose bid-form lines cite the section, with those lines. */
  carriedBy: { packageId: string; scopes: { id: string; title: string }[] }[];
  status: MatrixStatus;
  note: string;
};

const sectionCodes = (source: string) => [...source.matchAll(/\b(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?\b/g)].map(m => `${m[1]} ${m[2]} ${m[3]}`);

/**
 * One row per manual section outside Divisions 00/01 (the General section carries those):
 * - orphan: no trade's division covers it and no bid-form line cites it (nobody carries it)
 * - unwritten: its expected trade exists, but no line cites it yet (the bid form may miss it)
 * - double: lines in two or more trades cite it (two subs may price it); all-trades lines don't count
 * - covered: exactly one trade's lines cite it
 * Draft and approved lines both count. Orphans first, then doubles, unwritten, covered; by section within each.
 */
export function responsibilityMatrix(sections: StoredSection[], procurement: Procurement): { rows: MatrixRow[]; counts: Record<MatrixStatus, number> } {
  const expectedBy = new Map<string, string>();
  for (const [packageId, list] of sectionsByTrade(sections, procurement.packages)) for (const s of list) expectedBy.set(s.section, packageId);
  const name = (id: string) => procurement.packages.find(p => p.id === id)?.name ?? id;
  const citing = new Map<string, Map<string, { id: string; title: string }[]>>();
  for (const scope of procurement.scopes) {
    if (scope.allTrades) continue;
    for (const code of new Set(sectionCodes(scope.source))) {
      const byPackage = citing.get(code) ?? new Map();
      byPackage.set(scope.packageId, [...(byPackage.get(scope.packageId) ?? []), { id: scope.id, title: scope.title }]);
      citing.set(code, byPackage);
    }
  }
  const rows = sections.filter(s => !/^0[01]/.test(s.section)).map((s): MatrixRow => {
    const expected = expectedBy.get(s.section) ?? null;
    const standard = expected ? null : [...sectionsByTrade([s], STANDARD_TRADES.map(t => ({ ...t, division: t.code.slice(0, 2) })))].find(([, list]) => list.length)?.[0];
    const suggest = STANDARD_TRADES.find(t => t.id === standard) ?? null;
    const carriedBy = [...(citing.get(s.section) ?? new Map()).entries()].map(([packageId, scopes]) => ({ packageId, scopes }));
    const [status, note]: [MatrixStatus, string] =
      carriedBy.length > 1 ? ["double", `Carried by ${carriedBy.map(c => name(c.packageId)).join(" and ")}: two subs may price it. Keep it in one trade.`]
      : carriedBy.length === 1 ? ["covered", `Carried by ${name(carriedBy[0].packageId)}.`]
      : expected ? ["unwritten", `${name(expected)} should carry it, but no bid-form line cites it yet.`]
      : ["orphan", `No trade carries it. ${suggest ? `Add a ${suggest.name} package, or assign it to a trade.` : "Assign it to a trade or add a package."}`];
    return { section: s.section, title: s.title, page: s.first, expected, suggest, carriedBy, status, note };
  });
  const order: MatrixStatus[] = ["orphan", "double", "unwritten", "covered"];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.section.localeCompare(b.section));
  const counts = { orphan: 0, unwritten: 0, double: 0, covered: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, counts };
}

/** Gives a section to a trade: a draft bid-form line citing the section and its page, for review like any other line. */
export function assignSection(state: Procurement, row: Pick<MatrixRow, "section" | "title" | "page">, packageId: string, by: string, at?: string): Procurement {
  return addScope(state, { packageId, title: `${row.title} (Section ${row.section})`, detail: "Provide the work of this specification section.", source: `${row.section} · manual p. ${row.page}`, origin: "specification" }, by, at);
}

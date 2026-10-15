// Which project-manual sections each trade's AI reading covers (Marcel, 15 Oct: "the AI needs to write
// the scopes for every trade from those files"). Pure: sections from the stored manual, trades from
// procurement. Division 00/01 is left to the General section, which applies to every trade.

import type { StoredSection } from "./project-files";
import type { TradePackage } from "./procurement";

const digits = (code: string) => code.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
// Work a drywall contractor carries with its own group (Marcel's "Drywall & ceilings" bid form lists
// 09 51 13 ceilings, 09 72 00 wall coverings and 09 84 33 sound-absorbing panels beside 09 2x);
// tile (09 3x) goes with flooring.
// ponytail: one affinity table for Division 09; add entries when another division splits across trades.
const AFFINITY: Record<string, string> = { "093": "096", "095": "092", "097": "092", "098": "092" };

/** Each section goes to the trade of its CSI division; when several trades share a division, the same CSI group first, then the closest code. */
export function sectionsByTrade(sections: StoredSection[], packages: Pick<TradePackage, "id" | "division" | "code">[]): Map<string, StoredSection[]> {
  const out = new Map<string, StoredSection[]>(packages.map(p => [p.id, []]));
  for (const section of sections) {
    const code = digits(section.section);
    if (code.startsWith("00") || code.startsWith("01")) continue;
    const candidates = packages.filter(p => digits(p.code).slice(0, 2) === code.slice(0, 2));
    if (!candidates.length) continue;
    const group = code.slice(0, 3);
    const inGroup = candidates.filter(p => digits(p.code).slice(0, 3) === group);
    const byAffinity = candidates.filter(p => digits(p.code).slice(0, 3) === AFFINITY[group]);
    const pool = inGroup.length ? inGroup : byAffinity.length ? byAffinity : candidates;
    const best = [...pool].sort((a, b) => Math.abs(Number(digits(a.code)) - Number(code)) - Math.abs(Number(digits(b.code)) - Number(code)))[0];
    out.get(best.id)!.push(section);
  }
  return out;
}

/** Sections no trade covers (outside Division 00/01): shown so the estimator can add a trade or move work. */
export function uncoveredSections(sections: StoredSection[], packages: Pick<TradePackage, "id" | "division" | "code">[]): StoredSection[] {
  const covered = new Set([...sectionsByTrade(sections, packages).values()].flat());
  return sections.filter(s => !covered.has(s) && !/^0[01]/.test(digits(s.section)));
}

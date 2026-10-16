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
// Which drawing sheets carry a trade's scope (15 Oct: scopes come from all the project files, the
// drawings as well as the specifications). Title keywords by CSI code, most telling first, capped
// so a trade costs a handful of vision requests.
const SHEET_RULES: [RegExp, RegExp[]][] = [
  [/^02/, [/DEMOLITION/]],
  [/^03/, [/FOUNDATION|CONCRETE/, /STRUCTURAL NOTES/]],
  [/^04/, [/MASONRY/, /EXTERIOR ELEVATIONS/, /WALL SECTIONS/]],
  [/^05/, [/STEEL/, /FRAMING PLAN/, /COLUMN|BRAC/]],
  [/^06/, [/CASEWORK/, /INTERIOR DETAILS/]],
  [/^07/, [/ROOF PLAN/, /WALL SECTIONS|EXTERIOR SECTION|MOCK-UP/]],
  [/^08/, [/DOOR/, /WINDOW|STOREFRONT|GLAZING/]],
  [/^09 [2-5]/, [/PARTITION/, /REFLECTED CEILING|CEILING DETAILS/, /^LEVEL \d+ - \w+ FLOOR PLAN/]],
  [/^09 6/, [/FINISH/]],
  [/^09 9/, [/FINISH/, /INTERIOR ELEVATIONS/]],
  [/^21/, [/FIRE PROTECTION/]],
  [/^22/, [/PLUMBING (GENERAL )?NOTES|PLUMBING SCHEDULES/, /PLUMBING PLAN/]],
  [/^23/, [/MECHANICAL (SYMBOLS|SCHEDULES)/, /HVAC PLAN|^LEVEL \d+.* PIPING PLAN/]],
  [/^26/, [/ELECTRICAL (SYMBOLS|SCHEDULES)/, /POWER PLAN|LIGHTING PLAN/]],
  [/^2[78]/, [/TELECOM|SECURITY/]],
  [/^3[1-3]/, [/SITE PLAN|GRADING|UTILITY PLAN/, /NOTES, LEGEND/]],
];
export const MAX_SHEETS_PER_TRADE = 6;

/** The drawing sheets (from drawingRegister) most likely to show a trade's work, by its CSI code. */
export function sheetsForTrade<T extends { title: string }>(register: T[], code: string, max = MAX_SHEETS_PER_TRADE): T[] {
  const out: T[] = [];
  for (const re of SHEET_RULES.find(([c]) => c.test(code))?.[1] ?? []) for (const row of register) if (out.length < max && !out.includes(row) && re.test(row.title.toUpperCase())) out.push(row);
  return out;
}

export function uncoveredSections(sections: StoredSection[], packages: Pick<TradePackage, "id" | "division" | "code">[]): StoredSection[] {
  const covered = new Set([...sectionsByTrade(sections, packages).values()].flat());
  return sections.filter(s => !covered.has(s) && !/^0[01]/.test(digits(s.section)));
}

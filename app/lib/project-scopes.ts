// Which project-manual sections each trade's AI reading covers (Marcel, 15 Oct: "the AI needs to write
// the scopes for every trade from those files"). Pure: sections from the stored manual, trades from
// procurement. Division 00/01 is left to the General section, which applies to every trade.

import type { StoredSection } from "./project-files";
import { STANDARD_TRADES, type TradePackage } from "./procurement";

const digits = (code: string) => code.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
// Work a contractor carries with another group's trade, from Marcel's Jelleff bid forms: "Drywall &
// ceilings" lists 09 51 13 ceilings, 09 72 00 wall coverings and 09 84 33 sound-absorbing panels beside
// 09 2x; tile (09 3x) goes with flooring when there is no tile trade; door hardware (08 7x) with doors;
// joint sealants (07 9x) with "Waterproofing AVB & joint sealants" (07 1x).
// ponytail: a hand table by CSI group; add entries when another division splits across trades.
const AFFINITY: Record<string, string> = { "093": "096", "095": "092", "097": "092", "098": "092", "087": "081", "079": "071" };

/**
 * Each section goes to the trade of its CSI division. When several trades share a division: the trade
 * with the same level-2 code (10 14 signage), then a whole-division trade (10 00 00 specialties), then
 * the same CSI group (09 2x drywall), then the group's usual partner (AFFINITY), then the closest code.
 */
export function sectionsByTrade(sections: StoredSection[], packages: Pick<TradePackage, "id" | "division" | "code">[]): Map<string, StoredSection[]> {
  const out = new Map<string, StoredSection[]>(packages.map(p => [p.id, []]));
  for (const section of sections) {
    const code = digits(section.section);
    if (code.startsWith("00") || code.startsWith("01")) continue;
    const candidates = packages.filter(p => digits(p.code).slice(0, 2) === code.slice(0, 2));
    if (!candidates.length) continue;
    const group = code.slice(0, 3);
    const level2 = candidates.filter(p => digits(p.code).slice(0, 4) === code.slice(0, 4));
    const whole = candidates.filter(p => digits(p.code).endsWith("0000"));
    const inGroup = candidates.filter(p => digits(p.code).slice(0, 3) === group);
    const byAffinity = candidates.filter(p => digits(p.code).slice(0, 3) === AFFINITY[group]);
    const pool = level2.length ? level2 : whole.length ? whole : inGroup.length ? inGroup : byAffinity.length ? byAffinity : candidates;
    const best = [...pool].sort((a, b) => Math.abs(Number(digits(a.code)) - Number(code)) - Math.abs(Number(digits(b.code)) - Number(code)))[0];
    out.get(best.id)!.push(section);
  }
  return out;
}

// Which drawing sheets carry a trade's scope (15 Oct: scopes come from all the project files, the
// drawings as well as the specifications). Title keywords by CSI code, most telling first, capped
// so a trade costs a handful of vision requests.
const SHEET_RULES: { code: RegExp; titles: RegExp[]; disciplines?: string[] }[] = [
  { code: /^02 4/, titles: [/DEMOLITION/] },
  { code: /^02 8/, titles: [/HAZARD|ABATEMENT|ASBESTOS/] },
  { code: /^03/, titles: [/FOUNDATION|CONCRETE/, /STRUCTURAL NOTES/] },
  { code: /^04/, titles: [/MASONRY/, /EXTERIOR ELEVATIONS/, /WALL SECTIONS/] },
  { code: /^05/, titles: [/STEEL/, /FRAMING PLAN/, /COLUMN|BRAC/] },
  { code: /^06/, titles: [/CASEWORK|MILLWORK/, /INTERIOR DETAILS/] },
  { code: /^07/, titles: [/ROOF PLAN/, /WALL SECTIONS|EXTERIOR SECTION|MOCK-UP/] },
  { code: /^08/, titles: [/DOOR/, /WINDOW|STOREFRONT|GLAZING|CURTAIN WALL/] },
  { code: /^09 [245]/, titles: [/PARTITION/, /REFLECTED CEILING|CEILING DETAILS/, /^LEVEL \d+ - \w+ FLOOR PLAN/] },
  { code: /^09 [36]/, titles: [/FINISH/] },
  { code: /^09 9/, titles: [/FINISH/, /INTERIOR ELEVATIONS/] },
  { code: /^10/, titles: [/SIGNAGE|TOILET ACCESSOR|SPECIALT/] },
  { code: /^11/, titles: [/KITCHEN|FOOD SERVICE|EQUIPMENT PLAN/], disciplines: ["Food service"] },
  { code: /^12/, titles: [/FURNITURE|FF&E/] },
  { code: /^13/, titles: [/POOL/], disciplines: ["Aquatics"] },
  { code: /^14/, titles: [/ELEVATOR/] },
  { code: /^21/, titles: [/FIRE PROTECTION/], disciplines: ["Fire protection"] },
  { code: /^22/, titles: [/PLUMBING (GENERAL )?NOTES|PLUMBING SCHEDULES/, /PLUMBING PLAN/], disciplines: ["Plumbing"] },
  { code: /^23/, titles: [/MECHANICAL (SYMBOLS|SCHEDULES)/, /HVAC PLAN|^LEVEL \d+.* PIPING PLAN/], disciplines: ["Mechanical"] },
  { code: /^26/, titles: [/ELECTRICAL (SYMBOLS|SCHEDULES)/, /POWER PLAN|LIGHTING PLAN/], disciplines: ["Electrical"] },
  { code: /^27/, titles: [/TELECOM|COMMUNICATION/], disciplines: ["Technology"] },
  { code: /^28/, titles: [/SECURITY|FIRE ALARM/] },
  { code: /^31/, titles: [/GRADING|EROSION|EARTHWORK|EXCAVATION/] },
  { code: /^32/, titles: [/SITE PLAN|HARDSCAPE|PAVING|PLANTING|FENCING/], disciplines: ["Landscape"] },
  { code: /^33/, titles: [/UTILIT|STORM ?WATER|SEWER/] },
];
export const MAX_SHEETS_PER_TRADE = 6;

type SheetRow = { title: string; discipline?: string };
const ruleFor = (code: string) => SHEET_RULES.find(r => r.code.test(code));

/** The drawing sheets (from drawingRegister) most likely to show a trade's work, by its CSI code: title keywords first, then its discipline's sheets. */
export function sheetsForTrade<T extends SheetRow>(register: T[], code: string, max = MAX_SHEETS_PER_TRADE): T[] {
  const rule = ruleFor(code), out: T[] = [];
  const add = (match: (row: T) => boolean) => { for (const row of register) if (out.length < max && !out.includes(row) && match(row)) out.push(row); };
  for (const re of rule?.titles ?? []) add(row => re.test(row.title.toUpperCase()));
  if (rule?.disciplines) add(row => rule.disciplines!.includes(row.discipline ?? ""));
  return out;
}

export type TradeSuggestion = TradePackage & { sections: string[]; sheets: string[] };

/**
 * Trades a new project needs (15 Oct; drawings alone must be enough, the manual adds the rest): a
 * standard trade is suggested when the manual has sections for it (the same mapping Write scopes
 * reads by) or when sheets carry its most telling title or its discipline. Trades the project
 * already has are skipped. Each suggestion lists what it came from, for the estimator to confirm.
 */
export function suggestTrades(packages: Pick<TradePackage, "id" | "name">[], input: { sections: StoredSection[]; sheets: (SheetRow & { sheet: string })[] }): TradeSuggestion[] {
  const candidates = STANDARD_TRADES.filter(t => !packages.some(p => p.id === t.id || p.name.toLowerCase() === t.name.toLowerCase()))
    .map(t => ({ ...t, division: t.code.slice(0, 2), owner: "", due: "" }));
  const bySection = sectionsByTrade(input.sections, candidates);
  return candidates.flatMap(t => {
    const rule = ruleFor(t.code);
    const sheets = input.sheets.filter(s => rule && (rule.titles[0].test(s.title.toUpperCase()) || rule.disciplines?.includes(s.discipline ?? ""))).map(s => s.sheet);
    const sections = (bySection.get(t.id) ?? []).map(s => s.section);
    return sections.length || sheets.length ? [{ ...t, sections, sheets }] : [];
  });
}

/** Sections no trade covers (outside Division 00/01): shown so the estimator can add a trade or move work. */
export function uncoveredSections(sections: StoredSection[], packages: Pick<TradePackage, "id" | "division" | "code">[]): StoredSection[] {
  const covered = new Set([...sectionsByTrade(sections, packages).values()].flat());
  return sections.filter(s => !covered.has(s) && !/^0[01]/.test(digits(s.section)));
}

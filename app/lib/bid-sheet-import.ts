// A contractor's bid sheet as the AI memory's starting playbook (Danial, 23 Nov: "build the package memory and import
// Marcel's bid sheet"). A live bid sheet has a tab per trade, and each tab's Section 3 already says how the contractor
// buys that trade: the specification sections it carries (A), its scope lines in the contractor's words (B) and what it
// leaves to others (C). Read through lib/scope-score readTradeTab, each tab becomes memory entries:
//
//   assignment  <trade> carries <section> <title>        one per listed section: the trade split
//   rule        <trade> doesn't carry: <exclusion>.       one per exclusion
//   example     <scope line>                              one per scope line: how the contractor words it
//
// Each tab is matched to one of Structor's standard trades so the entries find that trade's packages on any project
// (tagged by its code and name, and by the sheet's own name); a tab with no match keeps its own name. Everything arrives
// proposed, for an estimator to approve. Each entry's id comes from the file, tab and line, so importing the same sheet
// again adds nothing. Pure; the AI memory screen reads the workbook and sends the entries.

import { tradeName, tradeTags, type MemoryInput } from "./memory";
import { STANDARD_TRADES } from "./procurement";
import { readTradeTab, type TradeKey } from "./scope-score";

export type StandardTrade = (typeof STANDARD_TRADES)[number];
/**
 * One trade tab of a bid sheet, with the standard trade it was matched to. `bid`: the tab names real bidders, so the
 * trade was bought on this project; an untouched template tab lists "Bidder 1", "Bidder 2"… and isn't ticked by default.
 */
export type SheetTrade = { tab: string; division: string; name: string; key: TradeKey; standard: string | null; bid: boolean };

/** Whether a tab's Subcontractor row names a real company rather than the template's "Bidder 1", "Bidder 2"… */
export function namesBidders(rows: unknown[][]): boolean {
  const row = rows.slice(0, 20).find(r => r.some(c => /^subcontractor:?$/i.test(String(c ?? "").trim())));
  if (!row) return false;
  const after = row.slice(row.findIndex(c => /^subcontractor:?$/i.test(String(c ?? "").trim())) + 1).map(c => String(c ?? "").trim()).filter(Boolean);
  const names = after.slice(0, Math.max(0, after.findIndex(c => /^bid summary/i.test(c))) || after.length);
  return names.some(c => !/^bidder\s*\d+$/i.test(c));
}

/** "09 - DRYWALL & CEILINGS" → division "09", "Drywall & ceilings". */
export function splitTradeLabel(label: string): { division: string; name: string } {
  const m = label.trim().match(/^(\d{1,2})\s*[-–:.]?\s*(.*)$/);
  const raw = (m ? m[2] : label).trim();
  const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/^./, c => c.toUpperCase()) : raw;
  return { division: m ? m[1].padStart(2, "0") : "", name };
}

/** Words a bid sheet writes for a trade, as Structor's standard trades name it. */
const SAY: [RegExp, string][] = [
  [/\bdemo\b/g, "demolition"], [/\bconc\b/g, "concrete"], [/\bss\b|\bmm\b/g, "steel metals"], [/\bwp\b/g, "waterproofing"], [/\bab\b|\bavb\b/g, "air barrier"],
  [/\bdfh\b/g, "doors frames hardware"], [/\balum\b/g, "aluminum"], [/\bglass\b/g, "glazing"], [/\bgwb\b/g, "drywall"], [/\bhvac\b/g, "mechanical"],
  [/\blv\b/g, "low voltage"], [/\bfp\b/g, "fire protection"], [/\belev\b/g, "elevators"], [/\bff and e\b|\bffe\b/g, "furnishings"], [/\bpools?\b/g, "special construction"],
  [/\bcarpet\b|\bresilient\b|\brubber\b/g, "flooring"], [/\bpaint\b/g, "painting"], [/\bwet\b/g, "wet utilities"], [/\bdry\b/g, "dry utilities"], [/\bsite furn\w*\b/g, "landscaping"],
];
const said = (name: string) => SAY.reduce((s, [re, to]) => s.replace(re, to), tradeName(name));
const words = (s: string) => new Set(s.split(" ").filter(w => w.length > 2 && !["and", "the", "site", "work"].includes(w)));

/**
 * The standard trade a sheet's trade is: in the same CSI division, the one whose name shares the most words with it; the
 * only one in its division when the names share none. Null when the division has none, or several and no word decides.
 */
export function matchStandardTrade(division: string, name: string): string | null {
  const pool = STANDARD_TRADES.filter(t => t.code.slice(0, 2) === division);
  if (!pool.length) return null;
  const mine = words(said(name));
  const scored = pool.map(t => ({ t, score: [...words(tradeName(t.name))].filter(w => mine.has(w)).length })).sort((a, b) => b.score - a.score);
  if (scored[0].score > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) return scored[0].t.id;
  return pool.length === 1 ? pool[0].id : null;
}

/** The workbook's trade tabs (those with a Section 3 holding sections, scope lines or exclusions), each matched. */
export function readBidSheet(sheets: { name: string; rows: unknown[][] }[]): SheetTrade[] {
  const out: SheetTrade[] = [];
  for (const sheet of sheets) {
    const key = readTradeTab(sheet.name, sheet.rows);
    if (!key.sections.length && !key.inclusions.length && !key.exclusions.length) continue;
    if (!key.trade || /^template$/i.test(key.trade)) continue;
    const { division, name } = splitTradeLabel(key.trade);
    if (!division || !name) continue;
    out.push({ tab: sheet.name, division, name, key, standard: matchStandardTrade(division, name), bid: namesBidders(sheet.rows) });
  }
  return out;
}

/** What one tab adds to the memory, as proposals. `standard`: the Structor trade it was matched to, or null for its own. */
export function bidSheetEntries(trade: SheetTrade, file: string, standard: string | null): MemoryInput[] {
  const std = standard ? STANDARD_TRADES.find(t => t.id === standard) ?? null : null;
  const label = std ? std.name : trade.name;
  const trades = [...new Set([...(std ? tradeTags(std) : []), tradeName(trade.name)])];
  const id = (kind: string, n: number | string) => `import:${tradeName(file).slice(0, 60)}:${trade.tab}:${kind}:${n}`;
  const source = { trade: label, file: file.slice(0, 120), tab: trade.tab };
  return [
    ...trade.key.sections.map(section => ({ kind: "assignment" as const, origin: "import" as const, section, trades, source, events: [id("section", section)],
      text: `${label} carries ${section}${trade.key.sectionTitles[section] ? ` ${trade.key.sectionTitles[section]}` : ""}.` })),
    ...trade.key.exclusions.map((line, i) => ({ kind: "rule" as const, origin: "import" as const, trades, source, events: [id("exclusion", i)],
      text: `${label} doesn't carry: ${line.text.replace(/[.;]+$/, "")}.` })),
    ...trade.key.inclusions.map((line, i) => ({ kind: "example" as const, origin: "import" as const, trades, source, events: [id("line", i)],
      text: line.text, detail: line.group ? `Under "${line.group}"` : "" })),
  ];
}

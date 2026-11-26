// Finish legend tags (23 Nov, Whittier run 3). Drywall read A-506 Interior Finish Schedules and named ACP-1, ACP-2 and
// ACP-4, but not ACP-3, ACP-5, WDC-1, AWP-1 or AWP-2, which MCN's Drywall bid form lists one per line. It also wrote
// TP-1 toilet partitions, which MCN buys from Specialties. A finish legend prints one row per tag: code, type,
// location, maker, product. The AI reads it lossily, so after a trade's reading two things happen:
//   - every tag on its finish schedule whose type is work this trade carries gets a line if no line names it;
//   - a line the AI took from the schedule for a tag another trade carries is left to that trade.
// Who carries a type is the project's own split: the type's usual section, and whoever reads that section here
// (lib/project-scopes sectionOwners). Pure; lib/scope-reading applies it.

import type { Dropped } from "./ai-jobs";
import type { DraftInput } from "./extraction";
import { projectMemory, type MemoryEntry } from "./memory";

/** One row of a finish legend: its tag as printed, its type words, the type's usual section and the printed row. */
export type FinishRow = { tag: string; type: string; section: string; line: string; text: string };
/** A finish schedule sheet a trade read, with its page text. */
export type ScheduleSheet = { document: string; page: number; sheet: string; text: string };
export type TagOwner = { id: string; name: string };

// ponytail: a hand table of the finish types legends print, to their usual MasterFormat section. First match wins, so
// a type comes before the words it contains (paint before the ceiling it is on, "ACOUSTIC WOOD CEILING" before
// "ACOUSTIC CEILING", vinyl tile before tile). A type mapped to null (door stain, a transition strip) is ambiguous: it
// follows the legend's numbered heading when there is one, and is otherwise left to the AI's reading.
const FINISH_TYPES: [RegExp, string | null][] = [
  [/\bPAINT\b|\bPRIMER\b|\bCOATINGS?\b/, "09 91 23"],
  [/\bDOORS?\b|\bFRAMES?\b|\bHARDWARE\b/, null],
  [/\bTRANSITIONS?\b|\bREDUCER\b|\bEDGE STRIP\b/, null],
  [/\bMIRRORS?\b/, "10 28 00"],
  [/\bLOCKERS?\b/, "10 51 00"],
  [/\bTOILET (PARTITION|COMPARTMENT)S?\b|\bURINAL SCREENS?\b/, "10 21 13"],
  [/\b(PRIVACY|CUBICLE) CURTAINS?\b/, "10 21 23"],
  [/\bCORNER GUARDS?\b|\bWALL (PROTECTION|GUARDS?)\b|\b(CRASH|BUMPER) (RAIL|GUARD)S?\b/, "10 26 00"],
  [/\b(MARKER|WHITE|CHALK|TACK|DRY[- ]ERASE) ?(BOARD|PANEL)S?\b|\bVISUAL DISPLAY\b/, "10 11 00"],
  [/\bFIBER[- ]REINFORCED\b|\bFRP\b|\bPLASTIC PANEL/, "06 64 00"],
  [/\bMETAL PAN\b/, "09 51 33"],
  [/\b(WOOD|METAL|LINEAR|GRILLE) CEILINGS?\b/, "09 54 00"],
  [/\bBAFFLES?\b|\bCLOUDS?\b/, "09 84 36"],
  [/\bCEILING (PANEL|TILE)S?\b|\bACOUSTIC(AL)? (CEILING|TILE)S?\b|\bLAY-?IN\b/, "09 51 13"],
  [/\bGYPSUM\b|\bGYP\.? ?BD\b|\bGWB\b|\bDRYWALL\b/, "09 29 00"],
  [/\b(ACOUSTIC(AL)?|FABRIC[- ]WRAPPED|SOUND[- ]ABSORBING) (WALL )?PANELS?\b/, "09 84 33"],
  [/\bWALL ?COVERINGS?\b|\bWALL GRAPHICS?\b|\bVINYL WALL\b/, "09 72 00"],
  [/\bSTAIN\b|\bTRANSPARENT FINISH/, "09 93 00"],
  [/\bTERRAZZO\b/, "09 66 00"],
  [/\bEPOXY\b|\bRESINOUS\b/, "09 67 00"],
  [/\bCARPET/, "09 68 00"],
  [/\bWOOD FLOOR/, "09 64 00"],
  [/\bATHLETIC\b|\bSPORTS? FLOOR/, "09 65 66"],
  [/\bRESILIENT\b|\bRUBBER\b|\bVINYL\b|\bLVT\b|\bVCT\b|\bLINOLEUM\b/, "09 65 00"],
  [/\bTILE\b|\bCERAMIC\b|\bPORCELAIN\b|\bQUARRY\b|\bMOSAIC\b/, "09 30 00"],
  [/\bCONCRETE\b/, "03 35 00"],
  [/\bWALK[- ]?OFF\b|\bMATS?\b/, "12 48 13"],
  [/\bSHADES?\b|\bBLINDS?\b/, "12 24 13"],
  [/\b(GLASS|WINDOW) FILM\b/, "08 87 00"],
  [/\bCOUNTERTOPS?\b|\bSOLID SURFACE\b|\bQUARTZ\b/, "12 36 61"],
  [/\bCASEWORK\b|\bCABINETS?\b|\bMILLWORK\b|\bLAMINATE\b|\bVENEER\b|\bWOOD (PANEL|BASE|TRIM)|\bUPHOLSTERY\b|\bBENCH\b/, "06 41 00"],
];

/** A legend row: a tag ("ACP-1", "RBR-5A", "F4") at the start of a line, then the row's words. */
const TAG_ROW = /^([A-Z]{1,5}-\d{1,3}[A-Z]?|[A-Z]{1,3}\d{1,2}[A-Z]?)\s+(\S.*)$/;
/** The legend's group headings, where one row's wrapped words stop. */
const HEADING = /^(CEILINGS?|FLOORS?|MILLWORK|MISC(ELLANEOUS)?|WALLS?|WALL BASE|BASE|SPECIALTIES|FINISH LEGEND|CODE\b.*)$/;
/** Words that finish a type's name after the words that matched it ("LUXURY VINYL" + "TILE", "CERAMIC" + "WALL TILE"). */
const TYPE_END = /^(TILES?|PANELS?|PANELING|FLOORING|BOARDS?|SHEETS?|BASE|CEILINGS?|COVERINGS?|TREADS?|PLANKS?|GRAPHICS?|MATS?|COUNTERTOPS?|CASEWORK|MILLWORK|FILM)$/;
const TYPE_LINK = /^(WALL|FLOOR)$/;

/** Whether a register sheet is a finish schedule or legend, by its title. */
export const isFinishSchedule = (title: string) => /\bFINISH (SCHEDULES?|LEGEND)\b/.test(title.toUpperCase());

/**
 * A tag printed alone on its line, its row's words on the lines after it (Project 1's A12.1: "ACP-01", then "STANDARD
 * CEILING TILE"). Only the hyphened form: a product code alone on a line ("D24") is not a tag.
 */
const TAG_ALONE = /^([A-Z]{1,5}-\d{1,3}[A-Z]?)$/;
/**
 * A numbered group heading over the rows (Project 1's A12.1: "095100 ACOUSTIC CEILING TILE", or the number alone,
 * "105115"), in the divisions finishes are bought in, so a project number on the sheet isn't one.
 */
const SECTION_HEADING = /^(0[3-9]|1[0-2]) ?(\d{2}) ?(\d{2})(?: ([A-Z][A-Z &/,.'()-]+))?$/;

/** "ACP-1", "ACP 1", "acp-1" and "ACP-01" read alike; "F4" is "F-4". */
const canonical = (letters: string, digits: string, suffix = "") => `${letters.toUpperCase()}-${Number(digits)}${suffix.toUpperCase()}`;
const normal = (tag: string) => { const m = /^([A-Z]+)[- ]?(\d+)([A-Z]?)$/i.exec(tag.trim()); return m ? canonical(m[1], m[2], m[3]) : tag.toUpperCase(); };

/**
 * The section a type's words name (FINISH_TYPES; null for an ambiguous type), and the printed type: the words up to
 * the match and those that finish it. Null when the table doesn't know the words.
 */
function typeOf(words: string[]): { section: string | null; type: string } | null {
  const head = words.slice(0, 6).join(" ");
  const hit = FINISH_TYPES.find(([re]) => re.test(head));
  const found = hit?.[0].exec(head);
  if (!hit || !found) return null;
  let count = head.slice(0, found.index + found[0].length).split(" ").length;
  if (words[count] && TYPE_END.test(words[count])) count++;
  else if (words[count] && TYPE_LINK.test(words[count]) && words[count + 1] && TYPE_END.test(words[count + 1])) count += 2;
  return { section: hit[1], type: words.slice(0, count).join(" ").toLowerCase() };
}

type Heading = { section: string; title: string; type: string | null };

/**
 * The rows of the finish legends printed on a sheet: each tag once, with a type the table above knows. Two layouts:
 * a row on one line ("ACP-1 ACOUSTIC CEILING PANEL THROUGHOUT ARMSTRONG…", Whittier's A-506), or its tag alone with its
 * words on the lines after ("ACP-01" / "STANDARD CEILING TILE" / "ARMSTRONG", Project 1's A12.1). A row's own type
 * decides; one the table doesn't know or finds ambiguous ("SCRUBABLE NSF", "GROUT", "CONCRETE TRANSITION") follows
 * its numbered heading ("095100 ACOUSTIC CEILING TILE"): the heading's words, else its number. The number alone can be
 * wrong (A12.1 lists plastic-laminate casework under "066400 CUSTOM CASEWORK"; 06 64 00 is plastic paneling). A row's
 * wrapped words go with it, for the line's detail.
 */
export function finishLegend(text: string): FinishRow[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim());
  const rows: FinishRow[] = [], seen = new Set<string>();
  const ends = (l: string) => !l || TAG_ROW.test(l) || TAG_ALONE.test(l) || HEADING.test(l) || SECTION_HEADING.test(l);
  let heading: Heading | null = null;
  for (const [i, line] of lines.entries()) {
    const h = SECTION_HEADING.exec(line);
    if (h) { heading = { section: `${h[1]} ${h[2]} ${h[3]}`, title: (h[4] ?? "").toLowerCase(), type: h[4] ? typeOf(h[4].split(" "))?.section ?? null : null }; continue; }
    const same = TAG_ROW.exec(line), alone = same ? null : TAG_ALONE.exec(line);
    if (!same && !alone) continue;
    const tag = (same ?? alone)![1];
    const more: string[] = [];
    for (let j = i + 1; j < lines.length && more.length < (same ? 3 : 6); j++) { if (ends(lines[j])) break; more.push(lines[j]); }
    if (alone && !more.length) continue;
    const words = (same ? same[2] : more[0]).split(" ");
    const own = typeOf(words), under: Heading | null = heading;
    const section = own?.section ?? (under ? under.type ?? under.section : null);
    if (!section || seen.has(normal(tag))) continue;
    seen.add(normal(tag));
    const type = own?.type ?? (under?.title || words.slice(0, 4).join(" ").toLowerCase());
    rows.push({ tag, type, section, line: same ? line : `${tag} ${more[0]}`, text: [line, ...more].join(" ").slice(0, 400) });
  }
  return rows;
}

/**
 * The tags a line names, normalised: "ACP-1", "F4", the tags inside a range ("ACP-1 to ACP-5", "AWP-1..3", "AWP-1
 * through 3") and a slash list ("AWP-1/2/3", "ACP-1/ACP-2"; Whittier run 4 wrote "AWP-1/2/3" and got an extra AWP-2
 * line). Only capital letters count as a tag, so "Level 5" isn't one.
 */
export function namedTags(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z]{1,5})[- ]?(\d{1,3})([A-Z]?)\b/g)) out.add(canonical(m[1], m[2], m[3]));
  for (const m of text.matchAll(/\b([A-Z]{1,5})-(\d{1,3})\s*(?:to|through|thru|–|—|-|\.\.\.?)\s*(?:\1-?)?(\d{1,3})\b/g)) {
    const from = Number(m[2]), to = Number(m[3]);
    if (to > from && to - from <= 20) for (let n = from; n <= to; n++) out.add(canonical(m[1], String(n)));
  }
  for (const m of text.matchAll(/\b([A-Z]{1,5})-\d{1,3}[A-Z]?((?:\/(?:[A-Z]{1,5}-?)?\d{1,3}[A-Z]?)+)\b/g))
    for (const n of m[2].matchAll(/\/(?:([A-Z]{1,5})-?)?(\d{1,3})([A-Z]?)/g)) if (!n[1] || n[1] === m[1]) out.add(canonical(m[1], n[2], n[3]));
  return out;
}

// ── Tags borrowed from another project (Whittier run 4: "Install sound absorbing panels SAW-01") ──
// SAW-01 is Project 1's tag. Its wording reached Whittier's Drywall through the company-wide memory imported from
// Project 1's bid sheet, while no Whittier drawing or specification prints it. A tag like that on a bid-form line is
// another project's, so the line is left out with a note; the legend check above names this project's own tags.

/**
 * The tags the memory a project reads names in its company-wide entries but not in the project's own: the ones a
 * scan could borrow from another project's bid forms. Only hyphened tags of two letters or more ("SAW-01"), so a
 * standard ("NFPA 80", "ASTM C 645") or a detail ("D3") is never one.
 */
export function borrowedTags(entries: MemoryEntry[], projectId: string): Set<string> {
  const seen = projectMemory(entries, projectId);
  const tags = (list: MemoryEntry[]) => new Set(list.flatMap(e => [...`${e.text} ${e.detail}`.matchAll(/\b([A-Z]{2,5})-(\d{1,3})([A-Z]?)\b/g)].map(m => canonical(m[1], m[2], m[3]))));
  const own = tags(seen.filter(e => e.projectId === projectId));
  return new Set([...tags(seen.filter(e => !e.projectId))].filter(t => !own.has(t)));
}

/** A tag's family: "SAW" for SAW-01. */
const family = (tag: string) => tag.split("-")[0];
/** The tag families printed on some pages ("SAW", "LVT"), from their text. */
export const tagFamilies = (texts: string[]): Set<string> => new Set(texts.flatMap(t => [...namedTags(t)].map(family)));

/** A page a trade's reading read, with its text: a specification page or a drawing sheet. */
export type ReadPage = { document: string; page: number; text: string };

/**
 * A trade's reading without its lines that name a borrowed tag (borrowedTags) in their titles whose family is printed
 * nowhere: not on any page the trade read, nor on any of the project's drawings (`printed`, tagFamilies of every
 * sheet). The whole project, because a tag defined on a sheet another trade reads is still this project's (Drywall
 * installing Project 1's GB-1 grab bars); a family, not the exact tag, so Project 1's "LVT-01" wording on a project that
 * prints LVT-1 to LVT-3 stays. Only a line whose cited page has a text layer is judged: a scanned sheet's words aren't in
 * `pages`. The line's highlights and quantity go with it.
 */
export function dropBorrowedTags(args: { drafts: DraftInput[]; pkg: TagOwner; pages: ReadPage[]; printed: Set<string>; borrowed: Set<string> }): { drafts: DraftInput[]; dropped: Dropped[] } {
  const { drafts, pkg, pages, borrowed } = args;
  if (!borrowed.size || !pages.length) return { drafts, dropped: [] };
  const printed = new Set([...args.printed, ...tagFamilies(pages.map(p => p.text))]);
  const hasText = (d: DraftInput) => pages.some(p => p.document === d.citations[0]?.document && p.page === d.citations[0]?.page && p.text.trim().length >= 200);
  const dropped: Dropped[] = [], gone = new Set<string>();
  for (const d of drafts) {
    if (d.kind !== "scope" || d.packageId !== pkg.id || !hasText(d)) continue;
    const foreign = [...namedTags(d.title)].filter(t => borrowed.has(t) && !printed.has(family(t)));
    if (!foreign.length) continue;
    gone.add(d.key);
    // As written in the line ("SAW-01"), not normalised.
    const written = foreign.map(t => [...d.title.matchAll(/\b([A-Z]{1,5})[- ]?(\d{1,3})([A-Z]?)\b/g)].find(m => canonical(m[1], m[2], m[3]) === t)?.[0] ?? t);
    const one = written.length === 1;
    dropped.push({ what: d.title, reason: `No ${written.map(t => `${family(normal(t))}-`).join(" or ")} tag is printed on this project's drawings or the pages ${pkg.name} read: ${written.join(", ")} ${one ? "comes" : "come"} from another project's bid form wording in the AI memory.` });
  }
  return { drafts: drafts.filter(d => !gone.has(d.key) && !(d.kind === "region" && d.scopeKeys?.some(k => gone.has(k))) && !(d.kind === "quantity" && d.scopeKey && gone.has(d.scopeKey))), dropped };
}

/**
 * A trade's reading after its finish schedules are checked, as described at the top. `owners`: who carries a section on
 * this project (lib/project-scopes sectionOwners). `leavesOut`: the trade's approved "doesn't carry" lines (lib/memory
 * leftOut); a tag whose type they name gets no line. A line is dropped only when it was drawn from a schedule sheet and
 * every tag in its title is another trade's. `added` lines cite their printed row, so the row is what gets highlighted.
 */
export function checkScheduleTags(args: { drafts: DraftInput[]; pkg: TagOwner; schedules: ScheduleSheet[]; owners: (section: string) => TagOwner[]; leavesOut?: string[] }): { drafts: DraftInput[]; added: DraftInput[]; dropped: Dropped[] } {
  const { drafts, pkg, schedules, owners } = args;
  const rows = new Map<string, FinishRow & { sheet: ScheduleSheet; owners: TagOwner[] }>();
  for (const sheet of schedules) for (const row of finishLegend(sheet.text)) if (!rows.has(normal(row.tag))) rows.set(normal(row.tag), { ...row, sheet, owners: owners(row.section) });
  if (!rows.size) return { drafts, added: [], dropped: [] };
  const mine = drafts.filter((d): d is Extract<DraftInput, { kind: "scope" }> => d.kind === "scope" && d.packageId === pkg.id);
  const onSchedule = (d: DraftInput) => schedules.some(s => d.citations[0]?.document === s.document && d.citations[0]?.page === s.page);
  const others = (row: { owners: TagOwner[] }) => row.owners.length > 0 && !row.owners.some(o => o.id === pkg.id);

  // Lines from the schedule for another trade's tags.
  const dropped: Dropped[] = [], gone = new Set<string>();
  for (const d of mine.filter(onSchedule)) {
    const tags = [...namedTags(d.title)].filter(t => rows.has(t));
    if (!tags.length || !tags.every(t => others(rows.get(t)!))) continue;
    gone.add(d.key);
    const row = rows.get(tags[0])!;
    dropped.push({ what: d.title, reason: `${tags.join(", ")} (${row.type}) belongs to ${row.owners.map(o => o.name).join(" or ")} on this project (section ${row.section}), so it is left to that trade.` });
  }
  const kept = drafts.filter(d => !gone.has(d.key) && !(d.kind === "region" && d.scopeKeys?.some(k => gone.has(k))) && !(d.kind === "quantity" && d.scopeKey && gone.has(d.scopeKey)));

  // This trade's tags no line names.
  const named = new Set(mine.filter(d => !gone.has(d.key)).flatMap(d => [...namedTags(`${d.title} ${d.detail}`)]));
  // An exclusion names the tag, or the whole type of two words or more ("toilet partitions"): one word is too loose
  // (Painting "doesn't carry: Painting or prefinished items" is not "doesn't carry paint").
  const excluded = (row: FinishRow) => (args.leavesOut ?? []).some(text => {
    if (namedTags(text).has(normal(row.tag))) return true;
    const words = row.type.split(" ");
    return words.length > 1 && new RegExp(`\\b${words.map(w => w.replace(/s$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("s?\\s+")}s?\\b`, "i").test(text);
  });
  const added: DraftInput[] = [];
  for (const [tag, row] of rows) {
    if (named.has(tag) || !row.owners.some(o => o.id === pkg.id) || excluded(row)) continue;
    const quote = row.line.split(" ").slice(0, 12).join(" ");
    added.push({
      kind: "scope", key: `finish-legend-${row.sheet.page}-${tag}`, packageId: pkg.id, source: row.sheet.sheet,
      title: `Include ${row.tag} ${row.type} per the finish legend.`,
      detail: `Finish legend on ${row.sheet.sheet}: ${row.text}. Confirm where ${row.tag} is used on the plans and elevations.`,
      citations: [{ document: row.sheet.document, page: row.sheet.page, sheet: row.sheet.sheet, quote }],
    });
  }
  return { drafts: kept, added, dropped };
}

// ── Another trade's item on a line from the memory (Whittier runs 9-12: "Receive, unload, catalogue, store and install
// toilet partitions TP-1") ──
// Project 1's bid sheet gives Drywall "Toilet Accessories & Partitions" to receive and install; Whittier buys toilet
// partitions (10 21 13) whole from Specialties, while Drywall still installs the toilet accessories (it reads 10 28 00 for
// its part). The memory check (lib/memory-check) writes the contractor's wording from other projects wherever a page
// shows the item, so before such a line goes on the bid form, the items it installs are matched to their usual
// sections: when the trade reads none of them on this project and another trade carries them, the line is left to that
// trade. Work at an item stays (blocking at toilet accessories, a recess for a cabinet): the item is where the work is.

/**
 * Items a bid-form line can install, to their usual sections: toilet accessories and fire extinguisher cabinets, then
 * the finish types. Most specific first: each match uses up its words, so "fire extinguisher cabinets" isn't casework.
 */
const ITEM_TYPES: [RegExp, string][] = [
  [/\bTOILET ACCESSOR(?:Y|IES)\b|\bGRAB BARS?\b/, "10 28 00"],
  [/\bFIRE[- ](?:EXTINGUISHER|PROTECTION) CABINETS?\b|\bFIRE EXTINGUISHERS?\b/, "10 44 13"],
  ...FINISH_TYPES.filter((t): t is [RegExp, string] => t[1] !== null),
];
/** Work done at an item, not the item itself. */
const WORK_AT = /\b(BLOCKING|BACKING|GROUNDS?|NAILERS?|REINFORC\w*|FRAMING|RECESS\w*|OPENINGS?|CUT-?OUTS?|COORDINAT\w*|PREPAR\w*|SUPPORTS?|ANCHORAGE|LAYOUT)\b/;

/** The items a line names, each with its usual section (toilet partitions: 10 21 13). */
export function lineItems(text: string): { words: string; section: string }[] {
  let upper = text.toUpperCase();
  const out: { words: string; section: string }[] = [];
  for (const [re, section] of ITEM_TYPES) {
    const m = re.exec(upper);
    if (!m) continue;
    if (!out.some(o => o.section === section)) out.push({ words: m[0].toLowerCase(), section });
    upper = `${upper.slice(0, m.index)}${" ".repeat(m[0].length)}${upper.slice(m.index + m[0].length)}`;
  }
  return out;
}

/**
 * Lines installing an item whose sections this trade reads none of (`reads`: the section numbers it reads, in full or
 * in part), when another trade carries them on this project (`owners`, lib/project-scopes sectionOwners): left to that
 * trade with a note. A section counts as read at its level-2 number (10 28 00 covers 10 28 13). A line naming nothing
 * the table knows, or naming one item the trade reads, stays.
 */
export function leaveOthersItems(args: { drafts: DraftInput[]; pkg: TagOwner; reads: string[]; owners: (section: string) => TagOwner[] }): { drafts: DraftInput[]; dropped: Dropped[] } {
  const level2 = (s: string) => s.replace(/\D/g, "").slice(0, 4);
  const read = new Set(args.reads.map(level2));
  const dropped: Dropped[] = [];
  const drafts = args.drafts.filter(d => {
    if (d.kind !== "scope" || d.packageId !== args.pkg.id || WORK_AT.test(d.title.toUpperCase())) return true;
    const items = lineItems(d.title);
    if (!items.length || items.some(i => read.has(level2(i.section)))) return true;
    const owners = items.map(i => args.owners(i.section).filter(o => o.id !== args.pkg.id));
    if (owners.some(list => !list.length)) return true;
    const names = [...new Set(owners.flat().map(o => o.name))].join(" or ");
    const what = items.map(i => `${i.words[0].toUpperCase()}${i.words.slice(1)} (${i.section})`).join(", ");
    dropped.push({ what: d.title, reason: `${what}: carried by ${names} on this project, and ${args.pkg.name} doesn't read ${items.length === 1 ? "that section" : "those sections"}, so this line from your bid forms is left to ${names}.` });
    return false;
  });
  return { drafts, dropped };
}

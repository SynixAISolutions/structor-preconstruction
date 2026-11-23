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
 * The tags a line names, normalised: "ACP-1", "F4", and the tags inside a range ("ACP-1 to ACP-5", "AWP-1..3",
 * "AWP-1 through 3"). Only capital letters count as a tag, so "Level 5" isn't one.
 */
export function namedTags(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z]{1,5})[- ]?(\d{1,3})([A-Z]?)\b/g)) out.add(canonical(m[1], m[2], m[3]));
  for (const m of text.matchAll(/\b([A-Z]{1,5})-(\d{1,3})\s*(?:to|through|thru|–|—|-|\.\.\.?)\s*(?:\1-?)?(\d{1,3})\b/g)) {
    const from = Number(m[2]), to = Number(m[3]);
    if (to > from && to - from <= 20) for (let n = from; n <= to; n++) out.add(canonical(m[1], String(n)));
  }
  return out;
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

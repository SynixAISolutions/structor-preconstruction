// The contractor's scope checklists (Marcel's issues log, item 17, 18 Nov: "See general scope for every single trade under
// templates - general scopes - we should have the general language be under every trade for every single project, this
// is different than the section you have for general language already in the software"; Features 2, priority 1). MCN
// keeps one Word checklist per trade ("09A – Drywall and ACT", "15D – Mechanical", a Division 10 file holding 10A Toilet
// Partitions to 10M Visual Display Boards): what the trade always carries (layout, blocking for wall-mounted items, the
// items it receives and installs) and what it never does ("Exclusions:"). Each checklist goes to the AI memory, the
// company's knowledge (Danial, 24 Nov: "we should give it to our AI as memory"): its lines as the trade's wording, its
// exclusions as "doesn't carry" rules, so every scan reads them. And because Marcel wants the language on every trade
// every time, not only when the AI copies it, the whole checklist is offered in its own order on each trade's bid form
// (lib/memory standardLines' screen). Pure; the server reads the Word file (app/api/checklist-text).
//
// The lines are kept as printed and in order, read the way MCN's 69 checklists are laid out:
//   - a lead-in ("Receiving … of materials furnished by others including the following:") keeps its sub-items as one
//     line, the items as its detail, from each paragraph's list level (lib/word-levels): "Toilet accessories." on its
//     own would read as work the trade furnishes;
//   - "Exclusions:" starts what the trade doesn't carry; "SCHEDULE MILESTONES:" ends the scope (its dates are filled in
//     per subcontract); "This Subcontract shall also include …" introduces the lines and isn't one;
//   - an editor's note on a line of its own ("[LIST ITEMS EXCLUDED IN ITEM NO. 2]") is left out, and the lines under one
//     ("[Use this item only if …]") are conditional;
//   - a line with blanks or a condition ("within ___ weeks", "[AS APPLICABLE]", "FOR PROJECTS WITH … ADD:") is marked
//     to fill in, so it isn't added to a bid form without an estimator settling it.
// Without levels (a pasted text, a file with no lists) every line stands alone, as printed.

import { matchStandardTrade, matchTradeByName } from "./bid-sheet-import";
import { entryApplies, lineCovered, MEMORY_LIMITS, projectMemory, tradeName, tradeTags, type MemoryEntry, type MemoryInput } from "./memory";
import { STANDARD_TRADES } from "./procurement";
import type { LeveledLine } from "./word-levels";

export type ChecklistSection = "includes" | "excludes";
/** One line: as printed, the sub-items it introduces, and whether it has blanks or a condition to settle per project. */
export type ChecklistLine = { text: string; items: string[]; section: ChecklistSection; order: number; fillIn: boolean };
/** One trade's checklist: `code` as the contractor files it ("09A"), its name, and the standard trade it matched. */
export type Checklist = { file: string; code: string; name: string; division: string; standard: string | null; lines: ChecklistLine[] };

/** What a file name adds after the trade: a review note, a status, a date ("REVIEWED 20120228", "FINAL", "6-13-2009"). */
const TRAILING_NOTE = /\s*[-–]?\s*(?:\b(?:final|draft|ept|partial)\b|\b\d{1,2}-\d{1,2}-\d{2,4}\b|\b\d{4}[.-]\d{2}[.-]\d{2}\b|\b\d{6,9}\b)\s*$/i;

/** "09A - Drywall and ACT.doc" / "15D – Mechanical 20090514 FINAL.doc" → code and name, dates and review notes dropped. */
export function checklistName(file: string): { code: string; name: string } {
  const base = file.replace(/\.[a-z0-9]+$/i, "").trim();
  const m = base.match(/^(\d{2}[A-Z]{0,2}(?:,[A-Z]{1,2})*)\s*[-–]\s*(.+)$/);
  let name = (m ? m[2] : base).replace(/\s*[-–]?\s*\b(?:scope\s+)?checklists?\b.*$/i, "").replace(/\s+\b(?:reviewed|approved)\b.*$/i, "");
  // "Final Cleaning" is a trade: only a status at the end is dropped.
  for (let before = ""; before !== name;) { before = name; name = name.replace(TRAILING_NOTE, ""); }
  return { code: m ? m[1] : "", name: name.replace(/\s+/g, " ").trim() };
}

/** A heading's name as people write it: "DRYWALL AND ACT" → "Drywall and ACT"; a name already in mixed case stays. */
const readable = (name: string, like = "") => {
  if (name !== name.toUpperCase()) return name;
  if (like && tradeName(like) === tradeName(name)) return like;
  return name.toLowerCase().replace(/^./, c => c.toUpperCase());
};

/** "Division 10" / "SCOPE CHECKLIST" / a page number / "Etc.": printed around the lines, not one of them. */
const NOT_A_LINE = /^(\d{1,3}|scope checklists?|checklists?|division \d{1,2}|etc\.?…?\.*)$/i;
const EXCLUSIONS = /^(exclusions?|items? not included|not included)\s*:?$/i;
/** Where the scope ends: the schedule, whose dates are filled in per subcontract ("SCHEDULE MILESTONES:", or its first
 * line "Time is of the essence …" where the heading is missing). */
const SCHEDULE = /^schedule(?:\s+milestones)?\s*:?$|^time is of the essence\b/i;
/** "This Subcontract shall also include, but is not limited to, the items listed below:" introduces the lines. */
const PREAMBLE = /^this subcontract shall (?:also )?include\b/i;
/** An editor's note on a line of its own: "[LIST ITEMS EXCLUDED IN ITEM NO. 2]", "[Use this item only if …]". */
const NOTE = /^\[[^\]]*\]?[.:]?$/;
/** A blank or a condition to settle per project: "[AS APPLICABLE]", "___ weeks", "xxxxx (00)", "$00.00", "FOR PROJECTS WITH … ADD:". */
const FILL_IN = /\[|_{3,}|\bx{3,}\b|(?<![\d$.,:/])0{2,}(?![\d:,/])|\$\s?0+\.0+|\bas appl(?:ies|icable)\b|^for projects with\b/i;
/**
 * The template's capitalised placeholders: "EXAMPLE …", "XXXX XX, 20XX", "AMOUNT IN WORDS", "including DESCRIPTION",
 * "($ .00)", "Description……". A written amount ("FIFTY DOLLARS ($50.00)") is a real figure, not a blank.
 */
const PLACEHOLDER = /\bEXAMPLE\b|\bX{2,}\b|\d0XX\b|\bAMOUNT IN WORDS\b|\bDESCRIPTION\b|\$\s*\.00\b|…{2,}|\.{4,}/;
/** Whether a line has blanks or a condition an estimator settles for the project before it goes on a bid form. */
export const needsFilling = (text: string) => FILL_IN.test(text) || PLACEHOLDER.test(text);
/** A list's lead-in short enough to stand before each of its items ("INSPECTIONS", "Site concrete Work as follows:"). */
const LABEL_CHARS = 60;
/** A lead-in its items narrow ("…, excluding only the following:"): split, each item alone would read as the only one. */
const NARROWS = /\b(?:exclud|except)/i;
/** A trade heading inside a file: "10B – Louvers", "09A – DRYWALL AND ACT". Short and with no full stop, so a line isn't one. */
const HEADING = /^(\d{2}[A-Z]{1,2})\s*[-–]\s*([A-Za-z][^.:]{1,60})$/;
/** A Markdown copy's escapes ("wall\-mounted", "\[by others\]"); Word's own text has none. */
const MARKDOWN_ESCAPE = /\\([\\`*_{}[\]()#+\-.!>|~])/g;

/**
 * The trade checklists in one file: its lines with their list levels (app/api/checklist-text), or its text without
 * them. One checklist per trade heading after "SCOPE CHECKLIST" (a Division 10 file holds eight), else one for the
 * file. Lines after "Exclusions:", or starting "Exclude", are the trade's exclusions; a line printed twice in a section
 * is kept once. A checklist with no lines is left out.
 */
export function readChecklists(input: string | LeveledLine[], file: string): Checklist[] {
  const raw: LeveledLine[] = typeof input === "string" ? input.split(/\r?\n/).map(text => ({ text, level: null, list: null })) : input;
  const lines = raw.map(l => ({ text: l.text.replace(MARKDOWN_ESCAPE, "$1").replace(/\s+/g, " ").trim(), level: l.level, list: l.list ?? null })).filter(l => l.text);
  const start = lines.findIndex(l => /^scope checklists?$/i.test(l.text));
  const header = start >= 0 ? lines.slice(0, start) : [];
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const fromFile = checklistName(file);
  // The file's own title ("09A – DRYWALL AND ACT"), unless it lists several trades ("10A – Toilet Partitions, 10B - …").
  const title = header.map(l => l.text.match(HEADING)).find(m => m && !/,/.test(m[2]));
  type Draft = { text: string; section: ChecklistSection; fillIn: boolean; items: { text: string; fillIn: boolean }[] };
  const out: Checklist[] = [];
  let current = { code: title?.[1] ?? fromFile.code, name: readable(title?.[2].trim() ?? fromFile.name, fromFile.name), drafts: [] as Draft[] };
  let section: ChecklistSection = "includes";
  let ended = false;
  /** The last line, whose deeper lines are its items; `nested`: a list started under one of its items. */
  let parent: { draft: Draft; level: number | null; list: number | null; nested: number | null } | null = null;
  /** An editor's note ("[Use this item only if …]") the lines below it, deeper in its list, are conditional on. */
  let note: { level: number; list: number | null } | null = null;
  const push = () => {
    const lines = current.drafts.flatMap(expand);
    for (const s of ["includes", "excludes"] as const) lines.filter(l => l.section === s).forEach((l, i) => { l.order = i + 1; });
    if (lines.length) out.push({ file, code: current.code, name: current.name, division: "", standard: null, lines });
  };
  /** Whether a line is an item of the open line: deeper in its list, or in a list begun under it ("…the following:"). */
  const itemOf = (p: NonNullable<typeof parent>, line: (typeof lines)[number]) => {
    if (line.level === null || p.level === null || line.list === null) return false;
    if (line.list === p.list) return line.level > p.level;
    const last = p.draft.items.at(-1)?.text ?? p.draft.text;
    if (p.nested === line.list || /:$/.test(last)) { p.nested = line.list; return true; }
    return false;
  };
  for (const line of body) {
    const heading = line.text.match(HEADING);
    if (heading && !/^exclu/i.test(heading[2])) {
      if (heading[1] === current.code && !current.drafts.length) continue; // the title printed again
      push();
      current = { code: heading[1], name: readable(heading[2].trim()), drafts: [] };
      section = "includes"; ended = false; parent = null; note = null;
      continue;
    }
    if (ended) continue;
    if (SCHEDULE.test(line.text)) { ended = true; continue; }
    if (EXCLUSIONS.test(line.text)) { section = "excludes"; parent = null; note = null; continue; }
    if (PREAMBLE.test(line.text)) { parent = null; continue; }
    if (note && !(line.level !== null && line.list === note.list && line.level > note.level)) note = null;
    const isItem = !!parent && itemOf(parent, line);
    if (NOTE.test(line.text)) {
      // A note among a list's items ("[List other monitoring areas here]") leaves the list for the estimator to finish.
      if (isItem) parent!.draft.fillIn = true;
      else { note = line.level === null ? null : { level: line.level, list: line.list }; parent = null; }
      continue;
    }
    if (NOT_A_LINE.test(line.text) || line.text.length < 3) continue;
    const fillIn = !!note || needsFilling(line.text);
    if (parent && isItem) {
      const item = line.text.slice(0, 480);
      if (!parent.draft.items.some(i => i.text.toLowerCase() === item.toLowerCase())) parent.draft.items.push({ text: item, fillIn });
      continue;
    }
    const exclude = line.text.match(/^exclude[ds]?\s+(.+)$/i);
    const text = exclude ? exclude[1].replace(/^./, c => c.toUpperCase()) : line.text.slice(0, 480);
    const lineSection: ChecklistSection = exclude ? "excludes" : section;
    if (current.drafts.some(l => l.section === lineSection && l.text.toLowerCase() === text.toLowerCase())) { parent = null; continue; }
    const draft: Draft = { text, section: lineSection, fillIn, items: [] };
    current.drafts.push(draft);
    parent = { draft, level: line.level, list: line.list, nested: null };
  }
  push();
  return out.map(list => {
    const division = list.code.slice(0, 2);
    return { ...list, division, standard: matchChecklistTrade(division, list.name) };
  });
}

/**
 * A line as it goes on a bid form. A short lead-in that lists ("INSPECTIONS", "Site concrete Work as follows:") stands
 * before each of its items, so each is a line of its own; a long one, or one its items narrow ("…, excluding only the
 * following:"), keeps them as one line, the items its detail.
 */
function expand(d: { text: string; section: ChecklistSection; fillIn: boolean; items: { text: string; fillIn: boolean }[] }): ChecklistLine[] {
  if (!d.items.length) return [{ text: d.text, items: [], section: d.section, order: 0, fillIn: d.fillIn }];
  if (d.text.length > LABEL_CHARS || NARROWS.test(d.text))
    return [{ text: d.text, items: d.items.map(i => i.text), section: d.section, order: 0, fillIn: d.fillIn || d.items.some(i => i.fillIn) }];
  const label = readable(d.text);
  return d.items.map(item => ({ text: `${label}${/:$/.test(label) ? "" : ":"} ${item.text}`.slice(0, 480), items: [], section: d.section, order: 0, fillIn: d.fillIn || item.fillIn }));
}

/**
 * MasterFormat 1995's divisions that 2004 renumbered, which MCN's checklists still use, and where their work went:
 * 02 Site Construction to 31–33, 15 Mechanical to 21–23, 16 Electrical to 26–28, and 17 (IT systems) to 27. Divisions
 * 03–14 kept their work.
 */
const RENUMBERED: Record<string, string[]> = { "02": ["31", "32", "33"], "15": ["21", "22", "23"], "16": ["26", "27", "28"], "17": ["27"] };

/**
 * The standard trade a checklist is for. Its division first, as a bid sheet's tab is matched; in a renumbered
 * division (or one with no Structor trade), then by name among the divisions its work went to, then in any; last, the
 * division's whole-division trade (10A Toilet Partitions → Specialties). Null when nothing decides: "09H Terrazzo"
 * isn't guessed into Flooring.
 */
export function matchChecklistTrade(division: string, name: string): string | null {
  const inDivision = division ? matchStandardTrade(division, name) : null;
  if (inDivision) return inDivision;
  const pool = STANDARD_TRADES.filter(t => t.code.slice(0, 2) === division);
  const moved = RENUMBERED[division];
  if (moved || !pool.length) return matchTradeByName(name, STANDARD_TRADES.filter(t => moved?.includes(t.code.slice(0, 2)))) ?? matchTradeByName(name);
  return pool.find(t => /00 00$/.test(t.code))?.id ?? null;
}

/** A file's name as it goes into a memory event: "09a drywall and act doc". */
const slug = (file: string) => tradeName(file).slice(0, 60);
/** The event that marks an entry as a checklist line: which file and trade, which section, which line. */
export const checklistEvent = (file: string, code: string, section: ChecklistSection, order: number) => `checklist:${slug(file)}:${code}:${section}:${order}`;
const EVENT = /^checklist:([^:]*):([^:]*):(includes|excludes):(\d+)$/;
/** A lead-in's sub-items as one detail: "Toilet accessories; Access doors and frames." */
export const itemsDetail = (items: string[]) => {
  const parts = items.map(i => i.replace(/[.;]+$/, ""));
  // A nested lead-in ("The following specialty items:") runs on into its own items.
  return parts.length ? `${parts.map((p, i) => i === parts.length - 1 ? p : `${p}${/:$/.test(p) ? " " : "; "}`).join("")}.`.slice(0, MEMORY_LIMITS.detail) : "";
};

/**
 * What one checklist adds to the memory, as proposals: each line it carries as the trade's wording (an example), each
 * exclusion as a "doesn't carry" rule, tagged like a bid sheet's tab so they find the trade on every project; a
 * lead-in's sub-items are its detail. `standard`: the Structor trade it was matched to, or null for its own name.
 */
export function checklistEntries(list: Checklist, standard: string | null): MemoryInput[] {
  const std = standard ? STANDARD_TRADES.find(t => t.id === standard) ?? null : null;
  const label = std ? std.name : list.name;
  const trades = [...new Set([...(std ? tradeTags(std) : []), tradeName(list.name)])];
  const source = { trade: label, file: list.file.slice(0, 120), checklist: `${list.code} ${list.name}`.trim().slice(0, 120) };
  return list.lines.map(line => line.section === "includes"
    ? { kind: "example" as const, origin: "import" as const, trades, source, events: [checklistEvent(list.file, list.code, "includes", line.order)], text: line.text, detail: itemsDetail(line.items) }
    : { kind: "rule" as const, origin: "import" as const, trades, source, events: [checklistEvent(list.file, list.code, "excludes", line.order)], detail: itemsDetail(line.items),
      text: `${label} doesn't carry: ${line.text.replace(/\.+$/, "")}${/:$/.test(line.text) ? "" : "."}`.slice(0, 500) });
}

/** Whether an entry came from a scope checklist (it may also be on bid forms, when the wording is the same). */
export const isChecklistEntry = (e: Pick<MemoryEntry, "events">) => e.events.some(x => EVENT.test(x));

/**
 * One line of a trade's checklist on a bid form: `title` as it goes on the form ("Excluded: …" for an exclusion),
 * `detail` its sub-items, `fillIn` when it has blanks or a condition to settle on this project first.
 */
export type ChecklistFormLine = { text: string; title: string; detail: string; excluded: boolean; fillIn: boolean };
/** A checklist as a trade's bid form offers it: which one ("09A Drywall and ACT"), from which file, its lines in order. */
export type TradeChecklist = { name: string; file: string; lines: ChecklistFormLine[] };

/**
 * The scope checklists a trade's bid form offers on one project (the project's overrides applied, lib/memory
 * projectMemory): each checklist with its lines in the printed order, what the trade carries first, then its
 * exclusions; a line the form already has (`existing`: its items' titles and details, the same test as standard lines)
 * is left out, and so is a checklist with nothing left.
 */
export function tradeChecklists(entries: MemoryEntry[], target: { code: string; name: string }, projectId: string, existing: string[]): TradeChecklist[] {
  const lists = new Map<string, { name: string; file: string; lines: (ChecklistFormLine & { section: ChecklistSection; order: number })[] }>();
  for (const e of projectMemory(entries, projectId)) {
    if (!isChecklistEntry(e) || !entryApplies(e, { projectId, ...target })) continue;
    const marks = e.events.map(x => x.match(EVENT)).filter((m): m is RegExpMatchArray => !!m);
    const first = marks.sort((a, b) => Number(a[4]) - Number(b[4]))[0];
    const key = `${first[1]}:${first[2]}`;
    const excluded = first[3] === "excludes";
    const text = excluded ? e.text.replace(/^.*? doesn't carry: /, "").replace(/\.$/, "") : e.text;
    const list = lists.get(key) ?? { name: first[2], file: first[1], lines: [] };
    // A line also on a bid sheet keeps that sheet's source; the checklist's own entries name it.
    if (e.source.checklist) Object.assign(list, { name: String(e.source.checklist), file: String(e.source.file ?? list.file) });
    if (!list.lines.some(l => l.text === text && l.excluded === excluded))
      list.lines.push({ text, title: excluded ? `Excluded: ${text}` : text, detail: e.detail, excluded, fillIn: needsFilling(`${text} ${e.detail}`), section: first[3] as ChecklistSection, order: Number(first[4]) });
    lists.set(key, list);
  }
  return [...lists.values()].map(list => ({
    name: list.name, file: list.file,
    lines: list.lines.filter(l => !lineCovered(l.title, existing)).sort((a, b) => (a.section === b.section ? 0 : a.section === "includes" ? -1 : 1) || a.order - b.order)
      .map(({ text, title, detail, excluded, fillIn }) => ({ text, title, detail, excluded, fillIn })),
  })).filter(list => list.lines.length).sort((a, b) => a.name.localeCompare(b.name));
}

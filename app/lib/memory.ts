// Structor's AI memory (Danial, 23 Nov: "an AI agent that keeps context always so for next scan or extract it knows
// exactly what to extract"). No model remembers between requests, so the memory lives here, in the database
// (lib/memory-store), and every scan reads the part that applies before it starts. One entry is one thing learned:
//
//   rule      how this contractor splits or treats work ("Put acoustic ceiling panels in Drywall, not Ceilings")
//   example   how a line is worded on this contractor's bid forms
//   decision  something settled on one project ("Owner provides FF&E")
//   assignment  a specification section a trade carries, the contractor's trade split ("Drywall carries 06 16 00
//            Sheathing"): read when each trade gets its sections (rememberedSections, lib/project-scopes) and when the
//            AI sets the bid packages (planMemory), not only as words in a scan
//
// An estimator's own entry is approved at once. One learned from a correction (lib/memory-learn) is only proposed,
// and the AI never reads a proposed or retired entry: one bad correction can't teach it something wrong. Each entry is
// tagged with the trades it concerns (code and name, none for every trade) and its project (none for the whole
// company), which is what the database indexes and what contextPack picks by. Pure: shared by the server and browser.

export const MEMORY_KINDS = ["rule", "example", "decision", "assignment"] as const;
export const MEMORY_STATUSES = ["proposed", "approved", "retired"] as const;
export const MEMORY_ORIGINS = ["estimator", "correction", "import"] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export type MemoryStatus = typeof MEMORY_STATUSES[number];
export type MemoryOrigin = typeof MEMORY_ORIGINS[number];

export type MemoryEvent = { at: string; by: string; action: "added" | "proposed" | "seen-again" | "approved" | "retired" | "restored" | "edited" };
export type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  status: MemoryStatus;
  origin: MemoryOrigin;
  /** The project it belongs to; null for the whole company. */
  projectId: string | null;
  /** The trades it concerns, by code and by name ("09 29 00", "drywall"); empty for every trade. */
  trades: string[];
  /** The specification section it is about, "09 51 13", when there is one. */
  section: string | null;
  text: string;
  detail: string;
  /** How many corrections pointed at it. */
  seen: number;
  /** The corrections behind it, so learning the same one twice changes nothing. */
  events: string[];
  /** Where it came from: the project, the line, the trades a move went between. */
  source: Record<string, string>;
  history: MemoryEvent[];
  version: number;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
};

export type MemoryInput = {
  kind: MemoryKind; text: string; detail?: string; projectId?: string | null; trades?: string[]; section?: string | null;
  origin?: MemoryOrigin; source?: Record<string, string>; events?: string[];
};
/** What an estimator can change on an entry. */
export type MemoryChange = { status?: MemoryStatus; text?: string; detail?: string; trades?: string[]; section?: string | null };

export class MemoryRuleError extends Error { constructor(message: string) { super(message); this.name = "MemoryRuleError"; } }
const fail = (message: string): never => { throw new MemoryRuleError(message); };

const PROJECT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SECTION = /^\d{2} \d{2} \d{2}(?:\.\d{1,2})?$/;
// A detail holds up to 2,000 characters: a scope checklist's lead-in keeps all its sub-items there (16A Electrical's temporary
// work lists 17, about 1,600 characters; lib/scope-checklist).
export const MEMORY_LIMITS = { text: 500, detail: 2000, trades: 12, tag: 80, events: 200, sourceValue: 300 };

/** A trade name as memory stores and matches it: "Doors, frames & hardware" → "doors frames and hardware". */
export const tradeName = (name: string) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** A trade's tags: its CSI code and its name, so an entry still finds a project whose package has another code. */
export const tradeTags = (pkg: { code: string; name: string }): string[] => [...new Set([pkg.code.trim(), tradeName(pkg.name)].filter(Boolean))];
const clean = (s: unknown, max: number) => typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** A checked entry to save. Throws a MemoryRuleError with a message to show. */
export function cleanMemoryInput(raw: MemoryInput): Required<MemoryInput> & { status: MemoryStatus } {
  const kind = (MEMORY_KINDS as readonly string[]).includes(raw?.kind) ? raw.kind : fail("Choose a rule, an example or a project decision.");
  const text = clean(raw.text, MEMORY_LIMITS.text);
  if (text.length < 3) fail("Write what the AI should know.");
  const projectId = raw.projectId === undefined || raw.projectId === null || raw.projectId === "" ? null : PROJECT.test(raw.projectId) ? raw.projectId : fail("That project id isn't valid.");
  if (kind === "decision" && !projectId) fail("A decision belongs to one project: open the project first.");
  const trades = [...new Set((Array.isArray(raw.trades) ? raw.trades : []).map(t => clean(t, MEMORY_LIMITS.tag)).filter(Boolean))].slice(0, MEMORY_LIMITS.trades);
  const section = raw.section ? (SECTION.test(raw.section.trim()) ? raw.section.trim() : fail("Write the specification section as 09 51 13.")) : null;
  if (kind === "assignment" && (!section || !trades.length)) fail("A trade split names the trade and the specification section it carries.");
  const origin = raw.origin && (MEMORY_ORIGINS as readonly string[]).includes(raw.origin) ? raw.origin : "estimator";
  const source = Object.fromEntries(Object.entries(raw.source ?? {}).filter(([k, v]) => /^[a-zA-Z]{1,30}$/.test(k) && typeof v === "string").slice(0, 12).map(([k, v]) => [k, clean(v, MEMORY_LIMITS.sourceValue)]));
  const events = [...new Set((raw.events ?? []).filter(e => typeof e === "string" && e.length <= 200))].slice(0, MEMORY_LIMITS.events);
  // An estimator writing it is the review; anything learned or imported waits for one.
  return { kind, text, detail: clean(raw.detail, MEMORY_LIMITS.detail), projectId, trades, section, origin, source, events, status: origin === "estimator" ? "approved" : "proposed" };
}

/** Two entries are the same when their kind, project, trades and words match, whatever the case and punctuation. */
export function dedupeKey(input: Pick<MemoryInput, "kind" | "projectId" | "trades" | "text">): string {
  const words = input.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return [input.kind, input.projectId || "*", [...(input.trades ?? [])].map(t => t.toLowerCase()).sort().join(",") || "*", words].join("|");
}

/** Whether an approved entry applies when reading `target`'s trade on its project. */
export function entryApplies(entry: Pick<MemoryEntry, "status" | "projectId" | "trades">, target: { projectId: string; code: string; name: string }): boolean {
  if (entry.status !== "approved") return false;
  if (entry.projectId && entry.projectId !== target.projectId) return false;
  if (!entry.trades.length) return true;
  const tags = tradeTags(target).map(t => t.toLowerCase());
  return entry.trades.some(t => tags.includes(t.toLowerCase()));
}

// ── One project's memory ─────────────────────────────────────────────────────
// Company-wide entries are the contractor's usual practice; a project can differ (Whittier, 23 Nov: its Doors trade
// carries the glass in wood doors, which Jelleff's sheet leaves to others). Two overrides, read by every scan:
//   - a project's own imported bid sheet replaces the company-wide import for each trade it covers;
//   - "Not on this project": a decision on the project that names a company-wide entry (source.overrides) hides that
//     entry there, and tells the AI why.
// Estimators' own entries and corrections are never dropped by an import.

/** The text of a "Not on this project" decision for an entry. */
export const notHereText = (entry: Pick<MemoryEntry, "text">) => `Not on this project: ${entry.text}`.slice(0, MEMORY_LIMITS.text);

/** An entry imported from a scope checklist (lib/scope-checklist), not from a bid form or a review. */
export const fromChecklist = (e: Pick<MemoryEntry, "events">) => e.events.some(x => x.startsWith("checklist:"));

/** The approved entries a project reads, with its overrides applied. Every reader of the memory starts here. */
/**
 * Imported bid sheets a project leaves out of its scans (Danial, 25 Nov: a new project is tested on MCN's own documents
 * for it, whose bid sheet is already in the memory, so scans would read their own answers). A sheet is the one its
 * events name: "import:<sheet>:<tab>:<kind>:<n>" (lib/bid-sheet-import). Pure; lib/memory-client applies them to every scan.
 */
const eventSheet = (event: string): string | null => /^import:([^:]+):/.exec(event)?.[1] ?? null;
/** The sheets the entries came from, with how many entries each gave, most first. */
export function bidSheets(entries: Pick<MemoryEntry, "events">[]): { sheet: string; entries: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const sheet of new Set((entry.events ?? []).map(eventSheet).filter((s): s is string => !!s))) counts.set(sheet, (counts.get(sheet) ?? 0) + 1);
  return [...counts].map(([sheet, n]) => ({ sheet, entries: n })).sort((a, b) => b.entries - a.entries || a.sheet.localeCompare(b.sheet));
}
/**
 * The entries without those that came only from left-out sheets. One also given by another sheet, learned from a
 * correction or added by an estimator stays: the rest of the memory supports it without the sheet.
 */
export function leaveOutSheets(entries: MemoryEntry[], sheets: string[]): MemoryEntry[] {
  if (!sheets.length) return entries;
  const out = new Set(sheets);
  return entries.filter(entry => {
    const from = (entry.events ?? []).map(eventSheet);
    return entry.origin !== "import" || !from.length || from.some(sheet => sheet === null || !out.has(sheet));
  });
}

export function projectMemory(entries: MemoryEntry[], projectId: string): MemoryEntry[] {
  const live = entries.filter(e => e.status === "approved" && (!e.projectId || e.projectId === projectId));
  const own = live.filter(e => e.projectId === projectId);
  const hidden = new Set(own.map(e => e.source.overrides).filter(Boolean));
  const ownSheetTrades = new Set(own.filter(e => e.origin === "import").flatMap(e => e.trades.map(t => t.toLowerCase())));
  // A scope checklist (lib/scope-checklist) is the language every project carries, so a project's own sheet doesn't replace it.
  const replaced = (e: MemoryEntry) => !e.projectId && e.origin === "import" && !fromChecklist(e) && e.trades.some(t => ownSheetTrades.has(t.toLowerCase()));
  return live.filter(e => !hidden.has(e.id) && !replaced(e));
}

export const PACK_CHARS = 6_000;
const byWeight = (a: MemoryEntry, b: MemoryEntry) => b.seen - a.seen || a.text.localeCompare(b.text);
/** The contractor's bid forms and reviews before its scope checklists, then most-confirmed first. */
const bidFormsFirst = (a: MemoryEntry, b: MemoryEntry) => Number(fromChecklist(a)) - Number(fromChecklist(b)) || byWeight(a, b);

/**
 * What the AI reads before a trade's scan: the approved entries that apply, most specific first (this project's
 * decisions, this trade's rules, rules for every trade, then wording examples), each list most-confirmed first, within
 * `maxChars` (examples give way first). The scope checklists come last: every scan already checks each of their lines
 * against the pages (lib/memory-check), and they are the older, general wording, so they never push the contractor's
 * current bid forms out of the pack (Whittier Drywall, 24 Nov: their 11 exclusions put first cut the bid-form lines
 * shown from 14 to 2, and the scan found 44 of Marcel's 69 lines against 48 to 52 before). Empty when nothing applies,
 * so a scan without memory reads exactly as before.
 */
export function contextPack(entries: MemoryEntry[], target: { projectId: string; code: string; name: string }, maxChars = PACK_CHARS): string {
  const apply = projectMemory(entries, target.projectId).filter(e => entryApplies(e, target));
  const bidForms = apply.filter(e => !fromChecklist(e)), checklist = apply.filter(fromChecklist);
  const groups: [string, MemoryEntry[]][] = [
    ["Decisions on this project", bidForms.filter(e => e.kind === "decision").sort(byWeight)],
    [`Specification sections ${target.name} carries on this contractor's bid forms`, bidForms.filter(e => e.kind === "assignment").sort((a, b) => (a.section ?? "").localeCompare(b.section ?? ""))],
    [`Rules for ${target.name}`, bidForms.filter(e => e.kind === "rule" && e.trades.length).sort(byWeight)],
    ["Rules for every trade", bidForms.filter(e => e.kind === "rule" && !e.trades.length).sort(byWeight)],
    [`Lines this contractor's bid forms give ${target.name} (scope it carries, in its words; a specific line here wins over a general exclusion of the same work)`, bidForms.filter(e => e.kind === "example" && e.origin === "import").sort(byWeight)],
    [`How ${target.name} lines are worded on this contractor's bid forms`, bidForms.filter(e => e.kind === "example" && e.origin !== "import").sort(byWeight)],
    [`What ${target.name} leaves to others on this contractor's standard scope checklist (its bid forms above win)`, checklist.filter(e => e.kind === "rule").sort(byWeight)],
    [`Lines on this contractor's standard scope checklist for ${target.name}`, checklist.filter(e => e.kind !== "rule").sort(byWeight)],
  ];
  const head = "This contractor's memory: rules and examples its estimators approved on earlier projects and reviews.";
  const lines: string[] = [head];
  let used = head.length, left = 0;
  for (const [title, list] of groups) {
    if (!list.length) continue;
    const block: string[] = [];
    for (const e of list) {
      const line = `- ${e.text}${e.detail ? ` (${e.detail.slice(0, 240)})` : ""}${e.section ? ` [${e.section}]` : ""}`;
      if (used + title.length + line.length + 2 > maxChars) { left++; continue; }
      if (!block.length) { block.push(`${title}:`); used += title.length + 2; }
      block.push(line); used += line.length + 1;
    }
    lines.push(...block);
  }
  if (lines.length === 1) return "";
  if (left) lines.push(`(${left} more not shown: over the memory's length limit.)`);
  return lines.join("\n");
}

// ── In the AI's requests ─────────────────────────────────────────────────────

/** The longest memory a scan request carries (a little over PACK_CHARS, for the header lines). */
export const MEMORY_REQUEST_CHARS = 8_000;
/** The system line a reading job adds when its request carries the contractor's memory; nothing when it doesn't. */
export const MEMORY_PROMPT_RULE = "If the contractor's memory is supplied, follow it: which trade carries what, what to leave out, and how lines are worded on this contractor's bid forms. It came from this contractor's estimators. Where an entry for this project differs from the company-wide ones, follow this project's. A specific line the contractor's bid forms give a trade (glass integrated in wood doors) wins over a general exclusion of the same work (glass lites in doors). It never replaces evidence: every item still needs its quote from the source, and work the source doesn't require is still left out.";
/** The memory as the request carries it, checked: a string of at most MEMORY_REQUEST_CHARS, or undefined. */
export function memoryField(raw: unknown, fail: (message: string) => never): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || raw.length > MEMORY_REQUEST_CHARS) fail("The contractor's memory sent with this reading is too long.");
  return (raw as string).trim() || undefined;
}
/** The memory's place in the request, before the source it is read with. */
export const memoryBlock = (memory: string | undefined) => memory ? `Contractor's memory (approved by its estimators; source text stays the evidence):\n${memory}\n\n` : "";

// ── The trade split ──────────────────────────────────────────────────────────

/**
 * Whether a remembered section covers one of a project's sections: the same number, or for a level-2 number ("06 16 00
 * Sheathing") every section under it ("06 16 43 Gypsum Sheathing"); a decimal suffix ("07 42 10.11") goes with its base.
 */
export function sectionCovers(remembered: string, section: string): boolean {
  const base = (s: string) => s.trim().replace(/\.\d+$/, "");
  const r = base(remembered), p = base(section);
  return r === p || (/ 00$/.test(r) && !/ 00 00$/.test(r) && p.slice(0, 5) === r.slice(0, 5));
}

/** A project package and the remembered entries that name it: by its code or its name. */
const packageTags = (pkg: { code: string; name: string }) => tradeTags(pkg).map(t => t.toLowerCase());

/**
 * A rule that gives a trade part of a section: "<trade> carries the parts of <section> … that apply to it" (a bid
 * form's "as applicable to this Bid Package") or "Section <n> is split: …" (an estimator's Section coverage split).
 */
export function partClaim(e: Pick<MemoryEntry, "kind" | "section" | "text">): boolean {
  return e.kind === "rule" && !!e.section && (/\bcarries the parts of\b/i.test(e.text) || /^Section \d{2} \d{2} \d{2}(?:\.\d{1,2})? is split:/i.test(e.text));
}

/**
 * The approved trade split as it applies to a project's packages (Marcel's bid forms, 23 Nov):
 * - `byPackage`: the sections a remembered split gives each package. A section several trades carry on the forms
 *   (joint sealants and firestopping on every envelope trade, insulation on four) goes to each of them, and each
 *   writes its own part.
 * - `partial`: sections a package reads only for its part ("as applicable": Drywall installs the doors that Doors
 *   furnishes). Whoever carries the section in full still reads it.
 */
export function rememberedSections(entries: MemoryEntry[], packages: { id: string; code: string; name: string }[], projectId: string, sections: string[]): { byPackage: Map<string, string[]>; partial: Map<string, string[]> } {
  const live = projectMemory(entries, projectId).filter(e => e.section);
  const claims = (pick: (e: MemoryEntry) => boolean) => {
    const out = new Map<string, Set<string>>();
    for (const section of sections) for (const e of live) {
      if (!pick(e) || !sectionCovers(e.section!, section)) continue;
      const tags = e.trades.map(t => t.toLowerCase());
      for (const pkg of packages) if (packageTags(pkg).some(t => tags.includes(t))) out.set(section, (out.get(section) ?? new Set()).add(pkg.id));
    }
    return out;
  };
  const full = claims(e => e.kind === "assignment"), part = claims(partClaim);
  const byPackage = new Map<string, string[]>(), partial = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, id: string, section: string) => map.set(id, [...(map.get(id) ?? []), section]);
  for (const [section, ids] of full) for (const id of ids) add(byPackage, id, section);
  for (const [section, ids] of part) for (const id of ids) if (!full.get(section)?.has(id)) add(partial, id, section);
  return { byPackage, partial };
}

/** What a trade's own approved rules say it doesn't carry ("Demolition doesn't carry: Site Demo." gives "Site Demo"). */
export function leftOut(entries: MemoryEntry[], target: { code: string; name: string }, projectId: string): string[] {
  return projectMemory(entries, projectId).filter(e => e.kind === "rule" && e.trades.length && entryApplies(e, { projectId, ...target }))
    .flatMap(e => { const m = e.text.match(/\bdoesn['’]t carry:?\s*(.+?)\.?$/i); return m ? [m[1]] : []; });
}

// ── Whether a bid form already has a line ───────────────────────────────────
// Every scan checks the contractor's lines against the project (lib/memory-check): Danial, 24 Nov, a line goes on a bid
// form only where the project's documents support it, so nothing offers memory lines for adding by hand.

/** A line's meaningful words, for telling whether a bid form already has it (lineCovered) or a page mentions it (lib/memory-check). */
export const lineWords = (s: string) => new Set(s.toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(w => w.length > 2 && !["and", "the", "for", "all", "with", "per", "include", "provide", "furnish", "install"].includes(w)));
/** Whether a bid form already has a line: most of its words (80%) are in one of the form's items (`existing`: their titles and details). */
export function lineCovered(text: string, existing: string[]): boolean {
  const w = [...lineWords(text)];
  return !w.length || existing.some(item => { const have = lineWords(item); return w.filter(x => have.has(x)).length / w.length >= 0.8; });
}

/** The longest note on shared sections a trade's scan carries, so it and the memory stay within MEMORY_REQUEST_CHARS. */
const SHARING_CHARS = 1_800;

/**
 * What one trade's scan reads from the memory: first the drawing sheets other trades' exclusions handed it
 * (lib/project-scopes sheetsByTrade), then the sections it shares (the ones it reads only for its part, and the ones
 * other trades read too), then its contextPack. `readers`: each section the trade reads, with every package reading it
 * (lib/project-scopes sectionsByTrade, inverted). Empty when there is nothing, as before the memory.
 */
export function tradeMemory(entries: MemoryEntry[], target: { id: string; code: string; name: string }, projectId: string,
  sections: { section: string; title?: string }[], readers: Map<string, { id: string; name: string }[]>, partial: string[] = [],
  handed: { sheet: string; title: string; work: string; from: string }[] = []): string {
  const blocks: [string, string[]][] = [
    [`Drawing sheets given to ${target.name} because another trade doesn't carry their work on this contractor's bid forms (write ${target.name}'s lines for that work):`,
      handed.map(h => `- ${h.sheet} ${h.title}: ${h.work} (${h.from} doesn't carry it).`)],
    [`Sections ${target.name} shares with other trades on this contractor's bid forms (write only ${target.name}'s part of each; leave the rest to the others):`,
      sections.flatMap(s => {
        const others = (readers.get(s.section) ?? []).filter(p => p.id !== target.id).map(p => p.name);
        const part = partial.includes(s.section);
        if (!part && !others.length) return [];
        return [`- ${s.section}${s.title ? ` ${s.title}` : ""}: ${part ? `${target.name} carries only the parts that apply to its own work` : `${target.name} carries its own part`}${others.length ? `; also read for ${others.join(", ")}` : ""}.`];
      })],
  ];
  let note = "";
  for (const [title, lines] of blocks) {
    if (!lines.length || note.length + title.length + 2 > SHARING_CHARS) continue;
    note += `${note ? "\n" : ""}${title}`;
    for (const line of lines) { if (note.length + line.length + 1 > SHARING_CHARS) { note += "\n(more not shown)"; break; } note += `\n${line}`; }
  }
  const pack = contextPack(entries, { projectId, code: target.code, name: target.name });
  return [note, pack].filter(Boolean).join("\n\n");
}

/**
 * The trade split and the trades' exclusions as the AI reads them when it sets a project's bid packages: one line per
 * trade with the sections it carries, then what trades leave to others. Empty when there is none.
 */
export function planMemory(entries: MemoryEntry[], projectId: string, maxChars = PACK_CHARS): string {
  const live = projectMemory(entries, projectId);
  const label = (e: MemoryEntry) => e.source.trade || e.trades.find(t => !/^\d/.test(t)) || e.trades[0] || "Every trade";
  const byTrade = new Map<string, string[]>();
  for (const e of live.filter(e => e.kind === "assignment" && e.section)) byTrade.set(label(e), [...(byTrade.get(label(e)) ?? []), e.section!]);
  const lines: string[] = [];
  if (byTrade.size) lines.push("Trades this contractor buys, with the specification sections each carries (its own bid forms; follow this split over the general rules):",
    ...[...byTrade].sort((a, b) => a[0].localeCompare(b[0])).map(([trade, sections]) => `- ${trade}: ${[...new Set(sections)].sort().join(", ")}`));
  const rules = live.filter(e => e.kind === "rule" && e.trades.length);
  if (rules.length) lines.push("What trades carry or leave to others:", ...rules.sort(bidFormsFirst).map(e => `- ${e.text}`));
  let out = lines.join("\n");
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 40).replace(/\n[^\n]*$/, "")}\n(more not shown: over the length limit)`;
  return out;
}

// Structor's AI memory (Danial, 23 Nov: "an AI agent that keeps context always so for next scan or extract it knows
// exactly what to extract"). No model remembers between requests, so the memory lives here, in the database
// (lib/memory-store), and every scan reads the part that applies before it starts. One entry is one thing learned:
//
//   rule      how this contractor splits or treats work ("Put acoustic ceiling panels in Drywall, not Ceilings")
//   example   how a line is worded on this contractor's bid forms
//   decision  something settled on one project ("Owner provides FF&E")
//
// An estimator's own entry is approved at once. One learned from a correction (lib/memory-learn) is only proposed,
// and the AI never reads a proposed or retired entry: one bad correction can't teach it something wrong. Each entry is
// tagged with the trades it concerns (code and name, none for every trade) and its project (none for the whole
// company), which is what the database indexes and what contextPack picks by. Pure: shared by the server and browser.

export const MEMORY_KINDS = ["rule", "example", "decision"] as const;
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
export const MEMORY_LIMITS = { text: 500, detail: 1000, trades: 12, tag: 80, events: 200, sourceValue: 300 };

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

export const PACK_CHARS = 6_000;
const byWeight = (a: MemoryEntry, b: MemoryEntry) => b.seen - a.seen || a.text.localeCompare(b.text);

/**
 * What the AI reads before a trade's scan: the approved entries that apply, most specific first (this project's
 * decisions, this trade's rules, rules for every trade, then wording examples), each list most-confirmed first, within
 * `maxChars` (examples give way first). Empty when nothing applies, so a scan without memory reads exactly as before.
 */
export function contextPack(entries: MemoryEntry[], target: { projectId: string; code: string; name: string }, maxChars = PACK_CHARS): string {
  const apply = entries.filter(e => entryApplies(e, target));
  const groups: [string, MemoryEntry[]][] = [
    ["Decisions on this project", apply.filter(e => e.kind === "decision").sort(byWeight)],
    [`Rules for ${target.name}`, apply.filter(e => e.kind === "rule" && e.trades.length).sort(byWeight)],
    ["Rules for every trade", apply.filter(e => e.kind === "rule" && !e.trades.length).sort(byWeight)],
    [`How ${target.name} lines are worded on this contractor's bid forms`, apply.filter(e => e.kind === "example").sort(byWeight)],
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
export const MEMORY_PROMPT_RULE = "If the contractor's memory is supplied, follow it: which trade carries what, what to leave out, and how lines are worded on this contractor's bid forms. It came from this contractor's estimators. It never replaces evidence: every item still needs its quote from the source, and work the source doesn't require is still left out.";
/** The memory as the request carries it, checked: a string of at most MEMORY_REQUEST_CHARS, or undefined. */
export function memoryField(raw: unknown, fail: (message: string) => never): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || raw.length > MEMORY_REQUEST_CHARS) fail("The contractor's memory sent with this reading is too long.");
  return (raw as string).trim() || undefined;
}
/** The memory's place in the request, before the source it is read with. */
export const memoryBlock = (memory: string | undefined) => memory ? `Contractor's memory (approved by its estimators; source text stays the evidence):\n${memory}\n\n` : "";

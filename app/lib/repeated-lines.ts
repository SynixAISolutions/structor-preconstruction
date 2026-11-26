// Lines of one trade's bid form that are the same work in other words (Danial, 25 Nov: 2626 Penn's Demolition had 72 lines
// for a 17-line form: each sheet's keynotes come out again as lines, "Demolish existing walls and windows", "... keyed as
// keynote 08", "... at the north elevation"). The manual's findings are consolidated by the AI (the "scope-consolidate"
// job); the drawings' never were, and lib/same-work only joins lines whose words match. Here the AI suggests which lines
// repeat one another, code throws out any pair whose numbers, tags or conditions disagree, and an estimator ticks what to
// merge: nothing merges without them. The line kept gets the repeats' sheets, highlights and wording, so no source is
// lost. Pure: the AI job is "repeated-lines" (lib/ai-jobs-more), the screen app/ui/repeated-lines.

import { ExtractionRuleError, type ReviewRecords } from "./extraction";
import { addRepeat, type ScopeItem } from "./procurement";
import { addsWords, workConflict } from "./same-work";

export const REPEAT_LIMITS = { lines: 200, title: 300, detail: 160, groups: 60 };
export type RepeatLine = { id: string; title: string; detail: string; source: string };
export type RepeatGroup = { keep: string; same: string[] };
export type RepeatsJob = { trade: string; code: string; lines: RepeatLine[] };
type Dropped = { what: string; reason: string };

/** Lines an estimator hasn't touched, whose repeats can be merged away: the AI's drafts, with no quantity. */
export const mergeable = (item: ScopeItem): boolean => item.origin === "ai" && item.status === "draft" && !item.allTrades && !item.quantity && item.history.every(h => h.kind === "created" || h.kind === "merged");

/** The trade's lines for one request, the alike ones near each other, at most REPEAT_LIMITS.lines per request. */
export function repeatBatches(items: ScopeItem[]): RepeatLine[][] {
  const plain = (i: ScopeItem) => i.title.toLowerCase().replace(/\b(?:furnish|and|install|provide|supply|demolish|remove|existing|the|all|of|to|at)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const lines = [...items].sort((a, b) => plain(a).localeCompare(plain(b))).map(i => ({ id: i.id, title: i.title.slice(0, REPEAT_LIMITS.title), detail: i.detail.slice(0, REPEAT_LIMITS.detail), source: i.source }));
  const out: RepeatLine[][] = [];
  for (let n = 0; n < lines.length; n += REPEAT_LIMITS.lines) out.push(lines.slice(n, n + REPEAT_LIMITS.lines));
  return out.filter(b => b.length > 1);
}

/**
 * The AI's groups that hold up: lines that were sent, each in one group, and no pair whose numbers, tags or conditions
 * disagree (lib/same-work workConflict). `kept` names the lines as the AI sent them (L1...), by id here.
 */
export function screenRepeats(output: unknown, lines: RepeatLine[]): { groups: RepeatGroup[]; dropped: Dropped[] } {
  const raw = Array.isArray((output as { groups?: unknown })?.groups) ? (output as { groups: unknown[] }).groups : [];
  const at = new Map(lines.map((l, i) => [`L${i + 1}`, l]));
  const used = new Set<string>(), groups: RepeatGroup[] = [], dropped: Dropped[] = [];
  for (const g of raw.slice(0, REPEAT_LIMITS.groups)) {
    const o = (g ?? {}) as Record<string, unknown>;
    const keep = at.get(String(o.keep ?? ""));
    if (!keep || used.has(keep.id)) continue;
    const same: string[] = [];
    for (const s of Array.isArray(o.same) ? o.same : []) {
      const line = at.get(String(s));
      if (!line || line.id === keep.id || used.has(line.id) || same.includes(line.id)) continue;
      const conflict = workConflict(keep.title, line.title);
      if (conflict) { dropped.push({ what: line.title.slice(0, 80), reason: `Not merged into "${keep.title.slice(0, 60)}": ${conflict}.` }); continue; }
      same.push(line.id);
    }
    if (!same.length) continue;
    for (const id of [keep.id, ...same]) used.add(id);
    groups.push({ keep: keep.id, same });
  }
  return { groups, dropped };
}

/**
 * Merges `ids` into the line `keepId`: the kept line carries their sheets and wording (lib/procurement addRepeat), the AI's
 * findings and Drawing Flip highlights that stood for them now stand for it, and the trade's general scope follows. The
 * repeats leave the bid form. Only AI drafts an estimator hasn't touched are merged away.
 */
export function mergeLines(records: ReviewRecords, keepId: string, ids: string[], by: string, at = new Date().toISOString()): ReviewRecords {
  if (!by.trim()) throw new ExtractionRuleError("Say who merged the lines.");
  const keep = records.procurement.scopes.find(s => s.id === keepId);
  if (!keep) throw new ExtractionRuleError("The line to keep is no longer on the bid form.");
  const gone = new Set<string>();
  let procurement = records.procurement;
  for (const id of ids) {
    const repeat = procurement.scopes.find(s => s.id === id);
    if (!repeat || id === keepId || gone.has(id)) continue;
    if (repeat.packageId !== keep.packageId) throw new ExtractionRuleError("Only lines of one trade can be merged.");
    if (!mergeable(repeat)) throw new ExtractionRuleError(`"${repeat.title.slice(0, 60)}" was approved, edited or given a quantity, so it isn't merged.`);
    procurement = addRepeat(procurement, keepId, repeat, addsWords(keep.title, repeat.title), by, at);
    gone.add(id);
  }
  if (!gone.size) return records;
  const to = (id: string) => gone.has(id) ? keepId : id;
  const unique = (list: string[]) => [...new Set(list.map(to))];
  return {
    ...records,
    procurement: {
      ...procurement,
      scopes: procurement.scopes.filter(s => !gone.has(s.id)),
      packages: procurement.packages.map(p => p.general && p.id === keep.packageId ? { ...p, general: { ...p.general, lines: p.general.lines.map(l => ({ ...l, members: unique(l.members) })) } } : p),
    },
    extraction: {
      ...records.extraction,
      drafts: records.extraction.drafts.map(d => d.kind === "scope" && d.acceptedId && gone.has(d.acceptedId) ? { ...d, acceptedId: keepId, history: [...d.history, { kind: "merged" as const, at, by, into: keepId }] } : d),
    },
    flip: { ...records.flip, regions: records.flip.regions.map(r => r.scopeIds.some(s => gone.has(s)) ? { ...r, scopeIds: unique(r.scopeIds) } : r) },
  };
}

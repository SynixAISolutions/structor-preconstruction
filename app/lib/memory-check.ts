// Every line the contractor's memory gives a trade, checked against the project on every scan (Danial, 24 Nov: "it
// should be in memory so it is compared and looked for in every scan for the respective trade, and extract matching
// information"). The scan's memory pack is cut at PACK_CHARS: Drywall has some 370 entries from Marcel's bid forms and
// scope checklist, and a scan request carries about 75 of them, as background. So after a trade's reading, each of its
// lines the reading didn't write is looked for in the pages the reading read: the pages that share its words are found
// here (no AI), then the AI reads those pages with the lines that point at them and writes a line only where a page
// calls for that work, in this project's terms, with a quote the server finds on the page (lib/ai-jobs-more
// memory-check). A line no page supports isn't written: nothing goes on a bid form that this project's documents don't
// say. Pure; lib/scope-reading runs it.

import { entryApplies, lineCovered, lineWords, projectMemory, type MemoryEntry } from "./memory";
import type { DraftInput } from "./extraction";

/** One of the trade's lines from memory: its id for the answer, its wording, and its detail (a lead-in's items). */
export type MemoryLine = { id: string; text: string; detail: string };
/** A page the trade's reading read: its file, page, text, and where it is ("09 29 00", or the sheet "A-501"). */
export type CheckPage = { document: string; page: number; text: string; where: string; sheet: string | null };
/** One AI request: some pages of one file and the lines that point at them. */
export type LineCheckRequest = { document: string; pages: CheckPage[]; lines: MemoryLine[] };
/** The AI's answer for one line: the line as it applies to this project, and the words on the page it relies on. */
export type LineFound = { line: string; title: string; detail: string; page: number; quote: string };

/** Pages and lines per request, and the text a page brings (the scope job's limits, lib/ai-jobs). */
export const CHECK_LIMITS = { pages: 5, chars: 50_000, pageChars: 15_000, lines: 40, pagesPerLine: 2 };

/** Words every page and line shares, which don't say what the work is. */
const GENERIC = new Set(["work", "contract", "documents", "document", "required", "requirements", "indicated", "shown", "specified", "subcontractor",
  "subcontractors", "contractor", "contractors", "project", "including", "include", "includes", "accordance", "materials", "material", "items", "item",
  "complete", "provided", "providing", "installation", "installed", "following", "other", "others", "trade", "trades", "shall", "this", "that", "from",
  "are", "any", "where", "such", "each", "within", "under", "into", "only", "per", "not", "under", "related", "applicable", "necessary", "drawings", "specifications"]);
const keyWords = (s: string) => new Set([...lineWords(s)].filter(w => !GENERIC.has(w)));

/**
 * The lines the contractor's memory gives a trade on a project (its overrides applied, lib/memory projectMemory): the
 * scope lines its bid forms and scope checklists carry, each once. Exclusions aren't lines to look for: they stay rules.
 */
export function tradeLines(entries: MemoryEntry[], target: { code: string; name: string }, projectId: string): MemoryLine[] {
  const seen = new Set<string>(), out: MemoryLine[] = [];
  for (const e of projectMemory(entries, projectId)) {
    if (e.kind !== "example" || e.origin !== "import" || !e.trades.length || !entryApplies(e, { projectId, ...target })) continue;
    const key = e.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // A bid sheet line's group ("Under "Gypsum Board"") is context, a checklist lead-in's items are the line.
    out.push({ id: `L${out.length + 1}`, text: e.text, detail: /^Under "/.test(e.detail) ? "" : e.detail.slice(0, 600) });
  }
  return out;
}

/**
 * Which lines to check and where: each line the reading didn't already write (`existing`: its lines' titles and
 * details) goes with the pages that share most of its words, at most two; then each file's pages, in order, are sent a
 * few at a time with the lines pointing at them. `unplaced`: lines no page shares enough words with, so nothing on
 * this project's pages calls for them.
 */
export function planLineCheck(lines: MemoryLine[], pages: CheckPage[], existing: string[]): { requests: LineCheckRequest[]; checked: number; covered: number; unplaced: MemoryLine[] } {
  const words = pages.map(p => keyWords(p.text));
  const placed = new Map<number, MemoryLine[]>();
  const unplaced: MemoryLine[] = [];
  let covered = 0;
  for (const line of lines) {
    if (lineCovered(line.text, existing)) { covered++; continue; }
    const mine = [...keyWords(`${line.text} ${line.detail}`)];
    if (!mine.length) { unplaced.push(line); continue; }
    const need = mine.length <= 2 ? mine.length : Math.min(5, Math.max(2, Math.ceil(mine.length * 0.4)));
    const best = words.map((w, i) => ({ i, score: mine.filter(x => w.has(x)).length })).filter(s => s.score >= need)
      .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, CHECK_LIMITS.pagesPerLine);
    if (!best.length) { unplaced.push(line); continue; }
    for (const { i } of best) placed.set(i, [...(placed.get(i) ?? []), line]);
  }
  const requests: LineCheckRequest[] = [];
  const order = [...placed.keys()].sort((a, b) => pages[a].document.localeCompare(pages[b].document) || pages[a].page - pages[b].page);
  let group: number[] = [], chars = 0;
  const flush = () => {
    if (!group.length) return;
    const chunk = group.map(i => ({ ...pages[i], text: pages[i].text.slice(0, CHECK_LIMITS.pageChars) }));
    const ids = new Set<string>(), mine: MemoryLine[] = [];
    for (const i of group) for (const l of placed.get(i)!) if (!ids.has(l.id)) { ids.add(l.id); mine.push(l); }
    for (let n = 0; n < mine.length; n += CHECK_LIMITS.lines) requests.push({ document: chunk[0].document, pages: chunk, lines: mine.slice(n, n + CHECK_LIMITS.lines) });
    group = []; chars = 0;
  };
  for (const i of order) {
    const size = Math.min(pages[i].text.length, CHECK_LIMITS.pageChars);
    if (group.length && (group.length >= CHECK_LIMITS.pages || chars + size > CHECK_LIMITS.chars || pages[group[0]].document !== pages[i].document)) flush();
    group.push(i); chars += size;
  }
  flush();
  return { requests, checked: lines.length - covered - unplaced.length, covered, unplaced };
}

/**
 * The lines found, as the reading's drafts: each line once (its first answer), none the reading already has or another
 * found line repeats, citing its page. `source`: where the page is, and that the line came from the contractor's memory.
 */
export function lineCheckDrafts(answers: { request: LineCheckRequest; found: LineFound[] }[], packageId: string, existing: string[]): DraftInput[] {
  const done = new Set<string>(), have = [...existing], out: DraftInput[] = [];
  for (const { request, found } of answers) for (const f of found) {
    if (done.has(f.line)) continue;
    const page = request.pages.find(p => p.page === f.page);
    if (!page || lineCovered(f.title, have)) continue;
    done.add(f.line);
    have.push(`${f.title} ${f.detail}`);
    out.push({ kind: "scope", key: `memory-${out.length + 1}`, packageId, title: f.title, detail: f.detail, source: `${page.where} · your bid forms`,
      citations: [{ document: page.document, page: page.page, sheet: page.sheet, quote: f.quote }] });
  }
  return out;
}

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

/**
 * One of the trade's lines from memory: its id for the answer, its wording, and its detail (a lead-in's items).
 * `focus`: what the line is about, when that is narrower than its wording: a bullet's own item ("Toilet accessories"
 * under "Receive, Unload, Catalogue, Store and Install Only"), which decides the pages it is looked for on.
 */
export type MemoryLine = { id: string; text: string; detail: string; focus?: string };
/** A page the trade's reading read: its file, page, text, and where it is ("09 29 00", or the sheet "A-501"). */
export type CheckPage = { document: string; page: number; text: string; where: string; sheet: string | null };
/** One AI request: some pages of one file, the lines that point at them, and what the bid form already has for them. */
export type LineCheckRequest = { document: string; pages: CheckPage[]; lines: MemoryLine[]; existing: string[] };
/** The AI's answer for one line: the line as it applies to this project, and the words on the page it relies on. */
export type LineFound = { line: string; title: string; detail: string; page: number; quote: string };

/** Pages and lines per request, and the text a page brings (the scope job's limits, lib/ai-jobs). */
export const CHECK_LIMITS = { pages: 5, chars: 50_000, pageChars: 15_000, lines: 40, pagesPerLine: 2 };

/** Words every page and line shares, which don't say what the work is. */
const GENERIC = new Set(["work", "contract", "documents", "document", "required", "requirements", "indicated", "shown", "specified", "subcontractor",
  "subcontractors", "contractor", "contractors", "project", "including", "include", "includes", "accordance", "materials", "material", "items", "item",
  "complete", "provided", "providing", "installation", "installed", "following", "other", "others", "trade", "trades", "shall", "this", "that", "from",
  "are", "any", "where", "such", "each", "within", "under", "into", "only", "per", "not", "related", "applicable", "necessary", "drawings", "specifications",
  "but", "limited", "also"]);
/** "R-values" is one word, not "r" and "values" (and "r" is too short to count). */
const joinTerms = (s: string) => s.replace(/\br\s*-?\s*values?\b/gi, "rvalue");
/** One form for singular and plural: "markerboards" is "markerboard", "accessories" is "accessory". */
const singular = (w: string) => w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
const keyWords = (s: string) => new Set([...lineWords(joinTerms(s))].filter(w => !GENERIC.has(w)).map(singular));
/** How often each key word is on a page: a page about wood doors says "wood door" many times, a door hardware page once. */
const wordCounts = (s: string) => {
  const counts = new Map<string, number>();
  for (const w of joinTerms(s).toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/)) {
    if (w.length <= 2 || GENERIC.has(w)) continue;
    const x = singular(w);
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return counts;
};
/** How much a heading's words count next to the item's own, when ranking a bullet's pages. */
const CONTEXT_WEIGHT = 0.3;

/**
 * The lines the contractor's memory gives a trade on a project (its overrides applied, lib/memory projectMemory): the
 * scope lines its bid forms and scope checklists carry, each once. A bullet under a bid sheet heading reads with it
 * ("- At wall corner guards" under "Wood or sheet metal in-wall blocking, including…" is blocking at corner guards);
 * another line keeps its heading as context. A line most of whose words another line already has (two bid forms
 * wording the same thing) is left to that one. Exclusions aren't lines to look for: they stay rules.
 */
export function tradeLines(entries: MemoryEntry[], target: { code: string; name: string }, projectId: string): MemoryLine[] {
  const seen = new Set<string>(), kept: string[] = [], out: MemoryLine[] = [];
  for (const e of projectMemory(entries, projectId)) {
    if (e.kind !== "example" || e.origin !== "import" || !e.trades.length || !entryApplies(e, { projectId, ...target })) continue;
    const group = e.detail.match(/^Under "(.+)"$/)?.[1]?.replace(/[:.]\s*$/, "") ?? "";
    const bullet = /^[-•*]\s+/.test(e.text);
    const text = bullet && group ? `${group}: ${e.text.replace(/^[-•*]\s+/, "")}` : e.text.replace(/^[-•*]\s+/, "");
    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // Bullets share their heading's words, so only whole lines are compared for near-repeats.
    if (!bullet && lineCovered(text, kept)) continue;
    if (!bullet) kept.push(text);
    // A checklist lead-in's items are the line; a bid sheet line's heading is context.
    const detail = group ? (bullet ? "" : `On the bid form under "${group}"`) : e.detail.slice(0, 600);
    out.push({ id: `L${out.length + 1}`, text, detail, ...(bullet && group ? { focus: e.text.replace(/^[-•*]\s+/, "") } : {}) });
  }
  return out;
}

/** A line the reading already wrote: its words, where it came from ("09 29 00 · §3.6", a sheet) and the pages it cites. */
export type ExistingLine = { text: string; source: string; cites: string[] };
/** The lines already on the bid form shown with each request, so the AI doesn't write the same work again. */
const EXISTING_PER_REQUEST = 40;

/**
 * Which lines to check and where: each line the reading didn't already write (`existing`: its lines) goes with the
 * pages that share most of its rarer words, at most two; then each file's pages, in order, are sent a few at a time
 * with the lines pointing at them and the lines the bid form already has for those pages. `unplaced`: lines no page shares enough words with, so nothing on
 * this project's pages calls for them.
 */
export function planLineCheck(lines: MemoryLine[], pages: CheckPage[], existing: ExistingLine[]): { requests: LineCheckRequest[]; checked: number; covered: number; unplaced: MemoryLine[] } {
  const counts = pages.map(p => wordCounts(p.text));
  const words = counts.map(c => new Set(c.keys()));
  // A word on few pages says more than one on most ("parapet" over "gypsum"): each shared word counts by its rarity.
  const df = new Map<string, number>();
  for (const w of words) for (const x of w) df.set(x, (df.get(x) ?? 0) + 1);
  const weight = (x: string) => Math.log((pages.length + 1) / ((df.get(x) ?? 0) + 1)) + 0.1;
  const written = existing.map(e => e.text);
  const placed = new Map<number, MemoryLine[]>();
  const unplaced: MemoryLine[] = [];
  let covered = 0;
  for (const line of lines) {
    if (lineCovered(line.text, written)) { covered++; continue; }
    // What the line is about decides the pages; a bullet's heading only helps rank them ("Toilet accessories", not
    // "receive, unload, catalogue, store", which every installed product's pages share).
    const mine = [...keyWords(line.focus ?? `${line.text} ${line.detail}`)];
    const context = line.focus ? [...keyWords(`${line.text} ${line.detail}`)].filter(x => !mine.includes(x)) : [];
    if (!mine.length) { unplaced.push(line); continue; }
    const need = mine.length <= 2 ? mine.length : Math.min(5, Math.max(2, Math.ceil(mine.length * 0.4)));
    const best = words.map((w, i) => {
      const shared = mine.filter(x => w.has(x));
      const score = shared.reduce((n, x) => n + weight(x) * (1 + Math.log(counts[i].get(x) ?? 1)), 0) + CONTEXT_WEIGHT * context.filter(x => w.has(x)).reduce((n, x) => n + weight(x), 0);
      return { i, count: shared.length, score };
    }).filter(s => s.count >= need).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, CHECK_LIMITS.pagesPerLine);
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
    // What the bid form already has from these pages, or from their sections or sheets.
    const cites = new Set(chunk.map(p => `${p.document}#${p.page}`)), wheres = chunk.map(p => p.where).filter(Boolean);
    const have = [...new Set(existing.filter(e => e.cites.some(c => cites.has(c)) || wheres.some(w => e.source === w || e.source.startsWith(`${w} `))).map(e => e.text.slice(0, 200)))].slice(0, EXISTING_PER_REQUEST);
    for (let n = 0; n < mine.length; n += CHECK_LIMITS.lines) requests.push({ document: chunk[0].document, pages: chunk, lines: mine.slice(n, n + CHECK_LIMITS.lines), existing: have });
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
export function lineCheckDrafts(answers: { request: LineCheckRequest; found: LineFound[] }[], packageId: string, existing: ExistingLine[]): DraftInput[] {
  const done = new Set<string>(), have = existing.map(e => e.text), out: DraftInput[] = [];
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

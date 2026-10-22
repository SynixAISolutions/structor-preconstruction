// Searching a project's file text (Ask Structor's search_project_files). Each stored chunk of page
// text becomes a small word index once; a search ranks every indexed page with BM25 (words rare in
// the project count more than common ones) and returns the best pages with a snippet.
// Pure functions: the route reads the text and keeps the indexes (api/project-files/search).

import type { PageText, StoredDocument } from "./project-files";

export type PageIndex = { pages: { page: number; length: number; text: string }[]; terms: Map<string, Map<number, number>> };
export type PageHit = { docId: string; file: string; category: string; revision: number; page: number; where: string; snippet: string; score: number };

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "shall", "are", "all", "not", "any", "per", "see", "into", "each", "its", "be", "or", "of", "to", "in", "on", "at", "by", "an", "as", "is", "where", "which", "will", "what", "how", "does", "do", "we", "our"]);

/** Lower-case words and codes ("a8.1", "09", "sa3.21"), without common words. */
export const searchTerms = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z0-9]+(?:[.\-/][a-z0-9]+)*/g) ?? []).filter(w => !STOP.has(w) && (w.length > 1 || /\d/.test(w)));

export function indexPages(pages: PageText[]): PageIndex {
  const terms = new Map<string, Map<number, number>>();
  const indexed = pages.map((p, i) => {
    const words = searchTerms(p.text);
    for (const word of words) {
      const pagesWithWord = terms.get(word) ?? new Map<number, number>();
      pagesWithWord.set(i, (pagesWithWord.get(i) ?? 0) + 1);
      terms.set(word, pagesWithWord);
    }
    return { page: p.page, length: words.length, text: p.text };
  });
  return { pages: indexed, terms };
}

/** Where a page sits: its sheet on a drawing set, its section in a project manual. */
export function pageWhere(doc: Pick<StoredDocument, "sheets" | "sections">, page: number): string {
  const sheet = doc.sheets?.find(s => s.page === page);
  if (sheet) return [sheet.sheet, sheet.title].filter(Boolean).join(" · ");
  const section = doc.sections?.find(s => page >= s.first && page <= s.last);
  return section ? `Section ${section.section}${section.title ? ` · ${section.title}` : ""}` : "";
}

function snippet(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const at = Math.min(...words.map(w => lower.indexOf(w)).filter(i => i >= 0), flat.length);
  const start = at === flat.length ? 0 : Math.max(0, at - 120);
  return `${start ? "…" : ""}${flat.slice(start, start + 320)}${start + 320 < flat.length ? "…" : ""}`;
}

/** The best pages across every indexed chunk for a query, best first. */
export function searchPages(entries: { doc: StoredDocument; index: PageIndex }[], query: string, limit = 8): PageHit[] {
  const words = [...new Set(searchTerms(query))].slice(0, 12);
  if (!words.length) return [];
  const total = entries.reduce((n, e) => n + e.index.pages.length, 0);
  if (!total) return [];
  const averageLength = entries.reduce((n, e) => n + e.index.pages.reduce((m, p) => m + p.length, 0), 0) / total || 1;
  const pagesWith = new Map(words.map(w => [w, entries.reduce((n, e) => n + (e.index.terms.get(w)?.size ?? 0), 0)]));
  const k1 = 1.2, b = 0.75;
  const hits: PageHit[] = [];
  for (const { doc, index } of entries) {
    const scores = new Map<number, { score: number; matched: number }>();
    for (const word of words) {
      const found = index.terms.get(word);
      if (!found) continue;
      const df = pagesWith.get(word) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      for (const [i, tf] of found) {
        const length = index.pages[i].length;
        const s = scores.get(i) ?? { score: 0, matched: 0 };
        s.score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * length / averageLength));
        s.matched += 1;
        scores.set(i, s);
      }
    }
    for (const [i, s] of scores) {
      const page = index.pages[i];
      // Pages holding more of the query's words rank above pages repeating one of them.
      const score = s.score * (s.matched / words.length);
      hits.push({ docId: doc.id, file: doc.name, category: doc.category, revision: doc.revision, page: page.page, where: pageWhere(doc, page.page), snippet: snippet(page.text, words), score: Math.round(score * 100) / 100 });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.page - b.page).slice(0, limit);
}

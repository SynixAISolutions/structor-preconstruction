// Where a scope item's evidence is, for the source popups in Scopes & bid forms. Marcel (7 Oct):
// "View on drawings" should open in place and close back to the same row, and the specification
// reference should be something he can click to open the project manual.
//
// Pure: the caller passes the open project's Drawing Flip and specification register, so the
// popups show exactly what those two screens show. Nothing here reads the drawings or the manual.

import type { DrawingFlipState, DrawingPage, FlipRegion } from "./drawing-flip";
import type { ScopeItem } from "./procurement";
import type { SpecSection } from "./data/preconstruction";

/** One drawing page with the regions on it that are linked to the item (none: the source names the whole sheet). */
export type DrawingSource = { page: DrawingPage; regions: FlipRegion[] };

/** A MasterFormat section named by the item's source, e.g. "09 29 00 · §3.6". */
export type SpecSource = {
  section: string;
  /** The part after the section, "§3.6"; null when the source names the section only. */
  paragraph: string | null;
  /** From the specification register; null when the section isn't listed there. */
  title: string | null;
  /** Project manual pages from the register's "pp. 346–355"; null when unlisted or unreadable. */
  pages: { first: number; last: number } | null;
};

export type ScopeSources = {
  drawings: DrawingSource[];
  spec: SpecSource | null;
  /** The source text when it names neither a listed drawing page nor a section; show it as plain text. */
  unresolved: string | null;
};

const SECTION = /^(\d{2} \d{2} \d{2}(?:\.\d+)?)$/;

/** "pp. 346–355" → 346–355; "p. 12" → 12–12. */
export function manualPages(text: string): { first: number; last: number } | null {
  const m = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (!m) return null;
  const first = Number(m[1]), last = m[2] ? Number(m[2]) : first;
  return last >= first ? { first, last } : null;
}

export function scopeSources(item: Pick<ScopeItem, "id" | "source">, flip: DrawingFlipState, specSections: SpecSection[]): ScopeSources {
  const [head, ...rest] = item.source.split("·").map(part => part.trim());
  const paragraph = rest.join(" · ") || null;

  // Regions linked to the item, then the sheet the source names if it is a Drawing Flip page.
  const linked = flip.regions.filter(r => r.scopeIds.includes(item.id));
  const namedPage = flip.pages.find(p => p.sheet === head);
  const drawings = flip.pages
    .filter(p => p === namedPage || linked.some(r => r.pageId === p.id))
    .map(page => ({ page, regions: linked.filter(r => r.pageId === page.id) }));

  const section = SECTION.test(head) ? head : null;
  const listed = section ? specSections.find(s => s.id === section) : undefined;
  const spec: SpecSource | null = section
    ? { section, paragraph, title: listed?.title ?? null, pages: listed ? manualPages(listed.pages) : null }
    : null;

  return { drawings, spec, unresolved: namedPage || section ? null : item.source || null };
}

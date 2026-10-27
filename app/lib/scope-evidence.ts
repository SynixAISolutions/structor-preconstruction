// Where a bid-form item came from, so the estimator can click it and land on the words (Danial, 27 Oct, after
// the app Marcel showed: the source opens on the page, zoomed in, the mention highlighted orange).
//
// An item's evidence, best first:
// - the quotes the AI read it from (the accepted finding behind the item: file, page, exact words);
// - the Drawing Flip regions linked to it (the outline on its sheet);
// - otherwise its source reference: a specification section and paragraph ("02 41 19 · §3.2") opens the
//   project manual at that paragraph, a sheet ("CIV0102 · Keynote 1") opens the sheet.
// Pure: the caller passes the project's findings, Drawing Flip and stored files.

import type { DrawingFlipState, Point } from "./drawing-flip";
import type { ExtractionState } from "./extraction";
import type { ScopeItem } from "./procurement";
import { findSection, findSheet, latestDocuments, type PageText, type StoredDocument } from "./project-files";

export type Evidence = {
  key: string;
  kind: "quote" | "region" | "section" | "sheet";
  /** Chip text: "Manual p. 431", "A1.1 · p. 46", "CIV0102 · Keynote 1", "02 41 19 · §3.2". */
  label: string;
  /** The file as the source names it, for when it isn't in Project files. */
  documentName: string;
  /** The stored file to open; null when it isn't in Project files. */
  doc: StoredDocument | null;
  /** 1-based page to open. */
  page: number;
  /** The words to find and highlight on the page; null when only an outline or the page is known. */
  quote: string | null;
  /** A Drawing Flip outline on that page, 0–1 from its top-left. */
  outline: Point[] | null;
  /** A specification paragraph to look for in these manual pages ("3.2"); `page` is the section's first. */
  paragraph: { label: string; pages: { first: number; last: number } } | null;
};

const SECTION = /^\d{2} \d{2} \d{2}(?:\.\d+)?$/;

/** "Manual" for the project manual, "Drawings" for a drawing set, else the file's name without ".pdf". */
function shortName(name: string, doc: StoredDocument | null): string {
  if (doc?.kind === "manual" || /manual|specification/i.test(name)) return "Manual";
  if (doc?.kind === "drawings" || /drawing/i.test(name)) return "Drawings";
  const bare = name.replace(/\.pdf$/i, "");
  return bare.length > 28 ? `${bare.slice(0, 27).trimEnd()}…` : bare;
}

/** The stored file a source names: its latest revision, else any revision of that name. */
export function storedByName(documents: StoredDocument[], name: string): StoredDocument | null {
  return latestDocuments(documents).find(d => d.name === name) ?? documents.find(d => d.name === name) ?? null;
}

export function scopeEvidence(item: Pick<ScopeItem, "id" | "source">, records: { extraction: ExtractionState; flip: DrawingFlipState }, documents: StoredDocument[]): Evidence[] {
  const evidence: Evidence[] = [];
  const [head, ...rest] = item.source.split("·").map(part => part.trim());

  // 1. What the AI read: every citation of the accepted finding that became this item.
  for (const draft of records.extraction.drafts) {
    if (draft.kind !== "scope" || draft.acceptedId !== item.id) continue;
    for (const c of draft.citations) {
      const key = `quote:${c.document}:${c.page}:${c.quote}`;
      if (evidence.some(e => e.key === key)) continue;
      const doc = storedByName(documents, c.document);
      evidence.push({ key, kind: "quote", label: c.sheet ? `${c.sheet} · p. ${c.page}` : `${shortName(c.document, doc)} p. ${c.page}`,
        documentName: c.document, doc, page: c.page, quote: c.quote, outline: null, paragraph: null });
    }
  }

  // 2. Regions marked for it in Drawing Flip.
  for (const region of records.flip.regions) {
    if (!region.scopeIds.includes(item.id)) continue;
    const page = records.flip.pages.find(p => p.id === region.pageId);
    if (!page) continue;
    const byId = documents.find(d => d.id === page.documentId);
    const sheet = byId ? null : findSheet(documents, page.sheet);
    evidence.push({ key: `region:${region.id}`, kind: "region", label: head === page.sheet ? item.source : `${page.sheet} · ${region.number}`,
      documentName: page.documentName, doc: byId ?? sheet?.doc ?? null, page: byId ? page.pageNumber : sheet?.sheet.page ?? page.pageNumber,
      quote: null, outline: region.polygon, paragraph: null });
  }
  if (evidence.length || !head) return evidence;

  // 3. The reference typed on the item.
  if (SECTION.test(head)) {
    const found = findSection(documents, head);
    const label = rest.join(" · ").replace(/^§\s*/, "");
    return [{ key: `section:${item.source}`, kind: "section", label: item.source, documentName: "the project manual", doc: found?.doc ?? null,
      page: found?.section.first ?? 1, quote: null, outline: null,
      paragraph: found && label ? { label, pages: { first: found.section.first, last: found.section.last } } : null }];
  }
  const sheet = findSheet(documents, head);
  return sheet ? [{ key: `sheet:${item.source}`, kind: "sheet", label: item.source, documentName: sheet.doc.name, doc: sheet.doc, page: sheet.sheet.page, quote: null, outline: null, paragraph: null }] : [];
}

/**
 * Where a specification paragraph starts in the manual's pages, and its opening words to highlight:
 * "3.2" finds the line "3.2 PREPARATION" (not "3.21"). Null when no page has it.
 */
export function findParagraph(pages: PageText[], paragraph: string): { page: number; quote: string } | null {
  const label = paragraph.replace(/^§\s*/, "").trim();
  if (!/^\d+(?:\.\d+)*(?:\.[A-Z])?$/i.test(label)) return null;
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*${label.replace(/\./g, "\\.")}\\.?(?![\\d.])[ \\t]*([A-Za-z][^\\n]{2,})`);
  for (const { page, text } of [...pages].sort((a, b) => a.page - b.page)) {
    const match = text.match(pattern);
    if (match) return { page, quote: `${label} ${match[1].trim().split(/\s+/).slice(0, 8).join(" ")}` };
  }
  return null;
}

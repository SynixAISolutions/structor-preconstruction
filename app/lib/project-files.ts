// Project files that persist (Marcel, 15 Oct: "the project documents are the files" — the AI and every
// source pop-up read what was uploaded in Project files, never a second upload). Each PDF is stored
// once, privately, in the project's Vercel Blob store; its page text is stored beside it in chunks so
// the AI can read it later, and pages are rendered in the browser from byte ranges of the original.
//
// This module is shared by the browser and the server: types, validation and pure lookups only.

export type DocKind = "drawings" | "manual" | "other";

/** One drawing sheet: its PDF page and what its title block says. */
export type StoredSheet = { page: number; sheet: string; title: string; date: string };
/** One project-manual section and its PDF page range. */
export type StoredSection = { section: string; title: string; first: number; last: number };

export type StoredDocument = {
  id: string;
  projectId: string;
  name: string;
  category: string;
  kind: DocKind;
  /** Revisions of the same document share a series (the first upload's id); revision counts 1, 2, 3. */
  series: string;
  revision: number;
  size: number;
  pageCount: number;
  uploadedAt: string;
  /** Private Blob pathname and URL of the original PDF. The URL only works with the store's token. */
  sourcePath: string;
  sourceUrl: string;
  /** Pages of text per stored chunk, and how many chunks there are. */
  textChunk: number;
  textChunks: number;
  sheets: StoredSheet[];
  sections: StoredSection[];
};

export type ProjectFileIndex = { projectId: string; documents: StoredDocument[]; updatedAt: string };
export type PageText = { page: number; text: string };

export const TEXT_CHUNK = 100;
export const MAX_SOURCE_BYTES = 600 * 1024 * 1024;
/** Largest byte range one request returns (functions answer at most 4.5 MB). */
export const MAX_RANGE_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_CATEGORIES = ["Drawings", "Specifications", "Reports", "RFP", "Contracts", "Addenda", "Other"] as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
export const validId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

export const blobRoot = (projectId: string) => `project-files/${projectId}`;
export const indexPath = (projectId: string) => `${blobRoot(projectId)}/index.json`;
export const sourcePath = (projectId: string, docId: string) => `${blobRoot(projectId)}/${docId}/source.pdf`;
export const textPath = (projectId: string, docId: string, chunk: number) => `${blobRoot(projectId)}/${docId}/text-${chunk}.json`;

export const kindForCategory = (category: string): DocKind => category === "Drawings" ? "drawings" : category === "Specifications" ? "manual" : "other";
export const revisionLabel = (doc: Pick<StoredDocument, "revision">) => `V${doc.revision}`;

/** "A-101", "a101", "A 10.1" → "A101" / "A10.1": compare sheet numbers the way people write them. */
export const sheetKey = (sheet: string) => sheet.toUpperCase().replace(/[\s_-]+/g, "").replace(/^([A-Z]+)0+(\d)/, "$1$2");

/** The newest revision of every document, in upload order. */
export function latestDocuments(docs: StoredDocument[]): StoredDocument[] {
  const best = new Map<string, StoredDocument>();
  for (const doc of docs) if ((best.get(doc.series)?.revision ?? 0) < doc.revision) best.set(doc.series, doc);
  return docs.filter(doc => best.get(doc.series) === doc);
}

/** Every revision of a document, oldest first. */
export const revisionsOf = (docs: StoredDocument[], series: string) => docs.filter(doc => doc.series === series).sort((a, b) => a.revision - b.revision);

/** Where a sheet number lives in the newest drawings: document and PDF page. */
export function findSheet(docs: StoredDocument[], sheet: string): { doc: StoredDocument; sheet: StoredSheet } | null {
  const key = sheetKey(sheet);
  for (const doc of latestDocuments(docs).filter(d => d.kind === "drawings")) {
    const found = doc.sheets.find(s => sheetKey(s.sheet) === key);
    if (found) return { doc, sheet: found };
  }
  return null;
}

/** The newest project manual (the largest, when a project has several specification PDFs). */
export function findManual(docs: StoredDocument[]): StoredDocument | null {
  return latestDocuments(docs).filter(d => d.kind === "manual").sort((a, b) => b.pageCount - a.pageCount)[0] ?? null;
}

/** A section's page range in the stored manual, e.g. "09 29 00". */
export function findSection(docs: StoredDocument[], section: string): { doc: StoredDocument; section: StoredSection } | null {
  const manual = findManual(docs);
  const key = section.replace(/\s+/g, "");
  const found = manual?.sections.find(s => s.section.replace(/\s+/g, "") === key);
  return manual && found ? { doc: manual, section: found } : null;
}

export const chunkFor = (page: number, size = TEXT_CHUNK) => Math.floor((page - 1) / size);

/** Validates a document record sent by a browser before it is saved in the index. */
export function parseDocument(raw: unknown, projectId: string): StoredDocument {
  const o = (raw ?? {}) as Record<string, any>;
  const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : NaN;
  if (!validId(o.id) || !validId(o.series)) throw new Error("A document needs its id and series.");
  const expected = sourcePath(projectId, o.id);
  if (o.sourcePath !== expected) throw new Error("The stored file is not in this project's folder.");
  if (typeof o.sourceUrl !== "string" || !/^https:\/\/[a-z0-9]+\.private\.blob\.vercel-storage\.com\//.test(o.sourceUrl) || !o.sourceUrl.includes(`/${expected}`)) throw new Error("Unknown stored file address.");
  const doc: StoredDocument = {
    id: o.id, projectId, name: text(o.name, 255), category: text(o.category, 40) || "Other", kind: ["drawings", "manual", "other"].includes(o.kind) ? o.kind : "other",
    series: o.series, revision: int(o.revision, 1, 999), size: int(o.size, 1, MAX_SOURCE_BYTES), pageCount: int(o.pageCount, 1, 20_000),
    uploadedAt: text(o.uploadedAt, 40) || new Date().toISOString(), sourcePath: expected, sourceUrl: o.sourceUrl,
    textChunk: int(o.textChunk ?? TEXT_CHUNK, 1, 1000), textChunks: int(o.textChunks, 0, 20_000),
    sheets: (Array.isArray(o.sheets) ? o.sheets : []).slice(0, 20_000).map((s: any) => ({ page: int(s?.page, 1, 20_000), sheet: text(s?.sheet, 40), title: text(s?.title, 200), date: text(s?.date, 40) })).filter((s: StoredSheet) => Number.isFinite(s.page)),
    sections: (Array.isArray(o.sections) ? o.sections : []).slice(0, 5_000).map((s: any) => ({ section: text(s?.section, 20), title: text(s?.title, 200), first: int(s?.first, 1, 20_000), last: int(s?.last, 1, 20_000) })).filter((s: StoredSection) => s.section && Number.isFinite(s.first) && Number.isFinite(s.last)),
  };
  if (!doc.name || [doc.revision, doc.size, doc.pageCount, doc.textChunk, doc.textChunks].some(n => !Number.isFinite(n))) throw new Error("The document record is incomplete.");
  return doc;
}

/** Adds or replaces a document in an index (pure). */
export function upsertDocument(index: ProjectFileIndex, doc: StoredDocument): ProjectFileIndex {
  return { ...index, documents: [...index.documents.filter(d => d.id !== doc.id), doc], updatedAt: new Date().toISOString() };
}

export const emptyIndex = (projectId: string): ProjectFileIndex => ({ projectId, documents: [], updatedAt: "" });

// ── List of drawings / Exhibit B ────────────────────────────────────────────

const DISCIPLINES: [RegExp, string][] = [
  [/^CP/, "Code"], [/^CIV|^C\d/, "Civil"], [/^L/, "Landscape"], [/^AQ/, "Aquatics"], [/^AD/, "Architectural demolition"], [/^A/, "Architectural"], [/^K/, "Food service"],
  [/^S/, "Structural"], [/^FP/, "Fire protection"], [/^P/, "Plumbing"], [/^M/, "Mechanical"], [/^E/, "Electrical"], [/^T/, "Technology"], [/^G/, "General"],
];
export const disciplineOf = (sheet: string) => DISCIPLINES.find(([re]) => re.test(sheet.toUpperCase()))?.[1] ?? "Other";

export type RegisterRow = { sheet: string; title: string; discipline: string; date: string; doc: StoredDocument; page: number; revisions: number };

/** Every named sheet of the newest drawing sets, in set order, with how many issues of its set exist. */
export function drawingRegister(docs: StoredDocument[]): RegisterRow[] {
  return latestDocuments(docs).filter(d => d.kind === "drawings").flatMap(doc => doc.sheets.filter(s => s.sheet).map(s => ({
    sheet: s.sheet, title: s.title, discipline: disciplineOf(s.sheet), date: s.date, doc, page: s.page, revisions: revisionsOf(docs, doc.series).length,
  })));
}

/**
 * Exhibit B, the list of documents a subcontract is priced on (Marcel, 15 Oct): reports and other
 * project documents, every drawing with its date, and every specification section. The dates are what
 * lets a contractor say "you acknowledged these drawings, dated this, so the work is yours".
 */
export function exhibitBRows(docs: StoredDocument[]): string[][] {
  const latest = latestDocuments(docs);
  const day = (iso: string) => iso.slice(0, 10);
  return [
    ["Part", "Number", "Title", "Date", "Document"],
    ...latest.filter(d => d.kind === "other").map(d => ["Documents", "", d.name.replace(/\.pdf$/i, ""), day(d.uploadedAt), `${d.name} (${revisionLabel(d)})`]),
    ...drawingRegister(docs).map(r => ["Drawings", r.sheet, r.title, r.date, `${r.doc.name} (${revisionLabel(r.doc)})`]),
    ...latest.filter(d => d.kind === "manual").flatMap(d => d.sections.map(s => ["Specifications", s.section, s.title, day(d.uploadedAt), `${d.name} (${revisionLabel(d)}), pages ${s.first}–${s.last}`])),
  ];
}

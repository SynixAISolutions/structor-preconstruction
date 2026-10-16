"use client";

// Browser side of Project files: list a project's stored documents, upload a PDF once (straight to the
// private store, then its page text), and render any page later from byte ranges of the original —
// no file picker. Every AI reading and source pop-up goes through here.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { upload } from "@vercel/blob/client";
import { manualSections } from "./manual-sections";
import { readTitleBlock } from "./ai-more-client";
import { useActiveProject } from "./project-scope";
import {
  chunkFor, emptyIndex, kindForCategory, MAX_RANGE_BYTES, sourcePath, TEXT_CHUNK,
  type PageText, type ProjectFileIndex, type StoredDocument, type StoredSheet,
} from "./project-files";

// ── Index (one shared copy per project) ─────────────────────────────────────

const indexes = new Map<string, ProjectFileIndex>();
const loading = new Map<string, Promise<ProjectFileIndex>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => ({ error: `Request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body as T;
}

export function loadIndex(projectId: string, fresh = false): Promise<ProjectFileIndex> {
  if (!fresh && indexes.has(projectId)) return Promise.resolve(indexes.get(projectId)!);
  if (!fresh && loading.has(projectId)) return loading.get(projectId)!;
  const request = api<ProjectFileIndex>(`/api/project-files?project=${encodeURIComponent(projectId)}`)
    .then(index => { indexes.set(projectId, index); notify(); return index; })
    .finally(() => loading.delete(projectId));
  loading.set(projectId, request);
  return request;
}

const setIndex = (index: ProjectFileIndex) => { indexes.set(index.projectId, index); notify(); return index; };

/** The open project's stored documents; `ready` is false until the first load answers. */
export function useProjectDocuments(projectId?: string) {
  const active = useActiveProject();
  const id = projectId ?? active;
  const index = useSyncExternalStore(subscribe, () => indexes.get(id), () => undefined);
  useEffect(() => { if (!indexes.has(id)) loadIndex(id).catch(() => setIndex(emptyIndex(id))); }, [id]);
  const refresh = useCallback(() => loadIndex(id, true), [id]);
  return { documents: index?.documents ?? [], ready: !!index, refresh };
}

// ── Upload ──────────────────────────────────────────────────────────────────

export type UploadProgress = { stage: "uploading" | "reading" | "saving" | "title-blocks"; done: number; total: number };

type TextItem = { str: string; transform: number[] };
const SHEET = /^[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?$/;

/** The sheet number printed largest in a page's title-block corner (bottom right), if the page has text. */
function sheetFromItems(items: TextItem[], width: number, height: number): string {
  let best = { size: 0, text: "" };
  for (const item of items) {
    const text = item.str.trim();
    const [a, b, , , x, y] = item.transform;
    const size = Math.hypot(a, b);
    if (SHEET.test(text) && x > width * 0.65 && y < height * 0.35 && size > best.size) best = { size, text };
  }
  return best.text;
}

async function readPages(file: File, kind: StoredDocument["kind"], onPage: (done: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("./pdf-worker")).pdfWorkerSrc();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: PageText[] = [], sheets: StoredSheet[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & TextItem => "str" in item);
      pages.push({ page: i, text: items.map(item => item.str + ("hasEOL" in item && item.hasEOL ? "\n" : "")).join("") });
      if (kind === "drawings") { const view = page.getViewport({ scale: 1 }); sheets.push({ page: i, sheet: sheetFromItems(items, view.width, view.height), title: "", date: "" }); }
      page.cleanup();
      onPage(i, doc.numPages);
    }
  } finally { await task.destroy(); }
  return { pages, sheets };
}

/**
 * Stores a PDF in the open project's files: the original goes straight to the private store, then
 * its page text, then the index entry. `revisionOf` makes it the next revision of that document.
 */
export async function uploadProjectPdf(args: { projectId: string; file: File; category: string; revisionOf?: StoredDocument; onProgress?: (progress: UploadProgress) => void }): Promise<StoredDocument> {
  const { projectId, file, category, revisionOf } = args;
  const header = await file.slice(0, 1024).text();
  if (!/\.pdf$/i.test(file.name) || !header.includes("%PDF-")) throw new Error(`${file.name} is not a PDF.`);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const kind = revisionOf?.kind ?? kindForCategory(category);
  const stored = await upload(sourcePath(projectId, id), file, {
    access: "private", handleUploadUrl: "/api/project-files/upload", contentType: "application/pdf", multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: event => args.onProgress?.({ stage: "uploading", done: event.loaded, total: event.total }),
  });
  const { pages, sheets } = await readPages(file, kind, (done, total) => args.onProgress?.({ stage: "reading", done, total }));
  const chunks = Math.ceil(pages.length / TEXT_CHUNK);
  for (let n = 0; n < chunks; n++) {
    args.onProgress?.({ stage: "saving", done: n, total: chunks });
    await api("/api/project-files/text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, docId: id, chunk: n, pages: pages.slice(n * TEXT_CHUNK, (n + 1) * TEXT_CHUNK) }) });
  }
  const document: StoredDocument = {
    id, projectId, name: file.name, category: revisionOf?.category ?? category, kind, series: revisionOf?.series ?? id, revision: (revisionOf?.revision ?? 0) + 1,
    size: file.size, pageCount: pages.length, uploadedAt: new Date().toISOString(), sourcePath: stored.pathname, sourceUrl: stored.url,
    textChunk: TEXT_CHUNK, textChunks: chunks, sheets,
    sections: kind === "manual" ? manualSections(pages).map(s => ({ section: s.section, title: s.title, first: s.firstPage, last: s.lastPage })) : [],
  };
  setIndex(await api<ProjectFileIndex>("/api/project-files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "register", projectId, document }) }));
  if (kind !== "drawings") return document;
  // Sheet number, title and issue date from each title block (most sheets have no text layer).
  const named = { ...document, sheets: await readTitleBlocks(file, document.sheets, (done, total) => args.onProgress?.({ stage: "title-blocks", done, total })) };
  await updateProjectDocument(named).catch(() => null);
  return named;
}

/** Reads every sheet's title block (right-hand strip, lower half) with the AI, six at a time. */
async function readTitleBlocks(file: File, sheets: StoredSheet[], onProgress: (done: number, total: number) => void): Promise<StoredSheet[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("./pdf-worker")).pdfWorkerSrc();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const out = sheets.map(s => ({ ...s }));
  let next = 0, done = 0;
  try {
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < out.length) {
        const sheet = out[next++];
        try {
          const page = await pdf.getPage(sheet.page);
          const view = page.getViewport({ scale: 1 });
          const scale = 2200 / Math.max(view.width, view.height);
          const viewport = page.getViewport({ scale });
          // Render the whole sheet, then copy out the title-block strip (right 8.5%, lower half).
          const full = document.createElement("canvas");
          full.width = Math.ceil(viewport.width); full.height = Math.ceil(viewport.height);
          await page.render({ canvas: full, canvasContext: full.getContext("2d")!, viewport }).promise;
          page.cleanup();
          const strip = { x: Math.floor(full.width * 0.915), y: Math.floor(full.height * 0.5) };
          const canvas = document.createElement("canvas");
          canvas.width = full.width - strip.x; canvas.height = full.height - strip.y;
          canvas.getContext("2d")!.drawImage(full, strip.x, strip.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          const read = await readTitleBlock(canvas.toDataURL("image/jpeg", 0.8));
          if (read.sheet) Object.assign(sheet, { sheet: read.sheet, title: read.title, date: read.date });
        } catch { /* keep what the text layer gave; the sheet can be named in List of drawings */ }
        onProgress(++done, out.length);
      }
    }));
  } finally { await task.destroy(); }
  return out;
}

export async function removeProjectDocument(doc: StoredDocument) {
  setIndex(await api<ProjectFileIndex>("/api/project-files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "remove", projectId: doc.projectId, docId: doc.id }) }));
}

/** Saves what was read from pages after upload (sheet titles, sections). */
export async function updateProjectDocument(doc: StoredDocument) {
  return setIndex(await api<ProjectFileIndex>("/api/project-files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "update", projectId: doc.projectId, docId: doc.id, document: doc }) }));
}

// ── Reading stored documents ────────────────────────────────────────────────

const textCache = new Map<string, Promise<PageText[]>>();

/** Page text of a stored document; only the chunks covering `pages` are fetched. */
export async function readStoredText(doc: StoredDocument, pages?: { first: number; last: number }): Promise<PageText[]> {
  const first = chunkFor(pages?.first ?? 1, doc.textChunk), last = chunkFor(Math.min(pages?.last ?? doc.pageCount, doc.pageCount), doc.textChunk);
  const chunks = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => {
    const key = `${doc.id}:${first + i}`;
    if (!textCache.has(key)) textCache.set(key, api<PageText[]>(`/api/project-files/text?project=${doc.projectId}&doc=${doc.id}&chunk=${first + i}`).catch(error => { textCache.delete(key); throw error; }));
    return textCache.get(key)!;
  }));
  return chunks.flat().filter(p => !pages || (p.page >= pages.first && p.page <= pages.last));
}

type PdfDoc = { getPage: (n: number) => Promise<any>; numPages: number };
const opened = new Map<string, Promise<PdfDoc>>();

/** Opens a stored PDF without downloading it: pdf.js asks for the byte ranges each page needs. */
export function openStoredPdf(doc: StoredDocument): Promise<PdfDoc> {
  if (opened.has(doc.id)) return opened.get(doc.id)!;
  const promise = (async () => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("./pdf-worker")).pdfWorkerSrc();
    const transport = new pdfjs.PDFDataRangeTransport(doc.size, null);
    const url = `/api/project-files/source?project=${encodeURIComponent(doc.projectId)}&doc=${encodeURIComponent(doc.id)}`;
    transport.requestDataRange = (begin: number, end: number) => {
      // ponytail: ranges over 4 MB are fetched in sequential slices; parallel slices if large sheets feel slow.
      (async () => {
        for (let start = begin; start < end; start += MAX_RANGE_BYTES) {
          const stop = Math.min(end, start + MAX_RANGE_BYTES);
          const response = await fetch(url, { headers: { range: `bytes=${start}-${stop - 1}` } });
          if (response.status !== 206) throw new Error(`The stored file could not be read (${response.status}).`);
          transport.onDataRange(start, new Uint8Array(await response.arrayBuffer()));
        }
      })().catch(error => console.error(error));
    };
    return pdfjs.getDocument({ range: transport, rangeChunkSize: 1 << 20, disableAutoFetch: true, disableStream: true }).promise as Promise<PdfDoc>;
  })();
  promise.catch(() => opened.delete(doc.id));
  opened.set(doc.id, promise);
  return promise;
}

const renders = new Map<string, Promise<{ image: string; aspect: number }>>();

/** A page of a stored PDF as a JPEG data URL, longest side `size` pixels. */
export function renderStoredPage(doc: StoredDocument, pageNumber: number, size = 2000): Promise<{ image: string; aspect: number }> {
  const key = `${doc.id}:${pageNumber}:${size}`;
  if (!renders.has(key)) {
    const job = (async () => {
      const pdf = await openStoredPdf(doc);
      const page = await pdf.getPage(pageNumber);
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: size / Math.max(original.width, original.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot render a drawing page.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();
      return { image: canvas.toDataURL("image/jpeg", 0.82), aspect: original.width / original.height };
    })();
    job.catch(() => renders.delete(key));
    renders.set(key, job);
    if (renders.size > 40) renders.delete(renders.keys().next().value!);
  }
  return renders.get(key)!;
}

"use client";

// Browser side of Project files: list a project's stored documents, upload a PDF once (straight to the
// private store, then its page text), and render any page later from byte ranges of the original —
// no file picker. Every AI reading and source pop-up goes through here.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { upload } from "@vercel/blob/client";
import { manualSections } from "./manual-sections";
import { aiJob, readTitleBlock } from "./ai-more-client";
import { rfpPages, type RfpFact } from "./rfp";
import { useActiveProject } from "./project-scope";
import { pageTextBoxes, type TextBox } from "./text-anchor";
import {
  chunkFor, emptyIndex, kindForCategory, MAX_RANGE_BYTES, sourcePath, TEXT_CHUNK,
  textSource, type PageText, type ProjectFileIndex, type StoredDocument, type StoredSheet,
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

/** A PDF's SHA-256, in hex. */
async function fingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** A project's stored documents as last loaded in this tab, or null before the first load. */
export const storedDocuments = (projectId: string): StoredDocument[] | null => indexes.get(projectId)?.documents ?? null;

// ── Uploads in progress ──
// The AI run after an upload (lib/auto-scopes) waits for every upload in this tab to finish, title blocks included,
// and a pause after the last one for the next file (28 Oct: a run that started mid-upload saw 51 of 205 sheets, none
// titled, and no project manual, so it set 4 bid packages).
export const UPLOAD_SETTLE_MS = 60_000;
let uploading = 0, lastUploadAt = 0;

// Uploads go on in the background once their window is closed (app/ui/upload-banner shows them on every page), and
// the tab asks before closing while one runs.
export type UploadActivity = { key: string; name: string; progress: UploadProgress | null };
let activity: UploadActivity[] = [];
const activityListeners = new Set<() => void>();
const setActivity = (next: UploadActivity[]) => { activity = next; activityListeners.forEach(l => l()); };
const subscribeActivity = (listener: () => void) => { activityListeners.add(listener); return () => { activityListeners.delete(listener); }; };
/** The uploads running in this tab, oldest first. */
export const useUploads = (): UploadActivity[] => useSyncExternalStore(subscribeActivity, () => activity, () => activity);
const holdTab = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
/** What an upload is doing, as the window and the banner say it. */
export const uploadProgressText = (p: UploadProgress) => p.stage === "uploading" ? `Uploading ${Math.round((p.done / Math.max(1, p.total)) * 100)}%` : p.stage === "reading" ? `Reading page ${p.done} of ${p.total}${p.uploaded !== undefined && p.uploaded < 100 ? ` · uploading ${p.uploaded}%` : ""}` : p.stage === "title-blocks" ? `Reading title blocks ${p.done} of ${p.total}` : `Saving page text ${p.done + 1} of ${p.total}`;
/** Milliseconds until this tab's uploads have settled: Infinity while one runs, 0 once the last ended a pause ago. */
export const uploadsSettleIn = (now = Date.now()): number => uploading ? Infinity : Math.max(0, lastUploadAt + UPLOAD_SETTLE_MS - now);

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

/** `uploaded`: while pages are read during the upload, how much of the file has been sent, in percent. */
export type UploadProgress = { stage: "uploading" | "reading" | "saving" | "title-blocks"; done: number; total: number; uploaded?: number };

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

/**
 * Every page's text, and for drawings the sheet number in each title block. Several pdf.js readers share the pages
 * (Danial, 30 Oct: reading a 2,074-page manual on one core took 7–8 minutes); each holds its own copy of the file,
 * so their number is kept to about a gigabyte of copies and to the computer's cores.
 */
async function readPages(file: File, kind: StoredDocument["kind"], onPage: (done: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("./pdf-worker")).pdfWorkerSrc();
  const data = await file.arrayBuffer();
  const open = () => pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const first = open();
  const total = (await first.promise).numPages;
  const cores = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
  const readers = Math.max(1, Math.min(6, cores - 2, Math.floor(1_000_000_000 / Math.max(1, file.size)), Math.ceil(total / 40)));
  const tasks = [first, ...Array.from({ length: readers - 1 }, open)];
  const pages: PageText[] = new Array(total), sheets: StoredSheet[] = new Array(total);
  let next = 1, done = 0;
  try {
    await Promise.all(tasks.map(async task => {
      const doc = await task.promise;
      for (let i = next++; i <= total; i = next++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const items = content.items.filter((item): item is typeof item & TextItem => "str" in item);
        pages[i - 1] = { page: i, text: items.map(item => item.str + ("hasEOL" in item && item.hasEOL ? "\n" : "")).join("") };
        if (kind === "drawings") { const view = page.getViewport({ scale: 1 }); sheets[i - 1] = { page: i, sheet: sheetFromItems(items, view.width, view.height), title: "", date: "" }; }
        page.cleanup();
        onPage(++done, total);
      }
    }));
  } finally { await Promise.all(tasks.map(task => task.destroy())); }
  return { pages, sheets: kind === "drawings" ? sheets : [] };
}

/**
 * Stores a PDF in the open project's files: the original goes straight to the private store, then
 * its page text, then the index entry. `revisionOf` makes it the next revision of that document.
 */
export async function uploadProjectPdf(args: { projectId: string; file: File; category: string; revisionOf?: StoredDocument; onProgress?: (progress: UploadProgress) => void }): Promise<StoredDocument> {
  const key = crypto.randomUUID();
  setActivity([...activity, { key, name: args.file.name, progress: null }]);
  if (!uploading++) window.addEventListener("beforeunload", holdTab);
  const onProgress = (progress: UploadProgress) => { setActivity(activity.map(a => a.key === key ? { ...a, progress } : a)); args.onProgress?.(progress); };
  try { return await storePdf({ ...args, onProgress }); }
  finally {
    if (!--uploading) window.removeEventListener("beforeunload", holdTab);
    lastUploadAt = Date.now();
    setActivity(activity.filter(a => a.key !== key));
    notify();
  }
}

async function storePdf(args: Parameters<typeof uploadProjectPdf>[0]): Promise<StoredDocument> {
  const { projectId, file, category, revisionOf } = args;
  const header = await file.slice(0, 1024).text();
  if (!/\.pdf$/i.test(file.name) || !header.includes("%PDF-")) throw new Error(`${file.name} is not a PDF.`);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const kind = revisionOf?.kind ?? kindForCategory(category);
  // The same PDF stored before (the same drawing set uploaded to another project) is reused, not stored again.
  const hash = await fingerprint(file);
  const reused = await api<{ reused: boolean; document?: StoredDocument; index?: ProjectFileIndex }>("/api/project-files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    op: "reuse", projectId, hash, size: file.size, kind,
    document: { id, name: file.name, category: revisionOf?.category ?? category, series: revisionOf?.series ?? id, revision: (revisionOf?.revision ?? 0) + 1 },
  }) }).catch(() => null);
  if (reused?.reused && reused.document && reused.index) { setIndex(reused.index); return reused.document; }
  // The pages are read while the file uploads, not after it (30 Oct: "it needs to be at least 90% faster").
  let sent = { done: 0, total: file.size }, read = { done: 0, total: 0 };
  const report = () => args.onProgress?.(read.total && read.done < read.total
    ? { stage: "reading", ...read, uploaded: Math.round((sent.done / Math.max(1, sent.total)) * 100) }
    : { stage: "uploading", ...sent });
  const [stored, { pages, sheets }] = await Promise.all([
    upload(sourcePath(projectId, id), file, {
      access: "private", handleUploadUrl: "/api/project-files/upload", contentType: "application/pdf", multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: event => { sent = { done: event.loaded, total: event.total }; report(); },
    }),
    readPages(file, kind, (done, total) => { read = { done, total }; report(); }),
  ]);
  const chunks = Math.ceil(pages.length / TEXT_CHUNK);
  let saved = 0, nextChunk = 0;
  await Promise.all(Array.from({ length: Math.min(6, chunks) }, async () => {
    for (let n = nextChunk++; n < chunks; n = nextChunk++) {
      await api("/api/project-files/text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, docId: id, chunk: n, pages: pages.slice(n * TEXT_CHUNK, (n + 1) * TEXT_CHUNK) }) });
      args.onProgress?.({ stage: "saving", done: Math.min(++saved, chunks - 1), total: chunks });
    }
  }));
  const document: StoredDocument = {
    id, projectId, name: file.name, category: revisionOf?.category ?? category, kind, series: revisionOf?.series ?? id, revision: (revisionOf?.revision ?? 0) + 1,
    size: file.size, pageCount: pages.length, uploadedAt: new Date().toISOString(), sourcePath: stored.pathname, sourceUrl: stored.url,
    textChunk: TEXT_CHUNK, textChunks: chunks, sheets, hash,
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

/** Renames a file: every revision takes the new name (the server keeps names unique and adds ".pdf"). */
export async function renameProjectDocument(doc: StoredDocument, name: string) {
  return setIndex(await api<ProjectFileIndex>("/api/project-files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "rename", projectId: doc.projectId, series: doc.series, name }) }));
}

/** Deletes a whole file: every revision, newest first, so a failure part-way leaves the older ones listed. */
export async function removeProjectFile(revisions: StoredDocument[]) {
  for (const doc of [...revisions].sort((a, b) => b.revision - a.revision)) await removeProjectDocument(doc);
}

/** Saves what was read from pages after upload (sheet titles, sections). */
export async function updateProjectDocument(doc: StoredDocument) {
  return setIndex(await api<ProjectFileIndex>("/api/project-files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "update", projectId: doc.projectId, docId: doc.id, document: doc }) }));
}

// ── Reading stored documents ────────────────────────────────────────────────

const textCache = new Map<string, Promise<PageText[]>>();
/** Bumped when a document's stored text changes (OCR saved), so the next read skips the browser's cached copy. */
const textVersion = new Map<string, number>();

/** Page text of a stored document; only the chunks covering `pages` are fetched. */
export async function readStoredText(doc: StoredDocument, pages?: { first: number; last: number }): Promise<PageText[]> {
  const first = chunkFor(pages?.first ?? 1, doc.textChunk), last = chunkFor(Math.min(pages?.last ?? doc.pageCount, doc.pageCount), doc.textChunk);
  const chunks = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => {
    const key = `${doc.id}:${first + i}`;
    const version = textVersion.get(doc.id);
    const at = textSource(doc);
    if (!textCache.has(key)) textCache.set(key, api<PageText[]>(`/api/project-files/text?project=${at.projectId}&doc=${at.docId}&chunk=${first + i}${version ? `&v=${version}` : ""}`).catch(error => { textCache.delete(key); throw error; }));
    return textCache.get(key)!;
  }));
  return chunks.flat().filter(p => !pages || (p.page >= pages.first && p.page <= pages.last));
}

/**
 * Saves the text OCR read off a scanned page into Project files, once for everyone (the server merges it into the
 * stored chunk and refuses a page that has its own text layer). The next read of that chunk fetches it fresh.
 */
export async function savePageOcrText(doc: StoredDocument, page: number, text: string): Promise<void> {
  const chunk = chunkFor(page, doc.textChunk);
  const at = textSource(doc);
  await api("/api/project-files/text", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: at.projectId, docId: at.docId, chunk, page, text }) });
  textVersion.set(doc.id, (textVersion.get(doc.id) ?? 0) + 1);
  textCache.delete(`${doc.id}:${chunk}`);
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

const textBoxes = new Map<string, Promise<TextBox[]>>();

/**
 * Every piece of a stored page's text with its box, 0 to 1 from the page's top-left in the orientation the
 * page is rendered (rotated sheets included), for pinning highlights to the words (lib/text-anchor).
 */
export function readPageTextBoxes(doc: StoredDocument, pageNumber: number): Promise<TextBox[]> {
  const key = `${doc.id}:${pageNumber}`;
  if (!textBoxes.has(key)) {
    const job = (async () => {
      const page = await (await openStoredPdf(doc)).getPage(pageNumber);
      const boxes = pageTextBoxes((await page.getTextContent()).items, page.getViewport({ scale: 1 }));
      page.cleanup();
      return boxes;
    })();
    job.catch(() => textBoxes.delete(key));
    textBoxes.set(key, job);
  }
  return textBoxes.get(key)!;
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

type Box = [number, number, number, number];

/** One part of a page, `box` = [x, y, width, height] in 0–1 page fractions, as a JPEG with longest side `size`. */
export async function renderStoredRegion(doc: StoredDocument, pageNumber: number, box: Box, size = 2000): Promise<string> {
  const page = await (await openStoredPdf(doc)).getPage(pageNumber);
  const original = page.getViewport({ scale: 1 });
  const [x, y, w, h] = box;
  const scale = size / Math.max(w * original.width, h * original.height);
  const viewport = page.getViewport({ scale, offsetX: -x * original.width * scale, offsetY: -y * original.height * scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * original.width * scale); canvas.height = Math.ceil(h * original.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot render a drawing page.");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * A page cut into `cols` × `rows` slightly overlapping tiles, each a JPEG with longest side `size`, so
 * small print (level markers, room tags) is legible without one huge image. Boxes are 0–1 page fractions.
 */
export async function renderStoredTiles(doc: StoredDocument, pageNumber: number, cols: number, rows: number, size = 2000, overlap = 0.06): Promise<{ image: string; box: Box }[]> {
  const w = Math.min(1, 1 / cols + overlap), h = Math.min(1, 1 / rows + overlap);
  const boxes: Box[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) boxes.push([Math.min(1 - w, Math.max(0, c / cols - overlap / 2)), Math.min(1 - h, Math.max(0, r / rows - overlap / 2)), w, h]);
  const tiles: { image: string; box: Box }[] = [];
  for (const box of boxes) tiles.push({ image: await renderStoredRegion(doc, pageNumber, box, size), box });
  return tiles;
}

/** Reads a stored RFP and returns the project details it states, each with its page and quote, for the user to accept (lib/rfp applyRfpFacts). */
export async function readRfpFacts(doc: StoredDocument, signal?: AbortSignal): Promise<RfpFact[]> {
  const pages = rfpPages(await readStoredText(doc, { first: 1, last: Math.min(doc.pageCount, 150) }));
  return (await aiJob<{ facts: RfpFact[] }>("rfp-facts", { pages }, signal)).facts;
}

"use client";

// Reading the words off a drawing sheet that has no text layer (27 Oct, live test: sheet A12.1 is an image, the
// AI read "CERAMIC TILE" from the picture, and the viewer had no word positions to highlight). Tesseract, the
// open-source OCR engine, runs in this browser on the sheet rendered at 300 dpi in tiles (lib/text-anchor
// ocrTiles) and gives every word with its box, the same TextBox shape as a text layer (sheetWords). It reads
// tile by tile and stops once the quotes are found; what it read is kept for the session, so the next quote
// on the sheet starts from there. The AI scope run uses it too, to check the quotes the AI read from a sheet's
// image (lib/scope-reading). The sheet never leaves the browser; only the OCR engine and its English model are
// downloaded once, from jsDelivr.

import type { StoredDocument } from "./project-files";
import { openStoredPdf, renderStoredRegion } from "./project-files-client";
import { findOnSheet, MAX_TAG_MARKS, ocrTiles, sheetWords, type Box, type OcrTile, type TextBox } from "./text-anchor";

export type OcrProgress = { done: number; total: number };

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
/** OCR workers for the session, made on first use; sheets read at once share them in turn (30 Oct: one worker read 43 scanned sheets in about 40 minutes). */
export const OCR_WORKERS = typeof navigator === "undefined" ? 2 : Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 3)));
const workers: (Promise<Worker> | undefined)[] = [];
let turn = 0;
function ocrWorker(): Promise<Worker> {
  const i = turn++ % OCR_WORKERS;
  const made = workers[i] ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const created = await createWorker("eng");
    // Drawings are labels and schedules scattered over a sheet, not paragraphs.
    await created.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return created;
  })();
  made.catch(() => { workers[i] = undefined; });
  return made;
}

const imageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
  image.onerror = () => reject(new Error("A sheet tile could not be read."));
  image.src = src;
});

/** One page's OCR so far: its tiles, the ones read, and a queue so two lookups don't read the same tile twice. */
type SheetRead = { boxes: Box[]; size: number; tiles: OcrTile[]; queue: Promise<unknown> };
const reads = new Map<string, Promise<SheetRead>>();
function sheetRead(doc: StoredDocument, page: number): Promise<SheetRead> {
  const key = `${doc.id}:${page}`;
  if (!reads.has(key)) {
    const job = (async () => {
      const view = (await (await openStoredPdf(doc)).getPage(page)).getViewport({ scale: 1 });
      return { ...ocrTiles(view.width, view.height), tiles: [], queue: Promise.resolve() };
    })();
    job.catch(() => reads.delete(key));
    reads.set(key, job);
  }
  return reads.get(key)!;
}

/**
 * Where the quotes are printed on a stored page, read by OCR: the marks found, the words read so far, and whether
 * the whole sheet was read (true when a quote isn't there, so "not found" means it isn't printed on the sheet).
 */
export async function findInSheetImage(doc: StoredDocument, page: number, quotes: string[], onProgress?: (progress: OcrProgress) => void, signal?: AbortSignal): Promise<{ marks: Box[]; words: TextBox[]; wholeSheet: boolean }> {
  const look = (words: TextBox[]) => quotes.map(q => findOnSheet(words, q, MAX_TAG_MARKS, { fuzzy: true }));
  const { words, wholeSheet } = await readTiles(doc, page, read => look(read).every(m => m.length), onProgress, signal);
  return { marks: look(words).flat(), words, wholeSheet };
}

/** Every word on a page, the whole sheet read: Project files' one-off OCR of scanned sheets (lib/sheet-text-ocr). */
export const readWholeSheet = (doc: StoredDocument, page: number, onProgress?: (progress: OcrProgress) => void, signal?: AbortSignal) =>
  readTiles(doc, page, () => false, onProgress, signal);

/** Reads a page's tiles in order until `enough` holds for the words read or every tile is read; one reading per page at a time. */
async function readTiles(doc: StoredDocument, page: number, enough: (words: TextBox[]) => boolean, onProgress?: (progress: OcrProgress) => void, signal?: AbortSignal): Promise<{ words: TextBox[]; wholeSheet: boolean }> {
  const read = await sheetRead(doc, page);
  const run = read.queue.then(async () => {
    if (enough(sheetWords(read.tiles))) return;
    const ocr = await ocrWorker();
    while (read.tiles.length < read.boxes.length && !signal?.aborted) {
      onProgress?.({ done: read.tiles.length, total: read.boxes.length });
      const box = read.boxes[read.tiles.length];
      const image = await renderStoredRegion(doc, page, [box.x, box.y, box.width, box.height], read.size);
      const [{ width, height }, { data }] = await Promise.all([imageSize(image), ocr.recognize(image, {}, { blocks: true })]);
      const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
      read.tiles.push({ box, width, height, words: words.map(word => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })) });
      if (enough(sheetWords(read.tiles))) break;
    }
  });
  read.queue = run.catch(() => {});
  await run;
  return { words: sheetWords(read.tiles), wholeSheet: read.tiles.length === read.boxes.length };
}

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
let worker: Promise<Worker> | null = null;
/** One OCR worker for the session, made on first use. */
function ocrWorker(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const made = await createWorker("eng");
    // Drawings are labels and schedules scattered over a sheet, not paragraphs.
    await made.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return made;
  })();
  worker.catch(() => { worker = null; });
  return worker;
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
  const read = await sheetRead(doc, page);
  const run = read.queue.then(async () => {
    const look = () => { const words = sheetWords(read.tiles); return quotes.map(q => findOnSheet(words, q, MAX_TAG_MARKS, { fuzzy: true })); };
    let found = look();
    if (found.every(m => m.length)) return found;
    const ocr = await ocrWorker();
    while (read.tiles.length < read.boxes.length && found.some(m => !m.length) && !signal?.aborted) {
      onProgress?.({ done: read.tiles.length, total: read.boxes.length });
      const box = read.boxes[read.tiles.length];
      const image = await renderStoredRegion(doc, page, [box.x, box.y, box.width, box.height], read.size);
      const [{ width, height }, { data }] = await Promise.all([imageSize(image), ocr.recognize(image, {}, { blocks: true })]);
      const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
      read.tiles.push({ box, width, height, words: words.map(word => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })) });
      found = look();
    }
    return found;
  });
  read.queue = run.catch(() => {});
  const found = await run;
  return { marks: found.flat(), words: sheetWords(read.tiles), wholeSheet: read.tiles.length === read.boxes.length };
}

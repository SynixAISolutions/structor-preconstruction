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
import { workerPool } from "./worker-pool";

export type OcrProgress = { done: number; total: number };

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
/** OCR workers, made on first use; sheets read at once share them in turn (30 Oct: one worker read 43 scanned sheets in about 40 minutes). */
export const OCR_WORKERS = typeof navigator === "undefined" ? 2 : Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 3)));
/**
 * The workers end once no sheet has needed them for this long, and are made again when one does.
 * Each keeps the memory it grew to while reading: measured 13 Nov on 8 Whittier sheets, four idle workers held 560 MB
 * of the tab's committed memory (1.33 GB → 0.77 GB when they ended). Marcel's tab kept them for the whole scope run
 * and ran out of memory in its last minute, while the AI's quotes were being checked on the sheets with OCR.
 */
export const OCR_IDLE_MS = 15_000;
const workers = workerPool<Worker>(async () => {
  const { createWorker, PSM } = await import("tesseract.js");
  const created = await createWorker("eng");
  // Drawings are labels and schedules scattered over a sheet, not paragraphs. Tesseract's notes on every tile
  // ("Estimating resolution as 297") went to the console as errors, about 500 a run, burying real ones: they go nowhere.
  await created.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, debug_file: "/dev/null" });
  return created;
}, OCR_WORKERS, OCR_IDLE_MS);

/** What the OCR workers have done since the tab opened, for the automatic run's time left (lib/run-time-left): tiles
 * read and the time workers were busy reading them, quote checks and the tiles they took, scanned sheets and theirs. */
const work = { tiles: 0, busyMs: 0, checks: 0, checkTiles: 0, sheets: 0, sheetTiles: 0 };
const using: number[] = [], busySince: number[] = [];
const busy = (slot: number, change: 1 | -1) => {
  using[slot] = (using[slot] ?? 0) + change;
  if (change === 1 && using[slot] === 1) busySince[slot] = Date.now();
  if (change === -1 && using[slot] === 0) work.busyMs += Date.now() - busySince[slot];
};
export const ocrWork = () => ({ ...work, busyMs: work.busyMs + using.reduce((ms, n, slot) => ms + (n ? Date.now() - busySince[slot] : 0), 0) });

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
  const { words, wholeSheet, read } = await readTiles(doc, page, read => look(read).every(m => m.length), onProgress, signal);
  work.checks++; work.checkTiles += read;
  return { marks: look(words).flat(), words, wholeSheet };
}

/** Every word on a page, the whole sheet read: Project files' one-off OCR of scanned sheets (lib/sheet-text-ocr). */
export async function readWholeSheet(doc: StoredDocument, page: number, onProgress?: (progress: OcrProgress) => void, signal?: AbortSignal): Promise<{ words: TextBox[]; wholeSheet: boolean }> {
  const { words, wholeSheet, tiles } = await readTiles(doc, page, () => false, onProgress, signal);
  if (wholeSheet) { work.sheets++; work.sheetTiles += tiles; }
  return { words, wholeSheet };
}

/** Reads a page's tiles in order until `enough` holds for the words read or every tile is read; one reading per page at a
 * time. Also says how many tiles this call read and how many the page has. */
async function readTiles(doc: StoredDocument, page: number, enough: (words: TextBox[]) => boolean, onProgress?: (progress: OcrProgress) => void, signal?: AbortSignal): Promise<{ words: TextBox[]; wholeSheet: boolean; read: number; tiles: number }> {
  const read = await sheetRead(doc, page);
  let readHere = 0;
  const run = read.queue.then(async () => {
    if (enough(sheetWords(read.tiles))) return;
    const { slot, worker } = workers.claim();
    try {
      const ocr = await worker;
      busy(slot, 1);
      try { await readAll(ocr); } finally { busy(slot, -1); }
    } finally { workers.release(); }
  });
  async function readAll(ocr: Worker) {
    while (read.tiles.length < read.boxes.length && !signal?.aborted) {
      onProgress?.({ done: read.tiles.length, total: read.boxes.length });
      const box = read.boxes[read.tiles.length];
      const image = await renderStoredRegion(doc, page, [box.x, box.y, box.width, box.height], read.size, true);
      const [{ width, height }, { data }] = await Promise.all([imageSize(image), ocr.recognize(image, {}, { blocks: true })]);
      const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
      read.tiles.push({ box, width, height, words: words.map(word => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })) });
      work.tiles++; readHere++;
      if (enough(sheetWords(read.tiles))) break;
    }
  }
  read.queue = run.catch(() => {});
  await run;
  return { words: sheetWords(read.tiles), wholeSheet: read.tiles.length === read.boxes.length, read: readHere, tiles: read.boxes.length };
}

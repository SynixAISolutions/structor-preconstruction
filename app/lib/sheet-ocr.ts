"use client";

// Reading the words off a drawing sheet that has no text layer (27 Oct, live test: sheet A12.1 is an image, the
// AI read "CERAMIC TILE" from the picture, and the viewer had no word positions to highlight). Tesseract, the
// open-source OCR engine, runs in this browser on the sheet rendered in high-resolution tiles and gives every
// word with its box, the same TextBox shape as a text layer (lib/text-anchor sheetWords). The sheet never
// leaves the browser; only the OCR engine and its English model are downloaded once, from jsDelivr.

import type { StoredDocument } from "./project-files";
import { renderStoredTiles } from "./project-files-client";
import { sheetWords, type OcrTile, type TextBox } from "./text-anchor";

/** 3 × 2 tiles, 2,600 px on the long side: small print on a 36" sheet is read at about 200 dpi. */
const COLS = 3, ROWS = 2, TILE_SIZE = 2600, OVERLAP = 0.06;

export type OcrProgress = { done: number; total: number };

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let worker: Promise<Worker> | null = null;
/** One OCR worker for the session, made on first use. */
function ocrWorker(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const made = await createWorker("eng");
    // Drawings are labels scattered over a sheet, not paragraphs.
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

const read = new Map<string, Promise<TextBox[]>>();
/** Every word OCR reads on a stored page, 0–1 from its top-left; read once per page this session. */
export function readSheetWords(doc: StoredDocument, page: number, onProgress?: (progress: OcrProgress) => void): Promise<TextBox[]> {
  const key = `${doc.id}:${page}`;
  if (!read.has(key)) {
    const job = (async () => {
      const total = COLS * ROWS;
      onProgress?.({ done: 0, total });
      const [rendered, ocr] = await Promise.all([renderStoredTiles(doc, page, COLS, ROWS, TILE_SIZE, OVERLAP), ocrWorker()]);
      const tiles: OcrTile[] = [];
      for (const [index, tile] of rendered.entries()) {
        const [{ width, height }, { data }] = await Promise.all([imageSize(tile.image), ocr.recognize(tile.image, {}, { blocks: true })]);
        const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
        const [x, y, w, h] = tile.box;
        tiles.push({ box: { x, y, width: w, height: h }, width, height, words: words.map(word => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })) });
        onProgress?.({ done: index + 1, total });
      }
      return sheetWords(tiles);
    })();
    job.catch(() => read.delete(key));
    read.set(key, job);
  } else onProgress?.({ done: COLS * ROWS, total: COLS * ROWS });
  return read.get(key)!;
}

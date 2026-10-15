"use client";

// The text of every page of a PDF the user picked, read in their browser with pdf.js (Mozilla).
// Only text leaves the browser — files can be far larger than a server request allows (the Jelleff
// project manual is 2,074 pages) — and a page without a text layer (a scanned or drawn sheet) comes
// back empty. Nothing is saved: pick the file again after a reload, as in Project files.

import type { PageText } from "./manual-sections";

export type PdfText = { name: string; size: number; pageCount: number; pages: PageText[]; emptyPages: number };

/** Reads every page's text; `onPage` reports progress for long files. */
export async function readPdfText(file: File, onPage?: (done: number, total: number) => void): Promise<PdfText> {
  const pdfjs = await import("pdfjs-dist");
  // The bundler emits the worker file and gives its URL; pdf.js starts one per file and stops it in destroy().
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: PageText[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "").join("");
      const sheet = content.items.filter(item => "str" in item && item.transform[4] > viewport.width * .8 && item.transform[5] < viewport.height * .2)
        .flatMap(item => "str" in item ? item.str.match(/^[A-Z]{1,3}\d{1,2}(?:\.\d{1,2}|-\d{2,3})$/)?.[0] ?? [] : []).at(-1);
      pages.push({ page: i, text, ...(sheet ? { sheet } : {}), aspect: viewport.width / viewport.height });
      onPage?.(i, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return { name: file.name, size: file.size, pageCount: pages.length, pages, emptyPages: pages.filter(p => !p.text.trim()).length };
}

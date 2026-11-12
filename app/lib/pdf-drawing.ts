"use client";

import { paintPage } from "./pdf-paint";
import { freeCanvas, openLocalPdf } from "./local-pdf";
import { pageTurn } from "./page-turns";

/**
 * One rendered page; the file and render are never written to the server or committed. The file is opened inside the
 * page's turn (lib/page-turns): each open commits a buffer as long as the whole file, so a drawing reader asking for three
 * sheets of a 222 MB set at once held three. A reader working through many sheets passes `behind`.
 */
export async function renderDrawingPage(file: File, page: number, behind = false): Promise<{ image: string; aspect: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pageTurn(() => drawPage(pdfjs, file, page), behind);
}

async function drawPage(pdfjs: typeof import("pdfjs-dist"), file: File, page: number): Promise<{ image: string; aspect: number }> {
  const task = openLocalPdf(pdfjs, file);
  try {
    const document = await task.promise, sheet = await document.getPage(page);
    const original = sheet.getViewport({ scale: 1 });
    const viewport = sheet.getViewport({ scale: 2400 / Math.max(original.width, original.height) });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot render a drawing page.");
    await paintPage(sheet, canvas, context, viewport);
    const image = canvas.toDataURL("image/jpeg", 0.85);
    freeCanvas(canvas);
    return { image, aspect: original.width / original.height };
  } finally { await task.destroy(); }
}

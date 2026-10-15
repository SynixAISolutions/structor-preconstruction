"use client";

/** One rendered page; the file and render are never written to the server or committed. */
export async function renderDrawingPage(file: File, page: number): Promise<{ image: string; aspect: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise, sheet = await document.getPage(page);
    const original = sheet.getViewport({ scale: 1 });
    const viewport = sheet.getViewport({ scale: 2400 / Math.max(original.width, original.height) });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot render a drawing page.");
    await sheet.render({ canvas, canvasContext: context, viewport }).promise;
    return { image: canvas.toDataURL("image/jpeg", 0.85), aspect: original.width / original.height };
  } finally { await task.destroy(); }
}

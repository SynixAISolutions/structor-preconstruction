"use client";

// Drawing a PDF page while Structor's tab is in the background (2 Nov). pdf.js paints a page in steps, each on an
// animation frame, and a hidden tab gets none: the AI's sheet images, the OCR of sheets and the title-block reading
// all stopped whenever the person switched tabs, and went on only when they came back (the timed run sat at its
// drawing sheets while the window was hidden). The print intent paints without animation frames, and each step
// waits for a message event, which browsers don't throttle in a hidden tab, so the page stays responsive meanwhile.

import type { PDFPageProxy, PageViewport } from "pdfjs-dist";

const nextTask = (go: () => void) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); go(); };
  channel.port2.postMessage(null);
};

/** Paints `page` into `canvas` at `viewport`, visible tab or not. */
export async function paintPage(page: Pick<PDFPageProxy, "render">, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, viewport: PageViewport): Promise<void> {
  const task = page.render({ canvas, canvasContext: context, viewport, intent: "print" });
  task.onContinue = nextTask;
  await task.promise;
}

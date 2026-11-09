// A PDF on this computer, read by pdf.js in the parts each page needs (9 Nov). Uploading Project 1's 166 MB drawing set
// copied the whole file once for every page reader, up to six of them (about a gigabyte), plus once more for the title
// blocks, and Marcel's Chrome tab ran out of memory ("Aw, Snap!", Out of Memory). Read in ranges, each reader keeps only
// the parts of the file its pages use. The same as openStoredPdf does for a stored file, with the file's own slices.

type PdfJs = {
  PDFDataRangeTransport: new (length: number, initialData: Uint8Array | null) => {
    requestDataRange: (begin: number, end: number) => void;
    onDataRange: (begin: number, chunk: Uint8Array) => void;
  };
  getDocument: (source: object) => { promise: Promise<unknown>; destroy: () => Promise<void> };
};

/**
 * pdf.js loading `file` a megabyte range at a time, as its pages ask, rather than all of it at once. `options` go to
 * getDocument as they are (a shared `worker`).
 */
export function openLocalPdf<T extends PdfJs>(pdfjs: T, file: Blob, options: object = {}): ReturnType<T["getDocument"]> {
  const transport = new pdfjs.PDFDataRangeTransport(file.size, null);
  transport.requestDataRange = (begin: number, end: number) => {
    file.slice(begin, end).arrayBuffer().then(buffer => transport.onDataRange(begin, new Uint8Array(buffer)), error => console.error(error));
  };
  return pdfjs.getDocument({ ...options, range: transport, rangeChunkSize: 1 << 20, disableAutoFetch: true, disableStream: true }) as ReturnType<T["getDocument"]>;
}

/** A reader opens the file afresh for every this many pages: a document keeps every range it has read until it closes. */
export const PAGES_PER_OPEN = 20;

/**
 * `each` on every page in `pages`, by `readers` readers side by side, taking a run of pages at a time in order (so a reader
 * stays in one part of the file) and opening the file afresh for each run: PAGES_PER_OPEN pages, or about a quarter of a
 * reader's share of a long document. Every page's text with four readers (Node): Project 1's 166 MB drawings peaked at
 * 543 MB against 1,260 MB holding a full copy each, its 110 MB, 2,074-page manual at 551 MB against 1,358 MB.
 */
export async function eachPageInRuns<D>(open: (reader: number) => { promise: Promise<D>; destroy: () => Promise<void> }, pages: number[], readers: number, each: (doc: D, page: number) => Promise<void>): Promise<void> {
  // A long document of light pages (the 2,074-page manual) reopens about four times per reader, not every 20 pages.
  const perOpen = Math.max(PAGES_PER_OPEN, Math.ceil(pages.length / (Math.max(1, readers) * 4)));
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, readers) }, async (_, reader) => {
    while (next < pages.length) {
      const run = pages.slice(next, next + perOpen);
      next += perOpen;
      const task = open(reader);
      try {
        const doc = await task.promise;
        for (const page of run) await each(doc, page);
      } finally { await task.destroy(); }
    }
  }));
}

/** Gives a canvas's pixels back at once: a 2,200 px sheet is about 13 MB, and a run renders hundreds of them. */
export function freeCanvas(canvas: { width: number; height: number }): void {
  canvas.width = 0;
  canvas.height = 0;
}

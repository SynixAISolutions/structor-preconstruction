// A PDF on this computer, read by pdf.js in the ranges each page needs (9 Nov). Uploading Project 1's 166 MB drawing set
// copied the whole file once for every page reader, up to six of them, and Marcel's Chrome tab ran out of memory ("Aw,
// Snap!", Out of Memory). Ranges fixed the copies, but pdf.js still gives each open document a buffer as long as the whole
// file, and Windows commits that buffer whether or not its ranges are read (11 Nov: a 222 MB buffer nothing wrote to added
// 222 MB of committed memory). So the readers a file gets are capped by its size (readersFor).

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
 * What a file's open documents may commit, in bytes. pdf.js gives each open document a buffer as long as the whole file,
 * Windows commits it at once, and a freed buffer lingers until the garbage collector runs. Measured in Node on a 167 MB
 * drawing set (ArrayBuffer bytes at the peak): one reader 522 MB, two 545 MB, four 861 MB, six 1,123 to 1,192 MB, with the
 * same text from every count. Six readers on Marcel's 222 MB volume would commit about 1.4 GB, and his tab ran out of memory.
 */
export const OPEN_DOCUMENT_BYTES = 800 * 1024 * 1024;

/**
 * The readers a file may have open at once: `wanted`, or fewer when their documents would pass OPEN_DOCUMENT_BYTES, counting
 * two more documents still being freed (never fewer than one). Marcel's 222 MB volume gets one, his 125 MB volume four.
 */
export function readersFor(fileBytes: number, wanted: number): number {
  return Math.max(1, Math.min(wanted, Math.floor(OPEN_DOCUMENT_BYTES / Math.max(1, fileBytes)) - 2));
}

/**
 * `each` on every page in `pages`, by `readers` readers side by side, taking a run of pages at a time in order (so a reader
 * stays in one part of the file) and opening the file afresh for each run: PAGES_PER_OPEN pages, or about a quarter of a
 * reader's share of a long document. Resident memory (what Node reports as rss) understates the cost: an untouched buffer
 * is not resident, but Windows still commits it, so the readers are counted against the file's size (readersFor).
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

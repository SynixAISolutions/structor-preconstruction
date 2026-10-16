"use client";

/**
 * Where the bundler put pdf.js's worker. In its own module, imported only when a PDF is opened, so
 * code that merely imports the PDF helpers (screens, tests) never loads `import.meta`.
 */
export const pdfWorkerSrc = () => new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

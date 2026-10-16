// Loads a real PDF into a project's stored files (private Vercel Blob), the same way an upload in
// Project files does: original PDF, page text in chunks, index entry. A local tool, not in the gate;
// it needs BLOB_READ_WRITE_TOKEN (vercel env pull to a file outside the repo, then --env-file).
//
//   node --experimental-strip-types --no-warnings --env-file=<env> scripts/load-project-files.mjs \
//     --project jelleff --id jrc-drawings-251209 --category Drawings --file <set.pdf> [--sheets <sheets.json>]
//
//   --sheets  JSON [{page, sheet, title, date}] read from the title blocks; merged over what the text layer gives.

import { register } from "node:module";
import { readFileSync, statSync, createReadStream } from "node:fs";
import { basename } from "node:path";

register("./ts-resolver.mjs", import.meta.url);
const F = await import("../lib/project-files.ts");
const S = await import("../lib/project-files-store.ts");
const M = await import("../lib/manual-sections.ts");
const { put } = await import("@vercel/blob");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) => a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs, []));
const need = (k) => args[k] ?? (console.error(`Missing --${k}`), process.exit(2));
const [projectId, id, category, file] = [need("project"), need("id"), need("category"), need("file")];
const kind = F.kindForCategory(category);
const size = statSync(file).size;

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
const pdf = await task.promise;
const pages = [], sheets = [];
const SHEET = /^[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?$/;
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  pages.push({ page: i, text: content.items.map(it => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join("") });
  if (kind === "drawings") {
    const view = page.getViewport({ scale: 1 });
    let best = { size: 0, text: "" };
    for (const it of content.items) {
      const text = (it.str ?? "").trim(), [a, b, , , x, y] = it.transform ?? [];
      if (SHEET.test(text) && x > view.width * 0.65 && y < view.height * 0.35 && Math.hypot(a, b) > best.size) best = { size: Math.hypot(a, b), text };
    }
    sheets.push({ page: i, sheet: best.text, title: "", date: "" });
  }
  page.cleanup();
  if (i % 200 === 0) console.log(`  read ${i}/${pdf.numPages}`);
}
await task.destroy();
if (args.sheets) for (const s of JSON.parse(readFileSync(args.sheets, "utf8"))) {
  const at = sheets.find(x => x.page === s.page);
  if (at) Object.assign(at, Object.fromEntries(Object.entries(s).filter(([k, v]) => k !== "page" && v)));
}
console.log(`${basename(file)}: ${pdf.numPages} pages, ${(size / 1048576).toFixed(1)} MB${kind === "drawings" ? `, ${sheets.filter(s => s.sheet).length} sheet numbers` : ""}`);

const started = Date.now();
const blob = await put(F.sourcePath(projectId, id), createReadStream(file), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/pdf", multipart: true });
console.log(`uploaded in ${Math.round((Date.now() - started) / 1000)} s`);

const chunks = Math.ceil(pages.length / F.TEXT_CHUNK);
for (let n = 0; n < chunks; n++) await S.saveText(projectId, id, n, pages.slice(n * F.TEXT_CHUNK, (n + 1) * F.TEXT_CHUNK));
const sections = kind === "manual" ? M.manualSections(pages).map(s => ({ section: s.section, title: s.title, first: s.firstPage, last: s.lastPage })) : [];
const doc = F.parseDocument({
  id, projectId, name: basename(file), category, kind, series: id, revision: 1, size, pageCount: pages.length, uploadedAt: new Date().toISOString(),
  sourcePath: blob.pathname, sourceUrl: blob.url, textChunk: F.TEXT_CHUNK, textChunks: chunks, sheets, sections,
}, projectId);
await S.registerDocument(doc);
console.log(`registered ${id}: ${chunks} text chunks${sections.length ? `, ${sections.length} sections` : ""}`);

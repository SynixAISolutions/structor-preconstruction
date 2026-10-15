// Saves title-block readings (sheet, title, issue date) onto a stored drawing set's pages. A local tool
// paired with load-project-files.mjs; the browser does the same after an upload.
//
//   node --experimental-strip-types --no-warnings --env-file=<env> scripts/save-title-blocks.mjs --project jelleff --doc jrc-drawings-251209 --file <titleblocks.json>

import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/project-files-store.ts");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) => a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs, []));
const read = JSON.parse(readFileSync(args.file, "utf8"));
const index = await S.updateDocument(args.project, args.doc, doc => ({
  ...doc,
  sheets: doc.sheets.map(s => {
    const r = read.find(x => x.page === s.page && !x.error);
    return r?.sheet ? { page: s.page, sheet: String(r.sheet).trim(), title: String(r.title ?? "").trim(), date: String(r.date ?? "").trim() } : s;
  }),
}));
const doc = index.documents.find(d => d.id === args.doc);
console.log(`${doc.name}: ${doc.sheets.filter(s => s.sheet).length}/${doc.pageCount} sheets named, ${doc.sheets.filter(s => s.date).length} dated`);

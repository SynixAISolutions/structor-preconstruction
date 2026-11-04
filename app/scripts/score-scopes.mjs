// Scores the AI's scopes for a whole project against the contractor's own bid forms (Danial, 24 Oct: "compare the
// results with Marcel's actual bid forms"). A local tool, not part of `pnpm check`: it reads client documents, so nothing
// it reads or writes belongs in the repository. It calls no AI: it scores a run already made.
//
//   node --experimental-strip-types --no-warnings scripts/score-scopes.mjs --forms <folder of bid form PDFs> \
//     --scopes <scope-and-bid-forms.csv, from Export CSV in Scopes & bid forms> [--out <folder>]
//
// Without --scopes it only says what it could read from each form. Writes report.md and missed.csv to --out.

import { register } from "node:module";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

register("./ts-resolver.mjs", import.meta.url);
const K = await import("../lib/bid-form-key.ts");
const A = await import("../lib/scope-accuracy.ts");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) => a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs, []));
if (!args.forms) { console.error("Missing --forms <folder of bid form PDFs>"); process.exit(2); }

async function pdfText(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map(it => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join(""));
  }
  await task.destroy();
  return pages.join("\n");
}

/** RFC 4180 rows. */
export function csvRows(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(x => x)) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some(x => x)) rows.push(row); }
  return rows;
}

// A form's short names, as an estimator writes them, in the words a bid package uses.
const ALIASES = { dfh: "doors frames hardware", glz: "glazing curtain storefront", alum: "aluminum glazing", demo: "demolition", sow: "" };
const words = (t) => t.toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).flatMap(w => (ALIASES[w] ?? w).split(" ")).filter(w => w.length >= 4);

/** The bid package a form belongs to: the same CSI division, and the most words in common with the form's trade and file name. */
export function packageForForm(packages, form) {
  const division = form.division;
  const mine = new Set(words(`${form.trade} ${form.file}`));
  const pool = packages.filter(p => !division || p.code.slice(0, 2) === division);
  return (pool.length ? pool : packages).map(p => ({ p, score: words(p.name).filter(w => mine.has(w)).length })).sort((a, b) => b.score - a.score).find(x => x.score > 0 || pool.length === 1)?.p ?? null;
}

/**
 * The other bid form layout (an exported sheet: "Bid Package 084000 : ALUMINUM AND GLAZING", numbered lines ticked with
 * a check mark, "[Scope Specific Items]" headings). The scope is what follows the first such heading; the documents
 * and contract lines above it aren't scope.
 */
export function parseCheckmarkForm(text) {
  const trade = text.match(/Bid Package\s+(\d{2})\d*\s*:\s*([^\[\n]+)/i);
  const key = { trade: trade ? `${trade[1]} - ${trade[2].trim()}` : "", divisions: [], sections: [], items: [], breakdown: [] };
  let inScope = false, group = "", open = [], n = 0;
  // The sheet's header, repeated on every page.
  const NOISE = /^(--- page|Address:|\[CONTACT\]|Bid Package |Date:|Target Award|PROJECT:|Base Bid|Leveling Sheet Summary|\u2713 \[INCLUDED\]|\d+ of \d+$)/i;
  for (const raw of text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
    if (NOISE.test(raw)) continue;
    const heading = raw.match(/^(?:\d+\s+)?\[([^\]]+)\]\s*$/);
    // Past the scope: prices, alternates and the like.
    if (heading) { if (/scope specific/i.test(heading[1])) inScope = true; else if (/alternate|unit price|labor|allowance|schedule|breakdown|price|total/i.test(heading[1])) inScope = false; group = heading[1]; open = []; continue; }
    if (!inScope) continue;
    const excluded = raw.match(/^(?:\d+\s+)?(.+?)\s+\[EXCLUDED\]/i);
    if (excluded) { key.items.push({ id: `C-${++n}`, part: "exclusion", kind: "scope", text: excluded[1], matchText: excluded[1], group: "Exclusions", response: "N", note: "" }); open = []; continue; }
    const ticked = raw.endsWith("✓");
    const body = raw.replace(/✓$/, "").trim().replace(/^\d+\s+/, "");
    if (body && !/^\d+$/.test(body)) open.push(body);
    if (ticked) {
      const line = open.join(" ").replace(/\s+/g, " ").trim();
      open = [];
      if (line) key.items.push({ id: `B-${++n}`, part: "inclusion", kind: "scope", text: line, matchText: line, group, response: "Y", note: "" });
    } else if (/^\d+\s/.test(raw)) open = body ? [body] : [];
  }
  return key;
}

const forms = [];
for (const name of readdirSync(args.forms).filter(f => /\.pdf$/i.test(f)).sort()) {
  const text = await pdfText(join(args.forms, name));
  const parsed = K.parseBidForm(text);
  const key = K.scopeLines(parsed).length ? parsed : parseCheckmarkForm(text);
  const division = (name.match(/^(\d{2})\b/) ?? key.trade.match(/^(\d{2})\b/) ?? [])[1] ?? key.divisions[0]?.number?.slice(0, 2) ?? "";
  forms.push({ file: name, trade: key.trade, division, key, chars: text.length });
}
console.log(forms.map(f => `${f.file}: "${f.trade}" · ${f.chars} characters · ${f.key.sections.length} sections · ${K.scopeLines(f.key).length} scope lines · ${K.exclusionLines(f.key).length} exclusions`).join("\n"));
if (!args.scopes) process.exit(0);

const [head, ...rows] = csvRows(readFileSync(args.scopes, "utf8").replace(/^﻿/, ""));
const col = (name) => head.findIndex(h => h.trim().toLowerCase() === name);
const at = { pkg: col("package"), code: col("csi section"), title: col("scope"), detail: col("detail"), source: col("source"), status: col("status") };
const findings = rows.map((r, i) => ({ id: `s${i + 1}`, pkg: r[at.pkg], code: r[at.code], title: r[at.title], detail: r[at.detail] ?? "", source: r[at.source] ?? "", status: r[at.status] }));
const packages = [...new Map(findings.map(f => [f.pkg, { name: f.pkg, code: f.code }])).values()];

const out = args.out ?? "accuracy-out";
mkdirSync(out, { recursive: true });
const lines = [`# AI scopes against the contractor's bid forms`, ``, `Scopes file: ${basename(args.scopes)} (${findings.length} lines, ${packages.length} packages).`, ``, `"Matched" shares two or more distinctive words at a high score; "possible" needs a person to confirm; the rest is "missed". Word overlap is cautious, not a verdict: use the lists.`, ``, `| Form | Bid package | Form's lines | Matched | Possible | Missed | AI lines | Extra | Conflicts |`, `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`];
const missed = [["Form", "Bid package", "Group", "Line the form asks for"]], sections = [];
let totals = { lines: 0, matched: 0, possible: 0 };
for (const form of forms) {
  const pkg = packageForForm(packages, form);
  const report = A.scoreScope(form.key, pkg ? findings.filter(f => f.pkg === pkg.name) : []);
  const s = report.summary;
  totals = { lines: totals.lines + s.scopeLines, matched: totals.matched + s.matched, possible: totals.possible + s.possible };
  lines.push(`| ${form.file} | ${pkg?.name ?? "none found"} | ${s.scopeLines} | ${s.matched} | ${s.possible} | ${s.missed} | ${s.findings} | ${s.extras} | ${s.conflicts} |`);
  sections.push(`## ${form.file}`, ``, `Sections the form lists: ${s.sectionsListed}; cited by the AI: ${s.sectionsCited}.`, ``);
  const unsure = report.lines.filter(l => l.verdict !== "matched");
  if (unsure.length) sections.push(`Not matched (${unsure.length}):`, ``, ...unsure.map(l => `- ${l.verdict === "possible" ? "(possible) " : ""}${l.item.text}`), ``);
  if (report.conflicts.length) sections.push(`AI lines that pair with the form's exclusions:`, ``, ...report.conflicts.map(c => `- "${c.finding.title}" vs excluded "${c.exclusion.text}"`), ``);
  for (const l of report.lines.filter(x => x.verdict === "missed")) missed.push([form.file, pkg?.name ?? "", l.item.group ?? "", l.item.text]);
}
lines.push(``, `**All forms: ${totals.matched} of ${totals.lines} lines matched, ${totals.possible} more possible.**`, ``, ...sections);
writeFileSync(join(out, "report.md"), lines.join("\n"));
writeFileSync(join(out, "missed.csv"), missed.map(r => r.map(c => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n"));
console.log(`\nAll forms: ${totals.matched} of ${totals.lines} lines matched, ${totals.possible} more possible. Report: ${join(out, "report.md")}`);

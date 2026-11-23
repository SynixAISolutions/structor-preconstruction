// The scope scoreboard on a real project (lib/scope-score): the AI's scope lines for some trades against the bid form the
// contractor wrote by hand. A local tool, not part of `pnpm check`: it reads the contractor's own bid sheet, so nothing it
// reads or writes belongs in the repository. It calls no AI; the AI's lines come from a run exported from the app.
//
//   pnpm score-scopes --key "C:\path\Live Bid sheet.xlsx" --run "C:\path\run.json" --out "C:\folder\outside\the\repo"
//                     --trades demolition=Demo,drywall=GWB,openings=DFH
//
// --trades pairs each trade package id in the run with its tab in the bid sheet. run.json is
// { "project": "...", "lines": [{ "packageId", "id", "title", "detail", "source" }] }.
// report.md is the scoreboard; results.json has every match.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/scope-score.ts");
const XLSX = createRequire(import.meta.url)("xlsx");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []));
if (!args.key || !existsSync(args.key) || !args.run || !existsSync(args.run) || !args.out || !args.trades) {
  console.error('Usage: pnpm score-scopes --key "C:\\path\\bid sheet.xlsx" --run "C:\\path\\run.json" --out "C:\\folder\\outside\\the\\repo" --trades demolition=Demo,drywall=GWB');
  process.exit(2);
}
const repo = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
mkdirSync(args.out, { recursive: true });
if (!relative(repo, realpathSync(resolve(args.out))).startsWith("..")) { console.error("Write the report outside the repository: it holds the contractor's bid sheet."); process.exit(2); }

const book = XLSX.readFile(args.key);
const run = JSON.parse(readFileSync(args.run, "utf8"));
const pairs = String(args.trades).split(",").map(p => p.split("=").map(s => s.trim())).filter(p => p.length === 2 && p[0] && p[1]);
const scores = pairs.map(([packageId, tab]) => {
  if (!book.Sheets[tab]) throw new Error(`The bid sheet has no tab named ${tab}.`);
  const key = S.readTradeTab(tab, XLSX.utils.sheet_to_json(book.Sheets[tab], { header: 1, defval: "" }));
  const lines = run.lines.filter(l => l.packageId === packageId).map(l => ({ id: String(l.id), title: String(l.title ?? ""), detail: String(l.detail ?? ""), source: String(l.source ?? "") }));
  return S.scoreTrade(key, lines);
});
const report = S.scoreReport(scores, `Scope scoreboard · ${run.project ?? "project"} · ${new Date().toISOString().slice(0, 10)}`);
writeFileSync(resolve(args.out, "report.md"), report);
writeFileSync(resolve(args.out, "results.json"), JSON.stringify(scores, null, 2));
console.log(report.split("\n").slice(0, 4 + scores.length + 2).join("\n"));
console.log(`\nWritten to ${resolve(args.out)}`);

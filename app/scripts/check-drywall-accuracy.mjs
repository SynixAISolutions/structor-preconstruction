// Usage: node scripts/check-drywall-accuracy.mjs --answer-key PRIVATE.json --review PRIVATE.json --run EXPORTED.json [--run DRAWING.json] [--quantities PRIVATE.json] [--output PRIVATE.json]
// The private answer key contains items:[{id,title}] and quantities:[{id,title,unit,value:null|number}].
// The source review is {reviewer,reviewedItemIds:[],matches:[{expectedId,findingIds:[]}]}: no keyword-based accuracy score.
import { readFile, writeFile } from "node:fs/promises";
import { drywallAccuracy } from "../lib/drywall-accuracy.mjs";

const args = process.argv.slice(2), values = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i], value = args[i + 1];
  if (!["--answer-key", "--review", "--run", "--quantities", "--output"].includes(key) || !value || value.startsWith("--")) throw new Error("Use --answer-key, --review and one or more --run file paths; --quantities and --output are optional.");
  (values[key] ??= []).push(value);
}
if (!values["--answer-key"] || !values["--review"] || !values["--run"]) throw new Error("Read the usage comment. Supply private answer-key and review files plus exported AI readings; no client answer key is stored in the repo.");
const read = async path => JSON.parse(await readFile(path, "utf8"));
const report = drywallAccuracy({ answerKey: await read(values["--answer-key"][0]), review: await read(values["--review"][0]), readings: await Promise.all(values["--run"].map(read)), quantities: values["--quantities"] ? await read(values["--quantities"][0]) : [] });
console.log(`Coverage: ${report.found.length} found / ${report.missed.length} missed / ${report.extra.length} extra candidates / ${report.unassessed.length} unassessed. Reviewer: ${report.reviewer}.`);
console.log(`Run limitations: ${report.failedRuns} failed runs, ${report.failures.length} failed requests, ${report.screening.length} screening notes.`);
for (const item of report.missed) console.log(`MISSED ${item.id}: ${item.title}`);
for (const quantity of report.quantityDeltas) console.log(`QUANTITY ${quantity.id}: ${quantity.actual ?? "not measured"} ${quantity.unit}; checked ${quantity.expected ?? "unavailable"}; delta ${quantity.delta ?? "unavailable"}`);
console.log(report.limits);
if (values["--output"]) await writeFile(values["--output"][0], JSON.stringify(report, null, 2) + "\n");

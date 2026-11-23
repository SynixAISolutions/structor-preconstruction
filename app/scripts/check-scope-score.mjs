// The scope scoreboard's rules (lib/scope-score), on made-up lines: the real bid sheet stays out of the repository.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/scope-score.ts");

const rows = [
  ["Trade:", "02 - DEMOLITION"], [],
  ["", "Section 3 - Scope of Work"], ["", "Furnish and Install All Items UON", "Y"],
  ["A", "Specifications"], ["", "Division 01 - General Requirements", "Y"], ["", "02 41 19 - Selective Demolition", "Y"], ["", "31 00 00 - Earthwork", "Y"],
  ["B", "Inclusions"], ["1", "SPECIFIC SCOPE ITEMS", "Y"], ["2", "Building Demolition", "Y"],
  ["3", "Demolition of existing building structure in its entirety.", "Y"],
  ["4", "Remove exterior steps and guardrails / handrails.", "Y"],
  ["5", "Salvage of bricks to neat piles for reuse.", "Y"],
  ["6", "Refer to demolition plan on Drawing D1.1", "Y"],
  ["7", "Provide Basis of Design (BOD) manufacturer(s):", ""], ["8", "1. Acme Wrecking", ""],
  ["9", "STANDARD / GENERAL SCOPE", "Y"], ["10", "Provide all equipment, material, labor, tools, supervision, etc.", "Y"],
  ["C", "Exclusions"], ["1", "HAZ MAT remediation", "N"], ["2", "Cut, Cap and Safe of MEP", "N"],
  ["D", "Schedule"], ["1", "Meet the schedule", "Y"],
];
const key = S.readTradeTab("Demo", rows);
assert.deepEqual([key.trade, key.sections, key.divisions], ["02 - DEMOLITION", ["02 41 19", "31 00 00"], ["01"]], "The trade, its specification sections and divisions");
assert.deepEqual(key.inclusions.map(l => l.text), ["Demolition of existing building structure in its entirety.", "Remove exterior steps and guardrails / handrails.", "Salvage of bricks to neat piles for reuse."], "Scope lines only: no headings, no blanket line");
assert.deepEqual([key.references.map(l => l.text), key.general.map(l => l.text), key.exclusions.map(l => l.text)],
  [["Refer to demolition plan on Drawing D1.1", "1. Acme Wrecking"], ["Provide all equipment, material, labor, tools, supervision, etc."], ["HAZ MAT remediation", "Cut, Cap and Safe of MEP"]], "Pointers and manufacturer lists, general lines and exclusions set apart; the schedule ignored");

assert.deepEqual(S.words("Demolish and haul off the existing gypsum board partitions"), ["remove", "off", "gypsum", "board", "partition"], "Trade synonyms share one word; filler words drop out");
const ai = [
  { id: "a1", title: "Demolish the existing one-story recreation center building.", detail: "Remove the building structure entirely.", source: "02 41 19 · §3.2" },
  { id: "a2", title: "Remove exterior stairs and handrails.", detail: "", source: "D1.1" },
  { id: "a3", title: "Cap and make safe MEP services before demolition.", detail: "Cut and cap utilities.", source: "02 41 19 · §3.4" },
  { id: "a4", title: "Protect adjacent masonry.", detail: "", source: "09 29 00 · §1.2" },
];
const score = S.scoreTrade(key, ai);
assert.deepEqual(score.found.map(m => [m.key.text.slice(0, 20), m.best.id]), [["Demolition of existi", "a1"], ["Remove exterior step", "a2"]], "Found when one AI line holds half the meaningful words: demolish = demolition = remove");
assert.deepEqual(score.missed.map(m => m.key.text.slice(0, 20)), ["Salvage of bricks to"], "Missed when no line does");
assert.deepEqual(score.excluded.map(e => [e.line.id, e.exclusion.text]), [["a3", "Cut, Cap and Safe of MEP"]], "An AI line on work the form excludes");
assert.deepEqual(score.sections, { cited: ["02 41 19"], missed: ["31 00 00"], notOnForm: ["09 29 00"] }, "Sections cited, missed and cited from another trade");
assert.deepEqual(score.other.map(l => l.id), ["a4"], "AI lines on the form's work aren't counted as other");
const report = S.scoreReport([score], "Test");
assert(report.includes("| 02 - DEMOLITION | 2 of 3 (67%) | 1 |") && report.includes("### Missed (1)"), "The report's table and sections");

console.log("Scope scoreboard checked: a bid sheet tab read into sections, scope lines, pointers, general lines and exclusions; trade synonyms; found, missed, excluded, sections cited and other lines; the report.");

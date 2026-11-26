// Percent complete from a Textura export (Marcel's Software Features list, item 28). Columns found by name, line items
// added up per subcontractor and project, rows matched to awarded contracts without guessing, applied as "textura".
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const T = await import("../lib/textura-import.ts");
const A = await import("../lib/aggregate-limits.ts");

// Amounts and percents as exports write them.
assert.equal(T.money("$1,250,000.50"), 1250000.5);
assert.equal(T.money("(25,000)"), -25000);
assert.equal(T.money("n/a"), null);
// CSV with quoted commas, a doubled quote and Windows line ends.
assert.deepEqual(T.parseCsv('Subcontractor,Project\r\n"Capitol Wall Systems, Inc.","Project ""1"""\r\n'), [["Subcontractor", "Project"], ["Capitol Wall Systems, Inc.", "Project \"1\""]]);

// A Textura-style payment report: title rows above the header, schedule-of-values lines per subcontractor, a total row.
const report = [
  ["MCN Build · Payment status report"], ["Generated 11/26/2026"], [],
  ["Project Name", "Subcontractor", "Contract #", "Scheduled Value", "Total Completed & Stored to Date", "% Complete"],
  ["Project 1", "Capitol Wall Systems, Inc.", "SC-09-001", "$600,000.00", "$150,000.00", "25%"],
  ["Project 1", "Capitol Wall Systems, Inc.", "SC-09-001", "$400,000.00", "$250,000.00", "62.5%"],
  ["Project 1", "Capital Demolition LLC", "SC-02-001", "480000", "480000", "100%"],
  ["Project 2", "District Concrete", "SC-03-002", "3120000", "312000", "10%"],
  ["Project 1", "Nobody Painting", "SC-09-900", "100000", "50000", "50%"],
  ["Grand Total", "", "", "4600000", "1242000", ""],
];
const rows = T.readTexturaTable(report);
assert.deepEqual(rows.map(r => [r.company, r.project, r.percent]), [
  ["Capitol Wall Systems, Inc.", "Project 1", 40],   // (150,000 + 250,000) / (600,000 + 400,000): dollars, not an average of 25% and 62.5%
  ["Capital Demolition LLC", "Project 1", 100],
  ["District Concrete", "Project 2", 10],
  ["Nobody Painting", "Project 1", 50],
], "line items added up per subcontractor and project; title and total rows left out");
// Only a % column (Excel percent cells come as fractions).
assert.deepEqual(T.readTexturaTable([["Vendor", "% Complete"], ["Capitol Wall Systems", 0.35]]).map(r => r.percent), [35]);
assert.throws(() => T.readTexturaTable([["Name", "Amount"], ["x", 1]]), /no subcontractor column/);

// The Aggregate limits page's contracts: Capitol has two (Project 1 Drywall, Project 3 Drywall), District has one.
const contract = (awardId, projectName, trade, amount, percent = null) => ({ awardId, projectId: projectName, projectName, trade, amount, percent, open: amount, executed: true });
const exposures = [
  { companyId: "b7", company: "Capitol Wall Systems", contracts: [contract("aw-cws-1", "Project 1", "Drywall", 1_000_000, 10), contract("aw-cws-3", "Project 3", "Drywall", 750_000)] },
  { companyId: "b1", company: "Capital Demolition", contracts: [contract("aw-cd-1", "Project 1", "Demolition", 480_000)] },
  { companyId: "b2", company: "District Concrete", contracts: [contract("aw-dc-2", "Project 2", "Concrete", 3_120_000)] },
];
const { matches, misses } = T.matchTextura(rows, exposures);
assert.deepEqual(matches.map(m => [m.awardId, m.was, m.percent]), [["aw-cws-1", 10, 40], ["aw-cd-1", null, 100], ["aw-dc-2", null, 10]],
  "same company despite Inc./LLC, then same project");
assert.equal(misses.length, 1);
assert.match(misses[0].reason, /No company called "Nobody Painting"/);
// Without a project column, a company with two contracts is told apart by the contract value, or left unmatched.
assert.deepEqual(T.matchTextura([{ company: "Capitol Wall Systems", project: "", contract: "", value: 750_000, completed: 75_000, percent: 10 }], exposures).matches.map(m => m.awardId), ["aw-cws-3"]);
assert.match(T.matchTextura([{ company: "Capitol Wall Systems", project: "", contract: "", value: null, completed: null, percent: 10 }], exposures).misses[0].reason, /2 awarded contracts/);
assert.match(T.matchTextura([{ company: "District Concrete", project: "Project 9", contract: "", value: null, completed: null, percent: 5 }], exposures).misses[0].reason, /no awarded contract on a project called "Project 9"/);

// Applied as Textura figures; a typed figure stays "manual".
const applied = matches.reduce((s, m) => A.setPercentComplete(s, m.awardId, m.percent, "Marcel Khoury", "2026-11-26T12:00:00Z", "textura"), A.NO_LIMITS);
assert.deepEqual(applied.progress.map(p => [p.awardId, p.percent, p.source]), [["aw-cws-1", 40, "textura"], ["aw-cd-1", 100, "textura"], ["aw-dc-2", 10, "textura"]]);
assert.equal(A.setPercentComplete(A.NO_LIMITS, "aw-x", 5, "Marcel Khoury").progress[0].source, "manual");

console.log("Textura import checked: amounts and CSV, a payment report with title, line and total rows, % columns, matching by company, project and value without guessing, applied as Textura.");

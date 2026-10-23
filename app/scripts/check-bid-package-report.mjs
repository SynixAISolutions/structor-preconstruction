import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const R = await import("../lib/bid-package-report.ts");
const L = await import("../lib/leveling.mjs");
const D = await import("../lib/assistant-data.ts");
const C = await import("../lib/assistant-client.ts");
const T = await import("../lib/assistant-tools.ts");
const XLSX = await import("xlsx");

// ── The report, from the leveling engine's own totals ──
const items = [
  { id: "i1", number: "1", description: "Gypsum board walls, Level 4 finish", section: "09 29 00", required: true, source: "", estimatorNote: "" },
  { id: "i2", number: "2", description: "Acoustical ceilings", section: "09 51 13", required: true, source: "", estimatorNote: "" },
];
const yes = { status: "Y", note: "", adjustment: 0 };
const bidders = [
  { id: "a", name: "Alpha Walls", contact: "", baseBid: 100000, sourceEligibility: "Full scope", responses: { i1: yes, i2: yes } },
  { id: "b", name: "Bravo Interiors", contact: "", baseBid: 90000, sourceEligibility: "Full scope", responses: { i1: yes, i2: { status: "N", note: "Ceilings by others", adjustment: 0 } } },
  { id: "c", name: "Charlie Drywall", contact: "", baseBid: 95000, sourceEligibility: "Full scope", responses: { i1: yes, i2: { status: "N", note: "Plugged at our unit rate", adjustment: 6000, adjustmentApproved: true, resolved: true } } },
  { id: "d", name: "Delta Builders", contact: "", baseBid: null, sourceEligibility: "Full scope", responses: { i1: yes, i2: yes } },
];
const report = R.bidPackageReport({ projectName: "Test Project", trade: "Drywall", code: "09 29 00", packageId: "drywall", asOf: "2026-10-22", items, bidders, asSubmitted: false, budget: 110000, budgetBasis: "the linked budget line", selected: null });
const totals = Object.fromEntries(bidders.map(b => [b.name, L.bidderTotals(b, items)]));
assert.deepEqual(report.ranked.map(b => [b.company, b.rank]), [["Alpha Walls", 1], ["Charlie Drywall", 2], ["Bravo Interiors", null], ["Delta Builders", null]], "Leveled bids by their totals, then the ones that can't be ranked");
for (const b of report.ranked) {
  const t = totals[b.company];
  assert.deepEqual([b.provisionalTotal, b.leveledTotal, b.bond, b.adjustments], [t.provisionalTotal, t.reviewedTotal, t.bond, t.adjustment], `${b.company}: the leveling engine's figures`);
}
assert.equal(report.ranked[1].leveledTotal, (95000 + 6000) * 1.02, "Charlie: base + approved plug + 2% bond, above Alpha's 100,000 + bond");
assert.match(report.ranked[2].status, /^Not rankable: 1 scope item to review/);
assert.match(report.ranked[3].status, /no price/);
assert.deepEqual([report.leveledLow, report.apparentLow], [{ company: "Alpha Walls", total: 102000 }, { company: "Bravo Interiors", total: 91800 }]);
assert.deepEqual([report.spreadBasis, report.spread, report.spreadPercent], ["leveled", 1020, 1], "Two leveled bids: the spread is between leveled totals");
assert.deepEqual([report.lowVsBudget, report.ranked[2].vsLow], [-8000, -10200]);
assert.deepEqual(report.adjustments.map(a => [a.company, a.amount, a.approved]), [["Charlie Drywall", 6000, true]], "Only real plugs and adjustments");
assert.deepEqual(report.gaps.map(g => [g.company, g.answer, g.item]), [["Bravo Interiors", "N", "2 Acoustical ceilings"]], "Resolved exclusions are not gaps");
assert.equal(report.summary, "4 bids. Alpha Walls is the leveled low at $102,000. Bravo Interiors is the apparent low at $91,800, with 1 scope item excluded or partly covered. Spread $1,020 (1%) between the lowest and highest leveled totals. The low is $8,000 under the trade budget of $110,000 (the linked budget line). No bidder is selected yet.");
// Ties share a rank.
const tied = R.bidPackageReport({ projectName: "P", trade: "T", code: "", packageId: "t", asOf: "2026-10-22", items, bidders: [bidders[0], { ...bidders[0], id: "a2", name: "Alpha Twin" }], asSubmitted: false, budget: null, budgetBasis: null, selected: null });
assert.deepEqual(tied.ranked.map(b => b.rank), [1, 1]);
assert.deepEqual([tied.lowVsBudget, tied.summary.includes("budget")], [null, false], "No budget, no budget sentence");
// One leveled bid: the spread falls back to the totals as they stand.
const one = R.bidPackageReport({ projectName: "P", trade: "T", code: "", packageId: "t", asOf: "2026-10-22", items, bidders: bidders.slice(0, 2), asSubmitted: true, budget: null, budgetBasis: null, selected: { company: "Alpha Walls", amount: 100000, stage: "exhibit draft" } });
assert.deepEqual([one.spreadBasis, one.spread], ["provisional", 10200]);
assert.match(one.summary, /^2 bids, as submitted: nobody has reviewed them in Bid leveling yet\. Alpha Walls is the lowest complete bid/);
assert.match(one.summary, /Alpha Walls is selected at \$100,000 \(exhibit draft\)\.$/);

// ── The workbook ──
const book = R.reportWorkbook(report, XLSX);
assert.deepEqual(book.SheetNames, ["Summary", "Ranked bids", "Plugs and adjustments", "Exclusions and gaps"]);
const back = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
const rows = name => XLSX.utils.sheet_to_json(back.Sheets[name], { header: 1, defval: null });
const ranked = rows("Ranked bids");
assert.deepEqual(ranked[0], ["Rank", "Company", "Status", "Base bid", "Adjustments (plugs)", "Bond", "Accepted VE", "Provisional total", "Leveled total", "Vs low"]);
assert.deepEqual(ranked[1].slice(0, 2).concat(ranked[1][8]), [1, "Alpha Walls", 102000], "Numbers stay numbers in Excel");
assert.equal(book.Sheets["Ranked bids"].D2.z, '"$"#,##0;[Red]-"$"#,##0', "Money is formatted as money");
const summary = Object.fromEntries(rows("Summary").filter(r => r[0]).map(r => [r[0], r[1]]));
assert.deepEqual([summary["Leveled low"], summary["Leveled low total"], summary["Trade budget"], summary["Budget from"], summary.Bids], ["Alpha Walls", 102000, 110000, "the linked budget line", 4]);
assert.equal(book.Sheets.Summary.B6.z, undefined, "The bid count is not formatted as money");
assert.deepEqual(rows("Plugs and adjustments")[1], ["Charlie Drywall", "2 Acoustical ceilings", "N", 6000, "Yes", "Plugged at our unit rate"]);
assert.deepEqual(rows("Exclusions and gaps")[1], ["Bravo Interiors", "2 Acoustical ceilings", "Yes", "N", null, "Ceilings by others"]);
assert.equal(R.reportFileName({ ...report, projectName: 'Jelleff: "Rec" Center', trade: "Doors / frames" }), "Jelleff- -Rec- Center Doors - frames bid summary 2026-10-22.xlsx");

// ── On the Jelleff sample: its drywall bids as submitted, budget by CSI code, the executed award ──
const jelleff = (await D.bidPackageSummary("jelleff", "drywall", "2026-10-22")).report;
assert.deepEqual([jelleff.asSubmitted, jelleff.leveledLow.company, jelleff.apparentLow.company, jelleff.spreadBasis, jelleff.gaps.length], [true, "Capitol Wall Systems", "Rock Creek Interiors", "provisional", 2]);
assert.deepEqual([jelleff.budget, jelleff.budgetBasis], [1065450.18, "budget line 09200, matched by CSI code"], "The budget line Quantity takeoffs would match");
assert.deepEqual(jelleff.selected, { company: "Capitol Wall Systems", amount: 1012400, stage: "executed" });
assert.deepEqual(await D.bidPackageSummary("jelleff", undefined, "2026-10-22"), { error: "Name the trade to summarize.", trades: ["Concrete", "Roofing", "Doors, frames & hardware", "Drywall"] });
assert.match((await D.bidPackageSummary("jelleff", "elevators", "2026-10-22")).error, /No trade with bids matches "elevators"/);

// ── As a tool and as a saved task ──
const tool = await D.runAssistantTool({ id: "x", name: "bid_package_summary", arguments: { trade: "Drywall" } }, { projectId: "jelleff", today: "2026-10-22" });
const brief = JSON.parse(tool.content);
assert.deepEqual([tool.reports.length, tool.screens, brief.ranked.length, brief.gaps.length], [1, ["leveling"], 2, 2], "The AI gets the figures that matter; the panel gets the report");
assert.match(brief.shownToUser, /tables and its Excel download are shown/);
assert.ok(T.SAVED_TASKS.every(t => T.ASSISTANT_TOOLS.some(x => x.name === t.tool)), "Every saved task runs a real tool");
const task = T.SAVED_TASKS.find(t => t.id === "bid-package-summary");
assert.deepEqual(await C.savedTaskChoices(task), ["Concrete", "Roofing", "Doors, frames & hardware", "Drywall"], "The trades with bids to choose from");
const ran = await C.runSavedTask(task, "Concrete");
assert.deepEqual([ran.reports.length, ran.reports[0].trade, ran.answer], [1, "Concrete", ran.reports[0].summary], "A saved task runs without the AI");
const failed = await C.runSavedTask(task, "Elevators");
assert.deepEqual([failed.reports.length, /No trade with bids matches/.test(failed.answer)], [0, true]);
// The AI asking twice for one trade shows one report.
let turn = 0;
const answer = await C.askStructor({ question: "Summarize the drywall bids", screen: "turnover", history: [] }, {
  send: async () => ++turn === 1 ? { kind: "tools", calls: [{ id: "s1", name: "bid_package_summary", arguments: { trade: "Drywall" } }, { id: "s2", name: "bid_package_summary", arguments: { trade: "drywall" } }] } : { kind: "answer", answer: "Capitol is the low." },
});
assert.deepEqual([answer.reports.length, answer.reports[0].trade, answer.answer], [1, "Drywall", "Capitol is the low."]);

console.log("Bid package report checked: totals from the leveling engine, ranks and ties, apparent and leveled low, spread (leveled or provisional), budget by link or CSI code, plugs and gaps, the summary, the Excel workbook read back, the Jelleff drywall report, the tool, saved tasks without the AI and the browser loop.");

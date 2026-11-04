import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const U = await import("../lib/unit-costs.ts");
const P = await import("../lib/project-scope.ts");

// The unit cost database (Marcel's process doc): rates kept from each job, as a benchmark for the next by project
// requirements, location and date, and per division per square foot. The rates below are made up.

const jobA = { id: "a", name: "School", location: "Washington, DC", taxStatus: "non-taxable", certifications: ["CBE", "First Source"] };
const jobB = { id: "b", name: "Offices", location: "Arlington, VA", taxStatus: "taxable", certifications: [] };
const row = (id, item, unit, rate, o = {}) => ({ id, division: "07 · Thermal & moisture", item, unit, quantity: 100, rate, source: "A1.3", reviewed: true, ...o });

// ── The organization's, not a project's ──
assert(P.GLOBAL_DRAFT_KEYS.has(U.UNIT_COSTS_KEY), "Saved for the organization, across projects");
assert.equal(P.draftStorageKey("a", U.UNIT_COSTS_KEY), P.draftStorageKey("b", U.UNIT_COSTS_KEY));

// ── Units and wording ──
for (const [a, b] of [["sq ft", "SF"], ["S.F.", "SF"], ["sqft", "SF"], ["lin ft", "LF"], ["Each", "EA"], ["cu yd", "CY"], ["ton", "TON"], ["Tons", "TON"]]) assert.equal(U.unitKey(a), b, a);
assert.equal(U.itemKey("  Roof & Flashing,  Single-Ply "), "roof and flashing single ply");
assert.equal(U.divisionOf("07 · Thermal"), "07");
assert.equal(U.divisionOf("09 29 00"), "09");
assert.equal(U.divisionOf("03300"), "03");
assert.equal(U.divisionOf("99"), null, "Not a division");
assert.equal(U.divisionOf(""), null);

// ── From an estimate: reviewed, priced, real ──
const rows = [
  row("1", "Single-ply membrane roofing", "sq ft", 12.5),
  row("2", "Roof insulation", "SF", 4),
  row("3", "Unreviewed line", "SF", 9, { reviewed: false }),
  row("4", "No rate yet", "SF", 0),
  row("5", "Sample line", "SF", 3, { source: "Illustrative demo quantity and unit rate · 16 Oct 2026" }),
];
const found = U.entriesFromEstimate(rows, jobA, "2025-03-10", "Marcel Khoury");
assert.deepEqual([found.entries.map(e => e.item), found.unreviewed, found.unpriced, found.samples], [["Single-ply membrane roofing", "Roof insulation"], 1, 1, 1], "Only reviewed, priced lines; what's left out is counted");
assert.deepEqual([found.entries[0].unit, found.entries[0].division, found.entries[0].project, found.entries[0].taxStatus, found.entries[0].certifications, found.entries[0].date, found.entries[0].source], ["SF", "07", "School", "non-taxable", ["CBE", "First Source"], "2025-03-10", "Estimate"], "Each keeps what shaped the price");

// ── One price per job per item ──
let state = U.saveUnitCosts(U.EMPTY_UNIT_COSTS, found.entries);
assert.deepEqual([state.added, state.updated, state.unchanged], [2, 0, 0]);
const unchanged = U.saveUnitCosts(state.state, U.entriesFromEstimate(rows, jobA, "2025-09-01", "Marcel Khoury").entries);
assert.deepEqual([unchanged.added, unchanged.updated, unchanged.unchanged], [0, 0, 2], "Saving again changes nothing");
assert.equal(unchanged.state.entries[0].date, "2025-03-10", "An unchanged rate keeps its date");
const repriced = U.saveUnitCosts(state.state, U.entriesFromEstimate([row("1", "SINGLE-PLY membrane roofing!", "SF", 13)], jobA, "2025-09-01", "Marcel Khoury").entries);
assert.deepEqual([repriced.added, repriced.updated], [0, 1], "The same item in other capitals is the same price");
assert.deepEqual([repriced.state.entries[0].rate, repriced.state.entries[0].date], [13, "2025-09-01"]);

// ── By hand ──
const typed = { item: "Roof insulation", unit: "SF", rate: 5, division: "07", project: "Vendor quote", location: "Baltimore, MD", taxStatus: "taxable", certifications: ["CBE"], date: "2026-02-01" };
let data = U.addUnitCost(state.state, typed, "Sadie");
assert.deepEqual([data.entries.at(-1).source, data.entries.at(-1).projectId, data.entries.at(-1).by], ["Typed in", null, "Sadie"]);
assert.throws(() => U.addUnitCost(state.state, { ...typed, item: " " }, "S"), /Describe the item/);
assert.throws(() => U.addUnitCost(state.state, { ...typed, unit: " " }, "S"), /unit/);
for (const rate of [0, -1, NaN, 1e10]) assert.throws(() => U.addUnitCost(state.state, { ...typed, rate }, "S"), /above 0/, String(rate));
assert.throws(() => U.addUnitCost(state.state, { ...typed, date: "soon" }, "S"), /date/);
assert.throws(() => U.addUnitCost(data, typed, "S"), /already in the database/);
assert.equal(U.addUnitCost(U.EMPTY_UNIT_COSTS, { ...typed, project: " " }, "S").entries[0].project, "Typed in");

// ── More jobs ──
data = U.saveUnitCosts(data, U.entriesFromEstimate([row("1", "Single ply membrane roofing", "SF", 18), row("2", "Roof insulation", "SF", 6), row("3", "Roof insulation", "LF", 40)], jobB, "2026-06-01", "Victor").entries).state;
assert.equal(data.entries.length, 6);

// ── Benchmarks ──
const groups = U.benchmarks(data.entries);
assert.deepEqual(groups.map(g => [g.item, g.unit, g.count, g.jobs]), [["Roof insulation", "LF", 1, 1], ["Roof insulation", "SF", 3, 3], ["Single ply membrane roofing", "SF", 2, 2]], "A rate only sits with rates per the same unit; the newest wording names it");
const insulation = groups[1];
assert.deepEqual([insulation.low, insulation.median, insulation.high, insulation.latest, insulation.division], [4, 5, 6, "2026-06-01", "07"]);
assert.deepEqual(insulation.byYear, [{ year: "2025", median: 4, count: 1 }, { year: "2026", median: 5.5, count: 2 }], "The trend, year by year");
assert.deepEqual(insulation.entries.map(e => e.project), ["Offices", "Vendor quote", "School"], "Newest first");
assert.deepEqual(U.rateStats([10, 2, 6, 4]), { low: 2, median: 5, high: 10 }, "An even count takes the middle two");
assert.deepEqual(U.rateStats([]), { low: 0, median: 0, high: 0 });
assert.deepEqual(U.benchmarks([]), []);

// ── By project requirements, location and date ──
const items = f => U.filterUnitCosts(data.entries, f).map(e => e.project);
assert.deepEqual(new Set(items({ taxStatus: "taxable" })), new Set(["Vendor quote", "Offices"]));
assert.deepEqual(new Set(items({ taxStatus: "non-taxable" })), new Set(["School"]));
assert.deepEqual(new Set(items({ program: "First Source" })), new Set(["School"]));
assert.deepEqual(new Set(items({ program: "CBE" })), new Set(["School", "Vendor quote"]));
assert.deepEqual(new Set(items({ location: " dc " })), new Set(["School"]));
assert.deepEqual(new Set(items({ since: "2026" })), new Set(["Vendor quote", "Offices"]));
assert.equal(U.filterUnitCosts(data.entries, { query: "membrane school" }).length, 1, "Every word, in the item or the job");
assert.equal(U.filterUnitCosts(data.entries, {}).length, 6);
assert.deepEqual(U.requirementsOf(jobA), { taxStatus: "non-taxable", program: "CBE", location: "DC" }, "Prices from jobs like this one");
assert.deepEqual(U.requirementsOf({ location: "", taxStatus: null, certifications: [] }), { taxStatus: "", program: "", location: "" });

// ── A line's benchmark: never another unit ──
assert.equal(U.benchmarkFor({ item: "roof insulation", unit: "sq ft" }, groups).unit, "SF");
assert.equal(U.benchmarkFor({ item: "Roof insulation", unit: "LF" }, groups).median, 40);
assert.equal(U.benchmarkFor({ item: "Roof insulation", unit: "EA" }, groups), null, "No price per that unit");
assert.equal(U.benchmarkFor({ item: "Single ply roofing membrane system", unit: "SF" }, groups).item, "Single ply membrane roofing", "The closest wording");
assert.equal(U.benchmarkFor({ item: "Painted steel lintels", unit: "SF" }, groups), null, "Nothing close: no benchmark, rather than a wrong one");
assert.equal(U.benchmarkFor({ item: "Single ply roofing membrane system", unit: "SF", division: "09 · Finishes" }, groups), null, "Another division isn't the same work");

// ── The open project against the database ──
const checks = U.checkEstimate([
  row("x", "Roof insulation", "SF", 7.5),
  row("y", "Single ply membrane roofing", "SF", 11),
  row("z", "Roof insulation", "LF", 41),
  row("n", "Roof insulation", "SF", 0),
  row("w", "Painted steel lintels", "SF", 12),
], data.entries, "c");
assert.deepEqual(checks.map(c => c.flag), ["high", "low", "close", "unpriced", "none"]);
assert.equal(Math.round(checks[0].difference * 100), 50, "$7.50 against a median of $5");
assert.equal(checks[3].benchmark.median, 5, "A line with no rate can take the median");
assert.equal(checks[4].difference, null);
const own = U.checkEstimate([row("x", "Roof insulation", "SF", 6)], data.entries, "b");
assert.deepEqual(own[0].benchmark.entries.map(e => e.project), ["Vendor quote", "School"], "A job doesn't benchmark itself");

// ── Removing ──
assert.equal(U.removeUnitCost(data, data.entries[0].id).entries.length, 5);

// ── Cost per square foot, by division ──
const line = (csiCode, amount, o = {}) => ({ description: csiCode ?? "x", costCenter: "Base", classification: "direct", csiCode, amount, byOwner: false, ...o });
const job = (id, o) => ({ id, name: id, location: "Washington, DC", type: "School", year: 2024, squareFeet: 10000, stage: "dd", workType: "new", taxStatus: "non-taxable", certifications: ["CBE"], locationIndex: 100, costIndex: 100, source: "x", lines: [], ...o });
const history = [
  job("one", { lines: [line("03 30 00", 100000), line("03300", 50000), line("09", 200000), line(null, 900000, { classification: "indirect" }), line("09", 500000, { byOwner: true }), line("Misc", 700000)] }),
  job("two", { squareFeet: 20000, year: 2026, location: "Arlington, VA", taxStatus: "taxable", certifications: [], lines: [line("03", 600000)] }),
  job("three", { squareFeet: 0, lines: [line("03", 100)] }),
];
const sf = U.divisionCostsPerSf(history, {});
assert.deepEqual(sf.divisions.map(d => [d.division, d.jobs, d.low, d.median, d.high]), [["03", 2, 15, 22.5, 30], ["09", 1, 20, 20, 20]], "Per job and per division; a job without a division says nothing about it; indirects, by-owner and uncoded lines stay out");
assert.equal(sf.divisions[0].name, "Concrete");
assert.deepEqual(sf.total, { jobs: 2, low: 30, median: 32.5, high: 35 }, "All trades, per job");
assert.equal(sf.jobs, 2, "A job with no area can't give a cost per square foot");
assert.deepEqual(U.divisionCostsPerSf(history, { taxStatus: "taxable" }).divisions.map(d => [d.division, d.median]), [["03", 30]]);
assert.deepEqual(U.divisionCostsPerSf(history, { program: "CBE" }).divisions.map(d => d.division), ["03", "09"]);
assert.deepEqual(U.divisionCostsPerSf(history, { location: "va", since: "2025" }).divisions.map(d => d.division), ["03"]);
assert.deepEqual(U.divisionCostsPerSf(history, { since: "2030" }), { divisions: [], total: null, jobs: 0 });

// ── Export ──
const csv = U.unitCostRows(data.entries);
assert.equal(csv.length, 7);
assert.deepEqual(csv[0].slice(0, 5), ["Division", "Item", "Unit", "Unit cost", "Job"]);
assert.deepEqual(csv[2].slice(0, 8), ["07", "Roof insulation", "SF", 6, "Offices", "Arlington, VA", "taxable", ""]);

console.log("Unit costs checked: saved from reviewed estimate lines and by hand, benchmarks by item, unit and year, filters by requirements, location and date, the open project against other jobs, cost per square foot by division, export.");

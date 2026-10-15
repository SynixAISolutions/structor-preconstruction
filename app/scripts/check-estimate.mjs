import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const E = await import("../lib/estimate.ts");
const B = await import("../lib/budget.ts");
const X = await import("../lib/extraction.ts");
const { initialTakeoffs } = await import("../lib/data/preconstruction.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleBudget } = await import("../lib/data/budget.ts");
const { sampleExtraction } = await import("../lib/data/extraction.ts");
const { sampleDrawingFlip } = await import("../lib/data/drawing-flip.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-13T12:00:00.000Z";
const fails = (fn, pattern) => assert.throws(fn, e => e instanceof E.EstimateRuleError && pattern.test(e.message), `expected ${pattern}`);
const budgetFails = (fn, pattern) => assert.throws(fn, e => e instanceof B.BudgetRuleError && pattern.test(e.message), `expected ${pattern}`);
const proc = freeze(structuredClone(sampleProcurement));
const rows = freeze(structuredClone(initialTakeoffs));
const budget = freeze(structuredClone(sampleBudget));
const pkg = id => proc.packages.find(p => p.id === id);
const trade = (r, id) => E.estimateByTrade(r, proc).trades.find(t => t.packageId === id);

// ── The trade list (Marcel, 07:44–08:51) ──
const list = E.estimateByTrade(rows, proc);
assert.deepEqual(list.trades.map(t => t.packageId), proc.packages.map(p => p.id), "Every trade, in procurement order");
assert.deepEqual([trade(rows, "demolition").items.map(r => r.id), trade(rows, "demolition").total, trade(rows, "demolition").owner], [["q1", "q2", "q3"], 1240 * 14 + 18650 * 2.75 + 38 * 185, "Safi"]);
// Drywall, the pilot trade: painted wall finish plus the seven illustrative drywall lines (q9–q16).
const DRYWALL = 71280 + 203300 + 175480 + 102720 + 34965 + 37950 + 105850 + 86800;
assert.deepEqual([trade(rows, "drywall").total, trade(rows, "drywall").items.length, trade(rows, "drywall").unreviewed, trade(rows, "carpentry").total, trade(rows, "carpentry").items], [DRYWALL, 8, 5, 0, []]);
assert.equal(DRYWALL, 818345);
assert.deepEqual([list.unassigned, list.total], [[], 75677.5 + 75790 + 136960 + 176700 + 281250 + 69300 + DRYWALL]);
assert.deepEqual([E.lineAmount({ quantity: 0.1, rate: 0.2 }), E.lineAmount({ quantity: 3, rate: 33.333 })], [0.02, 100], "Line amounts to the cent");

// Lines saved before trades existed are placed by division when only one trade has it.
const legacy = (division, extra = {}) => ({ id: "old", division, item: "x", unit: "EA", quantity: 1, rate: 1, source: "", reviewed: false, ...extra });
assert.deepEqual(["03 · Concrete", "09 · Finishes", "13 · Special"].map(d => E.packageOfRow(legacy(d), proc.packages)), ["concrete", null, null], "Division 09 has two trades: unassigned");
assert.deepEqual([E.packageOfRow(legacy("03 · Concrete", { packageId: null }), proc.packages), E.packageOfRow(legacy("03 · Concrete", { packageId: "gone" }), proc.packages)], [null, null], "An explicit or unknown trade is not guessed over");
assert.equal(E.placeRows(rows, proc.packages), rows, "Placed rows keep their identity");
assert.deepEqual(E.placeRows([legacy("03 · Concrete"), legacy("09 · Finishes")], proc.packages).map(r => r.packageId), ["concrete", null]);
assert.deepEqual(E.estimateByTrade([legacy("09 · Finishes")], proc).unassigned.length, 1);
const tenths = Array.from({ length: 3 }, (_, i) => legacy("03 · Concrete", { id: `t${i}`, quantity: 0.1, rate: 0.1 }));
assert.deepEqual([E.estimateByTrade(tenths, proc).total, trade(tenths, "concrete").total], [0.03, 0.03], "Totals add cents, not floating dollars");

// ── Adding and changing lines ──
const added = E.addEstimateItem(rows, proc, { packageId: "drywall", item: "Shaft wall", unit: "SF", quantity: 1200, rate: 9.5, source: "A8.1" });
assert.deepEqual([added.at(-1).packageId, added.at(-1).division, added.at(-1).reviewed, trade(added, "drywall").total], ["drywall", "09 · Finishes", false, DRYWALL + 11400]);
assert.equal(E.addEstimateItem(rows, proc, { packageId: "carpentry", item: "Blocking", unit: "LF", quantity: 10, rate: 1 }).at(-1).division, "06 · Wood, Plastics, and Composites", "A division without an older label gets the CSI name");
assert.equal(E.addEstimateItem(rows, proc, { packageId: null, item: "Misc", unit: "EA", quantity: 1, rate: 0 }).at(-1).division, "", "Unassigned lines are allowed");
fails(() => E.addEstimateItem(rows, proc, { packageId: "drywall", item: " ", unit: "SF", quantity: 1, rate: 1 }), /Describe the item/);
fails(() => E.addEstimateItem(rows, proc, { packageId: "drywall", item: "x", unit: "", quantity: 1, rate: 1 }), /unit/);
fails(() => E.addEstimateItem(rows, proc, { packageId: "drywall", item: "x", unit: "SF", quantity: 0, rate: 1 }), /above 0/);
fails(() => E.addEstimateItem(rows, proc, { packageId: "drywall", item: "x", unit: "SF", quantity: 1, rate: -1 }), /0 or more/);
fails(() => E.addEstimateItem(rows, proc, { packageId: "nope", item: "x", unit: "SF", quantity: 1, rate: 1 }), /doesn't exist/);

const modelRow = { rowId: "partition-l1-12", label: "SA3.20 partition, Level 01", unit: "SF", value: 6841, source: "A1.1 / A8.1" };
const withModel = E.addModelQuantity(rows, proc, "drywall", modelRow, 8);
assert.deepEqual([withModel.at(-1).origin, withModel.at(-1).quantity, withModel.at(-1).item], [{ kind: "model", rowId: "partition-l1-12", measured: 6841 }, 6841, modelRow.label]);
fails(() => E.addModelQuantity(withModel, proc, "drywall", modelRow, 8), /already in this trade's estimate/);
assert.equal(E.addModelQuantity(withModel, proc, "flooring", modelRow, 8).length, withModel.length + 1, "The same model row may be priced in another trade");
fails(() => E.addModelQuantity(rows, proc, "drywall", { ...modelRow, value: null }, 8), /no measured quantity/);
assert.deepEqual([E.modelDrift(withModel.at(-1), 6841), E.modelDrift(withModel.at(-1), 6900), E.modelDrift(withModel.at(-1), null), E.modelDrift(rows[0], 5)], [null, 6900, null, null]);

const quantityDraft = sampleExtraction.drafts.find(d => d.kind === "quantity");
fails(() => E.addAcceptedQuantity(rows, proc, quantityDraft, 8), /Accept the quantity finding/);
const acceptedDraft = X.acceptDraft({ extraction: sampleExtraction, procurement: proc, flip: sampleDrawingFlip }, quantityDraft.id, "Safi", at).extraction.drafts.find(d => d.id === quantityDraft.id);
const withAi = E.addAcceptedQuantity(rows, proc, acceptedDraft, 8);
assert.deepEqual([withAi.at(-1).origin, withAi.at(-1).packageId, withAi.at(-1).quantity, withAi.at(-1).source], [{ kind: "ai", draftId: quantityDraft.id }, "drywall", 6840, "A1.1"]);
fails(() => E.addAcceptedQuantity(withAi, proc, acceptedDraft, 8), /already in the estimate/);

const repriced = E.editEstimateItem(rows, proc, "q1", { rate: 15 });
assert.deepEqual([repriced.find(r => r.id === "q1").rate, repriced.find(r => r.id === "q1").reviewed], [15, false], "A new price needs a fresh review");
const moved = E.editEstimateItem(rows, proc, "q1", { packageId: "concrete" });
assert.deepEqual([moved.find(r => r.id === "q1").packageId, moved.find(r => r.id === "q1").division, moved.find(r => r.id === "q1").reviewed], ["concrete", "03 · Concrete", true], "Moving trade keeps the review");
assert.equal(E.editEstimateItem(rows, proc, "q1", { rate: 14 }), rows, "No change, same rows");
fails(() => E.editEstimateItem(rows, proc, "q1", { quantity: -2 }), /above 0/);
fails(() => E.editEstimateItem(rows, proc, "nope", { rate: 1 }), /no longer exists/);
assert.equal(E.setItemReviewed(rows, "q9", true).find(r => r.id === "q9").reviewed, true);
assert.equal(E.setItemReviewed(rows, "q1", true), rows);
assert.deepEqual(E.removeEstimateItem(rows, "q9").map(r => r.id), ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q10", "q11", "q12", "q13", "q14", "q15", "q16"]);
fails(() => E.removeEstimateItem(rows, "nope"), /no longer exists/);

// ── Which budget lines a trade lands on (Marcel's 5-digit codes) ──
const lands = (b, id) => { const t = E.budgetLinesForTrade(b, pkg(id)); return [t.basis, t.codes, t.lines.map(l => l.id)]; };
assert.deepEqual(lands(budget, "drywall"), ["suggested", ["09200"], ["nc-09200"]], "09 29 00 → 09200, not 09300 tile");
assert.deepEqual(lands(budget, "flooring"), ["suggested", ["09600"], ["nc-09600"]]);
assert.deepEqual(lands(budget, "steel"), ["suggested", ["05000"], ["nc-05000", "sw-05000"]], "05 12 00 → 05000 not 05500 misc metals; both cost centers");
assert.deepEqual(lands(budget, "carpentry"), ["suggested", ["06000"], ["nc-06000"]], "06 10 00 → 06000 rough carpentry, not 06400 millwork");
assert.deepEqual(lands(budget, "thermal")[1], ["07500"]);
assert.deepEqual([lands(budget, "openings")[1], lands(budget, "demolition")[1], lands(budget, "mechanical")[2]], [["08100"], ["02000"], ["nc-23000", "sw-23000"]]);
const tie = { ...budget, lines: [...budget.lines, { ...budget.lines.find(l => l.id === "nc-05500"), id: "x-05400", csiCode: "05400" }, { ...budget.lines.find(l => l.id === "nc-05500"), id: "x-05600", csiCode: "05600" }] };
assert.deepEqual(E.budgetLinesForTrade(tie, { ...pkg("steel"), code: "05 50 00" }).basis, "suggested", "An exact code wins");
assert.deepEqual(E.budgetLinesForTrade({ ...tie, lines: tie.lines.filter(l => l.csiCode !== "05500") }, { ...pkg("steel"), code: "05 50 00" }), { lines: [], basis: "ambiguous", codes: ["05400", "05600"] });
assert.deepEqual(E.budgetLinesForTrade(budget, { ...pkg("electrical"), division: "27", code: "27 10 00" }), { lines: [], basis: "none", codes: [] });
const linked = B.linkBudgetLine(budget, "nc-09300", "drywall", at);
assert.deepEqual(lands(linked, "drywall"), ["linked", ["09300"], ["nc-09300"]], "A linked line wins over the suggestion");
assert.equal(B.linkBudgetLine(linked, "nc-09300", "drywall", at), linked);
budgetFails(() => B.linkBudgetLine(budget, budget.lines.find(l => l.classification === "indirect").id, "drywall", at), /direct construction lines/);
assert.deepEqual(lands(B.linkBudgetLine(budget, "nc-09200", "flooring", at), "drywall"), ["suggested", ["09300"], ["nc-09300"]], "A line linked to another trade is never suggested; the next code is");

// ── Budget basis: the in-house estimate (Marcel, 14:55–15:28) ──
const drywallEstimate = trade(rows, "drywall");
const onEstimate = B.applyEstimateValue(budget, "nc-09200", pkg("drywall"), drywallEstimate, "Safi", at);
const line = onEstimate.lines.find(l => l.id === "nc-09200");
assert.deepEqual([line.forecast, line.forecastSource, line.estimateSource, line.packageId, line.budget], [DRYWALL, null, { kind: "estimate", packageId: "drywall", value: DRYWALL, lines: 8, unreviewed: 5, appliedAt: at, appliedBy: "Safi" }, "drywall", 1065450.18]);
budgetFails(() => B.applyEstimateValue(budget, "nc-05000", pkg("steel"), trade(rows, "steel"), "Safi", at), /budgeted on 2 lines \(New construction, Sitework\)/);
budgetFails(() => B.applyEstimateValue(budget, "nc-09300", pkg("drywall"), drywallEstimate, "Safi", at), /isn't Drywall's budget line/);
budgetFails(() => B.applyEstimateValue(budget, "nc-06000", pkg("carpentry"), trade(rows, "carpentry"), "Safi", at), /no priced estimate lines/);
budgetFails(() => B.applyEstimateValue(budget, "nc-09200", pkg("flooring"), drywallEstimate, "Safi", at), /another trade/);
budgetFails(() => B.applyEstimateValue({ ...tie, lines: tie.lines.filter(l => l.csiCode !== "05500" && !["05000"].includes(l.csiCode)) }, "x-05400", { ...pkg("steel"), code: "05 50 00" }, trade(rows, "steel"), "Safi", at), /Link Structural steel to its budget line first/);
const candidate = (over = {}) => ({ levelingBidderId: "b", bidderName: "Uniconstruction", packageId: "drywall", bidderId: null, submissionId: null, revisionNumber: null, formVersion: null, stale: false, eligible: true, eligibilityReasons: [], baseBid: 798303, provisionalTotal: 814269.06, reviewedTotal: 814269.06, ...over });
const onBid = B.applyLevelingValue(onEstimate, "nc-09200", candidate(), "reviewed", "Safi", at).lines.find(l => l.id === "nc-09200");
assert.deepEqual([onBid.forecast, onBid.estimateSource, onBid.forecastSource.bidderName], [814269.06, null, "Uniconstruction"], "A bid replaces the estimate as the basis");
assert.equal(B.editBudgetLine(onEstimate, "nc-09200", { forecast: 90000 }, "Safi", at).lines.find(l => l.id === "nc-09200").estimateSource, null, "A typed forecast clears the estimate source");
assert.equal(B.applyEstimateValue(B.applyLevelingValue(budget, "nc-09200", candidate(), "reviewed", "Safi", at), "nc-09200", pkg("drywall"), drywallEstimate, "Safi", at).lines.find(l => l.id === "nc-09200").forecastSource, null, "The estimate replaces a bid as the basis");

// ── Variance report (Marcel, 15:28–15:55) ──
const candidates = [candidate({ levelingBidderId: "d", bidderName: "District Construction", reviewedTotal: 902000 }), candidate({ levelingBidderId: "u" }),
  candidate({ levelingBidderId: "s", bidderName: "Stale Co", reviewedTotal: 500000, stale: true }), candidate({ levelingBidderId: "i", bidderName: "Open Co", reviewedTotal: null, eligible: false }),
  candidate({ levelingBidderId: "f", bidderName: "Flooring Co", packageId: "flooring", reviewedTotal: 100 })];
const report = E.varianceReport({ rows, procurement: proc, budget, candidates });
assert.deepEqual(report.map(r => r.packageId), proc.packages.map(p => p.id));
const drywall = report.find(r => r.packageId === "drywall");
assert.deepEqual(drywall, {
  packageId: "drywall", name: "Drywall", owner: "Safi", estimate: DRYWALL, estimateLines: 8, estimateUnreviewed: 5,
  bid: { bidderName: "Uniconstruction", value: 814269.06, basis: "reviewed", from: "leveling" },
  budget: 1065450.18, forecast: null, budgetBasis: "suggested",
  bidOverEstimate: { amount: -4075.94, percent: -0.5 }, budgetOverEstimate: 247105.18,
}, "Lowest eligible current reviewed bid of that trade, beside the estimate and the budget");
const fromForecast = E.varianceReport({ rows, procurement: proc, budget: B.applyLevelingValue(budget, "nc-09200", candidate({ reviewedTotal: 820000 }), "reviewed", "Safi", at) }).find(r => r.packageId === "drywall");
assert.deepEqual([fromForecast.bid, fromForecast.forecast], [{ bidderName: "Uniconstruction", value: 820000, basis: "reviewed", from: "budget-forecast" }, 820000], "Without the workspace, the bid applied to the budget");
const otherTrade = E.varianceReport({ rows, procurement: proc, budget: B.applyLevelingValue(budget, "nc-09200", candidate({ packageId: "flooring" }), "reviewed", "Safi", at) }).find(r => r.packageId === "drywall");
assert.equal(otherTrade.bid, null, "A bid from another trade's package is not this trade's bid");
const steel = report.find(r => r.packageId === "steel");
assert.deepEqual([steel.budget, steel.bid, steel.bidOverEstimate, steel.estimate], [1730430, null, null, 176700], "Two cost centers summed; no bid yet");
assert.deepEqual([report.find(r => r.packageId === "carpentry").estimate, report.find(r => r.packageId === "carpentry").budgetOverEstimate], [null, null], "No estimate lines: nothing to compare");
assert.equal(E.varianceReport({ rows: [legacy("09 · Finishes", { packageId: "drywall", quantity: 1, rate: 0 })], procurement: proc, budget, candidates }).find(r => r.packageId === "drywall").bidOverEstimate.percent, null, "A zero estimate has no percentage");

console.log(`Estimate checked: ${list.trades.length} trades, legacy placement, add/model/AI/edit/move/remove lines, budget lines by 5-digit code, In-house estimate as budget basis, variance against leveled bids.`);

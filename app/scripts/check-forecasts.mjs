import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { costPlan, budgetForecasts } = await import("../lib/forecasts.ts");
const { budgetCommitments } = await import("../lib/commitments.ts");
const { budgetTotals, editBudgetLine } = await import("../lib/budget.ts");
const { setLowestSubSplit } = await import("../lib/budget-comparison.ts");
const { deriveTodo } = await import("../lib/todo.ts");
const { sampleBudget } = await import("../lib/data/budget.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleAwards, sampleSubmissions } = await import("../lib/data/sample-award.ts");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { initialTakeoffs } = await import("../lib/data/preconstruction.ts");
const { estimateByTrade } = await import("../lib/estimate.ts");
const D = await import("../lib/assistant-data.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const cents = (v) => Math.round(v * 100);

// ── A small project ──
const at = "2026-10-22T00:00:00.000Z";
const line = (id, csiCode, extra = {}) => ({ id, costCenter: "Building", classification: "direct", csiCode, description: id, owner: "", budget: 500000, forecast: null, committed: 0, byOwner: false, status: "approved", approval: null, source: "manual", forecastSource: null, updatedAt: at, ...extra });
const published = { version: 1, at, by: "Marcel", items: [] };
const pkg = (id, name, division, code) => ({ id, name, division, code, owner: "", due: "2026-11-01", published });
const procurement = freeze({ ...structuredClone(sampleProcurement), packages: [
  pkg("conc", "Concrete", "03", "03 30 00"),
  pkg("dry", "Drywall", "09", "09 29 00"),
  pkg("roof", "Roofing", "07", "07 50 00"),
  pkg("door", "Doors", "08", "08 10 00"),
] });
const budget = freeze({ costCenters: [], allowances: [], lines: [
  line("conc1", "03 30 00"),
  line("dryA", "09 29 00", { packageId: "dry", costCenter: "Modernization", budget: 300000 }),
  line("dryB", "09 29 00", { packageId: "dry", costCenter: "Addition", budget: 100000 }),
  line("roof1", "07 50 00", { budget: 200000 }),
  line("door1", "08 10 00", { budget: 90000 }),
  line("spare", "31 00 00"),
  line("gc", null, { classification: "indirect", budget: 80000 }),
  line("owner", "08 10 00", { byOwner: true, budget: 40000 }),
] });

const template = sampleAwards.awards.find(a => a.subcontract?.status === "executed");
const award = (id, packageId, amount, stage, extra = {}) => {
  const a = structuredClone(template);
  Object.assign(a, { id, packageId, amount, budgetLineId: null, cancelled: null, ...extra });
  a.leveling = { ...a.leveling, bidderName: `${id} Co` };
  if (stage.startsWith("exhibit-")) { a.subcontract = null; a.exhibit = { ...a.exhibit, status: stage.slice("exhibit-".length) }; }
  else a.subcontract = { ...a.subcontract, status: stage === "subcontract-draft" ? "draft" : stage };
  return a;
};
const bid = (packageId, name, reviewedTotal, extra = {}) => ({ levelingBidderId: `${packageId}-${name}`, bidderName: name, packageId, bidderId: null, submissionId: null, revisionNumber: null, formVersion: null, stale: false, eligible: true, eligibilityReasons: [], baseBid: reviewedTotal, provisionalTotal: reviewedTotal, reviewedTotal, ...extra });
const estimate = (packageId, total, items, unreviewed = 0, unpriced = 0) => ({ packageId, name: packageId, code: "", owner: "", items: Array.from({ length: items }, (_, i) => ({ id: `${packageId}-${i}` })), total, unreviewed, unpriced });
const input = (patch = {}) => freeze({ awards: { awards: [], notifications: [] }, procurement, submissions: [], candidates: [], directory: [], estimates: [], ...patch });
const plan = (patch, b = budget) => costPlan(b, input(patch));

// Nothing to go on: every line counts at its budget, as before.
const empty = plan({});
assert(Object.values(empty.forecasts).every(f => f.kind === "none" && f.value === null && f.automatic === null), "No award, bid or estimate: no forecast");
assert.equal(budgetTotals(empty.budget).forecast, budgetTotals(budget).forecast);

// The order: award, else leveled low, else a fully reviewed estimate.
const estimates = [estimate("conc", 410000, 12), estimate("roof", 150000, 6), estimate("door", 70000, 4, 1)];
const candidates = [bid("conc", "Low Concrete", 420000), bid("roof", "High Roof", 260000), bid("roof", "Low Roof", 230000.5), bid("roof", "Cheaper but stale", 100000, { stale: true }), bid("roof", "Cheaper but open", 90000, { eligible: false })];
const awards = { awards: [award("a1", "conc", 455000, "signature-pending")], notifications: [] };
const full = plan({ awards, candidates, estimates });
const f = full.forecasts;
assert.deepEqual([f.conc1.kind, f.conc1.value, f.conc1.detail], ["award", 455000, "a1 Co · signature pending"], "An award at any stage beats the leveled low and the estimate");
assert.deepEqual([f.roof1.kind, f.roof1.value, f.roof1.detail], ["leveled-low", 230000.5, "Low Roof · reviewed total"], "The lowest current, reviewed total; stale and open bids are skipped");
assert.deepEqual([f.door1.kind, f.door1.value, f.door1.note], ["none", null, "In-house estimate has 1 unreviewed line"], "An estimate with unreviewed lines waits");
const reviewedDoors = plan({ estimates: [estimate("door", 70000, 4)] }).forecasts.door1;
assert.deepEqual([reviewedDoors.kind, reviewedDoors.value, reviewedDoors.detail], ["estimate", 70000, "4 lines, all reviewed"]);
assert.equal(plan({ estimates: [estimate("door", 70000, 4, 0, 2)] }).forecasts.door1.note, "In-house estimate has 2 unpriced lines");
assert.deepEqual([f.gc.kind, f.owner.kind, f.spare.kind], ["none", "none", "none"], "Indirect, owner-carried and trade-less lines take no automatic forecast");
assert.equal(budgetTotals(full.budget).forecast, 455000 + 230000.5 + 300000 + 100000 + 90000 + 500000 + 80000, "Totals read the worked-out forecasts");

// Cancelled awards fall back to the bids; executed or pending, the award is the subcontract sum.
const cancelled = plan({ awards: { awards: [award("a0", "conc", 1, "executed", { cancelled: { by: "Marcel", at, reason: "Withdrawn" } })], notifications: [] }, candidates }).forecasts.conc1;
assert.deepEqual([cancelled.kind, cancelled.value], ["leveled-low", 420000]);
assert.equal(plan({ awards: { awards: [award("a2", "conc", 461000, "executed")], notifications: [] } }).forecasts.conc1.detail, "a2 Co · executed");

// An award on a named line forecasts there; the trade's own line is not also forecast from bids.
const elsewhere = plan({ awards: { awards: [award("a3", "conc", 88000, "exhibit-agreed", { budgetLineId: "spare" })], notifications: [] }, candidates, estimates });
assert.deepEqual([elsewhere.forecasts.spare.kind, elsewhere.forecasts.spare.value], ["award", 88000]);
assert.deepEqual([elsewhere.forecasts.conc1.kind, elsewhere.forecasts.conc1.note], ["none", "Concrete's award is on another budget line"], "No second figure for an awarded trade");

// A trade on two lines: the estimator's split, exact to the cent, or nothing.
const dryBids = [bid("dry", "Wall Co", 100000.01)];
assert.deepEqual([plan({ candidates: dryBids }).forecasts.dryA.note, plan({ candidates: dryBids }).forecasts.dryB.value], ["Split Drywall between its 2 budget lines to use the leveled low", null]);
const split = setLowestSubSplit(budget, procurement.packages[1], { dryA: 200000, dryB: 100000 }, 300000);
const shared = plan({ candidates: dryBids }, split).forecasts;
assert.deepEqual([shared.dryA.value, shared.dryB.value], [66666.67, 33333.34]);
assert.equal(cents(shared.dryA.value) + cents(shared.dryB.value), 10000001, "The shares add back to the bid");
const dryAward = { awards: [award("d1", "dry", 300000, "executed")], notifications: [] };
assert.equal(plan({ awards: dryAward, candidates: dryBids }).forecasts.dryA.note, "Split Drywall between its 2 budget lines to use the award");
assert.deepEqual([plan({ awards: dryAward }, split).forecasts.dryA.value, plan({ awards: dryAward }, split).forecasts.dryB.value], [200000, 100000]);

// Overrides win, say what they are, and show the automatic value to go back to.
const typed = { ...budget, lines: budget.lines.map(l => l.id === "roof1" ? { ...l, forecast: 199000 } : l.id === "gc" ? { ...l, forecast: 85000 } : l) };
const overridden = plan({ candidates }, typed).forecasts;
assert.deepEqual([overridden.roof1.kind, overridden.roof1.value, overridden.roof1.detail, overridden.roof1.automatic], ["manual", 199000, "Typed", { value: 230000.5, kind: "leveled-low", detail: "Low Roof · reviewed total" }]);
assert.deepEqual([overridden.gc.kind, overridden.gc.value, overridden.gc.automatic], ["manual", 85000, null], "Indirect lines take a typed forecast");
const chosen = { ...budget, lines: budget.lines.map(l => l.id === "roof1" ? { ...l, forecast: 260000, forecastSource: { kind: "leveling", basis: "provisional", value: 260000, packageId: "roof", levelingBidderId: "x", bidderName: "High Roof", submissionId: null, revisionNumber: null, appliedAt: at, appliedBy: "Marcel" } } : l) };
assert.equal(plan({ candidates }, chosen).forecasts.roof1.detail, "High Roof · provisional total", "A bidder chosen by hand is an override too");
const cleared = editBudgetLine(chosen, "roof1", { forecast: null }, "Marcel", at);
assert.deepEqual([cleared.lines.find(l => l.id === "roof1").forecastSource, plan({ candidates }, cleared).forecasts.roof1.kind], [null, "leveled-low"], "Clearing the override goes back to automatic");

// Nothing is written into the saved budget; committed comes along from lib/commitments.
assert.equal(budget.lines.every(l => l.forecast === null), true);
assert.deepEqual(full.commitments, budgetCommitments(budget, awards, procurement));
assert.deepEqual(budgetForecasts(budget, full.commitments, input({ awards, candidates, estimates })), full.forecasts);

// The to-do sees a leveled low over budget.
const over = plan({ candidates: [bid("roof", "Pricey Roof", 260000)] }).budget;
const todo = deriveTodo({ project: null, documents: [], procurement, submissions: [], leveling: null, budget: over, awards: { awards: [], notifications: [] } });
assert.match(todo.tasks.find(t => t.id === "budget:over")?.detail ?? "", /roof1/, "Forecast over budget, from the leveled low");

// ── The Jelleff sample ──
const jelleffInput = { awards: sampleAwards, procurement: sampleProcurement, submissions: sampleSubmissions, candidates: [], directory: initialBidders, estimates: estimateByTrade(initialTakeoffs, sampleProcurement).trades };
const jelleff = costPlan(sampleBudget, jelleffInput).forecasts;
assert.deepEqual([jelleff["nc-03000"].kind, jelleff["nc-03000"].value, jelleff["nc-09200"].value], ["award", 1742000, 1012400], "Concrete and Drywall forecast from their awards");
assert.deepEqual([jelleff["nc-07500"].kind, jelleff["nc-07500"].note], ["none", "Bids not leveled yet · In-house estimate has 1 unreviewed line"], "Roofing: bids in, not leveled; estimate not reviewed");

// ── Ask Structor reads the same numbers ──
const tool = async (name, args = {}) => JSON.parse((await D.runAssistantTool({ id: "c", name, arguments: args }, { projectId: "jelleff", today: "2026-10-22" })).content);
const b = await tool("budget");
assert(b.lines.some(l => l.startsWith("Concrete") && l.includes("forecast 1742000") && l.includes("forecast from award: District Concrete · executed")), "Each line says where its forecast comes from");
assert(b.lines.some(l => l.includes("no forecast yet: Bids not leveled yet")));
const jelleffPlan = costPlan(sampleBudget, jelleffInput).budget;
assert.equal(b.totals.forecast, budgetTotals(jelleffPlan).forecast);
assert.equal((await tool("project_overview")).budget.forecast, budgetTotals(jelleffPlan).forecast);
assert.equal(budgetTotals(D.savedCostPlan("jelleff")).forecast, budgetTotals(jelleffPlan).forecast, "A version saved by Ask Structor carries the same forecasts");

console.log("Forecasts checked: no source, award (any stage, cancelled skipped, on a named line, awarded trade not forecast twice), leveled low (reviewed, current, lowest), in-house estimate once reviewed and priced, two-line trades with and without the split (exact to the cent), overrides typed or chosen and cleared, indirect and owner lines, totals, the to-do, the Jelleff sample and Ask Structor.");

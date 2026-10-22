import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { budgetCommitments, withCommitments } = await import("../lib/commitments.ts");
const { budgetTotals } = await import("../lib/budget.ts");
const { setLowestSubSplit } = await import("../lib/budget-comparison.ts");
const { sampleBudget } = await import("../lib/data/budget.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleAwards } = await import("../lib/data/sample-award.ts");
const D = await import("../lib/assistant-data.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const cents = (v) => Math.round(v * 100);

// ── The Jelleff sample: both executed subcontracts land on their linked lines ──
const jelleff = budgetCommitments(sampleBudget, sampleAwards, sampleProcurement);
assert.deepEqual([jelleff.committed, jelleff.pending, jelleff.unplaced], [2754400, 0, []], "Concrete and Drywall executed, nothing pending or unplaced");
assert.deepEqual(Object.fromEntries(Object.entries(jelleff.lines).map(([id, l]) => [id, [l.committed, l.sources.map(s => s.company)]])),
  { "nc-03000": [1742000, ["District Concrete"]], "nc-09200": [1012400, ["Capitol Wall Systems"]] });
const jelleffPlan = withCommitments(sampleBudget, jelleff);
for (const l of jelleffPlan.lines) {
  const typed = sampleBudget.lines.find(x => x.id === l.id).committed;
  assert.equal(l.committed, jelleff.lines[l.id] ? jelleff.lines[l.id].committed : typed, `${l.description}: an award's line carries the award, others keep their typed value`);
}

// ── A small project: one line per case ──
const line = (id, csiCode, extra = {}) => ({ id, costCenter: "Building", classification: "direct", csiCode, description: id, owner: "", budget: 500000, forecast: null, committed: 0, byOwner: false, status: "approved", approval: null, source: "manual", forecastSource: null, updatedAt: "2026-10-22T00:00:00.000Z", ...extra });
const pkg = (id, name, division, code) => ({ id, name, division, code, owner: "", due: "2026-11-01" });
const procurement = freeze({ ...structuredClone(sampleProcurement), packages: [
  pkg("conc", "Concrete", "03", "03 30 00"),
  pkg("dry", "Drywall", "09", "09 29 00"),
  pkg("mas", "Masonry", "04", "04 25 00"),
  pkg("elec", "Electrical", "26", "26 05 00"),
] });
const budget = freeze({ costCenters: [], allowances: [], lines: [
  line("conc1", "03 30 00", { committed: 123 }),
  line("dryA", "09 29 00", { packageId: "dry", costCenter: "Modernization", budget: 300000, committed: 4000 }),
  line("dryB", "09 29 00", { packageId: "dry", costCenter: "Addition", budget: 100000 }),
  line("mas1", "04 24 00"), line("mas2", "04 26 00"),
  line("spare", "31 00 00", { committed: 7000 }),
  line("gc", null, { classification: "indirect", committed: 25000 }),
  line("owner", "03 30 00", { byOwner: true, committed: 900 }),
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
const run = (awards, b = budget) => budgetCommitments(b, freeze({ awards, notifications: [] }), procurement);

// Stages: only an executed subcontract commits; everything from Exhibit A draft to countersigned is pending.
for (const stage of ["exhibit-draft", "exhibit-shared", "exhibit-changes-requested", "exhibit-agreed", "subcontract-draft", "signature-pending", "subcontractor-signed", "countersigned", "executed"]) {
  const c = run([award("a1", "conc", 450000.5, stage)]);
  const executed = stage === "executed";
  assert.deepEqual([c.lines.conc1.committed, c.lines.conc1.pending, c.committed, c.pending], executed ? [450000.5, 0, 450000.5, 0] : [0, 450000.5, 0, 450000.5], stage);
  assert.equal(c.lines.conc1.sources[0].stage, stage.replace(/-/g, " "));
  assert.equal(c.lines.conc1.typed, 123, "The typed value is kept for reference");
  // The award replaces the typed value, also while it is only pending (committed waits for execution).
  assert.equal(withCommitments(budget, c).lines.find(l => l.id === "conc1").committed, executed ? 450000.5 : 0);
}

// Cancelled awards count for nothing; a re-award counts once.
const reAward = run([award("old", "conc", 400000, "signature-pending", { cancelled: { by: "Marcel", at: "2026-10-20T00:00:00.000Z", reason: "Bonding" } }), award("new", "conc", 410000, "executed")]);
assert.deepEqual(reAward.lines.conc1.sources.map(s => [s.awardId, s.amount, s.counts]), [["new", 410000, "committed"]]);
assert.deepEqual([reAward.committed, reAward.pending, reAward.unplaced], [410000, 0, []]);
assert.deepEqual(run([award("gone", "conc", 1, "executed", { cancelled: { by: "Marcel", at: "2026-10-20T00:00:00.000Z", reason: "Withdrawn" } })]), { lines: {}, unplaced: [], committed: 0, pending: 0 });

// The budget line the award names takes the whole amount, whatever the trade's own lines are.
const linked = run([award("a2", "conc", 88000, "executed", { budgetLineId: "spare" })]);
assert.deepEqual([linked.lines.spare.committed, linked.lines.spare.typed, linked.lines.conc1], [88000, 7000, undefined]);
const lost = run([award("a3", "conc", 88000, "executed", { budgetLineId: "deleted-line" })]);
assert.deepEqual(lost.unplaced.map(u => [u.awardId, u.reason]), [["a3", "Its budget line no longer exists: link the award to another line."]]);
assert.equal(lost.committed, 0);

// Two lines for one trade: not guessed without the estimator's split.
const unsplit = run([award("d1", "dry", 100000.01, "executed")]);
assert.deepEqual([unsplit.lines.dryA.splitNeeded, unsplit.lines.dryB.splitNeeded, unsplit.lines.dryA.sources, unsplit.committed], [["Drywall"], ["Drywall"], [], 0]);
assert.deepEqual(unsplit.unplaced.map(u => u.reason), ["Split Drywall between its 2 budget lines on the Budget page."]);
assert.equal(withCommitments(budget, unsplit).lines.find(l => l.id === "dryA").committed, 4000, "Split needed: the typed value stays until the split is entered");

// With the split, exact to the cent.
const split = setLowestSubSplit(budget, procurement.packages[1], { dryA: 200000, dryB: 100000 }, 300000);
const splitDone = run([award("d1", "dry", 100000.01, "executed"), award("d2", "dry", 0, "exhibit-draft", { cancelled: { by: "Marcel", at: "2026-10-20T00:00:00.000Z", reason: "Duplicate" } })], split);
assert.deepEqual([splitDone.lines.dryA.committed, splitDone.lines.dryB.committed], [66666.67, 33333.34], "2 : 1, the last cent to the larger remainder");
assert.equal(cents(splitDone.lines.dryA.committed) + cents(splitDone.lines.dryB.committed), 10000001, "The split adds back to the subcontract sum");
assert.deepEqual([splitDone.committed, splitDone.unplaced], [100000.01, []]);
assert.deepEqual(splitDone.lines.dryA.sources.map(s => [s.company, s.amount]), [["d1 Co", 66666.67]], "Each line's source shows its share");
const pendingSplit = run([award("d3", "dry", 3000, "countersigned")], split);
assert.deepEqual([pendingSplit.lines.dryA.pending, pendingSplit.lines.dryB.pending, pendingSplit.pending, pendingSplit.committed], [2000, 1000, 3000, 0]);

// No line, several equally close lines, or no package: listed with the reason, never placed.
const nowhere = run([award("m1", "mas", 50000, "executed"), award("e1", "elec", 60000, "exhibit-agreed"), award("x1", "removed-package", 70000, "executed")]);
assert.deepEqual(nowhere.unplaced.map(u => [u.awardId, u.counts, u.reason]), [
  ["m1", "committed", "Several budget lines could be Masonry's (04 24 00, 04 26 00): link one on the Budget page."],
  ["e1", "pending", "No budget line matches Electrical: add or link one on the Budget page."],
  ["x1", "committed", "Its trade package no longer exists."],
]);
assert.deepEqual([nowhere.lines, nowhere.committed, nowhere.pending], [{}, 0, 0]);

// Totals as every page reads them: placed executed awards, plus typed values on lines no award reaches.
const mixed = run([award("a1", "conc", 450000, "executed"), award("a4", "conc", 1, "exhibit-draft", { budgetLineId: "spare" }), award("d1", "dry", 100000, "executed")], split);
const plan = withCommitments(split, mixed);
assert.equal(plan.lines.find(l => l.id === "gc").committed, 25000, "Indirect costs keep their typed value");
assert.equal(plan.lines.find(l => l.id === "owner").committed, 900, "By-owner lines are untouched (and out of the totals)");
assert.equal(plan.lines.find(l => l.id === "spare").committed, 0, "A pending award replaces the typed value with nothing committed yet");
assert.equal(budgetTotals(plan).committed, 450000 + 100000 + 25000, "Concrete + Drywall split + general conditions");
assert.deepEqual([mixed.committed, mixed.pending], [550000, 1]);
assert.equal(split.lines.find(l => l.id === "conc1").committed, 123, "Nothing is written into the saved budget");

// ── Ask Structor reads the same numbers ──
const tool = async (name, args = {}) => JSON.parse((await D.runAssistantTool({ id: "c", name, arguments: args }, { projectId: "jelleff", today: "2026-10-22" })).content);
const b = await tool("budget");
assert(b.lines.some(l => l.includes("committed 1742000") && l.includes("committed by District Concrete 1742000 (executed)")), "Each line says where its committed value comes from");
assert.deepEqual([b.totals.committed, b.totals.pendingSignature, b.awardsNotInBudget], [budgetTotals(jelleffPlan).committed, 0, []]);
const o = await tool("project_overview");
assert.equal(o.budget.committed, budgetTotals(jelleffPlan).committed);

console.log("Commitments checked: the Jelleff sample, every award stage (executed commits, the rest pending), cancelled and re-awarded, a named budget line, two-line trades with and without the split (exact to the cent), unplaced awards and why, typed values kept on other lines, totals, and Ask Structor's budget.");

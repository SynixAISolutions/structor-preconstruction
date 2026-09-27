import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const {
  BudgetRuleError, addAllowance, addBudgetLine, applyLevelingValue, approveBudgetLine, budgetTotals, editAllowance, editBudgetLine,
  levelingCandidates, linkAllowance, parseAmount, removeAllowance, removeBudgetLine, reopenBudgetLine, setAllowanceStatus,
  totalsByCostCenter, totalsByDivision,
} = await import("../lib/budget.ts");
const { sampleBudget } = await import("../lib/data/budget.ts");
const { initialAllowances, initialBidders, initialCosts } = await import("../lib/data/commercial.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { approveScope, bidForm, inviteBidder, publishPackage } = await import("../lib/procurement.ts");
const { openSubmission, setResponse, submitBid, updateDraft } = await import("../lib/submissions.ts");
const { buildLevelingImport } = await import("../lib/leveling-import.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-27T12:00:00.000Z";
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof BudgetRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const budget = freeze(structuredClone(sampleBudget));
const line = (s, id) => s.lines.find(l => l.id === id);
const valid = { costCenter: "Modernization", classification: "direct", csiCode: "09 29 00", description: "Drywall", owner: "Safi", budget: 410000 };

// The sample keeps every value of the earlier previews; new projects start empty.
for (const cost of initialCosts) {
  const l = line(budget, cost.id);
  assert.deepEqual([l.csiCode, l.description, l.costCenter, l.budget, l.forecast, l.status, l.classification], [cost.code, cost.trade, cost.center, cost.budget, cost.forecast, cost.status === "Approved" ? "approved" : "draft", "direct"]);
}
for (const old of initialAllowances) {
  const a = budget.allowances.find(x => x.id === old.id);
  assert.deepEqual([a.name, a.amount, a.costCenter, a.source, a.owner, a.status], [old.name, old.amount, old.center, old.source, old.owner, old.status === "Included" ? "included" : "review"]);
}
assert.deepEqual(startingDraft("p2", "budget-state", sampleBudget), { lines: [], allowances: [] });

// Totals (hand-worked): direct 12,420,000 + indirect 1,305,000; forecast 12,164,000 + 1,305,000.
const t = budgetTotals(budget);
assert.deepEqual([t.budget, t.direct, t.indirect, t.forecast, t.committed, t.remaining, t.variance, t.unforecastLines], [13725000, 12420000, 1305000, 13469000, 0, 13725000, 256000, 0]);
// Allowances: a2 included and unlinked is ADDED; a4 included but carried by Exterior improvements is NOT added again.
assert.deepEqual([t.allowancesAdded, t.allowancesInLines, t.allowancesPending, t.allowancesExcluded, t.totalBudget, t.totalForecast], [175000, 45000, 585000, 0, 13900000, 13644000]);
const centers = Object.fromEntries(totalsByCostCenter(budget).map(c => [c.costCenter, c.totals]));
assert.deepEqual(Object.keys(centers), ["Modernization", "New addition", "Site work", "Project-wide"]);
assert.deepEqual([centers.Modernization.budget, centers.Modernization.allowancesAdded, centers["Site work"].budget, centers["Site work"].allowancesInLines, centers["Site work"].allowancesPending, centers["Project-wide"].indirect], [6420000, 175000, 1920000, 45000, 500000, 1305000]);
assert.equal(centers["Site work"].variance, 1000, "Site work: 1,920,000 budget vs 1,919,000 forecast");
assert.equal(budgetTotals(budget, "New addition").variance, 115000, "4,080,000 budget vs 3,965,000 forecast");
const divisions = totalsByDivision(budget);
assert.deepEqual(divisions.map(d => d.division), ["02", "03", "05", "07", "23", "26", "31", "32", "33"], "Direct lines only, ascending");
assert.deepEqual(divisions.find(d => d.division === "03"), { division: "03", name: "Concrete", budget: 1760000, forecast: 1707000, committed: 0, variance: 53000, lines: 2 });

// Money is summed exactly; a missing forecast counts at budget and is reported.
let s = addBudgetLine({ lines: [], allowances: [] }, { ...valid, budget: 0.1 }, "Safi", at);
s = addBudgetLine(s, { ...valid, budget: 0.2, csiCode: null, forecast: null }, "Safi", at);
assert.deepEqual([budgetTotals(s).budget, budgetTotals(s).forecast, budgetTotals(s).unforecastLines], [0.3, 0.3, 2]);
assert.deepEqual(totalsByDivision(s).map(d => d.division), ["09", ""], "Lines with no CSI code are grouped last");

// Field-level validation.
assert.throws(() => addBudgetLine(budget, { classification: "neither", budget: -1, csiCode: "99" }, "Safi", at),
  e => e instanceof BudgetRuleError && ["description", "costCenter", "classification", "csiCode", "budget"].every(k => e.errors[k]));
fails(() => addBudgetLine(budget, { ...valid, csiCode: "3" }, "Safi", at), "csiCode", /CSI division/);
fails(() => addBudgetLine(budget, { ...valid, budget: 1.005 }, "Safi", at), "budget", /two decimal/);
fails(() => addBudgetLine(budget, { ...valid, budget: Number.NaN }, "Safi", at), "budget", /number/);
fails(() => addBudgetLine(budget, { ...valid, forecast: -5 }, "Safi", at), "forecast", /zero or more/);
fails(() => addBudgetLine(budget, { ...valid, committed: "x" }, "Safi", at), "committed", /number/);
const added = addBudgetLine(budget, { ...valid, description: "  Drywall ", csiCode: " 09 29 00 " }, "Safi", at).lines.at(-1);
assert.deepEqual([added.description, added.csiCode, added.status, added.committed, added.forecast, added.source.kind], ["Drywall", "09 29 00", "draft", 0, null, "manual"]);

// Editing: budget-defining changes reopen; forecast, committed and owner keep the approval.
assert.equal(editBudgetLine(budget, "c2", { owner: "Vijay" }, "Safi", at), budget, "Unchanged edit is a no-op");
assert.equal(line(editBudgetLine(budget, "c2", { forecast: 770000 }, "Safi", at), "c2").status, "approved");
assert.equal(line(editBudgetLine(budget, "c2", { committed: 700000, owner: "Safi" }, "Safi", at), "c2").status, "approved");
const rebudgeted = line(editBudgetLine(budget, "c2", { budget: 800000 }, "Safi", at), "c2");
assert.deepEqual([rebudgeted.status, rebudgeted.approval], ["draft", null]);
assert.equal(line(editBudgetLine(budget, "c2", { description: "Cast-in-place concrete" }, "Safi", at), "c2").status, "draft");
assert.deepEqual([line(approveBudgetLine(budget, "c1", "Marcel Khoury", at), "c1").approval, line(reopenBudgetLine(budget, "c2", at), "c2").status], [{ by: "Marcel Khoury", at }, "draft"]);

// Allowances: validation, links in the same cost center that fit the line, no double counting.
assert.throws(() => addAllowance(budget, { name: " ", amount: 0, costCenter: "" }, at), e => e instanceof BudgetRuleError && Boolean(e.errors.name && e.errors.amount && e.errors.costCenter));
fails(() => linkAllowance(budget, "a1", "c1", at), "budgetLineId", /in Modernization; link a line in the same cost center/);
fails(() => linkAllowance(budget, "a1", "c11", at), "budgetLineId", /budget of 460,000 but carries 500,000/);
assert.equal(budgetTotals(linkAllowance(budget, "a1", "c9", at)).allowancesPending, 585000, "A linked allowance still under review stays pending");
fails(() => editBudgetLine(budget, "c10", { budget: 40000 }, "Safi", at), "budgetLineId", /carries 45,000/);
fails(() => removeBudgetLine(budget, "c10"), "line", /Landscape establishment.*Unlink it first/);
const unlinked = linkAllowance(budget, "a4", null, at);
assert.deepEqual([budgetTotals(unlinked).allowancesAdded, budgetTotals(unlinked).allowancesInLines], [220000, 0], "Unlinked, it is added on top instead");
assert.equal(removeBudgetLine(unlinked, "c10").lines.length, budget.lines.length - 1);
const excluded = setAllowanceStatus(budget, "a2", "excluded", at);
assert.deepEqual([budgetTotals(excluded).allowancesAdded, budgetTotals(excluded).allowancesExcluded], [0, 175000]);
assert.equal(budgetTotals(setAllowanceStatus(budget, "a4", "excluded", at)).allowancesInLines, 0);
fails(() => editAllowance(budget, "a4", { amount: 900000 }, at), "budgetLineId", /carries 900,000/);
assert.equal(removeAllowance(budget, "a1").allowances.length, 3);
fails(() => setAllowanceStatus(budget, "a1", "maybe", at), "status", /review, included, or excluded/);

// Leveling roll-up: submitted portal bids → the leveling engine → candidates.
let proc = structuredClone(sampleProcurement);
proc = inviteBidder(proc, "demolition", "b6", "Safi", at);
proc = publishPackage(bidForm(proc, "demolition").reduce((acc, i) => approveScope(acc, i.id, "Safi", at), proc), "demolition", "Safi", at);
const form = bidForm(proc, "demolition");
const inv = (b) => proc.invitations.find(i => i.packageId === "demolition" && i.bidderId === b).id;
let subs = ["b1", "b6"].reduce((acc, b) => openSubmission(acc, proc, { projectId: "jelleff", invitationId: inv(b) }, at), []);
const sid = (b) => subs.find(x => x.bidderId === b).id;
subs = form.reduce((acc, i) => setResponse(acc, sid("b1"), i.id, "Y", "", at), subs);
subs = form.reduce((acc, i, n) => setResponse(acc, sid("b6"), i.id, n === 1 ? "N" : "Y", "", at), subs);
subs = updateDraft(updateDraft(subs, sid("b1"), { baseBid: 498000 }, at), sid("b6"), { baseBid: 450000 }, at);
subs = ["b1", "b6"].reduce((acc, b) => submitBid(acc, proc, sid(b), { name: "Estimator", email: "bids@example.com" }, at), subs);
const imported = buildLevelingImport({ projectId: "jelleff", projectName: "Jelleff", packageId: "demolition", procurement: proc, submissions: subs, directory: initialBidders });
const candidates = freeze(levelingCandidates({ packageId: "demolition", items: imported.items, bidders: imported.bidders, provenance: imported.provenance }));
const [capital, green] = candidates;
assert.deepEqual([capital.bidderName, capital.packageId, capital.bidderId, capital.revisionNumber, capital.formVersion, capital.stale], ["Capital Demolition", "demolition", "b1", 1, 1, false]);
assert.deepEqual([capital.eligible, capital.baseBid, capital.provisionalTotal, capital.reviewedTotal], [true, 498000, 507960, 507960]);
assert.deepEqual([green.eligible, green.baseBid, green.provisionalTotal, green.reviewedTotal], [false, 450000, 459000, null]);
assert(green.eligibilityReasons.includes("open-scope-review"));

// Applying a value: the caller must choose; nothing else on the line changes.
const applied = line(applyLevelingValue(budget, "c2", capital, "reviewed", "Vijay", at), "c2");
assert.deepEqual([applied.forecast, applied.forecastSource.basis, applied.forecastSource.value, applied.forecastSource.submissionId, applied.forecastSource.revisionNumber, applied.status, applied.budget, applied.committed],
  [507960, "reviewed", 507960, sid("b1"), 1, "approved", 780000, 0], "Approval, budget and commitment are untouched");
assert.equal(line(applyLevelingValue(budget, "c1", green, "base", "Safi", at), "c1").forecast, 450000);
assert.equal(line(applyLevelingValue(budget, "c1", green, "provisional", "Safi", at), "c1").forecast, 459000);
fails(() => applyLevelingValue(budget, "c1", green, "reviewed", "Safi", at), "forecast", /no reviewed total yet \(open-scope-review\)/);
fails(() => applyLevelingValue(budget, "c1", capital, "lowest", "Safi", at), "forecast", /Choose base bid/);
fails(() => applyLevelingValue(budget, "i1", capital, "base", "Safi", at), "forecast", /direct construction lines only/);
fails(() => applyLevelingValue(budget, "c1", { ...capital, stale: true }, "base", "Safi", at), "forecast", /older bid form/);
const handEdited = line(editBudgetLine(applyLevelingValue(budget, "c2", capital, "base", "Vijay", at), "c2", { forecast: 520000 }, "Vijay", at), "c2");
assert.deepEqual([handEdited.forecast, handEdited.forecastSource], [520000, null], "A hand-typed forecast drops the leveling source");
const workbook = levelingCandidates({ packageId: null, items: imported.items, bidders: [{ ...imported.bidders[0], id: "celtic", name: "Celtic Demo" }] })[0];
assert.deepEqual([workbook.packageId, workbook.submissionId, workbook.revisionNumber, workbook.stale], [null, null, null, false], "Workbook bidders have no portal provenance");

// Amount parsing for form inputs.
assert.deepEqual(["$1,250,000.50", " 420 ", "1.234", "-5", "abc", ""].map(parseAmount), [1250000.5, 420, null, null, null, null]);

console.log(`Budget checked: ${budget.lines.length} lines, ${budget.allowances.length} allowances; totals, cost centers, divisions, validation, allowance links, leveling roll-up through the real engine.`);

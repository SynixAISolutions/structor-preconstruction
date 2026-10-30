import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const V = await import("../lib/value-engineering.ts");
const { withAcceptedVe } = await import("../lib/ve-budget.ts");
const { costPlan } = await import("../lib/forecasts.ts");
const { budgetTotals } = await import("../lib/budget.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-28T00:00:00.000Z";

// The VE log (Marcel, 24 Oct): each item has an owner deadline and who has the ball in court.
let ve = V.addVeIdea(V.EMPTY_VE, { description: "Change terrazzo at lower level dining to resilient flooring", packageId: "floor", costImpact: -33000, ownerDeadline: "2026-11-15", ballInCourt: "owner" }, "Marcel", at);
const terrazzo = ve.ideas[0];
assert.deepEqual([terrazzo.number, terrazzo.ownerDeadline, terrazzo.ballInCourt], ["VE-01", "2026-11-15", "owner"]);
ve = V.addVeIdea(ve, { description: "Drop the second skylight", costImpact: -12000 }, "Marcel", at);
assert.deepEqual([ve.ideas[1].ownerDeadline, ve.ideas[1].ballInCourt], [null, "contractor"], "No deadline given; the ball starts with us");
assert.throws(() => V.addVeIdea(ve, { description: "x", costImpact: -1, ownerDeadline: "Nov 15" }, "Marcel", at), e => e.errors.ownerDeadline === "Enter the owner's deadline as a date.");
assert.throws(() => V.addVeIdea(ve, { description: "x", costImpact: -1, ballInCourt: "nobody" }, "Marcel", at), e => !!e.errors.ballInCourt);
ve = V.editVeIdea(ve, terrazzo.id, { ballInCourt: "architect" }, at);
assert.equal(ve.ideas[0].ballInCourt, "architect", "The ball moves as the item is worked");
assert.equal(ve.ideas[0].ownerDeadline, "2026-11-15", "An edit keeps the deadline");
assert.equal(V.veOverdue(ve.ideas[0], "2026-11-16"), true);
assert.equal(V.veOverdue(ve.ideas[0], "2026-11-15"), false, "Due today is not past due");
assert.equal(V.veOverdue(ve.ideas[1], "2030-01-01"), false, "No deadline, never past due");

// Accepting an item lowers its trade in the budget and marks it "VE applied"; the typed budget stays as it was.
const line = (id, csiCode, budget, extra = {}) => ({ id, costCenter: "Building", classification: "direct", csiCode, description: id, owner: "", budget, forecast: null, committed: 0, byOwner: false, status: "approved", approval: null, source: "manual", forecastSource: null, updatedAt: at, ...extra });
const pkg = (id, name, division, code) => ({ id, name, division, code, owner: "", due: "2026-11-01", published: null });
const procurement = freeze({ ...structuredClone(sampleProcurement), packages: [pkg("floor", "Flooring", "09", "09 65 00"), pkg("roof", "Roofing", "07", "07 50 00"), pkg("tile", "Tile", "09", "09 30 00")] });
const budget = freeze({ costCenters: [], allowances: [], lines: [
  line("floorA", "09 65 00", 200000.01, { packageId: "floor", costCenter: "Modernization" }),
  line("floorB", "09 65 00", 100000, { packageId: "floor", costCenter: "Addition" }),
  line("roof1", "07 50 00", 400000),
  line("gc", null, 80000, { classification: "indirect" }),
] });
const accepted = freeze(V.decideVeIdea(ve, terrazzo.id, "accepted", { acceptedImpact: -33000 }, "Marcel", at));
const out = withAcceptedVe(budget, accepted, procurement);
const by = id => out.budget.lines.find(l => l.id === id);
assert.deepEqual(by("floorA").veApplied, [{ ideaId: terrazzo.id, number: "VE-01", amount: -22000 }], "Shared by budget: two thirds on the larger cost center");
assert.deepEqual(by("floorB").veApplied.map(v => v.amount), [-11000]);
assert.equal(by("floorA").budget + by("floorB").budget, 300000.01 - 33000, "The shares add up to the accepted saving exactly");
assert.equal(by("roof1"), budget.lines[2], "Other trades are untouched");
assert.equal(budget.lines[0].budget, 200000.01, "The typed budget is never changed");
assert.deepEqual(out.unplaced, [], "Idea VE-02 is undecided, so nothing to place");

// Reopened, rejected or unlinked: nothing comes off; an accepted item that can't reach the budget says why.
assert.equal(withAcceptedVe(budget, V.reopenVeIdea(accepted, terrazzo.id, at), procurement).budget, budget, "Reopening brings the number back");
const skylight = V.decideVeIdea(accepted, ve.ideas[1].id, "accepted", { acceptedImpact: -12000 }, "Marcel", at);
assert.deepEqual(withAcceptedVe(budget, skylight, procurement).unplaced.map(u => [u.number, u.reason]), [["VE-02", "Link it to a trade package to apply it to the budget."]]);
let tileVe = V.addVeIdea(V.EMPTY_VE, { description: "Smaller tile", packageId: "tile", costImpact: -5000 }, "Marcel", at);
tileVe = V.decideVeIdea(tileVe, tileVe.ideas[0].id, "accepted", { acceptedImpact: -5000 }, "Marcel", at);
assert.deepEqual(withAcceptedVe(budget, tileVe, procurement).unplaced.map(u => u.reason), ["Tile has no budget line yet."]);

// Every page reads it through the cost plan: the Budget summary's totals come down by the saving.
const plan = costPlan(budget, { awards: { awards: [], notifications: [] }, procurement, submissions: [], candidates: [], directory: [], estimates: [], ve: accepted });
assert.equal(budgetTotals(plan.budget).direct, 700000.01 - 33000);
assert.equal(budgetTotals(budget).direct, 700000.01, "The typed budget's own totals are unchanged");
assert.deepEqual(plan.veUnplaced, []);

console.log("VE log checked: owner deadline and ball in court on each item, past-due dates, accepted savings taken off their trade's budget lines to the cent, reopened items restored, unplaceable items explained, cost plan totals lowered.");

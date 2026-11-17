// Estimator workload (Marcel's features list, item 33): who is over or under worked, from teams, trade owners and dates.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const W = await import("../lib/workload.ts");
const { GLOBAL_DRAFT_KEYS } = await import("../lib/project-scope.ts");

const today = "2026-11-17";
const project = (id, name, due, team = [], status = "Bidding") => ({ id, name, due, status, team });
const projects = [
  project("p1", "Project 1", "2026-11-25", [{ name: "Sadie Cole", role: "Estimator" }, { name: "Marcel Khoury", role: "Project executive" }]),
  project("p2", "Project 2", "2026-12-10", [{ name: "sadie  cole", role: "Precon manager" }]),
  project("p3", "Project 3", "2027-03-01", [{ name: "Victor Lane", role: "Estimator" }]),
];
const trade = (id, name, owner, due) => ({ id, name, owner, due });
const packages = {
  p1: [trade("a", "Drywall", "Sadie Cole", "2026-11-20"), trade("b", "Paint", "Sadie Cole", "2026-11-24"), trade("c", "Concrete", "Sadie Cole", "2026-11-18"), trade("d", "Roofing", "", "2026-11-20"), trade("e", "Steel", "Nina Park", "2026-12-30")],
  p2: [trade("f", "Doors", "Sadie Cole", "2026-11-30"), trade("g", "Glazing", "Sadie Cole", "2026-11-19")],
  p3: [],
};
const limits = { tradesDueIn14: 3, projectsDueIn30: 1 };
const people = W.workload({ projects, packagesOf: id => packages[id] ?? [], awarded: new Set(["p1:c"]), today, limits });
const by = name => people.find(p => p.name === name);

assert.deepEqual(people.map(p => [p.name, p.status]), [["Sadie Cole", "over"], ["Marcel Khoury", "within"], ["Nina Park", "within"], ["Victor Lane", "room"]], "Over capacity first; the same person however their name is spaced or cased");
const sadie = by("Sadie Cole");
assert.deepEqual(sadie.roles, ["Estimator", "Precon manager"]);
assert.deepEqual(sadie.trades.map(t => [t.trade, t.due]), [["Glazing", "2026-11-19"], ["Drywall", "2026-11-20"], ["Paint", "2026-11-24"], ["Doors", "2026-11-30"]], "Soonest first; the awarded Concrete has left the count");
assert.deepEqual([sadie.tradesDueIn14, sadie.projectsDueIn30], [4, 2], "All four open trades fall within 14 days (Doors on the 13th day); both projects bid within 30");
assert.deepEqual(sadie.reasons, ["4 trades due in the next 14 days (limit 3)", "2 project bids due in the next 30 days (limit 1)"], "Says which limits are passed");
assert.equal(by("Marcel Khoury").trades.length, 0, "A team member without trades still counts the project");
assert.deepEqual([by("Marcel Khoury").projectsDueIn30, by("Marcel Khoury").reasons], [1, ["0 of 3 trades and 1 of 1 projects at most"]]);
assert.deepEqual([by("Nina Park").projects.map(p => p.id), by("Nina Park").tradesDueIn14, by("Nina Park").projectsDueIn30], [["p1"], 0, 1], "A trade owner is on that trade's project, whose bid is due within 30 days");
assert.deepEqual(by("Victor Lane").reasons, ["Nothing due in the next 30 days"]);
assert.equal(people.some(p => p.name === ""), false, "A trade without an owner belongs to no one");
assert.equal(W.workload({ projects, packagesOf: id => packages[id] ?? [], today, limits: { tradesDueIn14: 10, projectsDueIn30: 5 } }).find(p => p.name === "Sadie Cole").status, "within", "The team's limits decide");
assert.equal(W.workload({ projects, packagesOf: () => [], today }).find(p => p.name === "Victor Lane").status, "room");
assert.deepEqual(W.normalizeLimits({ tradesDueIn14: 4, projectsDueIn30: -1 }), { tradesDueIn14: 4, projectsDueIn30: W.DEFAULT_LIMITS.projectsDueIn30 }, "A bad saved limit falls back to its default");
assert(GLOBAL_DRAFT_KEYS.has("workload-limits"), "The limits belong to the organization, not one project");

console.log("Workload checked: people from teams and trade owners, awarded trades dropped, 14 and 30 day windows, the team's limits, statuses and reasons.");

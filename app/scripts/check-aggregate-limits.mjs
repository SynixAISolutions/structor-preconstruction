import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const L = await import("../lib/aggregate-limits.ts");
const { sampleAwards } = await import("../lib/data/sample-award.ts");

// Subcontractor aggregate limits (Marcel, 24 Oct): limits typed by the contracts team against open contract value.
const at = "2026-10-28T00:00:00.000Z";
const template = sampleAwards.awards[0];
const award = (id, bidderId, packageId, amount, extra = {}) => ({ ...structuredClone(template), id, bidderId, packageId, amount, cancelled: null, ...extra });
const directory = [{ id: "dry-co", company: "Capitol Drywall" }, { id: "mep-co", company: "District Mechanical" }, { id: "tile-co", company: "Tilework DC" }];
const projects = [
  { id: "p1", name: "Project 1", packages: [{ id: "drywall", name: "Drywall" }, { id: "mech", name: "Mechanical" }], awards: { notifications: [], awards: [award("a1", "dry-co", "drywall", 1200000), award("a2", "mep-co", "mech", 900000), award("a0", "tile-co", "drywall", 50000, { cancelled: { by: "Marcel", at, reason: "Withdrawn" } })] } },
  { id: "p2", name: "Project 2", packages: [{ id: "drywall", name: "Drywall" }], awards: { notifications: [], awards: [award("a3", "dry-co", "drywall", 800000.5)] } },
];

// Limits are typed by hand; the aggregate covers every project, so it can't be below the single-project limit.
let state = L.setSubLimit(L.NO_LIMITS, "dry-co", { singleProject: 1000000, aggregate: 1800000, note: "Bonded" }, "Sadie", at);
assert.deepEqual(state.limits.map(l => [l.companyId, l.singleProject, l.aggregate, l.note, l.updatedBy]), [["dry-co", 1000000, 1800000, "Bonded", "Sadie"]]);
assert.throws(() => L.setSubLimit(state, "mep-co", { singleProject: 2000000, aggregate: 1000000 }, "Sadie", at), e => !!e.errors.aggregate);
assert.throws(() => L.setSubLimit(state, "mep-co", { singleProject: -5, aggregate: null }, "Sadie", at), e => !!e.errors.singleProject);
assert.throws(() => L.setSubLimit(state, "", { singleProject: null, aggregate: null }, "Sadie", at), e => !!e.errors.company);
state = L.setSubLimit(state, "mep-co", { singleProject: null, aggregate: 5000000 }, "Sadie", at);
assert.equal(L.setSubLimit(state, "dry-co", { singleProject: 1000000, aggregate: 2000000 }, "Sadie", at).limits.filter(l => l.companyId === "dry-co").length, 1, "Saving again replaces the company's limits");

// Open value: every project's awarded contracts, less what's complete; cancelled awards don't count.
let rows = L.exposures({ directory, projects, state });
const dry = rows.find(r => r.companyId === "dry-co");
assert.equal(dry.open, 2000000.5, "1,200,000 on Project 1 and 800,000.50 on Project 2, nothing complete yet");
assert.deepEqual([dry.largest.projectName, dry.largest.open], ["Project 1", 1200000]);
assert.deepEqual([dry.overSingle, dry.overAggregate, dry.headroom], [true, true, -200000.5], "Over both: 1.2M on one project, 2.0M in all");
assert.equal(rows[0].companyId, "dry-co", "Anyone over a limit comes first");
assert.equal(rows.find(r => r.companyId === "tile-co"), undefined, "A cancelled award and no limits: not listed");
assert.deepEqual(L.exposures({ directory, projects: [], state }).map(r => [r.company, r.open, r.overAggregate]), [["Capitol Drywall", 0, false], ["District Mechanical", 0, false]], "A company with limits is listed even with nothing open, by name");

// Percent complete (typed until Textura is connected) brings the open value down, to the cent.
state = L.setPercentComplete(state, "a1", 40, "Sadie", at);
assert.throws(() => L.setPercentComplete(state, "a1", 140, "Sadie", at), e => !!e.errors.percent);
assert.equal(state.progress[0].source, "manual");
rows = L.exposures({ directory, projects, state });
const after = rows.find(r => r.companyId === "dry-co");
assert.equal(after.contracts.find(c => c.awardId === "a1").open, 720000, "60% of 1,200,000 still to bill");
assert.equal(after.open, 1520000.5);
assert.deepEqual([after.overSingle, after.overAggregate, after.headroom], [false, false, 279999.5], "Back within both limits");
assert.equal(after.contracts.find(c => c.awardId === "a3").percent, null, "Not recorded stays unknown, counted as 0%");

console.log("Aggregate limits checked: limits typed and validated, open value across projects less percent complete, cancelled awards left out, single-project and aggregate flags, headroom, over-limit first.");

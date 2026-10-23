import assert from "node:assert/strict";
import { loadProjects, normalizeProject, parseProjectForm, sampleProjectRecords, squareFeetLabel } from "../lib/projects.ts";
import { dateLabel, displayDate } from "../lib/format.ts";
import { initialDrawings, initialSpecSections, initialSpecs } from "../lib/data/preconstruction.ts";
import { CSI_DIVISIONS, csiDivision } from "../lib/csi.ts";
import { initialMilestones } from "../lib/data/commercial.ts";
import { SAMPLE_PROJECT_ID, draftStorageKey, getActiveProjectId, projectScopedKey, startingDraft } from "../lib/project-scope.ts";

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const item of [].concat(v)) f.append(k, item);
  return f;
};
const valid = { name: "Jelleff Recreation Center", location: "Washington, DC", type: "Community & recreation", value: "$18,400,000", workType: "renovation", squareFeet: "42,500", taxStatus: "non-taxable", estimateStage: "concept" };

// Samples satisfy the record invariants.
for (const p of sampleProjectRecords) {
  assert(p.squareFeet > 0 && squareFeetLabel(p.squareFeet).endsWith(" SF"), `${p.id}: sample must record its area`);
  assert(!("size" in p), `${p.id}: the legacy size string is gone; area lives in squareFeet`);
  assert.equal(p.workType, null, `${p.id}: sample work type is not known and must stay "not recorded"`);
}

// Jelleff carries its real facts (Marcel's DD Budget and precon write-up).
const jelleff = sampleProjectRecords.find(p => p.id === "jelleff");
assert.deepEqual([jelleff.squareFeet, jelleff.architect, jelleff.value, jelleff.due, jelleff.rfi, jelleff.start, jelleff.certifications, jelleff.taxStatus], [26500, "DLR Group", 33328991, "2026-02-02", "2026-01-20", "2026-06-01", ["First Source"], null]);
// A browser that saved the old placeholder Jelleff gets the real one; edited records and own projects are untouched.
const placeholder = { id: "jelleff", name: "Jelleff Recreation Center", location: "Washington, DC", type: "Community & recreation", status: "Preconstruction", value: 18400000, size: "42,500 SF", architect: "Project design team", description: "", due: "2026-10-02", rfi: "", start: "", finish: "" };
const stored = (list) => { globalThis.localStorage = { getItem: () => JSON.stringify(list), setItem() {} }; const out = loadProjects(); delete globalThis.localStorage; return out; };
const upgraded = stored([placeholder, { id: "mine", name: "Mine", architect: "Project design team" }]);
assert.deepEqual([upgraded[0].squareFeet, upgraded[0].architect, upgraded[1].name, upgraded[1].architect], [26500, "DLR Group", "Mine", "Project design team"]);
assert.deepEqual([stored([{ ...placeholder, architect: "Our architect" }])[0].squareFeet, stored([{ ...placeholder, architect: "Our architect" }])[0].architect], [42500, "Our architect"], "An edited Jelleff record is kept as saved");

// A record saved before the 20 Sep fields is upgraded, not rejected.
const legacy = normalizeProject({ id: "old", name: "Old job", location: "DC", type: "Education", status: "Bidding", value: 5, size: "42,500 SF", architect: "A", description: "", due: "2026-10-02", rfi: "", start: "", finish: "" });
assert.equal(legacy.squareFeet, 42500);
assert.deepEqual([legacy.workType, legacy.taxStatus, legacy.certifications, legacy.team, legacy.status], [null, null, [], [], "Bidding"]);
assert.equal(normalizeProject({ id: "x", name: "x", value: -3 }).value, 0, "Negative stored value is not trusted");

// Valid single-type project: whole area belongs to that work type; money parses with $ and commas.
const single = parseProjectForm(form({ ...valid, certifications: ["CBE", "First Source", "CBE", " "], teamName: ["Marcel Khoury", "", "Rawad"], teamRole: ["Project manager", "Ignored", "Estimator"] }));
assert.deepEqual(single.errors, {});
assert.equal(single.project.value, 18400000);
assert.deepEqual([single.project.squareFeet, single.project.renovationSquareFeet, single.project.additionSquareFeet], [42500, 42500, 0]);
assert.deepEqual(single.project.certifications, ["CBE", "First Source"], "Certifications are trimmed and de-duplicated");
assert.deepEqual(single.project.team, [{ name: "Marcel Khoury", role: "Project manager" }, { name: "Rawad", role: "Estimator" }], "Team rows keep name/role pairing and drop blank names");
assert.equal(squareFeetLabel(single.project.squareFeet), "42,500 SF");
assert(!("size" in legacy), "Migration drops the legacy size string");

// New construction: a ground-up building has area but no renovation/addition split.
const ground = parseProjectForm(form({ ...valid, workType: "new" })).project;
assert.deepEqual([ground.workType, ground.squareFeet, ground.renovationSquareFeet, ground.additionSquareFeet], ["new", 42500, 0, 0]);

// "Both": total is the sum of the two areas; the separate total field is ignored.
const both = parseProjectForm(form({ ...valid, workType: "both", squareFeet: "1", renovationSquareFeet: "30000", additionSquareFeet: "12,500" }));
assert.deepEqual([both.project.squareFeet, both.project.renovationSquareFeet, both.project.additionSquareFeet], [42500, 30000, 12500]);
assert.deepEqual(Object.keys(parseProjectForm(form({ ...valid, workType: "both" })).errors).sort(), ["additionSquareFeet", "renovationSquareFeet"]);

// Required fields, each with its own message, and no project returned.
const empty = parseProjectForm(form({}));
assert.equal(empty.project, undefined);
assert.deepEqual(Object.keys(empty.errors).sort(), ["estimateStage", "location", "name", "squareFeet", "taxStatus", "type", "workType"]);
assert.equal(parseProjectForm(form({ ...valid, value: "" })).project.value, 0, "Blank value is allowed");
assert(parseProjectForm(form({ ...valid, value: "lots" })).errors.value);
assert(parseProjectForm(form({ ...valid, squareFeet: "0" })).errors.squareFeet);
assert(parseProjectForm(form({ ...valid, workType: "new build" })).errors.workType);

// Date rules.
assert(parseProjectForm(form({ ...valid, due: "2026-10-02", rfi: "2026-10-03" })).errors.rfi, "RFI deadline after bid deadline is rejected");
assert.deepEqual(parseProjectForm(form({ ...valid, due: "2026-10-02", rfi: "2026-10-02" })).errors, {});
assert(parseProjectForm(form({ ...valid, start: "2027-02-01", finish: "2027-01-01" })).errors.finish);
assert(parseProjectForm(form({ ...valid, due: "October" })).errors.due);

// Editing keeps identity, status and creation date.
const edited = parseProjectForm(form({ ...valid, name: "Renamed" }), single.project).project;
assert.deepEqual([edited.id, edited.status, edited.createdAt, edited.name], [single.project.id, single.project.status, single.project.createdAt, "Renamed"]);

// Blank or invalid dates never render "Invalid Date".
for (const bad of ["", "2026-13-45", "soon"]) {
  assert.equal(displayDate(bad), "Not set");
  assert.equal(dateLabel(bad), "Not set");
}
assert.equal(displayDate("2026-10-02"), "Oct 2, 2026");

// Project scope: each project keeps its own drafts; the sample keeps its original keys.
assert.equal(getActiveProjectId(), SAMPLE_PROJECT_ID, "Outside the browser the sample project is open");
assert.equal(draftStorageKey(SAMPLE_PROJECT_ID, "budget"), "structor-ui-budget", "Sample drafts keep their pre-scoping keys");
assert.equal(draftStorageKey("p2", "budget"), "structor-ui-p2:budget");
assert.equal(draftStorageKey("p2", "directory"), "structor-ui-directory", "The subcontractor directory is organization-wide");
assert.equal(draftStorageKey("p2", "portal-profile"), "structor-ui-portal-profile");
assert.equal(draftStorageKey("p2", "budget-history"), draftStorageKey("p3", "budget-history"), "Comparable budgets are shared while project cost plans remain isolated");
assert.equal(startingDraft(SAMPLE_PROJECT_ID, "schedule", initialMilestones), initialMilestones, "The sample project starts from the sample data");
assert.deepEqual(startingDraft("p2", "schedule", initialMilestones), [], "A new project must not start with Jelleff's schedule");
assert.deepEqual([startingDraft("p2", "contract-price", 498000), startingDraft("p2", "contract-bidder", "Capital Demolition"), startingDraft("p2", "contract-created", true)], [0, "", false]);
assert.deepEqual(startingDraft("p2", "nested", { price: "9", answers: [1], meta: { ok: true } }), { price: "", answers: [], meta: { ok: false } });
assert.equal(startingDraft("p2", "directory", initialMilestones), initialMilestones, "Organization-wide drafts are the same for every project");
assert.deepEqual([projectScopedKey("active", SAMPLE_PROJECT_ID), projectScopedKey("active", "p2")], ["active", "active:p2"], "Bid-leveling workspace is stored per project");

// Registers: drawing sheet numbers and spec section numbers are unique; every spec section
// is a real MasterFormat number; every submittal requirement points at a listed section.
const uniq = (values, message) => assert.equal(new Set(values).size, values.length, message);
uniq(initialDrawings.map(d => d.id), "Drawing sheet numbers must be unique");
uniq(initialSpecSections.map(s => s.id), "Specification section numbers must be unique");
for (const s of initialSpecSections) {
  assert(csiDivision(s.id), `${s.id}: not a MasterFormat section number`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{4}-\d{2}-\d{2}$/.test(s.received) && s.received >= s.date, `${s.id}: dates must be ISO and received on/after issue`);
}
const sections = new Set(initialSpecSections.map(s => s.id));
for (const item of initialSpecs) assert(sections.has(item.section), `Submittal requirement ${item.id} references ${item.section}, which is not in the list of specifications`);
assert.equal(csiDivision("09 65 19"), "09");
assert.equal(csiDivision("096519"), "09");
for (const bad of ["", "9 65 19", "15 10 00", "Division 09"]) assert.equal(csiDivision(bad), undefined, `${bad}: must not parse as a section`);
assert.equal(Object.keys(CSI_DIVISIONS).length, 35, "MasterFormat has 35 divisions in use");

// The kickoff (Marcel's write-up): extra dates and rules; old records and forms without the fields keep working.
assert.deepEqual(normalizeProject({ id: "old", name: "Old" }).kickoff, { scopesDue: "", rfiResponses: "", drawingFlip: "", demolitionStart: "", jobWalk: "", minBidders: 3, wageScale: null }, "Records from before kickoffs get the empty one");
assert.deepEqual(normalizeProject({ id: "k", name: "K", kickoff: { scopesDue: "Jan 26", minBidders: 40, wageScale: "yes", jobWalk: " On request " } }).kickoff, { scopesDue: "", rfiResponses: "", drawingFlip: "", demolitionStart: "", jobWalk: "On request", minBidders: 3, wageScale: null }, "Bad stored values are not trusted");
const jel = sampleProjectRecords[0];
const keptKickoff = parseProjectForm(form({ ...valid }), jel).project.kickoff;
assert.deepEqual(keptKickoff, jel.kickoff, "A form without kickoff inputs keeps the saved kickoff");
const withKickoff = parseProjectForm(form({ ...valid, due: "2026-02-02", scopesDue: "2026-01-26", rfiResponses: "2026-01-27", drawingFlip: "", minBidders: "4", wageScale: "no", jobWalk: "Thursday 10am" }), jel).project.kickoff;
assert.deepEqual([withKickoff.scopesDue, withKickoff.drawingFlip, withKickoff.minBidders, withKickoff.wageScale, withKickoff.jobWalk], ["2026-01-26", "", 4, false, "Thursday 10am"], "Inputs that are present set the kickoff, even to empty");
assert.equal(parseProjectForm(form({ ...valid, due: "2026-02-02", scopesDue: "2026-02-05" })).errors.scopesDue, "Scopes go to subcontractors before the bid due date.");
assert.equal(parseProjectForm(form({ ...valid, rfiResponses: "next week" })).errors.rfiResponses, "Use a valid date.");
assert.match(parseProjectForm(form({ ...valid, minBidders: "0" })).errors.minBidders, /from 1 to 10/);

console.log(`Records checked: ${sampleProjectRecords.length} sample projects, form validation, area split, legacy upgrade, blank dates, project scope; ${initialDrawings.length} drawings, ${initialSpecSections.length} spec sections.`);

assert.equal(legacy.estimateStage, null, "Old records keep their unknown estimate stage; status is not the stage");
assert.equal(single.project.estimateStage, "concept");
assert(parseProjectForm(form({ ...valid, estimateStage: "Bidding" })).errors.estimateStage);

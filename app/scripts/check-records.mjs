import assert from "node:assert/strict";
import { normalizeProject, parseProjectForm, projectFromForm, sampleProjectRecords, squareFeetLabel } from "../lib/projects.ts";
import { dateLabel, displayDate } from "../lib/format.ts";
import { initialDrawings, initialSpecSections, initialSpecs } from "../lib/data/preconstruction.ts";
import { CSI_DIVISIONS, csiDivision } from "../lib/csi.ts";

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const item of [].concat(v)) f.append(k, item);
  return f;
};
const valid = { name: "Jelleff Recreation Center", location: "Washington, DC", type: "Community & recreation", value: "$18,400,000", workType: "renovation", squareFeet: "42,500", taxStatus: "non-taxable" };

// Samples satisfy the record invariants.
for (const p of sampleProjectRecords) {
  assert(p.squareFeet > 0 && p.size === squareFeetLabel(p.squareFeet), `${p.id}: size must derive from squareFeet`);
  assert.equal(p.workType, null, `${p.id}: sample work type is not known and must stay "not recorded"`);
}

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
assert.equal(single.project.size, "42,500 SF");

// "Both": total is the sum of the two areas; the separate total field is ignored.
const both = parseProjectForm(form({ ...valid, workType: "both", squareFeet: "1", renovationSquareFeet: "30000", additionSquareFeet: "12,500" }));
assert.deepEqual([both.project.squareFeet, both.project.renovationSquareFeet, both.project.additionSquareFeet], [42500, 30000, 12500]);
assert.deepEqual(Object.keys(parseProjectForm(form({ ...valid, workType: "both" })).errors).sort(), ["additionSquareFeet", "renovationSquareFeet"]);

// Required fields, each with its own message, and no project returned.
const empty = parseProjectForm(form({}));
assert.equal(empty.project, undefined);
assert.deepEqual(Object.keys(empty.errors).sort(), ["location", "name", "squareFeet", "taxStatus", "type", "workType"]);
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

// The deprecated five-field form keeps its old behaviour until the new form replaces it.
const old = projectFromForm(form({ name: " Old form ", location: "DC", type: "Education", value: "12", description: "d" }));
assert.deepEqual([old.name, old.value, old.due, old.squareFeet, old.workType], ["Old form", 12, sampleProjectRecords[0].due, 42500, null]);

// Blank or invalid dates never render "Invalid Date".
for (const bad of ["", "2026-13-45", "soon"]) {
  assert.equal(displayDate(bad), "Not set");
  assert.equal(dateLabel(bad), "Not set");
}
assert.equal(displayDate("2026-10-02"), "Oct 2, 2026");

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

console.log(`Records checked: ${sampleProjectRecords.length} sample projects, form validation, area split, legacy upgrade, blank dates; ${initialDrawings.length} drawings, ${initialSpecSections.length} spec sections.`);

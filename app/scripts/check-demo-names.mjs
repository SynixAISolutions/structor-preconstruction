import assert from "node:assert/strict";
import { renameDemoNames, renameDemoNamesDeep, renameSavedDemoNames } from "../lib/demo-names.ts";
import { sampleProjectRecords } from "../lib/projects.ts";

// Marcel (24 Oct): no real project names in a demo. The samples are generic...
assert.deepEqual(sampleProjectRecords.map(p => p.name), ["Project 1", "Project 2", "Project 3"]);
const shown = JSON.stringify(sampleProjectRecords);
for (const real of ["Jelleff", "Whittier", "DLR Group", "General Services", "3265 S St"]) assert(!shown.includes(real), `The sample projects never show "${real}"`);

// ...and what a browser saved before the rename is rewritten.
assert.equal(renameDemoNames("Jelleff Recreation Center"), "Project 1");
assert.equal(renameDemoNames("Invitation to bid — Jelleff.pdf"), "Invitation to bid — Project 1.pdf");
assert.equal(renameDemoNames("JELLEFF RECREATION CENTER 55-22112-00"), "PROJECT 1 55-22112-00");
assert.equal(renameDemoNames("Modernization of the Jelleff Recreation Center for the DC Department of General Services: a new building"), "Modernization of a recreation center for a public owner: a new building");
assert.equal(renameDemoNames("Whittier Campus, Riverside Commons"), "Project 2, Project 3");
assert.equal(renameDemoNames('{"id":"jelleff","key":"structor-ui-jelleff"}'), '{"id":"jelleff","key":"structor-ui-jelleff"}', "Project ids and storage keys stay as they are");

const store = new Map([
  ["structor-ui-projects", JSON.stringify([{ id: "jelleff", name: "Jelleff Recreation Center", location: "3265 S St NW, Washington, DC 20007", architect: "DLR Group" }])],
  ["structor-ui-documents", JSON.stringify([{ name: "Jelleff GMP drawings.pdf" }])],
  ["structor-ui-schedule", JSON.stringify([{ name: "Bids due" }])],
  ["other-app", "Jelleff"],
]);
const storage = { get length() { return store.size; }, key: i => [...store.keys()][i] ?? null, getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } };
assert.equal(renameSavedDemoNames(storage), 2, "Only saved values that hold an old name are rewritten");
assert.deepEqual(JSON.parse(store.get("structor-ui-projects")), [{ id: "jelleff", name: "Project 1", location: "Washington, DC", architect: "Architect of record" }]);
assert.equal(store.get("structor-ui-documents"), JSON.stringify([{ name: "Project 1 GMP drawings.pdf" }]));
assert.equal(store.get("other-app"), "Jelleff", "Another app's storage is left alone");

const when = new Date(0);
const deep = renameDemoNamesDeep({ project: { name: "Jelleff Recreation Center", budget: 520000 }, bidders: [{ name: "Capital Demolition" }], when });
assert.deepEqual(deep, { project: { name: "Project 1", budget: 520000 }, bidders: [{ name: "Capital Demolition" }], when });
assert.equal(deep.when, when, "Non-plain values are kept as they are");

console.log("Demo names checked: generic sample projects, saved browser data and server responses renamed, ids and keys untouched.");

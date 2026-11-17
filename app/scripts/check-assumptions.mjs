// Assumptions & clarifications (Marcel's features list, item 35): each trade's list, from the division leader and the
// subcontractors' proposals, gathered into one document.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const A = await import("../lib/assumptions.ts");
const { basisOfEstimate } = await import("../lib/basis-of-estimate.ts");
const { sampleProjectRecords } = await import("../lib/projects.ts");

const at = "2026-11-17T10:00:00.000Z";
const packages = [
  { id: "drywall", name: "Drywall", code: "09 29 00", owner: "Victor" },
  { id: "concrete", name: "Concrete", code: "03 30 00", owner: "Sadie" },
  { id: "paint", name: "Paint", code: "09 91 23", owner: "Victor" },
];
const fails = (fn, re) => assert.throws(fn, e => e instanceof A.AssumptionRuleError && re.test(e.message));

// The team's own items.
let s = A.addAssumption(A.EMPTY_ASSUMPTIONS, packages, { packageId: "drywall", kind: "assumption", text: "  Work during  normal hours. " }, "Victor", at);
s = A.addAssumption(s, packages, { packageId: "concrete", kind: "clarification", text: "Slab on grade only; no elevated decks." }, "Sadie", at);
assert.deepEqual(s.items.map(i => [i.packageId, i.kind, i.text, i.source.type, i.by]), [["drywall", "assumption", "Work during normal hours.", "team", "Victor"], ["concrete", "clarification", "Slab on grade only; no elevated decks.", "team", "Sadie"]], "Spaces tidied; the team is the source");
fails(() => A.addAssumption(s, packages, { packageId: "drywall", kind: "clarification", text: "work during normal HOURS." }, "V", at), /already on this trade's list/);
fails(() => A.addAssumption(s, packages, { packageId: "nope", kind: "assumption", text: "x" }, "V", at), /trade package/);
fails(() => A.addAssumption(s, packages, { packageId: "drywall", kind: "maybe", text: "x" }, "V", at), /assumption or clarification/);
fails(() => A.addAssumption(s, packages, { packageId: "drywall", kind: "assumption", text: "   " }, "V", at), /Write the assumption/);
fails(() => A.addAssumption(s, packages, { packageId: "drywall", kind: "assumption", text: "x".repeat(1001) }, "V", at), /under 1,000/);
assert.equal(A.addAssumption(s, packages, { packageId: "paint", kind: "assumption", text: "Work during normal hours." }, "V", at).items.length, 3, "The same words may appear on another trade's list");
const dry = s.items[0].id;
s = A.editAssumption(s, dry, { kind: "clarification", text: "Work during normal hours, Monday to Friday." }, "Victor", at);
assert.deepEqual([s.items[0].kind, s.items[0].text], ["clarification", "Work during normal hours, Monday to Friday."]);
fails(() => A.editAssumption(s, "gone", { text: "x" }, "V", at), /no longer exists/);

// What the proposals clarify and exclude, company by company, the latest version only.
const submissions = [
  { id: "s1", packageId: "drywall", bidderId: "dd", revisions: [{ number: 1, clarifications: ["Old note"], exclusions: [] }, { number: 2, clarifications: ["One mobilization included.", "Work during normal hours, Monday to Friday."], exclusions: ["Permits", "Excludes bonds"] }] },
  { id: "s2", packageId: "drywall", bidderId: "aa", revisions: [{ number: 1, clarifications: [], exclusions: [] }] },
  { id: "s3", packageId: "drywall", bidderId: "bb", revisions: [] },
  { id: "s4", packageId: "concrete", bidderId: "cc", revisions: [{ number: 1, clarifications: ["Pump included."], exclusions: [] }] },
];
const names = { dd: "District Drywall", aa: "Acme", bb: "Bravo", cc: "Capital Concrete" };
const notes = A.proposalNotes(s, submissions, "drywall", id => names[id]);
assert.deepEqual(notes.map(n => [n.company, n.revision]), [["District Drywall", 2]], "Only proposals with something to say; drafts and empty ones are left out");
assert.deepEqual(notes[0].lines, [
  { from: "clarification", text: "One mobilization included.", taken: false },
  { from: "clarification", text: "Work during normal hours, Monday to Friday.", taken: true },
  { from: "exclusion", text: "Excludes: Permits", taken: false },
  { from: "exclusion", text: "Excludes bonds", taken: false },
], "Exclusions read as what the price leaves out; a line already listed is marked");
s = A.takeFromProposal(s, packages, "drywall", notes[0], notes[0].lines[0], "Victor", "assumption", at);
const taken = s.items.at(-1);
assert.deepEqual([taken.kind, taken.text, taken.source], ["assumption", "One mobilization included.", { type: "proposal", submissionId: "s1", revision: 2, company: "District Drywall", from: "clarification" }], "Word for word, and it says where it came from");
assert.equal(A.sourceText(taken), "from District Drywall's proposal (V2)");
assert.equal(A.sourceText({ ...taken, source: { ...taken.source, company: "Capitol Wall Systems" } }), "from Capitol Wall Systems' proposal (V2)", "A name ending in s takes only the apostrophe");
fails(() => A.takeFromProposal(s, packages, "drywall", notes[0], notes[0].lines[0], "Victor", "clarification", at), /already on this trade's list/);
const again = A.proposalNotes(s, submissions, "drywall", id => names[id]);
s = A.takeAllFromProposal(s, packages, "drywall", again[0], "Victor", at);
assert.deepEqual(s.items.filter(i => i.packageId === "drywall").map(i => i.text), ["Work during normal hours, Monday to Friday.", "One mobilization included.", "Excludes: Permits", "Excludes bonds"], "Add all takes only what isn't listed yet");
assert(A.proposalNotes(s, submissions, "drywall", id => names[id])[0].lines.every(l => l.taken));
assert.equal(A.takeAllFromProposal(s, packages, "drywall", A.proposalNotes(s, submissions, "drywall", id => names[id])[0], "V", at), s, "Nothing left to add: unchanged");

// The one document, in CSI order, and the basis of estimate.
const trades = A.assumptionsByTrade(s, packages);
assert.deepEqual(trades.map(t => [t.trade, t.assumptions.length, t.clarifications.length]), [["Concrete", 0, 1], ["Drywall", 1, 3]], "Trades with items, in CSI order; Paint has none");
const md = A.assumptionsMarkdown("Project 1", trades, "2026-11-17");
assert.match(md, /^# Assumptions and clarifications: Project 1\n\nPrepared 2026-11-17\.\n\n## 03 30 00 Concrete\n\n### Clarifications\n\n- Slab on grade only; no elevated decks\.\n\n## 09 29 00 Drywall\n\n### Assumptions\n\n- One mobilization included\. _\(from District Drywall's proposal \(V2\)\)_/);
s = A.removeAssumption(s, dry);
assert.equal(s.items.some(i => i.id === dry), false);
const boe = basisOfEstimate({ project: sampleProjectRecords[0], documents: [], budget: { lines: [], allowances: [] }, setup: { decisions: [] }, trades: A.assumptionsByTrade(s, packages) });
assert.deepEqual(boe.sections.find(x => x.heading === "Assumptions and clarifications by trade").lines, [
  "Concrete (03 30 00), clarification: Slab on grade only; no elevated decks.",
  "Drywall (09 29 00), assumption: One mobilization included.",
  "Drywall (09 29 00), clarification: Excludes: Permits",
  "Drywall (09 29 00), clarification: Excludes bonds",
], "The basis of estimate carries every trade's list");

console.log("Assumptions checked: team items, duplicates, edits, proposal clarifications and exclusions (latest version, marked when listed), add one or all, the document in CSI order, and the basis of estimate.");

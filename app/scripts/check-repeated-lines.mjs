// The same work written twice (lib/same-work, lib/repeated-lines; 25 Nov, 2626 Penn's Demolition had 72 lines for a
// 17-line form): which lines join by themselves and which never do, what the AI is asked, which of its answers hold up, and
// what a merge keeps. The lines are made up, in the words of real keynotes.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const W = await import("../lib/same-work.ts");
const R = await import("../lib/repeated-lines.ts");
const P = await import("../lib/procurement.ts");
const E = await import("../lib/extraction.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// ── Lines that join by themselves ──
const same = (a, b, sa, sb) => W.sameWork(a, b, sa, sb) && W.sameWork(b, a, sb, sa);
for (const [a, b] of [
  ["Remove the lowest level slab along with existing building plumbing.", "Remove lowest level slab along with the existing building plumbing."],
  ["Verify existing perimeter columns and saw cut and demolish back as necessary.", "Saw cut and demolish back existing perimeter columns as necessary."],
  ["Connect the stairway lighting fixture to the floor-above circuit.", "Connect the stairway lighting fixtures to the floor-above circuit."],
  ["Remove exterior equipment, piping, ductwork, thru-wall vents and louvers.", "Remove all existing exterior equipment, piping, ductwork and thru-wall vents."],
  ["Provide fire-rated hollow metal doors with labels and certifications.", "Furnish fire-rated hollow metal doors with labels and certifications."],
]) assert.ok(same(a, b), `The same work: "${a}" and "${b}"`);

// ── Lines that never join ──
for (const [a, b] of [
  ["Verify existing foundations, then saw cut and demolish back as necessary.", "Verify existing perimeter columns, then saw cut and demolish back as necessary."],
  ["Provide 45-minute fire-rated hollow metal doors and frames.", "Provide 90-minute fire-rated hollow metal doors and frames."],
  ["Demolish existing walls and windows at the north elevation.", "Demolish existing walls and windows at the south elevation."],
  ["Provide kitchen cabinetry per Elevation A.", "Provide kitchen cabinetry per Elevation B."],
  ["Provide toe and knee clearance at the removable base cabinet.", "Provide toe and knee clearance at the Type A removable base cabinets."],
  ["Install ceiling access panels in gypsum ceilings.", "Furnish and install ceiling access panels in gypsum ceilings."],
  ["Furnish and install gypsum board partitions.", "Furnish and install gypsum board partitions except at the shafts."],
  ["Remove the lowest level slab along with existing building plumbing.", "Remove the lowest level slab together with existing plumbing and footings."],
  ["Provide interior gypsum board partitions at the units.", "Provide interior gypsum board partitions at the corridor."],
  ["Install flush wood doors.", "Install clad wood doors."],
]) assert.ok(!same(a, b), `Different work: "${a}" and "${b}"`);
assert.ok(!same("Shop drawings, samples and product data", "Shop drawings, samples and product data", "09 65 00", "09 68 16"), "One section's submittals aren't another's");
assert.ok(same("Shop drawings, samples and product data", "Shop drawings, samples and product data", "09 65 00", "09 65 00 · §1.4"), "The same section's are");
assert.ok(W.workConflict("Provide 2 in. rigid insulation.", "Provide 4 in. rigid insulation."));
assert.ok(W.workConflict("Furnish hollow metal frames.", "Install hollow metal frames."), "Only to furnish, only to install");
assert.equal(W.workConflict("Provide hollow metal frames.", "Install hollow metal frames."), null, "\"Provide\" is both");
assert.equal(W.workConflict("Demolish existing walls and windows.", "Demolish existing walls and windows at the north elevation."), null, "A place is for the estimator to judge");

// ── The request ──
const at = "2026-11-25T10:00:00.000Z";
let proc = P.addPackage({ packages: [], scopes: [], invitations: [], outreach: [], notifications: [] }, { id: "demolition", name: "Demolition", code: "02 41 00", division: "02" });
const pkg = proc.packages[0];
const add = (title, source, detail = "") => { proc = P.addScope(proc, { packageId: pkg.id, title, detail, source, origin: "ai" }, "Structor AI", at); return proc.scopes.at(-1).id; };
const ids = {
  a: add("Demolish existing walls and windows.", "AD0100"),
  b: add("Demolish existing walls and windows keyed as keynote 08.", "AD0200"),
  c: add("Demolish existing walls and windows at the north elevation.", "AD0201"),
  d: add("Provide temporary bracing for the existing wall.", "S0100"),
  e: add("Provide 2 in. of rigid insulation at the slab edge.", "A0420"),
  f: add("Provide 4 in. of rigid insulation at the slab edge.", "A0421"),
};
const items = proc.scopes;
const batches = R.repeatBatches(items);
assert.equal(batches.length, 1);
assert.equal(new Set(batches[0].map(l => l.id)).size, 6, "Every line is sent once");
assert.deepEqual(R.repeatBatches(items.slice(0, 1)), [], "One line has nothing to repeat");
const many = Array.from({ length: 450 }, (_, i) => ({ ...items[0], id: `x${i}`, title: `Line ${i}` }));
assert.deepEqual(R.repeatBatches(many).map(b => b.length), [200, 200, 50]);
const job = EXTRA_JOBS["repeated-lines"];
const input = job.parse({ trade: "Demolition", code: "02 41 00", lines: batches[0] });
const [system, user] = job.messages(input);
assert.match(system.content, /Group lines that are the same work/);
assert.match(system.content, /When in doubt, leave the lines apart/);
assert.match(user.content, /L1\. .*\[A[DS]?\d/);
assert.throws(() => job.parse({ trade: "Demolition", lines: [batches[0][0]] }), /Send 2 to 200 lines/);
assert.throws(() => job.parse({ trade: "Demolition", lines: Array.from({ length: 201 }, (_, i) => ({ id: `i${i}`, title: `t${i}` })) }), /Send 2 to 200 lines/);

// ── What the AI may answer ──
const L = id => `L${input.lines.findIndex(l => l.id === id) + 1}`;
const answer = job.screen({ groups: [
  { keep: L(ids.a), same: [L(ids.b), L(ids.c), L(ids.a), "L99"] },
  { keep: L(ids.b), same: [L(ids.d)] },
  { keep: L(ids.e), same: [L(ids.f)] },
  { keep: "L99", same: [L(ids.d)] },
  { keep: L(ids.d), same: [] },
] }, input);
assert.deepEqual(answer.groups, [{ keep: ids.a, same: [ids.b, ids.c] }], "Lines that were sent, each in one group, the kept one not in its own repeats");
assert.deepEqual(answer.dropped.map(d => d.reason.replace(/Not merged into "[^"]*": /, "")), ["their numbers or tags differ."], "2 in. and 4 in. are left apart, with why");

// ── What a merge keeps ──
let ext = { runs: [], drafts: [] };
const run = { packageIds: [pkg.id], engine: { mode: "live", model: "m" }, documents: [{ name: "demo.pdf", pages: 3 }], startedAt: at, finishedAt: at, drafts: [] };
for (const [k, t] of [["a", 1], ["b", 2], ["c", 3]]) run.drafts.push({ key: k, kind: "scope", packageId: pkg.id, title: proc.scopes.find(s => s.id === ids[k]).title, detail: "", source: `AD0${t}00`, citations: [{ document: "demo.pdf", page: t, quote: "x" }] });
ext = E.recordRun(E.EMPTY_EXTRACTION, proc, run);
ext = { ...ext, drafts: ext.drafts.map((d, i) => ({ ...d, status: "accepted", acceptedId: [ids.a, ids.b, ids.c][i] })) };
const flip = { pages: [], regions: [{ id: "r1", scopeIds: [ids.b] }, { id: "r2", scopeIds: [ids.a, ids.c] }, { id: "r3", scopeIds: [ids.d] }] };
proc = { ...proc, packages: [{ ...pkg, general: { lines: [{ id: "g", text: "Walls", members: [ids.a, ids.b, ids.d] }], basis: "", at, by: "AI" } }] };
const records = { extraction: ext, procurement: proc, flip };
const merged = R.mergeLines(records, ids.a, [ids.b, ids.c], "Sadie", at);
const keep = merged.procurement.scopes.find(s => s.id === ids.a);
assert.deepEqual(merged.procurement.scopes.map(s => s.id).sort(), [ids.a, ids.d, ids.e, ids.f].sort(), "The repeats leave the bid form");
assert.match(keep.detail, /Also on AD0200\./, "A repeat that says nothing more gives its sheet only");
assert.match(keep.detail, /Also on AD0201: Demolish existing walls and windows at the north elevation\./, "Their sheets and wording stay");
assert.equal(keep.title, "Demolish existing walls and windows.", "The kept line reads as it did");
assert.deepEqual(merged.extraction.drafts.map(d => d.acceptedId), [ids.a, ids.a, ids.a], "Their findings, with their citations, stand for the kept line");
assert.deepEqual(merged.flip.regions.map(r => r.scopeIds), [[ids.a], [ids.a], [ids.d]], "Their highlights do too, once each");
assert.deepEqual(merged.procurement.packages[0].general.lines[0].members, [ids.a, ids.d], "The general scope follows");
assert.equal(records.procurement.scopes.length, 6, "The records given are unchanged");

// ── What can't be merged ──
const touched = P.approveScope(proc, ids.b, "Sadie", at);
assert.deepEqual(["AD0300", "AD0400", "AD0300"].reduce((s, source) => P.addRepeat(s, ids.a, { title: "Demolish existing walls and windows.", source }, false, "AI", at), proc).scopes[0].detail, "Also on AD0300, AD0400.", "Sheets join one sentence, once each");
assert.throws(() => R.mergeLines({ ...records, procurement: touched }, ids.a, [ids.b], "Sadie", at), /approved, edited or given a quantity/);
const edited = P.editScope(proc, ids.c, { title: "Demolish the north walls." }, "Sadie", at);
assert.throws(() => R.mergeLines({ ...records, procurement: edited }, ids.a, [ids.c], "Sadie", at), /approved, edited or given a quantity/, "A line someone changed isn't merged away");
assert.throws(() => R.mergeLines(records, "gone", [ids.b], "Sadie", at), /no longer on the bid form/);
assert.throws(() => R.mergeLines(records, ids.a, [ids.b], " ", at), /Say who merged/);
assert.equal(R.mergeLines(records, ids.a, [], "Sadie", at), records, "Nothing chosen, nothing changed");
assert.equal(R.mergeable({ ...items[0], quantity: { value: 3 } }), false);
assert.equal(R.mergeable({ ...items[0], origin: "estimator" }), false, "An estimator's own line is never merged away");

console.log("Repeated lines checked: the same work in other words joins by itself, different sizes, places, tags, elements, sections and furnish/install never do, what the AI is asked and which groups hold up, a merge that keeps every sheet, highlight, citation and wording, and lines an estimator touched left alone.");

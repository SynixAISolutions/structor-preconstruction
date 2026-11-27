// Standard scope under every trade (Marcel's issues log, item 17): a trade's scope checklist from the AI memory, as
// printed, put on its bid form on any project. Uses the same Drywall checklist text as check-scope-checklist, run through
// the real import (readChecklists, checklistEntries) to the memory entries the app reads.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/scope-checklist.ts");
const S = await import("../lib/standard-scope.ts");
const P = await import("../lib/procurement.ts");

const drywallText = [
  "Example Builders", "09A – DRYWALL AND ACT", "SCOPE CHECKLIST", "09A – DRYWALL AND ACT",
  "Layout of all partitions from the column grid",
  "Blocking in drywall partitions for all wall\\-mounted items \\[by others\\]",
  "Receive, unload and install hollow metal frames in drywall partitions, excluding only the following:",
  "Frames in masonry walls", "2", "Layout of all partitions from the column grid", "Exclude fire-rated access panels in masonry", "Etc…",
  "Exclusions:", "Painting of gypsum board", "Painting of gypsum board", "Acoustical insulation in exterior walls.",
].join("\n");
const [dw] = C.readChecklists(drywallText, "09A - Drywall and ACT.doc");
assert.equal(dw.standard, "drywall");

// As the memory stores them once approved (lib/memory MemoryEntry), plus entries the standard scope must ignore.
let n = 0;
const entry = (input, extra = {}) => ({ id: `m${++n}`, status: "approved", projectId: null, section: null, seen: 1, history: [], version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", detail: "", source: {}, events: [], trades: [], ...input, ...extra });
const entries = C.checklistEntries(dw, dw.standard).map(i => entry(i));
const concrete = C.readChecklists(["03A – CONCRETE", "Formwork for all cast-in-place concrete", "Exclusions:", "Reinforcing steel"].join("\n"), "03A - Concrete.doc")[0];
entries.push(...C.checklistEntries(concrete, concrete.standard).map(i => entry(i)));                     // another trade's checklist
entries.push(entry({ ...C.checklistEntries(dw, dw.standard)[0], text: "Proposed, not approved yet" }, { status: "proposed" }));
entries.push(entry({ ...C.checklistEntries(dw, dw.standard)[0], text: "Only on one project" }, { projectId: "jelleff" }));
entries.push(entry({ kind: "example", origin: "import", trades: ["09 29 00", "drywall"], text: "A bid sheet line, not a checklist line", events: ["bid-sheet:whittier:gwb:3"] }));

// Project 1's Drywall package (lib/procurement STANDARD_TRADES): matched by its code and name, like a scan.
const pkg = { ...P.STANDARD_TRADES.find(t => t.id === "drywall"), owner: "", due: "" };
const lines = S.standardScopeFor(pkg, entries);
assert.deepEqual(lines.map(l => [l.section, l.title, l.fillIn]), [
  ["includes", "Layout of all partitions from the column grid", false],
  ["includes", "Blocking in drywall partitions for all wall-mounted items [by others]", true],
  ["includes", "Receive, unload and install hollow metal frames in drywall partitions, excluding only the following:", false],
  ["includes", "Frames in masonry walls", false],
  ["excludes", "Excluded: Fire-rated access panels in masonry.", false],
  ["excludes", "Excluded: Painting of gypsum board.", false],
  ["excludes", "Excluded: Acoustical insulation in exterior walls.", false],
], "The checklist as printed and in order, exclusions last; only approved, company-wide checklist lines for this trade; a bracketed note is filled in per project, as the import reads it");
assert.ok(lines.every(l => l.checklist === "09A Drywall and ACT" && l.own));
assert.deepEqual(S.standardScopeFor({ code: "03 30 00", name: "Concrete" }, entries).map(l => l.title), ["Formwork for all cast-in-place concrete", "Excluded: Reinforcing steel."]);
assert.deepEqual(S.standardScopeFor({ code: "08 71 00", name: "Door hardware" }, entries), [], "A trade with no checklist has no standard scope");

// The trade's own checklist. The import also tags a division's other checklists with its trade (27 Nov, preview: Concrete
// matched 03A plus both 03B precast checklists and 03E playground surfacing; Masonry matched cast stone and pavers).
// Packages and checklist names as on Project 1 and the live memory.
const ownOf = (code, name, names) => [...S.ownChecklists({ code, name }, names)];
assert.deepEqual(ownOf("03 30 00", "Concrete", ["03A Concrete", "03B Architectural Precast Concrete", "03B Precast Conc", "03E Playground Solid Surfacing"]), ["03A Concrete"]);
assert.deepEqual(ownOf("04 22 00", "Masonry", ["04A Unit Masonry", "04B Cast Stone PO", "04E Brick and Stone Pavers", "04J Masonry Cleaning and Restoration"]), ["04A Unit Masonry"], "The first checklist narrower than the trade");
assert.deepEqual(ownOf("09 65 19", "Flooring", ["09C Carpet and Resilient Flooring", "09I Raised Access Flooring", "09J Rubber Athletic Flr", "09K Epoxy Flooring"]), ["09C Carpet and Resilient Flooring"]);
assert.deepEqual(ownOf("09 29 00", "Drywall", ["09A Drywall and ACT"]), ["09A Drywall and ACT"]);
assert.deepEqual(ownOf("08 11 13", "Doors, frames & hardware", ["08A Doors Frames Hardware"]), ["08A Doors Frames Hardware"], "\"&\", \"and\" and punctuation don't count");
assert.deepEqual(ownOf("07 10 00", "Waterproofing, air barrier & joint sealants", ["07D Waterproofing", "07E Caulking"]), ["07D Waterproofing"], "The ones the package's name names");
assert.deepEqual(ownOf("05 12 00", "Structural steel", ["05A Structural Steel", "05C Miscellaneous Metals", "05J Expansion Joint Systems"]), ["05A Structural Steel"]);
assert.deepEqual(ownOf("05 12 00", "Structural steel and miscellaneous metals", ["05A Structural Steel", "05C Miscellaneous Metals", "05J Expansion Joint Systems"]), ["05A Structural Steel", "05C Miscellaneous Metals"]);
assert.deepEqual(ownOf("10 00 00", "Specialties", ["10A Toilet Partitions", "10H Toilet Accessories", "10K Postal Specialties"]), ["10A Toilet Partitions", "10H Toilet Accessories", "10K Postal Specialties"], "A whole-division package takes its division's checklists, not just Postal Specialties");
assert.deepEqual(ownOf("11 00 00", "Equipment", ["11A Audiovisual", "11G Playground Equipment"]), ["11A Audiovisual", "11G Playground Equipment"]);
assert.deepEqual(ownOf("32 13 13", "Site concrete", ["02F Curbs, Gutters and Walks"]), ["02F Curbs, Gutters and Walks"], "When no name says which, all of them");
// Through the real import: 03E comes first in the memory and repeats one of 03A's lines word for word.
const playground = C.readChecklists(["03E – PLAYGROUND SOLID SURFACING", "Poured rubber surfacing at play areas", "Formwork for all cast-in-place concrete"].join("\n"), "03E - Playground Solid Surfacing.doc")[0];
assert.deepEqual(C.checklistEntries(playground, playground.standard)[0].trades, ["03 30 00", "concrete", "playground solid surfacing"], "tagged with the division's trade, as on the live memory");
const concreteLines = S.standardScopeFor({ code: "03 30 00", name: "Concrete" }, [...C.checklistEntries(playground, playground.standard).map(i => entry(i)), ...entries]);
assert.deepEqual(concreteLines.map(l => [l.checklist, l.own, l.title]), [
  ["03A Concrete", true, "Formwork for all cast-in-place concrete"],
  ["03A Concrete", true, "Excluded: Reinforcing steel."],
  ["03E Playground Solid Surfacing", false, "Poured rubber surfacing at play areas"],
], "The trade's own checklist first, a repeated line kept under it, the other checklist offered after");
assert.deepEqual(S.checklistGroups(concreteLines).map(g => [g.checklist, g.own, g.lines.length]), [["03A Concrete", true, 2], ["03E Playground Solid Surfacing", false, 1]]);
assert.deepEqual(S.defaultStandard(concreteLines).map(l => l.title), ["Formwork for all cast-in-place concrete", "Excluded: Reinforcing steel."], "By default only the trade's own checklist");
// A bid sheet line the checklist repeats keeps the bid sheet as its source (as 3 live entries do); it's named after its checklist.
const from03A = C.checklistEntries(concrete, concrete.standard)[0].events.find(x => x.startsWith("checklist:")).split(":").slice(0, 3).join(":");
const sheetLine = entry({ kind: "example", origin: "import", trades: ["03 30 00", "concrete"], text: "Fine grading for the Work from +/- 0.2' of design subgrade.",
  events: ["import:jelleff rec live bid sheet xlsx:Conc:line:10", `${from03A}:includes:5`], source: { file: "Jelleff Rec Live Bid sheet.xlsx", tab: "Conc", trade: "Concrete" } });
assert.deepEqual(S.standardScopeFor({ code: "03 30 00", name: "Concrete" }, [sheetLine, ...entries]).map(l => [l.checklist, l.own, l.title]), [
  ["03A Concrete", true, "Formwork for all cast-in-place concrete"],
  ["03A Concrete", true, "Fine grading for the Work from +/- 0.2' of design subgrade."],
  ["03A Concrete", true, "Excluded: Reinforcing steel."],
]);

// On the bid form: a line already there in the same words is skipped; checklist wording is approved, a fill-in stays a draft.
const base = { packages: [pkg, { ...P.STANDARD_TRADES.find(t => t.id === "concrete"), owner: "", due: "" }], scopes: [
  { id: "s1", packageId: "drywall", title: "Layout of all partitions from the column grid.", detail: "", source: "A-101", origin: "ai", status: "approved", allTrades: false, history: [] },
  { id: "s2", packageId: "drywall", title: "Provide all permits.", detail: "", source: "", origin: "estimator", status: "approved", allTrades: true, history: [] },
], invitations: [], outreach: [], notifications: [] };
const { state, added } = S.addStandardScope(base, "drywall", lines, "Marcel Khoury", "2026-11-26T12:00:00Z");
assert.equal(added, 6);
const std = S.standardOnForm(state, "drywall");
assert.equal(std.length, 6);
assert.ok(std.every(s => s.source === "Standard scope · 09A Drywall and ACT" && s.packageId === "drywall" && !s.allTrades));
assert.deepEqual(std.map(s => s.status), ["draft", "approved", "approved", "approved", "approved", "approved"], "Only the fill-in line waits for review");
assert.deepEqual(std[1].history.map(h => h.kind), ["created", "approved"]);
assert.equal(S.missingStandard(state, "drywall", lines).length, 0);
assert.equal(S.addStandardScope(state, "drywall", lines, "Marcel Khoury").added, 0, "Adding again changes nothing");
assert.equal(state.scopes.filter(s => s.packageId === "concrete").length, 0, "Other trades are untouched");
// The bid form bidders get (and every export) carries them, after the all-trades lines.
const form = P.bidForm(state, "drywall").map(s => s.title);
assert.equal(form[0], "Provide all permits.");
assert.ok(form.includes("Excluded: Painting of gypsum board."));

console.log("Standard scope checked: Marcel's Drywall checklist as printed (approved, company-wide, this trade only), the trade's own checklist ahead of its division's others (Concrete, Masonry, Waterproofing, Site concrete), exclusions, fill-ins, lines already there, again-safe, on the bid form.");

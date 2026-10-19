import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/responsibility-matrix.ts");

const pkg = (id, name, code) => ({ id, name, division: code.slice(0, 2), code, owner: "", due: "" });
const scope = (id, packageId, source, extra = {}) => ({ id, packageId, title: `Line ${id}`, detail: "", source, origin: "ai", status: "draft", allTrades: false, history: [], ...extra });
const procurement = {
  packages: [pkg("drywall", "Drywall", "09 29 00"), pkg("carpentry", "Carpentry", "06 10 00"), pkg("concrete", "Concrete", "03 30 00")],
  scopes: [
    scope("a", "drywall", "09 29 00 · §2.3"),
    scope("b", "drywall", "06 10 53 · §3.1 blocking"),
    scope("c", "carpentry", "061053 · §3.1"),
    scope("d", "concrete", "S101 · Detail 3"),
    scope("e", "drywall", "07 84 00 · §1.2", { allTrades: true }),
  ],
  invitations: [], outreach: [], notifications: [],
};
const sections = [
  { section: "01 10 00", title: "SUMMARY", first: 10, last: 12 },
  { section: "03 30 00", title: "CAST-IN-PLACE CONCRETE", first: 60, last: 80 },
  { section: "06 10 53", title: "MISCELLANEOUS ROUGH CARPENTRY", first: 150, last: 156 },
  { section: "07 84 00", title: "FIRESTOPPING", first: 300, last: 305 },
  { section: "09 29 00", title: "GYPSUM BOARD", first: 400, last: 420 },
  { section: "10 28 00", title: "TOILET ACCESSORIES", first: 542, last: 550 },
];
const m = R.responsibilityMatrix(sections, procurement);
assert.deepEqual(m.rows.map(r => [r.section, r.status]), [["07 84 00", "orphan"], ["10 28 00", "orphan"], ["06 10 53", "double"], ["03 30 00", "unwritten"], ["09 29 00", "covered"]],
  "Divisions 00/01 left to General; orphans, doubles, unwritten, covered; an all-trades line doesn't carry a section");
const byCode = Object.fromEntries(m.rows.map(r => [r.section, r]));
assert.deepEqual(m.counts, { orphan: 2, unwritten: 1, double: 1, covered: 1 });
assert.equal(byCode["06 10 53"].note, "Carried by Drywall and Carpentry: two subs may price it. Keep it in one trade.", "Section codes are read with or without spaces");
assert.deepEqual(byCode["06 10 53"].carriedBy.map(c => [c.packageId, c.scopes.map(s => s.id)]), [["drywall", ["b"]], ["carpentry", ["c"]]]);
assert.equal(byCode["03 30 00"].note, "Concrete should carry it, but no bid-form line cites it yet.", "A drawing-only line doesn't cite the section");
assert.deepEqual([byCode["10 28 00"].suggest?.name, byCode["10 28 00"].note], ["Specialties", "No trade carries it. Add a Specialties package, or assign it to a trade."]);
assert.equal(byCode["07 84 00"].suggest?.name, "Thermal & moisture", "Firestopping: the standard trade for Division 07");
assert.equal(byCode["09 29 00"].expected, "drywall");

// Assigning an orphan adds a draft bid-form line that cites the section, so the matrix then shows it covered.
const assigned = R.assignSection(procurement, byCode["07 84 00"], "drywall", "Marcel", "2026-10-20T10:00:00Z");
const added = assigned.scopes.at(-1);
assert.deepEqual([added.packageId, added.title, added.source, added.status, added.origin], ["drywall", "FIRESTOPPING (Section 07 84 00)", "07 84 00 · manual p. 300", "draft", "specification"]);
assert.equal(R.responsibilityMatrix(sections, assigned).rows.find(r => r.section === "07 84 00").status, "covered");
assert.throws(() => R.assignSection(procurement, byCode["07 84 00"], "nope", "Marcel"));

console.log(`Responsibility matrix checked: ${m.rows.length} sections, orphans with a suggested trade, doubles across trades, unwritten, covered, assigning a section.`);

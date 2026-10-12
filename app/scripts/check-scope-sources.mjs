import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/scope-sources.ts");
const { sampleDrawingFlip } = await import("../lib/data/drawing-flip.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { initialSpecSections } = await import("../lib/data/preconstruction.ts");
const { EMPTY_DRAWING_FLIP } = await import("../lib/drawing-flip.ts");

const scope = id => sampleProcurement.scopes.find(s => s.id === id);
const sources = (item, flip = sampleDrawingFlip, specs = initialSpecSections) => S.scopeSources(item, flip, specs);
const sheets = r => r.drawings.map(d => `${d.page.sheet}[${d.regions.map(x => x.number).join(",")}]`);

// The drywall item: its linked Drawing Flip region and its listed specification section with manual pages.
const drywall = sources(scope("scope-12"));
assert.deepEqual(sheets(drywall), ["A-101[R-005]"]);
assert.deepEqual(drywall.spec, { section: "09 29 00", paragraph: "§3.6", title: "Gypsum board", pages: { first: 346, last: 355 } });
assert.equal(drywall.unresolved, null);

// A drawing source names a Drawing Flip page: that page, with the item's regions on it.
assert.deepEqual([sheets(sources(scope("scope-1"))), sources(scope("scope-1")).spec], [["AD-101[R-001]"], null]);
// A named sheet with no region linked to the item still opens as the whole sheet.
const sheetOnly = sources({ id: "x", source: "M-101 · Plan" });
assert.deepEqual([sheets(sheetOnly), sheetOnly.unresolved], [["M-101[]"], null]);
// A sheet that isn't in Drawing Flip stays plain text; linked regions elsewhere still show.
assert.deepEqual([sheets(sources(scope("scope-8"))), sources(scope("scope-8")).unresolved], [[], "A-501 · Wall sections"]);
assert.deepEqual([sheets(sources(scope("scope-7"))), sources(scope("scope-7")).unresolved], [["A-101[R-004]"], "A-501 · Wall Type 4"]);
// A section missing from the register: still a section, without title or pages.
assert.deepEqual(sources(scope("scope-10")).spec, { section: "07 27 00", paragraph: "§2.1", title: null, pages: null });
assert.deepEqual(sources({ id: "x", source: "09 29 00" }).spec, { section: "09 29 00", paragraph: null, title: "Gypsum board", pages: { first: 346, last: 355 } });
// A project without Drawing Flip pages or a register.
assert.deepEqual(sources(scope("scope-12"), EMPTY_DRAWING_FLIP, []), { drawings: [], spec: { section: "09 29 00", paragraph: "§3.6", title: null, pages: null }, unresolved: null });
assert.deepEqual(sources({ id: "x", source: "" }), { drawings: [], spec: null, unresolved: null });
// Pages follow Drawing Flip's sheet order, each page once.
const both = sources({ id: "scope-12", source: "AD-101 · Note 01" });
assert.deepEqual(sheets(both), ["AD-101[]", "A-101[R-005]"]);
// Every sample item resolves to something to open or to plain text.
for (const item of sampleProcurement.scopes) {
  const r = sources(item);
  assert(r.drawings.length || r.spec || r.unresolved, `${item.id}: nothing to show`);
}

assert.deepEqual([S.manualPages("pp. 346–355"), S.manualPages("p. 12"), S.manualPages("pp. 9-3"), S.manualPages("tbd")], [{ first: 346, last: 355 }, { first: 12, last: 12 }, null, null]);
console.log(`Scope sources checked: ${sampleProcurement.scopes.length} sample items, drawings, sections, unlisted and empty cases.`);

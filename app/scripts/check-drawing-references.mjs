import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/drawing-references.ts");

// Drawing references by printed text (28 Oct, after Marcel's Wyre AI demo): every sheet a package is on, never areas.
const code = R.csiPattern("09 29 00");
assert(["092900 GYPSUM BOARD", "SEE 09 29 00", "SPEC 09-29-00", "09.29.00 TYPE X"].every(t => code.test(t)), "A CSI number however the sheet writes it");
assert(!code.test("1092900") && !code.test("0929001") && !code.test("09 29 01"), "Not inside a longer number or another section");
assert.equal(R.csiPattern("09 00 00"), null, "A whole division is too broad to place work");
assert.equal(R.csiPattern("09"), null);

const drywall = R.packageTerms({ code: "09 29 00", name: "Drywall" }, [{ section: "09 29 00", title: "Gypsum Board" }, { section: "09 22 16", title: "Non-Structural Metal Framing" }]);
assert.equal(drywall.codes.length, 2, "Its code and each of its sections' numbers");
assert(drywall.phrases.some(r => r.test("5/8\" GYPSUM BOARD TYPE X")) && drywall.phrases.some(r => r.test("GYPSUM BOARDS")) && drywall.phrases.some(r => r.test("NON STRUCTURAL METAL FRAMING")), "Section titles, with a plural or a space for the hyphen");
assert(!drywall.phrases.some(r => r.test("GYPSUMBOARD SUPPLY")), "Whole words only");
assert.equal(R.packageTerms({ code: "08 11 13", name: "Doors, frames & hardware" }, []).phrases.length, 0, "A combined trade name is not a phrase on its own");
assert.equal(R.packageTerms({ code: "01 10 00", name: "General" }, [{ section: "01 10 00", title: "Summary" }]).phrases.length, 0, "Generic words place nothing");

const concrete = R.packageTerms({ code: "03 30 00", name: "Concrete" }, [{ section: "03 30 00", title: "Cast-in-Place Concrete" }]);
const sheets = [
  { docId: "d", page: 12, sheet: "A-023", title: "Exterior assemblies", discipline: "Architectural", text: "042000\nBRICK\n033000\nCAST-IN-PLACE CONCRETE\nAIR GAP\n" },
  { docId: "d", page: 40, sheet: "S-101", title: "Foundation plan", discipline: "Structural", text: "GENERAL NOTES\n1. ALL CONCRETE SHALL BE 4000 PSI.\nGRID 03 30 00\n" },
  { docId: "d", page: 41, sheet: "S-102", title: "Framing plan", discipline: "Structural", text: "STEEL BEAM W12X26\n033000\n" },
  { docId: "d", page: 90, sheet: "M-101", title: "Mechanical plan", discipline: "Mechanical", text: "DUCT 12X10\n" },
];
const refs = R.findDrawingReferences(sheets, concrete);
assert.deepEqual(refs.map(r => [r.sheet, r.lines]), [
  ["A-023", ["033000 CAST-IN-PLACE CONCRETE"]],
  ["S-101", ["1. ALL CONCRETE SHALL BE 4000 PSI.", "GRID 03 30 00"]],
], "The callout and its number as one line; the trade's name in a note; a lone number with no words beside it places nothing");
assert.deepEqual(R.byDiscipline(refs).map(g => [g.discipline, g.refs.length]), [["Architectural", 1], ["Structural", 1]]);
assert.deepEqual(R.findDrawingReferences(sheets, { codes: [], phrases: [] }), []);
const many = R.findDrawingReferences([{ ...sheets[0], text: Array.from({ length: 40 }, (_, i) => `CONCRETE PAD ${i}`).join("\n") }], concrete);
assert.equal(many[0].lines.length, 20, "At most 20 lines from one sheet");

console.log("Drawing references checked: CSI numbers however printed, section titles as whole words, callouts joined to their number, generic words ignored, grouped by discipline.");

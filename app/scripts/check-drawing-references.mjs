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
assert.deepEqual(R.findDrawingReferences(sheets, { codes: [], phrases: [], disciplines: () => true }), []);

// 28 Oct, Project 1: each trade on the sheets of the disciplines that carry it, and never an abbreviation list's entry.
const demo = R.packageTerms({ code: "02 41 19", name: "Demolition" }, [{ section: "02 41 19", title: "Selective Demolition" }]);
const project = [
  { docId: "d", page: 3, sheet: "G0.2", title: "Abbreviations", discipline: "General", text: "DEMO DEMOLISH OR DEMOLITION\n" },
  { docId: "d", page: 8, sheet: "CIV0102", title: "Demolition plan", discipline: "Civil", text: "DEMOLITION KEYNOTES:\nDEMO DEMOLISH OR DEMOLITION\n1 EXISTING BUILDING TO BE REMOVED. SEE ARCHITECTURAL DEMOLITION\n" },
  { docId: "d", page: 150, sheet: "ED1.1", title: "Electrical demolition site plan", discipline: "Electrical", text: "GENERAL DEMOLITION NOTES\nELECTRICAL CONTRACTOR TO DISCONNECT\n" },
  { docId: "d", page: 9, sheet: "A1.1", title: "Floor plan", discipline: "Architectural", text: "ELECTRICAL PANEL BY OTHERS\n" },
];
assert.deepEqual(R.findDrawingReferences(project, demo).map(r => [r.sheet, r.lines]), [["CIV0102", ["DEMOLITION KEYNOTES:", "1 EXISTING BUILDING TO BE REMOVED. SEE ARCHITECTURAL DEMOLITION"]]],
  "The civil keynotes; not the abbreviation list, nor the electrician's own demolition notes");
const electrical = R.packageTerms({ code: "26 51 00", name: "Electrical" }, [{ section: "26 05 19", title: "Low-Voltage Electrical Power Conductors and Cables" }]);
assert.deepEqual(R.findDrawingReferences(project, electrical).map(r => r.sheet), ["ED1.1"], "The electrician on its own sheets; an architectural note naming electrical work is not its sheet");
assert(R.tradeDisciplines("26 51 00")("Electrical") && !R.tradeDisciplines("26 51 00")("Architectural") && R.tradeDisciplines("09 30 13")("Aquatics") && !R.tradeDisciplines("09 30 13")("Plumbing") && !R.tradeDisciplines("07 54 23")("General"));
const many = R.findDrawingReferences([{ ...sheets[0], text: Array.from({ length: 40 }, (_, i) => `CONCRETE PAD ${i}`).join("\n") }], concrete);
assert.equal(many[0].lines.length, 20, "At most 20 lines from one sheet");

console.log("Drawing references checked: CSI numbers however printed, section titles as whole words, callouts joined to their number, generic words and abbreviation lists ignored, each trade on its own disciplines, grouped by discipline.");

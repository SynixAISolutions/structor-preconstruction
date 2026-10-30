import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/scope-evidence.ts");
const T = await import("../lib/text-anchor.ts");

// Where a bid-form item came from, so a click lands on the words (27 Oct, after the app Marcel showed).
const doc = (id, name, kind, extra = {}) => ({ id, projectId: "p", name, category: kind, kind, series: id, revision: 1, size: 1, pageCount: 500, uploadedAt: `2026-10-0${id.length}T00:00:00Z`, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 5, sheets: [], sections: [], ...extra });
const manual = doc("man", "Project manual.pdf", "manual", { sections: [{ section: "02 41 19", title: "Selective demolition", first: 120, last: 126 }, { section: "09 29 00", title: "Gypsum board", first: 440, last: 446 }] });
const manual2 = { ...manual, id: "man2", revision: 2 };
const drawings = doc("dwg", "Drawing set.pdf", "drawings", { sheets: [{ page: 12, sheet: "CIV0102", title: "Demolition plan", date: "" }, { page: 46, sheet: "A1.1", title: "First floor plan", date: "" }] });
const documents = [manual, manual2, drawings];

const extraction = { runs: [], drafts: [
  { kind: "scope", id: "d1", acceptedId: "s-ai", citations: [
    { document: "Project manual.pdf", page: 441, sheet: null, quote: "Level 4: At panel surfaces exposed to view." },
    { document: "Drawing set.pdf", page: 46, sheet: "A1.1", quote: "GYP BD TYPE X", verification: "image" },
    { document: "Project manual.pdf", page: 441, sheet: null, quote: "Level 4: At panel surfaces exposed to view." },
    { document: "Project manual.pdf", page: 441, sheet: null, quote: "Level 5: Where indicated." },
  ] },
  { kind: "scope", id: "d2", acceptedId: null, citations: [{ document: "Project manual.pdf", page: 9, sheet: null, quote: "Pending, not in a bid form" }] },
] };
const flip = { pages: [{ id: "pg", sheet: "CIV0102", documentId: "sample-set", documentName: "Old set.pdf", pageNumber: 3 }], regions: [
  { id: "r1", number: "R-001", pageId: "pg", scopeIds: ["s-region"], polygon: [{ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.3 }, { x: 0.3, y: 0.4 }] },
] };
const of = (id, source) => S.scopeEvidence({ id, source }, { extraction, flip }, documents);

// 1. What the AI read: one source per page with every quote on it (each once), in the latest revision of the file it names.
const ai = of("s-ai", "09 29 00 · §3.6");
assert.deepEqual(ai.map(e => [e.kind, e.label, e.page, e.quotes, e.fromImage]), [["quote", "Manual p. 441", 441, ["Level 4: At panel surfaces exposed to view.", "Level 5: Where indicated."], false], ["quote", "A1.1 · p. 46", 46, ["GYP BD TYPE X"], true]], "Words the AI read off a sheet image are marked for OCR");
assert.equal(ai[0].doc.id, "man2", "The newest revision of the manual");
assert.equal(ai[1].doc.id, "dwg");
assert.equal(of("s-ai", "").length, 2, "The AI's quotes don't depend on the typed reference");

// An AI proposal not yet in a bid form opens the same way, from its own citations (28 Oct: "Open drawing" on every item).
const pending = S.citationEvidence(extraction.drafts[0].citations, documents);
assert.deepEqual(pending.map(e => [e.label, e.quotes.length]), ai.map(e => [e.label, e.quotes.length]), "A proposal's sources are the ones its item will have");
assert.deepEqual(ai.map(S.onDrawing), [false, true], "The sheet is the drawing; the manual page is the spec");

// 2. A Drawing Flip region: its outline on the stored sheet with that number.
const [region] = of("s-region", "CIV0102 · Keynote 1");
assert.deepEqual([region.kind, region.label, region.doc.id, region.page, region.quotes], ["region", "CIV0102 · Keynote 1", "dwg", 12, []]);
assert.equal(region.outline.length, 3);

// 3. The typed reference: a section opens the manual at its first page and looks for the paragraph; a sheet opens the sheet.
const [section] = of("s-spec", "02 41 19 · §3.2");
assert.deepEqual([section.kind, section.doc.id, section.page, section.paragraph], ["section", "man2", 120, { label: "3.2", pages: { first: 120, last: 126 } }]);
assert.equal(of("s-spec", "02 41 19")[0].paragraph, null, "A whole section: its first page");
const [sheet] = of("s-sheet", "A1.1 · Partition schedule");
assert.deepEqual([sheet.kind, sheet.doc.id, sheet.page], ["sheet", "dwg", 46]);
assert.deepEqual([region, sheet, section].map(S.onDrawing), [true, true, false], "Regions and sheets open with Open drawing, a section with Open spec");
assert.deepEqual(of("s-x", "Owner's program"), [], "Nothing the project can open");
assert.deepEqual(of("s-x", ""), []);

// Files that aren't in Project files are still named, so the viewer can say what to upload.
const missing = S.scopeEvidence({ id: "s-ai", source: "" }, { extraction, flip }, []);
assert.deepEqual(missing.map(e => [e.doc, e.missing, e.documentName]), [[null, "file", "Project manual.pdf"], [null, "file", "Drawing set.pdf"]]);
assert.deepEqual(["doc", "missing"].map(k => S.scopeEvidence({ id: "s-spec", source: "02 41 19 · §3.2" }, { extraction, flip }, [])[0][k]), [null, "file"]);
// The manual is stored but doesn't hold the section the item names (the sample's 02 41 19; the real manual has 02 41 16).
const absent = of("s-spec", "02 41 16 · §3.1")[0];
assert.deepEqual([absent.doc, absent.missing, absent.documentName], [null, "section", "Project manual.pdf"], "Said as a missing section, not a missing file");
assert.equal(section.missing, null);
const other = (document) => S.scopeEvidence({ id: "s-o", source: "" }, { extraction: { runs: [], drafts: [{ kind: "scope", acceptedId: "s-o", citations: [{ document, page: 7, sheet: null, quote: "x" }] }] }, flip }, [])[0].label;
assert.equal(other("Geotechnical report.pdf"), "Geotechnical report p. 7", "Any other file goes by its name");
assert.equal(other("Hazardous materials survey and abatement report.pdf"), "Hazardous materials survey… p. 7", "A long name is shortened");

// A paragraph's page and opening words, not a longer number that starts the same.
const pages = [
  { page: 121, text: "SECTION 02 41 19\nPART 3 - EXECUTION\n3.21 CLEANING\nRemove debris.\n" },
  { page: 122, text: "3.1 EXAMINATION\nVerify conditions.\n3.2PREPARATION OF THE WORK AREA AND TEMPORARY PROTECTION\nA. Provide dust-control partitions.\n" },
];
assert.deepEqual(S.findParagraph(pages, "§3.2"), { page: 122, quote: "3.2 PREPARATION OF THE WORK AREA AND TEMPORARY PROTECTION" });
assert.deepEqual(S.findParagraph(pages, "3.1"), { page: 122, quote: "3.1 EXAMINATION" });
assert.equal(S.findParagraph(pages, "3.4"), null);
assert.equal(S.findParagraph(pages, "Part 3"), null, "Only numbered paragraphs");

// The words are found however the PDF split them: pieces of words, and missing or doubled spaces.
const box = (str, x, y, w = 0.1, h = 0.012) => ({ str, x, y, w, h });
const split = [box("3.2", 0.1, 0.30, 0.03), box("PREPAR", 0.14, 0.30, 0.07), box("ATION OF THE", 0.21, 0.30, 0.12), box("WORK  AREA", 0.34, 0.30, 0.1), box("A. Provide", 0.1, 0.33)];
const marks = T.findOnSheet(split, "3.2 PREPARATION OF THE WORK AREA");
assert.equal(marks.length, 1);
assert(marks[0].x < 0.1 && marks[0].x + marks[0].width > 0.43 && marks[0].y < 0.3 && marks[0].height < 0.03, "One mark over the heading's line");

console.log("Scope evidence checked: the AI's quotes (latest file, once each), Drawing Flip outlines, typed section and sheet references, missing files named, paragraphs located, split words found.");

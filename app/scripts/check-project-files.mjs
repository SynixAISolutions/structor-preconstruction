import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const F = await import("../lib/project-files.ts");
const P = await import("../lib/project-scopes.ts");

// Sheet numbers compare the way people write them.
assert.equal(F.sheetKey("A-101"), F.sheetKey("a101"));
assert.equal(F.sheetKey("A 10.1"), "A10.1");
assert.notEqual(F.sheetKey("A1.1"), F.sheetKey("A11"), "A1.1 and A11 are different sheets");

const doc = (id, series, revision, extra = {}) => ({ id, projectId: "p1", name: `${id}.pdf`, category: "Drawings", kind: "drawings", series, revision, size: 10, pageCount: 3, uploadedAt: "2026-10-16T00:00:00Z", sourcePath: F.sourcePath("p1", id), sourceUrl: `https://abc.private.blob.vercel-storage.com/${F.sourcePath("p1", id)}`, textChunk: 100, textChunks: 1, sheets: [], sections: [], ...extra });
const v1 = doc("set1", "set1", 1, { sheets: [{ page: 2, sheet: "A1.1", title: "Plan", date: "" }] });
const v2 = doc("set2", "set1", 2, { sheets: [{ page: 3, sheet: "A1.1", title: "Plan rev", date: "" }] });
const manualSmall = doc("m1", "m1", 1, { kind: "manual", category: "Specifications", pageCount: 40, sections: [{ section: "09 29 00", title: "Gypsum board", first: 10, last: 12 }] });
const manualBig = doc("m2", "m2", 1, { kind: "manual", category: "Specifications", pageCount: 900, sections: [{ section: "09 29 00", title: "Gypsum board", first: 400, last: 412 }] });
assert.deepEqual(F.latestDocuments([v1, v2, manualSmall]).map(d => d.id), ["set2", "m1"], "Newest revision per document");
assert.deepEqual(F.revisionsOf([v2, v1], "set1").map(d => d.revision), [1, 2]);
assert.deepEqual([F.findSheet([v1, v2], "a-1.1")?.doc.id, F.findSheet([v1, v2], "A1.1")?.sheet.page], ["set2", 3], "A sheet opens on its newest revision");
assert.equal(F.findSheet([v1], "A9.9"), null);
assert.equal(F.findManual([manualSmall, manualBig]).id, "m2", "The project manual is the largest specification PDF");
assert.deepEqual(F.findSection([manualSmall, manualBig], "092900")?.section.first, 400);
assert.equal(F.chunkFor(1), 0); assert.equal(F.chunkFor(100), 0); assert.equal(F.chunkFor(101), 1);

// A browser can only register a file that is in this project's own folder of the store.
assert.equal(F.parseDocument(v1, "p1").id, "set1");
assert.throws(() => F.parseDocument({ ...v1, sourcePath: F.sourcePath("p2", "set1") }, "p1"), /this project's folder/);
assert.throws(() => F.parseDocument({ ...v1, sourceUrl: "https://evil.example.com/project-files/p1/set1/source.pdf" }, "p1"), /Unknown stored file/);
assert.throws(() => F.parseDocument({ ...v1, id: "../x" }, "p1"), /id and series/);
assert.throws(() => F.parseDocument({ ...v1, size: 0 }, "p1"), /incomplete/);
assert.equal(F.validId("jrc-drawings-251209"), true); assert.equal(F.validId("a/b"), false);
const index = F.upsertDocument(F.upsertDocument(F.emptyIndex("p1"), v1), { ...v1, name: "renamed.pdf" });
assert.deepEqual(index.documents.map(d => d.name), ["renamed.pdf"], "Re-registering replaces, never duplicates");

// Sections go to the trade of their division; shared divisions go to the closest code; 00/01 stay general.
const trades = [{ id: "drywall", division: "09", code: "09 29 00" }, { id: "flooring", division: "09", code: "09 65 19" }, { id: "concrete", division: "03", code: "03 30 00" }];
const s = (section) => ({ section, title: section, first: 1, last: 2 });
const by = P.sectionsByTrade([s("01 10 00"), s("03 30 00"), s("03 35 43"), s("09 22 16"), s("09 51 13"), s("09 65 13"), s("09 68 13"), s("23 05 00")], trades);
assert.deepEqual(Object.fromEntries([...by].map(([k, v]) => [k, v.map(x => x.section)])), { drywall: ["09 22 16", "09 51 13"], flooring: ["09 65 13", "09 68 13"], concrete: ["03 30 00", "03 35 43"] });
assert.deepEqual(P.uncoveredSections([s("01 10 00"), s("23 05 00"), s("09 29 00")], trades).map(x => x.section), ["23 05 00"], "Mechanical has no trade here; Division 01 is the General section");

// List of drawings and Exhibit B come from the newest stored documents.
assert.deepEqual(["CIV0102", "CP0.1", "A10.4", "AQ2.1", "AD1.1", "FP0.1", "P2.1", "TE0.1", "G0.1", "K-101"].map(F.disciplineOf), ["Civil", "Code", "Architectural", "Aquatics", "Architectural demolition", "Fire protection", "Plumbing", "Technology", "General", "Food service"]);
const named = doc("set3", "set1", 3, { sheets: [{ page: 1, sheet: "A1.1", title: "Plan", date: "12-09-2025" }, { page: 2, sheet: "", title: "", date: "" }] });
assert.deepEqual(F.drawingRegister([v1, v2, named]).map(r => [r.sheet, r.page, r.revisions, r.doc.id]), [["A1.1", 1, 3, "set3"]], "Only the newest issue, only named sheets");

// Drawing log (Marcel, 22-23 Oct): each upload is a set; a sheet number's newest upload is current and
// sheets a set leaves out stay current, whether the set came as a new file or as a revision of one.
const sh = (page, sheet, title = sheet) => ({ page, sheet, title, date: "" });
const permit = doc("permit", "permit", 1, { name: "Permit set.pdf", pageCount: 5, uploadedAt: "2026-02-23T00:00:00Z", sheets: [sh(1, "A-000"), sh(2, "A-001"), sh(3, "A-101"), sh(4, "M-101"), sh(5, "")] });
const asi = doc("asi01", "asi01", 1, { name: "ASI 01.pdf", pageCount: 4, uploadedAt: "2026-06-14T00:00:00Z", sheets: [sh(1, "A001", "Partition types"), sh(2, "A-101"), sh(3, "A-102"), sh(4, "a-101")] });
const mech = doc("permit-r2", "permit", 2, { name: "Permit set mech.pdf", pageCount: 1, uploadedAt: "2026-07-10T00:00:00Z", sheets: [sh(1, "M-101")] });
const dlog = F.drawingLog([mech, asi, permit, manualBig]);
assert.deepEqual(dlog.sheets.map(s => [s.sheet, s.current.version, s.current.doc.id, s.versions.length]), [["A-000", 1, "permit", 1], ["A001", 2, "asi01", 2], ["A-101", 2, "asi01", 2], ["M-101", 2, "permit-r2", 2], ["A-102", 1, "asi01", 1]], "Upload order, not array order; a partial revision of the permit set keeps its other sheets current");
assert.equal(dlog.sheets.find(s => s.key === F.sheetKey("A-001")).title, "Partition types");
assert.deepEqual(dlog.sets.map(s => [s.doc.id, s.added, s.revised, s.unnamed, s.repeated, s.current]), [["permit", ["A-000", "A-001", "A-101", "M-101"], [], [5], [], 1], ["asi01", ["A-102"], ["A001", "A-101"], [], ["a-101"], 3], ["permit-r2", [], ["M-101"], [], [], 1]]);
assert.deepEqual(F.drawingRegister([permit, asi, mech]).map(r => [r.sheet, r.doc.id, r.page, r.revisions]), [["A-000", "permit", 1, 1], ["A001", "asi01", 1, 2], ["A-101", "asi01", 2, 2], ["M-101", "permit-r2", 1, 2], ["A-102", "asi01", 3, 1]], "List of drawings: every current sheet, none lost to a partial set");
assert.deepEqual([F.findSheet([permit, asi, mech], "a-000")?.doc.id, F.findSheet([permit, asi, mech], "A-001")?.sheet.page], ["permit", 1]);
assert.deepEqual((({ current, version }) => [current, version.version])(F.sheetAt(dlog, "permit", 2)), [false, 1], "An older page says it is superseded");
assert.deepEqual((({ current, sheet }) => [current, sheet.sheet])(F.sheetAt(dlog, "asi01", 1)), [true, "A001"]);
assert.equal(F.sheetAt(dlog, "permit", 5), null, "An unnamed page is in no sheet");
const named5 = F.withSheetNumbers(permit, [{ page: 5, sheet: "E-101", title: "Lighting" }]);
assert.deepEqual(F.drawingLog([named5, asi, mech]).sets[0].added, ["A-000", "A-001", "A-101", "M-101", "E-101"], "Naming an unread page adds its sheet");
assert.throws(() => F.withSheetNumbers(permit, [{ page: 9, sheet: "E-1" }]), /no page 9/);
assert.throws(() => F.withSheetNumbers(permit, [{ page: 5, sheet: " " }]), /sheet number/);
assert.throws(() => F.withSheetNumbers(permit, [{ page: 5, sheet: "a101" }]), /Page 3 .* already sheet A-101/);
assert.deepEqual(F.withSheetNumbers(asi, [{ page: 3, sheet: "A-103" }]).sheets.map(s => s.sheet), ["A001", "A-101", "A-103", "a-101"], "Fixing one page ignores repeats elsewhere");
assert.throws(() => F.withSheetNumbers(manualBig, [{ page: 1, sheet: "A-1" }]), /drawing sets/);
const report = doc("geo", "geo", 1, { kind: "other", category: "Reports", name: "Geotech.pdf" });
const exhibit = F.exhibitBRows([named, manualBig, report]);
assert.deepEqual(exhibit[0], ["Part", "Number", "Title", "Date", "Document"]);
assert.deepEqual(exhibit.slice(1).map(r => [r[0], r[1]]), [["Documents", ""], ["Drawings", "A1.1"], ["Specifications", "09 29 00"]]);
assert.ok(exhibit[2][4].includes("V3") && exhibit[2][3] === "12-09-2025", "Each drawing carries its date and revision");

// Revision overlay: removed linework red, added blue, unchanged grey, paper white.
const { overlayPixels, OVERLAY_COLORS } = await import("../lib/revision-overlay.ts");
const px = (...rgb) => new Uint8ClampedArray(rgb.flatMap(v => [v, v, v, 255]));
const out = new Uint8ClampedArray(16);
assert.deepEqual(overlayPixels(px(0, 0, 255, 255), px(0, 255, 0, 255), out), { removed: 1, added: 1 });
assert.deepEqual([...out.slice(0, 3)], [...OVERLAY_COLORS.both], "Ink in both");
assert.deepEqual([...out.slice(4, 7)], [...OVERLAY_COLORS.removed], "Ink only before: removed");
assert.deepEqual([...out.slice(8, 11)], [...OVERLAY_COLORS.added], "Ink only after: added");
assert.deepEqual([...out.slice(12, 15)], [255, 255, 255], "Paper stays white");
assert.throws(() => overlayPixels(px(0), px(0, 0), new Uint8ClampedArray(8)), /same size/);
// Change boxes: two separate clusters on a 100×100 overlay, the bigger one first; noise ignored.
const { changeBoxes } = await import("../lib/revision-overlay.ts");
const sheet = new Uint8ClampedArray(100 * 100 * 4).fill(255);
const paint = (x0, y0, x1, y1, color) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sheet.set([...color, 255], (y * 100 + x) * 4); };
paint(10, 10, 30, 30, OVERLAY_COLORS.added); paint(70, 70, 80, 80, OVERLAY_COLORS.removed); paint(50, 5, 51, 6, OVERLAY_COLORS.added);
const boxes = changeBoxes(sheet, 100, 100, 10, 20);
assert.equal(boxes.length, 2, "A single stray pixel is not a change");
assert.deepEqual([boxes[0].x, boxes[0].y, boxes[0].width, boxes[0].height], [0.1, 0.1, 0.2, 0.2]);
assert.deepEqual([boxes[1].x, boxes[1].y], [0.7, 0.7]);
assert.ok(boxes[0].pixels > boxes[1].pixels);

// New AI jobs: inputs validated, outputs screened before anything uses them.
// Drawing sheets per trade, by title keywords for its CSI code, most telling first, capped.
const reg = ["CIV0102 Demolition Plan", "ED1.1 ELECTRICAL DEMOLITION SITE PLAN", "A1.1 LEVEL 01 - FIRST FLOOR PLAN", "A3.1 LEVEL 01 - REFLECTED CEILING PLAN", "A8.1 PARTITION TYPES", "A8.2 DOOR & FRAME TYPE & SCHEDULE", "AQ2.1 POOL COMPOSITE PIPING PLAN", "M001 MECHANICAL SYMBOLS, ABBREVIATIONS & NOTES", "M101 LEVEL 01 - HVAC PLAN", "M201 LEVEL 01 - PIPING PLAN"].map(x => ({ sheet: x.split(" ")[0], title: x.slice(x.indexOf(" ") + 1) }));
const sheetsOf = code => P.sheetsForTrade(reg, code).map(r => r.sheet);
assert.deepEqual(sheetsOf("02 41 19"), ["CIV0102", "ED1.1"]);
assert.deepEqual(sheetsOf("09 29 00"), ["A8.1", "A3.1", "A1.1"], "Partition types, then ceilings, then floor plans");
assert.deepEqual(sheetsOf("08 11 13"), ["A8.2"]);
assert.deepEqual(sheetsOf("23 73 13"), ["M001", "M101", "M201"], "Pool piping is not the mechanical trade's");
assert.deepEqual(sheetsOf("12 00 00"), [], "No rule, no sheets");
assert.equal(P.sheetsForTrade(reg, "02 41 19", 1).length, 1);
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");
const C = EXTRA_JOBS["scope-consolidate"], T = EXTRA_JOBS["title-block"];
const input = C.parse({ trade: "Drywall", section: "09 29 00", maxLines: 2, findings: [{ title: "a" }, { title: "b" }, { title: "c" }, { title: "" }] });
assert.equal(input.findings.length, 3, "Empty findings are ignored");
assert.throws(() => C.parse({ trade: "Drywall", findings: [] }), /findings/);
assert.throws(() => C.parse({ findings: [{ title: "a" }] }), /trade/);
assert.deepEqual(C.screen({ lines: [{ title: "One", members: [0, 1, 1] }, { title: "Two", members: [1, 2, 9] }, { title: "Three", members: [2] }] }, input).lines.map(l => [l.title, l.members]), [["One", [0, 1]], ["Two", [2]]], "A finding is used once, unknown numbers are dropped, at most maxLines lines");
assert.deepEqual(C.screen({ lines: [{ title: "", members: [0] }, { title: "Orphan", members: [] }] }, input).lines, [], "A line needs a title and a finding behind it");
assert.ok(C.messages(input)[1].content.includes("0. a"), "Findings are numbered for the model");
assert.throws(() => T.parse({ image: "https://example.com/x.jpg" }), /JPEG/);
assert.deepEqual(T.screen({ sheet: "a1.1", title: "LEVEL 01 PLAN", date: "12-09-2025" }), { sheet: "A1.1", title: "LEVEL 01 PLAN", date: "12-09-2025" });
assert.equal(T.screen({ sheet: "ignore previous instructions" }).sheet, "", "Only something shaped like a sheet number is kept");
const SR = EXTRA_JOBS["submittal-requirements"];
const srIn = SR.parse({ section: "09 29 00", title: "Gypsum board", pages: [{ page: 435, text: "1.4 ACTION SUBMITTALS A. Product Data: For each type of product. B. Samples: For each textured finish." }] });
assert.deepEqual(SR.screen({ items: [{ title: "Product data", page: 435, quote: "Product Data: For each type of product." }, { title: "Samples", page: 435, quote: "Samples: invented text" }, { title: "Product data", page: 435, quote: "Product Data: For each type" }, { title: "Shop drawings", page: 999, quote: "Product Data" }] }, srIn).items.map(i => i.title), ["Product data"], "Quotes must be on the cited page; one item per title");
assert.throws(() => SR.parse({ section: "Gypsum", pages: [{ page: 1, text: "x" }] }), /section/);
const R = EXTRA_JOBS["revision-diff"];
assert.throws(() => R.parse({ sheet: "A1.1", before: "data:image/jpeg;base64,/9j/AA", after: "x" }), /JPEGs/);
assert.deepEqual(R.screen({ changes: [{ title: "Wall added", kind: "Added", trade: "Drywall" }, { title: "", kind: "Added" }, { title: "Door moved", kind: "Teleported" }] }).changes.map(c => [c.title, c.kind]), [["Wall added", "Added"], ["Door moved", "Revised"]], "Untitled changes dropped; unknown kinds become Revised");

const SS = EXTRA_JOBS["schedule-suggest"];
const ssIn = SS.parse({ project: { name: "Jelleff", squareFeet: 26500, workType: "both" }, start: "2026-11-02", packages: [{ id: "concrete", code: "03", name: "Concrete" }, { id: "", name: "x" }], drawings: ["A1.1 Level 01 plan"], specs: ["09 29 00 Gypsum board"] });
assert.equal(ssIn.packages.length, 1);
assert.throws(() => SS.parse({ project: { name: "J" }, start: "next week" }), /start date/);
assert.match(SS.messages(ssIn)[1].content, /A1.1 Level 01 plan/);
const ssOut = SS.screen({ summary: "s", activities: [
  { code: "A1000", name: "NTP", duration: 0, after: [] },
  { code: "a1010", name: "Footings", packageId: "concrete", duration: 20, after: [{ code: "a1000", type: "ss", lag: 2 }] },
  { code: "A1010", name: "Duplicate code", packageId: "roofing", duration: 5, after: [{ code: "A1000", type: "XX" }] },
  { code: "A1030", name: "Too long", duration: 900 },
  { code: "A1040", name: "", duration: 3 },
] }, ssIn);
assert.deepEqual(ssOut.activities.map(a => [a.code, a.packageId, a.duration, a.after.map(l => `${l.code} ${l.type}${l.lag}`).join()]), [["A1000", null, 0, ""], ["A1010", "concrete", 20, "A1000 SS2"], ["X9002", null, 5, "A1000 FS0"]], "Codes upper-cased and unique, unknown packages and link types normalised, impossible rows dropped");
assert.throws(() => SS.screen({ activities: [] }, ssIn), /no usable schedule/);
// Trade suggestions for a new project: from the manual (same mapping as Write scopes) and from drawings alone.
const sec = code => ({ section: code, title: code, first: 1, last: 2 });
const fromManual = P.suggestTrades([], { sections: ["01 10 00", "02 41 16", "03 30 00", "09 22 16", "09 30 13", "09 51 13", "09 91 23", "23 05 00", "25 00 00"].map(sec), sheets: [] });
assert.deepEqual(fromManual.map(t => [t.id, t.sections.join()]), [["demolition", "02 41 16"], ["concrete", "03 30 00"], ["drywall", "09 22 16,09 51 13"], ["flooring", "09 30 13"], ["painting", "09 91 23"], ["mechanical", "23 05 00"]], "Ceilings go with drywall, tile with flooring; Division 01 and trades without a standard package are not suggested");
const drawingsOnly = [
  { sheet: "C1.0", title: "Demolition Plan", discipline: "Civil" }, { sheet: "C2.0", title: "Grading Plan", discipline: "Civil" },
  { sheet: "A1.1", title: "LEVEL 01 - FIRST FLOOR PLAN", discipline: "Architectural" }, { sheet: "A8.1", title: "PARTITION TYPES", discipline: "Architectural" },
  { sheet: "A4.1", title: "EXTERIOR ELEVATIONS", discipline: "Architectural" }, { sheet: "M1.1", title: "LEVEL 1 DUCTWORK", discipline: "Mechanical" },
  { sheet: "E1.1", title: "LEVEL 1 LIGHTING", discipline: "Electrical" },
];
assert.deepEqual(P.suggestTrades([], { sections: [], sheets: drawingsOnly }).map(t => [t.id, t.sheets.join()]), [["demolition", "C1.0"], ["drywall", "A8.1"], ["mechanical", "M1.1"], ["electrical", "E1.1"], ["earthwork", "C2.0"]].sort((a, b) => P.suggestTrades([], { sections: [], sheets: drawingsOnly }).findIndex(t => t.id === a[0]) - P.suggestTrades([], { sections: [], sheets: drawingsOnly }).findIndex(t => t.id === b[0])), "Drawings alone suggest trades by their most telling title or discipline; elevations alone don't make a masonry trade");
assert.deepEqual(P.suggestTrades([{ id: "drywall", name: "Drywall" }, { id: "x", name: "MECHANICAL" }], { sections: [], sheets: drawingsOnly }).map(t => t.id), ["demolition", "electrical", "earthwork"], "Trades the project has are skipped, by id or name");
assert.deepEqual(P.sheetsForTrade(drawingsOnly, "23 00 00").map(r => r.sheet), ["M1.1"], "A discipline fills in when no title matches");

// RFP: page picking, value shapes, quote-on-page screening, applying accepted facts.
const RFP = await import("../lib/rfp.ts");
const rfpDoc = [{ page: 1, text: "Invitation to Bid" }, { page: 2, text: "" }, { page: 3, text: "Scope" }, { page: 4, text: "General" }, { page: 5, text: "Proposals are due February 2, 2026 at 2:00 PM. The building is 26,500 SF." }, { page: 6, text: "Boilerplate" }];
assert.deepEqual(RFP.rfpPages(rfpDoc).map(p => p.page), [1, 3, 4, 5], "First three pages with text, then pages naming dates, areas or money");
assert.equal(RFP.normalizeFact("due", "February 2, 2026"), "2026-02-02");
assert.equal(RFP.normalizeFact("due", "2026-02-30"), null);
assert.equal(RFP.normalizeFact("squareFeet", "26,500 SF"), 26500);
assert.equal(RFP.normalizeFact("value", "$33,328,991"), 33328991);
assert.equal(RFP.normalizeFact("taxStatus", "Tax exempt"), "non-taxable");
assert.equal(RFP.normalizeFact("workType", "New construction"), "new");
assert.deepEqual(RFP.normalizeFact("certifications", "cbe, First Source; LSDBE"), ["CBE", "First Source", "LSDBE"]);
const RF = EXTRA_JOBS["rfp-facts"];
const rfIn = RF.parse({ pages: rfpDoc });
assert.equal(rfIn.pages.length, 5, "Empty pages are not sent");
assert.throws(() => RF.parse({ pages: [] }), /RFP's pages/);
const rfOut = RF.screen({ facts: [
  { field: "due", value: "February 2, 2026", page: 5, quote: "Proposals are due February 2, 2026 at 2:00 PM" },
  { field: "due", value: "2026-03-01", page: 5, quote: "Proposals are due February 2, 2026" },
  { field: "squareFeet", value: "26500", page: 5, quote: "The building is 26,500 SF" },
  { field: "architect", value: "DLR Group", page: 1, quote: "Architect: DLR Group" },
  { field: "owner", value: "DGS", page: 1, quote: "Invitation to Bid" },
  { field: "value", value: "unknown", page: 5, quote: "The building is 26,500 SF" },
] }, rfIn).facts;
assert.deepEqual(rfOut.map(f => [f.field, f.value]), [["due", "2026-02-02"], ["squareFeet", 26500]], "One fact per field, quote on its page, known field, right shape");
const { sampleProjectRecords } = await import("../lib/projects.ts");
const updated = RFP.applyRfpFacts(sampleProjectRecords[0], [{ field: "due", value: "2026-03-01", page: 5, quote: "q" }, { field: "workType", value: "both", page: 1, quote: "q" }, { field: "renovationSquareFeet", value: 8000, page: 1, quote: "q" }, { field: "additionSquareFeet", value: 18500, page: 1, quote: "q" }]);
assert.equal(updated.due, "2026-03-01");
assert.equal(updated.squareFeet, 26500, "Renovation + addition make the total, as in the project form");
assert.equal(updated.id, sampleProjectRecords[0].id);

console.log("Project files checked: sheet keys, revisions, drawing log (sets, sheet versions, partial sets, naming pages), sheet/manual/section lookup, stored-file validation, index upsert, sections by trade.");

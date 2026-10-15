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
const report = doc("geo", "geo", 1, { kind: "other", category: "Reports", name: "Geotech.pdf" });
const exhibit = F.exhibitBRows([named, manualBig, report]);
assert.deepEqual(exhibit[0], ["Part", "Number", "Title", "Date", "Document"]);
assert.deepEqual(exhibit.slice(1).map(r => [r[0], r[1]]), [["Documents", ""], ["Drawings", "A1.1"], ["Specifications", "09 29 00"]]);
assert.ok(exhibit[2][4].includes("V3") && exhibit[2][3] === "12-09-2025", "Each drawing carries its date and revision");

// New AI jobs: inputs validated, outputs screened before anything uses them.
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

console.log("Project files checked: sheet keys, revisions, sheet/manual/section lookup, stored-file validation, index upsert, sections by trade.");

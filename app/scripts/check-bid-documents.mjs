import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const B = await import("../lib/bid-documents.ts");

// The bid documents (28 Oct: "I upload 2 drawings and 2 spec sheets ... have a separate section for that").
let day = 0;
const doc = (id, name, category, extra = {}) => ({
  id, projectId: "p", name, category, kind: category === "Drawings" ? "drawings" : category === "Specifications" ? "manual" : "other",
  series: id, revision: 1, size: 1, pageCount: 100, uploadedAt: `2026-10-${String(10 + day++).padStart(2, "0")}T00:00:00Z`,
  sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sheets: [], sections: [], ...extra,
});
const sheets = (...numbers) => numbers.map((sheet, i) => ({ page: i + 1, sheet, title: "", date: "" }));

// Uploaded "not stacked": Vol 2 of each first.
const dwg2 = doc("d2", "GMP Set Vol 2.pdf", "Drawings", { sheets: sheets("M1.1", "E1.1", "") });
const dwg1 = doc("d1", "GMP Set Vol 1.pdf", "Drawings", { sheets: sheets("A1.1", "A12.1", "A12.3") });
const spec2 = doc("s2", "Project manual Vol 2.pdf", "Specifications", { sections: [{ section: "22 00 00", title: "Plumbing", first: 1, last: 9 }] });
const spec1 = doc("s1", "Project manual Vol 1.pdf", "Specifications", { sections: [{ section: "09 30 13", title: "Tile", first: 1, last: 8 }, { section: "09 91 23", title: "Painting", first: 9, last: 20 }] });
const report = doc("r", "Geotechnical report.pdf", "Reports");
const start = [dwg2, dwg1, spec2, spec1, report];

const first = B.bidDocuments(start);
assert.deepEqual(first.drawings.map(v => [v.doc.name, v.sheets, v.revisions]), [["GMP Set Vol 1.pdf", 3, 1], ["GMP Set Vol 2.pdf", 2, 1]], "Drawing volumes in volume order, counting their numbered sheets");
assert.deepEqual(first.manual.map(v => [v.doc.name, v.sections]), [["Project manual Vol 1.pdf", 2], ["Project manual Vol 2.pdf", 1]]);
assert.deepEqual(first.later, [], "Nothing issued later yet; a report is not a bid document");

// Later: an addendum that reissues two sheets, a new revision of a manual volume, and a narrative addendum.
const reissue = doc("a1", "Addendum 1 sheets.pdf", "Drawings", { sheets: sheets("A12.1", "A12.3") });
const spec1v2 = { ...doc("s1b", "Project manual Vol 1.pdf", "Specifications", { sections: spec1.sections }), series: "s1", revision: 2 };
const narrative = doc("a2", "Addendum 2.pdf", "Addenda");
const newVolume = doc("d3", "Civil set.pdf", "Drawings", { sheets: sheets("C1.1", "A1.1") });
const later = B.bidDocuments([...start, reissue, spec1v2, narrative, newVolume]);
assert.deepEqual(later.drawings.map(v => v.doc.name), ["Civil set.pdf", "GMP Set Vol 1.pdf", "GMP Set Vol 2.pdf"], "A set with new sheets is another volume, even with a reissued sheet in it");
assert.deepEqual(later.manual.map(v => [v.doc.id, v.revisions]), [["s1b", 2], ["s2", 1]], "A volume shows its current revision");
assert.deepEqual(later.later.map(l => [l.doc.name, l.what]), [
  ["Addendum 2.pdf", "Addendum"],
  ["Project manual Vol 1.pdf", "V2, replacing V1"],
  ["Addendum 1 sheets.pdf", "Reissued sheets: A12.1, A12.3"],
], "Newest first: an addendum, a volume's new revision, and a set that only reissues sheets");

// A revision of a reissue set stays one later issue, not a volume.
const reissueV2 = { ...doc("a1b", "Addendum 1 sheets.pdf", "Drawings", { sheets: sheets("A12.1") }), series: "a1", revision: 2 };
const again = B.bidDocuments([...start, reissue, reissueV2]);
assert.equal(again.drawings.length, 2);
assert.deepEqual(again.later.map(l => [l.doc.id, l.what]), [["a1b", "Reissued sheets: A12.1"]]);
assert.deepEqual(B.bidDocuments([]), { drawings: [], manual: [], later: [] });

console.log("Bid documents checked: drawing and manual volumes in order, reissued sheets, new revisions and addenda listed as later issues.");

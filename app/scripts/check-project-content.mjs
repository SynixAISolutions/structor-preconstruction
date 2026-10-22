import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/project-content.ts");

let n = 0;
const newId = () => `id${++n}`;
const run = (content, ...ops) => ops.reduce((c, op) => C.applyContentOp(c, op, "Marcel Khoury", "2026-10-22T12:00:00.000Z", newId), content);
const doc = (id, series, revision, name, category, uploadedAt, sheets = []) => ({ id, projectId: "p1", name, category, kind: category === "Drawings" ? "drawings" : "other", series, revision, size: 1000, pageCount: 3, uploadedAt, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sheets, sections: [] });
const docs = [
  doc("d1", "d1", 1, "Jelleff GMP drawings.pdf", "Drawings", "2026-10-01T00:00:00Z", [{ page: 46, sheet: "A1.1", title: "LEVEL 01 FLOOR PLAN", date: "" }]),
  doc("d2", "d1", 2, "Jelleff GMP drawings rev 1.pdf", "Drawings", "2026-10-10T00:00:00Z", [{ page: 46, sheet: "A1.1", title: "LEVEL 01 FLOOR PLAN", date: "" }]),
  doc("m1", "m1", 1, "Project manual.pdf", "Specifications", "2026-10-05T00:00:00Z"),
  doc("g1", "g1", 1, "Geotechnical report.pdf", "Reports", "2026-10-03T00:00:00Z"),
];

// Tags: unique names, edited and deleted (a deleted tag leaves every file).
let c = run(C.emptyContent("p1"), { op: "tag-add", name: "Drawings", color: "blue" }, { op: "tag-add", name: "Trade partner proposal", color: "purple" });
assert.deepEqual(c.tags.map(t => [t.id, t.name, t.color]), [["id1", "Drawings", "blue"], ["id2", "Trade partner proposal", "purple"]]);
assert.throws(() => run(c, { op: "tag-add", name: "drawings", color: "green" }), /already a tag named drawings/);
assert.throws(() => run(c, { op: "tag-add", name: "X", color: "red" }), /tag colors/);

// A file's tags, description and links belong to its series: set on revision 1, they show on revision 2.
c = run(c, { op: "file-edit", series: "d1", tags: ["id1", "id1"], description: "GMP set, permit issue" });
assert.deepEqual(C.fileMeta(c, "d1"), { tags: ["id1"], description: "GMP set, permit issue", links: [] });
assert.throws(() => run(c, { op: "file-edit", series: "d1", tags: ["gone"] }), /tags was deleted/);
c = run(c, { op: "link", target: { series: "g1" }, link: { kind: "package", id: "pkg-earthwork", label: "31 Earthwork" } }, { op: "link", target: { series: "g1" }, link: { kind: "package", id: "pkg-earthwork", label: "31 Earthwork" } });
assert.equal(C.fileMeta(c, "g1").links.length, 1, "Linking twice links once");
assert.throws(() => run(c, { op: "link", target: { series: "g1" }, link: { kind: "risk", id: "r1", label: "" } }), /issue, RFI, bid package/);

// Markups: a rectangle on one revision's page, with a title; edited, resolved, commented, linked, deleted.
assert.throws(() => run(c, { op: "markup-add", markup: { docId: "d2", page: 46, rect: [0.8, 0.1, 0.3, 0.1], title: "Off the page" } }), /on the page/);
assert.throws(() => run(c, { op: "markup-add", markup: { docId: "d2", page: 46, rect: [0.1, 0.1, 0.2, 0.1], title: " " } }), /Give the title/);
c = run(c,
  { op: "markup-add", markup: { docId: "d2", page: 46, rect: [0.4, 0.5, 0.2, 0.1], title: "Carpet R&R with polished concrete", assignedTo: "Brent Fowler" } },
  { op: "markup-add", markup: { docId: "d2", page: 46, rect: [0.1, 0.2, 0.1, 0.1], title: "Ceiling tile conflict" } },
  { op: "markup-add", markup: { docId: "d1", page: 12, rect: [0.1, 0.2, 0.1, 0.1], title: "Old revision note" } },
);
const carpet = c.markups.find(m => m.title.startsWith("Carpet"));
assert.deepEqual([carpet.status, carpet.color, carpet.createdBy, carpet.comments], ["open", "orange", "Marcel Khoury", []]);
c = run(c,
  { op: "markup-edit", id: carpet.id, status: "resolved", description: "Replace carpet in lieu of polished concrete" },
  { op: "comment-add", markupId: carpet.id, text: "Priced as a VE option" },
  { op: "link", target: { markupId: carpet.id }, link: { kind: "ve", id: "ve-7", label: "Polished concrete in high-traffic areas" } },
  { op: "link", target: { markupId: carpet.id }, link: { kind: "issue", id: "issue-3", label: "Ceiling tile conflict" } },
);
const edited = c.markups.find(m => m.id === carpet.id);
assert.deepEqual([edited.status, edited.description, edited.comments.map(x => [x.by, x.text]), edited.links.map(l => l.kind)], ["resolved", "Replace carpet in lieu of polished concrete", [["Marcel Khoury", "Priced as a VE option"]], ["ve", "issue"]]);
assert.throws(() => run(c, { op: "comment-add", markupId: "gone", text: "x" }), /markup was deleted/);

// The library: the latest revision of each file, newest first, with its series' tags and every record it supports.
const rows = C.contentRows(docs, c);
assert.deepEqual(rows.map(r => [r.doc.id, r.revisions, r.markups, r.links.map(l => l.kind).sort()]), [["d2", 2, 3, ["issue", "ve"]], ["m1", 1, 0, []], ["g1", 1, 0, ["package"]]]);
assert.deepEqual(rows[0].tags.map(t => t.name), ["Drawings"]);
assert.deepEqual(C.contentRows(docs, c, { source: "unlinked" }).map(r => r.doc.id), ["m1"]);
assert.deepEqual(C.contentRows(docs, c, { source: "package" }).map(r => r.doc.id), ["g1"]);
assert.deepEqual(C.contentRows(docs, c, { tag: "id1" }).map(r => r.doc.id), ["d2"]);
assert.deepEqual(C.contentRows(docs, c, { search: "a1.1 floor" }).map(r => r.doc.id), ["d2"], "Search reaches sheet numbers and titles");
assert.deepEqual(C.contentRows(docs, c, { search: "permit" }).map(r => r.doc.id), ["d2"], "and descriptions");
assert.deepEqual(C.contentRows(docs, c, { category: "Reports" }).map(r => r.doc.id), ["g1"]);
assert.deepEqual(C.sourceCounts(docs, c), { all: 3, unlinked: 1, issue: 1, rfi: 0, package: 1, clarification: 0, ve: 1 });

// The viewer's list: one revision's markups by page and position, searchable through comments too.
assert.deepEqual(C.docMarkups(c, "d2").map(m => m.title), ["Ceiling tile conflict", "Carpet R&R with polished concrete"]);
assert.deepEqual(C.docMarkups(c, "d2", "VE option").map(m => m.title), ["Carpet R&R with polished concrete"]);
assert.deepEqual(C.linkedTo(c, docs, "ve", "ve-7").markups.map(m => m.id), [carpet.id]);
assert.deepEqual(C.linkedTo(c, docs, "package", "pkg-earthwork").files.map(d => d.id), ["g1"]);

// Unlinking, deleting a markup, and deleting a tag in use.
c = run(c, { op: "unlink", target: { markupId: carpet.id }, kind: "issue", id: "issue-3" }, { op: "markup-delete", id: carpet.id }, { op: "tag-delete", id: "id1" });
assert.deepEqual([c.markups.length, C.fileMeta(c, "d1").tags, C.contentRows(docs, c)[0].links], [2, [], []]);

console.log("Content management checked: tags (unique, colors, delete clears files), file details and links by series, markups on the page (title, edit, resolve, comments, links), the library (latest revision, sources, tags, search of names, descriptions and sheets), the viewer's markup list, records' linked files.");

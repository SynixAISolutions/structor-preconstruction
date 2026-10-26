import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/project-content.ts");
const F = await import("../lib/project-folders.ts");
const P = await import("../lib/project-files.ts");

// Project files as a drive (Marcel, 24 Oct): four built-in folders, the team's own folders, files moved freely.
const at = "2026-10-26T10:00:00.000Z";
let n = 0;
const apply = (content, ...ops) => ops.reduce((c, op) => C.applyContentOp(c, op, "Marcel", at, () => `f${++n}`), content);
const fails = (fn, pattern) => assert.throws(fn, pattern);
const doc = (id, category, o = {}) => ({ id, projectId: "p", name: `${id}.pdf`, category, kind: P.kindForCategory(category), series: o.series ?? id, revision: o.revision ?? 1, size: 1, pageCount: 1, uploadedAt: at, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sheets: [], sections: [] });
const docs = [doc("arch", "Drawings"), doc("manual", "Specifications"), doc("geo", "Reports"), doc("itb", "RFP"), doc("a1", "Addenda"), doc("gmp", "Contracts"), doc("dd", "Budget"), doc("misc", "Other")];
const empty = C.emptyContent("p");

// The four folders Marcel listed, in his order, and where each type of file starts.
assert.deepEqual(F.SYSTEM_FOLDERS.map(f => f.name), ["Project Drawings", "Reports", "RFP", "Budget"]);
assert.deepEqual(docs.map(d => F.folderOf(empty, d)), ["drawings", "drawings", "reports", "rfp", "rfp", "rfp", "budget", F.ROOT]);
assert(P.DOCUMENT_CATEGORIES.includes("Budget"), "A budget can be uploaded");
assert.deepEqual(F.subfolders(empty, F.ROOT).map(f => f.id), ["drawings", "reports", "rfp", "budget"]);
assert.equal(F.filesIn(empty, docs, "rfp"), 3);
assert.deepEqual(C.normalizeContent({ projectId: "p", tags: [], files: {}, markups: [], updatedAt: "" }, "p").folders, [], "Content saved before folders has none");

// Make folders, anywhere: at the top, inside a built-in one, inside each other.
let c = apply(empty, { op: "folder-add", name: "Bid day", parent: F.ROOT }, { op: "folder-add", name: "Architectural", parent: "drawings" });
const [bidDay, arch] = c.folders;
c = apply(c, { op: "folder-add", name: "  Superseded  ", parent: arch.id });
const old = c.folders[2];
assert.deepEqual([old.name, old.parent], ["Superseded", arch.id], "Names are trimmed");
assert.deepEqual(F.folderPath(c, old.id).map(f => f.name), ["Project Drawings", "Architectural", "Superseded"]);
assert.deepEqual(F.subfolders(c, F.ROOT).map(f => f.name), ["Project Drawings", "Reports", "RFP", "Budget", "Bid day"], "Built-in first, then the team's");
fails(() => apply(c, { op: "folder-add", name: "bid DAY", parent: F.ROOT }), /already a folder named bid DAY/);
fails(() => apply(c, { op: "folder-add", name: "Reports", parent: F.ROOT }), /already a folder named Reports/, "Not the name of a built-in folder beside it");
fails(() => apply(c, { op: "folder-add", name: " ", parent: F.ROOT }), /Give the folder a name/);
fails(() => apply(c, { op: "folder-add", name: "x".repeat(61), parent: F.ROOT }), /at most 60 characters/);
fails(() => apply(c, { op: "folder-add", name: "Orphan", parent: "gone" }), /That folder was deleted/);
assert.equal(apply(c, { op: "folder-add", name: "Superseded", parent: F.ROOT }).folders.length, 4, "The same name in another folder is fine");

// Files move into any folder, out to the top, and back.
c = apply(c, { op: "file-move", series: "arch", folder: arch.id }, { op: "file-move", series: "geo", folder: bidDay.id }, { op: "file-move", series: "misc", folder: "budget" });
assert.deepEqual([F.folderOf(c, docs[0]), F.folderOf(c, docs[2]), F.folderOf(c, docs[7])], [arch.id, bidDay.id, "budget"]);
assert.equal(F.filesIn(c, docs, "drawings"), 2, "A folder counts the files in the folders inside it");
assert.equal(F.folderOf(apply(c, { op: "file-move", series: "arch", folder: F.ROOT }), docs[0]), F.ROOT);
fails(() => apply(c, { op: "file-move", series: "arch", folder: "gone" }), /That folder was deleted/);
assert.equal(C.fileMeta(c, "arch").folder, arch.id, "The folder is kept with the file's tags and links, so it carries to new revisions");
assert.equal(F.folderOf(c, doc("arch-v2", "Drawings", { series: "arch", revision: 2 })), arch.id);

// Rename and move folders; never into themselves; the built-in four stay as they are.
c = apply(c, { op: "folder-rename", id: arch.id, name: "Architecture" });
assert.equal(F.findFolder(c, arch.id).name, "Architecture");
fails(() => apply(c, { op: "folder-rename", id: "drawings", name: "Plans" }), /built-in folders can't be renamed/);
fails(() => apply(c, { op: "folder-move", id: "rfp", parent: bidDay.id }), /built-in folders can't be moved/);
fails(() => apply(c, { op: "folder-delete", id: "budget" }), /built-in folders can't be deleted/);
fails(() => apply(c, { op: "folder-move", id: arch.id, parent: old.id }), /can't go inside itself/);
fails(() => apply(c, { op: "folder-move", id: arch.id, parent: arch.id }), /can't go inside itself/);
const moved = apply(c, { op: "folder-move", id: arch.id, parent: bidDay.id });
assert.deepEqual(F.folderPath(moved, old.id).map(f => f.name), ["Bid day", "Architecture", "Superseded"], "A folder moves with everything in it");
fails(() => apply(apply(c, { op: "folder-add", name: "Architecture", parent: bidDay.id }), { op: "folder-move", id: arch.id, parent: bidDay.id }), /already a folder named Architecture here/);

// Deleting a folder never deletes files: they and its folders move up to where it was.
const deleted = apply(c, { op: "folder-delete", id: arch.id });
assert.deepEqual([F.folderOf(deleted, docs[0]), F.findFolder(deleted, old.id).parent, deleted.folders.some(f => f.id === arch.id)], ["drawings", "drawings", false]);
assert.equal(F.folderOf({ ...c, folders: c.folders.filter(f => f.id !== bidDay.id) }, docs[2]), "reports", "A file whose folder is gone shows in its type's folder");
assert.equal(F.findFolder({ ...c, folders: c.folders.filter(f => f.id !== arch.id) }, old.id).parent, F.ROOT, "A folder whose parent is gone shows at the top");

// Renaming a file renames every revision; names stay unique and stay PDFs.
assert.equal(P.cleanFileName("  Level 1 / plan  "), "Level 1 plan.pdf");
assert.equal(P.cleanFileName("Survey.PDF"), "Survey.pdf");
fails(() => P.cleanFileName(" .pdf "), /Give the file a name/);
const index = { projectId: "p", documents: [doc("arch", "Drawings"), doc("arch-v2", "Drawings", { series: "arch", revision: 2 }), doc("geo", "Reports")], updatedAt: at };
const renamed = P.renameSeries(index, "arch", "Architectural set");
assert.deepEqual(renamed.documents.filter(d => d.series === "arch").map(d => d.name), ["Architectural set.pdf", "Architectural set.pdf"]);
fails(() => P.renameSeries(index, "arch", "GEO"), /already a file named GEO.pdf/);
assert.equal(P.renameSeries(index, "arch", "arch").documents[0].name, "arch.pdf", "Keeping its own name is fine");
fails(() => P.renameSeries(index, "gone", "x"), /This file was deleted/);

console.log("Project folders checked: the four built-in folders and where each type starts, folders made anywhere and nested, files moved in and out, rename and move rules, deleting a folder keeps its files, file renames across revisions.");

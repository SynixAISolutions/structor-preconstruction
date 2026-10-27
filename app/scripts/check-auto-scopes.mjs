import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const A = await import("../lib/auto-scope-plan.ts");
const S = await import("../lib/project-scopes.ts");
const P = await import("../lib/procurement.ts");
const E = await import("../lib/extraction.ts");
const { CSI_GROUPS } = await import("../lib/data/csi-groups.ts");

// The automatic scope run after an upload (Marcel, 24 Oct; Danial, 26 Oct).
const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-27T09:00:00.000Z";
const sec = (section, title, first) => ({ section, title, first, last: first + 1 });
const doc = (id, kind, o = {}) => ({ id, projectId: "p", name: `${id}.pdf`, category: kind === "drawings" ? "Drawings" : kind === "manual" ? "Specifications" : "Reports", kind, series: o.series ?? id, revision: o.revision ?? 1, size: 1, pageCount: 40, uploadedAt: o.uploadedAt ?? at, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sheets: o.sheets ?? [], sections: o.sections ?? [] });
const manual = doc("manual", "manual", { sections: [sec("01 10 00", "Summary", 1), sec("09 29 00", "Gypsum Board", 5), sec("09 51 13", "Acoustical Panel Ceilings", 9), sec("25 50 00", "Integrated Automation Facility Controls", 13), sec("25 50 13", "Facility Controls Network", 15), sec("34 11 00", "Rail Tracks", 19)] });
const drawings = doc("arch", "drawings", { sheets: [{ page: 1, sheet: "A8.1", title: "PARTITION TYPES", date: "" }] });

// Marcel's CSI list: the level-2 groups of Divisions 02 to 33.
assert(CSI_GROUPS.length > 850, "Marcel's list has every group");
assert.deepEqual(CSI_GROUPS.find(([c]) => c === "09 29 00"), ["09 29 00", "Gypsum Board"]);
assert(CSI_GROUPS.every(([c, t]) => /^\d\d \d\d 00$/.test(c) && t && !t.includes("*")), "Codes are level-2 groups, titles clean");

// A run starts for new uploads only, and is named by the exact files it reads.
assert.equal(A.runTarget([manual, drawings], "2026-10-28T00:00:00.000Z"), null, "Files stored before automatic runs began don't start one");
const target = A.runTarget([manual, drawings, doc("geo", "other")]);
assert.deepEqual([target.key, target.documents.map(d => d.id)], ["arch|manual", ["manual", "arch"]], "Drawings and manual only; reports aren't read for scopes");
assert.equal(A.runTarget([manual, drawings, doc("manual-2", "manual", { series: "manual", revision: 2 })]).key, "arch|manual-2", "A new revision is a new run");

// Bid packages: standard trades first, then a CSI group for every section no trade covers.
const added = S.tradesToAdd([], { sections: manual.sections, sheets: drawings.sheets });
assert.deepEqual(added.map(t => [t.code, t.name]), [["09 29 00", "Drywall"], ["25 50 00", "Integrated Automation Facility Controls"], ["34 11 00", "Rail Tracks"]]);
assert.deepEqual(added.find(t => t.code === "25 50 00").sections, ["25 50 00", "25 50 13"], "A CSI group takes every section in it");
assert.equal(added.find(t => t.code === "34 11 00").name, "Rail Tracks", "Outside Marcel's list, the section's own title names it");
let proc = freeze(added.reduce((s, t) => P.addPackage(s, t), { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] }));
assert.deepEqual(S.uncoveredSections(manual.sections, proc.packages), [], "Every section outside Division 01 now has a trade: no scope is left out");
assert.deepEqual(S.tradesToAdd(proc.packages, { sections: manual.sections, sheets: drawings.sheets }), [], "Run again, nothing new is added");
const clash = S.tradesToAdd([{ id: "x", name: "Rail Tracks", division: "02", code: "02 41 19" }], { sections: [sec("34 11 00", "Rail Tracks", 1)], sheets: [] });
assert.equal(clash[0].name, "Rail Tracks (34 11 00)", "Names stay unique");

// Trades to read, and what a stopped run still has to read.
const reads = A.tradesToRead(proc.packages, [manual, drawings]);
assert.deepEqual(reads.map(t => [t.pkg.name, t.sections.map(s => s.section), t.sheets.map(s => s.sheet)]), [["Drywall", ["09 29 00", "09 51 13"], ["A8.1"]], ["Integrated Automation Facility Controls", ["25 50 00", "25 50 13"], []], ["Rail Tracks", ["34 11 00"], []]]);
const stopped = { trades: [{ packageId: proc.packages[0].id, status: "done" }, { packageId: proc.packages[1].id, status: "reading" }] };
assert.deepEqual(A.stillToRead(reads, stopped).map(t => t.pkg.name), ["Integrated Automation Facility Controls", "Rail Tracks"], "Finished trades aren't read twice");
assert.equal(A.stillToRead(reads, null).length, 3);

// Findings go straight into the bid forms as drafts to approve; lines already there are set aside.
const drywall = proc.packages[0].id;
proc = freeze(P.addScope(proc, { packageId: drywall, title: "Gypsum board, Type X", origin: "estimator" }, "Sadie", at));
const run = { packageIds: [drywall], engine: { mode: "live", model: "deepseek" }, documents: [{ name: "manual.pdf", pages: 40 }], startedAt: at, finishedAt: at, drafts: [
  { key: "s1", kind: "scope", packageId: drywall, title: "gypsum board type X.", detail: "", source: "09 29 00", citations: [{ document: "manual.pdf", page: 5, quote: "Type X" }] },
  { key: "s2", kind: "scope", packageId: drywall, title: "Acoustical panel ceilings, 2x2", detail: "", source: "09 51 13", citations: [{ document: "manual.pdf", page: 9, quote: "2x2" }] },
] };
const ext = freeze(E.recordRun(E.EMPTY_EXTRACTION, proc, run));
const out = E.addRunToBidForms({ extraction: ext, procurement: proc }, ext.runs[0].id, at);
assert.deepEqual([out.added, out.duplicates], [1, 1]);
const line = out.procurement.scopes.at(-1);
assert.deepEqual([line.title, line.status, line.origin, line.packageId], ["Acoustical panel ceilings, 2x2", "draft", "ai", drywall], "Added as a draft for Approve scopes");
assert.deepEqual(out.extraction.drafts.map(d => [d.status, d.rejection?.reason ?? null]), [["rejected", "duplicate"], ["accepted", null]]);
assert.equal(out.extraction.drafts[1].acceptedId, line.id, "The finding remembers the line it became (its citations stay with the run)");
assert.deepEqual(E.addRunToBidForms({ extraction: out.extraction, procurement: out.procurement }, ext.runs[0].id, at).added, 0, "Running the step again adds nothing");

// Copy a scope item to another trade: a draft there, tagged, original untouched.
let owned = freeze({ ...out.procurement, packages: out.procurement.packages.map((p, i) => i === 1 ? { ...p, owner: "Victor" } : p) });
const copied = P.copyScope(owned, line.id, owned.packages[1].id, "Sadie", at);
const copy = copied.scopes.at(-1);
assert.deepEqual([copy.packageId, copy.status, copy.title, copy.history[0].kind, copy.history[0].from], [owned.packages[1].id, "draft", line.title, "copied", drywall]);
assert.equal(copied.scopes.find(s => s.id === line.id).packageId, drywall, "The original stays in its trade");
assert.match(copied.notifications.at(-1).text, /Sadie copied "Acoustical panel ceilings, 2x2" from Drywall/);
assert.throws(() => P.copyScope(copied, line.id, owned.packages[1].id, "Sadie", at), /already has this item/);
assert.throws(() => P.copyScope(owned, line.id, drywall, "Sadie", at), /already in Drywall/);

// How a run is told in the notification center.
const finished = { documents: ["manual.pdf", "arch.pdf"], newTrades: ["Drywall", "Rail Tracks"], trades: [{ status: "done", added: 12 }, { status: "done", added: 0 }, { status: "failed", added: 0 }], added: 12, duplicates: 3 };
assert.equal(A.runSummary(finished), "12 scope items added to 1 trade for approval · 2 new bid packages · 3 already in the bid forms · 1 trade could not be read");
assert.equal(A.runFiles(finished), "manual.pdf and arch.pdf");
assert.equal(A.runFiles({ documents: ["a", "b", "c"] }), "a and 2 more");
assert.deepEqual(A.runProgress(finished), { done: 3, total: 3 });

console.log("Auto scopes checked: Marcel's CSI groups, runs only for new uploads and named by their files, bid packages for every section, resume after a closed tab, findings into bid forms without duplicates, copy to another trade, the run summary.");

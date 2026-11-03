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
const sized = (name, pages, sheets = 0) => ({ pkg: { name }, sections: [{ first: 1, last: pages }], sheets: Array.from({ length: sheets }, (_, i) => ({ sheet: `S${i}` })) });
assert.deepEqual(A.biggestFirst([sized("Small", 2), sized("Plumbing", 230), sized("Doors", 20, 2), sized("Signage", 3)]).map(t => t.pkg.name), ["Plumbing", "Doors", "Small", "Signage"], "The biggest trades start first; equal ones keep bid-package order");

// A manual in volumes (Marcel, 24 Oct: "Project manual V1, project manual V2", not combined): every volume is read.
const F = await import("../lib/project-files.ts");
const vol1 = doc("Project manual Vol 1", "manual", { sections: [sec("00 01 10", "Table of contents", 1), sec("09 29 00", "Gypsum Board", 5)] });
const vol2 = doc("Project manual Vol 2", "manual", { sections: [sec("09 51 13", "Acoustical Panel Ceilings", 3), sec("25 50 00", "Integrated Automation Facility Controls", 9), { section: "09 29 00", title: "Gypsum Board", first: 30, last: 30 }] });
assert.equal(A.runTarget([vol2, vol1, drawings]).key, "Project manual Vol 1|Project manual Vol 2|arch", "Both volumes are in the run");
const specs = F.specificationSections([vol2, vol1]);
assert.deepEqual(specs.map(s => [s.section, s.doc.id, s.first]), [["00 01 10", "Project manual Vol 1", 1], ["09 29 00", "Project manual Vol 1", 5], ["09 51 13", "Project manual Vol 2", 3], ["25 50 00", "Project manual Vol 2", 9]], "Vol 1 then Vol 2; a section listed in both counts once, where it runs longer");
const volReads = A.tradesToRead(proc.packages, [vol2, vol1, drawings]);
assert.deepEqual(volReads.map(t => [t.pkg.name, t.sections.map(s => `${s.section} in ${s.doc.id}`)]), [["Drywall", ["09 29 00 in Project manual Vol 1", "09 51 13 in Project manual Vol 2"]], ["Integrated Automation Facility Controls", ["25 50 00 in Project manual Vol 2"]]], "A trade reads its sections from whichever volume holds them");
assert.deepEqual(S.tradesToAdd([], { sections: specs, sheets: [] }).map(t => t.code), ["09 29 00", "25 50 00"], "Trades are suggested from every volume");
assert.deepEqual([F.findSection([vol1, vol2], "25 50 00")?.doc.id, F.findSection([vol1, vol2], "25 50 00")?.section.first], ["Project manual Vol 2", 9], "A section source opens the volume it is in");
const vol1rev = doc("Vol 1 rev 2", "manual", { series: "Project manual Vol 1", revision: 2, sections: [sec("09 29 00", "Gypsum Board", 7)] });
assert.deepEqual(F.specificationSections([vol1, vol2, vol1rev]).filter(s => s.section === "09 29 00").map(s => [s.doc.id, s.first]), [["Vol 1 rev 2", 7]], "A volume's newest revision replaces it");

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

// After a revision (Marcel, 24 Oct: "uploading a new drawing revision should trigger a scope update"): only the
// sheets and sections whose text changed since the last finished run are read again.
{
  const sheet = (page, number, title) => ({ page, sheet: number, title, date: "" });
  const set1 = doc("set1", "drawings", { series: "set", uploadedAt: "2026-10-27T10:00:00.000Z", sheets: [sheet(1, "A1.1", "FLOOR PLAN"), sheet(2, "A8.1", "PARTITION TYPES")] });
  const man1 = doc("man1", "manual", { series: "man", uploadedAt: "2026-10-27T10:00:00.000Z", sections: [sec("09 29 00", "Gypsum Board", 5), sec("09 51 13", "Acoustical Panel Ceilings", 9)] });
  const rev = doc("rev", "drawings", { series: "rev", uploadedAt: "2026-11-02T10:00:00.000Z", sheets: [sheet(1, "A8.1", "PARTITION TYPES")] });
  const man2 = doc("man2", "manual", { series: "man", revision: 2, uploadedAt: "2026-11-02T10:00:00.000Z", sections: [sec("09 29 00", "Gypsum Board", 5), sec("09 51 13", "Acoustical Panel Ceilings", 9)] });
  const docs = [set1, man1, rev, man2], before = new Set(["set1", "man1"]);
  const texts = { set1: { 1: "FLOOR PLAN", 2: "TYPE A 5/8 GYP" }, man1: { 5: "Gypsum board", 6: "Level 4 finish", 9: "Ceiling panels", 10: "Grid" }, rev: { 1: "TYPE A 5/8 GYP TYPE X" }, man2: { 5: "Gypsum  board", 6: "Level 4 finish", 9: "Ceiling panels", 10: "Grid and seismic bracing" } };
  const text = (id, page) => texts[id]?.[page];
  assert.deepEqual(A.filesToCompare(docs, before).map(d => d.id).sort(), ["man1", "man2", "rev", "set1"], "The new files and the versions they replace");
  assert.deepEqual(A.changedSince(docs, before, text), { sheets: ["A8.1"], sections: ["09 51 13"] }, "A8.1's revised text and the ceiling section's new page; spacing alone isn't a change");
  assert.deepEqual(A.changedSince(docs, before, (id, page) => id === "rev" ? "TYPE A 5/8 GYP" : text(id, page)).sheets, [], "A reissued sheet with the same text didn't change");
  assert.deepEqual(A.changedSince(docs, before, (id, page) => id === "rev" ? "" : text(id, page)).sheets, ["A8.1"], "A scanned sheet can't be compared: it counts as changed");
  const added = doc("add", "drawings", { series: "add", uploadedAt: "2026-11-02T11:00:00.000Z", sheets: [sheet(1, "A9.1", "CEILING DETAILS")] });
  assert(A.changedSince([...docs, added], before, text).sheets.includes("A9.1"), "A new sheet number is new scope");
  assert.deepEqual(A.changedSince(docs, new Set(["set1", "man1", "rev", "man2"]), text), { sheets: [], sections: [] }, "Nothing new since a run that read everything");

  const drywall = { pkg: { id: "drywall" }, sections: man2.sections.map(s => ({ ...s, doc: man2 })).slice(0, 1), sheets: [{ sheet: "A8.1" }, { sheet: "A1.1" }] };
  const ceilings = { pkg: { id: "ceilings" }, sections: man2.sections.map(s => ({ ...s, doc: man2 })).slice(1), sheets: [] };
  const masonry = { pkg: { id: "masonry" }, sections: [], sheets: [{ sheet: "A1.1" }] };
  const changed = A.onlyChanged([drywall, ceilings, masonry], { sheets: ["A8.1"], sections: ["09 51 13"] });
  assert.deepEqual(changed.map(t => [t.pkg.id, t.sections.map(s => s.section), t.sheets.map(r => r.sheet)]), [["drywall", [], ["A8.1"]], ["ceilings", ["09 51 13"], []]], "Each trade reads only its changed parts; masonry has none");

  const done = (id, key, status = "done") => ({ ...finished, id, key, status });
  assert.equal(A.runToUpdate([done("r3", "new", "running"), done("r2", "old"), done("r1", "older")], "new").id, "r2", "The latest finished run on other files");
  assert.equal(A.runToUpdate([done("r1", "same")], "same"), null, "Not the run on these same files");
  assert.match(A.runSummary({ ...finished, update: { since: "r2", sheets: ["A8.1"], sections: [] } }), /^Revision: 1 changed sheet and 0 changed sections read again/);
  assert.equal(A.runSummary({ ...finished, update: { since: "r2", sheets: [], sections: [] } }), "Revision: nothing changed on the drawings or in the specifications");
}

// Another tab reading a run holds it (shared saving): two minutes from another browser, 45 s from another tab of this
// one, so a reloaded tab picks up its own run within the minute.
{
  const me = { tab: "t1", browser: "b1" }, now = Date.parse("2026-11-03T10:00:00.000Z");
  const running = (tab, browser, secondsAgo) => ({ status: "running", tab, browser, beat: new Date(now - secondsAgo * 1000).toISOString() });
  assert.equal(A.heldElsewhere(running("t2", "b2", 90), me, now), true, "Someone else's browser, heard from 90 s ago");
  assert.equal(A.heldElsewhere(running("t2", "b2", 130), me, now), false, "Not heard from for over two minutes: closed");
  assert.equal(A.heldElsewhere(running("t2", "b1", 30), me, now), true, "Another tab here, still reading");
  assert.equal(A.heldElsewhere(running("t2", "b1", 50), me, now), false, "A tab here gone quiet for 45 s: reloaded or closed");
  assert.equal(A.heldElsewhere(running("t1", "b1", 5), me, now), false, "This tab's own run");
  assert.equal(A.heldElsewhere({ status: "done", tab: "t2", browser: "b2", beat: new Date(now).toISOString() }, me, now), false, "A finished run holds nothing");
  assert.equal(A.heldElsewhere({ status: "running" }, me, now), false, "A run saved before shared saving");
}

console.log("Auto scopes checked: Marcel's CSI groups, runs only for new uploads and named by their files, bid packages for every section, resume after a closed tab, findings into bid forms without duplicates, copy to another trade, the run summary, reading only what a revision changed, runs held by another tab.");

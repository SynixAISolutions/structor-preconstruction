// The AI memory's trade split (Danial, 23 Nov: "Build both": package memory, and Marcel's bid sheet as the starting
// playbook). Remembered splits decide which sections each trade reads and guide the AI's bid packages; estimators'
// Section coverage decisions teach them; a bid sheet imports them. Made-up sheets only: the real one stays out of the repo.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const M = await import("../lib/memory.ts");
const S = await import("../lib/memory-store.ts");
const L = await import("../lib/memory-learn.ts");
const P = await import("../lib/project-scopes.ts");
const A = await import("../lib/auto-scope-plan.ts");
const B = await import("../lib/bid-package-ai.ts");
const I = await import("../lib/bid-sheet-import.ts");
const C = await import("../lib/section-coverage.ts");
const R = await import("../lib/procurement.ts");
const { PGlite } = await import("@electric-sql/pglite");

const entry = (o) => ({ id: o.id ?? `${o.section}-${o.text}`, kind: "assignment", status: "approved", origin: "import", projectId: null, trades: [], section: null, text: "", detail: "", seen: 1, events: [], source: {}, history: [], version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", ...o });
const drywallTags = ["09 29 00", "drywall", "drywall and ceilings"];

// ── Which sections a remembered split covers ──
assert(M.sectionCovers("09 22 16", "09 22 16") && M.sectionCovers("06 16 00", "06 16 43") && M.sectionCovers("07 42 10.11", "07 42 10"), "The same number, every section under a level-2 number, a decimal with its base");
assert(!M.sectionCovers("06 16 00", "06 17 00") && !M.sectionCovers("09 00 00", "09 29 00") && !M.sectionCovers("09 22 16", "09 22 17"), "Never another group, never a whole division");
assert.throws(() => M.cleanMemoryInput({ kind: "assignment", text: "Drywall carries sheathing.", trades: drywallTags }), /names the trade and the specification section/);

// ── The split on a project's packages ──
const packages = [
  { id: "carpentry", name: "Carpentry", code: "06 10 00", division: "06" },
  { id: "dw", name: "Drywall & ceilings", code: "09 21 16", division: "09", sections: ["09 51 13"] },
  { id: "waterproofing", name: "Waterproofing, air barrier & joint sealants", code: "07 10 00", division: "07" },
  { id: "panels", name: "Metal panels", code: "07 42 00", division: "07", sections: ["07 27 26"] },
];
const split = [
  entry({ text: "Drywall carries 06 16 00 Sheathing.", section: "06 16 00", trades: drywallTags }),
  entry({ text: "Drywall carries 07 92 00 Joint Sealants.", section: "07 92 00", trades: drywallTags }),
  entry({ text: "Waterproofing carries 07 92 00 Joint Sealants.", section: "07 92 00", trades: ["07 10 00", "waterproofing air barrier and joint sealants"] }),
  entry({ text: "Waterproofing carries 07 27 26 Fluid-Applied Membrane Air Barriers.", section: "07 27 26", trades: ["07 10 00", "waterproofing air barrier and joint sealants"] }),
  entry({ text: "Proposed only.", section: "06 10 53", trades: drywallTags, status: "proposed" }),
  entry({ text: "Another project's.", section: "06 41 16", trades: drywallTags, projectId: "p2" }),
];
const sections = ["06 16 43", "06 10 53", "06 41 16", "07 92 00", "07 27 26", "09 51 13"];
const remembered = M.rememberedSections(split, packages, "p1", sections);
assert.deepEqual([[...remembered.byPackage], remembered.ambiguous], [[["dw", ["06 16 43"]], ["waterproofing", ["07 27 26"]]], ["07 92 00"]],
  "Drywall gets the sheathing under 06 16 00 (found by its name, whatever its code), Waterproofing the air barrier; sealants claimed by two trades are left to the usual rules; proposals and other projects' entries don't count");
const stored = sections.map((section, i) => ({ section, title: `S${i}`, firstPage: 1, lastPage: 2 }));
const before = P.sectionsByTrade(stored, packages), after = P.sectionsByTrade(stored, packages, remembered.byPackage);
const ids = (m, id) => (m.get(id) ?? []).map(s => s.section);
assert.deepEqual([ids(before, "carpentry"), ids(before, "panels")], [["06 16 43", "06 10 53", "06 41 16"], ["07 27 26"]], "Before: sheathing by its division, the air barrier where the AI put it");
assert.deepEqual([ids(after, "carpentry"), ids(after, "dw"), ids(after, "waterproofing"), ids(after, "panels")], [["06 10 53", "06 41 16"], ["06 16 43", "09 51 13"], ["07 92 00", "07 27 26"], []],
  "After: the remembered split wins over the division and over the AI's packages");
const docs = [{ id: "m", name: "Manual.pdf", kind: "manual", revision: 1, series: "manual", sections: sections.map((s, i) => ({ section: s, title: `S${i}`, first: i + 1, last: i + 1 })), sheets: [] }];
assert.deepEqual(A.tradesToRead(packages, docs, remembered.byPackage).map(t => [t.pkg.id, t.sections.map(s => s.section)]).find(t => t[0] === "dw"), ["dw", ["06 16 43", "09 51 13"]], "What a trade reads follows the split");

// ── What the AI reads ──
const pack = M.contextPack(split, { projectId: "p1", code: "09 29 00", name: "Drywall" });
assert(pack.includes("Specification sections Drywall carries on this contractor's bid forms:\n- Drywall carries 06 16 00 Sheathing. [06 16 00]"), "A trade's scan is told the sections it carries");
const plan = M.planMemory([...split, entry({ kind: "rule", text: "Doors, frames & hardware doesn't carry: Installation of doors, frames and hardware.", trades: ["08 11 13", "doors frames and hardware"] })], "p1");
assert.equal(plan, [
  "Trades this contractor buys, with the specification sections each carries (its own bid forms; follow this split over the general rules):",
  "- drywall: 06 16 00, 07 92 00",
  "- waterproofing air barrier and joint sealants: 07 27 26, 07 92 00",
  "What trades carry or leave to others:",
  "- Doors, frames & hardware doesn't carry: Installation of doors, frames and hardware.",
].join("\n"), "The package plan reads every trade's sections and what each leaves to others");
assert.equal(M.planMemory([entry({ text: "x", section: "06 16 00", trades: drywallTags, source: { trade: "Drywall" } })], "p1").split("\n")[1], "- Drywall: 06 16 00", "The trade's own name when the entry carries it");
assert.equal(M.planMemory([], "p1"), "");
const job = { sections: [{ section: "06 16 43", title: "Gypsum Sheathing" }], sheets: [], packages: [] };
const planned = B.bidPackageMessages(B.parseBidPackageJob({ ...job, memory: plan }));
assert(planned[0].content.includes("When the contractor's own trade split is supplied, it wins over every rule above") && planned[1].content.startsWith("The contractor's own trade split, approved by its estimators:\nTrades this contractor buys"), "The AI's package plan gets the split, and is told it wins");
assert.deepEqual(B.bidPackageMessages(B.parseBidPackageJob(job)), B.bidPackageMessages(B.parseBidPackageJob({ ...job, memory: "" })), "Without memory the plan's request is as before");

// ── A bid sheet as the starting playbook ──
assert.deepEqual(I.splitTradeLabel("09 - DRYWALL & CEILINGS"), { division: "09", name: "Drywall & ceilings" });
assert.deepEqual([["02", "Demolition"], ["05", "Ss & mm"], ["09", "Drywall & ceilings"], ["08", "Doors, frames, hardware"], ["23", "Hvac"], ["07", "Joint sealants"], ["10", "Toilet accessories"], ["07", "Roofing"], ["33", "Wet utilities"], ["01", "Survey"]]
  .map(([d, n]) => I.matchStandardTrade(d, n)), ["demolition", "steel", "drywall", "openings", "mechanical", "waterproofing", null, "thermal", "utilities", null],
  "Matched by division and words, with the sheet's abbreviations; a tab the words don't decide, or a division with no trade, stays its own");
const tab = (trade, bidders, specs, lines, exclusions) => [
  ["Project:", "Somewhere", "", "Subcontractor:", ...bidders, "Bid Summary", "Base", "Total"], ["Trade:", trade], [], ["", "Section 3 - Scope of Work"],
  ["A", "Specifications"], ...specs.map(s => ["", s, "Y"]), ["B", "Inclusions"], ["1", "SPECIFIC SCOPE ITEMS", "Y"], ...lines.map((l, i) => [String(i + 2), l, "Y"]),
  ["C", "Exclusions"], ...exclusions.map((l, i) => [String(i + 1), l, "N"]), ["D", "Schedule"],
];
const sheet = I.readBidSheet([
  { name: "GWB", rows: tab("09 - DRYWALL & CEILINGS", ["Capitol Drywall", "Bidder 2"], ["Division 01 - General Requirements", "06 16 00 - Sheathing", "09 29 00 - Gypsum Board (as applicable to this Bid Package)"], ["Furnish and install gypsum sheathing at exterior walls", "Tape and finish all joints"], ["Fire stopping of penetrations"]) },
  { name: "Gyp", rows: tab("03 - GYP UNDERLAYMENT", ["Bidder 1", "Bidder 2"], ["00 00 00 - Spec Section"], ["Provide gypsum underlayment"], []) },
  { name: "RFI Log", rows: [["RFI", "Question"], ["1", "Where?"]] },
]);
assert.deepEqual(sheet.map(t => [t.tab, t.division, t.name, t.standard, t.bid, t.key.sections]), [["GWB", "09", "Drywall & ceilings", "drywall", true, ["06 16 00", "09 29 00"]], ["Gyp", "03", "Gyp underlayment", "concrete", false, []]],
  "Trade tabs only; real bidders tell a bid tab from an untouched template; the template's placeholder section dropped");
const imported = I.bidSheetEntries(sheet[0], "Jelleff Live Bid sheet.xlsx", "drywall");
assert.deepEqual(imported.map(e => [e.kind, e.text]), [
  ["assignment", "Drywall carries 06 16 00 Sheathing."],
  ["rule", "Drywall carries the parts of 09 29 00 Gypsum Board that apply to it."],
  ["rule", "Drywall doesn't carry: Fire stopping of penetrations."],
  ["example", "Furnish and install gypsum sheathing at exterior walls"], ["example", "Tape and finish all joints"],
], "Sections as trade splits; one listed \"as applicable to this Bid Package\" is only partly the trade's, so it guides the AI as a rule and never routes the section; exclusions as rules; scope lines as wording examples");
assert.deepEqual(imported[0].trades, ["09 29 00", "drywall", "drywall and ceilings"], "Tagged by the Structor trade and by the sheet's own name");
assert.deepEqual([imported[0].origin, imported[0].events, imported[0].source], ["import", ["import:jelleff live bid sheet xlsx:GWB:section:06 16 00"], { trade: "Drywall", file: "Jelleff Live Bid sheet.xlsx", tab: "GWB" }]);
assert.deepEqual(I.bidSheetEntries(sheet[0], "Jelleff Live Bid sheet.xlsx", null)[0].trades, ["drywall and ceilings"], "Kept as its own trade when not matched");
assert.equal(M.cleanMemoryInput(imported[0]).status, "proposed", "Imported entries wait for an estimator");

// ── What Section coverage teaches ──
let proc = { packages: [{ id: "dw", name: "Drywall", code: "09 29 00", division: "09", owner: "", due: "" }, { id: "wp", name: "Waterproofing", code: "07 10 00", division: "07", owner: "", due: "" }], scopes: [], invitations: [], outreach: [], notifications: [] };
proc = C.assignSection(proc, { section: "07 27 26", title: "Fluid-Applied Membrane Air Barriers", first: 120, last: 128 }, "wp", "Sadie", "t1");
proc = R.addScope(proc, { packageId: "dw", title: "Gypsum Board (Section 09 29 00)", detail: "", source: "09 29 00", origin: "specification" }, "Structor AI", "t1");
const decisions = C.recordSplit({}, proc, "07 92 00", [{ packageId: "dw", portion: "sealants in drywall partitions" }, { packageId: "wp", portion: "exterior joint sealants" }], "Sadie", "t2");
const taught = L.correctionsFrom("p1", proc, { runs: [], drafts: [] }, decisions);
assert.deepEqual(taught.map(c => [c.kind, c.text, c.section]), [
  ["assignment", "Waterproofing carries 07 27 26 Fluid-Applied Membrane Air Barriers.", "07 27 26"],
  ["rule", "Section 07 92 00 is split: Drywall carries sealants in drywall partitions; Waterproofing carries exterior joint sealants.", "07 92 00"],
], "Assigning a section to a trade teaches a split; a recorded split teaches a rule; a line the AI added teaches nothing");

// ── The table: a memory made before trade splits takes them, and many are approved at once ──
const pg = new PGlite();
const db = { query: async (text, params) => (await pg.query(text, params ?? [])).rows };
await pg.exec(S.MEMORY_SCHEMA[0].replace("'decision', 'assignment'", "'decision'"));
await assert.rejects(pg.query("INSERT INTO memory_entries (id, kind, status, origin, text, dedupe_key) VALUES ('x', 'assignment', 'approved', 'import', 't', 'k')"), /check constraint/, "The table as it was on 23 Nov morning");
const store = S.postgresMemory(db);
assert.deepEqual(await store.learn(imported, "Danial"), { added: 5, seenAgain: 0 }, "After the upgrade it takes trade splits");
assert.deepEqual(await store.learn(imported, "Danial"), { added: 0, seenAgain: 0 }, "The same sheet again adds nothing");
assert.equal((await store.search({ origin: ["import"], kind: ["assignment"] })).length, 1, "Found by where it came from and its kind");
const all = await store.search({ status: ["proposed"] });
assert.equal(await store.setStatus(all.map(e => e.id), "approved", "Marcel Khoury"), 5, "Approved at once");
assert.deepEqual([await store.counts(), (await store.search({}))[0].history.map(h => h.action)], [{ proposed: 0, approved: 5, retired: 0 }, ["proposed", "approved"]]);
assert.equal(await store.setStatus(all.map(e => e.id), "approved", "Marcel Khoury"), 0, "Nothing changes twice");
await assert.rejects(store.setStatus(["x"], "bogus", "M"), /Choose proposed, approved or retired/);
const live = M.rememberedSections(await store.search({ status: ["approved"], forProject: "p1" }), [{ id: "dw", name: "Drywall", code: "09 29 00" }], "p1", ["06 16 43", "09 29 00"]);
assert.deepEqual([...live.byPackage], [["dw", ["06 16 43"]]], "Straight from the table to the trades' sections: the partly carried 09 29 00 isn't routed");

console.log("Trade split checked: which sections a remembered split covers, the split on a project's packages (by code or name, ambiguous claims left alone), which sections each trade reads, the scans' and the package plan's memory, a bid sheet read, matched and imported as proposals, what Section coverage teaches, and the table upgraded for trade splits with many approved at once.");

// The contractor's scope checklists (Marcel's issue 17, 18 Nov: "general scope for every single trade ... under every
// trade for every single project"; Danial, 24 Nov: "give it to our AI as memory"). One Word file per trade, read into
// its lines and exclusions, imported as memory proposals, and offered whole, in order, on each trade's bid form.
// Made-up checklists only: the contractor's own files stay out of the repo.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/scope-checklist.ts");
const M = await import("../lib/memory.ts");
const S = await import("../lib/memory-store.ts");
const I = await import("../lib/bid-sheet-import.ts");
const W = await import("../lib/word-levels.ts");
const K = await import("../lib/memory-check.ts");
const { PGlite } = await import("@electric-sql/pglite");

// ── File names ──
assert.deepEqual(["09A - Drywall and ACT.doc", "15D – Mechanical 20090514 FINAL.doc", "06A - Carpentry Checklist 3-12-2010 reviewed.docx", "Roofing.docx", "10A,B - Specialties DRAFT.doc",
  "02R - Final Cleaning - Checklist EPT Approved 2011.06.28.doc", "16A - Electrical reviewed 6-13-2018.doc", "02F - Curbs, Gutters and Walks 200908250 REVIEWED.doc", "06A - Rough Carpentry Scope Checklist REVIEWED.doc",
  "08C - Window Systems -Checklist DRAFT reviewed by someone 6-13-2009.doc", "05J - Expansion Joint Systems - 20090825 REVIEWED.doc"].map(f => C.checklistName(f)),
  [{ code: "09A", name: "Drywall and ACT" }, { code: "15D", name: "Mechanical" }, { code: "06A", name: "Carpentry" }, { code: "", name: "Roofing" }, { code: "10A,B", name: "Specialties" },
    { code: "02R", name: "Final Cleaning" }, { code: "16A", name: "Electrical" }, { code: "02F", name: "Curbs, Gutters and Walks" }, { code: "06A", name: "Rough Carpentry" },
    { code: "08C", name: "Window Systems" }, { code: "05J", name: "Expansion Joint Systems" }],
  "Code and trade from the file name; dates, FINAL, Checklist and review notes dropped, but not the Final of Final Cleaning");

// ── One trade's checklist ──
const drywall = [
  "Example Builders", "09A – DRYWALL AND ACT", "SCOPE CHECKLIST",
  "09A – DRYWALL AND ACT",
  "Layout of all partitions from the column grid",
  "Blocking in drywall partitions for all wall\\-mounted items \\[by others\\]",
  "Receive, unload and install hollow metal frames in drywall partitions, excluding only the following:",
  "Frames in masonry walls",
  "2",
  "Layout of all partitions from the column grid",
  "Exclude fire-rated access panels in masonry",
  "Etc…",
  "Exclusions:",
  "Painting of gypsum board",
  "Painting of gypsum board",
  "Acoustical insulation in exterior walls.",
].join("\n");
const [dw] = C.readChecklists(drywall, "09A - Drywall and ACT.doc");
assert.deepEqual([dw.code, dw.name, dw.division, dw.standard], ["09A", "Drywall and ACT", "09", "drywall"], "Its heading names it, written as people do; matched to Structor's Drywall");
assert.deepEqual(dw.lines.map(l => [l.section, l.order, l.text]), [
  ["includes", 1, "Layout of all partitions from the column grid"],
  ["includes", 2, "Blocking in drywall partitions for all wall-mounted items [by others]"],
  ["includes", 3, "Receive, unload and install hollow metal frames in drywall partitions, excluding only the following:"],
  ["includes", 4, "Frames in masonry walls"],
  ["excludes", 1, "Fire-rated access panels in masonry"],
  ["excludes", 2, "Painting of gypsum board"],
  ["excludes", 3, "Acoustical insulation in exterior walls."],
], "Lines as printed and in order: Word's escapes undone, the title, page numbers, 'Etc…' and repeats left out; without list levels a sub-item stays its own line; 'Exclude …' and everything under Exclusions are exclusions");

// ── A file holding several trades (a Division 10 file) ──
const div10 = [
  "10A – Toilet Partitions, 10B - Louvers", "SCOPE CHECKLIST", "Division 10",
  "10A – Toilet Partitions", "Toilet partitions and urinal screens, complete", "Exclusions:", "Blocking in walls",
  "10B – Louvers", "Exterior louvers with insect screens",
  "10C - Exclusions not a heading.",
].join("\n");
const ten = C.readChecklists(div10, "10A,B - Specialties.doc");
assert.deepEqual(ten.map(l => [l.code, l.name, l.standard, l.lines.map(x => `${x.section}:${x.text}`)]), [
  ["10A", "Toilet Partitions", "specialties", ["includes:Toilet partitions and urinal screens, complete", "excludes:Blocking in walls"]],
  ["10B", "Louvers", "specialties", ["includes:Exterior louvers with insect screens", "includes:10C - Exclusions not a heading."]],
], "One checklist per trade heading, each with its own exclusions; a division with no single trade goes to its whole-division trade");
assert.deepEqual(C.readChecklists("Nothing here\nSCOPE CHECKLIST\n3", "Empty.doc"), [], "A file with no lines gives no checklist");

// ── Which trade ──
assert.deepEqual([["09", "Drywall and ACT"], ["09", "Painting"], ["15", "Mechanical"], ["15", "Plumbing"], ["16", "Electrical"], ["10", "Toilet Partitions"], ["02", "Sitework"], ["07", "Roofing"], ["16", "Fire Alarm"]]
  .map(([d, n]) => C.matchChecklistTrade(d, n)), ["drywall", "painting", "mechanical", "plumbing", "electrical", "specialties", null, "thermal", "security"],
  "By division and words; MasterFormat 1995's numbers (15 Mechanical, 16 Electrical) by name; a fire alarm is safety and security, not sprinklers; nothing when no word decides");
assert.deepEqual([["02", "Curbs, Gutters and Walks"], ["02", "Site Utilities"], ["02", "Earthwork"], ["02", "OH Protection"], ["07", "Caulking"], ["08", "Window Systems"], ["17", "IT Systems"],
  ["10", "Fire Extinguishers and Cabinets"], ["10", "Loading Dock Equipment"], ["15", "Geothermal Systems"], ["09", "Acoustical Wall Panels"], ["09", "Terrazzo"], ["07", "Spray Fireproofing"]]
  .map(([d, n]) => C.matchChecklistTrade(d, n)), ["site-concrete", "utilities", "earthwork", null, "waterproofing", "glazing", "low-voltage", "specialties", "specialties", "geothermal", null, null, null],
  "02 Site Construction's work went to 31–33, so its curbs are Site concrete, not building Concrete; 03–14 stay in their division (Acoustical Wall Panels aren't Metal panels); overhead protection isn't Fire protection");
assert.deepEqual(["Mechanical", "Doors", "Door Hardware", "Wet"].map(n => I.matchTradeByName(n)), ["mechanical", null, "openings", "utilities"], "In any division: the one trade sharing the most words; a tie (Doors: two trades) decides nothing");
assert.equal(I.matchTradeByName("Concrete", []), null, "None to choose from");

// ── List levels from the Word file itself (lib/word-levels) ──
// A Word 97 .doc, made here byte by byte: three paragraphs in one list (levels 0, 1, 0), 8-bit text with a curly
// apostrophe (Windows-1252 0x92) and a page-number field whose code is left out.
{
  const text = "Lead-in, including the following:\r" + "Contractor\x92s item.\r" + "Top \x13 PAGE \x14again\x15.\r";
  const bytes = Uint8Array.from([...text].map(c => c.charCodeAt(0)));
  const doc = new Uint8Array(2048), view = new DataView(doc.buffer);
  view.setUint16(0, 0xa5ec, true); view.setUint16(0x0a, 0x0200, true); // the table stream is 1Table
  let o = 0x20; view.setUint16(o, 14, true); o += 2 + 28; view.setUint16(o, 22, true); const lw = o + 2; o += 2 + 88;
  view.setUint32(lw + 12, bytes.length, true); // ccpText
  view.setUint16(o, 93, true); const fcLcb = o + 2;
  view.setUint32(fcLcb + 13 * 8, 64, true); view.setUint32(fcLcb + 13 * 8 + 4, 12, true); // PlcBtePapx
  view.setUint32(fcLcb + 33 * 8, 0, true); view.setUint32(fcLcb + 33 * 8 + 4, 21, true); // Clx
  doc.set(bytes, 1024);
  const marks = [...text].map((c, i) => c === "\r" ? 1024 + i : -1).filter(i => i >= 0);
  const fkp = 1536;
  [1024, marks[0] + 1, marks[1] + 1, marks[2] + 1].forEach((fc, i) => view.setUint32(fkp + i * 4, fc, true));
  [0, 1, 0].forEach((ilvl, r) => {
    const at = 200 + r * 12; // PAPX: cb 5 → istd, sprmPIlfo 1, sprmPIlvl
    doc[fkp + 16 + r * 13] = at / 2;
    doc.set([5, 0, 0, 0x0b, 0x46, 1, 0, 0x0a, 0x26, ilvl], fkp + at);
  });
  doc[fkp + 511] = 3;
  const table = new Uint8Array(128), tv = new DataView(table.buffer);
  table[0] = 0x02; tv.setUint32(1, 16, true); tv.setUint32(5, 0, true); tv.setUint32(9, bytes.length, true); tv.setUint32(15, (1024 * 2) | 0x40000000, true);
  tv.setUint32(64, 1024, true); tv.setUint32(68, 1024 + bytes.length, true); tv.setUint32(72, 3, true); // one FKP page, number 3
  assert.deepEqual(W.docParagraphs(doc, { "0Table": null, "1Table": table }), [
    { text: "Lead-in, including the following:", level: 0, list: 1 }, { text: "Contractor’s item.", level: 1, list: 1 }, { text: "Top again.", level: 0, list: 1 },
  ], "Each paragraph's level and list from its properties; Windows-1252 text read as printed; a field's code left out, its result kept");
  assert.throws(() => W.docParagraphs(new Uint8Array(64), { "0Table": null, "1Table": null }), /Not a Word 97/);
}
assert.deepEqual(W.docxParagraphs('<w:document><w:body><w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>Toilet</w:t></w:r><w:r><w:t xml:space="preserve"> accessories &amp; mirrors</w:t></w:r></w:p><w:p><w:r><w:t>Plain</w:t><w:tab/><w:t>text</w:t></w:r></w:p><w:p/></w:body></w:document>'),
  [{ text: "Toilet accessories & mirrors", level: 1, list: 3 }, { text: "Plain text", level: null, list: null }, { text: "", level: null, list: null }], "A .docx paragraph's level from its numbering; one outside a list has none");
assert.deepEqual(W.alignLevels(["Contractor’s layout.", "", "Toilet accessories", "A line Word never had"], [{ text: "Contractor's layout.", level: 2, list: 4 }, { text: "Toilet accessories & mirrors, all floors", level: 3, list: 4 }]),
  [{ text: "Contractor’s layout.", level: 2, list: 4 }, { text: "", level: null, list: null }, { text: "Toilet accessories", level: 3, list: 4 }, { text: "A line Word never had", level: null, list: null }],
  "Text lines matched to their paragraphs by letters and digits, a part of one too; none where nothing matches");

// ── A checklist read with its levels: MCN's layout ──
{
  const L = (text, level = 2, list = 4) => ({ text, level, list });
  const lines = [
    L("This Subcontract shall also include, but is not limited to, the items listed below:", 1),
    L("Layout of the Work."),
    L("Insulation shown on the drawings, excluding only the following:"), L("Inside curtain wall assemblies (by glazing subcontractor).", 3), L("Below the roof membrane (by roofing subcontractor).", 3),
    L("Receiving, unloading and installation of materials furnished by others, including the following:"), L("Toilet accessories.", 3), L("Access panels.", 3),
    L("Site work as follows:"), L("Concrete pads.", 3), L("Bollards.", 3),
    L("Interior final cleaning of rooms, surfaces and equipment, including the following:"), L("Restrooms.", 3), L("The specialty rooms below:", 3), L("Kitchens.", 0, 18), L("Laboratories.", 0, 18), L("Trench drains.", 3),
    L("Use of the hoist for 00 weeks at a rate of $00.00 per hour."),
    L("[Use this item only if there is no steel subcontractor] Steel lintels."),
    L("[LIST ANY OTHER ITEMS]"), L("An item under the note.", 3),
    L("Monitoring of the following items:"), L("Adjacent buildings.", 0, 13), L("[List other areas here]", 0, 13),
    L("An allowance of EIGHTY (80) hours at FIFTY DOLLARS ($50.00) per hour."),
    L("Exclusions:", 1),
    L("Furnishing of the following:"), L("Toilet accessories.", 3), L("Etc.", 3),
    L("Temporary power (by electrical subcontractor)."),
    { text: "SCHEDULE MILESTONES:", level: null, list: null },
    L("Submittals within ___ (__) weeks of this Subcontract.", 2, 15),
  ];
  const [list] = C.readChecklists(lines, "09A - Drywall and ACT.doc");
  assert.deepEqual(list.lines.map(l => [l.section, l.order, l.text, l.items, l.fillIn]), [
    ["includes", 1, "Layout of the Work.", [], false],
    ["includes", 2, "Insulation shown on the drawings, excluding only the following:", ["Inside curtain wall assemblies (by glazing subcontractor).", "Below the roof membrane (by roofing subcontractor)."], false],
    ["includes", 3, "Receiving, unloading and installation of materials furnished by others, including the following:", ["Toilet accessories.", "Access panels."], false],
    ["includes", 4, "Site work as follows: Concrete pads.", [], false],
    ["includes", 5, "Site work as follows: Bollards.", [], false],
    ["includes", 6, "Interior final cleaning of rooms, surfaces and equipment, including the following:", ["Restrooms.", "The specialty rooms below:", "Kitchens.", "Laboratories.", "Trench drains."], false],
    ["includes", 7, "Use of the hoist for 00 weeks at a rate of $00.00 per hour.", [], true],
    ["includes", 8, "[Use this item only if there is no steel subcontractor] Steel lintels.", [], true],
    ["includes", 9, "An item under the note.", [], true],
    ["includes", 10, "Monitoring of the following items: Adjacent buildings.", [], true],
    ["includes", 11, "An allowance of EIGHTY (80) hours at FIFTY DOLLARS ($50.00) per hour.", [], false],
    ["excludes", 1, "Furnishing of the following: Toilet accessories.", [], false],
    ["excludes", 2, "Temporary power (by electrical subcontractor).", [], false],
  ], "A long lead-in, or one its items narrow (excluding only), keeps them as one line; a short one stands before each; a list begun under an item nests in it; the preamble, notes, 'Etc.' and the schedule are left out; blanks, a note's condition and an unfinished list are to fill in, a written amount isn't");
  assert.equal(C.itemsDetail(list.lines[5].items), "Restrooms; The specialty rooms below: Kitchens; Laboratories; Trench drains.", "Sub-items as one detail; a nested lead-in runs on into its items");
  const [first] = C.checklistEntries(list, "drywall").filter(e => e.text.startsWith("Insulation"));
  assert.equal(first.detail, "Inside curtain wall assemblies (by glazing subcontractor); Below the roof membrane (by roofing subcontractor).", "The memory keeps a lead-in's items as its detail");
  assert.deepEqual(C.readChecklists([L("Time is of the essence in the execution of the Work."), L("Shop drawings within ___ weeks.", 3)], "02O - Shoring.doc"), [], "A schedule without its heading still ends the scope");
  assert(["[AS APPLICABLE] Item", "Within ___ weeks", "xxxxx (00) entrances", "$00.00 per hour", "FOR PROJECTS WITH TWO FLOORS ADD: x", "EXAMPLE \"Removal\"", "On XXXX XX, 20XX", "Description……", "An allowance of DOLLARS ($ .00)"].every(t => C.needsFilling(t))
    && !["Licenses for the Work.", "One (1) point-up at $50.00 per hour.", "Built 2009, 100 units, 10:00 start", "FIFTY DOLLARS ($50.00)"].some(t => C.needsFilling(t)), "Blanks and conditions, not real figures");
}


// ── What one checklist adds to the memory ──
const entries = C.checklistEntries(dw, "drywall");
assert.deepEqual(entries.map(e => [e.kind, e.origin, e.text]), [
  ["example", "import", "Layout of all partitions from the column grid"],
  ["example", "import", "Blocking in drywall partitions for all wall-mounted items [by others]"],
  ["example", "import", "Receive, unload and install hollow metal frames in drywall partitions, excluding only the following:"],
  ["example", "import", "Frames in masonry walls"],
  ["rule", "import", "Drywall doesn't carry: Fire-rated access panels in masonry."],
  ["rule", "import", "Drywall doesn't carry: Painting of gypsum board."],
  ["rule", "import", "Drywall doesn't carry: Acoustical insulation in exterior walls."],
], "Its lines as the trade's wording, its exclusions as \"doesn't carry\" rules");
assert.deepEqual([entries[0].trades, entries[0].source, entries[0].events, entries[6].events], [["09 29 00", "drywall", "drywall and act"], { trade: "Drywall", file: "09A - Drywall and ACT.doc", checklist: "09A Drywall and ACT" },
  ["checklist:09a drywall and act doc:09A:includes:1"], ["checklist:09a drywall and act doc:09A:excludes:3"]], "Tagged for the trade and its own name; each line marked with its file, checklist, section and place");
assert.deepEqual(C.checklistEntries(ten[1], null)[0].trades, ["louvers"], "Its own trade when none is chosen");
for (const e of entries) M.cleanMemoryInput(e);
assert(entries.every(e => C.isChecklistEntry({ events: e.events })) && !C.isChecklistEntry({ events: ["import:x:GWB:line:0"] }));

// ── Imported twice: nothing new ──
const pg = new PGlite();
const db = { query: async (text, params) => (await pg.query(text, params ?? [])).rows };
const store = S.postgresMemory(db);
assert.deepEqual(await store.learn(entries, "Danial"), { added: 7, seenAgain: 0 }, "Imported as proposals");
assert.deepEqual(await store.learn(entries, "Danial"), { added: 0, seenAgain: 0 }, "The same checklist again adds nothing");
assert.equal((await store.search({ status: ["proposed"] })).length, 7, "Proposed: nothing reads them before approval");
await store.setStatus((await store.search({})).map(e => e.id), "approved", "Marcel Khoury");
const approved = await store.search({ status: ["approved"] });

// ── Every scan checks the checklist's lines against the project (lib/memory-check) ──
const dwPkg = { code: "09 29 00", name: "Drywall" };
const checked = K.tradeLines(approved, dwPkg, "p1");
assert.deepEqual(checked.map(l => l.text).sort(), [
  "Blocking in drywall partitions for all wall-mounted items [by others]",
  "Frames in masonry walls",
  "Layout of all partitions from the column grid",
  "Receive, unload and install hollow metal frames in drywall partitions, excluding only the following:",
], "Its lines are looked for on every scan of the trade; its exclusions stay rules");
assert.deepEqual([K.tradeLines(approved, { code: "09 91 23", name: "Painting & wall coverings" }, "p1").length,
  K.tradeLines(entries.map((e, i) => ({ ...e, id: `x${i}`, status: "proposed", projectId: null, seen: 1, history: [], version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", section: null, detail: "" })), dwPkg, "p1").length],
  [0, 0], "Not another trade's; not before it's approved");
assert.equal(K.tradeLines(approved, { code: "09 21 16", name: "Drywall and ACT" }, "p1").length, 4, "Found by the checklist's own name too");
const notHere = { ...approved.find(e => e.text === "Frames in masonry walls"), id: "nh", kind: "decision", projectId: "p1", origin: "estimator", events: [], text: "Not on this project: Frames in masonry walls" };
notHere.source = { overrides: approved.find(e => e.text === "Frames in masonry walls").id };
assert(!K.tradeLines([...approved, notHere], dwPkg, "p1").some(l => l.text === "Frames in masonry walls") && K.tradeLines([...approved, notHere], dwPkg, "p2").some(l => l.text === "Frames in masonry walls"),
  "\"Not on this project\" leaves a line out there, and only there");

// A project's own bid sheet replaces the company-wide sheet lines for the trade, never its checklist.
const anExample = approved.find(e => e.kind === "example");
const own = { ...anExample, id: "own", projectId: "p1", events: ["import:p1 xlsx:GWB:line:0"], text: "Own sheet line", source: { trade: "Drywall", file: "p1.xlsx", tab: "GWB" } };
const sheetLine = { ...anExample, id: "sheet", events: ["import:company xlsx:GWB:line:0"], text: "Company sheet line", source: { trade: "Drywall", file: "company.xlsx", tab: "GWB" } };
const read = M.projectMemory([...approved, own, sheetLine], "p1").map(e => e.id);
assert(read.includes("own") && !read.includes("sheet") && approved.every(e => read.includes(e.id)), "Every project carries the checklist");
// A lead-in keeps its items when it is checked.
const leadIn = { ...anExample, id: "lead", text: "Receiving of materials furnished by others, including the following:", detail: "Toilet accessories; Access panels.", events: ["checklist:09a drywall and act doc:09A:includes:30"] };
assert.equal(K.tradeLines([...approved, leadIn], dwPkg, "p1").find(l => l.text === leadIn.text)?.detail, "Toilet accessories; Access panels.", "A lead-in is checked with its items");

// The AI reads the checklist with the rest of the trade's memory.
const pack = M.contextPack(approved, { projectId: "p1", ...dwPkg });
assert(pack.includes("- Drywall doesn't carry: Painting of gypsum board.") && pack.includes("- Blocking in drywall partitions for all wall-mounted items [by others]"), "Scans read its exclusions as rules and its lines as the trade's wording");

console.log("Scope checklists checked: file names, a trade's checklist read in order with its exclusions, a file of several trades, list levels from a .doc and a .docx matched to the text, MCN's layout (lead-ins and their items, nested lists, notes, the schedule left out, lines to fill in), the trade each is for (by division and by name), the memory proposals one adds (imported twice, nothing new), its lines checked on every scan of the trade (never another trade's or before approval), \"Not on this project\", a project's own bid sheet leaving it in place, and scans reading it.");

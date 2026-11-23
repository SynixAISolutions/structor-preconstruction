// Finish legend tags (lib/finish-schedule): every tag on a trade's finish schedule that it carries gets a line when none
// names it, and a line the AI drew from the schedule for another trade's tag is left to that trade (23 Nov, Whittier
// run 3). Made-up legends in both printed layouts: the real sheets stay out of the repository.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const F = await import("../lib/finish-schedule.ts");
const P = await import("../lib/project-scopes.ts");
const J = await import("../lib/ai-jobs.ts");

// ── Which sheets are finish schedules ──
assert(F.isFinishSchedule("INTERIOR FINISH SCHEDULES") && F.isFinishSchedule("Finish Schedules and Details") && F.isFinishSchedule("FINISH LEGEND"));
assert(!F.isFinishSchedule("REFLECTED CEILING PLAN") && !F.isFinishSchedule("DOOR SCHEDULE") && !F.isFinishSchedule("FINISH PLAN"), "A finish plan or a door schedule isn't a finish legend");

// ── A legend with a row on each line ──
const oneLine = [
  "A-901", "INTERIOR FINISH", "SCHEDULES", "FINISH LEGEND", "CODE TYPE LOCATION MANUFACTURER PRODUCT",
  "CEILING",
  "ACP-1 ACOUSTIC CEILING PANEL THROUGHOUT ACME OPTIMUM 2X2 WHITE",
  "ACP-2 ACOUSTIC CEILING PANEL MUSIC ROOM ACME METAL LINE STANDARD COLOR",
  "BAF-1 ACOUSTIC CEILING BAFFLE LIBRARY FELTCO RIDGE WITH BACKER",
  "GYP-1 GYPSUM CEILING",
  "P-6 PAINT (CEILING) AT EXPOSED CEILINGS PAINTCO FLAT",
  "WDC-1 ACOUSTIC WOOD CEILING DINING SLATCO GRILLE",
  "FLOOR",
  "LVT-1 LUXURY VINYL TILE ADMIN FLOORCO PLANK",
  "MISC",
  "CG-1 CORNER GUARD GUARDCO STANDARD COLOR FROM",
  "FR SERIES",
  "F4 GLASS MARKER BOARD BOARDCO",
  "S-1 WOOD DOOR STAIN DOORCO MAPLE",
  "TP-1 TOILET PARTITIONS RESTROOMS PARTCO GREY",
  "WALL",
  "AWP-1 ACOUSTIC WALL PANEL COMMONS PANELCO MIRAGE WITH BACKER AND",
  "INTEGRATED LIGHTING",
  "DMP-1 DECORATIVE METAL PANEL LOBBY METALCO",
  "T-5A WALL TILE (ACCENT) CLASSROOMS TILECO 4X12",
  "VG-1 CUSTOM VINYL WALL GRAPHIC TBD",
].join("\n");
const rows = F.finishLegend(oneLine);
const by = Object.fromEntries(rows.map(r => [r.tag, r]));
assert.deepEqual(Object.fromEntries(rows.map(r => [r.tag, r.section])), {
  "ACP-1": "09 51 13", "ACP-2": "09 51 13", "BAF-1": "09 84 36", "GYP-1": "09 29 00", "P-6": "09 91 23", "WDC-1": "09 54 00", "LVT-1": "09 65 00",
  "CG-1": "10 26 00", F4: "10 11 00", "TP-1": "10 21 13", "AWP-1": "09 84 33", "T-5A": "09 30 00", "VG-1": "09 72 00",
}, "Each type's usual section; paint before its ceiling, a wood ceiling before acoustic ceilings; door stain and decorative metal left to the AI; the title block's sheet number isn't a row");
assert.equal(by["ACP-1"].type, "acoustic ceiling panel");
assert.equal(by["GYP-1"].type, "gypsum ceiling", "A word that finishes the type goes with it");
assert.equal(by["LVT-1"].type, "luxury vinyl tile");
assert.equal(by["T-5A"].type, "wall tile");
assert.equal(by["VG-1"].type, "custom vinyl wall graphic");
assert.match(by["AWP-1"].text, /MIRAGE WITH BACKER AND INTEGRATED LIGHTING$/, "A row's wrapped words go with it");
assert.match(by["CG-1"].text, /FR SERIES$/);
assert(!/FLOOR|INTEGRATED/.test(by["GYP-1"].text) && !/WALL$/.test(by["TP-1"].text), "A group heading ends a row's words");

// ── A legend with each tag on its own line, under numbered headings ──
const tagAlone = [
  "FINISH SCHEDULE", "TAG", "DESCRIPTION", "MANUFACTURER",
  "095100 ACOUSTIC CEILING TILE", "ACT-01", "SCRUBBABLE NSF", "ACME", "2X2",
  "066400 CUSTOM CASEWORK", "PL-01", "PLASTIC LAMINATE (YELLOW) LAMCO", "QUINCE",
  "066400 PLASTIC PANELING", "FRP-01", "FOOD SERVICE WALLS", "PANELCO",
  "096500 RESILIENT FLOORING", "WB-03", "RESILIENT BASE (GREEN)", "BASECO", "D24", "4\"H BASE",
  "TS-03", "CONCRETE TRANSITION", "TRIMCO",
  "102600 WALL PROTECTION", "MR-01", "WALL MIRROR", "GLASSCO",
  "105115", "LOC-01", "LOCKERS", "LOCKCO",
  "224230", "XY-01", "SOMETHING UNKNOWN",
  "A12.1",
].join("\n");
const alone = Object.fromEntries(F.finishLegend(tagAlone).map(r => [r.tag, r]));
assert.deepEqual(Object.fromEntries(Object.entries(alone).map(([t, r]) => [t, r.section])), {
  "ACT-01": "09 51 13", "PL-01": "06 41 00", "FRP-01": "06 64 00", "WB-03": "09 65 00", "TS-03": "09 65 00", "MR-01": "10 28 00", "LOC-01": "10 51 00", "XY-01": "10 51 15",
}, "A row's own type decides; an unknown or ambiguous one follows its heading's words, else its number; a product code alone (D24) isn't a tag; a project number (224230) isn't a heading, so XY-01 stays under 105115, not 22 42 30");
assert.equal(alone["ACT-01"].type, "acoustic ceiling tile", "An unknown row takes its heading's words for its name");
assert.equal(alone["PL-01"].type, "plastic laminate", "Casework laminate stays casework under a heading numbered as plastic paneling");
assert.equal(alone["TS-03"].type, "concrete transition");
assert.equal(alone["ACT-01"].line, "ACT-01 SCRUBBABLE NSF", "The quoted words: the tag and its first line");
assert(J.quoteOnPage(alone["ACT-01"].line, tagAlone), "That quote is on the page, across the line break");
assert.match(alone["WB-03"].text, /BASECO D24 4"H BASE$/);

// ── The tags a line names ──
assert.deepEqual([...F.namedTags("Furnish and install ACP-1 to ACP-3 and AWP-1, AWP-2 & AWP-3; glass marker board F4.")].sort(), ["ACP-1", "ACP-2", "ACP-3", "AWP-1", "AWP-2", "AWP-3", "F-4"]);
assert.deepEqual([...F.namedTags("AWP-1..3 at the library")].sort(), ["AWP-1", "AWP-2", "AWP-3"]);
assert(F.namedTags("ACP-01 ceiling").has("ACP-1"), "ACP-01 and ACP-1 are one tag");
assert.deepEqual([...F.namedTags("Furnish FWP-1, DMP-1 and AWP-1/2/3 panel types")].sort(), ["AWP-1", "AWP-2", "AWP-3", "DMP-1", "FWP-1"], "A slash list names each tag");
assert.deepEqual([...F.namedTags("ACP-1/ACP-2 ceilings")].sort(), ["ACP-1", "ACP-2"]);
assert(!F.namedTags("Level 5 finish, Type X board, 2x6 tile").size, "Lowercase words aren't tags");

// ── Who carries a section on the project ──
const packages = [
  { id: "drywall", name: "Drywall", code: "09 29 00" }, { id: "painting", name: "Painting", code: "09 91 23" },
  { id: "openings", name: "Doors", code: "08 11 13" }, { id: "specialties", name: "Specialties", code: "10 00 00" },
];
const who = (...ids) => ids.map(id => ({ id, name: packages.find(p => p.id === id).name }));
const readers = new Map([
  ["09 51 13", who("drywall")], ["09 84 33", who("drywall")], ["09 91 23", who("painting", "openings")],
  ["10 21 13.19", who("specialties")], ["10 11 00", who("drywall", "specialties")], ["10 26 00", who("drywall", "specialties")],
]);
const partial = new Map([["openings", ["09 91 23"]], ["drywall", ["10 11 00"]], ["specialties", ["10 11 00"]]]);
const owners = P.sectionOwners(readers, packages, partial);
const ids = section => owners(section).map(o => o.id);
assert.deepEqual(ids("09 51 13"), ["drywall"], "The trade that reads the same section");
assert.deepEqual(ids("09 51 33"), ["drywall"], "Else the same level-2 number");
assert.deepEqual(ids("10 21 13"), ["specialties"], "A decimal section in the manual (10 21 13.19) carries the type's section");
assert.deepEqual(ids("09 91 23"), ["painting"], "A trade that reads a section only in part (door finishes) doesn't carry its legend tags");
assert.deepEqual(ids("10 11 00").sort(), ["drywall", "specialties"], "Unless nobody reads it in full");
assert.deepEqual(ids("09 54 00"), ["drywall"], "A section not in the manual goes to its division's trade (wood ceilings with drywall)");
assert.deepEqual(ids("32 12 16"), [], "No trade in the division: nobody");

// ── The check on a trade's reading ──
const sheet = { document: "Set.pdf", page: 7, sheet: "A-901", text: oneLine };
const scope = (key, title, page = 7, detail = "") => ({ kind: "scope", key, packageId: "drywall", title, detail, source: "A-901", citations: [{ document: "Set.pdf", page, sheet: "A-901", quote: title }] });
const drafts = [
  scope("d1", "Furnish and install acoustic ceiling panels ACP-1 throughout."),
  scope("d2", "Furnish and install toilet partitions TP-1 in restrooms."),
  { kind: "region", key: "d2-text-1", packageId: "drywall", label: "TP-1", sheet: "A-901", polygon: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }], confidence: 0.9, scopeKeys: ["d2"], citations: [] },
  { kind: "quantity", key: "d2-quantity", packageId: "drywall", item: "Partitions", quantity: 4, unit: "EA", basis: "Counted.", scopeKey: "d2", citations: [] },
  scope("d3", "Install toilet accessories and coordinate TP-1 blocking.", 30),
  scope("d4", "Coordinate the ceiling layout.", 7, "Coordinate with the GYP-1 and BAF-1 tags and AWP-1 locations."),
  { ...scope("p1", "Include P-6 paint at exposed ceilings."), packageId: "painting" },
];
const all = [...packages, { id: "carpet", name: "Flooring", code: "09 65 19" }];
const ownersAll = P.sectionOwners(new Map([...readers, ["09 65 19", [{ id: "carpet", name: "Flooring" }]], ["09 29 00", who("drywall")], ["10 21 13.19", who("specialties")]]), all, partial);
const out = F.checkScheduleTags({ drafts, pkg: { id: "drywall", name: "Drywall" }, schedules: [sheet], owners: ownersAll, leavesOut: ["Fire stopping of penetrations"] });
assert.deepEqual(out.added.map(d => d.title), [
  "Include ACP-2 acoustic ceiling panel per the finish legend.", "Include WDC-1 acoustic wood ceiling per the finish legend.",
  "Include CG-1 corner guard per the finish legend.", "Include F4 glass marker board per the finish legend.", "Include VG-1 custom vinyl wall graphic per the finish legend.",
], "Drywall's tags no line names, once each, in legend order; a tag named in any line's detail counts; paint, flooring, tile and partitions aren't Drywall's");
const acp2 = out.added[0];
assert.equal(acp2.packageId, "drywall");
assert.deepEqual(acp2.citations, [{ document: "Set.pdf", page: 7, sheet: "A-901", quote: "ACP-2 ACOUSTIC CEILING PANEL MUSIC ROOM ACME METAL LINE STANDARD COLOR" }], "Each cites its printed row");
assert(J.quoteOnPage(acp2.citations[0].quote, oneLine) && acp2.citations[0].quote.split(" ").length <= 12, "The quote is printed on the sheet, at most 12 words");
assert.match(acp2.detail, /^Finish legend on A-901: ACP-2 ACOUSTIC CEILING PANEL MUSIC ROOM ACME/);
assert.deepEqual(out.drafts.map(d => d.key), ["d1", "d3", "d4", "p1"], "The schedule's TP-1 line goes with its highlight and quantity; a line from elsewhere naming TP-1, and other trades' lines, stay");
assert.equal(out.dropped.length, 1);
assert.match(out.dropped[0].reason, /^TP-1 \(toilet partitions\) belongs to Specialties on this project \(section 10 21 13\)/);

// An exclusion names the tag or its whole type; one word is too loose.
const leaves = (leavesOut, pkg = { id: "drywall", name: "Drywall" }) => F.checkScheduleTags({ drafts: [], pkg, schedules: [sheet], owners: ownersAll, leavesOut }).added.map(d => d.title.split(" ")[1]);
assert(!leaves(["Corner guards by others"]).includes("CG-1") && !leaves(["Glass marker boards (furnished by owner)"]).includes("F4"), "\"Doesn't carry\" a type: no line");
assert(!leaves(["WDC-1 wood ceiling by the millworker"]).includes("WDC-1"), "\"Doesn't carry\" a tag: no line");
assert.deepEqual(leaves(["Painting or prefinished items"], { id: "painting", name: "Painting" }), ["P-6"], "\"Painting or prefinished items\" is not \"doesn't carry paint\"");
assert.deepEqual(F.checkScheduleTags({ drafts, pkg: { id: "drywall", name: "Drywall" }, schedules: [{ ...sheet, text: "NO LEGEND HERE" }], owners: ownersAll }), { drafts, added: [], dropped: [] }, "No legend: the reading as it was");
const slashed = F.checkScheduleTags({ drafts: [scope("s1", "Furnish FWP-1, DMP-1 and AWP-1/2/3 panel types")], pkg: { id: "drywall", name: "Drywall" }, schedules: [sheet], owners: ownersAll });
assert(!slashed.added.some(d => /AWP-1/.test(d.title)), "A tag named in a slash list gets no second line (Whittier run 4: AWP-1/2/3)");

// ── Tags borrowed from another project's bid forms ──
const memo = (o) => ({ id: o.id, kind: "example", status: "approved", origin: "import", projectId: null, trades: ["drywall"], section: null, text: "", detail: "", seen: 1, events: [], source: {}, history: [], version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", ...o });
const memory = [
  memo({ id: "m1", text: "Furnish & install sound absorbing panels, SAW-01 (Tectum) at locations indicated" }),
  memo({ id: "m2", text: "Resilient flooring LVT-01 and wall base WB-01", detail: "Per NFPA 80 and detail D3; see ASTM C 645" }),
  memo({ id: "m3", text: "Install grab bars GB-1", status: "proposed" }),
  memo({ id: "m4", text: "Owner's ACP-7 ceiling", projectId: "other-project" }),
  memo({ id: "m5", text: "Furnish WB-01 rubber base", projectId: "this-project", origin: "correction" }),
];
assert.deepEqual([...F.borrowedTags([...memory, memo({ id: "m6", text: "Own sheet line", projectId: "this-project" })], "this-project")], [], "A project's own imported sheet replaces the company-wide lines for its trades, so nothing is borrowed");
assert.deepEqual([...F.borrowedTags(memory, "this-project")].sort(), ["LVT-1", "SAW-1"], "Hyphened tags of the company-wide entries the project reads, less its own (WB-01); not a standard, a detail, an unapproved entry or another project's entry");
assert.deepEqual([...F.tagFamilies(["LVT-1 RUBBER TILE", "ACP-2 CEILING; NFPA 80"])].sort(), ["ACP", "LVT", "NFPA"]);

const read = [{ document: "Set.pdf", page: 12, text: "AC111B REFLECTED CEILING PLAN ".repeat(10) + "ACP-1 ACP-2" }, { document: "Set.pdf", page: 13, text: "" }, { document: "Manual.pdf", page: 400, text: "PART 2 PRODUCTS ".repeat(20) }];
const line = (key, title, page = 12, document = "Set.pdf", packageId = "drywall", detail = "") => ({ kind: "scope", key, packageId, title, detail, source: "AC111B", citations: [{ document, page, sheet: "AC111B", quote: "REFLECTED CEILING PLAN" }] });
const borrowedDrafts = [
  line("b1", "Install sound absorbing panels SAW-01 at indicated locations."),
  { kind: "region", key: "b1-text-1", packageId: "drywall", label: "SAW-01", sheet: "AC111B", polygon: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }], confidence: 0.9, scopeKeys: ["b1"], citations: [] },
  line("b2", "Furnish and install LVT-01 resilient flooring."),
  line("b3", "Install sound absorbing panels SAW-01 on the scanned sheet.", 13),
  line("b4", "Install fire-rated doors per NFPA 80.", 400, "Manual.pdf"),
  line("b5", "Coordinate the ceiling layout.", 12, "Set.pdf", "drywall", "Match the SAW-01 tags."),
  line("b6", "Install sound absorbing panels SAW-01.", 12, "Set.pdf", "painting"),
];
const cleaned = F.dropBorrowedTags({ drafts: borrowedDrafts, pkg: { id: "drywall", name: "Drywall" }, pages: read, printed: new Set(["LVT", "ACP"]), borrowed: F.borrowedTags(memory, "this-project") });
assert.deepEqual(cleaned.drafts.map(d => d.key), ["b2", "b3", "b4", "b5", "b6"], "The SAW-01 line and its highlight go; LVT-01 stays (the project prints LVT tags), a scanned sheet's line isn't judged, a standard isn't a tag, a tag only in the detail stays, other trades' lines stay");
assert.equal(cleaned.dropped.length, 1);
assert.equal(cleaned.dropped[0].reason, "No SAW- tag is printed on this project's drawings or the pages Drywall read: SAW-01 comes from another project's bid form wording in the AI memory.");
assert.deepEqual(F.dropBorrowedTags({ drafts: borrowedDrafts, pkg: { id: "drywall", name: "Drywall" }, pages: read, printed: new Set(["SAW", "LVT"]), borrowed: F.borrowedTags(memory, "this-project") }).drafts, borrowedDrafts, "A family the project prints anywhere (Project 1's own SAW-01) keeps the line");

console.log("finish schedule checks passed");

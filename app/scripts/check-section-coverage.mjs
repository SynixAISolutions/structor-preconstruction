import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/section-coverage.ts");

const at = "2026-10-20T10:00:00.000Z";
const pkg = (id, name, code, extra = {}) => ({ id, name, division: code.slice(0, 2), code, owner: "", due: "", ...extra });
const scope = (id, packageId, source, extra = {}) => ({ id, packageId, title: `Line ${id}`, detail: "", source, origin: "ai", status: "draft", allTrades: false, history: [], ...extra });
const procurement = {
  packages: [
    pkg("drywall", "Drywall", "09 29 00", { published: { version: 2, at, by: "Marcel", items: [{ id: "a", title: "Line a", detail: "", source: "09 29 00 · §2.3" }] } }),
    pkg("carpentry", "Carpentry", "06 10 00"), pkg("concrete", "Concrete", "03 30 00"), pkg("doors", "Doors", "08 71 00"),
  ],
  scopes: [
    scope("a", "drywall", "09 29 00 · §2.3", { status: "approved" }),
    scope("b", "drywall", "06 10 53 · §3.1 blocking"),
    scope("c", "carpentry", "061053 · §3.1"),
    scope("d", "concrete", "S101 · Detail 3"),
    scope("e", "drywall", "07 84 00 · §1.2", { allTrades: true }),
    scope("f", "doors", "08 71 00 · §2.1"),
  ],
  invitations: [], outreach: [], notifications: [],
};
const sections = [
  { section: "01 10 00", title: "SUMMARY", first: 10, last: 12 },
  { section: "03 30 00", title: "CAST-IN-PLACE CONCRETE", first: 60, last: 80 },
  { section: "06 10 53", title: "MISCELLANEOUS ROUGH CARPENTRY", first: 150, last: 156 },
  { section: "07 84 00", title: "FIRESTOPPING", first: 300, last: 305 },
  { section: "08 71 00", title: "DOOR HARDWARE", first: 330, last: 340 },
  { section: "09 29 00", title: "GYPSUM BOARD", first: 400, last: 420 },
  { section: "10 28 00", title: "TOILET ACCESSORIES", first: 542, last: 550 },
];
const manual = { id: "doc-manual", name: "Project manual", revision: 2 };
const m = R.sectionCoverage({ sections, manual }, procurement);
const by = (rows) => Object.fromEntries(rows.map(r => [r.section, r]));
const row = by(m.rows);

// Statuses, open questions first; Divisions 00/01 are General's; an all-trades line doesn't carry a section.
assert.deepEqual(m.rows.map(r => [r.section, r.status]), [["07 84 00", "unassigned"], ["10 28 00", "unassigned"], ["06 10 53", "multiple"], ["03 30 00", "expected"], ["08 71 00", "draft"], ["09 29 00", "approved"]]);
assert.deepEqual(m.counts, { unassigned: 2, multiple: 1, expected: 1, draft: 1, approved: 1, split: 0, "not-applicable": 0 });
assert.match(row["10 28 00"].note, /^No bid form cites it and no trade covers its division\. Check whether it applies, then assign it \(usually Specialties\), split it or mark it not applicable\.$/, "A question for the estimator, not a confirmed omission");
assert.equal(row["07 84 00"].suggest?.name, "Thermal & moisture");
assert.equal(row["06 10 53"].note, "Cited by Drywall and Carpentry: two subs may price it. Keep it in one trade, or record how the work is split.", "Section codes are read with or without spaces");
assert.equal(row["03 30 00"].note, "Its division is Concrete's, but no bid-form line cites it yet.", "A drawing-only line doesn't cite the section; the division is a suggestion");
assert.equal(row["08 71 00"].note, "In a draft Doors line, not approved yet.", "Covered by a draft is not covered by an approved line");
assert.deepEqual([row["09 29 00"].carriedBy[0].published, row["06 10 53"].carriedBy.map(c => c.published)], [true, [false, false]], "Published = the issued bid form cites it");
assert.deepEqual([row["09 29 00"].source, row["09 29 00"].first, row["09 29 00"].last], [{ documentId: "doc-manual", name: "Project manual", revision: 2 }, 400, 420], "Each row links to the manual revision and pages");

// Suffixed sections (10 14 23.16): carried by a line citing the exact code or its parent; a sibling doesn't count.
const signage = [{ section: "10 14 23.16", title: "ROOM-IDENTIFICATION PANEL SIGNAGE", first: 560, last: 563 }, { section: "10 14 23.13", title: "ROOM-IDENTIFICATION SIGNAGE", first: 556, last: 559 }];
const withSign = (source) => ({ ...procurement, packages: [...procurement.packages, pkg("signage", "Signage", "10 14 00")], scopes: [scope("s", "signage", source)] });
assert.deepEqual(R.sectionCoverage({ sections: signage }, withSign("10 14 23.16 · §2.1")).rows.map(r => [r.section, r.status]), [["10 14 23.13", "expected"], ["10 14 23.16", "draft"]], "Exact suffixed code (seen on Jelleff: 10 14 23.16 could never be covered)");
assert.deepEqual(R.sectionCoverage({ sections: signage }, withSign("101423 · signage")).rows.map(r => r.status), ["draft", "draft"], "The parent code carries its children");
assert.equal(R.assignSection(withSign("10 14 23.16"), signage[0], "signage", "Marcel", at).scopes.length, 1, "Already carried: no second line");

// Decisions: not applicable needs a reason; a split needs two different trades, each with its part.
assert.throws(() => R.markNotApplicable({}, "10 28 00", " ", "Marcel", at), /Say why/);
assert.throws(() => R.recordSplit({}, procurement, "06 10 53", [{ packageId: "drywall", portion: "Blocking" }], "Marcel", at), /two or more different trades/);
assert.throws(() => R.recordSplit({}, procurement, "06 10 53", [{ packageId: "drywall", portion: "Blocking" }, { packageId: "drywall", portion: "x" }], "Marcel", at), /two or more different trades/);
assert.throws(() => R.recordSplit({}, procurement, "06 10 53", [{ packageId: "drywall", portion: "Blocking" }, { packageId: "nope", portion: "x" }], "Marcel", at), /no longer exists/);
assert.throws(() => R.recordSplit({}, procurement, "06 10 53", [{ packageId: "drywall", portion: "Blocking" }, { packageId: "carpentry", portion: " " }], "Marcel", at), /Describe each trade/);
let d = R.markNotApplicable({}, "10 28 00", "Owner furnishes and installs toilet accessories", "Marcel", at);
d = R.recordSplit(d, procurement, "06 10 53", [{ packageId: "drywall", portion: "Blocking in partitions" }, { packageId: "carpentry", portion: "All other rough carpentry" }], "Marcel", at);
d = R.markNotApplicable(d, "08 71 00", "Hardware by owner", "Marcel", at);
const md = by(R.sectionCoverage({ sections, manual }, procurement, d).rows);
assert.deepEqual([md["10 28 00"].status, md["10 28 00"].note, md["10 28 00"].conflict], ["not-applicable", "Not applicable: Owner furnishes and installs toilet accessories (Marcel, 2026-10-20).", null]);
assert.deepEqual([md["06 10 53"].status, md["06 10 53"].note, md["06 10 53"].conflict], ["split", "Split: Drywall: Blocking in partitions; Carpentry: All other rough carpentry.", null]);
assert.equal(md["08 71 00"].conflict, "Doors still cites it in the bid form.", "Not applicable while a line still cites it is flagged");
assert.equal(R.sectionCoverage({ sections, manual }, procurement, d).rows[0].section, "08 71 00", "Conflicts come first");
const split3 = R.recordSplit(d, procurement, "06 10 53", [{ packageId: "drywall", portion: "Blocking" }, { packageId: "concrete", portion: "Embeds" }], "Marcel", at);
assert.equal(by(R.sectionCoverage({ sections }, procurement, split3).rows)["06 10 53"].conflict, "No Concrete bid-form line cites it yet. Carpentry also cites it, outside the split.");
assert.equal(R.sectionCoverage({ sections }, procurement, R.clearDecision(d, "10 28 00")).rows.find(r => r.section === "10 28 00").status, "unassigned");
assert.equal(R.clearDecision(d, "99 99 99"), d);

// Assigning adds one draft line citing the section and its pages; repeating it changes nothing.
const assigned = R.assignSection(procurement, row["07 84 00"], "drywall", "Marcel", at);
const added = assigned.scopes.at(-1);
assert.deepEqual([added.packageId, added.title, added.source, added.status, added.origin], ["drywall", "FIRESTOPPING (Section 07 84 00)", "07 84 00 · manual pp. 300–305", "draft", "specification"]);
assert.equal(R.assignSection(assigned, row["07 84 00"], "drywall", "Marcel", at), assigned, "A second click adds no second line");
assert.equal(by(R.sectionCoverage({ sections }, assigned).rows)["07 84 00"].status, "draft");
assert.equal(assigned.packages.find(p => p.id === "drywall").published, procurement.packages[0].published, "The issued bid form is untouched");
assert.throws(() => R.assignSection(procurement, row["07 84 00"], "nope", "Marcel"));

// Warnings before assigning: a published form, an awarded trade.
assert.deepEqual(R.assignmentWarnings(procurement, "carpentry"), []);
assert.deepEqual(R.assignmentWarnings(procurement, "drywall", { awarded: true }), [
  "Drywall's bid form is published (version 2). This adds a draft line; the issued form stays as it is until you republish, and bids on the older version will then need resubmitting.",
  "Drywall is already awarded. Its Exhibit A does not change; agree any added work with the subcontractor separately.",
]);
assert.throws(() => R.assignmentWarnings(procurement, "nope"), /no longer exists/);

console.log(`Section coverage checked: ${m.rows.length} sections; unassigned, multiple, expected, draft, approved, split and not-applicable; decisions with reasons and conflicts; repeat-safe assignment; warnings for published and awarded trades.`);

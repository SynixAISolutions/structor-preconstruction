import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const K = await import("../lib/bid-form-key.ts");
const A = await import("../lib/scope-accuracy.ts");

// ── An invented bid form in the Contractor layout (the real ones stay out of the repository) ──
const form = `Project: Example School
Bid Date: March 2, 2027
Trade: 09 - DRYWALL & CEILINGS
Rev/Date: Date Issued MM-DD-YYYY Bidder:
Desired
Scope
Response
/ Comment
Section 1 - General
1
Acknowledge receipt of the bid documents
Y
Section 2 - Bid Breakdown
1 Base Bid # $
3 Key Cost Breakdown
4 Partitions, Framing, and Sheathing # $
5 Acoustical Ceilings # $
12 Key Quantity Breakdown
13 Partitions, Framing, and Sheathing # LF/SF
17 Corner Guards # EA
Section 3 - Scope of Work
Furnish and Install All Items UON (Unless Otherwise Noted) Y
A Specifications
Division 01 - General Requirements (as applicable to this Bid Package) Y
09 22 16 -Non-Structural Metal Framing Y
09 29 00 - Gypsum Board Y
07 92 00 - Joint Sealants
09 51 13 - Acoustical Panel Ceilings (as applicable to this Bid Package) Y
B Inclusions
1 SPECIFIC SCOPE ITEMS Y
4 Refer to partition types on Drawing A8.1 Y
12
** Furnish and Install All Items UNO (Unless Otherwise Noted) Y
Scope Items to include,
but not necessarily limited to the following:
Subcontractor: _______________ 1 of 2
Project: Example School
Bid Date: March 2, 2027
Trade: 09 - DRYWALL & CEILINGS
32 Gypsum Board:
33
Furnish & install gypsum board at all interior partitions, ceilings and soffits including fire rated
and moisture-resistant board as scheduled Y
38 Include acoustical sealant at tops and bottoms of partitions Y
43 Provide a level 5 finish at all walls scheduled to receive graphics Y
44 Y
45 Acoustical Ceilings and Acoustical Treatments: Y
46 Furnish & install acoustical tile ceilings per the specifications and RCP's Y
50 Include hanger wire and suspended metal grid system Y
70 Rough Carpentry
72 Wood or sheet metal In-wall blocking, including but not limited to the following: Y
76 - At toilet accessories Y
77 - At wall corner guards Y
88 Standard/General Scope of Work
99 Shop dwgs, samples, product data, certs, etc Y
C Exclusions
1 Fire safing at curtainwall slab edges N By Others
2 Fire stopping of penetrations through drywall N By MEP Subcontractor
D Schedule
1 Meet Contractor Schedule Y
Allowances
1
Subcontractor: _______________ 2 of 2`;
const key = K.parseBidForm(form);

assert.equal(key.trade, "09 - DRYWALL & CEILINGS");
assert.deepEqual(key.divisions, [{ number: "01", title: "General Requirements" }]);
assert.deepEqual(key.sections.map(s => [s.number, s.title, s.response]), [
  ["09 22 16", "Non-Structural Metal Framing", "Y"], ["09 29 00", "Gypsum Board", "Y"], ["07 92 00", "Joint Sealants", ""], ["09 51 13", "Acoustical Panel Ceilings", "Y"],
], "Sections with their printed response; the 'as applicable' note is not part of the title");
assert.deepEqual(key.breakdown, [
  { kind: "cost", label: "Partitions, Framing, and Sheathing", unit: "USD" }, { kind: "cost", label: "Acoustical Ceilings", unit: "USD" },
  { kind: "quantity", label: "Partitions, Framing, and Sheathing", unit: "LF/SF" }, { kind: "quantity", label: "Corner Guards", unit: "EA" },
], "Cost and quantity breakdown; the base bid line is not a breakdown");
const kinds = Object.fromEntries(key.items.map(i => [i.id, i.kind]));
assert.deepEqual([kinds["B-1"], kinds["B-4"], kinds["B-*1"], kinds["B-32"], kinds["B-33"], kinds["B-45"], kinds["B-70"], kinds["B-72"], kinds["B-76"]],
  ["header", "reference", "general", "header", "scope", "header", "header", "header", "scope"]);
assert(!key.items.some(i => /Subcontractor:|Project:|Scope Items to include|Meet Contractor Schedule|Acknowledge receipt/.test(i.text)), "Page headers, footers, Section 1 and the schedule are not scope lines");
assert(!key.items.some(i => i.id === "B-12" || i.id === "B-44"), "Empty numbered lines are skipped");
const line = id => key.items.find(i => i.id === id);
assert.equal(line("B-33").text, "Furnish & install gypsum board at all interior partitions, ceilings and soffits including fire rated and moisture-resistant board as scheduled", "A line split across rows is joined");
assert.deepEqual([line("B-33").group, line("B-46").group, line("B-99").group], ["Gypsum Board", "Acoustical Ceilings and Acoustical Treatments", "Standard/General Scope of Work"]);
assert.equal(line("B-76").matchText, "Wood or sheet metal In-wall blocking, including but not limited to the following At toilet accessories", "A list entry is matched with its lead-in");
assert.equal(line("B-38").matchText, line("B-38").text, "A line under a short heading is matched on its own");
assert.deepEqual(K.scopeLines(key).map(i => i.id), ["B-33", "B-38", "B-43", "B-46", "B-50", "B-76", "B-77", "B-99"]);
assert.deepEqual(K.exclusionLines(key).map(i => [i.id, i.text, i.response, i.note]), [["C-1", "Fire safing at curtainwall slab edges", "N", "By Others"], ["C-2", "Fire stopping of penetrations through drywall", "N", "By MEP Subcontractor"]]);

// ── Words: synonyms folded, bid-form filler ignored, plurals singular ──
assert.deepEqual(A.terms("Furnish and install GWB at all partitions"), ["gypsumboard", "partition"]);
assert.deepEqual(A.terms("Install drywall"), A.terms("Provide gypsum wall board"), "GWB, drywall, gypsum (wall) board are one thing");
assert.deepEqual([A.terms("ACT ceilings")[0], A.terms("acoustical panel ceilings")[0], A.terms("ceiling tiles")[0]], ["acousticalceiling", "acousticalceiling", "acousticalceiling"]);
assert.deepEqual([A.terms("FRP-01 panels")[0], A.terms("fiberglass reinforced plastic")[0], A.terms("plastic paneling")[0]], ["frp", "frp", "frp"]);
assert.deepEqual([A.terms("Level 5 finish"), A.terms("level 4")], [["level5", "finish"], ["level4"]], "Finish levels stay distinct");
assert.deepEqual(A.terms("ﬁre-rated ﬁnish"), ["fire", "rated", "finish"], "Ligatures from PDF text are unfolded");
assert.deepEqual(A.sectionOf("09 29 00 · §3.6"), "09 29 00");
assert.equal(A.sectionOf("A3.1 · Ceiling legend"), null);
assert.equal(A.sectionOf("07 42 10.11 · §2.1"), "07 42 10.11");
const decimalKey = { ...key, sections: [{ number: "07 42 10", title: "Illustrative parent section", response: "Y" }] };
const decimalReport = A.scoreScope(decimalKey, [{ id: "child", title: "Provide support framing.", detail: "", source: "07 42 10.11" }], { readSections: ["07 42 10.11"] });
assert.deepEqual([decimalReport.sections[0].read, decimalReport.sections[0].findings, decimalReport.otherSections.length], [true, 1, 0]);

// ── Scoring ──
const f = (id, title, detail = "", source = "09 29 00", status) => ({ id, title, detail, source, status });
const findings = [
  f("f1", "Provide gypsum board at interior partitions, ceilings and soffits.", "Include fire-rated and moisture-resistant board per the partition schedule.", "09 29 00 · §3.2"),
  f("f2", "Seal tops and bottoms of partitions with acoustical sealant.", "", "09 29 00 · §3.4"),
  f("f3", "Provide Level 4 finish on gypsum board exposed to view.", "Tape and sand joints.", "09 29 00 · §3.6"),
  f("f4", "Install suspended acoustical panel ceilings.", "Include hanger wires and metal grid suspension system.", "09 51 13 · §3.3"),
  f("f5", "Submit product data and samples.", "Submit shop drawings for framing.", "09 22 16 · §1.4"),
  f("f6", "Provide firestopping at penetrations through gypsum board partitions.", "", "09 29 00 · §3.5"),
  f("f7", "Protect installed work from weather.", "Keep materials dry.", "09 29 00 · §1.6"),
  f("f8", "Provide in-wall blocking for toilet accessories.", "Fire-retardant treated wood blocking.", "09 29 00 · §3.1", "rejected"),
];
const report = A.scoreScope(key, findings, { readSections: ["09 22 16", "09 29 00", "09 51 13"] });
const v = Object.fromEntries(report.lines.map(l => [l.item.id, [l.verdict, l.best?.findingId ?? null]]));
assert.deepEqual(v["B-33"], ["matched", "f1"], "Gypsum board everywhere it goes");
assert.deepEqual(v["B-38"], ["matched", "f2"], "Acoustical sealant at the partition heads and sills");
assert.equal(v["B-43"][0] !== "matched", true, "A Level 4 finding never confirms the form's Level 5 line");
assert.deepEqual(v["B-46"], ["matched", "f4"]);
assert.deepEqual(v["B-50"], ["matched", "f4"], "One finding may cover several lines");
assert.equal(v["B-76"][0], "missed", "A rejected finding is left out by default");
assert.equal(A.scoreScope(key, findings, { includeRejected: true }).lines.find(l => l.item.id === "B-76").best.findingId, "f8", "…and scored when asked for the raw output");
assert.equal(v["B-77"][0], "missed", "Corner-guard blocking: nothing covers it");
assert.notEqual(v["B-99"][0], "missed", "Shop drawings / product data / samples");
assert.deepEqual(report.conflicts.map(c => [c.finding.id, c.exclusion.id]), [["f6", "C-2"]], "Penetration firestopping is excluded on the form");
assert(report.extras.some(e => e.finding.id === "f7") && !report.extras.some(e => ["f1", "f2", "f4"].includes(e.finding.id)), "Unrelated findings are extra; paired ones are not");
assert(report.extras.every(e => e.best === null || typeof e.best.lineId === "string"));
const lineIdsPaired = report.lines.filter(l => l.verdict === "matched").map(l => l.best.findingId);
assert(!report.extras.some(e => lineIdsPaired.includes(e.finding.id)), "A finding that best-covers a line is never extra");
// A finding that covers a line, but not best, still counts as paired.
const duplicate = A.scoreScope(key, [...findings, f("f9", "Install acoustical tile ceilings with hanger wire and suspended metal grid.", "", "09 51 13")]);
assert(!duplicate.extras.some(e => e.finding.id === "f9" || e.finding.id === "f4"), "Two findings covering the same lines are both paired");
assert.deepEqual(report.sections.map(s => [s.number, s.read, s.findings]), [["09 22 16", true, 1], ["09 29 00", true, 5], ["07 92 00", false, 0], ["09 51 13", true, 1]]);
assert.deepEqual(A.scoreScope(key, findings).sections[0].read, null, "Without the run's sections, 'read' is unknown");
assert.deepEqual(A.scoreScope(key, [f("x", "Provide gypsum board", "", "09 21 16 · §2.1")]).otherSections, [{ number: "09 21 16", findings: 1 }]);
const sum = report.summary;
assert.deepEqual([sum.scopeLines, sum.findings, sum.sectionsListed, sum.sectionsRead, sum.sectionsCited], [8, 7, 4, 3, 3]);
assert.equal(sum.matched + sum.possible + sum.missed, sum.scopeLines);
assert.equal(sum.recall, Math.round((sum.matched / 8) * 1000) / 1000);
assert(sum.recallIfPossibleConfirmed >= sum.recall);
assert.deepEqual(report.groups.find(g => g.group === "Gypsum Board"), { group: "Gypsum Board", lines: 3, matched: report.lines.filter(l => l.item.group === "Gypsum Board" && l.verdict === "matched").length, possible: report.lines.filter(l => l.item.group === "Gypsum Board" && l.verdict === "possible").length });
// Guards against word-overlap false positives.
const lone = A.scoreScope(key, [f("g", "Provide gypsum board.", "", "09 29 00")]);
assert.notEqual(lone.lines.find(l => l.item.id === "B-33").verdict, "matched", "One shared word is never a confirmed match");
// Each threshold on its own, on tiny forms.
const tiny = (...lines) => K.parseBidForm(`B Inclusions\n${lines.map((l, i) => `${i + 1} ${l} Y`).join("\n")}\nC Exclusions`);
const verdicts = (k, finding) => A.scoreScope(k, [f("x", finding)]).lines.map(l => [l.verdict, l.best.score, l.best.shared.length, l.best.of]);
const [halfLine] = verdicts(tiny("Install shaft wall liners"), "Provide shaft wall.");
assert.deepEqual([halfLine[0], halfLine[1] >= A.THRESHOLDS.matched, halfLine[2], halfLine[3]], ["possible", true, 1, 2], "A high score on one of a line's two distinctive words is only possible");
const [diluted] = verdicts(tiny("Furnish gypsum board at partitions ceilings soffits bulkheads coves shafts and columns"), "Gypsum board partitions near the remote annex roofing windows storefront parking curbs and fencing.");
assert.deepEqual([diluted[0] !== "matched", diluted[2] >= 2, diluted[1] < A.THRESHOLDS.matched], [true, true, true], "Two shared words in a weak overall pairing are never a confirmed match");
const common = A.scoreScope(tiny("Partition framing", "Partition board", "Partition sealant", "Partition insulation"), [f("x", "Partition.")]).lines;
assert(common.every(l => l.best.shared.length === 0 && l.best.score >= A.THRESHOLDS.possible && l.verdict === "missed"), "A word every line uses is no evidence, whatever the score");
const empty = A.scoreScope(key, []);
assert.deepEqual([empty.summary.matched, empty.summary.missed, empty.extras, empty.conflicts], [0, 8, [], []]);

console.log(`Scope accuracy checked: bid-form layout (sections, breakdown, lines, lead-ins, exclusions), synonyms and filler, matched/possible/missed, extras, exclusion conflicts, rejected findings, section coverage.`);

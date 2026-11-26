// A trade's bid-form lines from its notes on every drawing sheet (lib/drawing-notes; Danial, 25 Nov: "scan all sheets at
// once and assign every text to the trade it fits"): which notes a trade gets, how they are sent, what the AI may answer
// and what reaches the bid form. Made-up sheets and notes only.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const N = await import("../lib/drawing-notes.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// ── The notes a trade gets ──
const doc = { id: "vol1", name: "Set Vol 1.pdf" };
const rows = [
  { doc, page: 10, sheet: "AD-000", title: "DEMOLITION NOTES" },
  { doc, page: 12, sheet: "AD-111", title: "DEMOLITION PLAN - LEVEL 01" },
  { doc, page: 46, sheet: "A-111", title: "FLOOR PLAN - LEVEL 01" },
  { doc, page: 90, sheet: "S-101", title: "FOUNDATION PLAN" },
];
const key = rows.map(r => `${r.doc.id}:${r.page}`).join("|");
const read = { key, refs: {
  demolition: [
    { docId: "vol1", page: 10, lines: ["D.22 ENTIRE BUILDING AND FOUNDATIONS THIS AREA TO BE REMOVED.", "D.62 DEMOLISH EXISTING SLAB."] },
    { docId: "vol1", page: 12, lines: ["D.62 DEMOLISH EXISTING SLAB.", "D.62 DEMOLISH EXISTING SLAB.", "CONCRETE TO BE REPLACED AS DIRECTED BY ENGINEER"] },
  ],
  concrete: [{ docId: "vol1", page: 90, lines: ["CONCRETE TO BE REPLACED AS DIRECTED BY ENGINEER"] }],
} };
const demo = N.tradeNotes(read, key, rows, "demolition");
assert.deepEqual(demo.map(n => [n.sheet, n.lines.length]), [["AD-000", 2], ["AD-111", 2]], "Every sheet the read sorted notes to, in register order, each note once");
assert.deepEqual(N.tradeNotes(read, key, rows, "demolition", new Set(["vol1:12"])).map(n => n.sheet), ["AD-000"], "A sheet the trade reads whole is left to that reading");
assert.deepEqual(N.tradeNotes(read, "an-older-set", rows, "demolition"), [], "A read of other sheets (an older revision) gives no notes");
assert.deepEqual(N.tradeNotes(null, key, rows, "demolition"), []);
assert.deepEqual(N.tradeNotes(read, key, rows, "painting"), [], "A trade with no notes gets none");

// ── Sent a few dozen sheets at a time ──
const sheets30 = Array.from({ length: 30 }, (_, i) => ({ sheet: `M-${i}`, lines: ["PROVIDE DUCTWORK"] }));
assert.deepEqual(N.noteBatches(sheets30).map(b => b.length), [25, 5]);
const long = Array.from({ length: 3 }, (_, i) => ({ sheet: `L-${i}`, lines: ["x".repeat(20_000)] }));
assert.deepEqual(N.noteBatches(long).map(b => b.length), [1, 1, 1], "A batch stays under the character limit");

// ── The request ──
const job = EXTRA_JOBS["drawing-notes"];
const input = job.parse({ pkg: { id: "demolition", name: "Demolition", code: "02 41 19" }, document: "Set Vol 1.pdf", existing: ["Demolish the 1926 wing in its entirety."], memory: "This contractor's memory: rules.\n- Demolition doesn't carry: Site Demo.",
  sheets: demo.map(n => ({ sheet: n.sheet, title: n.title, page: n.page, lines: n.lines })) });
const [system, user] = job.messages(input);
assert.match(system.content, /One line per distinct piece of work\. When the same work is noted on several sheets, write it once and cite each sheet/);
assert.match(system.content, /Never write work, a product or a value the notes don't state/);
assert.match(user.content, /\[\[sheet AD-111 \| DEMOLITION PLAN - LEVEL 01\]\]\n- D\.62 DEMOLISH EXISTING SLAB\./, "Each sheet's notes, under its sheet");
assert.match(user.content, /Already on this bid form \(don't write this work again\):\n- Demolish the 1926 wing/, "The lines already written");
assert.match(user.content, /Demolition doesn't carry: Site Demo/, "The trade's memory");
assert.throws(() => job.parse({ pkg: { id: "demolition", name: "Demolition" }, document: "x.pdf", sheets: [] }), /Send 1 to 25 sheets/);
assert.throws(() => job.parse({ pkg: { id: "demolition", name: "Demolition" }, document: "x.pdf", sheets: Array.from({ length: 26 }, (_, i) => ({ sheet: `S${i}`, title: "", page: i + 1, lines: ["a"] })) }), /Send 1 to 25 sheets/);

// ── What reaches the bid form ──
const answer = job.screen({ lines: [
  { title: "Demolish the existing slab where keynoted D.62.", detail: "Level 01 demolition plans.", citations: [{ sheet: "AD-000", quote: "D.62 DEMOLISH EXISTING SLAB." }, { sheet: "AD-111", quote: "DEMOLISH EXISTING SLAB" }] },
  { title: "Replace concrete as directed by the engineer.", detail: "", citations: [{ sheet: "AD-111", quote: "CONCRETE TO BE REPLACED AS DIRECTED BY ENGINEER" }] },
  { title: "Remove the existing roof.", detail: "", citations: [{ sheet: "AD-111", quote: "REMOVE EXISTING ROOF" }] },
  { title: "Remove hazardous materials.", detail: "", citations: [{ sheet: "Z-999", quote: "D.62 DEMOLISH EXISTING SLAB." }] },
  { title: "", citations: [] },
] }, input);
assert.deepEqual(answer.drafts.map(d => [d.title, d.source, d.citations.map(c => `${c.sheet} p${c.page}`).join(" ")]), [
  ["Demolish the existing slab where keynoted D.62.", "AD-000", "AD-000 p10 AD-111 p12"],
  ["Replace concrete as directed by the engineer.", "AD-111", "AD-111 p12"],
], "Lines quoting a sheet's notes, citing the drawing file, its page and sheet; the source is the first sheet");
assert.ok(answer.drafts.every(d => d.kind === "scope" && d.packageId === "demolition" && d.citations.every(c => c.document === "Set Vol 1.pdf")));
assert.deepEqual(answer.dropped.map(d => d.what), ["Remove the existing roof.", "Remove hazardous materials."], "A quote that isn't one of the cited sheet's notes, or a sheet that wasn't sent, keeps the line off the bid form");
assert.equal(new Set(answer.drafts.map(d => d.key)).size, answer.drafts.length, "Keys are unique");

// ── Removal shown on the demolition sheets is the demolition trade's (Whittier Drywall, 25 Nov: "Remove the existing gypsum bulkheads") ──
{
  const notes = [
    { doc, page: 10, sheet: "AD-000", title: "DEMOLITION - GENERAL NOTES", discipline: "Architectural demolition", lines: ["D.57 REMOVE EXISTING GYPSUM BULKHEADS"] },
    { doc, page: 46, sheet: "A-413", title: "INTERIOR ELEVATIONS - LIBRARY", discipline: "Architectural", lines: ["REMOVE AND REINSTALL CEILING TILES"] },
  ];
  const cite = sheet => ({ document: doc.name, page: 1, sheet, quote: "x" });
  const lines = [
    { kind: "scope", key: "n1", packageId: "drywall", title: "Remove the existing gypsum bulkheads where keynoted D.57.", detail: "", source: "AD-000", citations: [cite("AD-000")] },
    { kind: "scope", key: "n2", packageId: "drywall", title: "Remove existing ceiling tiles and reinstall them after the work.", detail: "", source: "AD-000", citations: [cite("AD-000")] },
    { kind: "scope", key: "n3", packageId: "drywall", title: "Remove damaged gypsum board at the library and patch.", detail: "", source: "A-413", citations: [cite("A-413")] },
    { kind: "region", key: "r1", packageId: "drywall", sheet: "AD-000", label: "x", polygon: [], confidence: 1, citations: [], scopeKeys: ["n1"] },
  ];
  const demolition = { id: "demolition", name: "Demolition" };
  const left = N.leaveRemovals(lines, { id: "drywall", name: "Drywall" }, notes, demolition);
  assert.deepEqual(left.drafts.map(d => d.key), ["n2", "n3"], "Removal on a demolition sheet goes (with its highlight); remove-and-reinstall, and removal shown on another sheet, stay");
  assert.equal(left.dropped[0].reason, "Removing existing work shown on the demolition sheets is Demolition's, so this line is left to that trade.");
  assert.equal(N.leaveRemovals(lines, { id: "drywall", name: "Drywall" }, notes, null).drafts.length, lines.length, "No demolition trade on the project: the line stays");
  assert.equal(N.leaveRemovals(lines, demolition, notes, demolition).drafts.length, lines.length, "The demolition trade keeps its own removals");
  assert.equal(N.tradeNotes(read, key, rows.map(r => ({ ...r, discipline: r.sheet.startsWith("AD") ? "Architectural demolition" : "Architectural" })), "demolition")[0].discipline, "Architectural demolition", "A note carries its sheet's discipline");
}

console.log("Drawing notes checked: the notes the read of every sheet sorted to a trade (in order, once each, not on the sheets it reads whole, only from a read of these sheets), batches, the request (lines once across sheets, nothing the notes don't state, the lines already written, the trade's memory), only lines quoting a sent sheet's notes reaching the bid form, and removal on the demolition sheets left to the demolition trade.");

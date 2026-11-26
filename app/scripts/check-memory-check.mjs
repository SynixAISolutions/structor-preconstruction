// Every line the contractor's memory gives a trade, checked against the project on every scan (Danial, 24 Nov: "it
// should be in memory so it is compared and looked for in every scan for the respective trade, and extract matching
// information"): which lines are looked for, on which pages, what the AI may answer, and what reaches the bid form.
// Made-up lines and pages only.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const K = await import("../lib/memory-check.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

const entry = (o) => ({ id: o.text, kind: "example", status: "approved", origin: "import", projectId: null, trades: ["09 29 00", "drywall"], section: null, detail: "", seen: 1, events: ["import:x"], source: {}, history: [], version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", ...o });
const dw = { code: "09 29 00", name: "Drywall" };

// ── The trade's lines ──
const entries = [
  entry({ text: "Provide Level 4 finish at gypsum board exposed to view." }),
  entry({ text: "Provide level 4 finish at gypsum board exposed to view" }),
  entry({ text: "Comply with specified R-values for batt insulation in partitions.", detail: 'Under "Insulation"' }),
  entry({ text: "Receiving and installation of materials furnished by others, including the following:", detail: "Access doors and frames; Toilet accessories." }),
  entry({ text: "Install FRP wall panels at janitor closets." }),
  entry({ text: "Furnish and install FRP wall panels at the janitor closets" }),
  entry({ text: "- At wall corner guards", detail: 'Under "Wood or sheet metal in-wall blocking, including but not limited to the following:"' }),
  entry({ text: "- At parapet", detail: 'Under "Wood or sheet metal in-wall blocking, including but not limited to the following:"' }),
  entry({ text: "Drywall doesn't carry: Painting.", kind: "rule" }),
  entry({ text: "A proposal not approved yet.", status: "proposed" }),
  entry({ text: "Paint all gypsum board.", trades: ["09 91 23", "painting"] }),
  entry({ text: "A correction, not an import.", origin: "correction" }),
];
const lines = K.tradeLines(entries, dw, "p1");
assert.deepEqual(lines.map(l => [l.id, l.text, l.detail]), [
  ["L1", "Provide Level 4 finish at gypsum board exposed to view.", ""],
  ["L2", "Comply with specified R-values for batt insulation in partitions.", 'On the bid form under "Insulation"'],
  ["L3", "Receiving and installation of materials furnished by others, including the following:", "Access doors and frames; Toilet accessories."],
  ["L4", "Install FRP wall panels at janitor closets.", ""],
  ["L5", "Wood or sheet metal in-wall blocking, including but not limited to the following: At wall corner guards", ""],
  ["L6", "Wood or sheet metal in-wall blocking, including but not limited to the following: At parapet", ""],
], "The trade's approved scope lines from its bid forms and checklists, each once (two forms wording the same work count once); a bullet reads with its heading, another line keeps it as context; a lead-in keeps its items; not its exclusions, another trade's, a proposal or a correction");

// ── Which pages each line is looked for on ──
const page = (document, page, text, where, sheet = null) => ({ document, page, text, where, sheet });
const pages = [
  page("Manual.pdf", 440, "3.6 FINISHING. B. Level 4: At panel surfaces that will be exposed to view unless otherwise indicated. Gypsum board finish levels.", "09 29 00"),
  page("Manual.pdf", 441, "2.4 INSULATION. Batt insulation in partitions: R-13 minimum thermal resistance, R-values as specified for sound attenuation.", "09 29 00"),
  page("Manual.pdf", 442, "2.5 ACCESS DOORS AND FRAMES furnished under Section 08 31 13 and installed in gypsum board partitions; toilet accessories installed by the drywall installer.", "09 29 00"),
  page("Drawings.pdf", 12, "GENERAL NOTES: PROVIDE LEVEL 5 FINISH AT LOBBY WALLS. GYPSUM BOARD EXPOSED TO VIEW.", "A-501", "A-501"),
];
const frp = { text: "Install FRP wall panels at janitor closets and showers", source: "06 64 00", cites: ["Manual.pdf#300"] };
const level = { text: "Tape and finish gypsum board joints to Level 4", source: "09 29 00 · §3.6", cites: ["Manual.pdf#440"] };
const plan = K.planLineCheck(lines.slice(0, 4), pages, [frp, level]);
assert.deepEqual([plan.covered, plan.checked, plan.unplaced.map(l => l.id)], [1, 3, []], "A line the reading already wrote isn't checked again");
assert.deepEqual(plan.requests.map(r => [r.document, r.pages.map(p => p.page), r.lines.map(l => l.id), r.existing]), [
  ["Drawings.pdf", [12], ["L1"], []],
  ["Manual.pdf", [440, 441, 442], ["L1", "L2", "L3"], ["Tape and finish gypsum board joints to Level 4"]],
], "Each line goes with the pages sharing most of its words (at most two); each file's pages are sent together with the lines pointing at them and what the bid form already has from them");
// The rarer shared word decides: "R-values" (one word) is on one page, "gypsum" and "board" on most.
const ranked = K.planLineCheck([{ id: "R", text: "Comply with specified R-values at gypsum board partitions", detail: "" }],
  [page("M.pdf", 1, "gypsum board partitions gypsum board", "09 29 00"), page("M.pdf", 2, "gypsum board partitions", "09 29 00"), page("M.pdf", 3, "gypsum board partitions", "09 29 00"), page("M.pdf", 9, "Insulation R-value R-13 in partitions", "07 21 00")], []);
assert.deepEqual(ranked.requests.flatMap(r => r.pages.map(p => p.page)), [1, 9], "Pages ranked by their rarer shared words");
// A bullet is looked for by its own item: the heading's words ("receive, unload, catalogue, store") are on every
// installed product's pages, so they only break ties. Plurals count as one word; a page about the item says it often.
const R = 'Under "Receive, Unload, Catalogue, Store, and Install Only the following items"';
const bullets = K.tradeLines([entry({ text: "- Toilet accessories", detail: R }), entry({ text: "- Markerboards, tackboards", detail: R }), entry({ text: "- Wood doors", detail: R })], dw, "p1");
assert.deepEqual(bullets.map(l => [l.text, l.focus]), [
  ["Receive, Unload, Catalogue, Store, and Install Only the following items: Toilet accessories", "Toilet accessories"],
  ["Receive, Unload, Catalogue, Store, and Install Only the following items: Markerboards, tackboards", "Markerboards, tackboards"],
  ["Receive, Unload, Catalogue, Store, and Install Only the following items: Wood doors", "Wood doors"],
], "A bullet reads with its heading and is looked for by its item");
const product = [
  page("M.pdf", 700, "Door hardware: receive, unload, catalogue and store hardware; wood door and hollow metal door hardware sets.", "08 71 00"),
  page("M.pdf", 719, "FLUSH WOOD DOORS. Wood doors, five-ply. Factory-finished wood doors. Install wood doors per WDMA.", "08 14 16"),
  page("M.pdf", 1049, "VISUAL DISPLAY UNITS. Porcelain-enamel markerboard; vinyl-fabric tackboard.", "10 11 00"),
  page("M.pdf", 1089, "TOILET ACCESSORIES. Grab bars, mirrors and toilet accessories; install accessories plumb and level.", "10 28 00"),
];
const pagesOf = focus => K.planLineCheck(bullets.filter(l => l.focus === focus), product, []).requests.flatMap(r => r.pages.map(p => p.page));
assert.deepEqual([pagesOf("Toilet accessories"), pagesOf("Markerboards, tackboards"), pagesOf("Wood doors")], [[1089], [1049], [700, 719]],
  "Each item on its own pages (markerboards on the markerboard page), not only on the hardware page that shares the heading's words");
const none = K.planLineCheck([{ id: "L9", text: "Provide seismic bracing for ceiling grids.", detail: "" }], pages, []);
assert.deepEqual([none.requests.length, none.unplaced.map(l => l.id)], [0, ["L9"]], "A line no page mentions costs no AI request: nothing on this project calls for it");
// Five pages a request at most, 40 lines at most.
const many = Array.from({ length: 7 }, (_, i) => page("Manual.pdf", i + 1, "gypsum board level finish partitions insulation", "09 29 00"));
const manyLines = Array.from({ length: 45 }, (_, i) => ({ id: `L${i + 1}`, text: `Gypsum board partitions with level finish ${i}`, detail: "" }));
const big = K.planLineCheck(manyLines, many, []);
assert(big.requests.every(r => r.pages.length <= K.CHECK_LIMITS.pages && r.lines.length <= K.CHECK_LIMITS.lines) && big.requests.length === 2, "Within a request's limits");

// ── The AI request ──
const job = EXTRA_JOBS["memory-check"];
assert.ok(job, "The AI route knows the job");
const input = job.parse({ trade: "Drywall", code: "09 29 00", document: "Manual.pdf", pages: plan.requests[1].pages, lines: plan.requests[1].lines, existing: plan.requests[1].existing });
assert.throws(() => job.parse({ trade: "Drywall", document: "x", pages: [], lines: lines }), /Send 1 to 5 pages/);
assert.throws(() => job.parse({ trade: "Drywall", document: "x", pages: pages.slice(0, 1), lines: [] }), /Send 1 to 40 lines/);
const [system, user] = job.messages(input);
assert(system.content.includes("Which trade carries the work comes from the contractor's line, not from the pages") && system.content.includes("a line setting a requirement")
  && system.content.includes("Never write a line, a value or a product the pages don't support") && system.content.includes("a line already on the bid form covers the same work")
  && user.content.includes("L2. Comply with specified R-values") && user.content.includes("[[page 441]] 09 29 00") && user.content.includes("Already on this bid form from these pages (don't write this work again):\n- Tape and finish gypsum board joints to Level 4"),
  "The AI is told to write only what the pages support and the bid form doesn't have, and gets the lines, the pages and what the form has");
const screened = job.screen({ found: [
  { line: "L1", title: "Provide Level 4 finish at gypsum board exposed to view.", detail: "", page: 440, quote: "Level 4: At panel surfaces that will be exposed to view unless otherwise indicated." },
  { line: "L2", title: "Provide R-13 batt insulation in partitions.", detail: "R-13 minimum.", page: 441, quote: "R-30 minimum thermal resistance for all walls in the building" },
  { line: "L77", title: "A line it wasn't asked about.", page: 440, quote: "Level 4: At panel surfaces that will be exposed to view" },
  { line: "L3", title: "Install access doors and frames furnished by others in gypsum board partitions.", detail: "", page: 442, quote: "ACCESS DOORS AND FRAMES furnished under Section 08 31 13 and installed in gypsum board partitions" },
] }, input);
assert.deepEqual([screened.found.map(f => [f.line, f.page]), screened.dropped.map(d => d.what)], [[["L1", 440], ["L3", 442]], ["Provide R-13 batt insulation in partitions."]],
  "Only answers whose quote is printed on the cited page, for lines it was asked about");

// ── What reaches the bid form ──
const drafts = K.lineCheckDrafts([
  { request: plan.requests[0], found: [{ line: "L1", title: "Provide Level 5 finish at lobby walls.", detail: "", page: 12, quote: "PROVIDE LEVEL 5 FINISH AT LOBBY WALLS" }] },
  { request: plan.requests[1], found: [...screened.found, { line: "L1", title: "Provide Level 4 finish again.", detail: "", page: 440, quote: "x" }] },
], "dw", [frp]);
assert.deepEqual(drafts.map(d => [d.key, d.title, d.source, d.citations[0].page, d.citations[0].sheet]), [
  ["memory-1", "Provide Level 5 finish at lobby walls.", "A-501 · your bid forms", 12, "A-501"],
  ["memory-2", "Install access doors and frames furnished by others in gypsum board partitions.", "09 29 00 · your bid forms", 442, null],
], "Each line once, its first answer; written as this project's pages say it, citing the page and where it is");
assert.deepEqual(K.lineCheckDrafts([{ request: plan.requests[1], found: [{ line: "L4", title: "Install FRP wall panels at janitor closets.", detail: "", page: 440, quote: "q" }] }], "dw", [frp]), [],
  "Nothing the reading already wrote");

console.log("Memory check: the trade's lines from its bid forms and checklists, the pages each is looked for on (no AI for a line no page mentions), the AI's request and what it may answer (only what a cited page prints), and the lines that reach the bid form.");

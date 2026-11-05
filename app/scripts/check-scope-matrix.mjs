import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const M = await import("../lib/scope-matrix.ts");
const P = await import("../lib/procurement.ts");

// The scope matrix (Marcel's process doc): every scope item in one place, and the crossovers between trades.

const by = "Marcel Khoury", at = "2026-11-05T10:00:00.000Z";
const trade = (id, name, code, owner = "") => ({ id, name, code, division: code.slice(0, 2), owner, due: "" });
const packages = [trade("drywall", "Drywall", "09 29 00", "Dana"), trade("masonry", "Masonry", "04 20 00", "Sam"), trade("metals", "Misc metals", "05 50 00", "Dana"), trade("mine", "Roofing", "07 50 00", by), trade("paint", "Painting", "09 91 23")];
let state = { packages, scopes: [], invitations: [], outreach: [], notifications: [] };
const add = (packageId, title, source = "") => { state = P.addScope(state, { packageId, title, source, origin: "ai" }, "Structor AI", at); return state.scopes.at(-1).id; };
const brick = add("masonry", "Brick veneer", "04 20 00");
const firestop = add("drywall", "Firestopping, at rated walls.");
const firestop2 = add("masonry", "firestopping at rated walls");
const gyp = add("drywall", "Gypsum board, Type X");
const dust = add("paint", "Dust protection");
state = P.applyScopeToAllTrades(state, dust, by, at);
state = P.approveScope(state, gyp, by, at);
const base = { runId: "r", citations: [], reviewedBy: null, reviewedAt: null, rejection: null, history: [], detail: "", source: "A1.1", original: null, acceptedId: null, kind: "scope" };
const drafts = [
  { ...base, id: "waiting", packageId: "masonry", title: "Cast stone sills", status: "pending-review" },
  { ...base, id: "unprinted", packageId: "drywall", title: "Level 5 finish", status: "pending-review", citations: [{ verification: "not-printed" }] },
  { ...base, id: "said-no", packageId: "drywall", title: "Rejected", status: "rejected" },
  { ...base, id: "deleted", packageId: "drywall", title: "Deleted", status: "pending-review", removed: true },
  { ...base, id: "accepted", packageId: "drywall", title: "Accepted", status: "accepted" },
  { id: "region", kind: "region", packageId: "drywall", status: "pending-review", citations: [], title: "Not a scope" },
];

// ── Every item in one place ──
const rows = M.matrixRows(state, drafts);
assert.deepEqual(rows.map(r => r.title), ["Dust protection", "Brick veneer", "firestopping at rated walls", "Cast stone sills", "Firestopping, at rated walls.", "Gypsum board, Type X", "Level 5 finish"],
  "Lines and waiting proposals, in CSI order with the lines every trade carries first; rejected, deleted and accepted findings and regions are left out");
assert.deepEqual(rows.map(r => [r.kind, r.status]), [["line", "draft"], ["line", "draft"], ["line", "draft"], ["proposal", "proposal"], ["line", "draft"], ["line", "approved"], ["proposal", "proposal"]]);
const row = id => rows.find(r => r.id === id);
assert.deepEqual([row(dust).packageId, row(dust).trade], [null, "Every trade"]);
assert.deepEqual([row(brick).code, row(brick).trade, row(brick).owner, row(brick).source], ["04 20 00", "Masonry", "Sam", "04 20 00"]);
assert.equal(row("unprinted").notPrinted, true, "A proposal not printed on its sheet is flagged");
assert.equal(row("waiting").notPrinted, false);
assert.deepEqual([row(firestop).alsoIn, row(firestop2).alsoIn, row(brick).alsoIn, row(dust).alsoIn], [["Masonry"], ["Drywall"], [], []], "The same words in two trades, whatever the punctuation");
assert.deepEqual(M.matrixSummary(rows), { total: 7, toReview: 6, approved: 1, proposals: 2, shared: 2 });

// ── Filters ──
const all = { view: "All", packageId: "", owner: "", query: "" };
const titles = f => M.filterMatrix(rows, { ...all, ...f }).map(r => r.title);
assert.equal(titles({}).length, 7);
assert.deepEqual(titles({ view: "Approved" }), ["Gypsum board, Type X"]);
assert.equal(titles({ view: "To review" }).length, 6, "Drafts and AI proposals both still need someone");
assert.equal(titles({ view: "In more than one trade" }).length, 2);
assert.deepEqual(titles({ packageId: "masonry" }), ["Brick veneer", "firestopping at rated walls", "Cast stone sills"]);
assert.deepEqual(titles({ packageId: M.EVERY_TRADE }), ["Dust protection"]);
assert.deepEqual(titles({ owner: "Dana" }), ["Firestopping, at rated walls.", "Gypsum board, Type X", "Level 5 finish"]);
assert.deepEqual(titles({ owner: M.NO_OWNER }), [], "Every trade's lines aren't 'no owner'");
assert.deepEqual(titles({ query: "masonry cast" }), ["Cast stone sills"], "Every word has to match, in the item or its trade");
assert.deepEqual(titles({ query: "a1.1" }), ["Cast stone sills", "Level 5 finish"], "Sources are searched");

// ── Moving ──
const unread = s => s.notifications.filter(n => n.recipient === "Sam").length;
const start = state.notifications.length;
const many = M.moveLines(state, [firestop, gyp], "masonry", by, at);
assert.deepEqual([many.scopes.find(s => s.id === firestop).packageId, many.scopes.find(s => s.id === gyp).status], ["masonry", "draft"], "A moved line returns to draft for review");
assert.equal(many.notifications.length, start + 1, "The receiving estimator is tagged once, not once a line");
assert.equal(unread(many) - unread(state), 1);
assert.match(many.notifications.at(-1).text, /moved 2 scope items to Masonry/);
const one = M.moveLines(state, [firestop], "masonry", by, at);
assert.match(one.notifications.at(-1).text, /"Firestopping, at rated walls\." from Drywall to Masonry/, "One line reads as moveScope words it");
assert.equal(M.moveLines(state, [brick], "masonry", by, at), state, "A line already there stays as it is");
assert.equal(M.moveLines(state, [dust], "masonry", by, at).scopes.find(s => s.id === dust).allTrades, false, "A line every trade carries can go to one trade");
assert.throws(() => M.moveLines(state, [brick], "gone", by, at), /no longer exists/);

// ── Adding what's missing ──
const added = M.addMatrixItem(state, { packageId: "masonry", title: " Mock-up panel ", detail: "From the 3 Nov meeting", source: "Meeting" }, by, at);
const line = added.scopes.at(-1);
assert.deepEqual([line.title, line.detail, line.source, line.origin, line.status, line.packageId], ["Mock-up panel", "From the 3 Nov meeting", "Meeting", "estimator", "draft", "masonry"]);
assert.match(added.notifications.at(-1).text, /added "Mock-up panel" to Masonry/);
assert.equal(added.notifications.at(-1).recipient, "Sam");
assert.equal(M.addMatrixItem(state, { packageId: "mine", title: "Mine" }, by, at).notifications.length, start, "Nobody is tagged about their own change");
assert.equal(M.addMatrixItem(state, { packageId: "paint", title: "No owner" }, by, at).notifications.length, start, "A trade with no owner tags nobody");
assert.throws(() => M.addMatrixItem(state, { packageId: "masonry", title: "BRICK veneer." }, by, at), /Masonry already has this item/);
assert.throws(() => M.addMatrixItem(state, { packageId: "masonry", title: "  " }, by, at), /Describe/);

// ── Crossovers: Marcel's example ──
const input = { item: "Masonry façade anchors.", usualId: "masonry", furnishId: "metals", installId: "drywall", reason: "Cheaper than the mason buying and setting them" };
const made = M.addCrossover(state, [], input, by, at);
const lines = made.state.scopes.slice(-3);
assert.deepEqual(lines.map(l => [l.packageId, l.title]), [
  ["metals", "Furnish Masonry façade anchors; Drywall installs."],
  ["drywall", "Install Masonry façade anchors; Misc metals furnishes."],
  ["masonry", "Excludes Masonry façade anchors: Misc metals furnishes, Drywall installs."],
], "Each trade's bid form says its half");
assert(lines.every(l => l.status === "draft" && l.origin === "estimator" && l.source === "Scope matrix" && l.detail === input.reason));
assert.deepEqual(made.crossover.lineIds, lines.map(l => l.id));
assert.deepEqual([made.crossover.item, made.crossover.usualId, made.crossover.by], ["Masonry façade anchors", "masonry", by]);
const tags = made.state.notifications.slice(start);
assert.deepEqual(tags.map(n => n.recipient), ["Dana", "Sam"], "Each owner once: Dana owns both Misc metals and Drywall");
assert.deepEqual(M.crossoverLines("Anchors", packages[2], packages[2], null), [{ packageId: "metals", title: "Furnish and install Anchors." }], "One trade doing both");
assert.equal(M.crossoverLines("Anchors", packages[2], packages[0], packages[2]).length, 2, "No exclusion for a trade that carries it");
assert.throws(() => M.addCrossover(state, [], { ...input, item: " . " }, by, at), /Describe the item/);
assert.throws(() => M.addCrossover(state, [], { ...input, installId: "" }, by, at), /who furnishes/);
assert.throws(() => M.addCrossover(state, [], { ...input, usualId: "gone" }, by, at), /no longer exists/);
assert.throws(() => M.addCrossover(made.state, [made.crossover], input, by, at), /already recorded/);
assert.throws(() => M.addCrossover(made.state, [made.crossover], { ...input, item: "masonry facade anchors" }, by, at), /already recorded/, "With or without the accent");
const madeRows = M.matrixRows(made.state, []);
assert.equal(M.filterMatrix(madeRows, { ...all, query: "facade anchors" }).length, 3, "Search finds façade typed without the accent");
assert.equal(M.filterMatrix(madeRows, { ...all, query: "FAÇADE" }).length, 3, "And with it, in any case");
let later = P.approveScope(made.state, lines[0].id, by, at);
later = { ...later, scopes: later.scopes.filter(s => s.id !== lines[2].id) };
assert.deepEqual(M.crossoverProgress(made.crossover, later), { lines: 3, approved: 1, gone: 1 }, "Its lines are followed in the bid forms");

// ── Export ──
const csv = M.matrixCsv(rows);
assert.deepEqual(csv[0], ["CSI", "Trade", "Owner", "Scope item", "Detail", "Source", "Origin", "Status", "Also in"]);
assert.deepEqual(csv.find(r => r[3] === "Level 5 finish").slice(6, 8), ["ai", "Check the sheet"]);
assert.equal(csv.find(r => r[3] === "Brick veneer")[7], "To review");
assert.equal(csv.find(r => r[3] === "firestopping at rated walls")[8], "Drywall");

// ── A big project stays quick: the real run had 2,312 lines ──
let big = { ...state, scopes: Array.from({ length: 3000 }, (_, i) => ({ ...state.scopes[0], id: `s${i}`, packageId: packages[i % 5].id, title: `Line ${i % 2000}` })) };
const started = performance.now();
assert.equal(M.matrixRows(big, drafts).length, 3002);
assert(performance.now() - started < 500, "3,000 lines are listed in well under a second");

console.log("Scope matrix checked: every item in one place, filters, moves that tag once, added items, Marcel's façade anchor crossover, and export.");

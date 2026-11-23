// The AI memory (Danial, 23 Nov: "an AI agent that keeps context always so for next scan or extract it knows exactly
// what to extract"; "make sure the data is indexed for AI to be able to read easily"). Its rules, what a scan reads,
// what corrections teach it, and its table run against a real Postgres (PGlite), indexes included.
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

register("./ts-resolver.mjs", import.meta.url);
const M = await import("../lib/memory.ts");
const L = await import("../lib/memory-learn.ts");
const S = await import("../lib/memory-store.ts");
const J = await import("../lib/ai-jobs.ts");
const D = await import("../lib/drawing-ai.ts");
const X = await import("../lib/extraction.ts");
const { PGlite } = await import("@electric-sql/pglite");

const fails = (fn, pattern) => assert.throws(fn, e => e instanceof M.MemoryRuleError && pattern.test(e.message), `expected ${pattern}`);
const entry = (o) => ({ id: o.id ?? o.text, kind: "rule", status: "approved", origin: "estimator", projectId: null, trades: [], section: null, detail: "", seen: 1, events: [], source: {}, history: [], version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", ...o });

// ── What an entry may hold ──
assert.deepEqual(M.tradeTags({ code: "08 11 13", name: "Doors, frames & hardware" }), ["08 11 13", "doors frames and hardware"], "A trade is tagged by its code and its name, so another project's package code still finds it");
const rule = M.cleanMemoryInput({ kind: "rule", text: "  Put acoustic   ceiling panels in Drywall. ", trades: ["09 29 00", "drywall", "drywall"], section: "09 51 13", source: { projectId: "p1", "bad key": "x" } });
assert.deepEqual([rule.text, rule.trades, rule.section, rule.status, rule.origin, rule.projectId, rule.source], ["Put acoustic ceiling panels in Drywall.", ["09 29 00", "drywall"], "09 51 13", "approved", "estimator", null, { projectId: "p1" }], "An estimator's entry is in use at once");
assert.equal(M.cleanMemoryInput({ kind: "rule", text: "Leave out X.", origin: "correction", events: ["e1"] }).status, "proposed", "One learned from a correction waits for review");
fails(() => M.cleanMemoryInput({ kind: "note", text: "Something" }), /rule, an example or a project decision/);
fails(() => M.cleanMemoryInput({ kind: "rule", text: "no" }), /Write what the AI should know/);
fails(() => M.cleanMemoryInput({ kind: "decision", text: "Owner provides FF&E." }), /belongs to one project/);
fails(() => M.cleanMemoryInput({ kind: "rule", text: "Ceilings rule", section: "0951" }), /09 51 13/);
assert.equal(M.dedupeKey({ kind: "rule", text: "Put ceiling panels in Drywall!", trades: ["drywall", "09 29 00"] }), M.dedupeKey({ kind: "rule", text: "put ceiling panels in drywall", trades: ["09 29 00", "Drywall"] }), "The same lesson, whatever its case, punctuation or trade order");
assert.notEqual(M.dedupeKey({ kind: "rule", text: "Leave out X", projectId: "p1" }), M.dedupeKey({ kind: "rule", text: "Leave out X" }), "A project's lesson is not the company's");

// ── What a scan reads: contextPack ──
const target = { projectId: "p1", code: "09 29 00", name: "Drywall" };
const entries = [
  entry({ text: "Owner provides FF&E.", kind: "decision", projectId: "p1" }),
  entry({ text: "Other project's decision.", kind: "decision", projectId: "p2" }),
  entry({ text: "Put acoustic ceiling panels in Drywall, not Acoustical ceilings.", trades: ["09 51 13", "acoustical ceilings", "09 29 00", "drywall"], seen: 3 }),
  entry({ text: "Carry shaft wall at stairs.", trades: ["drywall"] }),
  entry({ text: "Concrete only rule.", trades: ["03 30 00", "concrete"] }),
  entry({ text: "Every trade cleans up daily.", trades: [] }),
  entry({ text: "Furnish and install metal stud framing, full height to structure.", kind: "example", trades: ["09 29 00"], detail: "Instead of the AI's: Provide framing" }),
  entry({ text: "Proposed, not reviewed yet.", status: "proposed", trades: ["drywall"] }),
  entry({ text: "Retired lesson.", status: "retired" }),
];
const pack = M.contextPack(entries, target);
assert.deepEqual(pack.split("\n"), [
  "This contractor's memory: rules and examples its estimators approved on earlier projects and reviews.",
  "Decisions on this project:", "- Owner provides FF&E.",
  "Rules for Drywall:", "- Put acoustic ceiling panels in Drywall, not Acoustical ceilings.", "- Carry shaft wall at stairs.",
  "Rules for every trade:", "- Every trade cleans up daily.",
  "How Drywall lines are worded on this contractor's bid forms:", "- Furnish and install metal stud framing, full height to structure. (Instead of the AI's: Provide framing)",
], "This project's decisions, the trade's rules (most confirmed first), every trade's, then wording; never proposed, retired, another project's or another trade's");
assert.equal(M.contextPack(entries, { projectId: "p1", code: "21 13 13", name: "Fire protection" }).split("\n").filter(l => l.startsWith("- ")).length, 2, "A trade with no rules of its own still gets the project's decisions and every trade's rules");
assert.equal(M.contextPack([entries[7], entries[8]], target), "", "Nothing approved applies: no memory, the scan reads as before");
const tight = M.contextPack(entries, target, 330);
assert(tight.includes("Owner provides FF&E.") && !tight.includes("Furnish and install") && /\(\d+ more not shown/.test(tight) && tight.length <= 400, "Over the limit, the most specific stays and the examples give way, and it says so");

// ── In the AI's requests: nothing changes without memory ──
const job = { pkg: { id: "drywall", name: "Drywall", code: "09 29 00" }, document: "Manual.pdf", section: { section: "09 29 00", title: "Gypsum Board" }, pages: [{ page: 4, text: "Level 4 finish at walls exposed to view." }] };
const plain = J.scopeMessages(J.parseScopeJob(job));
assert.deepEqual(J.scopeMessages(J.parseScopeJob({ ...job, memory: "" })), plain, "An empty memory sends exactly the request it sent before");
const withMemory = J.scopeMessages(J.parseScopeJob({ ...job, memory: pack }));
assert(withMemory[0].content.includes(M.MEMORY_PROMPT_RULE) && !plain[0].content.includes(M.MEMORY_PROMPT_RULE), "The rule for reading it is added only when memory is sent");
assert(withMemory[1].content.indexOf("Contractor's memory") < withMemory[1].content.indexOf("[[page 4]]") && withMemory[1].content.includes("Owner provides FF&E."), "The memory comes before the pages it guides");
assert.throws(() => J.parseScopeJob({ ...job, memory: "x".repeat(M.MEMORY_REQUEST_CHARS + 1) }), /too long/);
const sheet = { pkg: { id: "drywall", name: "Drywall", code: "09 29 00" }, document: "Drawings.pdf", sheet: "A1.1", page: 3, text: "PARTITION TYPE P3", image: "data:image/jpeg;base64,/9j/AAAA" };
const drawn = D.drawingMessages(D.parseDrawingJob({ ...sheet, memory: pack }));
assert(drawn[0].content.includes(M.MEMORY_PROMPT_RULE) && drawn[1].content[0].text.includes("Owner provides FF&E.") && drawn[1].content[0].text.indexOf("Contractor's memory") < drawn[1].content[0].text.indexOf("Readable page text"), "Drawing reads carry it too");
assert.deepEqual(D.drawingMessages(D.parseDrawingJob(sheet)), D.drawingMessages(D.parseDrawingJob({ ...sheet, memory: null })), "and without it read exactly as before");
assert.throws(() => D.parseDrawingJob({ ...sheet, memory: 42 }), /too long/);

// ── What corrections teach ──
const pkgs = [
  { id: "ceilings", name: "Acoustical ceilings", code: "09 51 13", division: "09", owner: "", due: "" },
  { id: "drywall", name: "Drywall", code: "09 29 00", division: "09", owner: "", due: "" },
  { id: "openings", name: "Doors, frames & hardware", code: "08 11 13", division: "08", owner: "", due: "" },
];
const line = (id, packageId, title, history) => ({ id, packageId, title, detail: "", source: "", origin: "ai", status: "draft", allTrades: false, history });
const procurement = { packages: pkgs, invitations: [], outreach: [], notifications: [], scopes: [
  line("s1", "drywall", "Provide acoustic ceiling panels.", [{ kind: "moved", at: "t1", by: "Sadie", from: "ceilings", to: "drywall" }]),
  line("s2", "drywall", "Moved by the AI itself", [{ kind: "moved", at: "t1", by: X.AI_ACTOR, from: "ceilings", to: "drywall" }]),
  line("s3", "drywall", "From a combined trade", [{ kind: "moved", at: "t1", by: "Sadie", from: "gone", to: "drywall" }]),
  line("s4", "ceilings", "Moved there and back", [{ kind: "moved", at: "t1", by: "Sadie", from: "ceilings", to: "drywall" }, { kind: "moved", at: "t2", by: "Sadie", from: "drywall", to: "ceilings" }]),
] };
const ARCH = "Drawings.pdf", cite = [{ document: ARCH, page: 3, sheet: "A1.1", quote: "Wall type tag P3" }];
const scopeIn = (key, packageId, title) => ({ kind: "scope", key, packageId, title, detail: "", source: "A1.1", citations: cite });
let ext = X.recordRun(X.EMPTY_EXTRACTION, procurement, { packageIds: ["drywall", "ceilings"], engine: { mode: "live", model: "m" }, documents: [{ name: ARCH, pages: 12 }], startedAt: "t0", finishedAt: "t0",
  drafts: [scopeIn("a", "drywall", "Provide flush wood doors."), scopeIn("b", "drywall", "Provide FRP panels in the kitchen."), scopeIn("c", "drywall", "Provide gypsum board."), scopeIn("d", "ceilings", "Provide shaft wall at the stairs."), scopeIn("e", "drywall", "Provide studs."), scopeIn("f", "drywall", "Deleted one.")] });
const id = key => ext.drafts.find(d => d.title.startsWith(key)).id;
ext = X.rejectDraft(ext, id("Provide flush wood doors"), "wrong-trade", "Doors are in Openings.", "Sadie", "t3");
ext = X.rejectDraft(ext, id("Provide FRP panels"), "not-required", "", "Sadie", "t3");
ext = X.rejectDraft(ext, id("Provide gypsum board"), "duplicate", "", "Sadie", "t3");
ext = X.editDraft(ext, procurement, id("Provide shaft wall"), { packageId: "drywall" }, "Sadie", "t4");
assert.equal(ext.drafts.find(d => d.id === id("Provide shaft wall")).history.at(-1).fromPackage, "ceilings", "A proposal moved to another trade now remembers where it came from");
ext = X.editDraft(ext, procurement, id("Provide studs"), { title: "Furnish and install metal studs, full height." }, "Sadie", "t5");
ext = { ...ext, drafts: ext.drafts.map(d => d.id === id("Furnish and install") ? { ...d, status: "accepted", reviewedBy: "Sadie" } : d) };
ext = X.deleteDraft(ext, id("Deleted one"), "Sadie", "t6");
const learned = L.correctionsFrom("p1", procurement, ext);
assert.deepEqual(learned.map(c => [c.kind, c.text, c.projectId ?? null]), [
  ["rule", "Put \"Provide acoustic ceiling panels\" in Drywall, not Acoustical ceilings.", null],
  ["rule", "\"Provide flush wood doors\" is not Drywall work.", null],
  ["rule", "Leave out \"Provide FRP panels in the kitchen\" unless this project's documents call for it.", "p1"],
  ["rule", "Put \"Provide shaft wall at the stairs\" in Drywall, not Acoustical ceilings.", null],
  ["example", "Furnish and install metal studs, full height.", null],
], "Moves (of lines and of proposals), wrong-trade and not-required rejections and rewordings teach; the AI's own moves, combined trades, a move undone, duplicates and deletions don't");
assert.deepEqual(learned[0].trades, ["09 29 00", "drywall", "09 51 13", "acoustical ceilings"], "A move concerns both trades");
assert.equal(learned[1].detail, "Doors are in Openings.");
assert.equal(learned[4].detail, "Instead of the AI's: Provide studs.");
assert.deepEqual(L.correctionsFrom("p1", procurement, ext).map(c => c.events[0]), learned.map(c => c.events[0]), "Each correction keeps its id, so sending it again is recognised");
assert.equal(L.correctionsFrom("p1", procurement, { ...ext, runs: ext.runs.map(r => ({ ...r, engine: { mode: "sample", model: "" } })) }).filter(c => c.source.finding).length, 0, "The sample project's illustrative run teaches nothing");

// ── The table, in a real Postgres ──
const pg = new PGlite();
const db = { query: async (text, params) => (await pg.query(text, params ?? [])).rows };
const store = S.postgresMemory(db);
assert.deepEqual(await store.counts(), { proposed: 0, approved: 0, retired: 0 }, "Created on first use");
const indexes = (await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'memory_entries' ORDER BY indexname")).map(r => r.indexname);
assert.deepEqual(indexes, ["memory_entries_dedupe", "memory_entries_lookup", "memory_entries_pkey", "memory_entries_project", "memory_entries_search", "memory_entries_section", "memory_entries_trades"]);
const first = await store.add({ kind: "rule", text: "Put acoustic ceiling panels in Drywall, not Acoustical ceilings.", trades: ["09 29 00", "drywall", "09 51 13", "acoustical ceilings"] }, "Marcel Khoury");
assert.deepEqual([first.created, first.entry.status, first.entry.history.map(h => h.action), first.entry.createdBy], [true, "approved", ["added"], "Marcel Khoury"]);
const again = await store.add({ kind: "rule", text: "put acoustic ceiling panels in drywall not acoustical ceilings", trades: ["acoustical ceilings", "drywall", "09 51 13", "09 29 00"] }, "Sadie");
assert.deepEqual([again.created, again.entry.id], [false, first.entry.id], "The same lesson twice is one entry");
assert.deepEqual(await store.learn(learned, "Sadie"), { added: 5, seenAgain: 0 }, "Corrections arrive as proposals");
assert.deepEqual(await store.learn(learned, "Sadie"), { added: 0, seenAgain: 0 }, "The same corrections sent again change nothing");
const elsewhere = { ...learned[1], events: ["reject:p2:other"], source: { projectId: "p2" } };
assert.deepEqual(await store.learn([elsewhere, { kind: "rule", text: "No id", trades: [] }, { kind: "bad", text: "x", events: ["e"] }], "Victor"), { added: 0, seenAgain: 1 }, "A new correction of a known lesson counts it again; ones without an id or invalid are skipped");
const doors = (await store.search({ q: "flush wood doors" }))[0];
assert.deepEqual([doors.seen, doors.events.length, doors.status, doors.history.map(h => h.action)], [2, 2, "proposed", ["proposed", "seen-again"]]);
await store.add({ kind: "decision", text: "Owner provides FF&E.", projectId: "p1" }, "Marcel Khoury");
await store.add({ kind: "decision", text: "Another project's decision.", projectId: "p2" }, "Marcel Khoury");
await store.add({ kind: "rule", text: "Every trade cleans up its own debris daily.", detail: "Air barrier crews too." }, "Marcel Khoury");
assert.deepEqual(await store.counts(), { proposed: 5, approved: 4, retired: 0 });

const texts = list => list.map(e => e.text);
assert.deepEqual(texts(await store.search({ status: ["proposed"], kind: ["example"] })), ["Furnish and install metal studs, full height."]);
assert.deepEqual(texts(await store.search({ status: ["approved"], forProject: "p1" })).sort(), ["Every trade cleans up its own debris daily.", "Owner provides FF&E.", "Put acoustic ceiling panels in Drywall, not Acoustical ceilings."], "A project reads the company's entries and its own, never another project's");
assert.deepEqual(texts(await store.search({ projectOnly: "p1" })).sort(), ["Leave out \"Provide FRP panels in the kitchen\" unless this project's documents call for it.", "Owner provides FF&E."]);
assert.deepEqual(texts(await store.search({ status: ["approved"], forProject: "p1", trades: ["drywall"] })).sort(), ["Every trade cleans up its own debris daily.", "Owner provides FF&E.", "Put acoustic ceiling panels in Drywall, not Acoustical ceilings."], "By trade name, as a scan of p1 asks; entries for every trade included");
assert.deepEqual(texts(await store.search({ status: ["approved"], forProject: "p1", trades: ["09 51 13"] })).length, 3, "and by code");
assert.deepEqual(texts(await store.search({ status: ["approved"], trades: ["concrete"] })).sort(), ["Another project's decision.", "Every trade cleans up its own debris daily.", "Owner provides FF&E."], "Without a project, every project's entries for every trade");
assert.deepEqual(texts(await store.search({ q: "barriers" })), ["Every trade cleans up its own debris daily."], "English stemming: barriers finds barrier, here in the detail");
await store.add({ kind: "rule", text: "Coordinate the grid layout with the lighting.", detail: "Acoustic ceiling panels follow the reflected ceiling plan." }, "Marcel Khoury");
const ranked = texts(await store.search({ q: "ceiling panel" }));
assert.deepEqual([ranked.length, ranked.at(-1)], [3, "Coordinate the grid layout with the lighting."], "Best match first: the words in the entry itself rank above the same words in its detail");
assert.equal((await store.search({ limit: 2 })).length, 2);

// Approving, retiring, rewording: one change at a time.
const proposal = (await store.search({ q: "shaft wall" }))[0];
const approved = await store.update(proposal.id, proposal.version, { status: "approved" }, "Marcel Khoury");
assert.deepEqual([approved.saved, approved.entry.status, approved.entry.history.at(-1).action], [true, "approved", "approved"]);
const stale = await store.update(proposal.id, proposal.version, { status: "retired" }, "Sadie");
assert.deepEqual([stale.saved, stale.entry.status], [false, "approved"], "A change based on an old copy is refused, with the latest");
const retired = await store.update(proposal.id, approved.entry.version, { status: "retired" }, "Sadie");
const restored = await store.update(proposal.id, retired.entry.version, { status: "approved", text: "Put shaft wall at stairs in Drywall." }, "Sadie");
assert.deepEqual([restored.entry.history.map(h => h.action), restored.entry.text], [["proposed", "approved", "retired", "restored"], "Put shaft wall at stairs in Drywall."]);
await assert.rejects(store.update(restored.entry.id, restored.entry.version, { text: first.entry.text, trades: first.entry.trades }, "Sadie"), /already says exactly that/);
assert.deepEqual(await store.update("missing", 1, { status: "approved" }, "Sadie"), { saved: false, entry: null });
assert.deepEqual(texts(await store.search({ q: "shaft wall" })), ["Put shaft wall at stairs in Drywall."], "The search follows a reworded entry");

// What a Drywall scan of p1 reads, straight from the table.
const forScan = await store.search({ status: ["approved"], forProject: "p1", limit: 500 });
const scanPack = M.contextPack(forScan, target);
assert(scanPack.includes("Owner provides FF&E.") && scanPack.includes("Put shaft wall at stairs in Drywall.") && !scanPack.includes("Another project's decision") && !scanPack.includes("Leave out"), "Approved and relevant only");

// Every lookup is served by its index (the planner told not to scan the table).
await pg.exec("SET enable_seqscan = off");
const plan = async sql => (await db.query(`EXPLAIN ${sql}`)).map(r => r["QUERY PLAN"]).join(" ");
assert.match(await plan("SELECT id FROM memory_entries WHERE search @@ websearch_to_tsquery('english', 'barrier')"), /memory_entries_search/);
assert.match(await plan("SELECT id FROM memory_entries WHERE trades && ARRAY['drywall']"), /memory_entries_trades/);
assert.match(await plan("SELECT id FROM memory_entries WHERE status = 'approved' AND kind = 'rule'"), /memory_entries_lookup/);
assert.match(await plan("SELECT id FROM memory_entries WHERE project_id = 'p1' AND status = 'approved'"), /memory_entries_project/);
assert.match(await plan("SELECT id FROM memory_entries WHERE section = '09 51 13'"), /memory_entries_section/);

// ── The local stand-in follows the same rules ──
const local = S.fileMemory(path.join(mkdtempSync(path.join(tmpdir(), "memory-")), "memory.json"));
assert.equal((await local.add({ kind: "rule", text: "Put ceiling panels in Drywall.", trades: ["drywall"] }, "M")).created, true);
assert.equal((await local.add({ kind: "rule", text: "put ceiling panels in drywall", trades: ["Drywall"] }, "M")).created, false);
assert.deepEqual([await local.learn(learned, "S"), await local.learn(learned, "S"), await local.learn([elsewhere], "V")], [{ added: 5, seenAgain: 0 }, { added: 0, seenAgain: 0 }, { added: 0, seenAgain: 1 }]);
assert.deepEqual(texts(await local.search({ q: "kitchens" })), ["Leave out \"Provide FRP panels in the kitchen\" unless this project's documents call for it."], "Plain word search, other word forms included");
assert.equal((await local.search({ q: "ceiling panel", status: ["approved"] }))[0].text, "Put ceiling panels in Drywall.");
assert.deepEqual(texts(await local.search({ status: ["proposed"], forProject: "p2" })).includes("Leave out \"Provide FRP panels in the kitchen\" unless this project's documents call for it."), false, "Another project's lesson stays there");
const one = (await local.search({ status: ["approved"] }))[0];
assert.equal((await local.update(one.id, one.version, { status: "retired" }, "S")).saved, true);
assert.equal((await local.update(one.id, one.version, { status: "approved" }, "S")).saved, false);

// ── The browser sends each trade's memory with its readings ──
const sent = [];
globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ model: "m", drafts: [], dropped: [], sheet: "A1.1" }), { status: 200, headers: { "content-type": "application/json" } }); };
const C = await import("../lib/ai-client.ts");
const reading = { pkg: { id: "drywall", name: "Drywall", code: "09 29 00" }, manual: { name: "M.pdf", pageCount: 1 }, sections: [{ section: "09 29 00", title: "Gypsum", firstPage: 1, lastPage: 1, pages: [{ page: 1, text: "Provide gypsum board." }] }] };
await C.extractTradeScope({ ...reading, memory: scanPack });
await C.extractDrawingScope({ pkg: reading.pkg, document: "D.pdf", pageCount: 1, pages: [{ page: 1, text: "", sheet: "A1.1" }], render: async () => ({ image: "data:image/jpeg;base64,/9j/AAAA" }), memory: scanPack });
await C.extractTradeScope(reading);
assert.deepEqual(sent.map(b => [b.job, b.input.memory === scanPack, "memory" in b.input]), [["scope", true, true], ["drawing", true, true], ["scope", false, false]], "Specification and drawing readings carry the trade's memory; without memory the request is as before");

console.log("AI memory checked: entries and their rules, what a scan reads (most specific first, within its limit, nothing unapproved), requests unchanged without memory, the lessons corrections teach and the ones they don't, and the table in a real Postgres: created on first use, one row per lesson, corrections counted once, search by status, kind, project, trade and stemmed words with the best match first, one change at a time, and every lookup on its index.");

import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);

// The tool runners read browser storage: an in-memory stand-in, empty until a test writes to it.
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };

const T = await import("../lib/assistant-tools.ts");
const A = await import("../lib/assistant-agent.ts");
const S = await import("../lib/file-search.ts");
const R = await import("../lib/assistant-data.ts");
const C = await import("../lib/assistant-client.ts");
const { manualGuides } = await import("../lib/user-manual.ts");
const { ALL_SCREENS } = await import("../lib/screens.ts");
const { sampleBudget } = await import("../lib/data/budget.ts");

// ── Tool list ──
const defs = T.toolDefinitions();
assert.equal(new Set(defs.map(d => d.function.name)).size, defs.length, "Tool names are unique");
for (const d of defs) {
  assert.equal(d.type, "function");
  assert.ok(d.function.description.length > 40, `${d.function.name} says what it reads`);
  for (const r of d.function.parameters.required) assert.ok(r in d.function.parameters.properties, `${d.function.name}: required ${r} is a parameter`);
}
for (const t of T.ASSISTANT_TOOLS) if (t.screen) assert.ok(ALL_SCREENS.some(s => s.id === t.screen), `${t.name} links to a real screen`);

assert.deepEqual(T.parseToolCall({ id: "c1", name: "bid_leveling", arguments: "{\"trade\":\" Drywall \"}" }), { id: "c1", name: "bid_leveling", arguments: { trade: "Drywall" } });
assert.equal(T.parseToolCall({ id: "c1", name: "delete_project", arguments: "{}" }), null, "Unknown tools are refused");
assert.equal(T.parseToolCall({ name: "budget", arguments: "{}" }), null, "A call needs its id");
assert.deepEqual(T.parseToolCall({ id: "c2", name: "budget", arguments: "{not json" }).arguments, {}, "Unreadable arguments become none");
assert.deepEqual(T.parseToolCall({ id: "c3", name: "budget", arguments: { costCenter: "Addition", sql: "drop" } }).arguments, { costCenter: "Addition" }, "Arguments a tool doesn't take are dropped");
assert.equal(T.parseToolCall({ id: "c4", name: "search_project_files", arguments: "{}" }), null, "A search needs its query");
assert.equal(T.parseToolCall({ id: "c5", name: "search_project_files", arguments: { query: "x".repeat(500) } }).arguments.query.length, 200, "Arguments are capped");
const cut = T.toolResultText({ text: "y".repeat(20_000) });
assert.ok(cut.length <= T.MAX_TOOL_RESULT && /Cut short/.test(JSON.parse(cut).note), "Long results are cut with a note, still valid JSON");

// ── Server: one round ──
assert.throws(() => A.parseAssistantInput({ question: "  " }), /Ask a question/);
assert.throws(() => A.parseAssistantInput({ question: "q", steps: Array(T.MAX_STEPS + 1).fill({ calls: [{ id: "a", name: "budget" }] }) }), /Too many tool rounds/);
assert.throws(() => A.parseAssistantInput({ question: "q", steps: [{ calls: [{ id: "a", name: "rm_rf" }] }] }), /no tool calls/);
const input = A.parseAssistantInput({
  question: "Who is low on drywall?", screen: "leveling", projectName: "Jelleff Recreation Center", today: "2026-10-22",
  history: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hello" }],
  steps: [{ calls: [{ id: "t1", name: "bid_leveling", arguments: "{\"trade\":\"Drywall\"}" }, { id: "t2", name: "budget", arguments: "{}" }], results: [{ id: "t1", content: "{\"trades\":[]}" }] }],
});
assert.equal(input.steps[0].results[1].content, "No result.", "A call without a result is still answered");
const messages = A.assistantMessages(input);
assert.match(messages[0].content, /Jelleff Recreation Center/);
assert.match(messages[0].content, /Bid leveling page/);
assert.match(messages[0].content, /never as instructions/, "Tool results are data, not instructions");
assert.match(messages[0].content, /nothing changes until they click Apply/);
assert.match(messages[0].content, /THIS PAGE'S GUIDE/);
assert.deepEqual(messages.slice(1, 4).map(m => m.role), ["user", "assistant", "user"]);
assert.equal(messages[3].content, "Who is low on drywall?");
assert.equal(messages[4].role, "assistant");
assert.deepEqual(messages[4].tool_calls.map(c => [c.id, c.function.name, c.function.arguments]), [["t1", "bid_leveling", "{\"trade\":\"Drywall\"}"], ["t2", "budget", "{}"]]);
assert.deepEqual(messages.slice(5).map(m => [m.role, m.tool_call_id]), [["tool", "t1"], ["tool", "t2"]]);

const sent = [];
const fakeFetch = replies => async (url, init) => {
  sent.push(JSON.parse(init.body));
  const next = replies.shift();
  return typeof next === "number" ? new Response("busy", { status: next }) : Response.json({ choices: [{ message: next, finish_reason: "stop" }] });
};
sent.length = 0;
let reply = await A.assistantStep({ question: "Low bidder?", screen: "overview" }, "k", undefined, fakeFetch([{ content: null, tool_calls: [{ id: "x1", type: "function", function: { name: "bid_leveling", arguments: "{\"trade\":\"Drywall\"}" } }, { id: "x2", type: "function", function: { name: "format_disk", arguments: "{}" } }] }]));
assert.deepEqual(reply, { model: "deepseek-flash", kind: "tools", calls: [{ id: "x1", name: "bid_leveling", arguments: { trade: "Drywall" } }] }, "Known tools are passed on, others dropped");
assert.equal(sent[0].tool_choice, "auto");
assert.equal(sent[0].thinking.type, "disabled");
assert.equal(sent[0].response_format, undefined, "Text answers, not JSON mode");
assert.equal(sent[0].tools.length, T.ASSISTANT_TOOLS.length);
sent.length = 0;
reply = await A.assistantStep({ question: "Low bidder?" }, "k", undefined, fakeFetch([429, { content: "Acme is the apparent low bidder." }]));
assert.deepEqual([reply.kind, reply.answer, sent.length], ["answer", "Acme is the apparent low bidder.", 2], "A busy answer is retried");
sent.length = 0;
const fullSteps = Array.from({ length: T.MAX_STEPS }, (_, i) => ({ calls: [{ id: `s${i}`, name: "budget", arguments: "{}" }], results: [{ id: `s${i}`, content: "{}" }] }));
reply = await A.assistantStep({ question: "q", steps: fullSteps }, "k", undefined, fakeFetch([{ content: "Done.", tool_calls: [{ id: "z", type: "function", function: { name: "budget", arguments: "{}" } }] }]));
assert.deepEqual([sent[0].tool_choice, reply.kind, reply.answer], ["none", "answer", "Done."], "The last round must answer");
reply = await A.assistantStep({ question: "q" }, "k", undefined, fakeFetch([{ content: "", tool_calls: [{ id: "z", type: "function", function: { name: "unknown", arguments: "{}" } }] }]));
assert.equal(reply.kind, "answer", "Only unknown tools: an answer, not a loop");

// ── File search ──
const doc = (id, name, category, extra = {}) => ({ id, name, category, revision: 1, sheets: [], sections: [], ...extra });
const drawings = doc("d1", "Jelleff drawings.pdf", "Drawings", { sheets: [{ page: 64, sheet: "A8.1", title: "Partition types", date: "" }] });
const manual = doc("m1", "Project manual.pdf", "Specifications", { sections: [{ section: "07 84 00", title: "Firestopping", first: 300, last: 310 }] });
const entries = [
  { doc: drawings, index: S.indexPages([{ page: 64, text: "PARTITION TYPE SA3.21 steel studs sound attenuation full height" }, { page: 65, text: "door door door door hardware" }]) },
  { doc: manual, index: S.indexPages([{ page: 305, text: "SECTION 078400 FIRESTOPPING. Provide fire caulking at penetrations of fire rated walls." }, { page: 306, text: "Fire extinguishers and cabinets." }]) },
];
let hits = S.searchPages(entries, "fire caulking at rated walls");
assert.deepEqual([hits[0].file, hits[0].page, hits[0].where], ["Project manual.pdf", 305, "Section 07 84 00 · Firestopping"], "The page with all the words ranks first");
assert.match(hits[0].snippet, /fire caulking/i);
hits = S.searchPages(entries, "SA3.21");
assert.deepEqual([hits.length, hits[0].where], [1, "A8.1 · Partition types"], "Codes are searchable, and drawings name their sheet");
assert.deepEqual(S.searchPages(entries, "the and of"), [], "Common words alone find nothing");
assert.deepEqual(S.searchTerms("Where is the SA3.21 wall, sheet A-101?"), ["sa3.21", "wall", "sheet", "a-101"]);

// ── Tool runners on the Jelleff sample (nothing saved: the pages' starting data) ──
const run = (name, args = {}, ctx = {}) => R.runAssistantTool({ id: "r", name, arguments: args }, { projectId: "jelleff", today: "2026-10-22", ...ctx }).then(r => ({ ...r, data: JSON.parse(r.content) }));
let r = await run("project_overview");
assert.equal(r.data.project.name, "Jelleff Recreation Center");
assert.deepEqual(r.screens, ["overview"]);
assert.ok(r.data.counts.tradePackages > 0 && typeof r.data.budget.totalBudget === "number");
r = await run("trade_packages", { trade: "drywall" });
assert.deepEqual(r.data.packages.map(p => p.id), ["drywall"], "Packages narrow by trade name");
assert.ok(R.matchesTrade({ id: "drywall", name: "Drywall", division: "09", code: "09 29 00" }, "092900"), "…or by section number");
assert.ok(!R.matchesTrade({ id: "concrete", name: "Concrete", division: "03", code: "03 30 00" }, "drywall"));
r = await run("bid_submissions", { trade: "Drywall" });
assert.ok(r.data.bids.length > 0 && r.data.bids.every(b => b.trade === "Drywall" && typeof b.baseBid === "number"), "Submitted drywall bids with prices");
r = await run("bid_leveling", { trade: "Drywall" });
assert.ok(r.data.trades.length === 1 && r.data.trades[0].bidders.length > 0, "Drywall bids are leveled from the portal submissions");
assert.ok(r.data.trades[0].bidders.every(b => "reviewedTotal" in b && "rankable" in b));
r = await run("budget");
assert.equal(r.data.totals.budget, (await import("../lib/budget.ts")).budgetTotals(sampleBudget).budget);
r = await run("budget", { costCenter: "Nowhere" });
assert.match(r.data.note, /No cost center named "Nowhere"/);
for (const name of ["value_engineering", "issues_and_rfis", "schedule"]) assert.ok(!(await run(name)).data.error, `${name} runs on the sample`);

// Edits on a page are what the assistant reads.
const edited = structuredClone(sampleBudget);
edited.lines[0].budget += 1234;
localStorage.setItem("structor-ui-budget-state-v2", JSON.stringify(edited));
assert.equal((await run("budget")).data.totals.budget, (await import("../lib/budget.ts")).budgetTotals(edited).budget, "The saved edit, not the sample");
localStorage.clear();
// A new project starts empty: it never shows Jelleff's data.
r = await run("trade_packages", {}, { projectId: "new-project" });
assert.match(r.data.note, /no trade packages/);

// File search goes to the project's search route.
let asked = "";
r = await run("search_project_files", { query: "fire caulking", category: "Specifications" }, { fetchImpl: async url => { asked = url; return Response.json({ results: [{ file: "Project manual.pdf", page: 305 }], files: 2, pages: 40 }); } });
assert.equal(asked, "/api/project-files/search?project=jelleff&q=fire+caulking&category=Specifications");
assert.deepEqual([r.data.results.length, r.screens], [1, ["documents"]]);
r = await run("search_project_files", { query: "x" }, { fetchImpl: async () => Response.json({ results: [], files: 0, pages: 0 }) });
assert.match(r.data.note, /No files with readable text/);
r = await run("structor_guide", { query: "bid leveling" });
assert.ok(r.data.guides.length && r.screens.every(s => manualGuides.some(g => g.id === s)), "Guide answers link to their pages");

// ── Browser loop ──
const progress = [];
const calls = [];
const answer = await C.askStructor({ question: "Who is low on drywall?", screen: "overview", history: [] }, {
  onProgress: label => progress.push(label),
  send: async body => { calls.push(structuredClone(body)); return calls.length === 1 ? { kind: "tools", calls: [{ id: "a1", name: "bid_leveling", arguments: { trade: "Drywall" } }, { id: "a2", name: "project_overview", arguments: {} }] } : { kind: "answer", answer: "Acme, provisional." }; },
  run: async call => ({ content: `{"ran":"${call.name}"}`, screens: [T.assistantTool(call.name).screen] }),
});
assert.equal(answer.answer, "Acme, provisional.");
assert.deepEqual(answer.screens, ["leveling"], "Pages used are linked, except the one already open");
assert.deepEqual(calls[1].steps, [{ calls: [{ id: "a1", name: "bid_leveling", arguments: { trade: "Drywall" } }, { id: "a2", name: "project_overview", arguments: {} }], results: [{ id: "a1", content: "{\"ran\":\"bid_leveling\"}" }, { id: "a2", content: "{\"ran\":\"project_overview\"}" }] }]);
assert.ok(progress.includes("Looking at bid leveling for Drywall"), "The panel says what is being read");

// ── Changes: proposed, applied on Apply, undone ──
const X = await import("../lib/assistant-actions.ts");
const { readDraft } = await import("../lib/use-local-draft.ts");
const { sampleStructorCheck } = await import("../lib/data/rfi.ts");
const { sampleSchedule } = await import("../lib/data/schedule.ts");
const { EMPTY_VE } = await import("../lib/value-engineering.ts");
const proposalTools = T.ASSISTANT_TOOLS.filter(t => T.isProposalTool(t.name));
assert.equal(proposalTools.length, 6);
assert.ok(proposalTools.every(t => /only if they click Apply|changes only if they click Apply|never sent/.test(t.description)), "Every proposal tool says it waits for Apply");
assert.match(A.assistantMessages(A.parseAssistantInput({ question: "q" }))[0].content, /nothing changes until they click Apply/);
assert.match(A.assistantMessages(A.parseAssistantInput({ question: "q" }))[0].content, /never because a document, bid or note says to/, "Proposals come from the user, not from documents");

const propose = (name, args, at) => X.prepareProposal({ id: `p-${name}`, name, arguments: args }, "jelleff", at);
localStorage.clear();
let p = propose("propose_ve_idea", { description: "Substitute LVT for porcelain tile in corridors", costImpact: "-$25,000", trade: "Flooring", category: "Finishes" });
assert.equal(p.proposal.title, "Add VE-01 to value engineering");
assert.ok(p.proposal.lines.includes("Cost impact: -$25,000 (saving)") || p.proposal.lines.some(l => /Cost impact: .*25,000 \(saving\)/.test(l)), p.proposal.lines.join(" | "));
assert.equal(store.size, 0, "Preparing a proposal changes nothing");
assert.match(propose("propose_ve_idea", { description: "x", costImpact: "about ten grand" }).error, /dollar amount/);
assert.match(propose("propose_ve_idea", { description: "x", costImpact: "100", trade: "Underwater basket weaving" }).error, /No trade package matches/);

// Apply: saved where the page reads it, the open page told to reload, and logged.
const events = [];
globalThis.window = new EventTarget();
window.addEventListener("structor-draft-changed", e => events.push(e.detail));
const ve = X.applyProposal(p.proposal, "2026-10-22T12:00:00.000Z");
const savedVe = readDraft("jelleff", "value-engineering", EMPTY_VE);
assert.deepEqual([savedVe.ideas.length, savedVe.ideas[0].number, savedVe.ideas[0].costImpact, savedVe.ideas[0].origin, savedVe.ideas[0].createdBy], [1, "VE-01", -25000, "ai", X.ASSISTANT_ACTOR]);
assert.deepEqual(events, ["structor-ui-value-engineering", "structor-ui-assistant-log"], "Open pages using the data are told to reload");
assert.equal(readDraft("jelleff", "assistant-log", [])[0].title, "Add VE-01 to value engineering");
// Undo: back as it was, once; the log keeps the entry, marked undone.
assert.equal(X.undoChange(ve), true);
assert.equal(readDraft("jelleff", "value-engineering", EMPTY_VE).ideas.length, 0);
assert.ok(readDraft("jelleff", "assistant-log", [])[0].undoneAt, "The log shows it was undone");
assert.equal(X.undoChange(ve), false, "Nothing to undo twice");
// No undo over someone else's later change.
const again = X.applyProposal(p.proposal);
X.applyProposal(propose("propose_ve_idea", { description: "Second idea", costImpact: "500" }).proposal);
assert.equal(X.undoChange(again), false, "A later change blocks undo instead of being lost");
assert.equal(readDraft("jelleff", "value-engineering", EMPTY_VE).ideas.length, 2);
delete globalThis.window;

// Issues and RFIs follow Structor Check's rules.
localStorage.clear();
assert.match(propose("propose_issue", { title: "Door 104 hardware set missing", severity: "urgent" }).error, /high, medium or low/);
p = propose("propose_issue", { title: "Door 104 hardware set missing", severity: "High", trade: "Openings", source: "A8.2 · Door 104" });
assert.match(p.proposal.title, /^Raise issue SC-006: Door 104/);
assert.ok(p.proposal.lines.includes("Trade: Openings") && p.proposal.lines.includes("Status once raised: pending review"), "A trade with no package stays as written; AI-raised issues wait for contractor review");
assert.ok(propose("propose_issue", { title: "Drywall gap", severity: "low", trade: "drywall" }).proposal.lines.includes("Trade: 09 · Drywall"), "A known trade is labelled like the page does");
assert.match(propose("propose_rfi", { issues: "SC-001", question: "Confirm the hardware set." }).error, /No design team contact/, "An RFI needs its addressee first");
localStorage.setItem("structor-ui-structor-check-state", JSON.stringify({ ...sampleStructorCheck, designTeam: { name: "Dana Ruiz", company: "DLR Group", email: "dana@example.com" } }));
assert.match(propose("propose_rfi", { issues: "SC-003", question: "Q?" }).error, /needs contractor review first/);
assert.match(propose("propose_rfi", { issues: "SC-099", question: "Q?" }).error, /no issue SC-099/);
p = propose("propose_rfi", { issues: "sc-1, SC-002", question: "Confirm the partition type at the gym.", due: "2026-11-05" });
assert.ok(p.proposal.lines.includes("Saved as an internal draft. Nothing is emailed.") && p.proposal.lines.includes("About: SC-001, SC-002"));
X.applyProposal(p.proposal);
assert.throws(() => X.applyProposal(p.proposal), /already in an RFI/, "Apply re-checks the rules on the data as it is then");

// Schedule and budget versions.
localStorage.clear();
assert.match(propose("propose_schedule_activity", { name: "Steel shop drawings", start: "someday", workingDays: "10" }).error, /./);
p = propose("propose_schedule_activity", { name: "Steel shop drawings", start: "2026-11-02", workingDays: "10", phase: "Procurement" }, "2026-10-22T12:00:00.000Z");
assert.match(p.proposal.lines[0], /^2026-11-02 → \d{4}-\d{2}-\d{2} \(10 working days\)$/);
p = propose("propose_activity_progress", { activity: "a1010", progress: "75" });
assert.deepEqual([p.proposal.title, p.proposal.lines], [`Update progress on A1010: ${sampleSchedule.activities.find(a => a.code === "A1010").name}`, ["Progress: 55% → 75%"]]);
assert.match(propose("propose_activity_progress", { activity: "nonexistent thing", progress: "10" }).error, /No schedule activity matches/);
assert.match(propose("propose_budget_version", { name: "DD baseline", stage: "final", reason: "Baseline" }).error, /concept, schematic, dd or cd/);
p = propose("propose_budget_version", { name: "DD baseline", stage: "Design development", reason: "Baseline at 100% DD" });
assert.deepEqual([p.proposal.title, p.proposal.lines[0]], ['Save budget version "DD baseline"', "Stage: Design development"]);
X.applyProposal(p.proposal);
assert.equal(readDraft("jelleff", "budget-versions", [])[0].name, "DD baseline", "Saved where Budget versions reads it");

// The loop: proposals come back with the answer; the AI is told nothing changed yet.
localStorage.clear();
const seen = [];
const withProposal = await C.askStructor({ question: "Add a VE idea for LVT in corridors, saving 25k", screen: "value-engineering", history: [] }, {
  send: async body => { seen.push(structuredClone(body)); return seen.length === 1 ? { kind: "tools", calls: [{ id: "v1", name: "propose_ve_idea", arguments: { description: "LVT in corridors", costImpact: "-25000" } }, { id: "v2", name: "propose_issue", arguments: { title: "x", severity: "extreme" } }] } : { kind: "answer", answer: "It's ready for you to apply." }; },
});
assert.deepEqual(withProposal.proposals.map(x => x.title), ["Add VE-01 to value engineering"]);
const [ok, refused] = seen[1].steps[0].results.map(r => JSON.parse(r.content));
assert.match(ok.status, /Nothing has changed/);
assert.match(refused.error, /high, medium or low/);
assert.equal(store.size, 0, "Asking changes nothing; only Apply does");

console.log(`Ask Structor checked: ${T.ASSISTANT_TOOLS.length - proposalTools.length} reading tools and ${proposalTools.length} proposed changes, server rounds with a forced final answer, file search ranking, live project data with edits, apply through the pages' own rules with reload, log and undo, and the browser loop.`);

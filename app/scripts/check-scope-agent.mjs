// Reading with tools (lib/scope-agent, Danial 27 Nov): whole readings with a scripted Claude. A line goes in only
// with its quote on the page it cites and no repeat; every turn sends the conversation back as it was, adding to it;
// Structor's check sends back the usual lines the pages read mention and the sections no line cites; a long
// conversation starts again with where the reading is; the cost limit and a cut-off reply stop or retry it; the run
// is recorded like any reading. Then the server's half: the request check, and one Claude turn against a fake API.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const A = await import("../lib/scope-agent.ts");
const C = await import("../lib/claude.ts");
const S = await import("../lib/scope-agent-server.ts");
const K = await import("../lib/ai-cost.ts");
const X = await import("../lib/extraction.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const J = await import("../lib/ai-jobs.ts");

// ── A small project: two sheets on one drawing file, two sections in the manual ──
const doc = (id, name, kind, pageCount, extra = {}) => ({ id, projectId: "p1", name, category: kind === "manual" ? "Specifications" : "Drawings", kind, series: id, revision: 1, size: 1, pageCount, uploadedAt: "2026-11-27T00:00:00Z", sourcePath: "", sourceUrl: "", textChunk: 50, textChunks: 1, sheets: [], sections: [], ...extra });
const arch = doc("d-arch", "ARCH.pdf", "drawings", 3, { sheets: [{ page: 1, sheet: "A1000", title: "Partition Types", date: "" }, { page: 2, sheet: "A0701", title: "Reflected Ceiling Plan", date: "" }, { page: 3, sheet: "A0510", title: "Trash Chute", date: "" }] });
const manual = doc("d-man", "Manual.pdf", "manual", 4, { sections: [{ section: "09 21 16", title: "Gypsum Board Assemblies", first: 1, last: 2 }, { section: "09 51 00", title: "Acoustical Ceilings", first: 3, last: 4 }] });
const TEXT = {
  "d-arch:1": "PARTITION TYPES. TYPE 6A: 6\" METAL STUDS WITH 6\" MINERAL WOOL AND SOUNDBREAK XP BOARD EACH SIDE, 2 HR, STC 62. PROVIDE CANT BOARDS AT ELEVATOR SHAFTS.",
  "d-arch:2": "CEILING LEGEND ACT-1 ARMSTRONG ULTIMA 24 X 24 LAY-IN TILE ON SUSPENDED GRID. GYPSUM BOARD CEILING AT 8'-0\" AFF.",
  "d-arch:3": "",
  "d-man:1": "SECTION 09 21 16 GYPSUM BOARD ASSEMBLIES PART 2 PRODUCTS 2.3 Gypsum board: Type X, 5/8 inch thick, complying with ASTM C1396.",
  "d-man:2": "3.4 Finishing: Level 4 at panel surfaces exposed to view; Level 5 where semi-gloss paint is scheduled.",
  "d-man:3": "SECTION 09 51 00 ACOUSTICAL CEILINGS 2.1 Acoustical panels: mineral base, 24 by 24 inches.",
  "d-man:4": "3.2 Installation: hanger wire spaced 48 inches on center.",
};
const row = (page, sheet, title) => ({ sheet, title, discipline: "A", date: "", doc: arch, page, revisions: 1 });
const registerRows = [row(1, "A1000", "Partition Types"), row(2, "A0701", "Reflected Ceiling Plan"), row(3, "A0510", "Trash Chute")];
const specs = manual.sections.map(s => ({ ...s, doc: manual }));
const pkg = { id: "drywall", name: "Drywall", code: "09 29 00" };
const usualLines = [
  { id: "U1", text: "Include cant boards at elevator shafts", detail: "" },
  { id: "U2", text: "Provide sound attenuation blankets in demising walls", detail: "" },
  { id: "U3", text: "Provide Level 5 finish where semi-gloss paint is scheduled", detail: "" },
];
const progress = [];
const base = (extra = {}) => ({
  pkg, documents: [arch, manual], sections: specs, partOnly: [], readers: new Map([["09 21 16", [{ id: "drywall", name: "Drywall" }]], ["09 51 00", [{ id: "drywall", name: "Drywall" }, { id: "acoustical", name: "Acoustical Ceilings" }]]]),
  sheets: [registerRows[0]], register: registerRows, specs, memory: "Drywall carries 09 21 16.", usualLines, leavesOut: ["wood blocking and plywood"],
  signal: new AbortController().signal, onProgress: p => progress.push(p.note), ...extra,
});

// A scripted Claude: each turn takes the next reply, and every request is kept as sent.
const scripted = (replies, requests) => ({
  turn: async request => { requests.push(structuredClone(request)); const next = replies.shift(); if (!next) throw new Error("No more scripted replies"); return next; },
  pageText: async (d, p) => TEXT[`${d.id}:${p}`] ?? "",
  search: async q => /cant/i.test(q) ? [{ docId: "d-arch", page: 1, where: "A1000 · Partition Types", snippet: "PROVIDE CANT BOARDS AT ELEVATOR SHAFTS" }] : [],
});
const reply = (content, extra = {}) => ({ model: "claude-haiku-5-5", content, stopReason: "tool_use", usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 }, cost: 0.01, ...extra });
const think = { type: "thinking", thinking: "", signature: "sig-1" };
const use = (id, name, input) => ({ type: "tool_use", id, name, input });
const resultOf = (request, id) => request.messages.at(-1).content.find(b => b.type === "tool_result" && b.tool_use_id === id)?.content ?? "";

// ── A whole reading ──
const requests = [];
const first = [think, use("t1", "list_sheets", {}), use("t2", "read_section", { section: "092116" })];
const run = await A.runToolReading(base(), scripted([
  reply(first),
  reply([use("t3", "add_lines", { lines: [
    { title: "Provide 5/8 inch Type X gypsum board.", detail: "ASTM C1396.", source: "09 21 16 · §2.3", citations: [{ page: "D2 p1", quote: "Type X, 5/8 inch thick, complying with ASTM C1396" }] },
    { title: "Provide Level 5 finish everywhere.", detail: "", source: "09 21 16", citations: [{ page: "D2 p2", quote: "Level 5 at every surface in the whole building" }] },
    { title: "Provide 5/8 inch Type X gypsum board", detail: "ASTM C1396", source: "x", citations: [{ page: "D2 p1", quote: "Type X, 5/8 inch thick" }] },
    { title: "Provide Level 4 and Level 5 finishes.", detail: "Level 5 where semi-gloss paint is scheduled.", source: "09 21 16 · §3.4", citations: [{ page: "d2 page 2", quote: "Level 5 where semi-gloss paint is scheduled" }] },
    { title: "Install 6 inch metal studs with mineral wool at Type 6A partitions.", detail: "2 hr, STC 62.", source: "A1000 · Partition types", citations: [{ page: "A1000", quote: "6\" METAL STUDS WITH 6\" MINERAL WOOL AND SOUNDBREAK XP BOARD" }] },
  ] })]),
  reply([use("t4", "finish", { summary: "Read 09 21 16 and A1000." })]),
  reply([use("t5", "search", { query: "cant boards" }), use("t6", "read_section", { section: "09 51 00" })]),
  reply([use("t7", "add_lines", { lines: [
    { title: "Include cant boards at elevator shafts.", detail: "", source: "A1000 · Partition types", citations: [{ page: "D1 p1", quote: "PROVIDE CANT BOARDS AT ELEVATOR SHAFTS" }] },
    { title: "Furnish and install acoustical panels, mineral base, 24 by 24 inches.", detail: "", source: "09 51 00 · §2.1", citations: [{ page: "D2 p3", quote: "Acoustical panels: mineral base, 24 by 24 inches" }] },
  ] })]),
  reply([{ type: "text", text: "Done." }, use("t8", "finish", { summary: "All read." })], { stopReason: "tool_use" }),
], requests));

assert.equal(requests.length, 6, "Six turns: the reading ends at the second finish");
const brief = requests[0].messages[0].content[0].text;
for (const words of ["Trade: Drywall (09 29 00).", "- D1 ARCH.pdf · drawings · 3 pages", "- D2 Manual.pdf · specifications · 4 pages", "- 09 21 16 Gypsum Board Assemblies · D2 p1–2", "- 09 51 00 Acoustical Ceilings · D2 p3–4 · also read for Acoustical Ceilings", "- A1000 Partition Types · D1 p1", "Drywall carries 09 21 16.", "U1 Include cant boards at elevator shafts"])
  assert.ok(brief.includes(words), `The brief names the trade's files, sections, sheets, memory and usual lines: ${words}`);
assert.deepEqual(requests[1].messages[1], { role: "assistant", content: first }, "Claude's reply goes back exactly as sent, its thinking block and signature included");
assert.deepEqual(requests[1].messages[2].content.map(b => b.tool_use_id), ["t1", "t2"], "Each tool call is answered, in order");
for (let i = 1; i < requests.length; i++) assert.deepEqual(requests[i].messages.slice(0, requests[i - 1].messages.length), requests[i - 1].messages, `Turn ${i + 1} only adds to the conversation: the cache and Claude's thinking stay valid`);
assert.match(resultOf(requests[1], "t1"), /A1000 · Partition Types · D1 p1 · given to this trade/, "The sheet list marks the trade's sheets");
assert.match(resultOf(requests[1], "t2"), /\[\[D2 p1 · 09 21 16\]\][\s\S]*Type X, 5\/8 inch thick/, "A section is read with each page's reference");
const added = resultOf(requests[2], "t3");
assert.match(added, /Added: S1 Provide 5\/8 inch Type X gypsum board\. \| S2 Provide Level 4 and Level 5 finishes\. \| S3 Install 6 inch metal studs/, "Lines with their quote on the cited page go in; a sheet number or \"d2 page 2\" works as a page");
assert.match(added, /"Provide Level 5 finish everywhere\.": the quote isn't on D2 p2/, "A quote that isn't on its page keeps the line out");
assert.match(added, /"Provide 5\/8 inch Type X gypsum board": repeats S1/, "A repeat stays out");
const check = resultOf(requests[3], "t4");
assert.match(check, /U1 Include cant boards at elevator shafts — see D1 p1/, "Structor's check names a usual line the pages read call for, with its page");
assert.doesNotMatch(check, /U2|U3/, "A usual line no page read mentions isn't sent back, nor one a line already covers");
assert.match(check, /09 51 00 Acoustical Ceilings \(D2 p3–4\)/, "nor is a trade's section no line cites missed");
assert.match(resultOf(requests[4], "t5"), /D1 p1 · A1000 · Partition Types: PROVIDE CANT BOARDS/, "A search answers with page references");
assert.equal(run.input.error, undefined);
assert.deepEqual(run.input.drafts.map(d => [d.key, d.title]), [["tools-1", "Provide 5/8 inch Type X gypsum board."], ["tools-2", "Provide Level 4 and Level 5 finishes."], ["tools-3", "Install 6 inch metal studs with mineral wool at Type 6A partitions."], ["tools-4", "Include cant boards at elevator shafts."], ["tools-5", "Furnish and install acoustical panels, mineral base, 24 by 24 inches."]], "Five lines, in the order written");
assert.deepEqual(run.input.drafts[2].citations, [{ document: "ARCH.pdf", page: 1, sheet: "A1000", quote: "6\" METAL STUDS WITH 6\" MINERAL WOOL AND SOUNDBREAK XP BOARD" }], "A sheet's line cites its file, page and sheet");
assert.deepEqual(run.input.drafts[0].citations, [{ document: "Manual.pdf", page: 1, sheet: null, quote: "Type X, 5/8 inch thick, complying with ASTM C1396" }]);
assert.deepEqual(run.input.documents, [{ name: "Manual.pdf", pages: 4 }, { name: "ARCH.pdf", pages: 3 }], "The run lists the files its lines cite");
assert.match(run.dropped[0].reason, /^6 turns: \d+ pages read, 1 search, 5 lines written, 2 refused by the quote and repeat checks; \$0\.06 with claude-haiku-5-5\.$/, "The run notes say what the reading did and cost");
assert.match(run.dropped[1].reason, /U1 Include cant boards/, "and what Structor's check sent back");
assert.ok(progress.some(p => /^Turn 2 · writing lines · 3 lines · \$0\.02$/.test(p)), "Each turn shows its progress");
const recorded = X.recordRun(X.EMPTY_EXTRACTION, sampleProcurement, run.input);
assert.equal(recorded.drafts.length, 5, "The run records like any reading: five findings for review");
assert.ok(recorded.drafts.every(d => d.status === "pending-review"));
assert.doesNotThrow(() => A.parseAgentJob(requests.at(-1)), "The browser's conversation passes the server's check");

// ── A long conversation starts again; a cut-off reply is asked again; the cost limit stops the reading ──
const longRequests = [];
const good = { title: "Provide 5/8 inch Type X gypsum board.", detail: "", source: "09 21 16 · §2.3", citations: [{ page: "D2 p1", quote: "Type X, 5/8 inch thick, complying with ASTM C1396" }] };
const capped = await A.runToolReading(base({ costCap: 0.05 }), scripted([
  reply([use("a1", "add_lines", { lines: [good] }), use("a0", "note", { text: "Left: 09 51 00." })], { usage: { input: 90_000, output: 100, cacheRead: 0, cacheWrite: 0 }, cost: 0.02 }),
  reply([use("a2", "add_lines", { lines: [] })], { stopReason: "max_tokens", cost: 0.02 }),
  reply([use("a3", "read_page", { page: "A0701" })], { cost: 0.02 }),
], longRequests));
assert.equal(longRequests[1].messages.length, 1, "Past the token limit the next turn starts a new conversation");
assert.match(longRequests[1].messages[0].content[0].text, /This conversation was restarted to save room[\s\S]*S1 Provide 5\/8 inch Type X gypsum board\.[\s\S]*Your notes:\nLeft: 09 51 00\./, "It starts with where the reading is: its lines and notes");
assert.ok(longRequests[1].messages[0].content[0].text.startsWith("Trade: Drywall"), "and the brief again");
assert.match(longRequests[1].messages[0].content[0].text, /The results of your last tool calls, which you hadn't seen yet:\nadd_lines \{"lines"[\s\S]*Added: S1 Provide 5\/8 inch[\s\S]*note \{"text":"Left: 09 51 00\."\}:\nNotes saved\./, "and the results Claude hadn't seen yet, each under its call");
assert.match(longRequests[2].messages.at(-1).content.at(-1).text, /cut off at the length limit/, "A cut-off reply is dropped and the turn asked again with a note");
assert.equal(longRequests[2].messages.length, 1, "The cut-off reply isn't kept");
assert.equal(capped.input.drafts.length, 1, "Lines written before the limit are kept");
assert.match(capped.dropped[0].reason, /Stopped at this trade's \$0\.05 limit before it finished\./, "The cost limit stops the reading");

// ── Replies with no tool call are told to use the tools, then taken as finish; a reading that writes nothing fails ──
const idleRequests = [];
const said = text => reply([{ type: "text", text: "" }, { type: "text", text }], { stopReason: "end_turn" });
const empty = await A.runToolReading(base({ sections: [], usualLines: [] }), scripted([said("First I will list the sheets."), said("Nothing for this trade."), said("Nothing at all.")], idleRequests));
assert.equal(idleRequests.length, 3, "Two replies without a tool call are told to go on; the third ends the reading");
assert.match(idleRequests[1].messages.at(-1).content[0].text, /^\(Structor\) Use the tools/);
assert.deepEqual(idleRequests[1].messages[1].content, [{ type: "text", text: "First I will list the sheets." }], "An empty text block from Claude isn't sent back (the API refuses one)");
assert.equal(empty.input.error, "The reading wrote no lines it could cite.");
assert.equal(X.recordRun(X.EMPTY_EXTRACTION, sampleProcurement, empty.input).runs[0].status, "failed");

// ── At most 4 reads a turn; Structor's check sends the usual lines back 25 at a time (2626's first check sent 136) ──
const extra = doc("d-extra", "Notes.pdf", "other", 1);
TEXT["d-extra:1"] = `GENERAL NOTES. Framing at ${Array.from({ length: 30 }, (_, i) => `zorb${i + 1}`).join(", ")}.`;
const many = Array.from({ length: 30 }, (_, i) => ({ id: `L${i + 1}`, text: `Provide zorb${i + 1} framing`, detail: "" }));
const batchRequests = [];
await A.runToolReading(base({ documents: [arch, manual, extra], sections: [], usualLines: many }), scripted([
  reply(Array.from({ length: 5 }, (_, i) => use(`r${i}`, "read_page", { page: "D3 p1" }))),
  reply([use("f1", "finish", { summary: "Read the notes." })]),
  reply([use("f2", "finish", { summary: "Checked." })]),
  reply([use("f3", "finish", { summary: "Checked." })]),
], batchRequests));
const reads = batchRequests[1].messages.at(-1).content;
assert.match(reads[3].content, /^\[\[D3 p1\]\]/, "Four reads a turn are answered");
assert.match(reads[4].content, /^Not read: at most 4 pages or sections a turn/, "the fifth waits for the next turn");
const firstBatch = resultOf(batchRequests[2], "f1"), secondBatch = resultOf(batchRequests[3], "f2");
assert.match(firstBatch, /- 30 of the contractor's usual lines for this trade have no line yet, and pages you read mention them; here are 25, the next ones come with the next check\./);
assert.equal((firstBatch.match(/^ {2}L\d+ /gm) ?? []).length, 25, "The first check sends 25");
assert.match(firstBatch, /^ {2}L1 Provide zorb1 framing — see D3 p1$/m, "each with its own page");
assert.match(secondBatch, /- 5 of the contractor's usual lines/, "The next check sends the other 5");
assert.match(secondBatch, /^ {2}L26 Provide zorb26 framing — see D3 p1$/m);
assert.equal(batchRequests.length, 4, "A third check with nothing new ends the reading");
assert.deepEqual([A.agentCostCap("claude-haiku-5-5"), A.agentCostCap("claude-sonnet-5-5"), A.agentCostCap("claude-opus-5-5"), A.agentCostCap(undefined)], [1, 2, 4, 1], "A larger model's reading has a higher limit");
assert.equal(batchRequests[0].effort, "high", "The AI thinks at high effort, as Anthropic advises for longer agent tasks on Haiku 5.5");

// ── Pure helpers ──
assert.deepEqual([A.sectionCode("092116"), A.sectionCode("09-21-16"), A.sectionCode("07 42 13.13"), A.sectionCode("Division 9")], ["09 21 16", "09 21 16", "07 42 13.13", "Division 9"]);
assert.equal(A.pageRuns([{ alias: "D2", page: 3 }, { alias: "D2", page: 1 }, { alias: "D2", page: 2 }, { alias: "D1", page: 7 }, { alias: "D2", page: 9 }]), "D2 p1–3, D2 p9, D1 p7");

// ── The server's check of a request ──
const ok = { messages: [{ role: "user", content: [{ type: "text", text: "Brief" }] }, { role: "assistant", content: [think, use("t1", "list_sheets", {})] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "A1000" }] }] };
assert.deepEqual(A.parseAgentJob(ok), { ...ok, effort: "medium" }, "A conversation passes as sent, at medium effort");
assert.equal(A.parseAgentJob({ ...ok, effort: "high" }).effort, "high");
assert.equal(A.parseAgentJob({ ...ok, effort: "max" }).effort, "medium", "Only low, medium and high are offered");
for (const [bad, why] of [
  [{}, "no conversation"],
  [{ messages: [ok.messages[1], ok.messages[2]] }, "starting with Claude's turn"],
  [{ messages: ok.messages.slice(0, 2) }, "ending with Claude's turn"],
  [{ messages: [ok.messages[0], ok.messages[1], { role: "user", content: [{ type: "text", text: "no result" }] }] }, "an unanswered tool call"],
  [{ messages: [ok.messages[0], { role: "assistant", content: [{ type: "thinking", thinking: "" }] }, ok.messages[2]] }, "a thinking block without its signature"],
  [{ messages: [{ role: "user", content: [{ type: "image", source: {} }] }] }, "a block the reading doesn't use"],
  [{ messages: [{ role: "user", content: Array.from({ length: 4 }, () => ({ type: "text", text: "x".repeat(200_000) })) }] }, "more text than a reading ever sends"],
]) assert.throws(() => A.parseAgentJob(bad), J.AiJobError, `Refused: ${why}`);
assert.deepEqual(A.parseAgentJob({ messages: [ok.messages[0], { role: "assistant", content: [{ type: "text", text: "" }, ...ok.messages[1].content] }, ok.messages[2]] }).messages[1].content, ok.messages[1].content, "An empty text block is left out of what goes to Claude");
const madeUp = { messages: [ok.messages[0], { role: "assistant", content: [use("t1", "read_sheets_placeholder", {})] }, ok.messages[2]] };
assert.deepEqual(A.parseAgentJob(madeUp).messages, madeUp.messages, "A call to a tool that doesn't exist goes back as Claude wrote it (2626 Drywall, 27 Nov)");

// ── A made-up tool is answered with the real ones, and the reading goes on ──
const madeUpRequests = [];
await A.runToolReading(base({ sections: [], usualLines: [] }), scripted([
  reply([use("m1", "read_sheets_placeholder", {}), use("m2", "toString", {}), use("m3", "list_sections", { filter: "09 51" })]),
  reply([use("m4", "finish", { summary: "Nothing to add." })]),
  reply([use("m5", "finish", { summary: "Nothing to add." })]),
], madeUpRequests));
const answers = madeUpRequests[1].messages.at(-1).content;
assert.deepEqual(answers.map(b => [b.tool_use_id, !!b.is_error]), [["m1", true], ["m2", true], ["m3", false]], "Each call is answered; the made-up ones as errors");
assert.match(answers[0].content, /^There is no tool read_sheets_placeholder\. The tools are list_sheets, list_sections, search,/);
assert.match(answers[1].content, /^There is no tool toString\./, "A name that is a built-in of every object isn't run");
assert.match(answers[2].content, /09 51 00 Acoustical Ceilings · D2 p3–4/);
assert.doesNotThrow(() => A.parseAgentJob(madeUpRequests[1]), "and the next request passes the server's check");

// ── One turn through the SDK, against a fake API ──
const sse = events => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
const toolTurn = sse([
  ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, cache_read_input_tokens: 3000, cache_creation_input_tokens: 400, output_tokens: 1 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-abc" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "list_sheets", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"filter\":\"A\"}" } }],
  ["content_block_stop", { type: "content_block_stop", index: 1 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 40 } }],
  ["message_stop", { type: "message_stop" }],
]);
const sent = [];
const fakeFetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(toolTurn, { status: 200, headers: { "content-type": "text/event-stream" } }); };
const response = await S.scopeAgentJob(ok, new AbortController().signal, { ANTHROPIC_API_KEY: "sk-ant-test" }, fakeFetch);
const body = await response.json();
assert.equal(response.status, 200);
assert.deepEqual(body.content.map(b => b.type === "tool_use" ? [b.type, b.id, b.name, b.input] : [b.type, b.signature]), [["thinking", "sig-abc"], ["tool_use", "toolu_1", "list_sheets", { filter: "A" }]], "Claude's reply comes back block by block, the thinking block with its signature");
assert.equal(body.stopReason, "tool_use");
assert.deepEqual(body.usage, { input: 12, output: 40, cacheWrite: 400, cacheRead: 3000 });
assert.ok(Math.abs(body.cost - (12 * 0.1 + 400 * 0.125 + 3000 * 0.01 + 40 * 0.5) / 1e6) < 1e-12, "and what it cost at Haiku 5.5's prices, cached tokens at their rates");
const request = sent[0];
assert.equal(request.model, "claude-haiku-5-5");
assert.equal(request.stream, true, "Streamed, so a long turn doesn't hit a request timeout");
assert.deepEqual(request.output_config, { effort: "medium" });
assert.deepEqual(request.tools.map(t => t.name), A.SCOPE_AGENT_TOOLS.map(t => t.name), "The server sends its own tools");
assert.ok(request.tools.every(t => !("eager_input_streaming" in t)));
assert.deepEqual(request.system, [{ type: "text", text: A.agentSystemPrompt(), cache_control: { type: "ephemeral" } }], "and its own instructions, cached");
assert.deepEqual(request.messages[2].content, [{ type: "tool_result", tool_use_id: "t1", content: "A1000", cache_control: { type: "ephemeral" } }], "The newest block carries the cache breakpoint");
assert.deepEqual(request.messages.slice(0, 2), ok.messages.slice(0, 2), "and nothing earlier changes");
assert.equal(ok.messages[2].content[0].cache_control, undefined, "The request's own conversation isn't touched");
const noKey = await S.scopeAgentJob(ok, new AbortController().signal, {});
assert.equal(noKey.status, 503, "Without Claude on the server, the reading says so");

// ── A Haiku prompt over 100K tokens costs five times as much ──
assert.ok(Math.abs(K.costOf("claude-haiku-5-5", { input: 100_000, output: 1000 }) - (100_000 * 0.1 + 1000 * 0.5) / 1e6) < 1e-12, "At 100K tokens, the usual rate");
assert.ok(Math.abs(K.costOf("claude-haiku-5-5", { input: 1000, output: 1000, cacheRead: 100_000 }) - (1000 * 0.5 + 100_000 * 0.05 + 1000 * 2.5) / 1e6) < 1e-12, "Over it, cache reads included, the long-prompt rate");
assert.ok(Math.abs(K.costOf("claude-opus-5-5", { input: 200_000, output: 0 }) - 0.8) < 1e-12, "Other models have one rate");

console.log("Reading with tools: OK");

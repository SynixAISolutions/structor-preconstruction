import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const J = await import("../lib/ai-jobs.ts");
const D = await import("../lib/deepseek.ts");
const C = await import("../lib/ai-client.ts");
const M = await import("../lib/manual-sections.ts");
const W = await import("../lib/demo-password.ts");
const X = await import("../lib/extraction.ts");
const R = await import("../lib/proposal-extraction.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleSubmissions } = await import("../lib/data/sample-award.ts");

const jobFails = (fn, pattern) => assert.throws(fn, e => e instanceof J.AiJobError && pattern.test(e.message), `expected ${pattern}`);
const previousModel = process.env.AI_TEXT_MODEL;
try {
  delete process.env.AI_TEXT_MODEL;
  assert.equal(D.textModel(), "deepseek-flash");
  assert.equal(D.textModel("deepseek-v4-pro"), "deepseek-v4-pro");
  process.env.AI_TEXT_MODEL = "deepseek-flash";
  assert.equal(D.textModel("deepseek-v4-pro"), "deepseek-flash", "The server model override remains available");
} finally { if (previousModel === undefined) delete process.env.AI_TEXT_MODEL; else process.env.AI_TEXT_MODEL = previousModel; }

// ── Demo password ──
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
assert.deepEqual([W.passwordAccepted(null, undefined), W.passwordAccepted(null, "")], [true, true], "No password set: no gate");
assert.deepEqual([W.passwordAccepted(basic("marcel", "s3cret"), "s3cret"), W.passwordAccepted(basic("", "s3cret"), "s3cret"), W.passwordAccepted(basic("x", "pa:ss"), "pa:ss")], [true, true, true], "Any user name; the password may contain a colon");
assert.deepEqual([W.passwordAccepted(basic("marcel", "wrong"), "s3cret"), W.passwordAccepted(basic("marcel", "s3cret!"), "s3cret"), W.passwordAccepted(null, "s3cret"), W.passwordAccepted("Bearer abc", "s3cret"), W.passwordAccepted("Basic !!!", "s3cret"), W.passwordAccepted(`Basic ${Buffer.from("nocolon").toString("base64")}`, "nocolon")], [false, false, false, false, false, false]);
assert.equal(W.passwordAccepted(basic("m", "Pässwörd"), "Pässwörd"), true, "Non-ASCII passwords");
assert.equal(W.passwordAccepted(basic("m", "s3cre"), "s3cret"), false, "A prefix of the password is not the password");
assert.equal(W.passwordAccepted(`Bearer ${Buffer.from("m:s3cret").toString("base64")}`, "s3cret"), false, "Only Basic sign-in counts");
assert.equal(W.passwordAccepted(basic("m", "s3cret").replace("Basic", "basic"), "s3cret"), true, "The scheme name is case-insensitive");

// ── Manual sections (the Jelleff page layout) ──
const head = "JELLEFF RECREATION CENTER 55-22112-00\nDEPARTMENT OF GENERAL SERVICES DECEMBER 9, 2025\nWASHINGTON, DC GMP - BUILDING PERMIT SUBMISSION\n";
const pageOf = (page, body) => ({ page, text: head + body });
const manual = [
  { page: 1, text: "PROJECT MANUAL\nTABLE OF CONTENTS\nSECTION 092900 GYPSUM BOARD .... 434" },
  pageOf(425, "NON-STRUCTURAL METAL FRAMING 092216 - 1\nSECTION 092216 - NON-STRUCTURAL METAL FRAMING\nPART 1 - GENERAL\nB. Related Requirements:\n1. Section 054000 \"Cold-Formed Metal Framing\" for exterior"),
  pageOf(426, "NON-STRUCTURAL METAL FRAMING 092216 - 2\nPART 2 - PRODUCTS\n2.1 PERFORMANCE REQUIREMENTS"),
  pageOf(434, "GYPSUM BOARD 092900 - 1\nSECTION 092900 - GYPSUM BOARD\nPART 1 - GENERAL"),
  pageOf(440, "GYPSUM BOARD 092900 - 7\n3.6 FINISHING\nB. Level 4: At panel surfaces that will be exposed to view unless otherwise indicated."),
  pageOf(486, "SOUND-ABSORBING WALL UNITS 09 84 33 - 1\nPART 1 - GENERAL"),
  pageOf(700, "SECTION 230593.13 - TESTING, ADJUSTING, AND BALANCING\nPART 1"),
  { page: 900, text: "APPENDIX A\nGEOTECHNICAL REPORT\nBoring B-1 depth 10 - 3" },
];
assert.deepEqual(M.sectionOfPage(manual[1].text), { section: "09 22 16", title: "NON-STRUCTURAL METAL FRAMING" }, "The section opener names it");
assert.deepEqual(M.sectionOfPage(manual[2].text), { section: "09 22 16", title: "NON-STRUCTURAL METAL FRAMING" }, "Later pages by their running header");
assert.deepEqual([M.sectionOfPage(manual[0].text), M.sectionOfPage(manual[7].text)], [null, null], "Contents and appendix pages belong to no section");
assert.deepEqual(M.sectionOfPage(manual[6].text), { section: "23 05 93.13", title: "TESTING, ADJUSTING, AND BALANCING" });
assert.deepEqual(M.sectionOfPage("PART 2 - PRODUCTS 092900 - 3"), null, "A PART line is not a header");
assert.equal(M.sectionOfPage(head + Array.from({ length: 10 }, (_, i) => `Body line ${i}`).join("\n") + "\nSEE DETAIL 092900 - 3"), null, "Only a page's first lines can carry its header");
const sections = M.manualSections([...manual].reverse());
assert.deepEqual(sections.map(s => [s.section, s.firstPage, s.lastPage, s.pages.map(p => p.page)]), [["09 22 16", 425, 426, [425, 426]], ["09 29 00", 434, 440, [434, 440]], ["09 84 33", 486, 486, [486]], ["23 05 93.13", 700, 700, [700]]]);
assert.deepEqual(M.sectionsInDivision(sections, "09").map(s => s.section), ["09 22 16", "09 29 00", "09 84 33"]);

// ── Quote screening ──
assert.equal(J.quoteOnPage("Level 4: At panel surfaces that will be exposed to view", manual[4].text), true);
assert.equal(J.quoteOnPage("level 4 at panel surfaces THAT will be exposed", "Level 4: At panel\nsurfaces that will be exposed"), true, "Spacing, case and punctuation don't decide");
assert.equal(J.quoteOnPage("Level 4: At panel surfaces … exposed to view unless", manual[4].text), true, "Each part of an elided quote must be there");
assert.equal(J.quoteOnPage("Level 5: At panel surfaces", manual[4].text), false, "A changed number is not on the page");
assert.equal(J.quoteOnPage("Level 4 … zzz", manual[4].text), false, "Every part counts; a part under 6 letters is not evidence");
assert.equal(J.quoteOnPage("", manual[4].text), false);
assert.deepEqual([J.quoteOnPage("Level 4: At panel … at", manual[4].text), J.quoteOnPage("Level", manual[4].text)], [false, false], "A fragment under 6 letters/digits proves nothing, even if it is on the page");

// ── Scope job ──
const scopeInput = (over = {}) => ({ pkg: { id: "drywall", name: "Drywall", code: "09 29 00" }, document: "Project manual.pdf", section: { section: "09 29 00", title: "GYPSUM BOARD" }, pages: [manual[3], manual[4]], ...over });
const scopeJob = J.parseScopeJob(scopeInput());
jobFails(() => J.parseScopeJob(scopeInput({ pkg: {} })), /which trade package/);
jobFails(() => J.parseScopeJob(scopeInput({ document: "" })), /project manual file/);
jobFails(() => J.parseScopeJob(scopeInput({ section: { section: "9-29" } })), /specification section/);
jobFails(() => J.parseScopeJob(scopeInput({ pages: [] })), /at least one page/);
jobFails(() => J.parseScopeJob(scopeInput({ pages: Array.from({ length: 9 }, (_, i) => ({ page: i + 1, text: "x" })) })), /at most 8 pages/);
jobFails(() => J.parseScopeJob(scopeInput({ pages: [{ page: 1, text: "x".repeat(60_001) }] })), /more than 60,000 characters/);
jobFails(() => J.parseScopeJob(scopeInput({ pages: [{ page: 0, text: "x" }] })), /page number/);
jobFails(() => J.parseScopeJob(scopeInput({ pages: [{ page: 1, text: "  " }] })), /no text layer/);
const msgs = J.scopeMessages(scopeJob);
assert(msgs[0].content.includes("JSON") && msgs[1].content.includes("[[page 440]]") && msgs[1].content.includes("Trade: Drywall (09 29 00)"), "Pages are marked for citing; JSON is asked for");

const finding = (over = {}) => ({ title: "Provide Level 4 finish on gypsum board exposed to view.", detail: "Tape and sand joints.", paragraph: "3.6.B", citations: [{ page: 440, quote: "Level 4: At panel surfaces that will be exposed to view" }], ...over });
const screened = J.screenScope({ findings: [
  finding(),
  finding({ title: "Provide Level 5 finish everywhere.", citations: [{ page: 440, quote: "Level 5: At all panel surfaces" }] }),
  finding({ title: "Cited on a page it wasn't given.", citations: [{ page: 999, quote: "Level 4: At panel surfaces" }] }),
  finding({ title: "x".repeat(301) }),
  finding({ title: "", citations: [] }),
  finding({ title: "Keep the good citation only.", paragraph: "", citations: [{ page: 440, quote: "made up words entirely" }, { page: 440, quote: "Level 4: At panel surfaces that will be exposed to view" }] }),
  "not an object",
] }, scopeJob);
assert.deepEqual(screened.drafts.map(d => [d.key, d.title, d.source, d.citations.map(c => c.page)]), [
  ["09 29 00-1", "Provide Level 4 finish on gypsum board exposed to view.", "09 29 00 · §3.6.B", [440]],
  ["09 29 00-2", "Keep the good citation only.", "09 29 00", [440]],
]);
assert.deepEqual(screened.dropped.map(d => d.reason), ["No matching non-heading quote was found on the cited page.", "No matching non-heading quote was found on the cited page.", "Too long for a bid-form line.", "No title.", "No title."]);
assert.deepEqual(J.screenScope({}, scopeJob), { drafts: [], dropped: [] }, "No findings key: nothing, no crash");
for (const quote of ["SECTION 092900 - GYPSUM BOARD", "GYPSUM BOARD 092900 - 1", "Section Includes:"]) {
  const headingJob = { ...scopeJob, pages: [{ page: 434, text: `${quote}\nProvide interior gypsum board.` }] };
  assert.equal(J.screenScope({ findings: [finding({ citations: [{ page: 434, quote }] })] }, headingJob).drafts.length, 0, "A heading alone cannot substantiate a priced requirement");
  assert.equal(J.screenScope({ findings: [finding({ citations: [{ page: 434, quote: "Provide interior gypsum board." }] })] }, headingJob).drafts.length, 1);
}
assert.equal(J.screenScope({ findings: Array.from({ length: 30 }, () => finding()) }, scopeJob).drafts.length, 25, "At most 25 findings per request");
// What survives screening records as a run in the review queue.
const run = X.recordRun(X.EMPTY_EXTRACTION, sampleProcurement, { packageIds: ["drywall"], engine: { mode: "live", model: "deepseek-flash" }, documents: [{ name: "Project manual.pdf", pages: 2074 }], startedAt: "2026-10-14T10:00:00.000Z", finishedAt: "2026-10-14T10:01:00.000Z", drafts: screened.drafts });
assert.deepEqual(run.drafts.map(d => [d.kind, d.status, d.source]), [["scope", "pending-review", "09 29 00 · §3.6.B"], ["scope", "pending-review", "09 29 00"]]);

// ── Proposal job ──
const form = sampleProcurement.packages.find(p => p.id === "concrete").published;
const proposalPages = [
  { page: 1, text: "DISTRICT CONCRETE\nPROPOSAL\nContact: Sarah Chen  sarah@example.com\nBase Bid: $1,742,000.00\nWinter heat and enclosures are included." },
  { page: 2, text: "SCOPE: Foundations, slabs on grade, elevated slabs and housekeeping pads included.\nFloor flatness FF35/FL25 at gymnasium slab only.\nEXCLUSIONS: Testing and inspection by owner.\nDeduct alternate: delete housekeeping pads, ($18,500)." },
];
const proposalInput = (over = {}) => ({ form: { items: form.items }, document: "DC proposal.pdf", pages: proposalPages, ...over });
const proposalJob = J.parseProposalJob(proposalInput());
jobFails(() => J.parseProposalJob(proposalInput({ form: { items: [] } })), /bid form's items/);
jobFails(() => J.parseProposalJob(proposalInput({ form: { items: [{ id: "", title: "x" }] } })), /id and title/);
jobFails(() => J.parseProposalJob(proposalInput({ document: " " })), /proposal file/);
jobFails(() => J.parseProposalJob(proposalInput({ pages: Array.from({ length: 41 }, (_, i) => ({ page: i + 1, text: "x" })) })), /at most 40 pages/);
assert(J.proposalMessages(proposalJob)[1].content.includes("itemId scope-6") && J.proposalMessages(proposalJob)[0].content.includes("JSON"));

const answer = {
  baseBid: 1742000, baseBidCitation: { page: 1, quote: "Base Bid: $1,742,000.00" },
  responses: [
    { itemId: "scope-5", answer: "Y", note: "", citation: { page: 2, quote: "Foundations, slabs on grade, elevated slabs and housekeeping pads included" } },
    { itemId: "scope-6", answer: "P", note: "Gym slab only.", citation: { page: 2, quote: "Floor flatness FF35/FL25 at gymnasium slab only" } },
    { itemId: "scope-99", answer: "Y", citation: { page: 1, quote: "Base Bid" } },
  ],
  exclusions: [{ text: "Testing and inspection (by owner)", citation: { page: 2, quote: "Testing and inspection by owner" } }, { text: "Bonds", citation: { page: 2, quote: "Bonds are excluded from this price" } }],
  clarifications: [{ text: "Winter heat included", citation: { page: 1, quote: "Winter heat and enclosures are included" } }],
  alternates: [{ kind: "deduct", description: "Delete housekeeping pads", amount: 18500, citation: { page: 2, quote: "delete housekeeping pads, ($18,500)" } }, { kind: "add", description: "Sealer", amount: 9000, citation: { page: 2, quote: "delete housekeeping pads, ($18,500)" } }],
  submitter: { name: "Sarah Chen", email: "sarah@example.com" },
};
const read = J.screenProposal(answer, proposalJob);
assert.deepEqual([read.reading.baseBid, read.reading.baseBidCitations.map(c => c.page)], [1742000, [1]]);
assert.deepEqual(read.reading.responses.map(r => [r.scopeItemId, r.answer, r.note, r.citations.length]), [["scope-5", "Y", "", 1], ["scope-6", "P", "Gym slab only.", 1]], "One answer per form item; unknown items ignored");
assert.deepEqual([read.reading.exclusions.map(l => l.text), read.reading.clarifications.map(l => l.text), read.reading.alternates.map(a => [a.kind, a.amount])], [["Testing and inspection (by owner)"], ["Winter heat included"], [["deduct", 18500]]]);
assert.deepEqual(read.reading.submitter, { name: "Sarah Chen", email: "sarah@example.com" });
assert.deepEqual(read.dropped.map(d => d.what), ["Exclusion 2: Bonds", "Alternate 2: Sealer"], "Unquoted lines and an amount not in its quote are dropped");
const wrongPrice = J.screenProposal({ ...answer, baseBid: 1724000 }, proposalJob);
assert.deepEqual([wrongPrice.reading.baseBid, wrongPrice.dropped[0]], [null, { what: "Base bid", reason: "The amount isn't in a quote found on the page." }], "A misread price never passes");
const unsupported = J.screenProposal({ responses: [{ itemId: "scope-5", answer: "N", citation: { page: 2, quote: "Concrete pumping is excluded" } }, { itemId: "scope-6", answer: "maybe", citation: { page: 2, quote: "Floor flatness FF35/FL25 at gymnasium slab only" } }] }, proposalJob);
assert.deepEqual(unsupported.reading.responses.map(r => r.answer), [null, null], "An answer without a real quote, or not Y/N/P/N-A, becomes unanswered");
assert.deepEqual(unsupported.dropped.map(d => d.reason), ["Answer N has no quote found on the page.", "\"maybe\" isn't Y, N, P or N/A."]);
assert.equal(J.screenProposal({ responses: [{ itemId: "scope-6", answer: "NA", note: "Not in our scope", citation: { page: 2, quote: "Floor flatness FF35/FL25 at gymnasium slab only" } }] }, proposalJob).reading.responses[1].answer, "N/A");
const invented = J.screenProposal({ submitter: { name: "Bob Smith", email: "bob@x.com" } }, proposalJob);
assert.deepEqual([invented.reading.submitter, invented.dropped[0].what], [null, "Contact"], "A contact not printed in the proposal is dropped");
assert.deepEqual(J.screenProposal({ submitter: { name: "Sarah Chen", email: "nope@x.com" } }, proposalJob).reading.submitter, { name: "Sarah Chen", email: "" });
assert.deepEqual(J.screenProposal({ baseBid: "$1,742,000", baseBidCitation: { page: 1, quote: "Base Bid: $1,742,000.00" } }, proposalJob).reading.baseBid, 1742000, "A price written as text is read");
// What survives screening records as a reading and applies as a revision.
const readingInput = { ...read.reading, invitationId: "inv-2", formVersion: form.version, document: { name: "DC proposal.pdf", pages: 2, size: 5000 }, engine: { mode: "live", model: "deepseek-flash" }, readAt: "2026-10-14T10:00:00.000Z" };
const recorded = R.recordReading(R.EMPTY_PROPOSALS, sampleProcurement, readingInput);
const applied = R.applyReading({ proposals: recorded, submissions: sampleSubmissions, procurement: sampleProcurement }, recorded.readings[0].id, "jelleff", "Victor");
assert.equal(applied.submissions.find(s => s.invitationId === "inv-2").revisions.at(-1).baseBid, 1742000, "Screened AI reading → reviewed revision");

// ── Splitting pages into requests ──
const many = Array.from({ length: 12 }, (_, i) => ({ page: i + 1, text: "a".repeat(100) }));
assert.deepEqual(C.chunkPages(many).map(c => c.map(p => p.page)), [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
assert.deepEqual(C.chunkPages(many, 5, 250).map(c => c.length), [2, 2, 2, 2, 2, 2], "The character limit splits sooner");
assert.deepEqual(C.chunkPages([{ page: 1, text: "b".repeat(70_000) }]).map(c => c[0].text.length), [60_000], "One huge page is cut to the limit");

// ── DeepSeek client (fetch mocked) ──
const reply = (content, finish = "stop", status = 200) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status });
const scripted = (...responses) => { const calls = []; return { calls, fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); const r = responses.shift(); if (r instanceof Error) throw r; return r; } }; };
const ask = (s) => D.deepseekJson("sk-test", [{ role: "user", content: "json" }], { model: "deepseek-flash", maxTokens: 100, budgetMs: 30_000, fetchImpl: s.fetchImpl });
let s = scripted(reply('{"findings":[]}'));
assert.deepEqual(await ask(s), { findings: [] });
assert.deepEqual([s.calls[0].url, s.calls[0].auth, s.calls[0].body.model, s.calls[0].body.response_format, s.calls[0].body.stream], ["https://api.deepseek.com/chat/completions", "Bearer sk-test", "deepseek-flash", { type: "json_object" }, false]);
assert.deepEqual(s.calls[0].body.thinking, { type: "disabled" }, "Readings reserve their output budget for cited JSON, rather than extra reasoning");
s = scripted(reply(""), reply('{"ok":1}'));
assert.deepEqual([await ask(s), s.calls.length], [{ ok: 1 }, 2], "An empty answer is asked once more");
s = scripted(new Response("busy", { status: 429 }), reply('{"ok":2}'));
assert.deepEqual(await ask(s), { ok: 2 }, "Rate limited: once more");
await assert.rejects(ask(scripted(new Response("bad key", { status: 401 }))), e => e instanceof D.DeepSeekError && /401: bad key/.test(e.message), "Auth errors are not retried");
await assert.rejects(ask(scripted(reply('{"a":', "length"))), /cut off/);
await assert.rejects(ask(scripted(reply("not json"), reply("still not"))), /wasn't valid JSON/);
await assert.rejects(ask(scripted(new TypeError("fetch failed"))), /could not be reached/);
await assert.rejects(D.deepseekJson("k", [], { model: "m", maxTokens: 1, budgetMs: 30_000, fetchImpl: async () => ({ ok: true, json: async () => { throw new DOMException("Body timed out", "TimeoutError"); } }) }), /timed out/, "A timed-out response body must not become an empty answer or a retry");
const canceled = new AbortController(); canceled.abort();
await assert.rejects(D.deepseekJson("k", [], { model: "m", maxTokens: 1, budgetMs: 30_000, signal: canceled.signal, fetchImpl: async (_url, init) => { init.signal.throwIfAborted(); } }), /canceled/, "Canceling the reading aborts the upstream request");
await assert.rejects(D.deepseekJson("k", [], { model: "m", maxTokens: 1, budgetMs: 1000, fetchImpl: async () => { throw new Error("should not call"); } }), /no answer/, "No time left: no call");
assert.equal(D.textModel(), "deepseek-flash");

// ── Browser side: assembling a run from several requests (fetch mocked) ──
const realFetch = globalThis.fetch;
try {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    if (body.input.pages[0].page === 6) return Response.json({ error: "DeepSeek took too long." }, { status: 502 });
    return Response.json({ model: "deepseek-flash", drafts: [{ kind: "scope", key: `${body.input.section.section}-1`, packageId: "drywall", title: `From page ${body.input.pages[0].page}`, detail: "", source: "09 29 00", citations: [{ document: "M.pdf", page: body.input.pages[0].page, sheet: null, quote: "q" }] }], dropped: [{ what: "x", reason: "y" }] });
  };
  const section = { section: "09 29 00", title: "GYPSUM BOARD", firstPage: 1, lastPage: 12, pages: many };
  const progress = [];
  const result = await C.extractTradeScope({ pkg: { id: "drywall", name: "Drywall", code: "09 29 00" }, manual: { name: "M.pdf", pageCount: 2074 }, sections: [section], onProgress: (d, t) => progress.push(`${d}/${t}`) });
  assert.deepEqual([bodies.length, bodies.every(b => b.job === "scope" && b.input.document === "M.pdf"), progress], [3, true, ["1/3", "2/3", "3/3"]]);
  assert.deepEqual(result.input.drafts.map(d => d.key), ["09 29 00-1@1", "09 29 00-1@11"], "Keys stay unique across requests");
  assert.deepEqual([result.failures, result.dropped.length, result.input.engine, result.input.documents], [[{ section: "09 29 00", pages: "6–10", error: "DeepSeek took too long." }], 2, { mode: "live", model: "deepseek-flash" }, [{ name: "M.pdf", pages: 2074 }]]);
  globalThis.fetch = async () => Response.json({ error: "Structor's AI isn't set up on this server: DEEPSEEK_API_KEY is missing." }, { status: 503 });
  const failed = await C.extractTradeScope({ pkg: { id: "drywall", name: "Drywall", code: "" }, manual: { name: "M.pdf", pageCount: 2074 }, sections: [section] });
  assert.deepEqual([failed.input.drafts, failed.input.error], [[], "Structor's AI isn't set up on this server: DEEPSEEK_API_KEY is missing."]);
  assert.equal(X.recordRun(X.EMPTY_EXTRACTION, sampleProcurement, failed.input).runs[0].status, "failed", "Every request failed: recorded as a failed run");
  globalThis.fetch = async () => Response.json({ model: "deepseek-flash", reading: read.reading, dropped: [] });
  const proposal = await C.readProposal({ invitationId: "inv-2", form, proposal: { name: "DC proposal.pdf", size: 5000, pageCount: 3, pages: [...proposalPages, { page: 3, text: " " }], emptyPages: 1 } });
  assert.deepEqual([proposal.input.invitationId, proposal.input.formVersion, proposal.input.document, proposal.input.engine.mode, proposal.input.baseBid], ["inv-2", 1, { name: "DC proposal.pdf", pages: 3, size: 5000 }, "live", 1742000]);
  await assert.rejects(C.readProposal({ invitationId: "inv-2", form, proposal: { name: "scan.pdf", size: 1, pageCount: 1, pages: [{ page: 1, text: "" }], emptyPages: 1 } }), /no text layer/);
  const longForm = { ...form, items: Array.from({ length: 45 }, (_, i) => ({ ...form.items[0], id: `long-${i}`, title: `Scope ${i}` })) };
  const batchSizes = [];
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body).input;
    batchSizes.push(input.form.items.length);
    return Response.json({ model: "test", dropped: [], reading: { ...read.reading, responses: input.form.items.map(item => ({ scopeItemId: item.id, answer: null, note: "", citations: [] })) } });
  };
  const longArgs = { invitationId: "inv-2", form: longForm, proposal: { name: "proposal.pdf", size: 1000, pageCount: 2, pages: proposalPages, emptyPages: 0 } };
  const batched = await C.readProposal(longArgs);
  assert.deepEqual(batchSizes, [20, 20, 5]);
  assert.deepEqual(batched.input.responses.map(response => response.scopeItemId), longForm.items.map(item => item.id));
  assert.equal(batched.input.exclusions.length, read.reading.exclusions.length, "Repeated proposal terms are not duplicated across batches");
  assert.throws(() => J.mergeProposalReadings([{ reading: read.reading, dropped: [] }, { reading: { ...read.reading, baseBid: 2 }, dropped: [] }]), /disagree/);
  let attempted = 0;
  globalThis.fetch = async () => { attempted++; return Response.json({ error: "Service timeout" }, { status: 502 }); };
  await assert.rejects(C.readProposal(longArgs), /Service timeout/);
  assert.equal(attempted, 1, "A failed batch never becomes a partial reading or sends later requests");
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(C.readProposal({ ...longArgs, signal: stopped.signal }), error => error.name === "AbortError");
  assert.equal(attempted, 1, "Cancellation sends no request");
} finally {
  globalThis.fetch = realFetch;
}

console.log("AI checked: demo password, manual sections, quote screening, scope and proposal jobs end to end into review, request splitting, DeepSeek client retries and errors, run assembly.");

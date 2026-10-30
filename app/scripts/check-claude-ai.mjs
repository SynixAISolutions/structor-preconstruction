import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/claude.ts");
const R = await import("../lib/drawing-reader.ts");
const B = await import("../lib/bid-package-ai.ts");
const H = await import("../lib/sheet-reference-ai.ts");
const P = await import("../lib/project-scopes.ts");
const K = await import("../lib/ai-cost.ts");
const A = await import("../lib/auto-scope-plan.ts");

// ── Claude's answer as JSON ──
assert.deepEqual(C.jsonFromText('{"a":1}'), { a: 1 });
assert.deepEqual(C.jsonFromText('```json\n{"a":[1,2]}\n```'), { a: [1, 2] }, "A fenced answer");
assert.deepEqual(C.jsonFromText('Here are the packages:\n{"packages":[]}\nDone.'), { packages: [] }, "An answer with a sentence around the object");
assert.throws(() => C.jsonFromText("No object here."), SyntaxError);
assert.equal(C.claudeModel({}), "claude-haiku-5-5", "Haiku 5.5 unless the server names another model");
assert.equal(C.claudeModel({ CLAUDE_MODEL: " claude-sonnet-5-5 " }), "claude-sonnet-5-5");
assert.deepEqual([C.claudeEffort({}), C.claudeEffort({ CLAUDE_EFFORT: "HIGH" }), C.claudeEffort({ CLAUDE_EFFORT: "fast" })], ["low", "high", "low"], "Effort defaults to low; an unknown value is ignored");

const drawing = [{ role: "system", content: "Read this." }, { role: "system", content: "As JSON." }, { role: "user", content: [{ type: "text", text: "Sheet A1.1" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/AA==", detail: "original" } }] }];
const req = C.claudeRequest(drawing);
assert.deepEqual(req.system, [{ type: "text", text: "Read this.\n\nAs JSON.", cache_control: { type: "ephemeral" } }], "System messages become Claude's system prompt, cached: it is the same on every request of a job");
assert.equal(C.claudeRequest([{ role: "user", content: "x" }]).system, undefined, "No system prompt, nothing to cache");
assert.deepEqual(req.messages, [{ role: "user", content: [{ type: "text", text: "Sheet A1.1" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/AA==" } }] }], "A data-URL image becomes a base64 image block");

// ── Claude through the SDK, with a fake API ──
const sse = (text, stop = "end_turn") => [
  ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }],
  ["message_stop", { type: "message_stop" }],
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
const calls = [];
const fake = replies => async (url, init) => {
  const href = String(url instanceof Request ? url.url : url);
  const headers = new Headers(init?.headers);
  calls.push({ url: href, body: init?.body ? JSON.parse(init.body) : null, key: headers.get("x-api-key"), auth: headers.get("authorization") });
  const next = replies.shift();
  if (typeof next === "number") return new Response(JSON.stringify({ type: "error", error: { type: next === 401 ? "authentication_error" : "overloaded_error", message: "busy" } }), { status: next, headers: { "content-type": "application/json" } });
  if (next?.deepseek) return Response.json({ choices: [{ message: { content: next.deepseek }, finish_reason: "stop" }] });
  return new Response(sse(next.text, next.stop), { status: 200, headers: { "content-type": "text/event-stream" } });
};
const text = [{ role: "system", content: "Read this." }, { role: "user", content: "Some specification text" }];
const claudeEnv = { ANTHROPIC_API_KEY: "sk-ant-test" };

calls.length = 0;
let r = await R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 1000, budgetMs: 30_000, env: claudeEnv, fetchImpl: fake([{ text: '```json\n{"ok":1}\n```' }]) });
assert.deepEqual([r.model, r.output], ["claude-haiku-5-5", { ok: 1 }], "With the Anthropic key every job reads with Claude");
assert.ok(Math.abs(r.cost - (10 * 0.1 + 5 * 0.5) / 1e6) < 1e-12, "The answer carries what it cost: 10 tokens in, 5 out at Haiku 5.5's prices");
assert.match(calls[0].url, /api\.anthropic\.com\/v1\/messages/);
assert.ok(calls[0].key === "sk-ant-test" || calls[0].auth === "Bearer sk-ant-test", "The Anthropic key is sent");
assert.equal(calls[0].body.model, "claude-haiku-5-5");
assert.deepEqual(calls[0].body.system, [{ type: "text", text: "Read this.", cache_control: { type: "ephemeral" } }], "The instructions are sent with a cache breakpoint");
assert.equal(calls[0].body.stream, true, "Streamed, so a long thinking answer doesn't hit the request time limit");
assert.deepEqual(calls[0].body.output_config, { effort: "low" });
assert.ok(calls[0].body.max_tokens > 1000, "max_tokens leaves room for Claude's thinking");
assert.equal(calls[0].body.thinking, undefined, "Claude 5.5 models think by themselves: no thinking setting is sent");

calls.length = 0;
r = await R.readJson(drawing, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 1000, budgetMs: 30_000, env: { ...claudeEnv, CLAUDE_EFFORT: "medium" }, fetchImpl: fake([{ text: '{"tags":[]}' }]) });
assert.equal(r.model, "claude-haiku-5-5", "Drawing images go to Claude too");
assert.equal(calls[0].body.messages[0].content[1].type, "image");
assert.deepEqual(calls[0].body.output_config, { effort: "medium" });

calls.length = 0;
r = await R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 100, budgetMs: 60_000, env: claudeEnv, fetchImpl: fake([529, 529, 529, { deepseek: '{"ok":2}' }]) });
assert.deepEqual([r.model, r.output], ["deepseek-flash", { ok: 2 }], "Claude overloaded (after the SDK's retries): DeepSeek answers, and the answer names it");
assert.equal(calls.length, 4);
assert.equal(calls[3].auth, "Bearer ds-key");

calls.length = 0;
await assert.rejects(R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 100, budgetMs: 30_000, env: claudeEnv, fetchImpl: fake([401]) }), e => e instanceof C.ClaudeError && /ANTHROPIC_API_KEY/.test(e.message), "A refused key is reported, not hidden behind DeepSeek");
assert.equal(calls.length, 1);

await assert.rejects(R.readJson(text, { deepseekKey: "", model: "deepseek-flash", maxTokens: 100, budgetMs: 60_000, env: claudeEnv, fetchImpl: fake([529, 529, 529]) }), e => e instanceof C.ClaudeError && e.busy, "No DeepSeek key: Claude's error stands");
await assert.rejects(R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 100, budgetMs: 30_000, env: claudeEnv, fetchImpl: fake([{ text: '{"cut":', stop: "max_tokens" }]) }), /cut off/);
calls.length = 0;
r = await R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 100, budgetMs: 30_000, env: claudeEnv, fetchImpl: fake([{ text: "I can't give JSON." }, { text: '{"ok":3}' }]) });
assert.deepEqual([calls.length, r.output], [2, { ok: 3 }], "An answer without JSON is asked once more");

calls.length = 0;
r = await R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 100, budgetMs: 30_000, env: { ...claudeEnv, AI_PROVIDER: "deepseek" }, fetchImpl: fake([{ deepseek: '{"ok":4}' }]) });
assert.deepEqual([r.model, calls[0].url], ["deepseek-flash", "https://api.deepseek.com/chat/completions"], "AI_PROVIDER=deepseek keeps DeepSeek");
await assert.rejects(R.readJson(text, { deepseekKey: "", model: "deepseek-flash", maxTokens: 100, budgetMs: 30_000, env: {}, fetchImpl: fake([]) }), /ANTHROPIC_API_KEY \(Claude\) or DEEPSEEK_API_KEY/, "No key at all says which to add");
assert.equal(R.usesClaude({ ANTHROPIC_API_KEY: "  " }), false);

// ── The AI sets the bid packages ──
const job = B.parseBidPackageJob({
  sections: [{ section: "01 10 00", title: "Summary" }, { section: "09 21 16", title: "Gypsum Board Assemblies" }, { section: "09 51 13", title: "Acoustical Panel Ceilings" }, { section: "08 11 13", title: "Hollow Metal Doors and Frames" }, { section: "08 71 00", title: "Door Hardware" }, { section: "22 11 16", title: "Domestic Water Piping" }, { section: "09 21 16", title: "duplicate" }, { section: "bad", title: "x" }],
  sheets: [{ sheet: "A8.1", title: "PARTITION TYPES", discipline: "Architectural" }, { sheet: "A6.1", title: "DOOR SCHEDULE", discipline: "Architectural" }, { sheet: "C1.0", title: "SITE PLAN", discipline: "Civil" }],
  packages: [{ id: "drywall", name: "Drywall", code: "09 29 00" }],
});
assert.deepEqual(job.sections.map(s => s.section), ["09 21 16", "09 51 13", "08 11 13", "08 71 00", "22 11 16"], "Division 01, duplicates and malformed numbers aren't sent");
const messages = B.bidPackageMessages(job);
assert.match(messages[1].content, /id drywall: Drywall \(09 29 00\)/);
assert.match(messages[1].content, /A6\.1 \| Architectural \| DOOR SCHEDULE/);
assert.throws(() => B.parseBidPackageJob({ sections: [], sheets: [] }), /no specification sections or drawing sheets/);

const plan = B.screenBidPackages({ packages: [
  { existing: "drywall", name: "Drywall & acoustical ceilings", code: "09 29 00", sections: ["09 21 16", "09 51 13", "09 99 99"], sheets: ["A8.1", "Z9"], why: "One contractor." },
  { existing: null, name: "Doors, frames & hardware", code: "08 11 13", sections: ["08 11 13", "08 71 00", "09 21 16"], sheets: ["A6.1"] },
  { existing: null, name: "Sitework", code: "nope", sections: [], sheets: ["C1.0"] },
  { existing: null, name: "Ghost", code: "10 00 00", sections: ["10 14 00"], sheets: [] },
  { existing: "made-up", name: "doors, FRAMES & hardware", code: "08 11 13", sections: [], sheets: ["A8.1"] },
] }, job);
assert.deepEqual(plan.packages.map(p => [p.existing, p.name, p.sections.join(), p.sheets.join()]), [
  ["drywall", "Drywall & acoustical ceilings", "09 21 16,09 51 13", "A8.1"],
  [null, "Doors, frames & hardware", "08 11 13,08 71 00", "A6.1,A8.1"],
], "Only listed sections and sheets; a section goes to the first package that takes it; a same-named package joins the first");
assert.deepEqual(plan.unassigned, ["22 11 16"], "A section the AI left out is reported");
assert.ok(plan.dropped.some(d => d.what === "Sitework" && /CSI section/.test(d.reason)), "A package with no section number can't be added");
assert.ok(plan.dropped.some(d => d.what === "Ghost"), "A package with nothing from the project's lists is set aside");
assert.ok(plan.dropped.some(d => /09 99 99/.test(d.reason)), "Sections not in the manual are named");

const proc = { packages: [{ id: "drywall", name: "Drywall", division: "09", code: "09 29 00", owner: "Ana", due: "" }], scopes: [], invitations: [] };
const applied = B.applyBidPackagePlan(proc, plan);
assert.deepEqual(applied.added, ["Doors, frames & hardware"]);
assert.deepEqual(applied.procurement.packages.map(p => [p.id, p.name, p.owner, (p.sections ?? []).join(), (p.sheets ?? []).join()]), [
  ["drywall", "Drywall", "Ana", "09 21 16,09 51 13", "A8.1"],
  ["doors-frames-hardware", "Doors, frames & hardware", "", "08 11 13,08 71 00", "A6.1,A8.1"],
], "An existing package keeps its name and owner and takes the AI's sections and sheets");
assert.deepEqual(B.applyBidPackagePlan(applied.procurement, plan).added, [], "Applying the same plan again adds nothing");

// The packages' sections and sheets lead the scope reading.
const sec = (section, title = "") => ({ section, title, first: 1, last: 2 });
const by = P.sectionsByTrade([sec("09 21 16"), sec("09 51 13"), sec("08 71 00"), sec("09 65 13")], applied.procurement.packages);
assert.deepEqual(Object.fromEntries([...by].map(([id, list]) => [id, list.map(s => s.section)])), { drywall: ["09 21 16", "09 51 13", "09 65 13"], "doors-frames-hardware": ["08 71 00"] }, "Sections go where the AI put them; one it didn't place follows the CSI rules");
const sheetList = [{ sheet: "A1.1", title: "FLOOR PLAN", discipline: "Architectural" }, { sheet: "A6.1", title: "DOOR SCHEDULE", discipline: "Architectural" }, { sheet: "A8.1", title: "PARTITION TYPES", discipline: "Architectural" }];
assert.deepEqual(P.sheetsForTrade(sheetList, applied.procurement.packages[1]).map(r => r.sheet), ["A6.1", "A8.1"], "The AI's sheets, in its order");
assert.deepEqual(P.sheetsForTrade(sheetList, { code: "08 11 13" }).map(r => r.sheet), ["A6.1"], "A package without AI sheets keeps the title rules");

// ── The AI finds each package on the drawings ──
const batches = H.referenceBatches([{ text: "a".repeat(30_000) }, { text: "b".repeat(30_000) }, { text: "c" }, { text: "d" }, { text: "e" }, { text: "f" }, { text: "g".repeat(50_000) }]);
assert.deepEqual(batches.map(b => b.length), [1, 4, 2], "At most four sheets and 48,000 characters a request");
assert.equal(batches[2][1].text.length, 40_000, "A very long sheet is cut");
const sheetJob = H.parseSheetReferenceJob({
  packages: [{ id: "drywall", name: "Drywall", code: "09 29 00", sections: ["09 21 16 Gypsum Board Assemblies"] }, { id: "doors", name: "Doors", code: "08 11 13", sections: [] }],
  sheets: [{ sheet: "A8.1", title: "PARTITION TYPES", discipline: "Architectural", text: "PARTITION TYPES\n5/8\" TYPE X GYPSUM BOARD EACH SIDE OF 3-5/8\" METAL STUDS TO DECK\nPROVIDE ACOUSTICAL SEALANT AT HEAD AND SILL\nDOOR TYPE A: HOLLOW METAL" }, { sheet: "A9.1", title: "BLANK", discipline: "", text: "  " }],
});
assert.deepEqual(sheetJob.sheets.map(s => s.sheet), ["A8.1"], "Sheets with no text aren't sent");
const refMessages = H.sheetReferenceMessages(sheetJob);
assert.match(refMessages.at(-1).content, /\[\[sheet A8\.1 \| Architectural \| PARTITION TYPES\]\]/);
assert.match(C.claudeRequest(refMessages).system[0].text, /id drywall: Drywall \(09 29 00\); sections 09 21 16/, "The package list goes in the cached instructions, the same for every batch");
assert.doesNotMatch(refMessages.at(-1).content, /Bid packages:/, "Only the sheets vary from batch to batch");
const found = H.screenSheetReferences({ sheets: [
  { sheet: "A8.1", packages: [
    { id: "drywall", lines: ["5/8\" TYPE X GYPSUM BOARD EACH SIDE OF 3-5/8\" METAL STUDS TO DECK", "PROVIDE ACOUSTICAL SEALANT AT HEAD AND SILL", "INSTALL LEVEL 5 FINISH THROUGHOUT", "PROVIDE ACOUSTICAL SEALANT AT HEAD AND SILL"] },
    { id: "doors", lines: ["DOOR TYPE A: HOLLOW METAL"] },
    { id: "invented", lines: ["PARTITION TYPES"] },
  ] },
  { sheet: "Z1.1", packages: [{ id: "drywall", lines: ["x"] }] },
] }, sheetJob);
assert.deepEqual(found.sheets, [{ sheet: "A8.1", packages: [{ id: "drywall", lines: ["5/8\" TYPE X GYPSUM BOARD EACH SIDE OF 3-5/8\" METAL STUDS TO DECK", "PROVIDE ACOUSTICAL SEALANT AT HEAD AND SILL"] }, { id: "doors", lines: ["DOOR TYPE A: HOLLOW METAL"] }] }], "Only lines printed on the sheet, for listed packages, once each");
assert.equal(found.dropped, 3, "An unprinted line, an unknown package and an unknown sheet are counted as set aside");
assert.throws(() => H.parseSheetReferenceJob({ packages: [], sheets: [] }), /bid packages/);


// ── What a reading costs ──
assert.equal(K.costOf("claude-opus-5-5", { input: 1_000_000, output: 100_000 }), 6, "$4 a million in, $20 a million out");
assert.equal(K.costOf("claude-sonnet-5-5", { input: 1_000_000, output: 100_000 }), 3);
assert.equal(K.costOf("deepseek-flash", { input: 1, output: 1 }), null, "DeepSeek's cost isn't tracked");
assert.ok(Math.abs(K.costOf("claude-opus-5-5", { input: 0, output: 0, cacheWrite: 1_000_000, cacheRead: 1_000_000 }) - 5.2) < 1e-9, "Opus: cache writes at 1.25x, reads at 0.05x");
assert.ok(Math.abs(K.costOf("claude-haiku-5-5", { input: 0, output: 0, cacheWrite: 1_000_000, cacheRead: 1_000_000 }) - 0.135) < 1e-9, "Haiku: cache writes at 1.25x, reads at 0.1x");
const est = K.estimateCost("claude-opus-5-5", { requests: 40, chars: 1_400_000 });
assert.ok(est > 3 && est < 4, `205 drawing sheets' text in 40 requests is a few dollars (${est})`);
assert.equal(K.estimateCost("claude-opus-5-5", { requests: 0, chars: 0 }), 0);
assert.equal(K.estimateCost("deepseek-flash", { requests: 3, chars: 100 }), null);
assert.deepEqual([K.dollars(0.004), K.dollars(0.426), K.dollars(3.456), K.dollars(23.6)], ["under $0.01", "$0.43", "$3.46", "$24"]);


// ── An upload under $2 is read in full by itself ──
const fourFiles = [
  { sections: [{ first: 1, last: 8 }], sheets: [{}] },            // Tile: 8 manual pages, 1 sheet
  { sections: [{ first: 9, last: 14 }, { first: 15, last: 16 }], sheets: [{}] }, // Drywall: 8 pages in two sections, 1 sheet
];
assert.deepEqual(A.readingWork(fourFiles), { requests: 6, chars: 16 * 3_500 + 2 * 4_000, images: 2 }, "A request per five pages of each trade, one per sheet");
const small = K.estimateCost("claude-opus-5-5", A.readingWork(fourFiles)) + K.estimateCost("claude-opus-5-5", H.referenceWork([{ text: "x".repeat(8_000) }, { text: "y".repeat(9_000) }], [{ name: "Tile", sections: ["09 30 13 Tiling"] }]));
assert.ok(small < K.AUTO_READ_UNDER, `Two drawings and two sections read by themselves (${small})`);
const big = K.estimateCost("claude-opus-5-5", A.readingWork([{ sections: [{ first: 1, last: 1084 }], sheets: Array(120).fill({}) }]));
assert.ok(big > 20, `Project 1's manual and drawings wait for the estimator (${big})`);
assert.deepEqual(H.referenceWork([{ text: "  " }, { text: "A".repeat(50) }], [{ name: "Tile", sections: [] }]), { requests: 1, chars: 50 + 24 }, "Sheets without text aren't counted");
assert.equal(A.runSummary({ trades: [], added: 0, duplicates: 0, newTrades: ["Tile"], scopesLater: true, fullCost: 31.2 }), "Bid packages set; reading every trade would cost about $31, so choose trades in Write scopes with AI · 1 new bid package");


// Haiku reads Project 1 in full for about what Opus charges for a few trades.
const fullHaiku = K.estimateCost("claude-haiku-5-5", A.readingWork([{ sections: [{ first: 1, last: 1084 }], sheets: Array(120).fill({}) }]));
assert.ok(fullHaiku < big / 15, `Haiku costs about a twentieth of Opus (${fullHaiku} vs ${big})`);

console.log("Claude, AI bid packages and AI drawing references: all checks passed");

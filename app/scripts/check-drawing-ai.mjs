import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/drawing-reader.ts");
const O = await import("../lib/openai.ts");
const S = await import("../lib/drawing-score.ts");

// ── Which AI reads drawings ──
assert.deepEqual(R.drawingReader("deepseek-flash", {}), { provider: "deepseek", model: "deepseek-flash" }, "DeepSeek by default, with the job's own model");
assert.deepEqual(R.drawingReader("deepseek-flash", { DRAWING_AI_PROVIDER: " OpenAI " }), { provider: "openai", model: R.DEFAULT_OPENAI_DRAWING_MODEL });
assert.deepEqual(R.drawingReader("deepseek-flash", { DRAWING_AI_PROVIDER: "openai", OPENAI_DRAWING_MODEL: "gpt-6-astra" }).model, "gpt-6-astra");
const text = [{ role: "system", content: "Read this." }, { role: "user", content: "Some specification text" }];
const drawing = [{ role: "system", content: "Read this." }, { role: "user", content: [{ type: "text", text: "Sheet A1.1" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/AA==", detail: "original" } }] }];
assert.deepEqual([R.sendsImages(text), R.sendsImages(drawing)], [false, true]);

const calls = [];
const fake = replies => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  const next = replies.shift();
  return typeof next === "number" ? new Response("busy", { status: next }) : Response.json({ choices: [next] });
};
const answer = content => ({ message: { content }, finish_reason: "stop" });
const openaiEnv = { DRAWING_AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", OPENAI_DRAWING_MODEL: "gpt-6.1-sol" };

calls.length = 0;
let r = await R.readJson(text, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 1000, budgetMs: 30_000, env: openaiEnv, fetchImpl: fake([answer('{"ok":1}')]) });
assert.deepEqual([calls[0].url, calls[0].auth, r.model, r.output], ["https://api.deepseek.com/chat/completions", "Bearer ds-key", "deepseek-flash", { ok: 1 }], "Text jobs stay on DeepSeek whatever the drawing setting");

calls.length = 0;
r = await R.readJson(drawing, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 4000, budgetMs: 30_000, env: openaiEnv, fetchImpl: fake([answer('{"tags":[]}')]) });
const body = calls[0].body;
assert.deepEqual([calls[0].url, calls[0].auth, r.model], ["https://api.openai.com/v1/chat/completions", "Bearer sk-test", "gpt-6.1-sol"], "Drawing images go to OpenAI when set");
assert.deepEqual([body.model, body.response_format, body.max_completion_tokens, body.reasoning_effort, body.thinking, body.max_tokens], ["gpt-6.1-sol", { type: "json_object" }, 4000 + 16_000, "low", undefined, undefined], "OpenAI's own parameters: room for reasoning, low effort, no DeepSeek-only fields");
assert.equal(body.messages[1].content[1].image_url.detail, "original", "The image is sent as the app renders it");

calls.length = 0;
await R.readJson(drawing, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 10, budgetMs: 30_000, env: { ...openaiEnv, OPENAI_REASONING_EFFORT: "" }, fetchImpl: fake([answer("{}")]) });
assert.equal(calls[0].body.reasoning_effort, undefined, "An empty effort leaves it to the model");
calls.length = 0;
r = await R.readJson(drawing, { deepseekKey: "ds-key", model: "deepseek-flash", maxTokens: 10, budgetMs: 30_000, env: openaiEnv, reader: { provider: "deepseek", model: "deepseek-v4-pro" }, fetchImpl: fake([answer("{}")]) });
assert.deepEqual([calls[0].url, calls[0].body.model], ["https://api.deepseek.com/chat/completions", "deepseek-v4-pro"], "The scoring script can pick a reader directly");
await assert.rejects(R.readJson(drawing, { deepseekKey: "k", model: "deepseek-flash", maxTokens: 10, budgetMs: 30_000, env: { DRAWING_AI_PROVIDER: "openai" }, fetchImpl: fake([]) }), e => e instanceof O.OpenAiError && /OPENAI_API_KEY is missing/.test(e.message));

calls.length = 0;
assert.deepEqual(await O.openaiJson("k", drawing, { model: "m", maxTokens: 10, budgetMs: 30_000, fetchImpl: fake([429, answer("not json"), answer('{"a":2}')]) }).catch(e => e.message), "OpenAI's answer wasn't valid JSON.", "Two tries, like DeepSeek");
await assert.rejects(O.openaiJson("k", drawing, { model: "m", maxTokens: 10, budgetMs: 30_000, fetchImpl: fake([{ message: { content: "", refusal: "I can't help with that." }, finish_reason: "stop" }]) }), /OpenAI declined/);
await assert.rejects(O.openaiJson("k", drawing, { model: "m", maxTokens: 10, budgetMs: 30_000, fetchImpl: fake([{ message: { content: '{"tags":[' }, finish_reason: "length" }]) }), /cut off/);
await assert.rejects(O.openaiJson("k", drawing, { model: "m", maxTokens: 10, budgetMs: 30_000, fetchImpl: fake([401]) }), /OpenAI answered 401/);

// ── The Jelleff answer key and the score ──
const a11 = S.jelleffTruth("A1.1"), a12 = S.jelleffTruth("A1.2");
assert.deepEqual([a11.doors.length, a11.walls.length, a11.rooms.length], [29, 4, 13], "A1.1: the traced doors, tagged walls and rooms");
assert.deepEqual([a12.doors.length, a12.walls.length, a12.rooms.length], [17, 5, 17], "A1.2");
assert.ok([...a11.doors, ...a11.rooms].every(x => x.at.every(v => v > 0 && v < 1)), "Positions are fractions of the page");
assert.throws(() => S.jelleffTruth("A9.9"), /No hand trace/);

const perfect = t => [
  ...t.doors.map(d => ({ kind: "door", text: d.number, at: d.at })),
  ...t.walls.map(w => ({ kind: "wall", text: w.tag.replace(/^SA/, "SA. ").replace(/(\d)\.(\d)/, "$1. $2"), at: [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2] })),
  ...t.rooms.map(x => ({ kind: "room", text: x.number, name: x.name, at: x.at })),
];
let score = S.scoreSheet(a11, perfect(a11));
assert.deepEqual([score.doors.correct, score.walls.correct, score.rooms.correct], [29, 4, 13], "Right text in the right place scores every item (wall tags as printed, \"SA. 3. 10\")");
assert.equal(score.doors.inSchedule, 29, "Every traced door is on A8.2");
assert.equal(S.scoreSheet(a11, [...perfect(a11), ...perfect(a11)]).doors.reads, 29, "The same tag read on two overlapping tiles counts once");
const feetX = 1 / a11.widthFeet;
score = S.scoreSheet(a11, perfect(a11).map(t => ({ ...t, at: [t.at[0] + 40 * feetX, t.at[1]] })));
assert.deepEqual([score.doors.correct, score.doors.missed + score.doors.wrongText], [0, 29], "40 ft away is not near the door (it may land by a neighbour's)");
score = S.scoreSheet(a11, perfect(a11).map(t => t.kind === "door" ? { ...t, text: `${t.text}X` } : t));
assert.deepEqual([score.doors.correct, score.doors.wrongText, score.doors.inSchedule], [0, 29, 0], "Wrong text near the door, and not on the schedule");
assert.match(score.doors.misses[0], /^door 101A: read 101AX$/);
score = S.scoreSheet(a11, [{ kind: "wall", text: "SA9.99", at: [0.5, 0.5] }]);
assert.deepEqual([score.walls.reads, score.walls.inSchedule, score.walls.missed], [1, 0, 4], "A code that isn't on A8.1");
assert.deepEqual(S.onPage([0.5, 0.25, 0.2, 0.1], [{ kind: "door", text: "1", at: [0.5, 0.5] }])[0].at, [0.6, 0.3], "Tile positions placed on the page");

// The scorer's tiles: on the page and over every traced item (an outline in feet once put them all off the page).
for (const [t, expected] of [[a11, 28], [a12, 16]]) {
  const tiles = S.truthTiles(t, { widthPt: 3024, heightPt: 2160 }); // Jelleff's 42 x 30 in sheets
  assert.equal(tiles.length, expected, `${t.sheet}: the tile count a run on the real drawing set gave`);
  assert.ok(tiles.every(([x, y, w, h]) => x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9), `${t.sheet}: every tile is on the page`);
  const covered = ([px, py]) => tiles.some(([x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h);
  assert.ok([...t.doors.map(d => d.at), ...t.rooms.map(r => r.at), ...t.walls.flatMap(w => [w.a, w.b])].every(covered), `${t.sheet}: every door, wall tag and room is inside a tile`);
}

// ── Locate scope items on a sheet (Marcel, 22 Oct, Drawing Flip) ──
const D = await import("../lib/drawing-ai.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");
assert.equal(EXTRA_JOBS["scope-locate"], D.scopeLocate, "The AI route serves the locate job");
const locateInput = { pkg: { id: "drywall", name: "Drywall", code: "09 29 00" }, document: "JRC.pdf", sheet: "A1.1", page: 46, text: "", image: "data:image/jpeg;base64,/9j/AA==",
  items: [{ id: "scope-12", title: "Install gypsum board wall systems.", detail: "Level 4 finish" }, { id: "scope-17", title: "Provide metal stud framing." }] };
const lj = D.parseLocateJob(locateInput);
assert.deepEqual(lj.items.map(i => [i.id, i.detail]), [["scope-12", "Level 4 finish"], ["scope-17", ""]]);
assert.throws(() => D.parseLocateJob({ ...locateInput, items: [] }), /1 to 40 scope items/);
assert.throws(() => D.parseLocateJob({ ...locateInput, items: [locateInput.items[0], locateInput.items[0]] }), /unique/);
assert.throws(() => D.parseLocateJob({ ...locateInput, image: "https://example.com/x.jpg" }), /JPEG/);
assert.match(D.locateMessages(lj)[1].content[0].text, /- scope-12: Install gypsum board wall systems\. \(Level 4 finish\)/);
const box = [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.4 }];
const located = D.screenLocate({ sheet: "a-1.1", found: [
  { id: "scope-12", polygon: box, evidence: "Partition tags P3 at locker rooms", confidence: 0.8 },
  { id: "scope-12", polygon: box, evidence: "again", confidence: 0.8 },
  { id: "scope-99", polygon: box, evidence: "Invented item" },
  { id: "scope-17", polygon: [{ x: 0.1, y: 0.1 }, { x: 1.4, y: 0.1 }, { x: 0.2, y: 0.2 }], evidence: "Studs" },
] }, lj);
assert.deepEqual([located.sheet, located.regions.map(r => [r.scopeId, r.confidence, r.evidence]), located.dropped.map(d => d.reason)],
  ["a-1.1", [["scope-12", 0.8, "a-1.1: Partition tags P3 at locker rooms"]], ["Only one area per item and sheet.", "Not one of the scope items sent.", "No usable area or printed words on the sheet."]], "Only the items sent, one area each, inside the sheet, with evidence");
// 26 Oct: the printed words place a mark (lib/text-anchor), so an item with text but no outline is kept, outline empty.
const byText = D.screenLocate({ found: [{ id: "scope-12", text: "P3", evidence: "Partition tag P3", confidence: 0.8 }] }, lj).regions[0];
assert.deepEqual([byText.text, byText.polygon], ["P3", []]);
assert.match(D.locateMessages(lj)[0].content, /Give text: the exact words, tag or keynote number printed on the sheet/);
assert.deepEqual(D.screenLocate({ found: [{ id: "scope-17", polygon: box, evidence: "x" }] }, lj).dropped.map(d => d.reason), ["No evidence on the sheet was given."]);
assert.equal(D.screenLocate({ sheet: "Z9.9", found: [] }, lj).sheet, "A1.1", "A different sheet number read from the image does not rename the page");
assert.deepEqual(D.screenLocate({ found: [{ id: "scope-12", polygon: box, evidence: "General notes", confidence: 0.25 }] }, lj).dropped.map(d => d.reason), ["Too unsure to mark; check the sheet yourself."], "A guess is not a highlight (Jelleff A1.1: a 0.25 mark sat on the mechanical yard)");
// Which sheets to read: a cited sheet first, otherwise the trade's likely sheets.
const row = (sheet, title) => ({ sheet, title, discipline: "", date: "", doc: { id: "d", name: "d.pdf" }, page: 1, revisions: 1 });
const sheetRegister = [row("CIV0102", "DEMOLITION PLAN"), row("A1.1", "LEVEL 01 - FIRST FLOOR PLAN"), row("A8.1", "PARTITION TYPES"), row("M101", "HVAC PLAN")];
const plan = D.locatePlan([{ id: "s1", title: "Remove asphalt", detail: "", source: "CIV0102 · Keynote 6" }, { id: "s2", title: "Gypsum board partitions", detail: "", source: "09 29 00 · §3.6" }, { id: "s3", title: "Studs", detail: "", source: "A8.1 · Partition types" }], sheetRegister, "09 29 00");
assert.deepEqual(plan.map(p => [p.row.sheet, p.items.map(i => i.id)]), [["CIV0102", ["s1"]], ["A1.1", ["s2"]], ["A8.1", ["s2", "s3"]]], "Cited sheets for cited items; the drywall sheets (partition types, floor plans) for the rest");
console.log("Drawing AI checked: DeepSeek or OpenAI for drawing images only, OpenAI's request (JSON, room for reasoning, effort, retries, refusals, cut-off answers), a missing key, and the Jelleff answer key, tiles (28 on A1.1, 16 on A1.2, all on the page) and score (29/4/13 on A1.1, 17/5/17 on A1.2).");

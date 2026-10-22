// Scores AI models at reading Jelleff's plan tags (door numbers, wall-type tags, room tags) against the
// hand trace (lib/drawing-score.ts). A1.1 and A1.2 are rendered from the real drawing PDF in the same tiles,
// at the same size and JPEG quality as the app (schematic-model tagTiles, renderStoredRegion: 1200 px), and
// every tile goes through the app's own plan-tags job and readJson, so each model sees what it would see
// in Structor. Geometry is not scored: walls, doors and rooms come from the drawings' lines, not the AI.
//
//   pnpm score-drawings --pdf "C:\path\JRC_GMP-Permit_Drawings_251209.pdf"
//     [--models deepseek:deepseek-flash,openai:gpt-6.1-sol]  [--sheets A1.1,A1.2]  [--out scores.json]
//
// Keys come from the environment or app/.env.local: DEEPSEEK_API_KEY, OPENAI_API_KEY (and optionally
// OPENAI_REASONING_EFFORT, as on the server). Every model reads every tile once, so a run costs money.
// The drawings are client material: they are read on this computer and sent only to the AI services compared.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire, register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");
const { readJson } = await import("../lib/drawing-reader.ts");
const { tagTiles } = await import("../lib/schematic-model.ts");
const { JELLEFF_PLAN_SHEETS, jelleffTruth, onPage, scoreSheet } = await import("../lib/drawing-score.ts");

// ── Arguments and keys ──
const args = Object.fromEntries(process.argv.slice(2).join(" ").split(/\s+--/).map(a => a.replace(/^--/, "")).filter(Boolean).map(a => { const [k, ...v] = a.split(/\s+/); return [k, v.join(" ").replace(/^"|"$/g, "")]; }));
const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
}
if (!args.pdf || !existsSync(args.pdf)) {
  console.error('Give the Jelleff drawing set: pnpm score-drawings --pdf "C:\\path\\JRC_GMP-Permit_Drawings_251209.pdf"');
  process.exit(1);
}
const models = (args.models || "deepseek:deepseek-flash,openai:gpt-6.1-sol").split(",").map(m => { const [provider, model] = m.trim().split(":"); return { provider, model }; });
for (const m of models) {
  if (!["deepseek", "openai"].includes(m.provider) || !m.model) { console.error(`"${m.provider}:${m.model}" isn't a model: use deepseek:<model> or openai:<model>.`); process.exit(1); }
  const key = m.provider === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY";
  if (!process.env[key]) { console.error(`${key} is missing: set it in the environment or app/.env.local.`); process.exit(1); }
}
const sheets = JELLEFF_PLAN_SHEETS.filter(s => !args.sheets || args.sheets.split(",").map(x => x.trim()).includes(s.sheet));

// ── The drawings, rendered as the app renders them ──
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
const { createCanvas } = createRequire(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"))("@napi-rs/canvas");
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(args.pdf)), verbosity: 0 }).promise;

async function renderRegion(page, [x, y, w, h], size = 1200) {
  const original = page.getViewport({ scale: 1 });
  const scale = size / Math.max(w * original.width, h * original.height);
  const viewport = page.getViewport({ scale, offsetX: -x * original.width * scale, offsetY: -y * original.height * scale });
  const canvas = createCanvas(Math.ceil(w * original.width * scale), Math.ceil(h * original.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return `data:image/jpeg;base64,${canvas.encodeSync("jpeg", 82).toString("base64")}`;
}

const job = EXTRA_JOBS["plan-tags"];
const prepared = [];
for (const s of sheets) {
  const truth = jelleffTruth(s.sheet);
  const page = await pdf.getPage(s.page);
  const vp = page.getViewport({ scale: 1 });
  const pageAspect = vp.width / vp.height, traceAspect = truth.widthFeet / truth.heightFeet;
  if (Math.abs(pageAspect / traceAspect - 1) > 0.01) console.warn(`! ${s.sheet} (PDF page ${s.page}) is ${pageAspect.toFixed(3)}:1 but the trace's sheet image is ${traceAspect.toFixed(3)}:1. Is this the Jelleff GMP set, with A1.1 on page 46?`);
  // The tiles cover the traced building, as the app's cover its outline.
  const points = [...truth.doors.map(d => d.at), ...truth.rooms.map(r => r.at), ...truth.walls.flatMap(w => [w.a, w.b])];
  const xs = points.map(p => p[0] * truth.widthFeet), ys = points.map(p => p[1] * truth.heightFeet);
  const [x0, y0, x1, y1] = [Math.min(...xs) - 15, Math.min(...ys) - 15, Math.max(...xs) + 15, Math.max(...ys) + 15];
  const tiles = tagTiles({ widthPt: vp.width, heightPt: vp.height }, { widthFeet: truth.widthFeet, heightFeet: truth.heightFeet }, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  process.stdout.write(`Rendering ${s.sheet}: ${tiles.length} tiles… `);
  const images = [];
  for (const box of tiles) images.push({ box, image: await renderRegion(page, box) });
  console.log("done");
  prepared.push({ ...s, truth, images });
}

// ── Each model reads every tile ──
const results = [];
for (const m of models) {
  for (const s of prepared) {
    const started = Date.now(), reads = [], failures = [];
    for (let i = 0; i < s.images.length; i += 3) {
      process.stdout.write(`\r${m.provider}:${m.model} reading ${s.sheet} tiles ${Math.min(i + 3, s.images.length)}/${s.images.length}   `);
      await Promise.all(s.images.slice(i, i + 3).map(async ({ box, image }) => {
        try {
          const input = job.parse({ sheet: s.sheet, image });
          const { output } = await readJson(job.messages(input), { deepseekKey: process.env.DEEPSEEK_API_KEY ?? "", model: job.model, maxTokens: job.maxTokens, budgetMs: 180_000, reader: { provider: m.provider, model: m.model } });
          reads.push(...onPage(box, job.screen(output, input).tags));
        } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
      }));
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`\r${m.provider}:${m.model} read ${s.sheet} in ${seconds}s${failures.length ? `, ${failures.length} tiles failed (${failures[0]})` : ""}          `);
    results.push({ model: `${m.provider}:${m.model}`, sheet: s.sheet, tiles: s.images.length, failed: failures.length, failures, seconds, score: scoreSheet(s.truth, reads), reads });
  }
}

// ── Scores ──
const pct = (a, b) => b ? `${a}/${b} (${Math.round(100 * a / b)}%)` : "—";
const row = r => ({
  Model: r.model, Sheet: r.sheet,
  "Door numbers": pct(r.score.doors.correct, r.score.doors.total),
  "Wall tags": pct(r.score.walls.correct, r.score.walls.total),
  "Room numbers": pct(r.score.rooms.correct, r.score.rooms.total),
  "Door reads on A8.2": pct(r.score.doors.inSchedule, r.score.doors.reads),
  "Wall reads on A8.1": pct(r.score.walls.inSchedule, r.score.walls.reads),
  "Failed tiles": `${r.failed}/${r.tiles}`, Seconds: r.seconds,
});
console.log("\nCorrect = right text near the right door, wall or room. \"On A8.2/A8.1\" = reads whose text exists on that schedule.");
console.table(results.map(row));
const totals = models.map(m => {
  const mine = results.filter(r => r.model === `${m.provider}:${m.model}`), sum = (k, f) => mine.reduce((n, r) => n + r.score[k][f], 0);
  return { Model: `${m.provider}:${m.model}`, "Door numbers": pct(sum("doors", "correct"), sum("doors", "total")), "Wall tags": pct(sum("walls", "correct"), sum("walls", "total")), "Room numbers": pct(sum("rooms", "correct"), sum("rooms", "total")), Seconds: mine.reduce((n, r) => n + r.seconds, 0) };
});
console.log("All sheets:");
console.table(totals);
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ pdf: args.pdf, at: new Date().toISOString(), results: results.map(({ reads, ...r }) => ({ ...r, misses: { doors: r.score.doors.misses, walls: r.score.walls.misses, rooms: r.score.rooms.misses }, reads })) }, null, 1));
  console.log(`Details, with every miss and read: ${args.out}`);
}

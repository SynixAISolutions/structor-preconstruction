// The drawings-to-3D scoreboard on a real drawing set (lib/model-scoreboard). A local tool, not part of `pnpm check`: it
// reads client drawings, so nothing it reads or writes belongs in the repository. It calls no AI, so it costs no credits:
// walls, doors and glass come from the app's own reader, and printed dimensions are read here by Tesseract (the OCR the app
// already uses; its English model is downloaded once).
//
//   pnpm score-model --pdf "C:\path\drawings.pdf" --out "C:\path\outside\the\repo" [--plans A1.1=46,A1.2=47] [--scale 1/8]
//
// Without --plans it scores Project 1's two floor plans. Doors and rooms are checked on Project 1 only, against its door
// schedule (A8.2) and the positions in lib/jelleff-doors and lib/jelleff-model; another project's report says it has no key.
// report.md is the scoreboard, results.json has every row, and <sheet>-overlay.png draws the model over the sheet.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

register("./ts-resolver.mjs", import.meta.url);
const { vectorsFromOperators } = await import("../lib/plan-vectors.ts");
const { feetPerInch, levelDoors, levelGlazing, levelWalls } = await import("../lib/schematic-model.ts");
const B = await import("../lib/model-scoreboard.ts");
const { jelleffTruth, JELLEFF_PLAN_SHEETS } = await import("../lib/drawing-score.ts");
const { doorScheduleRows } = await import("../lib/jelleff-doors.ts");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []));
if (!args.pdf || !existsSync(args.pdf) || !args.out) {
  console.error('Usage: pnpm score-model --pdf "C:\\path\\drawings.pdf" --out "C:\\folder\\outside\\the\\repo" [--plans A1.1=46,A1.2=47] [--scale 1/8]');
  process.exit(2);
}
const out = resolve(args.out);
if (!relative(resolve(fileURLToPath(new URL("../..", import.meta.url))), out).startsWith("..")) {
  console.error("--out must be outside the repository: the report and overlays show client drawings.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const plans = args.plans ? args.plans.split(",").map(p => { const [sheet, page] = p.split("="); return { sheet: sheet.trim(), page: +page }; }) : JELLEFF_PLAN_SHEETS.map(s => ({ sheet: s.sheet, page: s.page }));
const feetPer = feetPerInch(`${args.scale ?? "1/8"}" = 1'-0"`);
if (!feetPer) { console.error(`--scale ${args.scale} isn't a scale this reads.`); process.exit(2); }

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdfUrl = import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
const { createCanvas } = createRequire(realpathSync(fileURLToPath(pdfUrl)))("@napi-rs/canvas");
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(args.pdf)), verbosity: 0 }).promise;

const { createWorker, PSM } = await import("tesseract.js");
const worker = await createWorker("eng", 1, { cachePath: out });
await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "0123456789'\"-/ ", debug_file: "/dev/null" });

const RASTER = 4; // pixels per page point: dimension text is then about 28 px tall.

/**
 * The text above a dimension line's middle, turned to read left to right and enlarged: Revit centers the value there. The
 * strip is only as wide as the longest value, because witness lines and symbols beside the text throw OCR off.
 */
function stripImage(raster, span) {
  const reversed = span.b[0] < span.a[0] - 0.01 || (Math.abs(span.b[0] - span.a[0]) <= 0.01 && span.b[1] > span.a[1]);
  const [p, q] = reversed ? [span.b, span.a] : [span.a, span.b];
  const angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
  const widthPt = 46, heightPt = 11, enlarge = 2, px = RASTER * enlarge;
  const c = createCanvas(Math.ceil(widthPt * px), Math.ceil(heightPt * px)), g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  // The strip's bottom edge sits just above the line.
  g.translate(c.width / 2, c.height + 0.6 * px);
  g.rotate(-angle);
  g.scale(enlarge, enlarge);
  g.drawImage(raster, -((p[0] + q[0]) / 2) * RASTER, -((p[1] + q[1]) / 2) * RASTER);
  return c.encodeSync("png");
}

const levels = [];
for (const plan of plans) {
  console.log(`\n${plan.sheet} (PDF page ${plan.page})`);
  const page = await pdf.getPage(plan.page), vp = page.getViewport({ scale: 1 });
  const { segments, curves } = vectorsFromOperators(await page.getOperatorList(), pdfjs.OPS, vp.transform);
  const sheet = { widthPt: vp.width, heightPt: vp.height };
  const frame = { widthFeet: (vp.width / 72) * feetPer, heightFeet: (vp.height / 72) * feetPer };
  const pointsPerFoot = vp.width / frame.widthFeet;

  const spans = B.dimensionSpans(segments, pointsPerFoot);
  console.log(`  ${spans.length} dimensions found`);
  // The app gets the plan's area from the outline the AI reads. Here, with no AI: the extent of the walls found on the
  // whole sheet, left of the title block on the right.
  const onSheet = levelWalls(segments, sheet, frame, [], true).walls.filter(w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) >= 4 && Math.max(w.a[0], w.b[0]) < 0.82 * frame.widthFeet);
  const outline = onSheet.length ? (() => {
    const xs = onSheet.flatMap(w => [w.a[0], w.b[0]]).map(x => x / frame.widthFeet), ys = onSheet.flatMap(w => [w.a[1], w.b[1]]).map(y => y / frame.heightFeet);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  })() : [];

  const walls = levelWalls(segments, sheet, frame, outline, true);
  const doors = levelDoors(segments, curves, sheet, frame, outline, walls.walls);
  const glazing = levelGlazing(segments, sheet, frame, outline, walls.weight, walls.walls, doors);
  const wallFeet = Math.round(walls.walls.reduce((t, w) => t + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0));
  console.log(`  read ${walls.walls.length} walls (${wallFeet} ft), ${doors.filter(d => d.kind === "door").length} doors, ${glazing.length} glass runs`);

  // Printed dimensions, read with OCR from the strip above each line.
  const scale = RASTER;
  const raster = createCanvas(Math.ceil(vp.width * scale), Math.ceil(vp.height * scale)), context = raster.getContext("2d");
  context.fillStyle = "#fff"; context.fillRect(0, 0, raster.width, raster.height);
  await page.render({ canvas: raster, canvasContext: context, viewport: page.getViewport({ scale }) }).promise;
  const printed = [], strips = [];
  for (let i = 0; i < spans.length; i++) {
    const image = stripImage(raster, spans[i]);
    const { data } = await worker.recognize(image);
    printed.push(data.text.trim());
    strips.push(image);
    if ((i + 1) % 25 === 0) console.log(`  read ${i + 1} of ${spans.length} printed values`);
  }

  // Only the plan: the same extent as the walls, with what the app's margin takes in stripped back to a few feet.
  const planBox = outline.length ? (() => {
    const pad = 3 * pointsPerFoot, xs = outline.map(p => p[0] * vp.width), ys = outline.map(p => p[1] * vp.height);
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  })() : undefined;
  const inPlan = walls.weight === null ? [] : B.lineRuns(segments, walls.weight, planBox);
  const dimensions = B.scoreDimensions(spans, printed);
  // The strips OCR couldn't read or that disagree, to see whether the reading or the drawing is at fault.
  const stripsDir = resolve(out, `${plan.sheet}-strips`);
  mkdirSync(stripsDir, { recursive: true });
  spans.forEach((span, i) => {
    const value = B.parseDimension(printed[i]);
    if (value !== null && Math.abs(value - span.feet) * 12 <= 0.5) return;
    if (i < 200) writeFileSync(resolve(stripsDir, `${String(i).padStart(3, "0")}-${value === null ? "unread" : "disagree"}-${Math.round(span.feet * 12)}in.png`), strips[i]);
  });
  writeFileSync(resolve(out, `${plan.sheet}-printed.json`), JSON.stringify(spans.map((s, i) => ({ measuredInches: Math.round(s.feet * 12 * 100) / 100, printed: printed[i] })), null, 0));
  const faces = B.scoreDimensionedFaces(spans, inPlan, walls.walls, pointsPerFoot);
  const lines = B.scoreWallLines(inPlan, walls.walls, pointsPerFoot);

  // Doors and rooms need a key: Project 1 has its schedule and the positions of its doors and rooms.
  const isProject1 = JELLEFF_PLAN_SHEETS.some(s => s.sheet === plan.sheet && s.page === plan.page);
  let doorScore = null, roomScore = null;
  if (isProject1) {
    const truth = jelleffTruth(plan.sheet), feet = ([x, y]) => [x * frame.widthFeet, y * frame.heightFeet];
    const floor = plan.sheet === "A1.1" ? "1" : "2";
    // S101 (stair), G101 (gate) and the like are on the floor their digits say. P101 is the pool building, on another sheet.
    const rows = doorScheduleRows.filter(r => !r.number.startsWith("P") && (r.number.replace(/^\D+/, "").startsWith(floor) || truth.doors.some(d => d.number === r.number)));
    doorScore = B.scoreDoors(rows.map(r => {
      const traced = truth.doors.find(d => d.number === r.number);
      return { number: r.number, widthInches: r.widthIn === null ? null : r.widthIn * (r.panels ?? 1), at: traced ? feet(traced.at) : null };
    }), doors);
    roomScore = B.scoreRooms(truth.rooms.map(r => ({ number: r.number, name: r.name, at: feet(r.at) })), [...walls.walls, ...glazing, ...doors]);
  }
  levels.push({ sheet: plan.sheet, walls: { count: walls.walls.length, feet: wallFeet }, wallWeight: walls.weight, dimensions, faces, lines, doors: doorScore, rooms: roomScore });

  // The model over the sheet: walls blue, glass teal, doors green; red is what the checks say is missing.
  const OVERLAY = 1.5, shot = createCanvas(Math.ceil(vp.width * OVERLAY), Math.ceil(vp.height * OVERLAY)), g = shot.getContext("2d");
  g.drawImage(raster, 0, 0, shot.width, shot.height);
  g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(0, 0, shot.width, shot.height);
  const px = OVERLAY * pointsPerFoot, stroke = (a, b, color, width) => { g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.moveTo(a[0] * px, a[1] * px); g.lineTo(b[0] * px, b[1] * px); g.stroke(); };
  for (const w of walls.walls) stroke(w.a, w.b, "rgba(20,90,220,0.75)", Math.max(2, w.thickness * px));
  for (const w of glazing) stroke(w.a, w.b, "rgba(0,160,160,0.9)", 4);
  for (const d of doors) stroke(d.a, d.b, "rgba(20,160,60,0.95)", 5);
  for (const m of [...faces.misses, ...lines.largestMissed]) stroke(m.a, m.b, "rgba(230,30,30,0.95)", 5);
  if (doorScore) for (const r of doorScore.rows.filter(x => x.status === "missed")) { const at = feet2(jelleffTruth(plan.sheet).doors.find(d => d.number === r.number).at, frame); g.strokeStyle = "rgba(230,30,30,0.95)"; g.lineWidth = 4; g.beginPath(); g.arc(at[0] * px, at[1] * px, 3 * px, 0, 7); g.stroke(); }
  if (roomScore) for (const r of roomScore.rows.filter(x => x.status !== "closed")) { g.fillStyle = r.status === "open" ? "rgba(230,30,30,0.9)" : "rgba(240,140,0,0.9)"; g.beginPath(); g.arc(r.at[0] * px, r.at[1] * px, 1.4 * px, 0, 7); g.fill(); }
  writeFileSync(resolve(out, `${plan.sheet}-overlay.png`), shot.encodeSync("png"));
}
await worker.terminate();

function feet2([x, y], frame) { return [x * frame.widthFeet, y * frame.heightFeet]; }

const report = B.scoreboardReport(levels);
writeFileSync(resolve(out, "report.md"), report);
writeFileSync(resolve(out, "results.json"), JSON.stringify({ pdf: args.pdf, at: new Date().toISOString(), levels }, null, 1));
console.log(`\n${report.split("\n").slice(0, 16).join("\n")}\nFull report: ${resolve(out, "report.md")}`);

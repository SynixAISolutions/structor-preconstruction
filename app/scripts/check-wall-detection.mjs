import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const V = await import("../lib/plan-vectors.ts");
const W = await import("../lib/wall-detection.ts");
const S = await import("../lib/schematic-model.ts");

// ── Vector lines from a pdf.js operator list ─────────────────────────────────────────────────────────
const OPS = { save: 10, restore: 11, transform: 12, setLineWidth: 2, setStrokeRGBColor: 58, constructPath: 91, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27 };
const path = (paint, ...codes) => [OPS.constructPath, [paint, [Float32Array.from(codes)], null]];
const opList = (...ops) => ({ fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) });
const lines = V.segmentsFromOperators(opList(
  [OPS.save, null], [OPS.transform, [0.5, 0, 0, 0.5, 0, 0]], [OPS.setLineWidth, [4]], [OPS.setStrokeRGBColor, ["#ff0000"]],
  path(OPS.stroke, 0, 0, 0, 1, 100, 0, 1, 100, 50),       // moveTo, lineTo, lineTo
  path(OPS.fill, 0, 0, 0, 1, 10, 0),                        // fills are not lines
  [OPS.restore, null],
  path(OPS.closeStroke, 0, 10, 10, 1, 20, 10, 2, 0, 0, 0, 0, 30, 30, 4), // a curve moves without a line; close draws back
), OPS, [1, 0, 0, -1, 0, 200]);
assert.deepEqual(lines.map(l => [l.a, l.b, l.width, l.color]), [
  [[0, 200], [50, 200], 2, "#ff0000"], [[50, 200], [50, 175], 2, "#ff0000"],
  [[10, 190], [20, 190], 1, "#000000"], [[30, 170], [10, 190], 1, "#000000"],
], "Transforms (with the page's flip), line width scaled with them, save/restore, curves skipped, close drawn");
const withCurves = V.vectorsFromOperators(opList(path(OPS.stroke, 0, 0, 0, 2, 0, 5, 5, 10, 10, 10, 3, 20, 0, 30, 10)), OPS, [1, 0, 0, 1, 0, 0]);
const rp = p => p.map(n => Math.round(n * 100) / 100);
assert.equal(withCurves.segments.length, 0);
assert.deepEqual(withCurves.curves.map(c => [c.from, c.c1, c.c2, c.to].map(rp)), [
  [[0, 0], [0, 5], [5, 10], [10, 10]],
  [[10, 10], [16.67, 3.33], [23.33, 3.33], [30, 10]],
], "Door swings: cubic curves kept with their controls; a quadratic one raised to cubic");

// ── Walls ─────────────────────────────────────────────────────────────────────────────────────────────
const PPF = 9; // 1/8" = 1'-0"
const seg = (x1, y1, x2, y2, width = 1.2) => ({ a: [x1 * PPF, y1 * PPF], b: [x2 * PPF, y2 * PPF], width, color: "" });
const len = w => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const r = n => Math.round(n * 100) / 100;
const show = walls => walls.map(w => [r(w.a[0]), r(w.a[1]), r(w.b[0]), r(w.b[1]), r(w.thickness)]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);

// A face drawn in short pieces end to end is one line, so it pairs (a recess's back wall on Project 1, in 0.8-1 ft lengths).
assert.deepEqual(show(W.detectWalls([seg(0, 0, 6, 0), ...[0, 0.85, 1.7, 2.55, 3.4, 4.25, 5.1].map(x => seg(x, 0.8, x + 0.82, 0.8))], { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.4, 5.92, 0.4, 0.8]], "Pieces 0.03 ft apart make one face");
assert.equal(W.detectWalls([seg(0, 0, 6, 0), ...[0, 2, 4].map(x => seg(x, 0.8, x + 0.8, 0.8))], { pointsPerFoot: PPF, minWeight: 1.1 }).length, 0, "Pieces with real gaps don't");
// Two faces of a thin pair stay two faces even when they drift across their group's angle: a skewed wing's glass panes,
// a fraction of a degree off, 0.08 ft apart and in touching bays. Joining them into one line lost the whole storefront.
const skew = Math.tan(0.2 * Math.PI / 180), bay = (x, y0) => seg(x, y0 + x * skew, x + 3.9, y0 + (x + 3.9) * skew, 0.72);
const panes = [0, 4, 8, 12].flatMap(x => [bay(x, 10), bay(x, 10.08)]);
assert.deepEqual(W.detectWalls(panes, { pointsPerFoot: PPF, minWeight: 0.3, minThickness: 0.05, maxThickness: 0.15, minOverlap: 1, minLength: 2 }).map(w => [r(len(w)), r(w.thickness)]), [[15.9, 0.08]], "One run of glass, the bays joined");
// Glass passes a pier: only the stretch inside the wall comes out, and glass on both sides stays.
const pier = [{ a: [10, 10.04], b: [14, 10.04], thickness: 1, weights: [1.2] }];
const longPane = [seg(0, 10, 24, 10, 0.72), seg(0, 10.08, 24, 10.08, 0.72)];
assert.deepEqual(W.planGlazing(longPane, PPF, 1.2, pier).map(g => [r(g.a[0]), r(g.b[0])]).sort((p, q) => p[0] - q[0]), [[0, 10], [14.25, 24]], "Cut around the pier, not dropped because its middle is inside");
// A short pair touching nothing, in the middle of a room, isn't glass. Beside a wall or other glass it is; long, it is alone.
const shortPane = (x, y, L) => [seg(x, y, x + L, y, 0.72), seg(x, y + 0.08, x + L, y + 0.08, 0.72)];
const wallFar = [{ a: [0, 0], b: [40, 0], thickness: 0.5, weights: [1.2] }];
assert.equal(W.planGlazing(shortPane(10, 20, 3), PPF, 1.2, wallFar).length, 0, "Alone and short: not glass");
assert.equal(W.planGlazing(shortPane(10, 1, 3), PPF, 1.2, wallFar).length, 1, "Within reach of a wall");
assert.equal(W.planGlazing(shortPane(10, 20, 8), PPF, 1.2, wallFar).length, 1, "Long enough to stand alone");

// A short line beside a face doesn't take that stretch of the face from the wall it belongs to: the wall stays whole.
assert.deepEqual(show(W.detectWalls([seg(0, 0, 8, 0), seg(0, 1.1, 8, 1.1), seg(2, 0.5, 3.8, 0.5)], { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.55, 8, 0.55, 1.1]], "A 1.8 ft line inside a wall isn't a wall, and the wall isn't cut by it");
// A long line inside a wall still makes the narrower wall: two real walls either side of a line beat one across it.
assert.deepEqual(show(W.detectWalls([seg(0, 0, 8, 0), seg(0, 0.5, 8, 0.5)], { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.25, 8, 0.25, 0.5]]);

// A 14" exterior wall with its inner layers in a lighter weight: one wall, faces only.
assert.deepEqual(show(W.detectWalls([seg(0, 0, 40, 0), seg(0, 14 / 12, 40, 14 / 12), seg(0, 0.4, 40, 0.4, 0.48), seg(0, 0.6, 40, 0.6, 0.48)], { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.58, 40, 0.58, 1.17]]);
// A heavy dashed overhead line beside a wall (Jelleff: 1 ft dashes, 0.5 ft gaps, 1.8 pt) is not a face: no thin false
// wall between the dashes and the face, and the wall stays whole. A face broken into touching pieces is still a face.
const dashes = Array.from({ length: 12 }, (_, i) => seg(i * 1.5, 0.9, i * 1.5 + 1, 0.9, 1.8));
assert.deepEqual(show(W.detectWalls([seg(0, 0, 18, 0), seg(0, 0.6, 18, 0.6), ...dashes], { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.3, 18, 0.3, 0.6]]);
assert.deepEqual(show(W.detectWalls([seg(0, 0, 10, 0), ...Array.from({ length: 10 }, (_, i) => seg(i, 0.6, i + 1, 0.6))], { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.3, 10, 0.3, 0.6]]);
// Two 4" walls with a 15½" chase between them: two walls, not a third across the chase (seen on Jelleff A1.1).
const chase = [0, 4.3, 19.8, 23.9].map(inch => seg(0, inch / 12, 20, inch / 12));
assert.deepEqual(show(W.detectWalls(chase, { pointsPerFoot: PPF, minWeight: 1.1 })).map(w => w[4]), [0.36, 0.34]);
// A door opening (3 ft gap) splits a wall; a column break (0.4 ft) does not; a column square alone is no wall.
const door = [seg(0, 0, 10, 0), seg(0, 0.4, 10, 0.4), seg(13, 0, 30, 0), seg(13, 0.4, 30, 0.4), seg(30.4, 0, 40, 0), seg(30.4, 0.4, 40, 0.4), seg(50, 0, 51.2, 0), seg(50, 1.2, 51.2, 1.2)];
assert.deepEqual(show(W.detectWalls(door, { pointsPerFoot: PPF, minWeight: 1.1 })), [[0, 0.2, 10, 0.2, 0.4], [13, 0.2, 40, 0.2, 0.4]]);
// A single line, a line pair too far apart, light lines, and diagonal walls.
assert.deepEqual(W.detectWalls([seg(0, 0, 30, 0), seg(0, 5, 30, 5), seg(0, 10, 30, 10, 0.24), seg(0, 10.4, 30, 10.4, 0.24)], { pointsPerFoot: PPF, minWeight: 1.1 }), []);
const diag = W.detectWalls([seg(0, 0, 30, 30), seg(0.4, -0.4, 30.4, 29.6)], { pointsPerFoot: PPF, minWeight: 1.1 });
assert.deepEqual([diag.length, r(diag[0].thickness), r(len(diag[0]))], [1, 0.57, 42.43], "Angled walls are found the same way");

// The wall weight: the heaviest weight whose lines pair up; heavy single lines (callout boxes, borders) don't count.
const plan = [];
for (let i = 0; i < 12; i++) plan.push(seg(0, i * 10, 40, i * 10), seg(0, i * 10 + 0.4, 40, i * 10 + 0.4));            // 1.2 pt walls
for (let i = 0; i < 6; i++) plan.push(seg(0, i * 20 + 5, 60, i * 20 + 5, 1.8));                                          // 1.8 pt callout lines
for (let i = 0; i < 40; i++) plan.push(seg(0, i * 3 + 1, 50, i * 3 + 1, 0.48));                                          // 0.48 pt hatching, 3 ft apart
assert.deepEqual(W.wallWeight(plan, PPF), { weight: 1.2, paired: 1 });
assert.equal(W.wallWeight(plan.filter(s => s.width !== 1.2), PPF), null, "Nothing pairs: no wall weight");
assert.match(W.planWalls(plan.filter(s => s.width !== 1.2), PPF).note, /^No line weight on this sheet pairs up like walls/);
const found = W.planWalls(plan, PPF);
assert.deepEqual([found.weight, found.walls.length, found.note], [1.2, 12, "Walls are the 1.2 pt lines (100% of them pair at a wall's thickness)."]);
assert.equal(W.planWalls(plan, PPF, [0, 0, 45 * PPF, 35 * PPF]).walls.length, 4, "Only the plan's area counts");

// Glass: a pane is two lines ~1" apart drawn lighter than the walls; never inside a wall or along a door leaf.
const pane = (x0, x1, y, w = 0.72) => [seg(x0, y, x1, y, w), seg(x0, y + 1 / 12, x1, y + 1 / 12, w)];
const wallsHere = [{ a: [0, 50.2], b: [20, 50.2], thickness: 0.4, weights: [] }];
const glazed = W.planGlazing([
  ...pane(30, 36, 50), ...pane(36.2, 42, 50),   // two bays of one storefront, a mullion between
  ...pane(5, 15, 50.15, 0.48),                    // light layer lines inside the wall
  ...pane(60, 63, 40),                             // an open door leaf drawn as a thin rectangle
  ...pane(70, 71, 50),                             // too short to be glass
  seg(80, 50, 90, 50, 1.2), seg(80, 50.08, 90, 50.08, 1.2), // heavy: walls, not glass
], PPF, 1.2, wallsHere, undefined, [[[60, 40], [63, 40]]]);
assert.deepEqual(glazed.map(g => [r(g.a[0]), r(g.b[0]), r(g.thickness * 12)]), [[30, 42, 1]], "One storefront run across its mullion; wall layers, a door leaf, a stub and heavy lines are not glass");
assert.deepEqual(W.planGlazing(pane(0, 10, 0), PPF, null, []), [], "No wall weight (a scan): no glass");

// Corners and tees close: ends move to where the centerlines meet.
const joined = W.joinWalls([
  { a: [0, 0], b: [19.8, 0], thickness: 0.4, weights: [] },   // stops short of the corner
  { a: [20, 0.2], b: [20, 15], thickness: 0.4, weights: [] },
  { a: [10, 0.2], b: [10, 8], thickness: 0.3, weights: [] },  // a tee into the first wall
  { a: [30, 0], b: [40, 0], thickness: 0.4, weights: [] },    // parallel to the first: never joined to it
]);
assert.deepEqual(show(joined), [[0, 0, 20, 0, 0.4], [20, 0, 20, 15, 0.4], [10, 0, 10, 8, 0.3], [30, 0, 40, 0, 0.4]].sort((p, q) => p[1] - q[1] || p[0] - q[0]));

// ── In the level's frame: walls sit on the outline, from the printed scale or the building area ───────
const sheet = { widthPt: 3024, heightPt: 2160 };
const framed = S.levelWalls(plan, sheet, { widthFeet: 336, heightFeet: 240 }, [], true); // 42" x 30" at 1/8" = 336 x 240 ft
assert.deepEqual([framed.walls.length, framed.walls[0].a, framed.walls[0].b, framed.walls[0].thickness], [12, [0, 0.2], [40, 0.2], 0.4]);
const sized = S.levelWalls(plan, sheet, { widthFeet: 336, heightFeet: 240 }, [], false);
assert.match(sized.note, /No printed scale was read, so wall sizes follow the building area; check them\.$/);
const outlined = S.levelWalls(plan, sheet, { widthFeet: 336, heightFeet: 240 }, [[0, 0], [0.134, 0], [0.134, 0.104], [0, 0.104]], true); // 45 x 25 ft
assert.equal(outlined.walls.length, 5, "Only walls within the read outline plus a margin (24 ft here) count");

console.log("Wall detection checked: vector lines from pdf.js operators, faces paired narrowest first (chases stay two walls), dashed lines are not faces, openings, weights, angled walls, the automatic wall weight, plan area, joined corners and tees, the level's frame.");

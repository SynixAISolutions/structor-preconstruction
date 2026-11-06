import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const B = await import("../lib/model-scoreboard.ts");
const { hexagonTags, planWalls } = await import("../lib/wall-detection.ts");

const FT = 9; // 1/8" = 1'-0": page points per foot
const line = (x0, y0, x1, y1, width = 0.48) => ({ a: [x0, y0], b: [x1, y1], width, color: "#000" });
/** A tick as Revit draws one: two heavy strokes leaving a point in opposite directions. */
const tick = (x, y, dir = 1) => [line(x, y, x + 1.7, y - 1.7 * dir, 1.2), line(x, y, x - 1.7, y + 1.7 * dir, 1.2)];

// ── Reading a printed dimension ──
const dim = (text, feet) => { const got = B.parseDimension(text); assert(got !== null && Math.abs(got - feet) < 1e-6, `${JSON.stringify(text)} should be ${feet} ft, got ${got}`); };
dim(`23' - 0"`, 23); dim(`23'-0"`, 23); dim(`7' - 5 3/4"`, 7 + 5.75 / 12); dim(`10 1/2"`, 10.5 / 12); dim(`9"`, 0.75); dim(`3/4"`, 0.75 / 12);
dim(`72-7 1/2"`, 72 + 7.5 / 12); dim(`5'-91/2"`, 5 + 9.5 / 12); dim(`42'-43/4"`, 42 + 4.75 / 12); dim(`23 0"`, 23); dim(`1' - 11 1/2"`, 1 + 11.5 / 12); dim(`6'-21/4`, 6 + 2.25 / 12);
for (const noise of ["", "-", "112", "710", "3", `13' - 14"`, `"4`, "/ / 9/' -1 1/9\" -", "SA 2.10"]) assert.equal(B.parseDimension(noise), null, `${JSON.stringify(noise)} isn't a dimension`);

// ── Finding dimensions ──
// A chain of two spans: the line runs past the first and last tick, as Revit draws it, in two pieces split at the middle tick.
const chain = [line(97, 50, 180, 50), line(180, 50, 280, 50), ...tick(100, 50), ...tick(180, 50), ...tick(277, 50)];
const spans = B.dimensionSpans(chain, FT);
assert.deepEqual(spans.map(s => s.feet).sort((a, b) => a - b).map(v => v.toFixed(3)), [(80 / FT).toFixed(3), (97 / FT).toFixed(3)], "Two spans, tick to tick, ignoring the overshoot");
// A witness line runs well past the ticks it crosses, so it isn't a dimension. Nor is a line with one tick, or a plain cross.
const witness = [line(100, 0, 100, 200, 0.24), ...tick(100, 50), ...tick(100, 120)];
assert.equal(B.dimensionSpans(witness, FT).length, 0, "A witness line through two ticks isn't a span");
assert.equal(B.dimensionSpans([line(0, 0, 200, 0), ...tick(100, 0)], FT).length, 0, "One tick makes no span");
assert.equal(B.dimensionSpans([line(100, 50, 200, 50), line(100, 50, 103, 50, 1.2), line(100, 50, 97, 50, 1.2), line(200, 50, 203, 50, 1.2), line(200, 50, 197, 50, 1.2)], FT).length, 0, "Strokes along the line aren't ticks");
// Rotated with the building's wing.
const c = Math.cos(0.5), s = Math.sin(0.5), turn = (x, y) => [x * c - y * s, x * s + y * c];
const [ra, rb] = [turn(100, 50), turn(190, 50)];
const rotated = (p) => { const [ux, uy] = [c * Math.SQRT1_2 - s * Math.SQRT1_2, s * Math.SQRT1_2 + c * Math.SQRT1_2]; return [line(p[0], p[1], p[0] + 2.4 * ux, p[1] + 2.4 * uy, 1.2), line(p[0], p[1], p[0] - 2.4 * ux, p[1] - 2.4 * uy, 1.2)]; };
assert.equal(B.dimensionSpans([line(ra[0], ra[1], rb[0], rb[1]), ...rotated(ra), ...rotated(rb)], FT)[0].feet.toFixed(2), "10.00", "A dimension at an angle is measured along its line");

// ── Printed against measured ──
const scored = B.scoreDimensions([{ feet: 23, a: [0, 0], b: [207, 0] }, { feet: 2, a: [0, 0], b: [18, 0] }, { feet: 8, a: [0, 0], b: [72, 0] }, { feet: 8, a: [0, 0], b: [72, 0] }], [`23' - 0"`, `2' - 6"`, "unreadable", `8' - 0 1/4"`]);
assert.deepEqual([scored.spans, scored.read, scored.agree, scored.disagree.length], [4, 3, 2, 1], "An unreadable value isn't scored; a difference over half an inch is listed");
assert.equal(scored.disagree[0].printed, `2' - 6"`);

// ── Wall faces ──
// A 30 ft wall 6" thick from (10,20) ft to (40,20) ft, and a 20 ft wall 8" thick running down from it, drawn as pairs of 1.2 pt lines.
const pair = (x0, y0, x1, y1, t) => { const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L; return [line((x0 + nx * t / 2) * FT, (y0 + ny * t / 2) * FT, (x1 + nx * t / 2) * FT, (y1 + ny * t / 2) * FT, 1.2), line((x0 - nx * t / 2) * FT, (y0 - ny * t / 2) * FT, (x1 - nx * t / 2) * FT, (y1 - ny * t / 2) * FT, 1.2)]; };
const drawn = [...pair(10, 20, 40, 20, 0.5), ...pair(25, 20, 25, 40, 2 / 3)];
const stair = line(60 * FT, 20 * FT, 60 * FT, 40 * FT, 1.2); // a single line in the wall weight, not a wall
const runs = B.lineRuns([...drawn, stair, line(0, 0, 500, 0, 0.24)], 1.2);
assert.equal(runs.length, 5, "Lines of that weight only, each its own run");
const pieces = B.lineRuns([line(0, 0, 90, 0, 1.2), line(90.5, 0, 180, 0, 1.2), line(300, 0, 400, 0, 1.2)], 1.2);
assert.deepEqual(pieces.map(r => Math.round(r.b[0] - r.a[0])).sort((a, b) => a - b), [100, 180], "Pieces of one line join across a small gap and not a long one");

const walls = [{ a: [10, 20], b: [40, 20], thickness: 0.5 }, { a: [25, 20], b: [25, 40], thickness: 2 / 3 }];
// A horizontal dimension to the vertical wall's west face, and one to the stray line. Ticks at those x's; a grid tick at x=5 matches nothing.
const faceTicks = [{ a: [5 * FT, 5 * FT], b: [(25 - 1 / 3) * FT, 5 * FT], feet: 0 }, { a: [(25 - 1 / 3) * FT, 5 * FT], b: [60 * FT, 5 * FT], feet: 0 }];
let faces = B.scoreDimensionedFaces(faceTicks, runs, walls, FT);
assert.deepEqual([faces.total, faces.found, faces.misses.length], [2, 1, 1], "The wall's face is found; the stray line is reported");
assert(Math.abs(faces.misses[0].a[0] - 60) < 0.01 && faces.misses[0].feet === 20);
assert(faces.medianOffsetInches < 0.1, "On the face to within a hair");
faces = B.scoreDimensionedFaces(faceTicks, runs, walls.slice(0, 1), FT);
assert.deepEqual([faces.found, faces.misses.length], [0, 2], "A missing wall is a miss");
faces = B.scoreDimensionedFaces(faceTicks, runs, [walls[0], { ...walls[1], a: [25.5, 20], b: [25.5, 40] }], FT);
assert.equal(faces.found, 0, "A wall half a foot off its dimension isn't on it");
assert.deepEqual(B.scoreDimensionedFaces([{ a: [0, 0], b: [90, 0], feet: 10 }], [], walls, FT), { total: 0, found: 0, medianOffsetInches: null, misses: [] }, "Nothing pinned: nothing to score");

const onWalls = B.scoreWallLines(runs, walls, FT);
assert.equal(onWalls.feet, 120, "Both faces of both walls, and the stray 20 ft line");
assert.equal(onWalls.onWalls, 100);
assert.equal(onWalls.largestMissed[0].feet, 20);

// A line inside a wall's thickness is one of its layers: on that wall, not a wall missed.
const middle = B.lineRuns([line(0, 180, 180, 180, 1.2)], 1.2);
assert.equal(B.scoreWallLines(middle, [{ a: [0, 20], b: [20, 20], thickness: 1 }], FT).onWalls, 20, "On the centerline of a 12 in wall");
assert.equal(B.scoreWallLines(middle, [{ a: [0, 21], b: [20, 21], thickness: 1 }], FT).onWalls, 0, "Half a foot past that wall's face isn't");

// The real wall reader finds these walls from the same lines, so the check and the reader agree.
const read = planWalls(drawn, FT).walls;
assert.equal(B.scoreWallLines(B.lineRuns(drawn, 1.2), read, FT).onWalls, 100, "The app's own reader puts its walls on these faces");

// ── Room shapes ──
const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const shapes = B.scoreRoomShapes([{ room: "A", points: square(0, 0, 10) }, { room: "B", points: square(20, 0, 10) }, { room: "C", points: square(40, 0, 10) }, { room: "D", points: square(60, 0, 5) }, { room: "E", points: square(80, 0, 5) }, { room: "E", points: square(85, 0, 5) }], [
  square(-0.2, -0.2, 10.4),                    // A: the space fits it, a little over at the wall centerlines
  [[20, 0], [26, 0], [26, 10], [20, 10]], [[26, 0], [30, 0], [30, 10], [26, 10]], // B: a false line splits it
  square(38, -2, 30),                          // C: the room runs on into something, with D inside it
  [[80, 0], [90, 0], [90, 5], [80, 5]],        // E: two zones, one room
]);
const shape = room => shapes.rows.find(r => r.room === room);
assert.deepEqual([shapes.total, shapes.whole], [5, 4], "A, C, D and E are whole; B is split");
assert(shape("A").covered === 1 && shape("A").outside < 0.1, "A whole room with its wall thickness left over");
assert.deepEqual([Math.round(shape("B").covered * 100), shape("B").spaceArea, shape("B").splitInto], [60, 60, [40]], "Split: where the rest went");
assert(shape("C").outside > 0.8, "A room running on into something is seen");
assert.equal(shape("E").zoneArea, 50, "A room's zones add up");
assert.equal(B.scoreRoomShapes([{ room: "F", points: square(0, 0, 5) }], []).rows[0].spaceArea, null, "No read space holds it");

// ── Doors ──
const door = (x, y, width, leaves = 1, kind = "door") => ({ a: [x, y], b: [x + width, y], width, leaves, kind });
const doors = B.scoreDoors([
  { number: "101", widthInches: 36, at: [10.5, 20] }, // read, 3 ft
  { number: "102", widthInches: 72, at: [31, 20] }, // read, a pair, 6 ft
  { number: "103", widthInches: 36, at: [50, 50] }, // nothing near it
  { number: "104", widthInches: 36, at: [70.5, 20] }, // read at 4 ft: over 3 in off
  { number: "S105", widthInches: 36, at: null }, // no position to check
], [door(9, 20, 3), door(28, 20, 6, 2), door(69, 20, 4), door(90, 90, 3), door(11, 20, 2, 1, "compartment")]);
assert.deepEqual(doors.rows.map(r => r.status), ["found", "found", "missed", "found", "not on plan key"]);
assert.deepEqual([doors.scheduled, doors.checked, doors.found, doors.widthChecked, doors.widthRight], [5, 4, 3, 3, 2]);
assert.deepEqual(doors.extra.map(d => d.a), [[90, 90]], "A door the schedule doesn't have is listed; a toilet stall isn't a door");
const crowded = B.scoreDoors([{ number: "A", widthInches: 36, at: [10, 10] }, { number: "B", widthInches: 36, at: [11, 10] }], [door(9.5, 10, 3)]);
assert.equal(crowded.found, 1, "One read door answers for one scheduled door");

// ── Rooms ──
// Two rooms with a wall between, and a third with a gap in its wall.
const box = (x0, y0, x1, y1) => [{ a: [x0, y0], b: [x1, y0] }, { a: [x1, y0], b: [x1, y1] }, { a: [x1, y1], b: [x0, y1] }, { a: [x0, y1], b: [x0, y0] }];
const closed = [...box(0, 0, 20, 20), { a: [10, 0], b: [10, 20] }];
const tags = [{ number: "1", name: "A", at: [5, 10] }, { number: "2", name: "B", at: [15, 10] }];
let rooms = B.scoreRooms(tags, closed);
assert.deepEqual([rooms.total, rooms.closed, rooms.shared, rooms.open], [2, 2, 0, 0], "Each in its own closed space");
assert.equal(rooms.rows[0].area, 200);
rooms = B.scoreRooms(tags, box(0, 0, 20, 20));
assert.deepEqual([rooms.closed, rooms.shared, rooms.rows[0].sharedWith], [0, 2, ["2"]], "No wall between them: they share a space");
rooms = B.scoreRooms([{ number: "3", name: "C", at: [5, 5] }], [{ a: [0, 0], b: [40, 0] }, { a: [40, 0], b: [40, 40] }, { a: [0, 40], b: [40, 40] }]);
assert.deepEqual([rooms.closed, rooms.open], [0, 1], "A wall left out: the room is open");

// ── Walls that may not be real ──
const room = [{ a: [0, 0], b: [20, 0], thickness: 0.5 }, { a: [20, 0], b: [20, 15], thickness: 0.5 }, { a: [0, 15], b: [20, 15], thickness: 0.5 }, { a: [0, 0], b: [0, 15], thickness: 0.5 }];
const flagsOf = (extra, doorsHere = [], glassHere = []) => B.scoreWallFlags([...room, ...extra], doorsHere, glassHere).flagged.map(w => [w.a, w.flags]);
assert.deepEqual(flagsOf([]), [], "A plain room: nothing flagged");
assert.deepEqual(flagsOf([{ a: [8, 7], b: [12, 7], thickness: 0.5 }]), [[[8, 7], ["touches nothing"]]], "Alone in the middle of the room");
assert.deepEqual(flagsOf([{ a: [8, 7], b: [12, 7], thickness: 0.5 }], [{ a: [12.5, 7], b: [15, 7] }]), [], "Touching a door isn't alone");
assert.deepEqual(flagsOf([{ a: [8, 7], b: [12, 7], thickness: 0.5 }], [], [{ a: [12.5, 7], b: [15, 7] }]), [], "Touching glass isn't alone");
assert.deepEqual(flagsOf([{ a: [10, 0], b: [10, 15], thickness: 0.2 }]), [[[10, 0], ["too thin"]]]);
assert.deepEqual(flagsOf([{ a: [10, 0], b: [10, 15], thickness: 0.5 }]), [], "A partition across the room is a wall");
assert.deepEqual(flagsOf([], [{ a: [8, 0], b: [11, 0] }]).map(([, f]) => f), [["across a door"]], "A wall through a door's opening wasn't there to read");
assert.deepEqual(flagsOf([], [{ a: [8, 0.3], b: [8, 3] }]), [], "A door at right angles to the wall isn't in it");
const beside = B.scoreWallFlags([...room, { a: [5, 0.55], b: [15, 0.55], thickness: 0.5 }], [], []);
assert.deepEqual(beside.flagged.map(w => [w.a, w.flags]), [[[5, 0.55], ["doubled"]]], "Side by side and touching: the shorter is flagged");
assert.deepEqual(B.scoreWallFlags([...room, { a: [5, 2], b: [15, 2], thickness: 0.5 }, { a: [5, 0.5], b: [5, 2], thickness: 0.5 }], [], []).flagged, [], "With a real gap between them they're two walls");
assert.deepEqual([beside.walls, beside.feet, beside.flaggedFeet], [5, 80, 10]);

// ── Glass tags ──
const hexagon = (cx, cy, side, width = 0.24, turn = 0) => Array.from({ length: 6 }, (_, i) => {
  const at = k => [cx + side * Math.cos(turn + (k * Math.PI) / 3), cy + side * Math.sin(turn + (k * Math.PI) / 3)];
  return line(...at(i), ...at(i + 1), width);
});
const hexFound = hexagonTags([...hexagon(200, 200, 14.3), ...hexagon(400, 200, 14.3, 0.24, 0.5), ...hexagon(600, 200, 14.3), ...hexagon(600, 200, 14.3)], FT);
assert.deepEqual(hexFound.map(t => [Math.round(t.at[0]), Math.round(t.at[1])]).sort((p, q) => p[0] - q[0]), [[200, 200], [400, 200], [600, 200]], "Upright, turned, and drawn twice: each found once, at its center");
assert(Math.abs(hexFound[0].side - 14.3) < 0.1);
const squarish = [line(0, 0, 14, 0), line(14, 0, 14, 14), line(14, 14, 0, 14), line(0, 14, 0, 0)];
assert.deepEqual(hexagonTags(squarish, FT), [], "A square isn't a hexagon");
const open = hexagon(200, 200, 14.3).slice(0, 5);
assert.deepEqual(hexagonTags(open, FT), [], "Nor is five sides of one");
assert.deepEqual(hexagonTags(hexagon(200, 200, 2), FT), [], "Too small to be a tag");

const pane = { a: [0, 0], b: [20, 0] }, onWall = { a: [20, 0], b: [40, 0], thickness: 0.5 };
const glassScore = B.scoreGlass([[10, 5], [10, 50]], [pane], [onWall], []);
assert.deepEqual([glassScore.runs, glassScore.feet, glassScore.tags, glassScore.tagsNearGlass, glassScore.tagsMissed, glassScore.aloneRuns], [1, 20, 2, 1, [[10, 50]], []], "A tag far from any glass is reported; glass running into a wall is fine");

assert.deepEqual(B.scoreGlass([], [pane], [], []).aloneRuns.map(g => g.feet), [20], "Glass touching nothing is reported");

// ── The report ──
const level = { sheet: "A1.1", walls: { count: 2, feet: 50 }, wallWeight: 1.2, dimensions: scored, faces: B.scoreDimensionedFaces(faceTicks, runs, walls, FT), lines: onWalls, doors, rooms: B.scoreRooms(tags, closed), wallFlags: beside, glass: glassScore, partitions: [{ a: [0, 0], b: [23, 0] }, { a: [0, 9], b: [12, 9], kind: "railing" }], columns: [{ at: [5, 5], width: 0.7, depth: 0.7 }] };
const report = B.scoreboardReport([level, { ...level, sheet: "A1.2", doors: null, rooms: null }]);
assert(report.includes("| Operable partitions read (no key: check by eye) | 1 (23 ft) | 1 (23 ft) |") && report.includes("- 23 ft at (0, 0) to (23, 0) ft"), "Partitions are listed, to check by eye");
for (const expected of ["| Check | A1.1 | A1.2 |", "2 of 3 (67%)", "3 of 4 (75%)", "no schedule key", "no room key", "Scheduled doors not found: 103.", "Door widths off:", "104: scheduled 36 in, read 48 in", "Not scored yet"]) assert(report.includes(expected), `The report has: ${expected}`);
assert(B.scoreboardReport([{ ...level, dimensions: B.scoreDimensions([], []), faces: { total: 0, found: 0, medianOffsetInches: null, misses: [] }, lines: { feet: 0, onWalls: 0, largestMissed: [] } }]).includes("none to check"), "Nothing to check isn't a score of zero");

console.log("Model scoreboard checked: dimensions from their ticks, printed values against measured, faces and lines on walls, doors against the schedule, rooms closed, and the report.");

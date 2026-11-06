import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const D = await import("../lib/door-detection.ts");
const S = await import("../lib/schematic-model.ts");

const PPF = 9; // 1/8" = 1'-0"
const pt = ([x, y]) => [x * PPF, y * PPF];
const seg = (a, b, width = 0.24) => ({ a: pt(a), b: pt(b), width, color: "" });
/** A swing drawn the Revit way: a quarter circle as 16 short straight lines. */
const arc = (c, r, from, to, steps = 16) => Array.from({ length: steps }, (_, i) => {
  const t0 = (from + (to - from) * i / steps) * Math.PI / 180, t1 = (from + (to - from) * (i + 1) / steps) * Math.PI / 180;
  return seg([c[0] + r * Math.cos(t0), c[1] + r * Math.sin(t0)], [c[0] + r * Math.cos(t1), c[1] + r * Math.sin(t1)]);
});
/** The open leaf: a thin rectangle from the hinge out to the arc's open end. */
const leaf = (h, open) => { const d = [open[0] - h[0], open[1] - h[1]], L = Math.hypot(...d), n = [-d[1] / L * 0.15, d[0] / L * 0.15]; return [seg(h, open), seg([h[0] + n[0], h[1] + n[1]], [open[0] + n[0], open[1] + n[1]])]; };
const wall = (a, b, thickness = 0.4) => ({ a, b, thickness, weights: [] });
const r2 = p => p.map(v => (Math.round(v * 100) / 100) || 0);

// A 3 ft door in a gap of a wall along y = 0, hinged at (10, 0), swinging open into +y.
const walls = [wall([0, 0], [10, 0]), wall([13, 0], [20, 0])];
const single = [...arc([10, 0], 3, 0, 90), ...leaf([10, 0], [10, 3])];
const swings = D.swingArcs(single, [], PPF);
assert.equal(swings.length, 1);
assert.deepEqual([r2(swings[0].hinge), Math.round(swings[0].radius * 100) / 100, swings[0].open], [[10, 0], 3, 1], "Hinge, width, and the drawn leaf marks the open end");
const [door] = D.doorsFromSwings(swings, walls);
assert.deepEqual([r2(door.a), r2(door.b), Math.round(door.width * 100) / 100, door.leaves, r2(door.openTo[0]), door.kind, door.host !== null], [[10, 0], [13, 0], 3, 1, [10, 3], "door", true], "The opening runs hinge to closed end, along the wall");

// A pair: two swings meeting at a point in the middle are chained by their shared end; the cusp splits them.
const pair = [...arc([10, 0], 3, 0, 90), ...leaf([10, 0], [10, 3]), ...arc([16, 0], 3, 180, 90), ...leaf([16, 0], [16, 3])];
const pairDoors = D.doorsFromSwings(D.swingArcs(pair, [], PPF), [wall([0, 0], [10, 0]), wall([16, 0], [25, 0])]);
assert.deepEqual(pairDoors.map(d => [r2(d.a), r2(d.b), Math.round(d.width * 100) / 100, d.leaves]), [[[10, 0], [16, 0], 6, 2]], "One pair of doors, 6 ft (seen on Jelleff's gym doors)");

// The same door drawn with a true curve (a cubic quarter circle), as some sets export it.
const k = 0.5523;
const curve = { from: pt([13, 0]), c1: pt([13, 3 * k]), c2: pt([10 + 3 * k, 3]), to: pt([10, 3]), width: 0.24 };
const curved = D.doorsFromSwings(D.swingArcs(leaf([10, 0], [10, 3]), [curve], PPF), walls);
assert.deepEqual(curved.map(d => [r2(d.a), r2(d.b), d.leaves]), [[[10, 0], [13, 0], 1]]);

// A 2 ft toilet-stall door is a compartment door; a quarter circle in open floor with no leaf is a symbol.
const stall = D.doorsFromSwings(D.swingArcs([...arc([30, 0], 2, 0, 90), ...leaf([30, 0], [30, 2])], [], PPF), [wall([20, 0], [30, 0])]);
assert.deepEqual(stall.map(d => d.kind), ["compartment"]);
assert.deepEqual(D.doorsFromSwings(D.swingArcs(arc([60, 60], 3, 0, 90), [], PPF), walls), [], "No wall at the hinge and no leaf: a drawing symbol");
// Not swings: a half circle, an arc too small or too large, and a wavy line.
assert.deepEqual(D.swingArcs([...arc([0, 50], 3, 0, 180, 32), ...arc([20, 50], 0.8, 0, 90), ...arc([40, 50], 6, 0, 90)], [], PPF), []);
const wavy = Array.from({ length: 16 }, (_, i) => seg([i * 0.3, 70 + (i % 2) * 0.2], [(i + 1) * 0.3, 70 + ((i + 1) % 2) * 0.2]));
assert.deepEqual(D.swingArcs(wavy, [], PPF), []);
// A swing drawn twice (overlapping lines) is one door.
assert.equal(D.swingArcs([...single, ...arc([10, 0], 3, 0, 90)], [], PPF).length, 1);

// A door opening less or more than a right angle counts when its leaf is drawn: Project 1's skewed wing opens 45 degrees,
// and doors folding back to a wall 169. Without a leaf those arcs stay symbols, as does a small one even with a leaf.
const at = (c, r, deg) => [c[0] + r * Math.cos(deg * Math.PI / 180), c[1] + r * Math.sin(deg * Math.PI / 180)];
for (const sweep of [45, 169]) {
  const drawn = [...arc([10, 0], 3, 0, sweep, 24), ...leaf([10, 0], at([10, 0], 3, sweep))];
  const found = D.doorsFromSwings(D.swingArcs(drawn, [], PPF), walls);
  assert.deepEqual(found.map(d => [r2(d.a), r2(d.b), Math.round(d.width * 100) / 100, d.kind]), [[[10, 0], [13, 0], 3, "door"]], `A ${sweep} degree swing with its leaf`);
  assert.deepEqual(D.swingArcs(arc([10, 0], 3, 0, sweep, 24), [], PPF), [], `A ${sweep} degree arc with no leaf isn't a swing`);
}
assert.deepEqual(D.swingArcs([...arc([10, 0], 1.8, 0, 45, 24), ...leaf([10, 0], at([10, 0], 1.8, 45))], [], PPF), [], "Too small to be a door at that angle");
assert.equal(D.arcFits(arc([0, 50], 3, 0, 180, 32), [], PPF)[0].sweep > 170, true, "The arc itself is measured whatever its sweep");
// Two door-sized swings closing onto each other are a pair wherever they stand: a curtain wall has no wall to confirm them.
const curtain = D.doorsFromSwings(D.swingArcs([...arc([40, 40], 3, 0, 90), ...arc([46, 40], 3, 180, 90)], [], PPF), []);
assert.deepEqual(curtain.map(d => [r2(d.a), r2(d.b), Math.round(d.width * 100) / 100, d.leaves, d.host, d.kind]), [[[40, 40], [46, 40], 6, 2, null, "door"]], "A pair in a curtain wall");
assert.deepEqual(D.doorsFromSwings(D.swingArcs([...arc([40, 40], 3, 0, 90), ...arc([60, 40], 3, 180, 90)], [], PPF), []), [], "Two swings that don't meet are still symbols");

// An accessible stall's door is as wide as a real one. With a stall door beside it and no wall where it closes, it's a stall's door;
// a door closing onto a wall stays a door, and so does a gate with no stalls beside it.
const stallRoom = [wall([0, 0], [0, 40]), wall([0, 40], [40, 40])];
const small = (x, y) => arc([x, y], 2, 0, 90);
const asDoors = lines => D.doorsFromSwings(D.swingArcs(lines, [], PPF), stallRoom).map(d => [Math.round(d.a[0]), d.kind]).sort((p, q) => p[0] - q[0]);
const leafOf = (x, y, r0) => leaf([x, y], at([x, y], r0, 90));
assert.deepEqual(asDoors([...arc([20, 20], 3, 0, 90), ...leafOf(20, 20, 3), ...small(25, 20), ...leafOf(25, 20, 2)]), [[20, "compartment"], [25, "compartment"]], "3 ft, closing onto nothing, a stall door 5 ft away");
assert.deepEqual(asDoors([...arc([20, 20], 3, 0, 90), ...leafOf(20, 20, 3)]), [[20, "door"]], "With no stall beside it: a gate");
assert.deepEqual(asDoors([...arc([20, 20], 3, 0, 90), ...leafOf(20, 20, 3), ...small(32, 20), ...leafOf(32, 20, 2)]), [[20, "door"], [32, "compartment"]], "With the nearest stall 12 ft away: a gate");
const besideWall = D.doorsFromSwings(D.swingArcs([...arc([0.2, 10], 3, 90, 0), ...leaf([0.2, 10], [3.2, 10]), ...small(6, 10), ...leafOf(6, 10, 2)], [], PPF), stallRoom);
assert.deepEqual(besideWall.map(d => d.kind).sort(), ["compartment", "door"], "Closing onto a wall, even beside a stall: a real door");

// A very dense sheet doesn't overflow the call stack (Project 1's A5.2 has 170,000 lines, and failed on reading its doors).
const dense = Array.from({ length: 250000 }, (_, i) => seg([(i % 500) * 2, Math.floor(i / 500) * 2], [(i % 500) * 2 + 0.5, Math.floor(i / 500) * 2]));
assert.deepEqual(D.arcFits(dense, [], PPF), [], "A quarter of a million short lines, and no arcs among them");

// In a level's frame: doors sit on the walls read from the same sheet.
const sheet = { widthPt: 3024, heightPt: 2160 }, frame = { widthFeet: 336, heightFeet: 240 };
const planSegs = [...[[0, 10], [13, 20]].flatMap(([x0, x1]) => [seg([x0, 0], [x1, 0], 1.2), seg([x0, 0.4], [x1, 0.4], 1.2)]), ...single];
for (let i = 0; i < 12; i++) planSegs.push(seg([40, 10 + i * 10], [80, 10 + i * 10], 1.2), seg([40, 10.4 + i * 10], [80, 10.4 + i * 10], 1.2));
const levelWalls = S.levelWalls(planSegs, sheet, frame, [], true).walls;
const levelDoors = S.levelDoors(planSegs, [], sheet, frame, [], levelWalls);
assert.deepEqual(levelDoors.map(d => [d.a, d.b, d.width, d.leaves, d.kind, d.thickness]), [[[10, 0], [13, 0], 3, 1, "door", 0.4]]);

console.log("Door detection checked: swings drawn as short lines or true curves, the leaf marks the open side, openings along their walls, pairs split at their meeting point, toilet-stall doors, symbols, half circles and wavy lines refused, repeats, the level's frame.");

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

// In a level's frame: doors sit on the walls read from the same sheet.
const sheet = { widthPt: 3024, heightPt: 2160 }, frame = { widthFeet: 336, heightFeet: 240 };
const planSegs = [...[[0, 10], [13, 20]].flatMap(([x0, x1]) => [seg([x0, 0], [x1, 0], 1.2), seg([x0, 0.4], [x1, 0.4], 1.2)]), ...single];
for (let i = 0; i < 12; i++) planSegs.push(seg([40, 10 + i * 10], [80, 10 + i * 10], 1.2), seg([40, 10.4 + i * 10], [80, 10.4 + i * 10], 1.2));
const levelWalls = S.levelWalls(planSegs, sheet, frame, [], true).walls;
const levelDoors = S.levelDoors(planSegs, [], sheet, frame, [], levelWalls);
assert.deepEqual(levelDoors.map(d => [d.a, d.b, d.width, d.leaves, d.kind, d.thickness]), [[[10, 0], [13, 0], 3, 1, "door", 0.4]]);

console.log("Door detection checked: swings drawn as short lines or true curves, the leaf marks the open side, openings along their walls, pairs split at their meeting point, toilet-stall doors, symbols, half circles and wavy lines refused, repeats, the level's frame.");

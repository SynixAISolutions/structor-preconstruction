import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const T = await import("../lib/tag-placement.ts");
const S = await import("../lib/schematic-model.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// Tag text as the partition schedule writes it.
assert.deepEqual(["SA. 3. 10", "sa.6.20", "SF-4", "117B", " S202 "].map(T.normalTag), ["SA3.10", "SA6.20", "SF-4", "117B", "S202"]);

// The AI's reading is screened: kinds, positions in the tile, and never a dimension.
const screen = EXTRA_JOBS["plan-tags"].screen;
assert.deepEqual(screen({ tags: [
  { text: "SA. 3. 10", kind: "wall", at: [0.2, 0.3] }, { text: "117B", kind: "door", at: [0.5, 0.5] }, { text: "SF-4", kind: "glazing", at: [0.1, 0.9] },
  { text: "4'-8\"", kind: "wall", at: [0.3, 0.3] }, { text: "6 1/2\"", kind: "wall", at: [0.3, 0.3] }, { text: "101", kind: "room", at: [0.3, 0.3] }, { text: "X", kind: "door", at: [1.4, 0.3] },
] }).tags.map(t => t.text), ["SA. 3. 10", "117B", "SF-4"], "Dimensions, room tags and positions outside the tile are dropped (the AI called '4'-8\"' a wall tag on Jelleff)");

// Overlapping tiles read a tag twice: one tag, at the mean position.
assert.deepEqual(T.mergeTags([{ text: "SA. 3. 10", kind: "wall", at: [10, 10] }, { text: "SA3.10", kind: "wall", at: [11, 10] }, { text: "SA3.10", kind: "wall", at: [30, 10] }, { text: "SA3.10", kind: "door", at: [10, 10] }]),
  [{ text: "SA3.10", kind: "wall", at: [10.5, 10] }, { text: "SA3.10", kind: "wall", at: [30, 10] }, { text: "SA3.10", kind: "door", at: [10, 10] }]);

// Tag ovals from curves: two semicircle ends (quarter curves sharing a center), 3-11 pt in radius on paper.
const PPF = 9, k = 0.5523;
const quarter = ([cx, cy], r, a0) => { // a quarter circle from angle a0 to a0+90, in points
  const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)], t = a => [-Math.sin(a), Math.cos(a)], a1 = a0 + Math.PI / 2;
  const [x0, y0] = p(a0), [x1, y1] = p(a1), [tx0, ty0] = t(a0), [tx1, ty1] = t(a1);
  return { from: [x0, y0], c1: [x0 + k * r * tx0, y0 + k * r * ty0], c2: [x1 - k * r * tx1, y1 - k * r * ty1], to: [x1, y1], width: 0.24 };
};
const oval = (ca, cb, r) => [quarter(ca, r, Math.PI / 2), quarter(ca, r, Math.PI), quarter(cb, r, -Math.PI / 2), quarter(cb, r, 0)];
const pt = ([x, y]) => [x * PPF, y * PPF];
const curves = [...oval(pt([20, 5]), pt([22, 5]), 0.63 * PPF), quarter(pt([40, 40]), 1.25 * PPF, 0), quarter(pt([60, 60]), 0.63 * PPF, 0)];
const ovals = T.tagOvals(curves, PPF);
assert.equal(ovals.length, 1, "A callout box's rounded corner and a lone quarter are not ovals");
assert.deepEqual([...ovals[0].a, ...ovals[0].b, ovals[0].r].map(v => Math.round(v * 100) / 100), [20, 5, 22, 5, 0.63]);

// The leader: a line leaving the oval's edge outward, followed through joined pieces to its tip.
const o = ovals[0];
const lines = [[[22.63, 5], [24, 5]], [[24, 5], [24, 1.2]], [[20, 4.37], [22, 4.37]], [[21, 4.9], [21.3, 5.1]]];
assert.deepEqual(T.leaderTip(o, lines), [24, 1.2], "Two-piece leader; the oval's own side and the text inside are not leaders");
assert.equal(T.leaderTip(o, lines.slice(2)), null, "No leader");

// Placing wall tags: the wall at the leader's tip beats the nearest wall; an oval against a wall labels it;
// with no oval, the nearest wall within 5 ft. Types spread along the run across a door gap, never to a
// wall of another thickness or off the line.
const walls = [
  { a: [18, 6], b: [30, 6], thickness: 0.4 },   // 0: nearest to the oval, but not what the leader points at
  { a: [10, 1], b: [30, 1], thickness: 0.4 },   // 1: the leader ends here
  { a: [33, 1], b: [45, 1], thickness: 0.4 },   // 2: same run, past a 3 ft door gap
  { a: [46, 1], b: [50, 1], thickness: 0.6 },   // 3: in line but thicker: another partition
  { a: [0, 20], b: [0, 40], thickness: 0.4 },   // 4: tagged without an oval
];
const tags = [{ text: "SA. 3. 10", kind: "wall", at: [21.2, 5.4] }, { text: "SA2.10", kind: "wall", at: [2, 30] }, { text: "117B", kind: "door", at: [31.5, 2] }, { text: "118", kind: "door", at: [31, 3] }];
const doors = [{ a: [30, 1], b: [33, 1] }, { a: [70, 1], b: [73, 1] }];
const placed = T.placeTags(tags, walls, doors, { ovals, lines });
assert.deepEqual(placed.wallTypes, [null, "SA3.10", "SA3.10", null, "SA2.10"]);
assert.deepEqual(placed.doorNumbers, ["117B", null], "Closest tag first, one number per door; the far door gets none");
const against = T.placeTags([{ text: "SA6.20", kind: "wall", at: [21, 5] }], [{ a: [23.2, 0], b: [23.2, 10], thickness: 0.4 }, { a: [10, 15], b: [30, 15], thickness: 0.4 }], [], { ovals, lines: [] });
assert.deepEqual(against.wallTypes, ["SA6.20", null], "No leader: the wall the oval sits against");

// Totals by type, untagged last; the estimator types the untagged walls, tagged ones keep theirs.
const typed = walls.map((w, i) => ({ ...w, type: placed.wallTypes[i] }));
assert.deepEqual(T.wallTypeTotals(typed, 14), [
  { type: "SA2.10", walls: 1, feet: 20, squareFeet: 280 }, { type: "SA3.10", walls: 2, feet: 32, squareFeet: 448 }, { type: "Untagged", walls: 2, feet: 16, squareFeet: 224 },
]);
const model = { levels: [{ id: "L1", name: "Level 01", order: 1, elevation: 0, height: 14, outline: [], rooms: [], source: { documentId: "d", sheet: "A1.1", page: 1 }, sizing: "", walls: typed }], warnings: [], builtAt: "" };
const set = S.setUntaggedWallType(model, "L1", "sa 3.10");
assert.deepEqual(set.levels[0].walls.map(w => [w.type, !!w.typeSet]), [["SA3.10", true], ["SA3.10", false], ["SA3.10", false], ["SA3.10", true], ["SA2.10", false]]);
assert.deepEqual(S.setUntaggedWallType(set, "L1", " ").levels[0].walls.map(w => w.type), [null, "SA3.10", "SA3.10", null, "SA2.10"], "Clearing removes only what the estimator set");

// Tiles over the plan's area, and tags read on a tile placed back in the level's feet.
const sheet = { widthPt: 3024, heightPt: 2160 }, frame = { widthFeet: 336, heightFeet: 240 };
const tiles = S.tagTiles(sheet, frame, [[0.2, 0.3], [0.8, 0.3], [0.8, 0.8], [0.2, 0.8]]);
assert.ok(tiles.length >= 8 && tiles.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001 && w * 3024 < 560 && h * 2160 < 560), "Tiles of about 400 pt over the plan, inside the sheet");
const levelWalls = [{ a: [100, 100], b: [140, 100], thickness: 0.4 }];
const read = [{ tile: [0.25, 0.4, 0.1, 0.1], tags: [{ text: "SA. 2. 10", kind: "wall", at: [0.5, 0.5] }] }]; // tile center = (0.3, 0.45) of the sheet = (100.8, 108) ft
const tagged = S.levelTags(read, [], [], sheet, frame, levelWalls, []);
assert.deepEqual([tagged.walls[0].type, tagged.tags[0].at.map(v => Math.round(v * 10) / 10)], [null, [100.8, 108]], "8 ft away: too far to label the wall");
assert.equal(S.levelTags([{ ...read[0], tags: [{ ...read[0].tags[0], at: [0.5, 0.2] }] }], [], [], sheet, frame, levelWalls, []).walls[0].type, "SA2.10");

console.log("Tag placement checked: tag text normalized, AI tags screened (dimensions refused), duplicates merged, tag ovals from curves, leaders followed, leader tip over nearest wall, ovals against walls, runs across door gaps, door numbers one per door, totals by type, untagged walls typed and cleared, tiles and tile positions.");

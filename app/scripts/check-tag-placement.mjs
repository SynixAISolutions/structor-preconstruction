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
  { text: "4'-8\"", kind: "wall", at: [0.3, 0.3] }, { text: "6 1/2\"", kind: "wall", at: [0.3, 0.3] }, { text: "X", kind: "door", at: [1.4, 0.3] },
  { text: "103", kind: "room", name: "GYM (100' x 70')", at: [0.6, 0.2] }, { text: "", kind: "room", name: "CORRIDOR", at: [0.7, 0.2] }, { text: "", kind: "room", at: [0.7, 0.2] },
] }).tags.map(t => `${t.text}${t.name ? ` ${t.name}` : ""}`), ["SA. 3. 10", "117B", "SF-4", "103 GYM (100' x 70')", " CORRIDOR"], "Dimensions and positions outside the tile are dropped (the AI called '4'-8\"' a wall tag on Jelleff); a room tag keeps its name, dimensions and all, and needs a number or a name");

// Overlapping tiles read a tag twice: one tag, at the mean position.
assert.deepEqual(T.mergeTags([{ text: "SA. 3. 10", kind: "wall", at: [10, 10] }, { text: "SA3.10", kind: "wall", at: [11, 10] }, { text: "SA3.10", kind: "wall", at: [30, 10] }, { text: "SA3.10", kind: "door", at: [10, 10] }]),
  [{ text: "SA3.10", kind: "wall", at: [10.5, 10] }, { text: "SA3.10", kind: "wall", at: [30, 10] }, { text: "SA3.10", kind: "door", at: [10, 10] }]);
// Room tags (Jelleff L1 tiles): one per number within 5 ft, keeping the longest name; a read with no name, or a callout ("A10.6" / "17"), is not a room.
assert.deepEqual(T.mergeTags([
  { text: "104", kind: "room", name: "OFF.(DPR)", at: [176.4, 150.4] }, { text: "104", kind: "room", name: "OFF. (DPR)", at: [172.1, 151] },
  { text: "106", kind: "room", name: "", at: [209.5, 170.7] }, { text: "106", kind: "room", name: "FITNESS CENTER", at: [208.5, 169.3] },
  { text: "A10.6", kind: "room", name: "17", at: [150, 100] }, { text: "", kind: "room", name: "CORRIDOR", at: [160, 120] },
]).map(t => `${t.text}|${t.name}|${t.at.map(Math.round)}`), ["104|OFF. (DPR)|174,151", "106|FITNESS CENTER|209,169", "|CORRIDOR|160,120"]);

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

// The estimator's corrections on the plan: a wall's type, not a wall (and back), a door's number.
let fixed = S.editWall(set, "L1", 3, { type: "sa 6.20" });
fixed = S.editWall(fixed, "L1", 0, { excluded: true });
assert.deepEqual(fixed.levels[0].walls.map(w => [w.type, !!w.edited, !!w.excluded]).slice(0, 4), [["SA3.10", false, true], ["SA3.10", false, false], ["SA3.10", false, false], ["SA6.20", true, false]]);
assert.deepEqual(S.keptWalls(fixed.levels[0]).length, 4, "A wall marked not a wall leaves the totals and the 3D");
assert.equal(S.setUntaggedWallType(fixed, "L1", " ").levels[0].walls[3].type, "SA6.20", "Clearing the untagged type never undoes a wall the estimator set");
assert.equal(S.editWall(fixed, "L1", 0, { excluded: false }).levels[0].walls[0].excluded, false, "Restore");
const doorModel = { ...model, levels: [{ ...model.levels[0], doors: [{ a: [0, 0], b: [3, 0], width: 3, leaves: 1, hinges: [[0, 0]], openTo: [[0, 3]], kind: "door", thickness: 0.4, number: "117A" }] }] };
assert.equal(S.editDoorNumber(doorModel, "L1", 0, " 117b ").levels[0].doors[0].number, "117B");
assert.equal(S.editDoorNumber(doorModel, "L1", 0, "").levels[0].doors[0].number, null);
assert.throws(() => S.editWall(model, "L1", 99, { type: "X" }), /no longer in the model/);
assert.throws(() => S.editDoorNumber(model, "L9", 0, "1"), /level is no longer/);

// Storefront and window tags type the nearest run of glass; totals by type; the estimator corrects glass.
const glassRuns = [{ a: [0, 60], b: [20, 60] }, { a: [40, 60], b: [60, 60] }, { a: [100, 60], b: [110, 60] }];
const glassPlaced = T.placeTags([{ text: "sf-10", kind: "glazing", at: [10, 62] }, { text: "SF-4", kind: "glazing", at: [50, 57] }], [], [], undefined, glassRuns);
assert.deepEqual(glassPlaced.glazingTypes, ["SF-10", "SF-4", null]);
assert.deepEqual(T.glazingTotals(glassRuns.map((g, i) => ({ ...g, type: glassPlaced.glazingTypes[i] }))), [{ type: "SF-10", runs: 1, feet: 20 }, { type: "SF-4", runs: 1, feet: 20 }, { type: "Untagged", runs: 1, feet: 10 }]);
const glassModel = { ...model, levels: [{ ...model.levels[0], glazing: glassRuns }] };
assert.deepEqual(S.editGlazing(S.editGlazing(glassModel, "L1", 2, { excluded: true }), "L1", 0, { type: " sf 9 " }).levels[0].glazing.map(g => [g.type ?? null, !!g.excluded]), [["SF9", false], [null, false], [null, true]]);
assert.throws(() => S.editGlazing(glassModel, "L1", 7, { excluded: true }), /glass is no longer/);

// Tiles over the plan's area, and tags read on a tile placed back in the level's feet.
const sheet = { widthPt: 3024, heightPt: 2160 }, frame = { widthFeet: 336, heightFeet: 240 };
const tiles = S.tagTiles(sheet, frame, [[0.2, 0.3], [0.8, 0.3], [0.8, 0.8], [0.2, 0.8]]);
assert.ok(tiles.length >= 8 && tiles.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001 && w * 3024 < 560 && h * 2160 < 560), "Tiles of about 400 pt over the plan, inside the sheet");
const levelWalls = [{ a: [100, 100], b: [140, 100], thickness: 0.4 }];
const read = [{ tile: [0.25, 0.4, 0.1, 0.1], tags: [{ text: "SA. 2. 10", kind: "wall", at: [0.5, 0.5] }] }]; // tile center = (0.3, 0.45) of the sheet = (100.8, 108) ft
const tagged = S.levelTags(read, [], [], sheet, frame, levelWalls, []);
assert.deepEqual([tagged.walls[0].type, tagged.tags[0].at.map(v => Math.round(v * 10) / 10)], [null, [100.8, 108]], "8 ft away: too far to label the wall");
assert.equal(S.levelTags([{ ...read[0], tags: [{ ...read[0].tags[0], at: [0.5, 0.2] }] }], [], [], sheet, frame, levelWalls, []).walls[0].type, "SA2.10");

// The partition type schedule: codes match across the schedule's columns and the plan's dots.
assert.deepEqual(["SA 3 10", "SA. 3. 10", "SA3.10", "sf-4"].map(T.tagKey), ["SA310", "SA310", "SA310", "SF4"]);
const typesRead = EXTRA_JOBS["partition-types"].screen({ types: [
  { tag: "SA 3 10", thickness: "4 1/4\"", rating: "NR", description: "Non-rated stud partition" }, { tag: "SA 3 10", thickness: "", rating: "", description: "" },
  { tag: "M1 8 00", thickness: "7 5/8\"", rating: "1", description: "1-hour rated masonry partition" }, { tag: "GYPSUM WALL BOARD", description: "a label" }, { tag: "", description: "x" },
] }).types;
assert.equal(typesRead.length, 3, "A row needs a code with a digit; labels and blanks are dropped");
const schedule = T.mergePartitionTypes(typesRead);
assert.deepEqual(schedule.map(r => [r.tag, r.thickness, r.rating]), [["M1800", "7 5/8\"", "1"], ["SA310", "4 1/4\"", "NR"]], "One row per code, the fullest reading; the schedule prints codes in columns");
assert.equal(T.scheduleRow("SA. 3. 10", schedule)?.thickness, "4 1/4\"");
assert.equal(T.scheduleRow("SA3.1", schedule), null, "A misread tag is not in the schedule");
assert.deepEqual(["PARTITION TYPES", "Partition Schedule", "WALL TYPES", "LEVEL 01 - FIRST FLOOR PLAN"].map(title => !!S.partitionTypeSheet([{ title, discipline: "Architectural" }])), [true, true, true, false]);
const page = { widthPt: 1200, heightPt: 900 }, many = n => Array.from({ length: n }, (_, i) => ({ a: [120 + i, 60], b: [120 + i, 100], width: 0.24, color: "" }));
assert.deepEqual(S.contentTiles([...many(60), { a: [1100, 800], b: [1110, 800], width: 1, color: "" }], page).length, 1, "Only parts of the sheet with drawing are read");

console.log("Tag placement checked: tag text normalized, AI tags screened (dimensions refused), duplicates merged, tag ovals from curves, leaders followed, leader tip over nearest wall, ovals against walls, runs across door gaps, door numbers one per door, totals by type, untagged walls typed and cleared, tiles and tile positions.");

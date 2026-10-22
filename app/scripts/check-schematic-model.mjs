import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const M = await import("../lib/schematic-model.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// Levels from plan titles; one architectural floor plan per level.
assert.equal(M.levelOfTitle("LEVEL 01 - FIRST FLOOR PLAN"), 1);
assert.equal(M.levelOfTitle("SECOND FLOOR PLAN"), 2);
assert.equal(M.levelOfTitle("3RD FLOOR PLAN"), 3);
assert.equal(M.levelOfTitle("BASEMENT FLOOR PLAN"), 0);
assert.equal(M.levelOfTitle("ROOF PLAN"), null);
const reg = [
  ["A1.1", "LEVEL 01 - FIRST FLOOR PLAN", "Architectural"], ["A1.2", "LEVEL 02 - SECOND FLOOR PLAN", "Architectural"], ["A1.3", "ROOF PLAN", "Architectural"],
  ["A2.1", "ENLARGED FLOOR PLANS - RESTROOMS", "Architectural"], ["A3.1", "LEVEL 01 - REFLECTED CEILING PLAN", "Architectural"], ["A12.2", "LEVEL 01 - FINISH PLAN", "Architectural"],
  ["M101", "LEVEL 01 - HVAC PLAN", "Mechanical"], ["A1.1B", "LEVEL 01 - FIRST FLOOR PLAN - PART B", "Architectural"],
  ["A4.1", "EXTERIOR ELEVATIONS", "Architectural"], ["A5.1", "BUILDING SECTIONS", "Architectural"],
].map(([sheet, title, discipline]) => ({ sheet, title, discipline }));
assert.deepEqual(M.levelPlanSheets(reg).map(p => [p.level, p.row.sheet]), [[1, "A1.1"], [2, "A1.2"]], "Enlarged, RCP, finish, MEP and roof plans are not floor plans; the first plan per level wins");
assert.equal(M.heightSheet(reg).sheet, "A5.1", "Building sections before exterior elevations");
assert.equal(M.heightSheet(reg.filter(r => r.sheet !== "A5.1")).sheet, "A4.1");
assert.equal(M.heightSheet([]), null);

// Scale and sizing.
assert.equal(M.feetPerInch(`SCALE: 1/8" = 1'-0"`), 8);
assert.equal(M.feetPerInch(`3/16" = 1'-0"`), 5.333);
assert.equal(M.feetPerInch(`1" = 1'-0"`), 1);
assert.equal(M.feetPerInch("NO SCALE"), null);
// Engineering and metric scales, as public drawing sets print them (Air Force dormitory: 1" = 40'-0"; Army Corps: 1 : 25, 1 : 50).
assert.equal(M.feetPerInch(`SCALE : 1" = 40'-0"`), 40);
assert.equal(M.feetPerInch(`1" = 20'`), 20);
assert.equal(M.feetPerInch(`1/2" = 1'-0"`), 2);
assert.equal(M.feetPerInch(`SCALE:1/8"=1'`), 8, "No -0 after the feet, as the Army Corps flight training center sheets print it");
assert.equal(M.feetPerInch(`1/8 IN = 1'-0"`), 8, "Inches spelled IN");
assert.equal(M.feetPerInch(`1/8″ = 1′-0″`), 8, "Prime marks");
assert.equal(M.feetPerInch(`3" = 1'-0"`), 0.333, "The largest detail scale read");
assert.equal(M.feetPerInch(`6" = 1'-0"`), null, "Larger details are not plan scales");
assert.equal(M.feetPerInch("SCALE: 1 : 25"), 2.083);
assert.equal(M.feetPerInch("SCALE: 1:50"), 4.167);
assert.equal(M.feetPerInch("1:100"), 8.333);
assert.equal(M.feetPerInch("1 : 500"), 41.667);
assert.equal(M.feetPerInch("ISSUED 10/22/2026 AT 1:30 PM"), null, "A time of day is not a scale");
assert.equal(M.feetPerInch("1:2"), null, "Nor a large detail");
assert.equal(M.feetPerInch("11:50"), null, "Nor a number that only ends in 1");
const square = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
const scaled = M.toFeet({ outline: square, rooms: [{ name: "GYM", number: "103", at: [0.5, 0.5] }], page: { widthIn: 36, heightIn: 24 }, feetPerInch: 8, targetSf: 0 });
assert.deepEqual(scaled.outline[1], [216, 48], "0.75 of a 36 in. sheet at 8 ft per inch is 216 ft; 0.25 of 24 in. is 48 ft");
assert.deepEqual(scaled.rooms[0].at, [144, 96]);
assert.match(scaled.sizing, /Printed scale/);
const byArea = M.toFeet({ outline: square, rooms: [], page: { widthIn: 36, heightIn: 24 }, feetPerInch: null, targetSf: 10000 });
assert.ok(Math.abs(M.polygonArea(byArea.outline) - 10000) < 50, "Without a scale the floor is sized to its share of the building area");
assert.match(byArea.sizing, /building area/);
assert.match(M.toFeet({ outline: square, rooms: [], page: { widthIn: 36, heightIn: 24 }, feetPerInch: null, targetSf: 0 }).sizing, /Proportional only/);

// Heights: the Jelleff reading (no Level 01 marker; Level 03 is the roof deck; top of roof above).
const jelleff = M.levelHeights([1, 2], [{ name: "LEVEL 02", elevation: 126 }, { name: "LEVEL 03", elevation: 142 }, { name: "T.O. ROOF", elevation: 158 }]);
assert.deepEqual([...jelleff.elevations], [[1, 0], [2, 14]]);
assert.deepEqual([...jelleff.heights], [[1, 14], [2, 16]], "Each floor runs to the next marker above it");
assert.match(jelleff.warnings[0], /Level 01's elevation was not read/);
const full = M.levelHeights([1, 2, 3], [{ name: "LEVEL 1", elevation: 100 }, { name: "LEVEL 2", elevation: 115.5 }, { name: "LEVEL 3", elevation: 129 }, { name: "ROOF", elevation: 143 }]);
assert.deepEqual([...full.elevations.values()], [0, 15.5, 29]);
assert.deepEqual([...full.heights.values()], [15.5, 13.5, 14]);
assert.equal(full.warnings.length, 0);
const none = M.levelHeights([1, 2], []);
assert.deepEqual([...none.heights.values()], [14, 14]);
assert.match(none.warnings[0], /2 floor-to-floor heights were not read/);

// Corrections.
const model = { levels: [{ id: "L1", name: "Level 01", order: 1, elevation: 0, height: 14, outline: [[0, 0], [10, 0], [10, 10]], rooms: [], source: { documentId: "d", sheet: "A1.1", page: 46 }, sizing: "" }, { id: "L2", name: "Level 02", order: 2, elevation: 14, height: 16, outline: [[0, 0], [10, 0], [10, 10]], rooms: [], source: { documentId: "d", sheet: "A1.2", page: 47 }, sizing: "" }], warnings: [], builtAt: "" };
assert.deepEqual(M.moveOutlinePoint(model, "L1", 1, [12, 0]).levels[0].outline[1], [12, 0]);
assert.equal(M.moveOutlinePoint(model, "L1", 9, [12, 0]).levels[0], model.levels[0], "An unknown point changes nothing");
assert.equal(M.setLevelHeight(model, "L1", 18).levels[1].elevation, 18, "Levels above move up");
assert.throws(() => M.setLevelHeight(model, "L1", 2), /between 6 and 60/);

// AI readings are screened.
const P = EXTRA_JOBS["plan-outline"], H = EXTRA_JOBS["level-heights"];
assert.throws(() => P.parse({ image: "https://example.com/plan.png" }), /JPEG/);
const plan = P.screen({ outline: [[0.1, 0.1], { x: 0.9, y: 0.1 }, [0.9, 0.8], [0.1, 0.8], [2, 2]], rooms: [{ name: "GYM", number: "103", at: [0.3, 0.4] }, { name: "", number: "", at: [0.1, 0.1] }, { name: "LOBBY", at: [5, 5] }], scale: `1/8" = 1'-0"` });
assert.equal(plan.outline.length, 4, "Points outside 0–1 dropped; {x,y} accepted");
assert.deepEqual(plan.rooms.map(r => r.name), ["GYM"]);
assert.equal(plan.scale, `1/8" = 1'-0"`);
assert.throws(() => P.screen({ outline: [[0.1, 0.1], [0.11, 0.1], [0.11, 0.11], [0.1, 0.11]] }), /No building outline/);
assert.deepEqual(H.screen({ levels: [{ name: "LEVEL 01", elevation: "100'-0\"" }, { name: "LEVEL 02", elevation: "114'-6\"" }, { name: "ROOF", elevation: 132.25 }, { name: "BAD", elevation: "tall" }, { name: "", elevation: 3 }] }).levels,
  [{ name: "LEVEL 01", elevation: 100 }, { name: "LEVEL 02", elevation: 114.5 }, { name: "ROOF", elevation: 132.25 }], "Feet-and-inches parsed; unreadable markers dropped");

// The source frame in feet is kept, so corrections drawn on the sheet use the build's calibration.
assert.deepEqual(scaled.frame, { widthFeet: 288, heightFeet: 192 });
assert.deepEqual(M.fromFraction(byArea.frame, square[1]), byArea.outline[1], "Area sizing: the frame maps fractions to the same feet as the outline");
assert.deepEqual(M.toFraction(scaled.frame, [216, 48]), [0.75, 0.25]);

// Read outlines: a closing repeat is dropped; points read out of order are re-ordered, and that is said.
const bowtie = [[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]];
assert.equal(M.selfCrossing(bowtie), true);
assert.equal(M.selfCrossing(square), false);
assert.deepEqual(M.cleanOutline([...square, square[0]]), { outline: square, note: "" });
const fixed = M.cleanOutline(bowtie);
assert.equal(M.selfCrossing(fixed.outline), false);
assert.match(fixed.note, /re-ordered/);
assert.equal(M.cleanOutline([[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.1]]).outline, null, "Fewer than 4 corners");
const repaired = P.screen({ outline: [...bowtie, bowtie[0]], rooms: [], scale: "" });
assert.equal(repaired.outline.length, 4);
assert.match(repaired.note, /re-ordered/);
assert.equal(P.screen({ outline: square, rooms: [], scale: "" }).note, "");
assert.deepEqual(P.screen({ outline: square, rooms: [], scale: "", scaleAt: [0.13, 0.94] }).scaleAt, [0.13, 0.94], "Where the scale was seen, for the close-up read");
assert.equal("scaleAt" in P.screen({ outline: square, rooms: [], scale: "", scaleAt: null }), false);
const SC = EXTRA_JOBS["drawing-scale"];
assert.throws(() => SC.parse({ image: "x" }), /JPEG/);
assert.deepEqual(SC.screen({ scale: `SCALE: 1/8" = 1'-0"`, title: "SECOND FLOOR PLAN", extra: 1 }), { scale: `SCALE: 1/8" = 1'-0"`, title: "SECOND FLOOR PLAN" });
assert.equal(M.feetPerInch(SC.screen({ scale: `SCALE: 1/8" = 1'-0"` }).scale), 8);
assert.deepEqual(SC.screen({}), { scale: "", title: "" });

// Level markers from the tiles of a section (the Jelleff A5.1 readings, 19 Oct): numbered roof levels
// stay their own level, the value most tiles agree on wins, and a tie is disputed until a close-up decides.
const at = [0.5, 0.5];
const tilesRead = [
  [],
  [{ name: "LEVEL 04 - HIGH ROOF", elevation: 33 }, { name: "LEVEL 03 - LOW ROOF", elevation: 26, at }, { name: "LEVEL 02 - SECOND FLOOR", elevation: 14 }],
  [{ name: "LEVEL 03 - LOW ROOF", elevation: 28, at }, { name: "LEVEL 02 - SECOND FLOOR", elevation: 14 }, { name: "LEVEL 01 - FIRST FLOOR", elevation: 0 }],
  [],
  [{ name: "LEVEL 04 - HIGH ROOF", elevation: 33 }, { name: "LEVEL 03 - LOW ROOF", elevation: 26 }, { name: "LEVEL 02 - SECOND FLOOR", elevation: 14 }, { name: "LEVEL 01 - FIRST FLOOR", elevation: 0 }],
  [{ name: "LEVEL 01 - FIRST FLOOR", elevation: 0 }, { name: "LEVEL 02 - SECOND FLOOR", elevation: 14 }, { name: "LEVEL 03 - LOW ROOF", elevation: 28 }, { name: "LEVEL 04 - HIGH ROOF", elevation: 33 }],
];
const tied = M.consensusMarkers(tilesRead);
assert.deepEqual(tied.markers.map(m => [m.name, m.elevation, m.votes]), [["LEVEL 01 - FIRST FLOOR", 0, 3], ["LEVEL 02 - SECOND FLOOR", 14, 4], ["LEVEL 03 - LOW ROOF", 26, 2], ["LEVEL 04 - HIGH ROOF", 33, 3]]);
assert.deepEqual(tied.disputed, [{ name: "LEVEL 03 - LOW ROOF", reading: 1, at }], "26 or 28: read again close up, where it was read");
const decided = M.consensusMarkers([...tilesRead, [{ name: "LEVEL 03 - LOW ROOF", elevation: 28 }]], [...tilesRead.map(() => 1), 2]);
assert.deepEqual(decided.markers.map(m => m.elevation), [0, 14, 28, 33], "The close-up counts double");
assert.deepEqual([decided.disputed, decided.warnings], [[], []]);
const jelleffRead = M.levelHeights([1, 2], decided.markers);
assert.deepEqual([[...jelleffRead.elevations.values()], [...jelleffRead.heights.values()], jelleffRead.warnings], [[0, 14], [14, 14], []], "Printed: Level 01 0', Level 02 14', low roof 28'");
const misread = M.consensusMarkers([[{ name: "LEVEL 01", elevation: 0 }, { name: "LEVEL 02", elevation: 51 }, { name: "LEVEL 02", elevation: 14 }, { name: "ROOF", elevation: 68 }], [{ name: "LEVEL 02", elevation: 14 }]]);
assert.deepEqual(misread.markers.map(m => m.elevation), [0, 14], "The value more tiles agree on wins; a roof that no longer fits is dropped");
assert.match(misread.warnings[0], /ROOF read as 68 ft doesn't fit/);
assert.deepEqual(H.screen({ levels: [{ name: "LEVEL 02", elevation: "14'-0\"", at: [0.81, 0.4] }, { name: "LEVEL 01", elevation: 0, at: [3, 1] }] }).levels, [{ name: "LEVEL 02", elevation: 14, at: [0.81, 0.4] }, { name: "LEVEL 01", elevation: 0 }], "A position outside the image is dropped, not the marker");

console.log("Schematic model checked: levels from plan titles, plan and section sheets, printed scale and area sizing, source frames, outline repair, level markers by tile consensus with close-up tie-breaks, level heights (including a missing base level), corrections, screened AI readings.");

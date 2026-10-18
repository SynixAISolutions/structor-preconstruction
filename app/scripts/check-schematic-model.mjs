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

console.log("Schematic model checked: levels from plan titles, plan and section sheets, printed scale and area sizing, level heights (including a missing base level), corrections, screened AI readings.");

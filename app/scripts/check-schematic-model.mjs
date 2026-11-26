import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const M = await import("../lib/schematic-model.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");
const { compactFloorPlanFromText, printedPlanLevels } = await import("../lib/floor-plan-label.ts");
const { dimensionedWallLayers } = await import("../lib/wall-assemblies.ts");
const { drawingLengthFeet } = await import("../lib/drawing-dimensions.ts");
const { printedSectionDatums, resolveSectionDatums, sectionDatumLevel } = await import("../lib/section-datums.ts");
const { separatedPlanViews, clipPlanBox, pointOnPlanSheet } = await import("../lib/schematic-plan-views.ts");
const { alignStackedPlan, printedPlanGrid } = await import("../lib/schematic-stack-grid.ts");
const { doorScheduleSheets, matchDoorSizes, printedDoorSizes } = await import("../lib/door-schedule-dimensions.ts");
const { glazingDetailSheets, glazingDetailSource, glazingPlacement, glazingSizeForTag, printedGlazingElevations, printedGlazingReferences, printedWindowSizes } = await import("../lib/glazing-detail-references.ts");

// Levels from architectural plan titles.
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
assert.deepEqual(M.levelPlanSheets(reg).map(p => [p.level, p.row.sheet]), [[1, "A1.1"], [2, "A1.2"]], "Enlarged, RCP, finish, MEP and roof plans are not floor plans; a complete plan covers a level with only one area supplement");
assert.deepEqual(compactFloorPlanFromText("Scale 1:50 @ A3\nFloor plan L0\nSheet 1 of 4"), { sheet: "L0", level: 0, title: "Floor plan L0" });
assert.equal(compactFloorPlanFromText("See floor plan L0\nFloor plan LP"), null);
assert.equal(compactFloorPlanFromText("Floor plan L0\nFloor plan L1"), null, "Several views do not identify a single floor plan");
assert.deepEqual(M.levelPlanSheets([
  { sheet: "L0", title: "Floor plan L0", discipline: "Landscape" },
  { sheet: "L1", title: "L1 Floor Plan", discipline: "Landscape" },
  { sheet: "L2", title: "Landscape plan", discipline: "Landscape" },
  { sheet: "L3", title: "Floor plan L4", discipline: "Landscape" },
]).map(p => [p.level, p.row.sheet]), [[0, "L0"], [1, "L1"]]);
const { alignPlanDrawings, planRegistration } = await import("../lib/schematic-plan-alignment.ts");
const { assembleFloorPlans } = await import("../lib/schematic-plan-areas.ts");
const areaRows = [
  { sheet: "A-100", title: "FLOOR PLAN - OVERALL - LEVEL 01", discipline: "Architectural" },
  { sheet: "A-111A", title: "AREA PLAN - LEVEL 01 - AREA A", discipline: "Architectural" },
  { sheet: "A-111B", title: "FLOOR PLAN - LEVEL 01 - AREA B", discipline: "Architectural" },
  { sheet: "A-112A", title: "FLOOR PLAN - LEVEL 02 - AREA A", discipline: "Architectural" },
  { sheet: "A-112B", title: "FLOOR PLAN - LEVEL 02 - AREA B", discipline: "Architectural" },
];
assert.deepEqual(M.levelPlanSheets(areaRows).map(({ level, row, areas }) => [level, row.sheet, ...(areas ?? []).map(area => area.sheet)]),
  [[1, "A-111A", "A-111B"], [2, "A-112A", "A-112B"]], "Two area plans take priority over the overview and belong to one level");

const line = (a, b, width = .72) => ({ a, b, width, color: "#000000" });
const planSheet = (sheet, title, other = {}) => ({ sheet, title, discipline: "Architectural", ...other });
assert.deepEqual(printedPlanLevels("B1 & B2 FLOOR PLANS"), [-2, -1]);
assert.deepEqual(printedPlanLevels("1ST & 2ND-6TH (TYP.) FLOOR PLANS"), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(M.levelPlanSheets([planSheet("A103", "6TH & 7TH FLOOR PLANS")]), [],
  "A multi-level sheet is never assigned whole to its last named floor");
const planCaption = (text, x, y, height = 18) => ({ text, a: [x, y], b: [x + text.length * height / 2, y], height });
const paper = { width: 1100, height: 750 };
const viewText = [planCaption("1ST FLOOR PLAN", 100, 630), planCaption("2ND-5TH FLOOR PLAN", 620, 630),
  planCaption('1/8" = 1\'-0"', 100, 647, 12), planCaption('1/4" = 1\'-0"', 620, 647, 12)];
const viewRules = [line([95, 634], [520, 634]), line([615, 634], [1000, 634])];
const views = separatedPlanViews(paper, viewText, viewRules);
assert.deepEqual(views.map(({ levels, scale }) => [levels, scale]), [[[1], 8], [[2, 3, 4, 5], 4]]);
assert.equal(views[0].box[2], views[1].box[0]);
assert.ok(pointOnPlanSheet([.5, .5], views[1].box)[0] > views[1].box[0]);
assert.ok(clipPlanBox([0, 0, 1, 1], views[1].box).every((value, i) => Math.abs(value - views[1].box[i]) < 1e-8));
assert.deepEqual(separatedPlanViews(paper, viewText, [line([95, 634], [690, 634]), viewRules[1]]), []);
assert.deepEqual(M.levelPlanSheets([
  planSheet("A102", views[1].title, { viewLevel: 4, typicalView: true }),
  planSheet("A104", "4TH FLOOR PLAN"),
]).map(result => result.row.sheet), ["A104"], "A floor-specific view takes precedence over a typical view");
assert.equal(sectionDatumLevel("B2"), -2);
assert.equal(sectionDatumLevel("9TH FLOOR"), 9);

function gridFixture(dx, dy, jog) {
  const labels = [], strokes = [];
  for (const [axis, names] of [[0, ["A", "B", "C"]], [1, ["1", "2", "3"]]]) {
    for (const [i, label] of names.entries()) {
      const at = 70 + i * 162, shift = axis ? dy : dx, side = axis ? dx : dy;
      const point = (across, along) => axis ? [along + side, across + shift] : [across + shift, along + side];
      const center = point(at + jog, 30);
      const points = Array.from({ length: 24 }, (_, n) => {
        const angle = n * Math.PI / 12;
        return [center[0] + 15 * Math.cos(angle), center[1] + 15 * Math.sin(angle)];
      });
      strokes.push(...points.map((a, j) => line(a, points[(j + 1) % points.length], .24)));
      strokes.push(line(point(at + jog, 45), point(at + jog, 57), .24));
      if (jog) strokes.push(line(point(at + jog, 57), point(at, 75), .24));
      strokes.push(line(point(at, 82), point(at, 115), .24), line(point(at, 124), point(at, 285), .24));
      labels.push({ text: label, a: [center[0] - 4, center[1] + 5], b: [center[0] + 4, center[1] + 5], height: 15 });
    }
  }
  return printedPlanGrid(labels, strokes, [], 1 / 9);
}
const referenceGrid = gridFixture(0, 0, 0);
const displacedGrid = gridFixture(900, -36, 12);
assert.equal(referenceGrid.length, 6);
assert.equal(displacedGrid.length, 6, "A jogged bubble supplies the physical grid line beyond the jog");
const stackOffset = alignStackedPlan(referenceGrid, displacedGrid);
assert.ok(Math.abs(stackOffset[0] + 100) < .001 && Math.abs(stackOffset[1] - 4) < .001);
assert.equal(alignStackedPlan(referenceGrid, displacedGrid.filter(mark => mark.axis === 1)), null);
assert.equal(alignStackedPlan(referenceGrid, displacedGrid.map(mark => mark.label === "C" ? { ...mark, at: mark.at + 2 } : mark)), null);

const overlap = Array.from({ length: 12 }, (_, i) => [
  line([188, 42 + i * 13], [210 + i * 2, 42 + i * 13]),
  line([200 + i * 5, 31 + i * 11], [200 + i * 5, 56 + i * 13]),
]).flat();
const dashes = Array.from({ length: 14 }, (_, i) => line([225, 24 + i * 25], [225, 40 + i * 25], .9));
const mark = { text: "MATCHLINE", a: [235, 100], b: [235, 60], height: 9 };
const shift = ([x, y]) => [x - 180, y + 36];
const left = planRegistration([...dashes, ...overlap], [mark], 8);
const right = planRegistration([...dashes, ...overlap].map(s => ({ ...s, a: shift(s.a), b: shift(s.b) })),
  [{ ...mark, a: shift(mark.a), b: shift(mark.b) }], 8);
const joined = alignPlanDrawings(left, right);
assert.ok(joined?.matches >= 10);
assert.ok(Math.abs(joined.offset[0] - 20) < .001 && Math.abs(joined.offset[1] + 4) < .001,
  "Scale and two-axis position are established by shared vectors");
assert.equal(alignPlanDrawings(left, { ...right, strokes: [] }), null, "A matchline alone cannot prove the along-line position");
const makeArea = (area, registration, outline, walls, rooms = []) => ({
  area, registration, flights: { arriving: [], rising: [] },
  level: { id: "L1", name: "Level 01", order: 1, elevation: 0, height: 14, outline, walls, rooms,
    source: { sheet: "A-111" + area, documentId: "d", page: area === "A" ? 1 : 2 },
    frame: { widthFeet: 60, heightFeet: 60 }, sizing: "Printed scale, 8 ft per inch" },
});
const A = makeArea("A", left, [[0, 0], [26, 0], [26, 44], [0, 44]],
  [{ a: [17, 25], b: [28, 25], thickness: .5 }]);
const stacked = assembleFloorPlans([A], undefined, [-100, 4]);
assert.deepEqual(stacked.level.walls[0].a, [-83, 29]);
assert.deepEqual(stacked.level.planAreas[0].offset, [-100, 4], "The source sheet overlay keeps the same translation as the 3D objects");
const D = makeArea("B", right, [[4, 4], [32, 4], [32, 48], [4, 48]],
  [{ a: [4, 29], b: [28, 29], thickness: .5 }], [{ name: "GYM", number: "102", at: [15, 20] }]);
const assembled = assembleFloorPlans([A, D]);
assert.equal(assembled.level.planAreas.length, 2);
assert.equal(M.planSource(assembled.level, assembled.level.walls[1].planArea).sheet, "A-111B");
assert.ok(Math.abs(assembled.level.walls[0].b[0] - 25) < .00001 && Math.abs(assembled.level.walls[1].a[0] - 25) < .00001,
  "Both walls meet at the same drawn matchline");
assert.ok(Math.abs(assembled.level.rooms[0].at[0] - 35) < .001);
assert.ok(Math.abs(assembled.level.rooms[0].at[1] - 16) < .001, "Room tags move with the source plan");
assert.ok(Math.abs(M.levelFootprints(assembled.level).reduce((n, ring) => n + M.polygonArea(ring), 0) - 52 * 44) < .001,
  "Each source contributes only the footprint on its side of the matchline");
const moved = M.moveOutlinePoint({ levels: [assembled.level], warnings: [], builtAt: "" }, "L1", 0, [25, 2], 1).levels[0];
assert.deepEqual(moved.planAreas[1].outline[0], [25, 2]);
assert.deepEqual(moved.outline, assembled.level.outline, "Only the selected area's outline is corrected");
const unresolved = assembleFloorPlans([A, { ...D, registration: null }]);
assert.deepEqual(unresolved.level.walls, A.level.walls, "Unproven positioning leaves the primary plan untouched");
assert.equal(unresolved.level.unplacedPlans[0].sheet, "A-111B");
assert.match(unresolved.warnings[0], /needs plan alignment/);

assert.equal(M.heightSheet(reg).sheet, "A5.1", "Building sections before exterior elevations");
assert.equal(M.heightSheet(reg.filter(r => r.sheet !== "A5.1")).sheet, "A4.1");
assert.equal(M.heightSheet([]), null);
const wallLayers = [{ material: "Studs", inches: 3.625 }, { material: "Gypsum board", inches: .625 }];
assert.deepEqual(dimensionedWallLayers(wallLayers, '4 1/4"', 4.25 / 12), wallLayers);
assert.deepEqual(dimensionedWallLayers(wallLayers, '4 1/4"', .6), [], "Reject a type inconsistent with the plan width");
assert.deepEqual(dimensionedWallLayers(wallLayers, '5"', 5 / 12), [], "Reject an assembly that does not add up");
assert.deepEqual(dimensionedWallLayers([...wallLayers, { material: "Insulation", inches: null }], '4 1/4"', 4.25 / 12), [], "Never assign an unspecified layer a 3D thickness");

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
assert.equal(drawingLengthFeet(`-2′-6 1/2″`), -(2 + 6.5 / 12), "The minus sign applies to the full imperial dimension");
assert.equal(drawingLengthFeet("3048 mm"), 10);
assert.equal(drawingLengthFeet("12"), null);
assert.equal(drawingLengthFeet(`5'-2 1/0"`), null);
const word = (str, x, y, w = .02, h = .006) => ({ str, x, y, w, h });
const datumText = [
  word("LEVEL 01", .7, .6), word(`249'-5 3/8"`, .7, .606),
  word("LEVEL 01 - NEW ADDITION", .68, .632, .04), word(`248'-5 3/8"`, .69, .638),
  word("LEVEL 02", .7, .52), word(`262'-5 3/8"`, .7, .526),
  word("LEVEL 03 = 276.56'", .7, .46, .08),
  word("PARAPET", .7, .34), word(`296'-0"`, .7, .346),
  word("LEVEL 04", .12, .26), word(`111'-0"`, .58, .266),
];
const nativeDatums = printedSectionDatums(datumText);
assert.deepEqual(nativeDatums.map(row => row.name), ["LEVEL 01", "LEVEL 01 - NEW ADDITION", "LEVEL 02", "LEVEL 03"]);
const provenance = (quote, sheet = "A-301") => ({ documentId: "drawing-set", page: 5, sheet, quote });
const resolved = resolveSectionDatums(nativeDatums.map(({ quote, ...datum }) => ({ ...datum, source: provenance(quote) })));
assert.equal(resolved.markers.length, 2);
assert.match(resolved.warnings[0], /Level 01 has different printed elevations/);
const withSources = M.levelHeights([1, 2, 3], resolved.markers);
assert.equal(withSources.vertical.get(1).basis, "estimated");
assert.equal(withSources.vertical.get(2).basis, "printed");
assert.equal(withSources.vertical.get(2).datum.quote, `262'-5 3/8"`);
const missingMiddle = M.levelHeights([1, 2, 3], [{ name: "Level 01", elevation: 100 }, { name: "Level 03", elevation: 130 }]);
assert.deepEqual([...missingMiddle.elevations.values()], [0, 15, 30], "A missing floor stays between known elevations");
assert.deepEqual([...missingMiddle.heights.values()], [15, 15, 14]);
assert.ok([...missingMiddle.vertical.values()].every(level => level.basis === "estimated"));

const schedulePage = [
  word("NUMBER", .1, .10),
  word("HEIGHT", .33, .10, .015), word("WIDTH", .36, .10, .015), word("HEIGHT", .40, .10, .015),
  word("TOTAL", .365, .089, .02),
  word("D02", .100, .123, .010), word("A101", .112, .123, .010),
  word(`7'-0"`, .33, .123, .009), word(`6'-0"`, .36, .123, .009), word(`8'-0"`, .40, .123, .009),
];
assert.deepEqual(printedDoorSizes(schedulePage), [{ number: "D02", width: 6, height: 8 }]);
const doorSize = { number: "D02", width: 6, height: 8, source: provenance("D02", "A-601") };
const door = { a: [0, 0], b: [6, 0], width: 6, thickness: .4, leaves: 2, kind: "door", hinges: [[0, 0], [6, 0]], openTo: [[0, 3], [6, 3]], number: "D02" };
assert.deepEqual(matchDoorSizes([door], [doorSize]).doors[0].scheduledSize, doorSize);
assert.deepEqual(matchDoorSizes([{ ...door, width: 5.6 }], [doorSize]).conflicts, ["D02"]);
assert.deepEqual(matchDoorSizes([door], [doorSize, { ...doorSize, height: 7 }]).conflicts, ["D02"]);
assert.deepEqual(matchDoorSizes([door], [doorSize], new Set()).conflicts, ["D02"]);
const drawingRows = [
  { title: "Door and frame schedules", discipline: "Architectural" },
  { title: "Window types and storefront elevations", discipline: "Architectural" },
  { title: "Door schedule", discipline: "Electrical" },
];
assert.deepEqual(doorScheduleSheets(drawingRows), [drawingRows[0]]);
assert.deepEqual(glazingDetailSheets(drawingRows), [drawingRows[1]]);
const glassSources = printedGlazingReferences([word("E1 STOREFRONT - SF-1A", .5, .4), word("SEE STOREFRONT - SF-1", .45, .52), word("SF-1A", .43, .6)])
  .map(ref => ({ ...ref, source: provenance(ref.quote, "A-611B") }));
assert.equal(glazingDetailSource("SF-1A", glassSources).sheet, "A-611B");
assert.equal(glazingDetailSource("SF-1", glassSources), undefined);
assert.equal(glazingDetailSource("SF-1A", [...glassSources, { ...glassSources[0], source: { ...glassSources[0].source, page: 8 } }]), undefined);

const ticks = (x, y) => [line([x, y], [x + 1.7, y - 1.7], 1.2), line([x, y], [x - 1.7, y + 1.7], 1.2)];
const elevationInk = [
  line([98, 90], [282, 90], .24), ...ticks(100, 90), ...ticks(280, 90),
  line([310, 118], [310, 329], .24), ...ticks(310, 120), ...ticks(310, 327),
  line([100, 120], [280, 120], .9), line([100, 327], [280, 327], .9),
  line([100, 120], [100, 327], .9), line([280, 120], [280, 327], .9),
  line([90, 374], [322, 374], .72),
];
const elevationWords = [
  { text: '10′-0″', a: [177, 84], b: [203, 84], height: 9 },
  { text: '11′-6″', a: [304, 237], b: [304, 210], height: 9 },
  { text: 'STOREFRONT - SF-4', a: [99, 368], b: [272, 368], height: 16 },
  { text: "1/4\" = 1'-0\"", a: [103, 391], b: [170, 391], height: 16 },
  { text: 'SILL 1′-0″ AFF', a: [107, 340], b: [173, 340], height: 9 },
];
const [{ size: elevation, quote: caption }] = printedGlazingElevations(elevationWords, elevationInk);
assert.equal(elevation.width, 10);
assert.equal(elevation.height, 11.5);
assert.equal(elevation.sill.feet, 1);
assert.equal(printedGlazingElevations(elevationWords, [...elevationInk, line([70, 120], [280, 120], .9)])[0].size, undefined,
  "A taller or wider continuous frame means the candidate may be an internal bay");
assert.equal(printedGlazingElevations(elevationWords.filter(run => !run.text.includes("=")), elevationInk)[0].size, undefined);
assert.equal(printedGlazingElevations(elevationWords.map(run => run.text === "10′-0″" ? { ...run, text: "9′-0″" } : run), elevationInk)[0].size, undefined);
const aw = (str, x, y) => ({ str, x, y, w: .024, h: .01 });
const windows = printedWindowSizes([
  aw("TYPE MARK", .11, .12), aw("ROUGH HEIGHT", .4, .12), aw("ROUGH WIDTH", .47, .12),
  aw("W-08", .11, .16), aw("8′-0 1/2″", .4, .16), aw("4′-0 1/2″", .47, .16),
  aw("W-09", .11, .19), aw("4′-0 1/2″", .47, .19),
]);
assert.equal(windows.length, 1);
assert.equal(windows[0].size.kind, "rough-opening");
assert.equal(windows[0].size.height, 8 + .5 / 12);
const windowSource = { documentId: "windows", sheet: "A601", page: 1, quote: caption };
const dimensions = glazingSizeForTag("SF4", [{ tag: "SF-4", source: windowSource, size: elevation }]);
assert.equal(dimensions.source, windowSource);
assert.equal(glazingSizeForTag("SF-4", [
  { tag: "SF-4", source: windowSource, size: elevation },
  { tag: "SF-4", source: windowSource, size: { ...elevation, height: 13 } },
]), undefined, "Conflicting sizes must not follow an ambiguous plan tag");
const glazedRun = { a: [0, 1], b: [10, 1], dimensions };
const calibrated = { height: 14, sizing: "Printed scale, 8 ft per inch" };
assert.deepEqual(glazingPlacement(glazedRun, calibrated), { base: 1, height: 11.5, dimensioned: true });
assert.equal(glazingPlacement({ ...glazedRun, b: [8, 1] }, calibrated).dimensioned, false);
assert.equal(glazingPlacement(glazedRun, { ...calibrated, sizing: "Sized to the building area (no scale read)" }).dimensioned, false);
assert.equal(glazingPlacement(glazedRun, { ...calibrated, height: 12 }).dimensioned, false);
const frameParts = [
  line([104, 124], [276, 124], .3), line([104, 323], [276, 323], .3),
  ...[104, 188, 192, 276].map(x => line([x, 124], [x, 323], .3)),
];
const labelRun = (text, x, y, width, height = 9) => ({ text, a: [x, y], b: [x + width, y], height });
const glassMarks = [labelRun("GL-T", 118, 310, 22), labelRun("GL-T", 210, 310, 22)];
const legendWords = [
  labelRun("GLAZING LEGEND", 680, 40, 90, 14),
  labelRun("MARK", 660, 58, 28), labelRun("TYPE", 715, 58, 25),
  labelRun("GL-T", 660, 74, 22), labelRun("TEMPERED FLOAT GLASS", 715, 74, 130),
  labelRun("GLAZING GENERAL NOTES", 659, 100, 140, 14),
];
const measured = printedGlazingElevations([...elevationWords, ...glassMarks, ...legendWords], [...elevationInk, ...frameParts])[0].size;
assert.ok(measured.elevation.symmetric);
const panes = measured.elevation.parts.filter(part => part.kind === "Pane");
assert.equal(panes.length, 2);
assert.deepEqual(panes.map(part => part.mark), ["GL-T", "GL-T"]);
assert.equal(panes[0].description, "TEMPERED FLOAT GLASS");
assert.ok(Math.abs(panes[0].width - 84 / 18) < .001);
assert.equal(measured.elevation.parts.filter(part => part.kind === "Mullion").length, 1);
assert.ok(Math.abs(measured.elevation.parts.find(part => part.kind === "Mullion").width - 4 / 18) < .001);
const changedGlass = printedGlazingElevations([...elevationWords, glassMarks[0], { ...glassMarks[1], text: "GL-L" }], [...elevationInk, ...frameParts])[0].size;
assert.equal(changedGlass.elevation.symmetric, false, "Matching widths alone do not prove which end faces the elevation");
const missingEdge = printedGlazingElevations([...elevationWords, ...glassMarks], [...elevationInk, ...frameParts.slice(1)])[0].size;
assert.equal(missingEdge.elevation, undefined, "A glass label alone cannot complete an open pane boundary");
assert.equal(glazingSizeForTag("SF-4", [
  { tag: "SF-4", size: measured, source: windowSource },
  { tag: "SF-4", size: measured, source: { ...windowSource, page: 7 } },
]).elevation, undefined, "An ambiguous source may agree on size, but it cannot place components");

const { printedSlabNotes, printedFloorFinishes, slabNoteLevel, slabNoteArea, finishesForRoom } = await import("../lib/schematic-floor-details.ts");
const slabNotes = printedSlabNotes([
  '2. SLAB ON GRADE SHALL BE 125 mm CONCRETE PLACED OVER VAPOR RETARDER AND 200 mm MIN.',
  'GRANULAR BASE. REINFORCE WITH WELDED MESH.',
  '3. FOOTINGS SHALL BE 1′-6″ BELOW SLAB ON GRADE.',
].join("\n"));
assert.equal(slabNotes.length, 1);
assert.deepEqual(slabNotes[0].layers.map(layer => [layer.material, layer.label, layer.minimum ?? false]),
  [["Concrete slab", "125 mm", false], ["Vapor retarder", undefined, false], ["Granular base", "200 mm", true]]);
assert.equal(printedSlabNotes("1. 5 INCH PIPE ABOVE THE SLAB-ON-GRADE.").length, 0);
const noteSheet = { title: "Level 01 Framing Plan - Area B", discipline: "Structural" };
assert.equal(slabNoteLevel(noteSheet), 1);
assert.equal(slabNoteLevel({ ...noteSheet, discipline: "Architectural" }), null);
assert.equal(slabNoteArea(noteSheet, assembled.level, areaRows), 1);
assert.equal(slabNoteArea({ ...noteSheet, title: "Level 01 Framing Plan - Area C" }, assembled.level, areaRows), undefined);
const finishBoxes = [
  aw("CODE", .11, .07), aw("TYPE", .23, .07), aw("LOCATION", .44, .07),
  aw("FLOOR", .1, .12), aw("AT-1", .1, .15), aw("ATHLETIC FLOORING", .23, .15), aw("GYM", .44, .15),
  aw("MILLWORK", .1, .18), aw("W-1", .1, .21), aw("WOOD PANEL", .23, .21), aw("GYM", .44, .21),
];
const finishGrid = [.08, .19, .39, .58].map(x => line([x * 1000, 25], [x * 1000, 250]));
const finishRead = printedFloorFinishes(finishBoxes, finishGrid, { width: 1000, height: 1000 });
assert.deepEqual(finishRead, [{ tag: "AT-1", material: "ATHLETIC FLOORING", location: "GYM" }]);
const finishes = finishRead.map(note => ({ ...note, source: windowSource }));
assert.equal(finishesForRoom({ name: "Gymnasium (including court)", number: "102" }, finishes).length, 1);
assert.equal(finishesForRoom({ name: "Gym storage", number: "103" }, finishes).length, 0);

// Drawing assemblies must follow exact plan evidence and keep unknown depths unknown.
const assemblyCaptionTest = await import("../lib/schematic-assembly-drawings.ts");
const { floorAssemblyForRoom } = await import("../lib/schematic-floor-details.ts");
const { printedWallTags, matchPrintedWallTags } = await import("../lib/schematic-printed-wall-tags.ts");
const { holdOutsidePlanRuns } = await import("../lib/schematic-plan-review.ts");
assert.equal(M.feetPerInch('1 1/2" = 1\'-0"'), .667);
assert.equal(assemblyCaptionTest.assemblyFloorLevel("SLAB ON GRADE @ B2 LEVEL"), -2);
assert.equal(assemblyCaptionTest.assemblyFloorLevel("TYPICAL FLOOR ASSEMBLY @ LEVEL 2"), null);
assert.equal(assemblyCaptionTest.assemblyThickness('5/8"', '5/8" GYPSUM BOARD'), 5 / 8 / 12);
assert.equal(assemblyCaptionTest.assemblyThickness('5/8"', '2 5/8" STEEL STUD'), null, "Use the whole dimension");
assert.equal(assemblyCaptionTest.assemblyThickness('16"', 'STEEL STUDS AT 16" O.C.'), null);
assert.equal(assemblyCaptionTest.assemblyThickness('2"', '2" MIN. GROUT BED'), null);
const taggedSection = { source: { documentId: "d", sheet: "A500", page: 3, quote: "FLOOR TYPE F2" }, detail: "3",
  layers: [{ material: "CONCRETE" }] };
const assemblyRoom = { outline: [[0, 0], [9, 0], [9, 9], [0, 9]], at: [4, 4] };
const levelWithReference = { order: 1, floorReferences: [{ sheet: "A500", detail: "3", at: [3, 3] }] };
assert.equal(floorAssemblyForRoom(levelWithReference, assemblyRoom, [taggedSection]).matchedBy, "callout");
assert.equal(floorAssemblyForRoom({ order: 1 }, assemblyRoom, [taggedSection]), null);
assert.equal(floorAssemblyForRoom({ order: 1 }, assemblyRoom, [{ ...taggedSection, source: { ...taggedSection.source, quote: "TYP. FLOOR ASSEMBLY" } }]).basis, "reference");
assert.equal(floorAssemblyForRoom(levelWithReference, assemblyRoom, [taggedSection, { ...taggedSection, layers: [] }]), null);
const wallsToVerify = [{ a: [0, 3], b: [8, 3], thickness: .5 }, { a: [12, 14], b: [14, 14], thickness: .5 }];
const drawingTag = { str: "4", x: .035, y: .033, w: .005, h: .01 };
const tagBox = [line([31, 28], [45, 28]), line([45, 28], [45, 46]), line([45, 46], [31, 46]), line([31, 46], [31, 28])];
const tagPaper = { width: 1000, height: 1000 }, tagFrame = { widthFeet: 100, heightFeet: 100 };
assert.equal(printedWallTags([drawingTag], tagBox.slice(0, 3), tagPaper, tagFrame, new Set(["4"])).length, 0);
const realMark = printedWallTags([drawingTag], tagBox, tagPaper, tagFrame, new Set(["4"]));
assert.equal(realMark.length, 1);
assert.equal(matchPrintedWallTags(wallsToVerify, realMark, [{ tag: "4", thickness: '6"' }])[0].tagRead.basis, "printed");
assert.equal(matchPrintedWallTags(wallsToVerify, realMark, [{ tag: "4", thickness: '12"' }])[0].type, undefined);
assert.equal(holdOutsidePlanRuns(wallsToVerify, wallsToVerify, assemblyRoom.outline)[1].outsidePlan, true);

// A framing-plan boundary uses closed vector geometry and its printed scale and cutouts.
const { structuralFloorLevels, structuralFloorView, structuralSlabOutline, slabDimension } = await import("../lib/schematic-structural-slabs.ts");
const { floorSurfaces, floorAssemblyForSurface } = await import("../lib/schematic-floor-details.ts");
const { typeWallContinuations } = await import("../lib/schematic-printed-wall-tags.ts");
assert.deepEqual(structuralFloorLevels("2ND–5TH TYPICAL FLOOR FRAMING PLAN"), [2, 3, 4, 5]);
assert.deepEqual(structuralFloorLevels("B2/FOUNDATION PLAN"), []);
assert.deepEqual(structuralFloorLevels("9TH FLOOR FRAMING PLAN"), [9]);
const slabCaption = { text: "LEVEL 02 FLOOR FRAMING PLAN", a: [200, 900], b: [450, 900], height: 20 };
const slabScale = { text: '1/8" = 1\'-0"', a: [200, 915], b: [225, 915], height: 9 };
const slabNote = { text: '2) SLAB THICKNESS = 8 1/2".', a: [200, 945], b: [290, 945], height: 9 };
const framingSheet = { width: 1000, height: 1100 };
const slabRuns = [slabCaption, slabScale, slabNote];
const slabView = structuralFloorView(slabCaption.text, slabRuns, framingSheet);
assert.equal(slabView.scale, 8);
assert.equal(structuralFloorView("LEVEL 03 FLOOR FRAMING PLAN", slabRuns, framingSheet), null);

const boundary = [[200, 250], [650, 250], [650, 700], [420, 700], [420, 650], [200, 650]];
const shaft = [[270, 400], [315, 400], [315, 445], [270, 445]];
const drawnSlab = [boundary, shaft].flatMap(ring => ring.map((point, i) => line(point, ring[(i + 1) % ring.length])));
const builtSlab = structuralSlabOutline([[boundary, shaft]], drawnSlab, slabView, [0, 0], boundary.map(p => p.map(value => value / 9)));
assert.deepEqual(builtSlab.outline.map(p => p.map(value => Math.round(value * 9))), boundary);
assert.deepEqual(builtSlab.holes.map(ring => ring.map(p => p.map(value => Math.round(value * 9)))), [shaft]);
assert.equal(structuralSlabOutline([[boundary, shaft]], drawnSlab.slice(1), slabView, [0, 0], builtSlab.outline), null, "A background clip cannot supply a missing slab edge");
assert.equal(structuralSlabOutline([[boundary, shaft]], drawnSlab, slabView, [200, 0], builtSlab.outline), null);
const slabSource = { documentId: "drawings", sheet: "S0104", page: 8, quote: slabCaption.text };
const slabThickness = slabDimension(slabRuns, slabView, slabSource);
assert.equal(slabThickness.feet, 8.5 / 12);
assert.equal(slabDimension([{...slabNote, text: slabNote.text + " UNLESS NOTED OTHERWISE."}], slabView, slabSource), undefined);
const levelWithSlab = { structuralSlab: { ...builtSlab, source: slabSource, dimension: slabThickness } };
const fitFloor = { ...assemblyRoom, at: [26, 31], outline: [[24, 30], [28, 30], [28, 32], [24, 32]] };
const piercesShaft = { ...assemblyRoom, at: [33, 45], outline: [[28, 40], [38, 40], [38, 52], [28, 52]] };
const roofSurfaces = floorSurfaces(levelWithSlab, [fitFloor, piercesShaft]);
assert.equal(roofSurfaces.length, 2);
assert.equal(roofSurfaces[0].structural, true);
assert.equal(floorAssemblyForSurface(levelWithSlab, roofSurfaces[0]).matchedBy, "framing-note");

const wallByLeader = [{ a: [0, 1], b: [12, 1], thickness: .5 }, { a: [0, 6], b: [12, 6], thickness: .5 }];
const leaderMatch = matchPrintedWallTags(wallByLeader, [{ tag: "4", at: [3, 1.5], tips: [[6, 6.2]] }], [{ tag: "4", thickness: '6"' }]);
assert.equal(leaderMatch[0].type, undefined, "The mark's center can be closer to the wrong wall");
assert.equal(leaderMatch[1].type, "4");
assert.deepEqual(leaderMatch[1].tagRead.at, [3, 1.5]);
const continuous = [
  { a: [0, 1], b: [6, 1], thickness: .5, type: "4", tagRead: { basis: "printed", at: [3, 1.5] } },
  { a: [6.12, 1], b: [10, 1], thickness: .5 }, { a: [13, 1], b: [17, 1], thickness: .5 },
];
assert.equal(typeWallContinuations(continuous, [])[1].tagRead.basis, "continuation");
assert.equal(typeWallContinuations(continuous, [])[2].type, undefined, "A gap with no drawn door stays untyped");
const actualDoor = { kind: "door", a: [10, 1], b: [13, 1] };
assert.equal(typeWallContinuations(continuous, [actualDoor])[2].type, "4");
const conflictingTag = [...continuous.slice(0, 2), { ...continuous[2], type: "5", tagRead: { basis: "printed" } }];
const ambiguous = typeWallContinuations(conflictingTag, [actualDoor]);
assert.equal(ambiguous[1].type, undefined);
assert.equal(ambiguous[1].tagReview, true);

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

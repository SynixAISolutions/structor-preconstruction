import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { elements, materials, rooms, planTransform, systemElements, systemMaterials, allMaterials, modelObjects, modelForProject, sampleModelReview, interiorTransitions, transitionMaterials, finishScheduleRows, level2Elements, level2Transitions, doorInputs, doorAssociations, ceilingInputs, ceilingMaterials, wallFinishRecords, wallFinishFaces, wallBaseBreakdown, level2Rooms, allRooms, planVoids, sheetTransforms, sheetTransformFor, toSheetPoint, partitionTypes, partitionSchedule } = await import("../lib/jelleff-model.ts");
const M = await import("../lib/model.ts");
const { doorScheduleRows, doorSchedule, doorTraces, scheduleOnlyDoors, doorPanelTypes, doorMaterials, DOOR_WIDTH_TOLERANCE_FT } = await import("../lib/jelleff-doors.ts");
const { hardwareSets, hardwareManufacturers, hardwareFinishes } = await import("../lib/data/jelleff-hardware.ts");
const { ceilingTypes, ceilingSchedule, ceilingZones, roomsWithoutCeiling, unplacedCeilingTags, RCP_OFFSETS } = await import("../lib/jelleff-ceilings.ts");
const { wallFinishData, excludedFinishTags, wallFinishGaps } = await import("../lib/jelleff-wall-finishes.ts");
const { ALL_SCREENS } = await import("../lib/screens.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

// ── The traced first floor (what the current studio draws) ──
const materialIds = new Set(materials.map(({ id }) => id));
assert.equal(new Set(elements.map(({ id }) => id)).size, elements.length, "Element IDs must be unique");
assert.equal(materialIds.size, materials.length, "Material IDs must be unique");
for (const element of elements) {
  assert(materialIds.has(element.materialId), `${element.id}: material missing`);
  assert(element.kind === "floor" ? element.points.length >= 3 : element.points.length === 2, `${element.id}: invalid geometry`);
  assert(element.points.every((point) => point.length === 2 && point.every(Number.isFinite)), `${element.id}: invalid coordinates`);
  assert(element.height > 0 && Number.isFinite(element.height), `${element.id}: invalid height`);
  assert(element.geometryStatus.includes("Simplified"), `${element.id}: missing approximation disclosure`);
  assert(element.source.page > 0 && element.source.asset.startsWith("/models/jelleff/"), `${element.id}: source missing`);
  if (element.kind === "floor") assert(Math.abs((element.base || 0) + element.height) < 0.001, `${element.id}: floor top must meet wall base`);
  if (element.kind !== "floor") assert(Math.hypot(element.points[1][0] - element.points[0][0], element.points[1][1] - element.points[0][1]) > 0.1, `${element.id}: zero-length segment`);
}
for (const source of [...elements.map(e => e.source), ...allMaterials.flatMap(m => m.sources), ...systemElements.map(e => e.source)]) {
  if (source.drawing === "Jelleff project manual") { assert(/^\d\d \d\d \d\d$/.test(source.sheet) && source.page > 0 && source.asset === "", `${source.sheet}: a manual section and page, no sheet image`); continue; }
  assert(existsSync(new URL(`../public${source.asset}`, import.meta.url)), `Source image missing: ${source.asset}`);
  assert.equal(source.drawing, "Jelleff drawing set", `${source.sheet}: names its drawing set`);
}

function contains(polygon, [x, z]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i], [xj, zj] = polygon[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const floors = elements.filter(({ kind }) => kind === "floor");
const yard = rooms.find(({ id }) => id === "yard");
assert(yard && floors.every(({ points }) => !contains(points, yard.center)), "The open yard must remain a void");
// Sample the yard interior, not just its center, to catch a broad floor accidentally bridging it.
for (let x = 85; x < 123; x += 5) {
  for (let z = 3; z < 35; z += 5) assert(floors.every(({ points }) => !contains(points, [x, z])), "Floor overlaps open mechanical yard");
}
for (const room of rooms) assert(room.center.length === 2 && room.center.every(Number.isFinite), `${room.id}: invalid label position`);
assert(Math.abs(1270 * planTransform.feetPerPixel - (177 + 4 / 12)) < 0.001, "Overall dimension calibration changed");
assert(elements.some(({ points }) => points.length === 2 && Math.abs(points[0][0] - points[1][0]) > 3 && Math.abs(points[0][1] - points[1][1]) > 3), "Angled wing is missing");
for (const s of [...systemElements].filter(e => M.SHAPES[e.kind] === "polygon")) assert(!contains(s.points, yard.center), `${s.id}: must not cover the open yard`);

// ── Every object: complete metadata for the inspector ──
const objects = modelObjects;
assert.equal(objects.length, elements.length + interiorTransitions.length + level2Elements.length + level2Transitions.length + doorInputs.length + ceilingInputs.length + systemElements.length);
assert.equal(new Set(objects.map(o => o.id)).size, objects.length, "Object IDs must be unique across the model");
assert.equal(new Set(allMaterials.map(m => m.id)).size, allMaterials.length, "Assembly IDs must be unique");
const levels = new Set(M.LEVELS.map(l => l.id));
for (const o of objects) {
  const shapeOk = o.shape === "segment" ? o.points.length === 2 : o.shape === "polygon" ? o.points.length >= 3 : o.points.length === 1;
  assert(shapeOk && o.points.every(p => p.every(Number.isFinite)), `${o.id}: ${o.shape} geometry`);
  assert(levels.has(o.level) && o.views.length && o.views.every(v => M.MODEL_VIEWS.some(x => x.id === v)), `${o.id}: level and views`);
  assert(M.MODEL_VIEWS.filter(v => o.views.includes(v.id)).every(v => v.disciplines.includes(o.discipline)), `${o.id}: ${o.discipline} doesn't belong in its views`);
  assert(/^\d\d$/.test(o.division) && o.divisionName, `${o.id}: CSI division`);
  assert(o.specSection === null || o.specSection.startsWith(o.division + " "), `${o.id}: spec section ${o.specSection} is outside division ${o.division}`);
  assert(o.quantity.value > 0 && ["SF", "LF", "EA", "CY"].includes(o.quantity.unit), `${o.id}: quantity`);
  assert(o.sources.length && o.sources.every(s => s.sheet && s.page > 0 && s.detail && s.drawing), `${o.id}: sources`);
  assert(o.properties.length && o.properties.every(p => p.label && p.value), `${o.id}: properties`);
  assert([0.25, 0.5, 0.75].includes(o.confidence), `${o.id}: confidence`);
  assert(o.caution && o.description, `${o.id}: disclosure`);
  if (o.basis.geometry === "illustrative") assert(o.properties.some(p => /illustrative|not verified/i.test(p.value)) || o.caution.includes("Illustrative"), `${o.id}: says it is illustrative`);
}
for (const o of objects.filter(x => systemElements.some(e => e.id === x.id))) assert.equal(o.basis.geometry, "illustrative", `${o.id}: system objects are illustrative`);

// ── Measuring: quantities come from geometry ──
const find = (id) => M.findObject(objects, id);
const gymFloor = find("floor-gym"), gymNorth = find("gym-north"), partition = find("office-west");
assert.deepEqual([gymFloor.quantity, gymFloor.dimensions], [{ value: 6841.23, unit: "SF" }, { lengthFt: null, areaSf: 6841.23, perimeterFt: 335.96, heightFt: null, thicknessIn: null, volumeCy: null }], "Floor finish: area and perimeter (base run)");
assert.equal(gymFloor.quantity.value, Math.round(M.planArea(gymFloor.points) * 100) / 100);
assert.equal(M.planArea([...gymFloor.points].reverse()), M.planArea(gymFloor.points), "Either winding direction");
assert.deepEqual(gymNorth.quantity, { value: 1993.95, unit: "SF" }, "Wall counted by face area");
assert.deepEqual(gymNorth.dimensions, { lengthFt: 71.21, areaSf: 1993.95, perimeterFt: null, heightFt: 28, thicknessIn: 12, volumeCy: null }, "Wall: length, face area, height, thickness");
assert.deepEqual([partition.dimensions.thicknessIn, partition.specSection, partition.sources.map(s => s.sheet)], [4.88, "09 21 16", ["A1.1", "A8.1"]], "SA3.20 partition: 4 7/8 in., own source then assembly sources");
assert.deepEqual(find("door-105").quantity, { value: 1, unit: "EA" }, "A door counts as one opening");
assert.deepEqual(find("door-105").dimensions, { lengthFt: 2.97, areaSf: null, perimeterFt: null, heightFt: 7, thicknessIn: null, volumeCy: null }, "Opening width as traced, scheduled height");
const slab = find("slab-gym");
assert.deepEqual([slab.quantity, slab.dimensions.thicknessIn, slab.dimensions.areaSf], [{ value: 110.48, unit: "CY" }, 5, 7159.39], "Slab: concrete in CY");
assert.equal(Math.round(slab.dimensions.areaSf * 5 / 12 / 27 * 100) / 100, slab.quantity.value);
assert.equal(Math.abs(slab.base + slab.height - (gymFloor.base)) < 1e-9, true, "Slab top meets the floor finish base");
assert.deepEqual([find("girder-1").quantity, find("girder-1").level], [{ value: 71.21, unit: "LF" }, "roof"]);
assert.deepEqual([find("roof-gym").quantity, find("roof-gym").dimensions.thicknessIn, find("roof-gym").base], [{ value: 7159.39, unit: "SF" }, 6, 28]);
assert(find("roof-gym").properties.some(p => p.label === "Insulation" && /R-30/.test(p.value)), "Marcel's example: insulation R-value");
assert.deepEqual([find("duct-gym-supply").quantity, find("duct-gym-supply").dimensions.areaSf], [{ value: 62.83, unit: "LF" }, null], "Duct: length only");
assert.deepEqual([find("col-gw-n").shape, find("col-gw-n").dimensions.heightFt, find("ahu-1").depth, find("col-gw-n").depth], ["box", 28, 14, 10 / 12], "A box without a depth is square");
assert.throws(() => M.resolveObjects([{ ...systemElements[0], materialId: "nope" }], allMaterials), /no assembly nope/);
assert.throws(() => M.resolveObjects([{ ...systemElements.find(e => e.kind === "column"), kind: "column", materialId: "ductwork" }], allMaterials), /can't be counted in LF/);
assert.deepEqual([M.confidenceFor({ geometry: "traced", material: "documented" }), M.confidenceFor({ geometry: "traced", material: "illustrative" }), M.confidenceFor({ geometry: "illustrative", material: "documented" })], [0.75, 0.5, 0.25]);
// Evidence labels replace the percentage (Marcel, 7 Oct): review outranks basis; geometry before assembly.
const ev = (geometry, material, review) => M.evidenceFor({ basis: { geometry, material } }, review).level;
assert.deepEqual([ev("traced", "documented"), ev("traced", "illustrative"), ev("illustrative", "documented"), ev("illustrative", "illustrative")],
  ["documented", "assembly-unverified", "illustrative", "illustrative"]);
assert.deepEqual([ev("illustrative", "illustrative", "verified"), ev("traced", "documented", "flagged"), ev("traced", "documented", "unreviewed")], ["reviewed", "flagged", "documented"]);
assert(objects.every(o => { const e = M.evidenceFor(o); return e.label && e.detail && !/%/.test(e.label + e.detail); }), "Every object has an evidence label and no percentage");

// ── Interior phase 1: the A12.1 finish schedule, transitions, base, room finish schedule ──
assert.equal(new Set(finishScheduleRows.map(r => r.tag)).size, finishScheduleRows.length, "Schedule tags are unique");
assert(finishScheduleRows.every(r => /^\d\d \d\d \d\d$/.test(r.section) && r.sectionTitle && r.description && r.source.sheet === "A12.1"), "Rows carry the schedule heading and A12.1");
const floorTags = Object.fromEntries(objects.filter(o => o.kind === "floor").map(o => [o.materialId, [o.tag, o.baseTag, o.specSection]]));
assert.deepEqual(floorTags, {
  "gym-floor": ["FAF-01", "VWB-01", "09 67 00"], "entry-grille": ["WOG-01", null, "12 48 16"], "concrete": ["PLC-01", "WB-01", "03 33 00"], "carpet": ["CPT-01", "WB-01", "09 68 00"],
  "fitness-floor": ["RF-01", "WB-01", "09 65 00"], "tile": ["FT-01", "TB-01", "09 30 00"], "service-floor": ["SCE-01", null, "03 33 00"],
  "l2-floor": [null, null, null], "lvt-wood": ["LVT-01", "WB-01", "09 65 00"], "lvt-yellow": ["LVT-02", "WB-01", "09 65 00"], "lvt-green": ["LVT-03", "WB-01", "09 65 00"],
  "quarry-tile": ["QT-01", "TB-02", "09 30 00"], "stair-rubber": ["RF-02", null, "09 65 00"],
}, "Every floor finish: its A12.1 tag, base and section heading");
assert(objects.filter(o => o.tag).every(o => o.schedule?.tag === o.tag && o.specSection === o.schedule.section), "A scheduled object's section is the schedule's");
const prop = (o, label) => o.properties.find(p => p.label === label)?.value;
assert.deepEqual([prop(gymFloor, "Product"), prop(gymFloor, "Specification"), prop(gymFloor, "Base"), prop(gymFloor, "Size")],
  ["Polyturf Plus Pad + Pour", "09 67 00 Fluid applied flooring", "VWB-01, Vented wall base, Johnsonite, 47 Brown", undefined], "Schedule fields as properties; empty columns skipped");
assert.equal(prop(find("floor-family"), "Showers"), 'FT-02, 2" x 2" (not modeled)');
assert.equal(find("floor-vestibule").properties.some(p => p.label === "Base"), false, "No base where none is scheduled");
assert.throws(() => M.resolveObjects([interiorTransitions[0]], [{ ...transitionMaterials[0], id: transitionMaterials[1].id, tag: "TS-99" }], finishScheduleRows), /TS-99 is not on the finish schedule/);
assert.throws(() => M.resolveObjects([elements.find(e => e.id === "floor-gym")], materials, []), /FAF-01 is not on the finish schedule/, "Tags must be on the schedule");

const transitions = objects.filter(o => o.kind === "transition" && o.level === "L1");
assert.deepEqual(transitions.map(t => [t.id, t.tag, t.quantity.value, t.quantity.unit, t.room, t.adjoins]), [
  ["ts-gym-lobby-north", "TS-06", 5.96, "LF", "103", "102"], ["ts-gym-lobby-south", "TS-06", 5.95, "LF", "103", "102"],
  ["ts-office-105", "TS-04", 2.97, "LF", "105", "102"], ["ts-office-104", "TS-04", 2.97, "LF", "104", "102"], ["ts-fitness", "TS-06", 6.04, "LF", "106", "102B"],
], "Strips on the doors' traced openings, typed from A12.1");
assert(transitions.every(t => t.shape === "segment" && t.views.join() === "interior" && t.dimensions.lengthFt === t.quantity.value && t.dimensions.areaSf === null), "LF only, interior view");
assert.deepEqual(transitions.map(t => t.sources[1].detail), ["Transition detail E: concrete to fitness flooring", "Transition detail E: concrete to fitness flooring", "Transition detail A: carpet to concrete", "Transition detail A: carpet to concrete", "Transition detail E: concrete to fitness flooring"], "Each cites its A12.1 detail");
assert.deepEqual([transitions[0].confidence, prop(transitions[0], "Comments"), prop(transitions[0], "Between")], [0.75, "Concrete to gym floor", "103 Gym (FAF-01) / 102 Lobby (PLC-01)"]);
const strips = { "ts-gym-lobby-north": "103A", "ts-gym-lobby-south": "103B", "ts-office-105": "105", "ts-office-104": "104", "ts-fitness": "106",
  "ts2-activity": "215", "ts2-game": "213", "ts2-mpr-1": "210", "ts2-mpr-2": "211", "ts2-storage": "209", "ts2-office": "206", "ts2-toilet-203": "203", "ts2-toilet-204": "204", "ts2-toilet-205": "205", "ts2-kitchen": "208" };
for (const [strip, number] of Object.entries(strips)) assert.deepEqual(find(strip).points, find(`door-${number.toLowerCase()}`).points, `${strip}: on door ${number}'s traced opening`);

const schedule = M.roomFinishSchedule(objects);
assert.equal(schedule.length, 33, "One row per room with a floor zone: 16 on Level 01, 17 on Level 02");
const roomRow = (r) => schedule.find(x => x.room === r);
assert.deepEqual(roomRow("103"), {
  room: "103", level: "L1", floors: [{ id: "floor-gym", tag: "FAF-01", assembly: gymFloor.assembly, areaSf: 6841.23 }], areaSf: 6841.23,
  baseTags: ["VWB-01"], baseLf: 335.96, transitions: [{ id: "ts-gym-lobby-north", tag: "TS-06", lengthFt: 5.96, to: "102" }, { id: "ts-gym-lobby-south", tag: "TS-06", lengthFt: 5.95, to: "102" }],
  doors: 3, wallLf: roomRow("103").wallLf,
});
assert.deepEqual(roomRow("102").transitions.map(t => [t.id, t.to]), [["ts-gym-lobby-north", "103"], ["ts-gym-lobby-south", "103"], ["ts-office-105", "105"], ["ts-office-104", "104"]], "Both sides list the strip");
assert.deepEqual([roomRow("101").baseTags, roomRow("101").baseLf, roomRow("120").baseTags], [[], 0, []], "No base where none is scheduled");
assert.equal(roomRow("103").wallLf, Math.round(objects.filter(o => o.kind === "wall" && o.room === "103").reduce((s, o) => s + o.dimensions.lengthFt, 0) * 100) / 100);
assert(schedule.every((r, i) => i === 0 || schedule[i - 1].room < r.room), "Room order");
assert.equal(M.roomFinishSchedule(objects.filter(o => o.kind !== "floor")).length, 0, "Rooms come from floor finishes");

// ── Level 02 (A1.2): floors, walls, storefront, operable partitions, voids, labels, sheet transforms ──
const l2 = objects.filter(o => o.level === "L2");
assert.equal(l2.length, level2Elements.length + level2Transitions.length + doorInputs.filter(d => d.level === "L2").length + ceilingInputs.filter(c => c.level === "L2").length);
assert.deepEqual(Object.fromEntries(["floor", "wall", "glass", "transition"].map(k => [k, l2.filter(o => o.kind === k).length])), { floor: 19, wall: 32, glass: 3, transition: 12 });
assert.equal(l2.filter(o => o.kind === "door").length, 17);
assert(l2.filter(o => o.kind !== "ceiling").every(o => o.sources[0].sheet === (["floor", "transition"].includes(o.kind) ? "A12.3" : "A1.2") && o.caution.includes("A1.2")), "Walls cite A1.2; floors and strips cite A12.3, traced from A1.2");
assert(objects.filter(o => ["A1.2", "A12.3", "A3.2"].includes(o.sources[0].sheet)).every(o => o.level === "L2"), "…and only Level 02 objects do");
assert(l2.filter(o => o.kind === "floor").every(o => Math.abs(o.base + o.height - 14) < 1e-9), "Floors at 14 ft");
assert(l2.filter(o => !["floor", "ceiling"].includes(o.kind) && o.id !== "door-209a").every(o => o.base === 14), "Walls, storefront and doors stand on the second floor (209A sits on its counter)");
const operables = l2.filter(o => o.materialId === "operable-partition");
assert.deepEqual(operables.map(o => [o.id, o.quantity.unit, o.height, prop(o, "Height (A1.2)")]), [["l2-operable-activity", "LF", 10, "10'-0\" high"], ["l2-operable-mpr", "LF", 9 + 8 / 12, "9'-8\" high"]]);
assert(operables.every(o => o.quantity.value === o.dimensions.lengthFt && o.quantity.value > 15), "Counted by length");
assert.deepEqual([find("l2-guardrail").quantity.unit, find("l2-guardrail").height], ["LF", 3.5]);
assert(roomRow("200").areaSf > roomRow("201").areaSf, "Corridor bigger than the IT closet");
assert.deepEqual(M.filterObjects(objects, { level: "L2", kind: "glass" }).map(o => o.id), ["l2-game-storefront-west", "l2-game-storefront", "l2-mpr-storefront"]);

// ── Level 02 finishes (A12.3, resolved through A12.1) ──
const l2Rows = schedule.filter(r => r.level === "L2");
assert.deepEqual(Object.fromEntries(l2Rows.map(r => [r.room, [r.floors.map(f => f.tag).join(" + "), r.baseTags.join()]])), {
  "200": ["PLC-01", "WB-01"], "201": ["SCE-01", ""], "203": ["FT-01", "TB-01"], "204": ["FT-01", "TB-01"], "205": ["FT-01", "TB-01"], "206": ["", ""], "206A": ["", ""],
  "208": ["QT-01", "TB-02"], "209": ["LVT-01", "WB-01"], "210": ["LVT-01 + LVT-03", "WB-01"], "211": ["LVT-01", "WB-01"], "213": ["LVT-01 + LVT-02", "WB-01"],
  "215": ["LVT-01", "WB-01"], "217": ["SCE-01", ""], "218": ["SCE-01", ""], "221": ["SCE-01", ""], "S202": ["RF-02", ""],
}, "Each Level 02 room's floor tag(s) as read on A12.3, and the base A12.1 pairs with it");
assert.deepEqual([prop(find("l2-kitchen"), "Product"), prop(find("l2-kitchen"), "Base"), prop(find("l2-game-band"), "Color / finish"), prop(find("l2-stair-b"), "Comments")],
  ["Quarry Tile", "TB-02, Tile base, Daltile, Ashen grey, 5\" x 6\"", "A00712 Marigold", "Include black anti-slip nosing strip"], "A12.1 product, color and base");
// Unreadable or untagged stays explicit: no finish, the evidence as a property, illustrative.
for (const id of ["l2-office", "l2-closet"]) assert.deepEqual([find(id).tag, find(id).baseTag, find(id).basis.material, prop(find(id), "Finish")], [null, null, "illustrative", "Not tagged on A12.3"]);
assert.match(prop(find("l2-office"), "Finish plan (A12.3)"), /door mark reads RF.*doesn't say which product/);
assert.equal(prop(find("l2-closet"), "Finish plan (A12.3)"), "No floor tag, and no finish mark at its door.");
assert(["l2-it", "l2-mech", "l2-janitor"].every(id => /SLE \/ PLC.*no transition strip/.test(prop(find(id), "Finish plan (A12.3)"))), "Concrete-to-concrete doors: marked, but no strip");
assert.equal(find("l2-closet").room, "206A", "A1.2 and A12.3 number the closet 206A");

// Bands: A12.3's RF / RF line splits the room into two zones; the line is an open edge of both, with no base.
const edgeRun = (pts, open = []) => pts.reduce((sum, p, i) => open.includes(i) ? sum : sum + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0);
const r2 = v => Math.round(v * 100) / 100;
for (const [id, band, open] of [["l2-game", "l2-game-band", [2, 0]], ["l2-mpr-1", "l2-mpr-1-band", [3, 2]]]) {
  const edge = (pts, i) => [pts[i], pts[(i + 1) % pts.length]];
  const [a, b] = [find(id), find(band)], line = edge(a.points, open[0]);
  assert.deepEqual([b.room, edge(b.points, open[1])], [a.room, [...line].reverse()], `${band}: shares ${id}'s open edge`);
  assert.equal(a.dimensions.perimeterFt, r2(edgeRun(a.points) - Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1])), `${id}: base leaves the finish line out`);
  assert.equal(roomRow(a.room).baseLf, r2(a.dimensions.perimeterFt + b.dimensions.perimeterFt));
}
assert.equal(find("l2-game").dimensions.perimeterFt + find("l2-game-band").dimensions.perimeterFt, 105.8);
assert.deepEqual(level2Rooms.map(r => r.id).filter(id => id.endsWith("-band")), [], "Bands carry no label of their own");
assert.throws(() => M.resolveObjects([{ ...level2Elements.find(e => e.id === "l2-north"), openEdges: [0] }], allMaterials), /open edges must be edges of a floor/);
assert.throws(() => M.resolveObjects([{ ...elements.find(e => e.id === "floor-gym"), openEdges: [4] }], allMaterials, finishScheduleRows), /open edges must be edges of a floor/);

// Strips only where A12.3 marks a finish change, typed by the A12.1 detail for the pair.
const l2Strips = objects.filter(o => o.kind === "transition" && o.level === "L2");
assert.deepEqual(l2Strips.map(t => [t.id, t.tag, t.room, t.adjoins, t.sources[1].detail.slice(0, 19)]), [
  ["ts2-activity", "TS-02", "215", "200", "Transition detail B"], ["ts2-game", "TS-02", "213", "200", "Transition detail B"], ["ts2-game-band", "TS-07", "213", "213", "Transition detail F"],
  ["ts2-mpr-1", "TS-02", "210", "200", "Transition detail B"], ["ts2-mpr-1-band", "TS-07", "210", "210", "Transition detail F"], ["ts2-mpr-2", "TS-02", "211", "200", "Transition detail B"],
  ["ts2-storage", "TS-07", "209", "210", "Transition detail F"], ["ts2-office", "TS-02", "206", "200", "Transition detail B"],
  ["ts2-toilet-203", "TS-03", "203", "200", "Transition detail D"], ["ts2-toilet-204", "TS-03", "204", "200", "Transition detail D"], ["ts2-toilet-205", "TS-03", "205", "200", "Transition detail D"],
  ["ts2-kitchen", "TS-03", "208", "200", "Transition detail D"],
]);
assert(l2Strips.every(t => t.base === 14 && t.sources[0].sheet === "A12.3" && t.caution.includes("A12.3")), "At the second floor, citing A12.3");
const segDist = ([px, pz], [[ax, az], [bx, bz]]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - t * dx, pz - az - t * dz); };
const toZone = (p, room) => Math.min(...l2.filter(o => o.kind === "floor" && o.room === room).flatMap(z => z.points.map((q, i) => segDist(p, [q, z.points[(i + 1) % z.points.length]]))));
for (const t of l2Strips.filter(t => !t.id.endsWith("-band"))) {
  const mid = [(t.points[0][0] + t.points[1][0]) / 2, (t.points[0][1] + t.points[1][1]) / 2];
  assert(toZone(mid, t.room) < 1 && toZone(mid, t.adjoins) < 1, `${t.id}: on the line between ${t.room} and ${t.adjoins}`);
  assert(t.quantity.value > 2.7 && t.quantity.value < 3.3, `${t.id}: spans a 3 ft door opening (${t.quantity.value})`);
}
for (const [strip, zone, edge] of [["ts2-game-band", "l2-game", 2], ["ts2-mpr-1-band", "l2-mpr-1", 3]])
  assert.deepEqual([...find(strip).points].sort(), [find(zone).points[edge], find(zone).points[(edge + 1) % find(zone).points.length]].sort(), `${strip}: along the open edge`);
assert.deepEqual(roomRow("200").transitions.map(t => t.to), ["215", "213", "210", "211", "206", "203", "204", "205", "208"], "The corridor lists every door strip");
assert.deepEqual(roomRow("210").transitions.map(t => [t.tag, t.to]), [["TS-02", "200"], ["TS-07", "210"], ["TS-07", "209"]]);
assert.deepEqual(["201", "217", "218", "221", "S202", "206A"].map(r => roomRow(r).transitions.length), [0, 0, 0, 0, 0, 0], "No strip where A12.3 marks none or the pair has no detail");

// ── Doors: A8.2 schedule, 08 71 00 hardware, traced openings, counts ──
const nums = doorScheduleRows.map(r => r.number);
assert.equal(new Set(nums).size, 50, "50 door numbers on A8.2, none twice");
assert.deepEqual([nums.slice(0, 4), nums.slice(-4)], [["101A", "101B", "103A", "103B"], ["G102", "P101", "S102", "S202"]]);
const drow = n => doorScheduleRows.find(r => r.number === n);
assert.deepEqual(["101A", "101B", "115", "209A", "P101"].map(n => [drow(n).widthIn, drow(n).heightIn, drow(n).thicknessIn]), [[36, 118.75, 1.75], [36, 96.375, 1.75], [30, 84, 1.75], [null, null, null], [48, 84, 1.75]], "Sizes parsed as printed");
assert.deepEqual([drow("219").fireRating, doorScheduleRows.filter(r => r.fireRating).length, drow("209A").panels, drow("209A").comments], ["45 MIN", 1, null, "4'0\" high by 8'-0\" wide coiling counter door"]);
assert(doorScheduleRows.every(r => r.glass === "" && r.source.sheet === "A8.2" && r.source.page === 65), "The glazing column is blank on every row");
assert(doorScheduleRows.every(r => !r.panelType || doorPanelTypes[r.panelType] || r.panelType === "ELEV"), "Panel types from the A8.2 legend");
assert.deepEqual([drow("G101").panelTypeName, drow("104").panelTypeName], ["Not in the A8.2 panel type legend", "Narrow lite glass"]);
// Hardware: the manual's sets as stated.
assert.deepEqual([hardwareSets.length, hardwareSets.reduce((n, s) => n + s.items.length, 0), new Set(hardwareSets.map(s => s.number)).size], [32, 239, 32]);
assert(hardwareSets.every(s => s.source.sheet === "08 71 00" && s.source.page >= 386 && s.source.page <= 396 && s.items.every(i => i.qty > 0 && i.item)), "Every set and line cites 08 71 00");
assert(hardwareSets.flatMap(s => s.items).every(i => (!i.manufacturer || hardwareManufacturers[i.manufacturer]) && (!i.finish || hardwareFinishes[i.finish] || i.finish === "US32D")), "Codes from the section's own lists");
assert.deepEqual(hardwareSets.find(s => s.number === "920").items.map(i => [i.qty, i.item]), [[3, "Hinge"], [1, "Mortise Lock"], [1, "Door Closer"], [1, "Protection Plate"], [1, "Protection Plate"], [1, "Wall Stop"], [3, "Silencer"]]);
assert.deepEqual(hardwareSets.find(s => s.number === "920").doors, ["109", "113", "203", "204", "205"]);
assert.match(hardwareSets.find(s => s.number === "100").notes[0], /^Doors normally closed, latched, and secure\./);
// A8.2 against the manual, door by door: conflicts kept, never aliased.
const hw = Object.fromEntries(doorScheduleRows.map(r => [r.number, M.doorHardware(r.number, r.hardwareSet, hardwareSets)]));
assert.deepEqual(Object.fromEntries(Object.entries(hw).filter(([, h]) => h.status !== "match").map(([n, h]) => [n, [h.status, h.drawingSet, h.manualSets.join("/")]])), {
  "101A": ["different-set", "101", "100"], "106": ["different-set", "800", "500"], "110B": ["in-several-sets", "300", "300/480"], "117A": ["different-set", "900", "910"],
  "118A": ["different-set", "360", "350"], "119A": ["not-in-manual", "800", ""], "120": ["not-in-manual", "650", ""], "206A": ["not-in-manual", "600", ""],
}, "Eight A8.2 / manual conflicts, as found");
assert.deepEqual(Object.entries(hw).filter(([, h]) => !h.drawingSetInManual).map(([n]) => n), ["101A"], "Only 101A's A8.2 set (101) isn't in the manual");
assert.deepEqual([hw["106"].sets.map(s => s.number), hw["110B"].sets.map(s => s.number), hw["119A"].sets.map(s => s.number)], [["500", "800"], ["300", "480"], ["800"]], "Both sides' sets are attached");
assert.deepEqual(M.hardwareDoorsNotOnSchedule(doorScheduleRows, hardwareSets), [{ door: "120A", set: "650" }, { door: "119B", set: "800" }], "Manual-only door numbers kept as they are");
// Traced vs schedule-only.
const traced = doorTraces.map(t => t.number), only = scheduleOnlyDoors.map(d => d.number);
assert.deepEqual([traced.length, doorTraces.filter(t => t.level === "L1").length, doorTraces.filter(t => t.level === "L2").length, only], [46, 29, 17, ["G101", "G102", "P101", "S102"]]);
assert.deepEqual([...traced, ...only].sort(), [...nums].sort(), "Every A8.2 door is traced or listed as schedule-only, once");
assert.deepEqual(doorTraces.filter(t => t.note).map(t => t.number), ["112", "115", "119A", "209A", "213"], "Doors read by hand say so");
assert.deepEqual(M.doorCounts(doorScheduleRows, objects), { openings: { scheduled: 50, modeled: 46, scheduleOnly: 4 }, leaves: { scheduled: 59, modeled: 55, scheduleOnly: 4 } }, "A pair is one opening, two leaves; 209A has none");
// Door objects: one per traced opening, leaves as drawn, schedule height, checks against the schedule.
const doorObjs = objects.filter(o => o.door);
assert.deepEqual([doorObjs.length, objects.filter(o => o.kind === "door").length, new Set(doorObjs.map(o => o.door.row.number)).size], [46, 46, 46]);
for (const d of doorObjs) {
  const r = d.door.row;
  assert.deepEqual([d.id, d.quantity, d.door.leaves.length, d.views], [`door-${r.number.toLowerCase()}`, { value: 1, unit: "EA" }, r.panels ?? 0, ["interior"]]);
  assert(d.door.leaves.every(l => Math.min(...d.points.map(p => Math.hypot(p[0] - l.hinge[0], p[1] - l.hinge[1]))) < 0.25), `${d.id}: hinged at a jamb`);
  assert.equal(d.door.openingFt, d.dimensions.lengthFt);
  if (r.panels !== null) {
    assert.deepEqual([d.height, d.base, d.door.widthCheck.toleranceFt], [r.heightIn / 12, d.level === "L2" ? 14 : 0, DOOR_WIDTH_TOLERANCE_FT]);
    assert(d.door.widthCheck.within && Math.abs(d.door.widthCheck.openingDeltaFt) <= 0.25 && d.door.widthCheck.leafDeltaFt <= 0.25, `${d.id}: within 3 in. of A8.2`);
  }
  assert.equal(d.materialId, r.frameType === "6" ? "door-coiling" : { HM: "door-hm", WD: "door-wd", ALUM: "door-alum" }[r.material]);
  assert.deepEqual(d.door.hardware, hw[r.number]);
}
assert.deepEqual(Object.fromEntries(doorObjs.filter(d => Math.abs(d.door.widthCheck.openingDeltaFt ?? 0) > 0.1).map(d => [d.door.row.number, d.door.widthCheck.openingDeltaFt])), { "103C": 0.19, "103D": 0.17, "118B": 0.12 }, "Largest differences from the schedule, all within tolerance");
const coil = find("door-209a");
assert.deepEqual([coil.door.scheduledFt, coil.door.widthCheck.within, coil.door.openingFt, coil.base, coil.height, coil.materialId, coil.specSection], [null, null, 7.96, 17, 4, "door-coiling", "08 33 13"], "209A: 4 ft high over a 3 ft counter, no panels to check");
assert.deepEqual(["Door", "Panels", "Panel size", "Glass", "Panel type", "Frame", "Hardware set (A8.2)"].map(l => prop(find("door-219"), l)), ["219", "2", "3' - 0\" x 7' - 0\" x 1 3/4\"", "Not scheduled", "F - Flush panel", "HM, type 1", "800"]);
assert.equal(prop(find("door-219"), "Fire rating"), "45 MIN");
assert.deepEqual(doorMaterials.map(m => [m.id, m.specSection, m.sources[1].page]), [["door-hm", "08 11 13", 336], ["door-wd", "08 14 16", 345], ["door-alum", "08 41 13", 361], ["door-coiling", "08 33 13", 354]], "Sections confirmed in the manual");
// A width outside tolerance resolves as traced, flagged; structural problems throw.
const d203 = doorInputs.find(d => d.doorNumber === "203");
const wide = M.resolveObjects([{ ...d203, points: [d203.points[0], [d203.points[0][0] + 4, d203.points[0][1]]] }], allMaterials, [], undefined, doorSchedule)[0];
assert.deepEqual([wide.door.widthCheck.within, wide.door.widthCheck.openingDeltaFt, wide.points[1][0] - wide.points[0][0]], [false, 1, 4], "Not moved to fit: flagged");
const [h203, t203] = d203.leaves[0], short = [h203, [h203[0] + (t203[0] - h203[0]) * 2 / 3, h203[1] + (t203[1] - h203[1]) * 2 / 3]];
const shortLeaf = M.resolveObjects([{ ...d203, leaves: [short] }], allMaterials, [], undefined, doorSchedule)[0].door.widthCheck;
assert.deepEqual([shortLeaf.within, Math.abs(shortLeaf.openingDeltaFt) <= 0.25, shortLeaf.leafDeltaFt > 0.9], [false, true, true], "A leaf off the schedule is flagged even when the opening fits");
assert.throws(() => M.resolveObjects([{ ...d203, doorNumber: "999" }], allMaterials, [], undefined, doorSchedule), /door 999 is not on the door schedule/);
assert.throws(() => M.resolveObjects([{ ...d203, leaves: [...d203.leaves, d203.leaves[0]] }], allMaterials, [], undefined, doorSchedule), /2 leaves drawn, door 203 has 1 panels/);
assert.throws(() => M.resolveObjects([{ ...d203, leaves: [[[0, 0], d203.leaves[0][1]]] }], allMaterials, [], undefined, doorSchedule), /a leaf is not hinged at a jamb/);
assert.throws(() => M.resolveObjects([{ ...d203, doorNumber: undefined }], allMaterials, [], undefined, doorSchedule), /leaves without a door number/);
assert.throws(() => M.resolveObjects([{ ...elements.find(e => e.id === "gym-north"), doorNumber: "105" }], allMaterials, [], undefined, doorSchedule), /a door number on a wall/);
// Rooms from the floor zones either side; a side with no zone stays null.
assert.equal(doorAssociations.length, 46);
const assoc = Object.fromEntries(doorAssociations.map(a => [a.number, [a.swingSide, a.otherSide]]));
assert.deepEqual([assoc["203"], assoc["219"], assoc["209A"], assoc["105"], assoc["103A"], assoc["S202"]], [["203", "200"], ["218", "200"], ["208", "210"], ["105", "102"], ["102", "103"], ["S202", "200"]]);
assert.deepEqual(doorAssociations.filter(a => !a.swingSide && !a.otherSide).map(a => a.number), ["110B", "115", "118B"], "No traced floor zone on either side");
assert(doorObjs.every(d => d.room === (assoc[d.door.row.number][0] ?? assoc[d.door.row.number][1])), "A door's room is its swing side");
assert.deepEqual(roomRow("200").doors, 4, "Corridor 200: the four doors that swing into it (210, 211, 213, 215)");

// ── Ceilings: A3.1 / A3.2 zones, printed tags, heights, elevations, coverage ──
const ceilings = objects.filter(o => o.kind === "ceiling");
assert.deepEqual([ceilings.length, ceilings.filter(o => o.level === "L1").length, ceilings.filter(o => o.level === "L2").length], [53, 29, 24], "Zones by level");
assert(ceilings.every(o => o.ceiling && o.shape === "polygon" && o.quantity.unit === "SF" && o.views.join() === "interior" && o.division === "09"), "Each zone: a polygon counted in SF");
assert(objects.filter(o => o.kind !== "ceiling").every(o => o.ceiling === null), "Only ceilings carry a ceiling record");
const ceilingCount = (level, status) => ceilings.filter(o => o.level === level && o.ceiling.status === status).map(o => o.id);
assert.deepEqual([ceilingCount("L1", "tagged").length, ceilingCount("L1", "height-unresolved"), ceilingCount("L1", "untagged"), ceilingCount("L2", "tagged").length, ceilingCount("L2", "height-unresolved"), ceilingCount("L2", "untagged")],
  [26, ["ceil-l1-117a-4"], ["ceil-l1-116a-4", "ceil-l1-unnumbered-2"], 23, [], ["ceil-l2-208-3"]], "Tagged, height-unresolved and untagged zones");
// Heights above the floor and absolute elevations, kept apart.
for (const o of ceilings) {
  const c = o.ceiling, floor = o.level === "L2" ? 14 : 0;
  if (c.heightText === null) { assert.deepEqual([c.heightAffFt, c.elevationFt, o.base], [null, null, floor], `${o.id}: no height, no elevation`); continue; }
  assert.equal(c.heightAffFt, M.parseFeetInches(c.heightText));
  assert(Math.abs(c.elevationFt - (floor + c.heightAffFt)) < 1e-9 && Math.abs(o.base - c.elevationFt) < 1e-9, `${o.id}: elevation = level + height`);
}
assert.deepEqual(["9' - 0\"", "10' - 10\"", "7' - 10\"", "8' - 6\"", "9'-0\"", "9 ft"].map(M.parseFeetInches), [9, 10 + 10 / 12, 7 + 10 / 12, 8.5, null, null]);
assert.deepEqual([find("ceil-l2-213-4").ceiling.heightAffFt, find("ceil-l2-213-4").ceiling.elevationFt, find("ceil-l1-103a-1").ceiling.elevationFt, find("ceil-l1-120-1").ceiling.heightText], [9 + 5 / 12, 14 + (9 + 5 / 12), 14, "10' - 10\""]);
assert.deepEqual([...new Set(ceilings.filter(o => o.level === "L2" && o.ceiling.heightText).map(o => o.ceiling.heightText))].sort(), ["10' - 0\"", "7' - 6\"", "8' - 0\"", "8' - 6\"", "9' - 0\"", "9' - 5\"", "9' - 8\""]);
// Walls are untouched: same heights as their inputs, nothing capped at a ceiling.
const wallInputs = [...elements, ...level2Elements].filter(e => e.kind === "wall");
for (const w of wallInputs) assert.equal(find(w.id).height, w.height, `${w.id}: wall height unchanged by ceilings`);
const noCeilings = M.resolveObjects([...elements, ...level2Elements], allMaterials, finishScheduleRows, partitionSchedule);
assert.deepEqual(noCeilings.filter(o => o.kind === "wall").map(o => [o.id, o.height, o.base, o.quantity.value]), objects.filter(o => o.kind === "wall" && wallInputs.some(w => w.id === o.id)).map(o => [o.id, o.height, o.base, o.quantity.value]), "Walls resolve the same with or without ceilings");
assert(ceilings.some(o => o.level === "L1" && o.ceiling.elevationFt < 14 && objects.some(w => w.kind === "wall" && w.level === "L1" && w.room === o.room && w.height >= 14)), "Walls stand taller than the ceilings beside them");
// Printed tags vs interpreted schedule links; conflicts kept.
assert.deepEqual(ceilingTypes.map(t => [t.tag, t.legend, t.scheduleLink?.tag ?? null]), [["APC-1", "ACP-1 (2X2)", "ACP-01"], ["APC-2", "ACP-2 (4X4)", "ACP-02"], ["GWB-1", "Painted gypsum board", null], ["MPC", "MPC - metal panel ceiling (wd. look)", null], ["PSM-1", null, null]]);
assert(ceilings.filter(o => o.ceiling.tag === "APC-1").every(o => o.tag === "ACP-01" && o.schedule.tag === "ACP-01" && prop(o, "Ceiling tag (plan)") === "APC-1"), "Printed APC-1 kept; ACP-01 is the interpreted link");
const kitchenCeiling = find("ceil-l2-208-1");
assert.deepEqual([kitchenCeiling.ceiling.tag, kitchenCeiling.tag, kitchenCeiling.schedule.size, kitchenCeiling.ceiling.type.legend], ["APC-2", "ACP-02", "2x2", "ACP-2 (4X4)"], "Kitchen: 4x4 legend vs 2x2 schedule, both kept");
assert(kitchenCeiling.properties.some(p => p.label === "Source conflict" && /4x4.*2x2.*Not resolved/.test(p.value)), "The conflict is shown, not resolved");
assert.deepEqual(["MPC", "PSM-1"].map(t => [ceilingTypes.find(c => c.tag === t).scheduleLink, ceilingTypes.find(c => c.tag === t).conflicts.some(x => /unscheduled/.test(x))]), [[null, true], [null, true]], "MPC and PSM-1 unscheduled");
assert(ceilings.filter(o => o.ceiling.tag === "MPC").every(o => o.tag === null && o.basis.material === "illustrative"));
// Paint: tagged where the plan tags it; otherwise PT-05, color TBD.
assert.deepEqual(ceilings.filter(o => o.ceiling.paint?.basis === "tagged").map(o => [o.id, o.ceiling.paint.tag]), [["ceil-l2-215-2", "PT-08"], ["ceil-l2-213-2", "PT-08"], ["ceil-l2-213-3", "PT-01"], ["ceil-l2-213-4", "PT-08"]]);
assert(ceilings.filter(o => o.ceiling.tag === "GWB-1" && o.ceiling.paint.basis !== "tagged").every(o => o.ceiling.paint.tag === "PT-05"));
assert(ceilings.filter(o => o.ceiling.tag !== "GWB-1").every(o => o.ceiling.paint === null), "Only gypsum board is painted");
assert.equal(finishScheduleRows.find(r => r.tag === "PT-05").color, "Color TBD; flat finish");
// Perimeter: the gross zone boundary.
for (const o of ceilings) assert.equal(o.dimensions.perimeterFt, Math.round(o.points.reduce((a, p, i) => a + Math.hypot(o.points[(i + 1) % o.points.length][0] - p[0], o.points[(i + 1) % o.points.length][1] - p[1]), 0) * 100) / 100, `${o.id}: gross boundary`);
// Sub-zones: valid, separate (no zone's middle inside another on its level), each room's total adds up.
const zoneMid = z => [z.points.reduce((a, p) => a + p[0], 0) / z.points.length, z.points.reduce((a, p) => a + p[1], 0) / z.points.length];
for (const a of ceilings) assert(ceilings.filter(b => b !== a && b.level === a.level).every(b => !contains(b.points, zoneMid(a)) || !contains(a.points, zoneMid(a))), `${a.id}: not inside another zone`);
const ceilingRows = M.roomCeilingSchedule(objects);
assert.equal(ceilingRows.length, 34);
assert.deepEqual(ceilingRows.find(r => r.level === "L2" && r.room === "213").zones.map(z => [z.tag, z.heightText]), [["APC-1", "10' - 0\""], ["GWB-1", "7' - 6\""], ["GWB-1", "9' - 0\""], ["GWB-1", "9' - 5\""]]);
for (const r of ceilingRows) assert.equal(r.areaSf, Math.round(r.zones.reduce((a, z) => a + z.areaSf, 0) * 100) / 100);
assert.deepEqual(ceilingRows.filter(r => r.unresolved).map(r => `${r.level} ${r.room}`), ["L1 null", "L1 116A", "L1 117A", "L2 208"], "Rooms with an unresolved zone (null: no room number on the plan)");
assert(ceilingZones.filter(z => z.outline === "traced").every(z => z.note), "A traced zone says why");
assert.deepEqual(ceilingZones.filter(z => z.outline === "traced").map(z => z.id), ["ceil-l1-104-1", "ceil-l1-unnumbered-1", "ceil-l2-200-4", "ceil-l2-205-1", "ceil-l2-215-2", "ceil-l2-213-2", "ceil-l2-213-3"]);
// Coverage: rooms with no ceiling and tags with no zone stay explicit.
assert.deepEqual(roomsWithoutCeiling.map(r => `${r.level} ${r.room}`), ["L1 102", "L1 103", "L1 102A", "L1 112", "L1 114", "L1 115", "L1 118", "L1 119A", "L1 S101", "L1 S102", "L2 201", "L2 207", "L2 217", "L2 218", "L2 221"]);
assert(roomsWithoutCeiling.every(r => !ceilings.some(o => o.level === r.level && o.room === r.room)), "No zone in a room listed without a ceiling");
assert.deepEqual(unplacedCeilingTags.map(t => t.tag), ["GWB-1", "GWB-1", "GWB-1", "PSM-1", "MPC"]);
assert(!ceilings.some(o => o.ceiling.tag === "PSM-1") && !ceilings.some(o => o.ceiling.heightText === "13' - 0\""), "PSM-1 and the outdoor canopy have no zone");
// resolveObjects refuses a bad ceiling record.
const zIn = ceilingInputs.find(z => z.id === "ceil-l1-105-1");
const resolveCeiling = patch => M.resolveObjects([{ ...zIn, ...patch }], allMaterials, finishScheduleRows, partitionSchedule, doorSchedule, ceilingSchedule);
assert.throws(() => resolveCeiling({ ceiling: { ...zIn.ceiling, tag: "ACP-1" } }), /ceiling tag ACP-1 is not a ceiling type/);
assert.throws(() => resolveCeiling({ ceiling: { ...zIn.ceiling, height: "9 ft" } }), /can't read the height "9 ft"/);
assert.throws(() => resolveCeiling({ ceiling: { ...zIn.ceiling, status: "untagged" } }), /status untagged doesn't match/);
assert.throws(() => resolveCeiling({ ceiling: { ...zIn.ceiling, height: null } }), /status tagged doesn't match/);
assert.throws(() => resolveCeiling({ ceiling: undefined }), /a ceiling zone without its tag record/);
assert.throws(() => resolveCeiling({ points: [zIn.points[0], zIn.points[0], zIn.points[0]] }), /a ceiling zone with no area/);
assert.throws(() => M.resolveObjects([{ ...elements.find(e => e.id === "gym-north"), ceiling: zIn.ceiling }], allMaterials), /a ceiling tag on a wall/);
// Source transforms: A3.1 / A3.2, measured offsets, same scale.
assert.deepEqual([RCP_OFFSETS["A3.1"], RCP_OFFSETS["A3.2"]], [[-35.2, 12.8], [-37.6, 11.2]]);
assert(ceilings.every(o => o.sources[0].sheet === (o.level === "L2" ? "A3.2" : "A3.1") && sheetTransformFor(o.sources[0].sheet).levels.includes(o.level)), "Each zone cites its level's RCP, which has a transform");
assert.deepEqual(ceilingMaterials.map(m => [m.id, m.tag ?? null, m.specSection]), [["ceiling-apc-1", "ACP-01", "09 51 00"], ["ceiling-apc-2", "ACP-02", "09 51 00"], ["ceiling-gwb-1", null, "09 29 00"], ["ceiling-mpc", null, null], ["ceiling-untagged", null, null]]);

// ── Wall finishes: plan tags, elevations, faces, bands, accent bases ──
const point = ([x, y]) => [(x - planTransform.origin[0]) * planTransform.feetPerPixel, (y - planTransform.origin[1]) * planTransform.feetPerPixel];
const wf = wallFinishRecords, wfById = id => wf.find(r => r.id === id);
const statusCount = level => Object.fromEntries(["assigned", "face-unresolved", "extent-unresolved", "wall-not-traced", "graphic"].map(st => [st, wf.filter(r => r.level === level && r.status === st).length]));
assert.deepEqual([wf.length, new Set(wf.map(r => r.id)).size, statusCount("L1"), statusCount("L2")],
  [50, 50, { assigned: 10, "face-unresolved": 6, "extent-unresolved": 0, "wall-not-traced": 14, graphic: 3 }, { assigned: 12, "face-unresolved": 0, "extent-unresolved": 1, "wall-not-traced": 3, graphic: 1 }], "Records by level and status");
// Faces: on traced walls only, never glazing; the finished side comes from the evidence.
for (const r of wf) for (const id of r.wallIds) assert.equal(find(id).kind, "wall", `${r.id}: ${id} is a wall`);
assert(!wf.some(r => r.wallIds.some(id => /storefront|glass/.test(find(id).materialId))), "No face on storefront");
for (const r of wf.filter(r => r.status === "assigned" && r.level === "L2")) assert(objects.some(o => o.kind === "floor" && o.room === r.room && contains(o.points, r.toward)), `${r.id}: the finished side is in room ${r.room}`);
assert.deepEqual(["fitness-west", "l2-toilets", "l2-yard-south"].map(id => wallFinishFaces.filter(f => f.wallId === id).map(f => [f.side, f.rooms.join()])),
  [[["left", "102"], ["right", "106"]], [["left", "203"], ["right", "204"]], [["left", "203,204"], ["right", ""]]], "Two faces per wall, each with its own evidence");
const faceCount = level => { const f = wallFinishFaces.filter(x => x.level === level); return [f.length, f.filter(x => x.status === "noted").length]; };
assert.deepEqual([faceCount("L1"), faceCount("L2")], [[80, 21], [64, 15]], "Faces noted vs not noted, by level");
assert(wallFinishFaces.filter(f => f.status === "not noted").every(f => f.rooms.length === 0 && f.recordIds.length === 0), "Not-noted faces carry no room and no finish");
// Extents and lengths.
assert.deepEqual(["wf-l1-105-west", "wf-l1-104-east", "wf-l1-103-north", "wf-l2-206-east", "wf-l2-210-west", "wf-l2-208-west", "wf-l2-203-north"].map(id => wfById(id).lengthFt), [17.04, 17.59, 71.21, 11.03, 15.17, 26.11, 6.84]);
assert(wf.every(r => (r.status === "assigned") === (r.extent !== null) && (r.lengthFt === null) === (r.extent === null)), "Only assigned faces have an extent and a length");
// Bands: tile below paint; areas only where height and run are both dimensioned.
assert.deepEqual(wfById("wf-l2-203-north").bands.map(b => [b.tags.join("+"), b.from, b.to, b.heightFt, b.areaSf]), [["WT-01", "4\"", "7' - 4\"", 7, 47.88], ["PT-02", "7' - 4\"", null, null, null]], "Tile below paint on one face");
assert.deepEqual(wfById("wf-l1-117a-west").bands.map(b => [b.tags.join("+"), b.heightFt, b.areaSf]), [["WT-01+WT-02", 7, null], ["PT-02", null, null]], "Untraced wall: heights kept, no area");
assert.deepEqual(wf.flatMap(r => r.bands.filter(b => b.areaSf !== null).map(b => [r.id, b.tags.join("+"), b.areaSf])), [
  ["wf-l1-106-west", "MR-01", 52], ["wf-l1-106-east", "MR-01", 104], ["wf-l2-208-west", "FRP-01", 206.67], ["wf-l2-208-north", "FRP-01", 112.67],
  ["wf-l2-203-north", "WT-01", 47.88], ["wf-l2-204-north", "WT-01", 56.7], ["wf-l2-205-north", "WT-01", 61.6]], "Areas only from dimensioned heights and runs");
assert(wf.flatMap(r => r.bands).every(b => b.areaSf === null || b.heightFt !== null), "No area without a height");
assert(wf.flatMap(r => r.bands).filter(b => b.width === null && !b.fullRun).every(b => b.areaSf === null), "A partial band without a printed width has no area");
// Every tag is on A12.1; excluded tags stay out of faces.
const wfTags = new Set(wf.flatMap(r => [...r.bands.flatMap(b => b.tags), ...(r.base?.tag ? [r.base.tag] : [])]));
assert([...wfTags, ...excludedFinishTags.map(t => t.tag).filter(t => !["PL-04", "SSM-01"].includes(t))].every(t => finishScheduleRows.some(r => r.tag === t)), "Every tag is on A12.1");
assert.deepEqual(excludedFinishTags.map(t => [t.level, t.tag, t.count]), [["L1", "PT-07", 4], ["L1", "WF-01", 1], ["L1", "WF-01", 3], ["L1", "CGD-01", 4], ["L2", "CGD-01", 4], ["L2", "PL-04", 2], ["L2", "SSM-01", 2]]);
assert(!wfTags.has("PT-01"), "No field paint assumed on any face");
assert(excludedFinishTags.every(t => !wfTags.has(t.tag)), "Column, glazing, accessory and casework tags aren't on any face");
assert.deepEqual(finishScheduleRows.find(r => r.tag === "WB-02").comments, "Cove base at hard, straight base at carpet; at PT-02 locations");
// Conflicts and gaps stay explicit.
assert(wf.filter(r => r.base?.tag === "WT-01").every(r => r.conflicts.some(c => /TB-01/.test(c))), "Tile base vs TB-01 kept");
assert(["north", "west", "south", "east"].every(d => wfById(`wf-l1-103-${d}`).conflicts.length === 2), "Gym: WB-02 vs VWB-01 and pad height kept");
assert(["wf-l2-215-niche", "wf-l2-213-niche"].every(id => wfById(id).bands.map(b => b.tags[0]).join() === "PT-02,PT-03" && wfById(id).conflicts.some(c => /PT-02.*PT-03/.test(c))), "Plan PT-02 vs elevation PT-03, both listed");
assert(["wf-l2-203-north", "wf-l2-205-north"].every(id => wfById(id).conflicts.some(c => /views 18 and 24/.test(c))), "A10.3 title swap recorded");
assert(wallFinishGaps.some(g => /room finish schedule/.test(g)) && wallFinishGaps.some(g => /never by a sheet transform/.test(g)));
// Sources: A10.x and A2.x are cited, never transformed.
const wfSheets = new Set(wf.flatMap(r => r.evidence.map(e => e.sheet)));
assert.deepEqual([...wfSheets].sort(), ["A10.1", "A10.2", "A10.3", "A10.4", "A10.5", "A12.2", "A12.3", "A2.1", "A2.2"]);
assert(["A10.1", "A10.2", "A10.3", "A10.4", "A10.5", "A2.1", "A2.2"].every(sh => sheetTransformFor(sh) === null), "No sheet transform for elevations or enlarged plans");
assert(wf.flatMap(r => r.evidence).every(e => existsSync(new URL(`../public${e.asset}`, import.meta.url))), "Every evidence sheet image exists");
// Accent bases: split only along supported runs; gross totals unchanged.
assert.deepEqual(wallBaseBreakdown.filter(b => b.accents.length).map(b => [b.floorId, b.grossLf, b.field.lf, b.accents.map(a => `${a.tag} ${a.lf}`).join()]),
  [["floor-office-105", 76.24, 59.2, "WB-02 17.04"], ["floor-office-104", 67.58, 49.99, "WB-02 17.59"], ["l2-mpr-1-band", 41.57, 26.4, "WB-03 15.17"]]);
for (const b of wallBaseBreakdown) {
  const floor = find(b.floorId);
  assert.deepEqual([b.grossLf, b.field.tag], [floor.dimensions.perimeterFt, floor.baseTag], `${b.floorId}: gross and field base from the floor`);
  assert(Math.abs(b.field.lf + b.accents.reduce((a, x) => a + x.lf, 0) - b.grossLf) < 0.011, `${b.floorId}: parts add up to the gross run`);
}
assert.equal(wallBaseBreakdown.length, objects.filter(o => o.kind === "floor" && o.baseTag).length);
assert(wallBaseBreakdown.filter(b => b.field.tag !== "WB-01").every(b => b.accents.length === 0), "Gym VWB-01 and tile bases aren't split");
assert.deepEqual(wallBaseBreakdown.find(b => b.floorId === "floor-fitness").accents, [], "A partial WB-03 (no width) doesn't split");
const fakeRun = (id, level, room, extent) => ({ ...wfById("wf-l2-210-west"), id, level, room, extent: extent.map(point) });
const splitOf = (run, floorId) => M.baseBreakdown(objects, [run]).find(x => x.floorId === floorId).accents;
assert.deepEqual(splitOf(fakeRun("fake-open-edge", "L2", "210", [[1463.4, 1129.8], [1520.9, 1263.8]]), "l2-mpr-1-band"), [], "No base along a finish line inside a room");
assert.deepEqual(splitOf(fakeRun("fake-angled", "L1", "105", [[1062, 1060], [1072, 1080]]), "floor-office-105"), [], "No base split from a run that crosses an edge");
assert.deepEqual(splitOf(fakeRun("fake-along", "L1", "105", [[1067, 1020], [1067, 1060]]), "floor-office-105").map(a => a.lf), [5.59], "A run along the edge splits its length");
// resolveWallFinishes refuses what the sources don't support.
const wIn = wallFinishData.find(d => d.id === "wf-l2-206-east");
const asFeet = d => ({ ...d, toward: d.toward && point(d.toward), extent: d.extent && d.extent.map(point) });
const resolveWf = patch => M.resolveWallFinishes([asFeet({ ...wIn, ...patch })], objects, finishScheduleRows);
assert.equal(resolveWf({})[0].lengthFt, 11.03);
assert.throws(() => resolveWf({ wallIds: ["l2-mpr-storefront"] }), /is a glass, not a wall face/);
assert.throws(() => resolveWf({ extent: [[1417, 1001], [1440, 1080]] }), /is not on its wall/);
assert.throws(() => resolveWf({ bands: [{ ...wIn.bands[0], tags: ["PT-09"] }] }), /PT-09 is not on the finish schedule/);
assert.throws(() => resolveWf({ status: "wall-not-traced" }), /status wall-not-traced with 1 traced walls/);
assert.throws(() => resolveWf({ extent: null }), /an extent only and always on an assigned face/);
assert.throws(() => resolveWf({ toward: [1417, 1040] }), /the finished side lies on l2-elevator-west/);
assert.throws(() => resolveWf({ bands: [{ ...wIn.bands[0], height: "8 ft" }] }), /can't read "8 ft"/);
// Walls and model objects are untouched by wall finishes.
assert.deepEqual(M.parseFeetInches("4\""), 4 / 12);
assert.equal(objects.length, elements.length + interiorTransitions.length + level2Elements.length + level2Transitions.length + doorInputs.length + ceilingInputs.length + systemElements.length, "No objects added for finishes");

// Voids: no Level 02 floor sits in a double-height volume.
assert.deepEqual(planVoids.map(v => [v.id, v.level]), [["void-gym", "L2"], ["void-yard", "L2"], ["void-lobby", "L2"]]);
assert.deepEqual(planVoids.find(v => v.id === "void-gym").points.map(p => toSheetPoint("A1.2", p).map(Math.round)), [[460, 725], [970, 725], [970, 1445], [460, 1445]], "The gym void is the gym's footprint");
for (const f of l2.filter(o => o.kind === "floor")) {
  const c = [f.points.reduce((a, p) => a + p[0], 0) / f.points.length, f.points.reduce((a, p) => a + p[1], 0) / f.points.length];
  assert(planVoids.every(v => !contains(v.points, c)), `${f.id}: not over a void`);
}
assert(contains(planVoids[0].points, rooms.find(r => r.id === "gym").center), "The gym is open to Level 02");
const lobbyVoid = planVoids.find(v => v.id === "void-lobby").points, rail = find("l2-guardrail").points;
assert.deepEqual(rail.map(p => toSheetPoint("A1.2", p).map(Math.round)), [[1072, 1141], [1275, 1141]], "Guardrail on the lobby opening's edge (A1.2 rail, A12.3 grey)");
assert(rail.every(p => lobbyVoid.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9)), "The opening starts at the guardrail");

// Labels know their level, and each Level 02 label sits inside its room.
assert.deepEqual([rooms.every(r => r.level === "L1"), level2Rooms.length, level2Rooms.every(r => r.level === "L2"), allRooms.length], [true, 17, true, rooms.length + 17]);
for (const r of level2Rooms) assert(contains(find(r.id).points, r.center), `${r.number}: label inside the room`);

// Sheet transforms: plan feet → each sheet's 2400 x 1715 viewBox.
assert.deepEqual(sheetTransforms.map(t => [t.sheet, t.levels.join()]), [["A1.1", "L1"], ["A1.2", "L2"], ["A12.2", "L1"], ["A12.3", "L2"], ["A3.1", "L1"], ["A3.2", "L2"]]);
for (const t of sheetTransforms) assert(existsSync(new URL(`../public${t.asset}`, import.meta.url)) && t.imageWidth === 2400 && t.imageHeight === 1715, `${t.sheet}: image and viewBox`);
const close = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const gymCorner = find("gym-north").points[0];
assert(close(toSheetPoint("A1.1", gymCorner), [460, 725]) && close(toSheetPoint("A1.2", gymCorner), [460, 725]), "A1.2 is plotted exactly over A1.1");
assert(close(toSheetPoint("A12.2", gymCorner), [557.6, 827.4]), "A12.2: same scale, shifted on its sheet");
assert(close(toSheetPoint("A12.3", gymCorner), [610.4, 811.4]), "A12.3: same scale, shifted +150.4, +86.4 (measured)");
assert(close(toSheetPoint("A3.1", gymCorner), [424.8, 737.8]) && close(toSheetPoint("A3.2", gymCorner), [422.4, 736.2]), "RCPs: same scale, shifted on their sheets");
assert(close(toSheetPoint("A1.1", find("l2-it-west").points[0]), [1112, 997]), "Round trip to the traced pixels");
assert.equal(toSheetPoint("A5.1", gymCorner), null, "No transform, no highlight");
assert.equal(sheetTransformFor("A8.1"), null);

// ── Partition types: A8.1 schedules + legend, the tags on A1.1 / A1.2, and the general note ──
assert.deepEqual(partitionTypes.map(r => [r.tag, r.roughThickness]), [["SA2.10", "<varies>"], ["SA2.13", '3 1/8"'], ["SA3.10", '4 1/4"'], ["SA6.10", '6 5/8"'],
  ["SA3.20", '4 7/8"'], ["SA3.21", '4 7/8"'], ["SA6.20", "<varies>"], ["SA6.21", '7 1/4"'], ["SA8.20", '9 1/4"']], "Both A8.1 schedules, as printed");
const legendNominal = r => ({ 2: 2.5, 3: 3.625, 6: 6, 8: 8 })[r.tag.slice(2, -3)] + Number(r.tag.at(-2)) * 5 / 8;
for (const r of partitionTypes) assert.equal(legendNominal(r), r.roughThicknessIn ?? r.modeledThicknessIn, `${r.tag}: the legend decode (studs + 5/8 in. per layer) matches the schedule`);
const sa321 = partitionTypes.find(r => r.tag === "SA3.21");
assert.deepEqual([sa321.construction, sa321.ratingHeight, sa321.unitWidth, sa321.gypsum, sa321.uniqueCondition, sa321.fireRating, sa321.source.sheet],
  ["Steel (metal studs)", "Full height / underside of structure (not rated)", '3 5/8" metal', "One layer, each side", "Sound attenuation full height", "Not rated (NR)", "A8.1"]);
assert.equal(partitionTypes.find(r => r.tag === "SA2.13").uniqueCondition, "3 (not in the A8.1 legend)", "A code the legend doesn't list stays explicit");
// Each type points at the typical section above its A8.1 schedule (Marcel, 7 Oct: "show you a section of it").
for (const r of partitionTypes) {
  const { title, source, crop, shows } = r.detail;
  assert.equal(title, r.schedule, `${r.tag}: the section is its own schedule's`);
  assert.deepEqual([source.sheet, source.page, source.asset], ["A8.1", 64, "/models/jelleff/a8-1.png"], `${r.tag}: on A8.1`);
  assert(crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= 1 && crop.y + crop.height <= 1, `${r.tag}: crop inside the sheet`);
  assert(shows.includes(r.gypsum.startsWith("One layer, each") ? "each side" : "tag side"), `${r.tag}: the section shows its own gypsum layers`);
}
assert.deepEqual([...new Set(partitionTypes.map(r => r.detail.title))], ["S_-_-1 non-rated stud partition", "S_-_-2 non-rated stud partition"]);
const [c1, c2] = ["SA3.10", "SA3.20"].map(t => partitionTypes.find(r => r.tag === t).detail.crop);
assert(c1.y + c1.height <= c2.y, "The two sections don't overlap: S_-_-1 sits above S_-_-2");
assert.deepEqual(["SA. 3. 10", "sa 3.21", "SA3.20", "SA.1.21"].map(M.normalizePartitionTag), ["SA3.10", "SA3.21", "SA3.20", "SA1.21"]);

const studWalls = objects.filter(o => o.partitionType);
assert(objects.filter(o => o.materialId.startsWith("partition")).every(o => o.partitionType && o.partitionBasis), "Every stud partition has a type and a basis");
assert(objects.filter(o => !o.materialId.startsWith("partition")).every(o => o.partitionType === null && o.partitionBasis === null), "Nothing else does");
const byBasis = b => studWalls.filter(o => o.partitionBasis === b).map(o => `${o.id} ${o.partitionType.tag}`).sort();
assert.deepEqual(byBasis("tag"), ["fitness-office SA8.20", "l2-elec-west SA3.10", "l2-elevator-west SA3.21", "l2-game-west SA3.10",
  "l2-kitchen-east SA6.20", "l2-kitchen-west SA6.20", "office-105-south SA6.20", "office-divider SA2.10", "office-east SA2.10"], "Tags whose leaders end on a traced segment");
assert.deepEqual(byBasis("unverified"), ["fitness-west SA3.20", "l2-it-west SA3.20", "l2-janitor-west SA3.20", "l2-mech-north SA3.20", "l2-mech-south SA3.20", "l2-stair-b-south SA3.20"], "Tags nearby that can't be tied to the segment");
assert.equal(byBasis("general-note").length, studWalls.length - 15);
assert(studWalls.filter(o => o.partitionBasis !== "tag").every(o => o.partitionType.tag === partitionSchedule.defaultType), "Untagged walls are SA3.20 by the general note");
for (const o of studWalls) {
  assert.equal(o.dimensions.thicknessIn, Math.round(o.partitionType.modeledThicknessIn * 100) / 100, `${o.id}: thickness from its type`);
  assert.equal(prop(o, "Partition type"), o.partitionType.tag);
}
assert.deepEqual(["Partition type", "Stud width", "Unique condition", "Rough thickness", "Type basis"].map(l => prop(find("l2-elevator-west"), l)),
  ["SA3.21", '3 5/8" metal', "Sound attenuation full height", '4 7/8"', "Tagged SA3.21 on A1.2"]);
assert.deepEqual([prop(find("office-divider"), "Rough thickness"), find("office-divider").dimensions.thicknessIn, prop(find("office-divider"), "Type basis")], ["<varies>", 3.13, "Tagged SA2.10 on A1.1"]);
assert.equal(prop(find("office-west"), "Type basis"), partitionSchedule.defaultNote);
assert.match(prop(find("l2-mech-north"), "Type basis"), /^Unverified: SA3\.10 tags .+\. Modeled as SA3\.20 by the general note\.$/);
assert(!objects.some(o => o.properties.some(p => /Partition tag \(A1\.2\)/.test(p.label) || /SA\.?1\.21/.test(p.value))), "The loose tag property and the misread SA.1.21 are gone");
assert.equal(find("l2-elevator-west").name, "Office 206 / elevator 207 partition");

// resolveObjects refuses a partition that disagrees with A8.1 or the general note.
const officeWest = elements.find(e => e.id === "office-west");
const resolveWall = patch => M.resolveObjects([{ ...officeWest, ...patch }], allMaterials, [], partitionSchedule);
assert.equal(resolveWall({ materialId: "partition-sa3-21", partitionTag: "sa 3.21" })[0].partitionBasis, "tag");
assert.throws(() => resolveWall({ partitionTag: "SA. 3. 21" }), /plan tags SA3\.21 but the assembly is SA3\.20/);
assert.throws(() => resolveWall({ materialId: "partition-sa3-21" }), /untagged, so SA3\.20 by the general note, but the assembly is SA3\.21/);
assert.throws(() => resolveWall({ thickness: 0.5 }), /modeled 6 in\. thick, SA3\.20 is 4\.875 in\./);
assert.throws(() => resolveWall({ materialId: "envelope", thickness: 1, partitionTag: "SA. 3. 20" }), /isn't a partition type/);
assert.throws(() => resolveWall({ partitionTag: "SA. 3. 20", partitionUnverified: "a nearby tag" }), /tagged SA3\.20 and unverified at once/);
assert.throws(() => M.resolveObjects([officeWest], allMaterials, [], { ...partitionSchedule, types: [] }), /SA3\.20 is not on the partition schedule/);

// The SA6.20 tag put the kitchen's west wall at x 1277 on A1.2; the lobby void and guardrail stop there.
assert.deepEqual(find("l2-kitchen-west").points.map(p => toSheetPoint("A1.2", p).map(Math.round)), [[1277, 1138], [1277, 1325]]);
// Kitchen 208 reaches the angled south wall on A1.2, A12.3 and A3.2: no wall at y 1302-1305.
const onA12 = id => find(id).points.map(p => toSheetPoint("A1.2", p).map(v => Math.round(v * 10) / 10));
assert.deepEqual(["l2-kitchen-south", "l2-kitchen-southwest", "l2-kitchen-west-exterior"].map(onA12), [[[1455, 1302], [1277, 1378]], [[1277, 1378], [1249, 1378]], [[1249, 1378], [1249, 1325]]]);
assert.equal(Math.max(...onA12("l2-kitchen").map(p => p[1])), 1371.7, "Kitchen floor to the wall's inner face");
const kitchenSouth = find("ceil-l2-208-3"), kitchenMid = [kitchenSouth.points.reduce((a, p) => a + p[0], 0) / kitchenSouth.points.length, kitchenSouth.points.reduce((a, p) => a + p[1], 0) / kitchenSouth.points.length];
assert(contains(find("l2-kitchen").points, kitchenMid), "The kitchen's south ceiling sits over the kitchen floor");
assert.deepEqual([planVoids.find(v => v.id === "void-lobby"), find("l2-guardrail")].map(x => Math.round(Math.max(...x.points.map(p => toSheetPoint("A1.2", p)[0])))), [1275, 1275]);

// ── Views and screens ──
assert.deepEqual(M.MODEL_VIEWS.map(v => v.screen), ["model", "model-mep", "model-structural", "model-exterior"]);
for (const v of M.MODEL_VIEWS) {
  const nav = ALL_SCREENS.find(s => s.id === v.screen);
  assert(nav && nav.label === v.label && nav.section === "3D model studio", `${v.screen}: in the 3D model studio section as "${v.label}"`);
  assert.equal(M.modelViewForScreen(v.screen), v.id);
  assert(objects.some(o => o.views.includes(v.id)), `${v.id}: has objects`);
}
assert.equal(M.modelViewForScreen("budget"), null);
const inView = (view) => M.filterObjects(objects, { view }).length;
assert.deepEqual([inView("interior"), inView("mep"), inView("structural"), inView("exterior")], [238, 11, 11, 46]);
assert.deepEqual(M.filterObjects(objects, { view: "exterior", level: "L2" }).map(o => o.materialId), Array(9).fill("envelope"), "Level 02 envelope is exterior; the corridor storefront is interior only");
assert(M.filterObjects(objects, { view: "exterior" }).every(o => ["envelope", "storefront", "roof-membrane"].includes(o.materialId)), "Exterior: envelope, storefront, roof");
assert.deepEqual(modelForProject("jelleff"), objects);
assert.deepEqual(modelForProject("p2"), [], "Other projects have no model yet");

// ── Filters and reads ──
assert.deepEqual(M.filterObjects(objects, { level: "roof" }).map(o => o.id), ["girder-1", "girder-2", "girder-3", "roof-gym"]);
assert.deepEqual(M.filterObjects(objects, { discipline: "electrical" }).map(o => o.id), ["panel-119a", "light-hb-1", "light-hb-2", "light-hb-3", "light-hb-4"]);
assert.deepEqual(M.filterObjects(objects, { division: "21" }).map(o => o.id), ["sprinkler-gym"]);
assert.deepEqual(M.filterObjects(objects, { kind: "column" }).length, 6);
assert.deepEqual(M.filterObjects(objects, { room: "104" }).map(o => o.id), ["office-east", "office-104-south", "floor-office-104", "ts-office-104", "door-104", "ceil-l1-104-1"]);
assert.deepEqual(M.filterObjects(objects, { query: "tarkett" }).map(o => o.id), ["floor-gym"], "Searches property values");
assert.deepEqual(M.filterObjects(objects, { query: "09 68 00" }).map(o => o.id), ["floor-office-105", "floor-office-104", "floor-office-108"], "Searches spec sections");
assert.deepEqual(M.filterObjects(objects, { review: "flagged" }, sampleModelReview).map(o => o.id), ["gym-north"]);
assert.deepEqual(M.filterObjects(objects, { view: "interior", division: "09", kind: "floor", level: "L1" }).length, 10);
assert.deepEqual(M.divisionsIn(objects, "structural"), [{ division: "03", name: "Concrete", count: 2 }, { division: "05", name: "Metals", count: 9 }]);
assert.deepEqual(M.divisionsIn(objects, "interior").map(d => d.division), ["03", "04", "05", "08", "09", "10", "12"]);
assert.deepEqual(M.reviewSummary(objects, sampleModelReview), { objects: 261, verified: 1, flagged: 1, unreviewed: 259, lowConfidence: 23 });
assert.deepEqual(M.reviewSummary(objects, sampleModelReview, "mep"), { objects: 11, verified: 0, flagged: 0, unreviewed: 11, lowConfidence: 11 });

// ── Selection ──
assert.equal(M.findObject(objects, "nope"), null);
assert.equal(M.findObject(objects, null), null);
assert.deepEqual(M.sameAssembly(objects, "floor-office-105").map(o => o.id), ["floor-office-105", "floor-office-104", "floor-office-108"]);
assert.deepEqual(M.sameAssembly(objects, "nope"), []);
assert.deepEqual(M.selectionTotals(objects, ["floor-office-105", "floor-office-104", "floor-office-108"]), { count: 3, totals: [{ unit: "SF", value: 790.82 }] });
assert.deepEqual(M.selectionTotals(objects, ["duct-yard", "duct-gym-supply", "ahu-1", "slab-gym", "floor-gym", "nope"]),
  { count: 5, totals: [{ unit: "SF", value: 6841.23 }, { unit: "LF", value: 25.13 + 62.83 }, { unit: "EA", value: 1 }, { unit: "CY", value: 110.48 }] }, "Totals per unit, in SF, LF, EA, CY order");
const lights = M.filterObjects(objects, { kind: "fixture" });
assert.equal(M.stepSelection(lights, "light-hb-1", 1), "light-hb-2");
assert.equal(M.stepSelection(lights, "light-hb-4", 1), "light-hb-1", "Wraps forward");
assert.equal(M.stepSelection(lights, "light-hb-1", -1), "light-hb-4", "Wraps back");
assert.equal(M.stepSelection(lights, "floor-gym", 1), "light-hb-1", "Starts at the first when nothing in the list is selected");
assert.equal(M.stepSelection([], "x", 1), null);

// ── Contractor review and show/hide (project-scoped storage) ──
const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-01T18:00:00.000Z";
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof M.ModelRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const base = freeze(structuredClone(sampleModelReview));
assert.deepEqual(startingDraft("p2", "model-review", sampleModelReview), M.EMPTY_MODEL_REVIEW, "A new project starts with no reviews and nothing hidden");
fails(() => M.verifyObject(base, objects, "nope", "Safi", "", at), "object", /not in the model/);
fails(() => M.verifyObject(base, objects, "slab-gym", " ", "", at), "by", /who/);
fails(() => M.verifyObject(base, objects, "floor-gym", "Safi", "", at), "object", /Already verified/);
fails(() => M.flagObject(base, objects, "slab-gym", " ", "Safi", at), "note", /what needs checking/);
let s = freeze(M.verifyObject(base, objects, "slab-gym", " Vijay ", " Thickness per S-101 ", at));
assert.deepEqual(M.reviewOf(s, "slab-gym"), { objectId: "slab-gym", status: "verified", note: "Thickness per S-101", by: "Vijay", at, history: [{ status: "verified", note: "Thickness per S-101", by: "Vijay", at }] });
s = freeze(M.flagObject(s, objects, "slab-gym", "Recheck the thickened edge.", "Safi", at));
assert.deepEqual([M.reviewStatus(s, "slab-gym"), M.reviewOf(s, "slab-gym").history.map(h => h.status)], ["flagged", ["verified", "flagged"]]);
s = freeze(M.clearObjectReview(s, objects, "slab-gym", "Safi", at));
assert.deepEqual([M.reviewStatus(s, "slab-gym"), M.reviewOf(s, "slab-gym").history.length], ["unreviewed", 3], "Clearing keeps the history");
assert.equal(M.clearObjectReview(s, objects, "slab-gym", "Safi", at), s, "Clearing twice changes nothing");
assert.equal(M.reviewStatus(base, "duct-yard"), "unreviewed");
assert.equal(s.reviews.length, 3, "One review per object");
fails(() => M.setDivisionHidden(base, "roofing", "07", true), "view", /model view/);
fails(() => M.setDivisionHidden(base, "mep", "99", true), "division", /CSI division/);
let h = freeze(M.setDivisionHidden(base, "mep", "26", true));
h = freeze(M.setDivisionHidden(h, "mep", "21", true));
assert.deepEqual(h.hidden.mep, ["21", "26"]);
assert.equal(M.setDivisionHidden(h, "mep", "26", true), h, "Hiding twice changes nothing");
assert.deepEqual(M.visibleObjects(objects, h, "mep").map(o => o.id), ["ahu-1", "duct-yard", "duct-gym-supply", "duct-gym-return", "water-lockers"]);
assert.deepEqual(M.visibleObjects(objects, h, "structural").length, 11, "Hidden divisions are per view");
assert.deepEqual(M.setDivisionHidden(h, "mep", "26", false).hidden.mep, ["21"]);

console.log(`Model checked: ${elements.length} elements, ${floors.length} finish zones, ${materials.length} materials; courtyard remains open. Contract: ${objects.length} objects in 4 views, ${systemMaterials.length} system assemblies, quantities, filters, selection, review, show/hide.`);

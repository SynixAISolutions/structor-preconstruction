import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { elements, materials, rooms, planTransform, systemElements, systemMaterials, allMaterials, modelObjects, modelForProject, sampleModelReview, interiorTransitions, transitionMaterials, finishScheduleRows } = await import("../lib/jelleff-model.ts");
const M = await import("../lib/model.ts");
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
assert.equal(objects.length, elements.length + interiorTransitions.length + systemElements.length);
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
assert.deepEqual(find("office-105-door").quantity, { value: 1, unit: "EA" });
assert.deepEqual(find("office-105-door").dimensions, { lengthFt: 4.47, areaSf: null, perimeterFt: null, heightFt: 7, thicknessIn: null, volumeCy: null });
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

// ── Interior phase 1: the A12.1 finish schedule, transitions, base, room finish schedule ──
assert.equal(new Set(finishScheduleRows.map(r => r.tag)).size, finishScheduleRows.length, "Schedule tags are unique");
assert(finishScheduleRows.every(r => /^\d\d \d\d \d\d$/.test(r.section) && r.sectionTitle && r.description && r.source.sheet === "A12.1"), "Rows carry the schedule heading and A12.1");
const floorTags = Object.fromEntries(objects.filter(o => o.kind === "floor").map(o => [o.materialId, [o.tag, o.baseTag, o.specSection]]));
assert.deepEqual(floorTags, {
  "gym-floor": ["FAF-01", "VWB-01", "09 67 00"], "entry-grille": ["WOG-01", null, "12 48 16"], "concrete": ["PLC-01", "WB-01", "03 33 00"], "carpet": ["CPT-01", "WB-01", "09 68 00"],
  "fitness-floor": ["RF-01", "WB-01", "09 65 00"], "tile": ["FT-01", "TB-01", "09 30 00"], "service-floor": ["SCE-01", null, "03 33 00"],
}, "Every floor finish: its A12.1 tag, base and section heading");
assert(objects.filter(o => o.tag).every(o => o.schedule?.tag === o.tag && o.specSection === o.schedule.section), "A scheduled object's section is the schedule's");
const prop = (o, label) => o.properties.find(p => p.label === label)?.value;
assert.deepEqual([prop(gymFloor, "Product"), prop(gymFloor, "Specification"), prop(gymFloor, "Base"), prop(gymFloor, "Size")],
  ["Polyturf Plus Pad + Pour", "09 67 00 Fluid applied flooring", "VWB-01, Vented wall base, Johnsonite, 47 Brown", undefined], "Schedule fields as properties; empty columns skipped");
assert.equal(prop(find("floor-family"), "Showers"), 'FT-02, 2" x 2" (not modeled)');
assert.equal(find("floor-vestibule").properties.some(p => p.label === "Base"), false, "No base where none is scheduled");
assert.throws(() => M.resolveObjects([interiorTransitions[0]], [{ ...transitionMaterials[0], id: transitionMaterials[1].id, tag: "TS-99" }], finishScheduleRows), /TS-99 is not on the finish schedule/);
assert.throws(() => M.resolveObjects([elements.find(e => e.id === "floor-gym")], materials, []), /FAF-01 is not on the finish schedule/, "Tags must be on the schedule");

const transitions = objects.filter(o => o.kind === "transition");
assert.deepEqual(transitions.map(t => [t.id, t.tag, t.quantity.value, t.quantity.unit, t.room, t.adjoins]), [
  ["ts-gym-lobby-north", "TS-06", 7.26, "LF", "103", "102"], ["ts-gym-lobby-south", "TS-06", 5.72, "LF", "103", "102"],
  ["ts-office-105", "TS-04", 5.31, "LF", "105", "102"], ["ts-office-104", "TS-04", 5.72, "LF", "104", "102"], ["ts-fitness", "TS-06", 4.88, "LF", "106", "102B"],
], "Strips at the traced openings, typed from A12.1");
assert(transitions.every(t => t.shape === "segment" && t.views.join() === "interior" && t.dimensions.lengthFt === t.quantity.value && t.dimensions.areaSf === null), "LF only, interior view");
assert.deepEqual(transitions.map(t => t.sources[1].detail), ["Transition detail E: concrete to fitness flooring", "Transition detail E: concrete to fitness flooring", "Transition detail A: carpet to concrete", "Transition detail A: carpet to concrete", "Transition detail E: concrete to fitness flooring"], "Each cites its A12.1 detail");
assert.deepEqual([transitions[0].confidence, prop(transitions[0], "Comments"), prop(transitions[0], "Between")], [0.75, "Concrete to gym floor", "103 Gym (FAF-01) / 102 Lobby (PLC-01)"]);
for (const t of transitions) {
  const doorway = elements.filter(e => e.kind !== "floor" && e.points.some(p => p[0] === t.points[0][0] && p[1] === t.points[0][1]));
  assert(doorway.length, `${t.id}: starts at a traced wall end or door`);
}

const schedule = M.roomFinishSchedule(objects);
assert.equal(schedule.length, 16, "One row per room with a floor finish");
const roomRow = (r) => schedule.find(x => x.room === r);
assert.deepEqual(roomRow("103"), {
  room: "103", level: "L1", floors: [{ id: "floor-gym", tag: "FAF-01", assembly: gymFloor.assembly, areaSf: 6841.23 }], areaSf: 6841.23,
  baseTags: ["VWB-01"], baseLf: 335.96, transitions: [{ id: "ts-gym-lobby-north", tag: "TS-06", lengthFt: 7.26, to: "102" }, { id: "ts-gym-lobby-south", tag: "TS-06", lengthFt: 5.72, to: "102" }],
  doors: 3, wallLf: roomRow("103").wallLf,
});
assert.deepEqual(roomRow("102").transitions.map(t => [t.id, t.to]), [["ts-gym-lobby-north", "103"], ["ts-gym-lobby-south", "103"], ["ts-office-105", "105"], ["ts-office-104", "104"]], "Both sides list the strip");
assert.deepEqual([roomRow("101").baseTags, roomRow("101").baseLf, roomRow("120").baseTags], [[], 0, []], "No base where none is scheduled");
assert.equal(roomRow("103").wallLf, Math.round(objects.filter(o => o.kind === "wall" && o.room === "103").reduce((s, o) => s + o.dimensions.lengthFt, 0) * 100) / 100);
assert(schedule.every((r, i) => i === 0 || schedule[i - 1].room < r.room), "Room order");
assert.equal(M.roomFinishSchedule(objects.filter(o => o.kind !== "floor")).length, 0, "Rooms come from floor finishes");

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
assert.deepEqual([inView("interior"), inView("mep"), inView("structural"), inView("exterior")], [82, 11, 11, 37]);
assert(M.filterObjects(objects, { view: "exterior" }).every(o => ["envelope", "storefront", "roof-membrane"].includes(o.materialId)), "Exterior: envelope, storefront, roof");
assert.deepEqual(modelForProject("jelleff"), objects);
assert.deepEqual(modelForProject("p2"), [], "Other projects have no model yet");

// ── Filters and reads ──
assert.deepEqual(M.filterObjects(objects, { level: "roof" }).map(o => o.id), ["girder-1", "girder-2", "girder-3", "roof-gym"]);
assert.deepEqual(M.filterObjects(objects, { discipline: "electrical" }).map(o => o.id), ["panel-119a", "light-hb-1", "light-hb-2", "light-hb-3", "light-hb-4"]);
assert.deepEqual(M.filterObjects(objects, { division: "21" }).map(o => o.id), ["sprinkler-gym"]);
assert.deepEqual(M.filterObjects(objects, { kind: "column" }).length, 6);
assert.deepEqual(M.filterObjects(objects, { room: "104" }).map(o => o.id), ["office-east", "office-104-south", "office-104-door", "floor-office-104", "ts-office-104"]);
assert.deepEqual(M.filterObjects(objects, { query: "tarkett" }).map(o => o.id), ["floor-gym"], "Searches property values");
assert.deepEqual(M.filterObjects(objects, { query: "09 68 00" }).map(o => o.id), ["floor-office-105", "floor-office-104", "floor-office-108"], "Searches spec sections");
assert.deepEqual(M.filterObjects(objects, { review: "flagged" }, sampleModelReview).map(o => o.id), ["gym-north"]);
assert.deepEqual(M.filterObjects(objects, { view: "interior", division: "09", kind: "floor", level: "L1" }).length, 10);
assert.deepEqual(M.divisionsIn(objects, "structural"), [{ division: "03", name: "Concrete", count: 2 }, { division: "05", name: "Metals", count: 9 }]);
assert.deepEqual(M.divisionsIn(objects, "interior").map(d => d.division), ["03", "04", "08", "09", "12"]);
assert.deepEqual(M.reviewSummary(objects, sampleModelReview), { objects: 105, verified: 1, flagged: 1, unreviewed: 103, lowConfidence: 23 });
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

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { elements, materials, rooms, planTransform } from "../lib/jelleff-model.ts";

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
for (const source of [...elements.map(e => e.source), ...materials.flatMap(m => m.sources)]) {
  assert(existsSync(new URL(`../public${source.asset}`, import.meta.url)), `Source image missing: ${source.asset}`);
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
console.log(`Model checked: ${elements.length} elements, ${floors.length} finish zones, ${materials.length} materials; courtyard remains open.`);

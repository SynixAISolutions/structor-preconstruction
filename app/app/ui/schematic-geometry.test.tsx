import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { alignSheetFrame, footprintValid, openOutline, printedSheetFrame, schematicDoors, schematicGeometry, schematicWalls, sheetPoint, wallTotals } from "./schematic-geometry";
import { moveOutlinePoint, setLevelHeight, type Point, type SchematicLevel, type SchematicModel } from "../../lib/schematic-model";

const level: SchematicLevel = { id: "L1", name: "Level 01", order: 1, elevation: 0, height: 14, outline: [[10, 20], [50, 20], [50, 60], [10, 60]], rooms: [{ name: "Lobby", number: "101", at: [20, 30] }], source: { documentId: "qa", sheet: "A1.1", page: 1 }, sizing: "Printed scale, 8 ft per inch" };
test("schematic geometry flips drawing y, extrudes to the read height, and corrections move upper levels", () => {
  const geometry = schematicGeometry(level); geometry.computeBoundingBox();
  assert.deepEqual(geometry.boundingBox!.min.toArray().map(n => Math.round(n * 1e6) / 1e6), [10, 0, -60]); assert.deepEqual(geometry.boundingBox!.max.toArray().map(n => Math.round(n * 1e6) / 1e6), [50, 14, -20]); geometry.dispose();
  const model: SchematicModel = { levels: [level, { ...level, id: "L2", order: 2, elevation: 14, height: 16 }], builtAt: "qa", warnings: [] };
  assert.equal(setLevelHeight(model, "L1", 15).levels[1].elevation, 15);
  const edited = moveOutlinePoint(model, "L1", 0, [12, 21]); assert.equal(edited.levels[0].outline[0][0], 12); assert.equal(model.levels[0].outline[0][0], 10);
});
test("walls read from the drawing become boxes along their centerlines, at full level height", () => {
  assert.equal(schematicWalls(level), null, "A model built before walls were read has none");
  assert.equal(wallTotals(level), null);
  const walled: SchematicLevel = { ...level, walls: [{ a: [10, 20], b: [50, 20], thickness: 1 }, { a: [30, 20], b: [30, 60], thickness: .4 }] };
  const mesh = schematicWalls(walled)!;
  assert.equal(mesh.count, 2);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  mesh.getMatrixAt(0, m); m.decompose(p, q, s);
  assert.deepEqual([p.toArray(), s.toArray()].map(v => v.map(n => Math.round(n * 1e6) / 1e6)), [[30, 7, -20], [40, 14, 1]]);
  mesh.getMatrixAt(1, m); m.decompose(p, q, s);
  const along = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  assert.deepEqual([p.toArray(), along.toArray(), s.toArray()].map(v => v.map(n => Math.round(n * 1e6) / 1e6)), [[30, 7, -40], [0, 0, -1], [40, 14, .4]], "Plan y runs toward world -z, as the outline does");
  assert.deepEqual(wallTotals(walled), { count: 2, feet: 80, doors: null, compartments: 0 });
  assert.equal(schematicWalls({ ...level, walls: [] }), null, "A scan: no walls");
  const excluded: SchematicLevel = { ...walled, walls: [walled.walls![0], { ...walled.walls![1], excluded: true }] };
  assert.deepEqual([schematicWalls(excluded)!.count, wallTotals(excluded)!.count, wallTotals(excluded)!.feet], [1, 1, 40], "A wall the estimator marked not a wall leaves the 3D and the totals");
  mesh.geometry.dispose();
});
test("doors read from the drawing: a header over each opening and each leaf standing open", () => {
  const door = { a: [10, 20] as Point, b: [13, 20] as Point, width: 3, leaves: 1, hinges: [[10, 20]] as Point[], openTo: [[10, 23]] as Point[], kind: "door" as const, thickness: .4 };
  const stall = { ...door, a: [30, 20] as Point, b: [32, 20] as Point, width: 2, hinges: [[30, 20]] as Point[], openTo: [[30, 22]] as Point[], kind: "compartment" as const };
  const doored: SchematicLevel = { ...level, walls: [{ a: [0, 20], b: [10, 20], thickness: .4 }], doors: [door, stall] };
  assert.deepEqual(wallTotals(doored), { count: 1, feet: 10, doors: 1, compartments: 1 });
  const group = schematicDoors(doored)!;
  const [headers, leaves] = group.children as THREE.InstancedMesh[];
  assert.deepEqual([headers.count, leaves.count], [1, 1], "Toilet-stall doors are not drawn as building doors");
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  headers.getMatrixAt(0, m); m.decompose(p, q, s);
  assert.deepEqual([p.toArray(), s.toArray()].map(v => v.map(n => Math.round(n * 1e6) / 1e6)), [[11.5, 10.5, -20], [3, 7, .4]], "Header from 7 ft to the 14 ft level height, over the 3 ft opening");
  leaves.getMatrixAt(0, m); m.decompose(p, q, s);
  assert.deepEqual([p.toArray(), s.toArray()].map(v => v.map(n => Math.round(n * 1e6) / 1e6)), [[10, 3.5, -21.5], [3, 7, .15]], "The leaf stands open from its hinge");
  assert.equal(schematicDoors({ ...level, walls: [], doors: [stall] }), null);
  assert.equal(schematicDoors({ ...doored, height: 7 })!.children.length, 1, "No header when the level is no taller than the door");
});
test("sheet overlay uses printed paper scale or explicit alignment, retains the frame after outline edits", () => {
  const frame = printedSheetFrame(level.sizing, 42, 30)!;
  assert.deepEqual(frame, { width: 336, height: 240 }); assert.deepEqual(sheetPoint([.25, .5], frame), [84, 120]);
  assert.equal(printedSheetFrame("Sized to building area", 42, 30), null);
  const aligned = alignSheetFrame([84, 120], [.25, .5]); assert.deepEqual(aligned, frame);
  assert.deepEqual(sheetPoint([.5, .25], aligned), [168, 60]);
  assert.throws(() => alignSheetFrame([0, 120], [0, .5]), /Choose a corner/);
  assert.deepEqual(sheetPoint([-1, 2], aligned), [0, 240]);
});
test("outline edits reject crossing edges, collapsed footprints and non-finite coordinates", () => {
  assert.equal(footprintValid(level.outline), true);
  assert.equal(footprintValid([...level.outline, level.outline[0]]), true);
  assert.equal(openOutline([...level.outline, level.outline[0]]).length, 4);
  assert.equal(footprintValid([[0, 0], [10, 10], [0, 10], [10, 0]]), false);
  assert.equal(footprintValid([[0, 0], [10, 0], [10, 10], [5, 5], [0, 10]]), true);
  assert.equal(footprintValid([[0, 0], [1, 0], [2, 0]]), false);
  assert.equal(footprintValid([[0, 0], [Infinity, 0], [10, 10]]), false);
});

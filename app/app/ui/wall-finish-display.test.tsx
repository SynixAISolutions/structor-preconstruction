import assert from "node:assert/strict";
import { test } from "node:test";
import type { BaseBreakdownRow, ModelObject, WallFinishRecord } from "../../lib/model";
import { displayedFinishHeight, wallFinishDisplay } from "./wall-finish-display";

const wall = { id: "wall", kind: "wall", points: [[0, 0], [10, 0]], thickness: .5, base: 14, height: 12 } as ModelObject;
const record = { id: "finish", status: "assigned", extent: [[2, .2], [8, .2]], sides: [{ wallId: "wall", side: "left" }], bands: [{ tags: ["WT-01"], from: '4"', heightFt: 7, fullRun: true }], base: null } as WallFinishRecord;

test("a located tile band stays on its own face and cutaway crops its true elevation", () => {
  const [item] = wallFinishDisplay([wall], [record], []);
  assert.equal(item.kind, "band"); assert.equal(item.length, 6); assert.equal(item.x, 5);
  assert.ok(item.z > wall.thickness / 2); assert.equal(item.bottom, 14 + 4 / 12);
  assert.equal(displayedFinishHeight(item, false), 7);
  assert.ok(Math.abs(displayedFinishHeight(item, true) - (5 - 4 / 12)) < 1e-9);
  const [opposite] = wallFinishDisplay([wall], [{ ...record, sides: [{ wallId: "wall", side: "right" }] }], []);
  assert.ok(opposite.z < -wall.thickness / 2); assert.equal(opposite.rotation - item.rotation, Math.PI);
});

test("SF with missing placement, graphics and untraced faces never become wall patches", () => {
  for (const patch of [{ status: "extent-unresolved", extent: null }, { status: "graphic", extent: null }, { bands: [{ tags: ["MR-01"], from: '8"', heightFt: 8.67, fullRun: false }] }, { bands: [{ tags: ["FRP-01"], from: null, heightFt: 8, fullRun: true }] }, { bands: [{ tags: ["WT-01", "WT-02"], from: '4"', heightFt: 7, fullRun: true }] }]) {
    assert.deepEqual(wallFinishDisplay([wall], [{ ...record, ...patch } as WallFinishRecord], []), []);
  }
  const [marker] = wallFinishDisplay([wall], [{ ...record, bands: [{ tags: ["PT-02"], from: null, heightFt: null, fullRun: true }] } as WallFinishRecord], []);
  assert.equal(marker.kind, "run"); assert.equal(marker.height, 0);
});

test("accent base requires a supported floor split; missing floor bases and conflicting notes stay untouched", () => {
  const base = { ...record, bands: [], base: { tag: "WB-02", printed: "WB-02", basis: "Finish schedule", fullRun: true } } as WallFinishRecord;
  assert.deepEqual(wallFinishDisplay([wall], [base], []), []);
  const bases = [{ accents: [{ recordId: "finish", tag: "WB-02", lf: 6 }] }] as BaseBreakdownRow[];
  const [item] = wallFinishDisplay([wall], [base], bases);
  assert.equal(item.kind, "base"); assert.equal(item.height, 4 / 12); assert.equal(item.bottom, 14);
  assert.deepEqual(wallFinishDisplay([], [base], bases), []);
});

test("extents are clipped at wall ends and upper bands disappear below a cutaway", () => {
  const [item] = wallFinishDisplay([wall], [{ ...record, extent: [[-1, 0], [15, 0]], bands: [{ tags: ["WT-01"], from: '7\' - 4"', heightFt: 3, fullRun: true }] } as WallFinishRecord], []);
  assert.equal(item.length, 10); assert.equal(displayedFinishHeight(item, true), 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { finishScheduleRows, modelObjects, wallBaseBreakdown, wallFinishRecords } from "../../lib/jelleff-model";
import { EMPTY_MODEL_REVIEW } from "../../lib/model";
import { DEFAULT_QUANTITY_FILTERS, filterModelQuantityRows, modelQuantityCsv, modelQuantityRows } from "./model-quantity-rows";

const rows = modelQuantityRows(modelObjects, wallFinishRecords, wallBaseBreakdown, finishScheduleRows);

test("model takeoffs copy each interior object's resolved quantity; shared strips and paired doors appear once", () => {
  const objects = modelObjects.filter(object => object.views.includes("interior"));
  assert.equal(rows.filter(row => !["base", "wall-finish"].includes(row.category)).length, objects.length);
  for (const object of objects) {
    const row = rows.find(row => row.id === object.id)!;
    assert.equal(row.value, object.quantity.value); assert.equal(row.unit, object.quantity.unit);
    assert.equal(row.objectId, object.id); assert.equal(row.sources[0].sheet, object.sources[0].sheet);
  }
  assert.equal(rows.filter(row => row.category === "door").length, 46);
  const pair = objects.find(object => object.door?.leaves.length === 2)!;
  assert.equal(rows.find(row => row.id === pair.id)!.value, 1);
  assert.equal(rows.filter(row => row.category === "transition").length, 17);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.ok(rows.every(row => new Set(row.rooms).size === row.rooms.length));
  const sharedZone = rows.find(row => row.category === "floor" && row.rooms.includes("117A") && row.rooms.includes("117B"))!;
  assert.ok(sharedZone.notes.includes("not apportioned"));
  assert.ok(filterModelQuantityRows(rows, { ...DEFAULT_QUANTITY_FILTERS, room: "117B" }, EMPTY_MODEL_REVIEW).includes(sharedZone));
});

test("finish bands retain nulls and combined tags; base splits retain gross totals without an extra total row", () => {
  const finishRows = rows.filter(row => row.category === "wall-finish");
  assert.equal(finishRows.filter(row => row.value !== null).length, 7);
  const tile = finishRows.find(row => row.tag === "WT-01 / WT-02")!;
  assert.equal(tile.value, null); assert.equal(tile.objectId, null); assert.ok(tile.warning);
  const kitchen = finishRows.find(row => row.finishId === "wf-l2-208-north")!;
  assert.equal(kitchen.value, 112.67); assert.ok(kitchen.warning);
  for (const base of wallBaseBreakdown) {
    const mine = rows.filter(row => row.category === "base" && row.objectId === base.floorId);
    assert.equal(mine.length, 1 + base.accents.length);
    assert.ok(Math.abs(mine.reduce((sum, row) => sum + row.value!, 0) - base.grossLf) < .011);
    assert.ok(mine.every(row => row.unit === "LF" && row.division === "09"));
  }
  assert.ok(!rows.some(row => row.category === "base" && ["l2-office", "l2-closet"].includes(row.objectId ?? "")));
  assert.deepEqual(modelQuantityRows([], wallFinishRecords, wallBaseBreakdown, finishScheduleRows), []);
});

test("level, room, division, material and review filters match the exported rows; unknown quantities stay blank", () => {
  const filters = { ...DEFAULT_QUANTITY_FILTERS, category: "base", level: "L2", room: "210", material: "WB-03", division: "09" };
  const picked = filterModelQuantityRows(rows, filters, EMPTY_MODEL_REVIEW);
  assert.equal(picked.length, 1); assert.equal(picked[0].value, 15.17);
  const csv = modelQuantityCsv(picked, EMPTY_MODEL_REVIEW);
  assert.equal(csv.length, 2); assert.equal(csv[1][10], 15.17); assert.equal(csv[1][11], "LF");
  assert.ok(String(csv[1][16]).includes("A10.1"));
  const unmeasured = filterModelQuantityRows(rows, { ...DEFAULT_QUANTITY_FILTERS, category: "wall-finish", coverage: "unmeasured" }, EMPTY_MODEL_REVIEW);
  assert.ok(unmeasured.length > 0); assert.ok(modelQuantityCsv(unmeasured, EMPTY_MODEL_REVIEW).slice(1).every(row => row[10] === ""));
  assert.deepEqual(filterModelQuantityRows(rows, { ...DEFAULT_QUANTITY_FILTERS, category: "door", review: "verified" }, EMPTY_MODEL_REVIEW), []);
});

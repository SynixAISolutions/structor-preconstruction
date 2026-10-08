import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelObject } from "../../lib/model";
import { doorLeafGeometry } from "./door-geometry";

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .001, `${actual} != ${expected}`);

test("a leaf uses the scheduled width without moving its hinge or changing its swing", () => {
  const object = { height: 7, thickness: .15, door: { row: { widthIn: 36 }, leaves: [{ hinge: [10, 20], tip: [13.2, 20], lengthFt: 3.2 }] } } as unknown as ModelObject;
  const geometry = doorLeafGeometry(object)!;
  geometry.computeBoundingBox();
  near(geometry.boundingBox!.min.x, 10); near(geometry.boundingBox!.max.x, 13);
  near(geometry.boundingBox!.min.y, -3.5); near(geometry.boundingBox!.max.y, 3.5);
  near(geometry.boundingBox!.min.z, 19.925); near(geometry.boundingBox!.max.z, 20.075);
  assert.deepEqual(object.door!.leaves[0].tip, [13.2, 20]);
  geometry.dispose();
});

test("a pair contains two separate leaves at the two traced jambs", () => {
  const object = { height: 8, thickness: .15, door: { row: { widthIn: 36 }, leaves: [{ hinge: [0, 0], tip: [0, 3], lengthFt: 3 }, { hinge: [6, 0], tip: [6, 3], lengthFt: 3 }] } } as unknown as ModelObject;
  const geometry = doorLeafGeometry(object)!;
  const xs = [...geometry.getAttribute("position").array].filter((_, i) => i % 3 === 0);
  assert.ok(xs.every(x => Math.abs(x) < .1 || Math.abs(x - 6) < .1), "No closed panel across the opening");
  geometry.computeBoundingBox(); near(geometry.boundingBox!.max.z, 3);
  geometry.dispose();
});

test("a coiling counter door keeps the opening geometry instead of inventing hinged leaves", () => {
  assert.equal(doorLeafGeometry({ door: { leaves: [] } } as unknown as ModelObject), null);
});

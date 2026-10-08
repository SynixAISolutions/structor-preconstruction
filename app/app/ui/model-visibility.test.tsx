import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelObject } from "../../lib/model";
import { isObjectDrawn } from "./model-visibility";

test("ceiling visibility never invents an unresolved height, respects isolation, and leaves walls independent", () => {
  const options = { walls: true, ceilings: true, isolated: "" };
  const ceiling = { id: "ceiling", kind: "ceiling", ceiling: { elevationFt: 23.42 } } as ModelObject;
  const unresolved = { ...ceiling, ceiling: { elevationFt: null } } as ModelObject;
  const wall = { id: "wall", kind: "wall", ceiling: null } as ModelObject;
  assert.equal(isObjectDrawn(ceiling, options), true);
  assert.equal(isObjectDrawn(unresolved, options), false);
  assert.equal(isObjectDrawn(unresolved, { ...options, isolated: "ceiling" }), false);
  assert.equal(isObjectDrawn(ceiling, { ...options, ceilings: false }), false);
  assert.equal(isObjectDrawn(wall, { ...options, ceilings: false }), true);
  assert.equal(isObjectDrawn(wall, { ...options, walls: false }), false);
  assert.equal(isObjectDrawn(ceiling, { ...options, isolated: "wall" }), false);
});

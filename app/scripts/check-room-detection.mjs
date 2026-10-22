import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/room-detection.ts");
const S = await import("../lib/schematic-model.ts");

const line = (a, b) => ({ a, b });
const box = (x0, y0, x1, y1) => [line([x0, y0], [x1, y0]), line([x1, y0], [x1, y1]), line([x1, y1], [x0, y1]), line([x0, y1], [x0, y0])];
const areas = rooms => rooms.map(r => r.area).sort((a, b) => a - b);

// A 20 x 10 box is one room; a wall across it makes two.
assert.deepEqual(areas(R.levelRooms({ walls: box(0, 0, 20, 10), doors: [], glazing: [], tags: [] })), [200]);
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 20, 10), line([10, 0], [10, 10])], doors: [], glazing: [], tags: [] })), [100, 100]);

// Walls as read: a centerline stops at the face of the wall it meets (0.4 ft short), and a 3 ft door opening
// breaks a wall. The short end is extended to the wall ahead, and the door line closes the opening.
const partition = [line([10, 0.4], [10, 3.5]), line([10, 6.5], [10, 9.6])], door = line([10, 3.5], [10, 6.5]);
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 20, 10), ...partition], doors: [door], glazing: [], tags: [] })), [100, 100], "Short ends extended, the door closes its opening");
// An opening with no door read (a cased opening) is closed by extending the wall end straight across it.
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 20, 10), ...partition], doors: [], glazing: [], tags: [] })), [100, 100], "A 3 ft gap in line closes");
// An opening wider than the extension leaves the spaces joined: one room, not a guess.
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 40, 10), line([20, 0], [20, 1]), line([20, 9], [20, 10])], doors: [], glazing: [], tags: [] })), [400], "An 8 ft opening is open");
// Glass encloses like a wall; a drawing with an open side encloses nothing.
assert.deepEqual(areas(R.levelRooms({ walls: box(0, 0, 20, 10).slice(0, 3), doors: [], glazing: [line([0, 10], [0, 0])], tags: [] })), [200]);
assert.deepEqual(R.levelRooms({ walls: box(0, 0, 20, 10).slice(0, 3), doors: [], glazing: [], tags: [] }), []);
// Wall-thickness slivers (two faces of one wall) are not rooms.
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 20, 10), line([0, 4.6], [20, 4.6]), line([0, 5.4], [20, 5.4])], doors: [], glazing: [], tags: [] })), [92, 92]);

// Room tags name the space they fall in; a space without one keeps an empty name and is labelled at its centroid.
const named = R.levelRooms({ walls: [...box(0, 0, 20, 10), line([10, 0], [10, 10])], doors: [], glazing: [], tags: [{ name: "GYM", number: "103", at: [4, 5] }] });
assert.deepEqual(named.map(r => [r.number, r.name, r.at]).sort(), [["", "", [15, 5]], ["103", "GYM", [4, 5]]]);
assert.deepEqual(R.centroid([[0, 0], [20, 0], [20, 10], [0, 10]]), [10, 5]);

// A level's spaces follow the estimator's corrections: a wall marked not a wall merges the two rooms.
const level = { walls: [...box(0, 0, 20, 10), line([10, 0], [10, 10])].map(w => ({ ...w, thickness: 0.5 })), doors: [], glazing: [], rooms: [] };
assert.deepEqual(areas(S.levelSpaces(level)), [100, 100]);
assert.deepEqual(areas(S.levelSpaces({ ...level, walls: level.walls.map((w, i) => i === 4 ? { ...w, excluded: true } : w) })), [200], "Not a wall: the rooms reflow");
assert.deepEqual(S.levelSpaces({ walls: undefined, rooms: [] }), [], "A model built before walls were read has no spaces");

console.log("Room detection checked: enclosed spaces, short wall ends extended, doors close openings, cased openings closed, wide openings left open, glass encloses, open sides and wall slivers are not rooms, rooms named by their tags, corrections reflow the rooms.");

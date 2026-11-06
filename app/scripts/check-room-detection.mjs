import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/room-detection.ts");
const S = await import("../lib/schematic-model.ts");
const O = await import("../lib/floor-openings.ts");

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
// A wall end that runs into a line ahead closes across a longer stretch than two ends facing each other do: 9 ft here.
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 40, 10), line([20, 0], [20, 1])], doors: [], glazing: [], tags: [] })), [200, 200], "A wall stopping 9 ft short of the wall ahead closes");
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 60, 30), line([30, 0], [30, 1])], doors: [], glazing: [], tags: [] })), [1800], "One stopping 29 ft short doesn't");
// Glass encloses like a wall; a drawing with an open side encloses nothing.
assert.deepEqual(areas(R.levelRooms({ walls: box(0, 0, 20, 10).slice(0, 3), doors: [], glazing: [line([0, 10], [0, 0])], tags: [] })), [200]);
assert.deepEqual(R.levelRooms({ walls: box(0, 0, 20, 10).slice(0, 3), doors: [], glazing: [], tags: [] }), []);
// Wall-thickness slivers (two faces of one wall) are not rooms.
assert.deepEqual(areas(R.levelRooms({ walls: [...box(0, 0, 20, 10), line([0, 4.6], [20, 4.6]), line([0, 5.4], [20, 5.4])], doors: [], glazing: [], tags: [] })), [92, 92]);

// Room tags name the space they fall in; a space without one keeps an empty name and is labelled at its centroid.
const named = R.levelRooms({ walls: [...box(0, 0, 20, 10), line([10, 0], [10, 10])], doors: [], glazing: [], tags: [{ name: "GYM", number: "103", at: [4, 5] }] });
assert.deepEqual(named.map(r => [r.number, r.name, r.at]).sort(), [["", "", [15, 5]], ["103", "GYM", [4, 5]]]);
assert.deepEqual(R.centroid([[0, 0], [20, 0], [20, 10], [0, 10]]), [10, 5]);

// Points within reach are one node even in a chain. A partition's end beside the place where a wall meets its glass used to
// split that corner: the third point fell between the two that meet, so the wall and the glass no longer joined (Project 1's 213).
const threeSided = [line([0, 0], [20, 0]), line([0, 0], [0, 10]), line([0, 10], [20.3, 10]), line([20, 0], [20, 5.7])];
assert.deepEqual(areas(R.levelRooms({ walls: [...threeSided, line([0, 5.3], [19.3, 5.3])], doors: [], glazing: [line([20.3, 6], [20.3, 10])], tags: [] })).length, 2, "A partition's end near a wall and glass meeting: two rooms");
// An end with nothing ahead closes against a line under a door's width away (Project 1's Stair B and 215: a corner whose short return is too short to be a wall), and not across a door's width.
const corner = gap => R.levelRooms({ walls: [line([0, 0], [20, 0]), line([0, 0], [0, 10]), line([0, 10], [20.1, 10]), line([20.1, gap], [20.1, 10]), line([20.1, gap], [30, gap])], doors: [], glazing: [], tags: [] });
assert.equal(corner(2).length, 1, "A 2 ft gap at a corner closes");
assert.equal(corner(3).length, 0, "A 3 ft gap at a corner is an opening");

// A wall end reaching far across a room has to part two rooms. An alcove's wall that just stops doesn't cut the room in two (Project
// 1's 109 and 110), a short reach still closes, and a long one between two real rooms stays.
const stub = (size, y, x) => R.levelRooms({ walls: [...box(0, 0, size, size), line([0, y], [x, y])], doors: [], glazing: [], tags: [] });
assert.deepEqual(areas(stub(20, 4, 12)), [400], "8 ft across, cutting off 80 SF: one room, with the wall stopping in it");
assert.deepEqual(areas(stub(20, 4, 15)), [80, 320], "5 ft across: a short reach still closes");
assert.deepEqual(areas(stub(40, 20, 32)), [800, 800], "8 ft across, between two real rooms: two rooms");
// A guardrail closes a space, but a wall end doesn't stretch out to meet one: that made a false box in Project 1's corridor.
const niche = { walls: [...box(0, 0, 40, 20), line([20, 0], [20, 6])], doors: [], glazing: [], tags: [] };
assert.deepEqual(areas(R.levelRooms({ ...niche, walls: [...niche.walls, { ...line([0, 12], [40, 12]), kind: "railing" }] })), [320, 480], "The wall stopping above the rail stays stopped: the space above it isn't split");

// ── Floor openings: a big X in fine dashes marks a floor open to the level below ─────────────────────
const dashedLine = (a, b, width = 0.24, dash = 0.5, every = 2.4) => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, out = [];
  // A dash's ends are rounded as a drawing's are, so its own angle is rough.
  const rough = v => Math.round(v * 20) / 20;
  for (let t = 0; t + dash <= L; t += every) out.push({ a: [rough(a[0] + ux * t) * 9, rough(a[1] + uy * t) * 9], b: [rough(a[0] + ux * (t + dash)) * 9, rough(a[1] + uy * (t + dash)) * 9], width, color: "" });
  return out;
};
const cross = (x, y, w, h, ...rest) => [...dashedLine([x, y], [x + w, y + h], ...rest), ...dashedLine([x + w, y], [x, y + h], ...rest)];
const round1 = ps => ps.map(p => p.map(v => Math.round(v)));
assert.deepEqual(round1(O.floorOpenings(cross(10, 10, 60, 40), 9)), [[40, 30]], "An X in fine dashes, found at its crossing");
assert.deepEqual(round1(O.floorOpenings(cross(10, 10, 60, 100), 9)), [[40, 60]], "A long narrow opening too");
assert.equal(O.floorOpenings(dashedLine([10, 10], [70, 50]), 9).length, 0, "One dashed line is no X");
assert.equal(O.floorOpenings(cross(10, 10, 8, 6), 9).length, 0, "A small X isn't read: a shaft or a symbol");
assert.equal(O.floorOpenings(cross(10, 10, 60, 40, 0.72), 9).length, 0, "In a heavier pen it's something else");
assert.equal(O.floorOpenings([...dashedLine([10, 40], [70, 40]), ...dashedLine([40, 10], [40, 70])], 9).length, 0, "Dashed lines square to the sheet are hidden lines or grid lines");
assert.equal(O.floorOpenings([...dashedLine([10, 10], [70, 50]), ...dashedLine([70, 10], [50, 23.3])], 9).length, 0, "Crossing near one end isn't an X");
assert.equal(O.floorOpenings([{ a: [90, 90], b: [630, 450], width: 0.24, color: "" }, { a: [630, 90], b: [90, 450], width: 0.24, color: "" }], 9).length, 0, "Two solid lines aren't dashes");
assert.equal(O.floorOpenings(cross(10, 10, 60, 40), 9, [0, 0, 100, 100]).length, 0, "Only the plan's area counts");
// A space under an X is open, so it has no floor. Its neighbour isn't.
const overOpening = { walls: [...box(0, 0, 20, 10), line([10, 0], [10, 10])].map(w => ({ ...w, thickness: 0.5 })), doors: [], glazing: [], rooms: [], openings: [[5, 5]] };
assert.deepEqual(S.levelSpaces(overOpening).map(r => [r.area, !!r.open]).sort((p, q) => Number(p[1]) - Number(q[1])), [[100, false], [100, true]], "Open where the X is");
assert.deepEqual(S.levelSpaces({ ...overOpening, openings: undefined }).map(r => !!r.open), [false, false], "A model built before openings were read has floors");

// A level's spaces follow the estimator's corrections: a wall marked not a wall merges the two rooms.
const level = { walls: [...box(0, 0, 20, 10), line([10, 0], [10, 10])].map(w => ({ ...w, thickness: 0.5 })), doors: [], glazing: [], rooms: [] };
assert.deepEqual(areas(S.levelSpaces(level)), [100, 100]);
assert.deepEqual(areas(S.levelSpaces({ ...level, walls: level.walls.map((w, i) => i === 4 ? { ...w, excluded: true } : w) })), [200], "Not a wall: the rooms reflow");
assert.deepEqual(S.levelSpaces({ walls: undefined, rooms: [] }), [], "A model built before walls were read has no spaces");
// An operable partition divides the rooms either side of it, until the estimator says it isn't one.
const divided = { walls: box(0, 0, 20, 10).map(w => ({ ...w, thickness: 0.5 })), doors: [], glazing: [], rooms: [], partitions: [{ ...line([10, 0], [10, 10]), thickness: 0.35 }] };
assert.deepEqual(areas(S.levelSpaces(divided)), [100, 100], "A partition makes two rooms");
assert.deepEqual(areas(S.levelSpaces({ ...divided, partitions: [{ ...divided.partitions[0], excluded: true }] })), [200], "Not a partition: one room");
assert.deepEqual(areas(S.levelSpaces({ ...divided, partitions: undefined })), [200], "A model built before partitions were read still has its rooms");

console.log("Room detection checked: enclosed spaces, short wall ends extended, doors close openings, cased openings closed, wide openings left open, glass encloses, open sides and wall slivers are not rooms, rooms named by their tags, corrections reflow the rooms.");

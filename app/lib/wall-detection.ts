// Walls from a floor plan's vector lines (drawings to 3D, M1, 20 Oct). A cut wall is drawn as two
// parallel lines a wall's thickness apart, in the heavier line weights; this pairs them into centerlines
// with a thickness, then joins pieces broken by columns, tags or lines crossing. Deterministic geometry:
// the AI reads tags and names; it never places a wall. Pure; feet, x right and y down as on the plan.

import type { Point, Segment } from "./plan-vectors";

export type Wall = { a: Point; b: Point; thickness: number; /** Line weights of the faces, in points. */ weights: number[] };

export type WallOptions = {
  /** Page points per foot, from the printed scale (1/8" = 1'-0" is 9). */
  pointsPerFoot: number;
  /** Only lines at least this heavy, in points; walls are drawn in the cut weights. */
  minWeight: number;
  minThickness?: number; maxThickness?: number;
  /** Faces must run side by side for at least this long, in feet. */
  minOverlap?: number;
  /** Walls shorter than this are dropped (columns, tag boxes), in feet. */
  minLength?: number;
  /** Read a wall drawn in layers as one wall (mergeLayers). */
  layers?: boolean;
};

const ANGLE_TOLERANCE = (1 * Math.PI) / 180;
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);

type Line = { angle: number; offset: number; s0: number; s1: number; weight: number };

/** A segment in a frame turned so its direction is the x axis: offset is its distance across, s0..s1 along. */
function frame(angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    along: ([x, y]: Point) => x * c + y * s,
    across: ([x, y]: Point) => -x * s + y * c,
    point: (along: number, across: number): Point => [along * c - across * s, along * s + across * c],
  };
}

const distanceToLine = (p: Point, l: { a: Point; b: Point }) => {
  const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], t = Math.max(0, Math.min(1, ((p[0] - l.a[0]) * dx + (p[1] - l.a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (l.a[0] + t * dx), p[1] - (l.a[1] + t * dy));
};
/** Whether a point lies within a wall's thickness. */
const withinWall = (p: Point, w: Wall) => {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
  const t = (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uy, off = Math.abs((p[0] - w.a[0]) * uy - (p[1] - w.a[1]) * ux);
  return t >= -0.2 && t <= L + 0.2 && off <= w.thickness / 2 + 0.05;
};

const segLength = (s: Segment) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const inBox =(box: [number, number, number, number] | undefined) => (s: Segment) =>
  !box || [s.a, s.b].every(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]);

/** A straight line across more than this share of the drawing's width or height is its frame or a divider, not a wall. */
export const FRAME_SHARE = 0.6;

/**
 * The line weight walls are drawn in: the heaviest weight whose own lines mostly pair up at a wall's
 * thickness (on Jelleff's plans 1.2 pt pairs 76-78%, while the heavier 1.8 pt callout boxes and borders
 * pair 0%, and the 0.48 pt layers and casework 43%). Null when no weight does; then walls can't be told
 * apart by weight and none are found. `box` limits it to the plan's area, in page points.
 *
 * The sheet's frame and the title block's dividers are often drawn in the wall pen and never pair, so lines running most of
 * the drawing's width or height don't count (FRAME_SHARE). Without that, a plan with few walls fell short: Davey Lopes'
 * A102, mostly low roofs, paired 35% at its 0.84 pt wall pen with the frame and 61% without.
 */
export function wallWeight(segments: Segment[], pointsPerFoot: number, box?: [number, number, number, number]): { weight: number; paired: number } | null {
  const all = segments.filter(inBox(box)).filter(s => segLength(s) >= 0.5 * pointsPerFoot);
  const xs = all.flatMap(s => [s.a[0], s.b[0]]), ys = all.flatMap(s => [s.a[1], s.b[1]]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const horizontal = (s: Segment) => Math.abs(s.a[1] - s.b[1]) < 1, vertical = (s: Segment) => Math.abs(s.a[0] - s.b[0]) < 1;
  const long = (s: Segment) => (horizontal(s) && Math.abs(s.b[0] - s.a[0]) > FRAME_SHARE * width) || (vertical(s) && Math.abs(s.b[1] - s.a[1]) > FRAME_SHARE * height);
  // A long wall face has its other face beside it, a wall's thickness away in the same pen; a frame line has none.
  const across = (s: Segment) => horizontal(s) ? (s.a[1] + s.b[1]) / 2 : (s.a[0] + s.b[0]) / 2;
  const partnered = (s: Segment) => all.some(t => t !== s && Math.abs(t.width - s.width) < 0.005 && (horizontal(s) ? horizontal(t) : vertical(t))
    && Math.abs(across(t) - across(s)) >= 0.2 * pointsPerFoot && Math.abs(across(t) - across(s)) <= 2 * pointsPerFoot && segLength(t) >= 0.5 * segLength(s));
  const lines = all.filter(s => !long(s) || partnered(s));
  for (const weight of [...new Set(lines.map(s => Math.round(s.width * 100) / 100))].sort((a, b) => b - a)) {
    const own = lines.filter(s => Math.abs(s.width - weight) < 0.005);
    const total = own.reduce((t, s) => t + segLength(s), 0) / pointsPerFoot;
    if (total < 100) continue; // a handful of lines says nothing
    const paired = 2 * detectWalls(own, { pointsPerFoot, minWeight: 0 }).reduce((t, w) => t + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0) / total;
    if (paired >= 0.5) return { weight, paired };
  }
  return null;
}

/**
 * Walls on a plan: the wall weight is found (wallWeight), pairs are matched (detectWalls) and ends are
 * joined at corners and tees (joinWalls). Feet in the sheet's frame (page points / pointsPerFoot).
 */
export function planWalls(segments: Segment[], pointsPerFoot: number, box?: [number, number, number, number]): { walls: Wall[]; weight: number | null; note: string } {
  const found = wallWeight(segments, pointsPerFoot, box);
  if (!found) return { walls: [], weight: null, note: "No line weight on this sheet pairs up like walls, so no walls were placed. It may be a scan, or drawn without line weights." };
  const walls = joinWalls(detectWalls(segments.filter(inBox(box)), { pointsPerFoot, minWeight: found.weight - 0.005, layers: true }));
  return { walls, weight: found.weight, note: `Walls are the ${found.weight} pt lines (${Math.round(found.paired * 100)}% of them pair at a wall's thickness).` };
}

/**
 * Glass: a storefront, window or glass partition's pane is two lines 0.6-1.8" apart, drawn lighter than the
 * walls (Jelleff: 0.72 pt panes 1" apart between 0.24 pt frame lines, walls at 1.2 pt). Bays join across
 * their mullions; runs shorter than 2 ft are left out. Nothing without a wall weight (a scan).
 */
export function planGlazing(segments: Segment[], pointsPerFoot: number, wallWeight: number | null, walls: Wall[], box?: [number, number, number, number], leaves: [Point, Point][] = [], tags: Point[] = []): Wall[] {
  if (wallWeight === null) return [];
  const light = segments.filter(inBox(box)).filter(s => s.width >= 0.3 && s.width < wallWeight - 0.005);
  const panes = detectWalls(light, { pointsPerFoot, minWeight: 0.3, minThickness: 0.05, maxThickness: 0.15, minOverlap: 1, minLength: 2 });
  // A wall's inner layers (insulation, sheathing) are light lines a pane's width apart too: glass is never inside a wall.
  const insideWall = (p: Point) => walls.some(w => withinWall(p, w));
  // An open door leaf is drawn as a thin rectangle a pane's width across: glass is never along a door's leaf.
  const alongLeaf = (g: Wall) => leaves.some(([h, o]) => {
    const L = Math.hypot(o[0] - h[0], o[1] - h[1]) || 1, ux = (o[0] - h[0]) / L, uy = (o[1] - h[1]) / L;
    return [g.a, g.b].every(p => { const t = (p[0] - h[0]) * ux + (p[1] - h[1]) * uy; return t >= -0.5 && t <= L + 0.5 && Math.abs((p[0] - h[0]) * uy - (p[1] - h[1]) * ux) <= 0.4; });
  });
  // A run of glass can pass a wall or a pier: only the stretch inside the wall comes out, and what's left stays if it's long enough.
  const outsideWalls = (g: Wall): Wall[] => {
    const L = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), at = (t: number): Point => [g.a[0] + (g.b[0] - g.a[0]) * t / L, g.a[1] + (g.b[1] - g.a[1]) * t / L];
    const out: Wall[] = [];
    let start: number | null = null;
    const STEP = 0.25;
    for (let t = 0; ; t = Math.min(L, t + STEP)) {
      const inWall = insideWall(at(t));
      if (!inWall && start === null) start = t;
      if ((inWall || t >= L) && start !== null) {
        if (t - start >= 2) out.push({ ...g, a: at(start), b: at(t) });
        start = null;
      }
      if (t >= L) break;
    }
    return out;
  };
  // A pane too short to count on its own is glass when its own tag is right beside it (Project 1: SF-24, one 1.7 ft pane between
  // a door and a wall, which also closes that room). Read apart, so a short pair doesn't take faces from the long ones.
  const length = (g: Wall) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), mid = (g: Wall): Point => [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
  const tagged = !tags.length ? [] : detectWalls(light, { pointsPerFoot, minWeight: 0.3, minThickness: 0.05, maxThickness: 0.15, minOverlap: 1, minLength: GLASS_TAGGED_MIN_FEET })
    .filter(g => length(g) < 2 && !insideWall(mid(g)) && !panes.some(p => distanceToLine(mid(g), p) < 0.3) && tags.some(t => distanceToLine(t, g) <= GLASS_TAGGED_REACH_FEET));
  const glass = [...panes.flatMap(outsideWalls), ...tagged].filter(g => !alongLeaf(g));
  // Glass stands in a wall or a run of glass. A short pair of light lines touching nothing, in the middle of a room, is
  // something else (Project 1: a 3 ft pair in a vestibule, which split the room in two).
  const nearLine = (p: Point, l: { a: Point; b: Point }) => distanceToLine(p, l) <= GLASS_REACH_FEET;
  const standing = glass.filter(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) >= GLASS_ALONE_FEET || [g.a, g.b].some(p => walls.some(w => nearLine(p, w)) || glass.some(o => o !== g && nearLine(p, o))));
  // On a sheet that tags its glass, a thin pair far from every tag is something else: a roof edge below, a coping, a railing
  // (Project 1: a 42 ft run and a 20 ft run of roof edge). A sheet with few tags says nothing either way.
  if (tags.length < GLASS_TAGS_TO_TRUST) return standing;
  return standing.filter(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) < GLASS_TAG_MIN_FEET || tags.some(t => distanceToLine(t, g) <= GLASS_TAG_REACH_FEET));
}

/** How close each end of an operable partition must come to the wall or glass it closes against. */
const PARTITION_REACH_FEET = 1.5;
/** A partition's panel joints: this far apart, and evenly spaced to within this. */
const PANEL_MIN_FEET = 2.5, PANEL_MAX_FEET = 6, PANEL_SPREAD_FEET = 0.5;
/** Fewer spaces between joints than this isn't a pattern. A partition of two panels isn't read. */
const PANELS_TO_TRUST = 2;

/**
 * Operable partitions: two light lines 3-6.6" apart, 8 ft or longer, running across a room from wall to wall with panel joints
 * drawn between them at even spacing (Project 1: 0.48 pt lines 4.2" apart, joints every 3.9 ft). The joints tell one from a
 * storefront's frame, which also has them but holds glass; from a stair's treads, which have none; and from light lines that
 * reach no wall (a roof edge above, in panels of its own). Nothing without a wall weight (a scan).
 */
/** Partitions are drawn at least this heavy, in points (Project 1: 0.48). Davey Lopes draws its 45 ft one at 0.24 with no joint lines, so it isn't read. */
export const PARTITION_MIN_PEN = 0.3;

export function planPartitions(segments: Segment[], pointsPerFoot: number, wallWeight: number | null, walls: Wall[], glazing: { a: Point; b: Point }[], box?: [number, number, number, number]): Wall[] {
  if (wallWeight === null) return [];
  const plan = segments.filter(inBox(box));
  const reaches = (p: Point) => walls.some(w => distanceToLine(p, w) <= w.thickness / 2 + PARTITION_REACH_FEET) || glazing.some(g => distanceToLine(p, g) <= PARTITION_REACH_FEET);
  const midpoint = (l: { a: Point; b: Point }): Point => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
  const found: Wall[] = [];
  for (const weight of new Set(plan.map(s => Math.round(s.width * 100) / 100))) {
    if (weight < PARTITION_MIN_PEN || weight >= wallWeight - 0.005) continue;
    const own = plan.filter(s => Math.abs(s.width - weight) < 0.005);
    for (const pair of detectWalls(own, { pointsPerFoot, minWeight: 0, minThickness: 0.25, maxThickness: 0.55, minOverlap: 1, minLength: 8 })) {
      const L = dist(pair.a, pair.b), ux = (pair.b[0] - pair.a[0]) / L, uy = (pair.b[1] - pair.a[1]) / L;
      const along = (p: Point) => (p[0] - pair.a[0]) * ux + (p[1] - pair.a[1]) * uy, across = (p: Point) => Math.abs((p[0] - pair.a[0]) * uy - (p[1] - pair.a[1]) * ux);
      const between = (p: Point, share: number) => along(p) > 0 && along(p) < L && across(p) <= share * pair.thickness;
      if (walls.some(w => withinWall(midpoint(pair), w)) || !reaches(pair.a) || !reaches(pair.b)) continue;
      if (glazing.some(g => between(midpoint(g), 0.5))) continue;
      // Joints: short lines straight across, from face to face, away from the ends. (Faces that merely break at even intervals
      // aren't enough: counting them found false partitions on Project 1 and East Providence, and still missed Davey Lopes'.)
      const joints = plan.flatMap(s => {
        const a: Point = [s.a[0] / pointsPerFoot, s.a[1] / pointsPerFoot], b: Point = [s.b[0] / pointsPerFoot, s.b[1] / pointsPerFoot], length = dist(a, b), m = midpoint({ a, b });
        if (length < 0.7 * pair.thickness || length > 1.4 * pair.thickness) return [];
        if (Math.abs((b[0] - a[0]) * ux + (b[1] - a[1]) * uy) / length > 0.17 || !between(m, 0.3) || along(m) < 0.3 || along(m) > L - 0.3) return [];
        return [along(m)];
      }).sort((p, q) => p - q);
      const at = joints.filter((t, i) => i === 0 || t - joints[i - 1] > 0.2), spaces = at.slice(1).map((t, i) => t - at[i]);
      if (spaces.length < PANELS_TO_TRUST || Math.min(...spaces) < PANEL_MIN_FEET || Math.max(...spaces) > PANEL_MAX_FEET || Math.max(...spaces) - Math.min(...spaces) > PANEL_SPREAD_FEET) continue;
      found.push(pair);
    }
  }
  return found;
}

/** A pane shorter than 2 ft needs its own tag within this reach, and to be at least this long. */
const GLASS_TAGGED_REACH_FEET = 4, GLASS_TAGGED_MIN_FEET = 1.25;
/** At least this many hexagon tags on a sheet before their absence means anything. */
const GLASS_TAGS_TO_TRUST = 5;
/** Storefronts and curtain walls are tagged along their length: glass has a tag within this. */
const GLASS_TAG_REACH_FEET = 25;
/** Shorter pieces aren't judged by tags: a corner's small return has no tag of its own, and can be what closes a room. */
const GLASS_TAG_MIN_FEET = 4;

/** How close an end of a guardrail must come to a wall, glass or another guardrail (one that stands) for it to stand. */
const RAIL_REACH_FEET = 1.5;
/** Running this near a wall or glass, light lines belong to it: a lining, a pad, a frame. */
const RAIL_APART_FEET = 1;
/** This many other lines beside a pair, within this much, are a pattern: stair treads, paving. */
const RAIL_PATTERN_LINES = 3, RAIL_PATTERN_FEET = 1.5;

/**
 * Guardrails: two light lines 1.8-3" apart, 8 ft or longer, standing clear of walls and glass, with an end at one of them or at
 * another guardrail that is, in a chain (Project 1: 0.24 pt lines 1.9" apart around the opening to the lobby below). They keep a corridor apart from
 * the void beside it. A stair's own rail reads the same way, and is a rail too. Nothing without a wall weight (a scan).
 */
export function planRailings(segments: Segment[], pointsPerFoot: number, wallWeight: number | null, walls: Wall[], glazing: { a: Point; b: Point }[], box?: [number, number, number, number]): Wall[] {
  if (wallWeight === null) return [];
  const plan = segments.filter(inBox(box));
  const midpoint = (l: { a: Point; b: Point }): Point => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
  const pairs: Wall[] = [];
  for (const weight of new Set(plan.map(s => Math.round(s.width * 100) / 100))) {
    if (weight >= wallWeight - 0.005) continue;
    const own = plan.filter(s => Math.abs(s.width - weight) < 0.005);
    for (const pair of detectWalls(own, { pointsPerFoot, minWeight: 0, minThickness: 0.15, maxThickness: 0.25, minOverlap: 1, minLength: 8 })) {
      const L = dist(pair.a, pair.b), ux = (pair.b[0] - pair.a[0]) / L, uy = (pair.b[1] - pair.a[1]) / L, m = midpoint(pair);
      if (walls.some(w => distanceToLine(m, w) <= w.thickness / 2 + RAIL_APART_FEET) || glazing.some(g => distanceToLine(m, g) <= RAIL_APART_FEET)) continue;
      const offsets = new Set<number>();
      for (const s of own) {
        const a: Point = [s.a[0] / pointsPerFoot, s.a[1] / pointsPerFoot], b: Point = [s.b[0] / pointsPerFoot, s.b[1] / pointsPerFoot], length = dist(a, b);
        if (length < 3 || Math.abs((b[0] - a[0]) * uy - (b[1] - a[1]) * ux) / length > 0.02) continue;
        const c = midpoint({ a, b }), along = (c[0] - pair.a[0]) * ux + (c[1] - pair.a[1]) * uy, across = (c[0] - m[0]) * -uy + (c[1] - m[1]) * ux;
        if (along > 0 && along < L && Math.abs(across) > pair.thickness / 2 + 0.05 && Math.abs(across) <= RAIL_PATTERN_FEET) offsets.add(Math.round(across * 20));
      }
      if (offsets.size < RAIL_PATTERN_LINES) pairs.push(pair);
    }
  }
  // A guardrail is held by the building: an end at a wall or glass, or at a guardrail that is, in a chain. Lines that only meet each
  // other (a gym's court markings, East Providence's A1.0: 46 pairs, 932 ft) stand nowhere.
  const anchored = (p: Point) => walls.some(w => distanceToLine(p, w) <= w.thickness / 2 + RAIL_REACH_FEET) || glazing.some(g => distanceToLine(p, g) <= RAIL_REACH_FEET);
  const held = new Set(pairs.filter(pair => anchored(pair.a) || anchored(pair.b)));
  for (let grew = true; grew;) {
    grew = false;
    for (const pair of pairs) if (!held.has(pair) && [pair.a, pair.b].some(p => [...held].some(o => distanceToLine(p, o) <= RAIL_REACH_FEET))) { held.add(pair); grew = true; }
  }
  return pairs.filter(pair => held.has(pair));
}

/** A column: a closed rectangle on the plan with these sides, in feet, no longer than this many times its width. */
const COLUMN_MIN_FEET = 0.5, COLUMN_MAX_FEET = 1.5, COLUMN_MAX_ASPECT = 2.5;
/** Columns are cut, so drawn nearly as heavy as walls: at least this share of the wall weight. Room tag boxes are lighter. */
const COLUMN_WEIGHT_SHARE = 0.7;
/** The same column drawn more than once, nested or in two pens, counts once: the outermost, within this. */
const COLUMN_SAME_FEET = 0.75;

/**
 * Whether a pen is black or a dark grey. A coloured square is another trade's symbol (Project 1: brown floor drains, 0.5 ft square,
 * in the wall weight), and a pale grey one is drawn from a level above or below. No colour read counts as black.
 */
function darkNeutral(color: string): boolean {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!hex) return true;
  const [r, g, b] = hex.slice(1).map(v => parseInt(v, 16));
  return Math.max(r, g, b) <= 0x60 && Math.max(r, g, b) - Math.min(r, g, b) <= 8;
}

/** A column on a plan: its center, its sides in feet, and the angle of `width` in radians. */
export type Column = { at: Point; width: number; depth: number; angle: number };

/**
 * Columns: small closed rectangles in the heavy pens, standing clear of the walls (Project 1: steel columns 0.7 ft square at the
 * gym's grid, and 0.5 ft square posts inside the building). Any rotation, so the skewed wing's columns read too. A column inside a
 * wall's thickness is part of that wall. Larger furred enclosures aren't read. Nothing without a wall weight (a scan).
 */
export function planColumns(segments: Segment[], pointsPerFoot: number, wallWeight: number | null, walls: Wall[], box?: [number, number, number, number]): Column[] {
  if (wallWeight === null) return [];
  const minWeight = COLUMN_WEIGHT_SHARE * wallWeight, key = (p: Point) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const near = (p: Point, q: Point) => dist(p, q) < 0.15;
  const found: Column[] = [];
  for (const weight of new Set(segments.filter(inBox(box)).map(s => Math.round(s.width * 100) / 100))) {
    if (weight < minWeight || weight > wallWeight + 0.005) continue;
    const own = segments.filter(inBox(box)).filter(s => Math.abs(s.width - weight) < 0.005 && darkNeutral(s.color))
      .map(s => ({ a: [s.a[0] / pointsPerFoot, s.a[1] / pointsPerFoot] as Point, b: [s.b[0] / pointsPerFoot, s.b[1] / pointsPerFoot] as Point }))
      .filter(s => dist(s.a, s.b) >= COLUMN_MIN_FEET - 0.05 && dist(s.a, s.b) <= COLUMN_MAX_FEET + 0.05);
    // Corners are found through their neighbours in a half-foot grid, so a corner on a grid line's far side is looked for there too.
    const at = new Map<string, typeof own>();
    const add = (p: Point, s: (typeof own)[number]) => { for (const dx of [-0.2, 0, 0.2]) for (const dy of [-0.2, 0, 0.2]) { const k = key([p[0] + dx, p[1] + dy]), list = at.get(k) ?? []; if (!list.includes(s)) list.push(s); at.set(k, list); } };
    for (const s of own) { add(s.a, s); add(s.b, s); }
    for (const s of own) for (const t of at.get(key(s.b)) ?? []) {
      if (t === s || !(near(t.a, s.b) || near(t.b, s.b))) continue;
      const c = near(t.a, s.b) ? t.b : t.a, w = dist(s.a, s.b), h = dist(c, s.b);
      if (Math.abs((s.b[0] - s.a[0]) * (c[0] - s.b[0]) + (s.b[1] - s.a[1]) * (c[1] - s.b[1])) / (w * h) > 0.1) continue;
      if (Math.max(w, h) / Math.min(w, h) > COLUMN_MAX_ASPECT) continue;
      // The fourth corner, reached along the other two sides.
      const d: Point = [s.a[0] + c[0] - s.b[0], s.a[1] + c[1] - s.b[1]];
      const side = (p: Point, q: Point) => (at.get(key(p)) ?? []).some(u => (near(u.a, p) && near(u.b, q)) || (near(u.b, p) && near(u.a, q)));
      if (!side(c, d) || !side(s.a, d)) continue;
      const center: Point = [(s.a[0] + c[0]) / 2, (s.a[1] + c[1]) / 2];
      if (walls.some(v => withinWall(center, v))) continue;
      found.push({ at: center, width: w, depth: h, angle: Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) });
    }
  }
  // Each rectangle was found from each of its corners, and a column may be drawn nested: keep the largest in each place.
  const largestFirst = [...found].sort((p, q) => q.width * q.depth - p.width * p.depth), kept: Column[] = [];
  for (const c of largestFirst) if (!kept.some(k => dist(k.at, c.at) < COLUMN_SAME_FEET)) kept.push(c);
  return kept;
}

/** A hexagon tag on a plan, in page points: SF-12 (storefront) or CW-1 (curtain wall) on Project 1. */
export type HexagonTag = { at: Point; side: number };

/** Closed regular hexagons with sides this long in feet: tags, not drawn parts of the building. */
export function hexagonTags(segments: Segment[], pointsPerFoot: number): HexagonTag[] {
  const key = (p: Point) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 4)}`;
  const edges = new Map<string, Point[]>();
  const seen = new Set<string>();
  for (const s of segments) {
    const L = dist(s.a, s.b) / pointsPerFoot;
    if (L < 0.5 || L > 3) continue;
    const id = [key(s.a), key(s.b)].sort().join("|");
    if (seen.has(id)) continue; // a line drawn twice is one edge
    seen.add(id);
    edges.set(key(s.a), [...(edges.get(key(s.a)) ?? []), s.b]);
    edges.set(key(s.b), [...(edges.get(key(s.b)) ?? []), s.a]);
  }
  const found: HexagonTag[] = [];
  const within = (at: Point) => found.some(t => dist(t.at, at) < t.side * 0.5);
  for (const list of edges.values()) for (const first of list) {
    // From each corner, walk around: six equal sides, each turning 60 degrees the same way.
    for (const next of edges.get(key(first)) ?? []) {
      const path: Point[] = [first, next];
      const side = dist(first, next);
      let turn = 0;
      for (let i = 0; i < 4; i++) {
        const [p, q] = [path[path.length - 2], path[path.length - 1]];
        const step = (edges.get(key(q)) ?? []).find(r => {
          if (key(r) === key(p) || Math.abs(dist(q, r) - side) > 0.1 * side) return false;
          const a = Math.atan2(q[1] - p[1], q[0] - p[0]), b = Math.atan2(r[1] - q[1], r[0] - q[0]);
          let d = ((b - a) * 180) / Math.PI;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          if (Math.abs(Math.abs(d) - 60) > 6 || (turn && Math.sign(d) !== turn)) return false;
          turn = Math.sign(d);
          return true;
        });
        if (!step) break;
        path.push(step);
      }
      if (path.length !== 6) continue;
      // The sixth side is drawn, back to the first corner.
      if (!(edges.get(key(path[5])) ?? []).some(p => key(p) === key(first))) continue;
      const at: Point = [path.reduce((t, p) => t + p[0], 0) / 6, path.reduce((t, p) => t + p[1], 0) / 6];
      if (!within(at)) found.push({ at, side });
    }
  }
  return found;
}

/** How close glass must come to a wall or other glass to stand in it. */
const GLASS_REACH_FEET = 2;
/** Glass this long is glass even standing alone (a freestanding storefront). */
const GLASS_ALONE_FEET = 20;

/**
 * Extends wall ends to meet the wall they run into, so corners and tees close: an end moves to the
 * crossing of the two centerlines when that crossing is within the other wall's half-thickness plus a
 * foot of the end, and lies on (or a foot past the end of) the other wall.
 */
export function joinWalls(walls: Wall[]): Wall[] {
  const out = walls.map(w => ({ ...w, a: [...w.a] as Point, b: [...w.b] as Point }));
  const dir = (w: Wall) => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]; };
  for (const w of out) {
    const d = dir(w);
    for (const end of ["a", "b"] as const) {
      const p = w[end], outward = end === "b" ? d : [-d[0], -d[1]];
      let best: { at: Point; reach: number } | null = null;
      for (const o of out) {
        if (o === w) continue;
        const e = dir(o), cross = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(cross) < Math.sin((20 * Math.PI) / 180)) continue; // roughly parallel: not a junction
        // p + t·outward meets o.a + u·e
        const t = ((o.a[0] - p[0]) * e[1] - (o.a[1] - p[1]) * e[0]) / (outward[0] * e[1] - outward[1] * e[0]);
        const u = ((o.a[0] - p[0]) * outward[1] - (o.a[1] - p[1]) * outward[0]) / (outward[0] * e[1] - outward[1] * e[0]);
        const oLen = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
        if (t < -o.thickness / 2 - 0.25 || t > o.thickness / 2 + 1 || u < -1 || u > oLen + 1) continue;
        if (!best || Math.abs(t) < best.reach) best = { at: [p[0] + t * outward[0], p[1] + t * outward[1]], reach: Math.abs(t) };
      }
      if (best) w[end] = best.at;
    }
  }
  return out;
}

/**
 * Lines of one direction without the dashes of dashed lines. Overhead and hidden lines are drawn dashed,
 * and a heavy dashed line's dashes (Jelleff: 1 ft dashes, 0.5 ft gaps, at 1.8 pt) paired with a wall face
 * into a thin false wall. Dashes: 3 or more pieces of at most 1.5 ft on one line, in one weight, with real
 * gaps of up to 1 ft between them. A wall face broken at crossings has longer or touching pieces.
 */
function withoutDashes(lines: Line[]): Line[] {
  const dashes = new Set<Line>(), short = (l: Line) => l.s1 - l.s0 <= 1.5;
  const flush = (run: Line[]) => { if (run.length >= 3) run.forEach(d => dashes.add(d)); };
  const sorted = [...lines].sort((p, q) => p.weight - q.weight || p.offset - q.offset);
  for (let i = 0; i < sorted.length;) {
    // One drawn line: the same weight, offsets within 0.03 ft of the previous; its pieces in order along it.
    let j = i + 1;
    while (j < sorted.length && Math.abs(sorted[j].weight - sorted[i].weight) < 0.005 && sorted[j].offset - sorted[j - 1].offset < 0.03) j++;
    const pieces = sorted.slice(i, j).sort((p, q) => p.s0 - q.s0);
    let run: Line[] = [];
    for (const p of pieces) {
      const last = run[run.length - 1], gap = last ? p.s0 - last.s1 : 0;
      if (last && short(p) && gap > 0.1 && gap <= 1) run.push(p);
      else { flush(run); run = short(p) ? [p] : []; }
    }
    flush(run);
    i = j;
  }
  return lines.filter(l => !dashes.has(l));
}

/**
 * Pieces of one straight line drawn end to end, as one line. A face drawn in pieces shorter than minOverlap (Project 1:
 * a recess's back wall in 0.8-1 ft lengths, 0.04 ft apart) could otherwise never pair.
 */
function joinTouching(lines: Line[]): Line[] {
  // Each piece is compared with the end of the run it would extend. A line a fraction of a degree off its group's angle
  // drifts across the group as it runs, so a whole group by offset could take in both faces of a thin pair (glass panes).
  const runs: { line: Line; lastOffset: number; total: number; length: number }[] = [];
  for (const l of [...lines].sort((p, q) => p.s0 - q.s0)) {
    const run = runs.find(r => Math.abs(r.line.weight - l.weight) < 0.005 && Math.abs(r.lastOffset - l.offset) < 0.03 && l.s0 - r.line.s1 <= 0.1);
    const length = l.s1 - l.s0;
    if (!run) { runs.push({ line: { ...l }, lastOffset: l.offset, total: l.offset * length, length }); continue; }
    run.line.s1 = Math.max(run.line.s1, l.s1); run.lastOffset = l.offset; run.total += l.offset * length; run.length += length;
  }
  return runs.map(r => ({ ...r.line, offset: r.length ? r.total / r.length : r.line.offset }));
}

/** How many times the pairing is redone after giving back faces held by pairs too short to be walls. */
const PAIRING_PASSES = 4;

/** A stretch along one direction, without what's in `taken`. */
const minus = (parts: [number, number][], taken: [number, number][]) => {
  for (const [c0, c1] of taken) parts = parts.flatMap(([a, b]): [number, number][] => c1 <= a || c0 >= b ? [[a, b]] : [[a, Math.max(a, c0)], [Math.min(b, c1), b]].filter(([x, y]) => y - x > 1e-6) as [number, number][]);
  return parts;
};

type Band = { center: number; thickness: number; s0: number; s1: number; weights: number[] };

/** Two walls this close across, or one inside the other, are layers of one wall. */
const LAYER_TOUCH_FEET = 1 / 12;
/** A spare line this close beside a wall is its far face: a layer of block up to 12" (Project 1: 8" block on a 4" stud wall). */
const LAYER_REACH_FEET = 1;
/** Side by side for less than this isn't a layered wall: a pier, a jamb. */
const LAYER_MIN_FEET = 3;
/** A layer running on past the others by less than this goes with them. */
const LAYER_STUB_FEET = 1;

/**
 * One wall where a wall is drawn in layers. Pairing takes the narrowest pair first, which reads a layered wall wrongly in two
 * ways: four lines (Project 1's shaft walls) give a thin pair inside a thick one, counting the wall twice, and three lines (8"
 * block with 4" studs) give the thin layer alone, leaving the block's face over. On the stretch they share, the wall becomes
 * as thick as its outermost lines. Only the total thickness is kept, not the layers.
 */
function mergeLayers(walls: Band[], spare: Band[]): Band[] {
  const edges = (w: Band) => [w.center - w.thickness / 2, w.center + w.thickness / 2];
  // p and q as one wall on the stretch they share; what either runs on beyond it stays as it was.
  const merged = (p: Band, q: Band): Band[] => {
    const s0 = Math.max(p.s0, q.s0), s1 = Math.min(p.s1, q.s1), [pl, ph] = edges(p), [ql, qh] = edges(q);
    const lo = Math.min(pl, ql), hi = Math.max(ph, qh), one: Band = { center: (lo + hi) / 2, thickness: hi - lo, s0, s1, weights: [...p.weights, ...q.weights] };
    const rest: Band[] = [];
    for (const w of [p, q]) for (const [a, b] of [[w.s0, s0], [s1, w.s1]]) {
      if (b - a >= LAYER_STUB_FEET) rest.push({ ...w, s0: a, s1: b });
      else if (b - a > 0) { one.s0 = Math.min(one.s0, a); one.s1 = Math.max(one.s1, b); }
    }
    return [one, ...rest];
  };
  const out = [...walls];
  const mergeTouching = () => {
    for (let again = true; again;) {
      again = false;
      search: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const [pl, ph] = edges(out[i]), [ql, qh] = edges(out[j]);
        if (Math.min(out[i].s1, out[j].s1) - Math.max(out[i].s0, out[j].s0) < LAYER_MIN_FEET || Math.max(pl, ql) - Math.min(ph, qh) > LAYER_TOUCH_FEET) continue;
        const parts = merged(out[i], out[j]);
        out.splice(j, 1); out.splice(i, 1, ...parts);
        again = true;
        break search;
      }
    }
  };
  mergeTouching();
  for (const line of spare) {
    let open: [number, number][] = [[line.s0, line.s1]];
    for (;;) {
      // The nearest wall beside what's left of the line. A line inside a wall changes nothing.
      let best: { wall: Band; gap: number; s0: number; s1: number } | null = null;
      for (const wall of out) {
        const [lo, hi] = edges(wall), gap = line.center < lo ? lo - line.center : line.center > hi ? line.center - hi : null;
        if (gap === null || gap > LAYER_REACH_FEET) continue;
        for (const [a, b] of open) {
          const s0 = Math.max(a, wall.s0), s1 = Math.min(b, wall.s1);
          if (s1 - s0 >= LAYER_MIN_FEET && (!best || gap < best.gap)) best = { wall, gap, s0, s1 };
        }
      }
      if (!best) break;
      out.splice(out.indexOf(best.wall), 1, ...merged(best.wall, { ...line, s0: best.s0, s1: best.s1 }));
      open = minus(open, [[best.s0, best.s1]]);
    }
  }
  mergeTouching();
  return out;
}

export function detectWalls(segments: Segment[], opts: WallOptions): Wall[] {
  const { pointsPerFoot, minWeight, minThickness = 0.2, maxThickness = 2, minOverlap = 1, minLength = 2, layers = false } = opts;
  const ft = (p: Point): Point => [p[0] / pointsPerFoot, p[1] / pointsPerFoot];

  // Straight heavy lines, at least half a foot long, grouped by direction.
  const groups = new Map<number, { angle: number; lines: Line[] }>();
  for (const seg of segments) {
    if (seg.width < minWeight) continue;
    const a = ft(seg.a), b = ft(seg.b);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue;
    let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (angle < 0) angle += Math.PI;
    if (angle >= Math.PI - ANGLE_TOLERANCE / 2) angle -= Math.PI;
    const key = Math.round(angle / ANGLE_TOLERANCE);
    const group = groups.get(key) ?? { angle: key * ANGLE_TOLERANCE, lines: [] };
    const f = frame(group.angle);
    const [u, v] = [f.along(a), f.along(b)].sort((x, y) => x - y);
    group.lines.push({ angle: group.angle, offset: (f.across(a) + f.across(b)) / 2, s0: u, s1: v, weight: seg.width });
    groups.set(key, group);
  }

  const walls: Wall[] = [];
  for (const { angle, lines: all } of groups.values()) {
    const f = frame(angle), lines = joinTouching(withoutDashes(all));
    lines.sort((p, q) => p.offset - q.offset);
    // Candidate face pairs: parallel lines a wall's thickness apart, running beside each other.
    const candidates: { i: number; j: number; gap: number; s0: number; s1: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length && lines[j].offset - lines[i].offset <= maxThickness; j++) {
        const gap = lines[j].offset - lines[i].offset;
        if (gap < minThickness) continue;
        const s0 = Math.max(lines[i].s0, lines[j].s0), s1 = Math.min(lines[i].s1, lines[j].s1);
        if (s1 - s0 >= minOverlap) candidates.push({ i, j, gap, s0, s1 });
      }
    }
    // Narrowest first, and a stretch of line is a face of one wall only (a face has the room on its other
    // side): two 4" walls with a chase between them are two walls, not a third one across the chase.
    candidates.sort((p, q) => p.gap - q.gap);
    type Piece = Band & { pair: string };
    type Run = Band & { pieces: Piece[] };
    // A pair too short to be a wall (a stair's edge beside a face, a jamb) mustn't keep the face from its real partner: its
    // stretch is given back and the pairing done again without it.
    const refused = new Map<string, [number, number][]>();
    let runs: Run[] = [];
    let claimed: [number, number][][] = [];
    for (let pass = 0; pass < PAIRING_PASSES; pass++) {
      claimed = lines.map(() => []);
      const pieces: Piece[] = [];
      for (const c of candidates) {
        const pair = `${c.i}:${c.j}`;
        const open = minus(minus(minus([[c.s0, c.s1]], refused.get(pair) ?? []), claimed[c.i]), claimed[c.j]);
        for (const [a, b] of open) {
          if (b - a < minOverlap) continue;
          claimed[c.i].push([a, b]); claimed[c.j].push([a, b]);
          pieces.push({ pair, center: (lines[c.i].offset + lines[c.j].offset) / 2, thickness: c.gap, s0: a, s1: b, weights: [lines[c.i].weight, lines[c.j].weight] });
        }
      }
      // Join pieces on the same centerline and thickness that touch or nearly touch.
      pieces.sort((p, q) => p.center - q.center || p.s0 - q.s0);
      const used = new Array(pieces.length).fill(false);
      runs = [];
      for (let i = 0; i < pieces.length; i++) {
        if (used[i]) continue;
        const run: Run = { ...pieces[i], weights: [...pieces[i].weights], pieces: [pieces[i]] };
        used[i] = true;
        for (let grew = true; grew;) {
          grew = false;
          for (let j = 0; j < pieces.length; j++) {
            const q = pieces[j];
            if (used[j] || Math.abs(q.center - run.center) > 0.15 || Math.abs(q.thickness - run.thickness) > 0.1) continue;
            if (q.s0 > run.s1 + 0.5 || q.s1 < run.s0 - 0.5) continue;
            run.s0 = Math.min(run.s0, q.s0); run.s1 = Math.max(run.s1, q.s1); run.weights.push(...q.weights); run.pieces.push(q);
            used[j] = true; grew = true;
          }
        }
        runs.push(run);
      }
      const tooShort = runs.filter(r => r.s1 - r.s0 < minLength);
      if (!tooShort.length) break;
      for (const r of tooShort) for (const p of r.pieces) refused.set(p.pair, [...(refused.get(p.pair) ?? []), [p.s0, p.s1]]);
    }
    const kept: Band[] = runs.filter(run => run.s1 - run.s0 >= minLength);
    const spare = (): Band[] => lines.flatMap((l, i) => minus([[l.s0, l.s1]], claimed[i]).map(([s0, s1]) => ({ center: l.offset, thickness: 0, s0, s1, weights: [l.weight] })));
    for (const run of layers ? mergeLayers(kept, spare()) : kept) walls.push({ a: f.point(run.s0, run.center), b: f.point(run.s1, run.center), thickness: run.thickness, weights: [...new Set(run.weights)].sort((x, y) => x - y) });
  }
  return walls;
}

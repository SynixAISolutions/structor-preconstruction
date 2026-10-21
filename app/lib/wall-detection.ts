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
};

const ANGLE_TOLERANCE = (1 * Math.PI) / 180;

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

const segLength = (s: Segment) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const inBox = (box: [number, number, number, number] | undefined) => (s: Segment) =>
  !box || [s.a, s.b].every(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]);

/**
 * The line weight walls are drawn in: the heaviest weight whose own lines mostly pair up at a wall's
 * thickness (on Jelleff's plans 1.2 pt pairs 76-78%, while the heavier 1.8 pt callout boxes and borders
 * pair 0%, and the 0.48 pt layers and casework 43%). Null when no weight does; then walls can't be told
 * apart by weight and none are found. `box` limits it to the plan's area, in page points.
 */
export function wallWeight(segments: Segment[], pointsPerFoot: number, box?: [number, number, number, number]): { weight: number; paired: number } | null {
  const lines = segments.filter(inBox(box)).filter(s => segLength(s) >= 0.5 * pointsPerFoot);
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
  const walls = joinWalls(detectWalls(segments.filter(inBox(box)), { pointsPerFoot, minWeight: found.weight - 0.005 }));
  return { walls, weight: found.weight, note: `Walls are the ${found.weight} pt lines (${Math.round(found.paired * 100)}% of them pair at a wall's thickness).` };
}

/**
 * Glass: a storefront, window or glass partition's pane is two lines 0.6-1.8" apart, drawn lighter than the
 * walls (Jelleff: 0.72 pt panes 1" apart between 0.24 pt frame lines, walls at 1.2 pt). Bays join across
 * their mullions; runs shorter than 2 ft are left out. Nothing without a wall weight (a scan).
 */
export function planGlazing(segments: Segment[], pointsPerFoot: number, wallWeight: number | null, walls: Wall[], box?: [number, number, number, number], leaves: [Point, Point][] = []): Wall[] {
  if (wallWeight === null) return [];
  const light = segments.filter(inBox(box)).filter(s => s.width >= 0.3 && s.width < wallWeight - 0.005);
  const panes = detectWalls(light, { pointsPerFoot, minWeight: 0.3, minThickness: 0.05, maxThickness: 0.15, minOverlap: 1, minLength: 2 });
  // A wall's inner layers (insulation, sheathing) are light lines a pane's width apart too: glass is never inside a wall.
  const insideWall = (p: Point) => walls.some(w => {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
    const t = (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uy, off = Math.abs((p[0] - w.a[0]) * uy - (p[1] - w.a[1]) * ux);
    return t >= -0.2 && t <= L + 0.2 && off <= w.thickness / 2 + 0.05;
  });
  // An open door leaf is drawn as a thin rectangle a pane's width across: glass is never along a door's leaf.
  const alongLeaf = (g: Wall) => leaves.some(([h, o]) => {
    const L = Math.hypot(o[0] - h[0], o[1] - h[1]) || 1, ux = (o[0] - h[0]) / L, uy = (o[1] - h[1]) / L;
    return [g.a, g.b].every(p => { const t = (p[0] - h[0]) * ux + (p[1] - h[1]) * uy; return t >= -0.5 && t <= L + 0.5 && Math.abs((p[0] - h[0]) * uy - (p[1] - h[1]) * ux) <= 0.4; });
  });
  return panes.filter(g => !insideWall([(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2]) && !alongLeaf(g));
}

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

export function detectWalls(segments: Segment[], opts: WallOptions): Wall[] {
  const { pointsPerFoot, minWeight, minThickness = 0.2, maxThickness = 2, minOverlap = 1, minLength = 2 } = opts;
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
  for (const { angle, lines } of groups.values()) {
    const f = frame(angle);
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
    const claimed: [number, number][][] = lines.map(() => []);
    const free = (k: number, s0: number, s1: number): [number, number][] => {
      let parts: [number, number][] = [[s0, s1]];
      for (const [c0, c1] of claimed[k]) parts = parts.flatMap(([a, b]): [number, number][] => c1 <= a || c0 >= b ? [[a, b]] : [[a, Math.max(a, c0)], [Math.min(b, c1), b]].filter(([x, y]) => y - x > 1e-6) as [number, number][]);
      return parts;
    };
    type Piece = { center: number; thickness: number; s0: number; s1: number; weights: number[] };
    const pieces: Piece[] = [];
    for (const c of candidates) {
      for (const [a, b] of free(c.i, c.s0, c.s1).flatMap(([a, b]) => free(c.j, a, b))) {
        if (b - a < minOverlap) continue;
        claimed[c.i].push([a, b]); claimed[c.j].push([a, b]);
        pieces.push({ center: (lines[c.i].offset + lines[c.j].offset) / 2, thickness: c.gap, s0: a, s1: b, weights: [lines[c.i].weight, lines[c.j].weight] });
      }
    }
    // Join pieces on the same centerline and thickness that touch or nearly touch.
    pieces.sort((p, q) => p.center - q.center || p.s0 - q.s0);
    const used = new Array(pieces.length).fill(false);
    for (let i = 0; i < pieces.length; i++) {
      if (used[i]) continue;
      const run = { ...pieces[i], weights: [...pieces[i].weights] };
      used[i] = true;
      for (let grew = true; grew;) {
        grew = false;
        for (let j = 0; j < pieces.length; j++) {
          const q = pieces[j];
          if (used[j] || Math.abs(q.center - run.center) > 0.15 || Math.abs(q.thickness - run.thickness) > 0.1) continue;
          if (q.s0 > run.s1 + 0.5 || q.s1 < run.s0 - 0.5) continue;
          run.s0 = Math.min(run.s0, q.s0); run.s1 = Math.max(run.s1, q.s1); run.weights.push(...q.weights);
          used[j] = true; grew = true;
        }
      }
      if (run.s1 - run.s0 >= minLength) walls.push({ a: f.point(run.s0, run.center), b: f.point(run.s1, run.center), thickness: run.thickness, weights: [...new Set(run.weights)].sort((x, y) => x - y) });
    }
  }
  return walls;
}

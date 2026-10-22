// Doors from a floor plan's vector lines (drawings to 3D, M2, 21 Oct). A door is drawn as a quarter-circle
// swing from its hinge: the radius is the door's width, one end of the arc lies along the wall (the door
// closed) and the other out into the room (the door open). Revit exports the arc as a chain of short
// straight lines (Jelleff: about 16 per swing); other sets use true curves. Both are read the same way.
// Deterministic geometry, like the walls; the AI only reads door numbers. Pure; feet, y down as on the plan.

import type { Curve, Point, Segment } from "./plan-vectors";
import type { Wall } from "./wall-detection";

/**
 * A door swing: the hinge, the door's width (the arc's radius) and the arc's two ends. `open` is the end
 * the leaf is drawn at (plans show the leaf open, as a line from the hinge), when one was found.
 */
export type Swing = { hinge: Point; radius: number; ends: [Point, Point]; open: 0 | 1 | null };
/**
 * A door opening from a to b in the wall, with its leaves' hinges and where each leaf swings open to.
 * `kind` "compartment" is a leaf under 2.4 ft (toilet stalls, cabinets): toilet partitions, not the door
 * schedule. `host` is the wall it sits in, null in glazing or where no wall was read.
 */
export type Door = { a: Point; b: Point; width: number; leaves: number; hinges: Point[]; openTo: Point[]; host: number | null; kind: "door" | "compartment" };

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function circle(p: Point, q: Point, r: Point): { c: Point; r: number } | null {
  const d = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
  if (Math.abs(d) < 1e-9) return null;
  const s = (a: Point) => a[0] * a[0] + a[1] * a[1];
  const c: Point = [(s(p) * (q[1] - r[1]) + s(q) * (r[1] - p[1]) + s(r) * (p[1] - q[1])) / d, (s(p) * (r[0] - q[0]) + s(q) * (p[0] - r[0]) + s(r) * (q[0] - p[0])) / d];
  return { c, r: dist(c, p) };
}

const bezier = (c: Curve, t: number): Point => [0, 1].map(k => (1 - t) ** 3 * c.from[k] + 3 * (1 - t) ** 2 * t * c.c1[k] + 3 * (1 - t) * t ** 2 * c.c2[k] + t ** 3 * c.to[k]) as Point;

/**
 * Quarter-circle arcs 1.5-4.5 ft in radius. Short lines (under 1.2 ft) are chained end to end, true curves
 * are sampled into the same chains, and a chain is a swing when every point sits on one circle and the arc
 * turns about a right angle.
 */
export function swingArcs(segments: Segment[], curves: Curve[], pointsPerFoot: number): Swing[] {
  const ft = (p: Point): Point => [p[0] / pointsPerFoot, p[1] / pointsPerFoot];
  const pieces: [Point, Point][] = [];
  for (const s of segments) { const a = ft(s.a), b = ft(s.b), L = dist(a, b); if (L > 0.005 && L <= 1.2) pieces.push([a, b]); }
  for (const c of curves) { const pts = Array.from({ length: 9 }, (_, i) => ft(bezier(c, i / 8))); for (let i = 0; i < 8; i++) if (dist(pts[i], pts[i + 1]) <= 1.2) pieces.push([pts[i], pts[i + 1]]); }

  // The open leaf: a straight line from the hinge toward an arc end, covering most of the radius.
  const lines = segments.map(s => [ft(s.a), ft(s.b)] as [Point, Point]).filter(([a, b]) => dist(a, b) >= 0.6);
  const hasLeaf = (hinge: Point, end: Point, r: number) => {
    const u: Point = [(end[0] - hinge[0]) / r, (end[1] - hinge[1]) / r];
    let covered = 0;
    for (const [a, b] of lines) {
      if (Math.min(a[0], b[0]) > Math.max(hinge[0], end[0]) + 0.3 || Math.max(a[0], b[0]) < Math.min(hinge[0], end[0]) - 0.3) continue;
      if (Math.min(a[1], b[1]) > Math.max(hinge[1], end[1]) + 0.3 || Math.max(a[1], b[1]) < Math.min(hinge[1], end[1]) - 0.3) continue;
      const off = (p: Point) => Math.abs((p[0] - hinge[0]) * u[1] - (p[1] - hinge[1]) * u[0]);
      if (off(a) > 0.25 || off(b) > 0.25) continue;
      const t = (p: Point) => (p[0] - hinge[0]) * u[0] + (p[1] - hinge[1]) * u[1];
      const lo = Math.max(0, Math.min(t(a), t(b))), hi = Math.min(r, Math.max(t(a), t(b)));
      covered = Math.max(covered, hi - lo);
    }
    return covered >= 0.6 * r;
  };

  // Ends that meet (within 0.01 ft) join pieces into chains; a chain runs through points shared by exactly two pieces.
  const key = (p: Point) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  // A line drawn twice (overlapping layers) would make every joint a crossing: keep one copy.
  const seen = new Set<string>();
  const unique = pieces.filter(([a, b]) => { const k = [key(a), key(b)].sort().join("|"); return seen.has(k) ? false : (seen.add(k), true); });
  pieces.length = 0; pieces.push(...unique);
  const at = new Map<string, number[]>();
  pieces.forEach(([a, b], i) => { for (const p of [a, b]) { const k = key(p); at.set(k, [...(at.get(k) ?? []), i]); } });
  const used = new Array(pieces.length).fill(false);
  const swings: Swing[] = [];
  // A chain also stops at a sharp corner: an arc turns a few degrees per piece, while the two swings of a
  // pair meet at a point in the middle and a swing runs into the end of its leaf at a right angle.
  const turn = (p: Point, q: Point, r: Point) => {
    const u = [q[0] - p[0], q[1] - p[1]], v = [r[0] - q[0], r[1] - q[1]];
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1)))) * 180 / Math.PI;
  };
  const walk = (start: number, from: Point): Point[] => {
    const pts: Point[] = [from];
    let i = start, p = from;
    while (i >= 0 && !used[i]) {
      const [a, b] = pieces[i], next = key(a) === key(p) ? b : a;
      if (pts.length >= 2 && turn(pts[pts.length - 2], p, next) > 35) break;
      used[i] = true;
      pts.push(next); p = next;
      const there = (at.get(key(next)) ?? []).filter(j => j !== i);
      i = there.length === 1 && (at.get(key(next)) ?? []).length === 2 ? there[0] : -1;
    }
    return pts;
  };
  const chains: Point[][] = [];
  // Chains start at loose ends, then at the pieces a sharp corner left over (from either of their ends).
  for (const [k, list] of at) if (list.length === 1 && !used[list[0]]) { const [a, b] = pieces[list[0]]; chains.push(walk(list[0], key(a) === k ? a : b)); }
  for (let i = 0; i < pieces.length; i++) if (!used[i]) {
    const forward = walk(i, pieces[i][0]);
    // Walked from one end only: extend backwards from the start through the pieces still unused.
    const back = (at.get(key(pieces[i][0])) ?? []).find(j => !used[j]);
    chains.push(back === undefined ? forward : [...walk(back, pieces[i][0]).reverse(), ...forward.slice(1)]);
  }

  for (const pts of chains) {
    if (pts.length < 5) continue;
    const fit = circle(pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]);
    if (!fit || fit.r < 1.5 || fit.r > 4.5) continue;
    if (pts.some(p => Math.abs(dist(p, fit.c) - fit.r) > Math.max(0.06, 0.03 * fit.r))) continue;
    const u = [pts[0][0] - fit.c[0], pts[0][1] - fit.c[1]], v = [pts[pts.length - 1][0] - fit.c[0], pts[pts.length - 1][1] - fit.c[1]];
    const sweep = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (fit.r * fit.r)))) * 180 / Math.PI;
    if (sweep < 70 || sweep > 110) continue;
    const ends: [Point, Point] = [pts[0], pts[pts.length - 1]];
    const leafAt = ends.map(e => hasLeaf(fit.c, e, fit.r));
    swings.push({ hinge: fit.c, radius: fit.r, ends, open: leafAt[0] !== leafAt[1] ? (leafAt[0] ? 0 : 1) : null });
  }
  // The same swing drawn twice (overlapping lines) counts once.
  return swings.filter((s, i) => !swings.slice(0, i).some(t => dist(s.hinge, t.hinge) < 0.3 && Math.abs(s.radius - t.radius) < 0.2));
}

/** Distance from p to the infinite line through a wall's centerline, and whether direction d runs along it. */
function along(w: Wall, p: Point, d: Point): number | null {
  const L = dist(w.a, w.b), wx = (w.b[0] - w.a[0]) / L, wy = (w.b[1] - w.a[1]) / L;
  if (Math.abs(d[0] * wy - d[1] * wx) > Math.sin((10 * Math.PI) / 180)) return null;
  const off = Math.abs((p[0] - w.a[0]) * wy - (p[1] - w.a[1]) * wx);
  if (off > w.thickness / 2 + 0.6) return null;
  // The wall must reach near the hinge along its own direction (it is the jamb's wall, not one across the room).
  const t = (p[0] - w.a[0]) * wx + (p[1] - w.a[1]) * wy;
  return t < -6 || t > L + 6 ? null : off;
}

/**
 * Openings from swings: the arc end that runs along a wall through the hinge is the closed position, so
 * the opening is hinge to that end. Two swings closing onto each other are one pair of doors.
 */
export function doorsFromSwings(swings: Swing[], walls: Wall[]): Door[] {
  type Leaf = { hinge: Point; closed: Point; open: Point; radius: number; host: number | null; leaf: boolean };
  const leaves: Leaf[] = [];
  for (const s of swings) {
    // The host wall runs through the hinge along the closed leaf. Where the drawn leaf says which end is
    // open, only walls along the other end count; otherwise the nearest such wall decides.
    let best: { end: number; host: number; off: number } | null = null;
    s.ends.forEach((e, end) => {
      if (s.open !== null && end === s.open) return;
      const d: Point = [(e[0] - s.hinge[0]) / s.radius, (e[1] - s.hinge[1]) / s.radius];
      walls.forEach((w, host) => { const off = along(w, s.hinge, d); if (off !== null && (!best || off < best.off)) best = { end, host, off }; });
    });
    const found = best as { end: number; host: number; off: number } | null;
    // No wall runs through the hinge: still a door (a storefront, a door in glass), with no host wall.
    const end = s.open !== null ? 1 - s.open : found?.end ?? 0;
    leaves.push({ hinge: s.hinge, closed: s.ends[end], open: s.ends[1 - end], radius: s.radius, host: found?.host ?? null, leaf: s.open !== null });
  }
  // A swing whose hinge is nowhere near a wall (on a wall's line or within 2 ft of a wall's end) is a
  // drawing symbol drawn with a quarter circle, not a door.
  const atWall = (h: Point) => walls.some(w => dist(w.a, h) < 2 || dist(w.b, h) < 2 || along(w, h, [(w.b[0] - w.a[0]) / dist(w.a, w.b), (w.b[1] - w.a[1]) / dist(w.a, w.b)]) !== null);
  const real = leaves.filter(l => l.host !== null || l.leaf || atWall(l.hinge));
  const doors: Door[] = [], paired = new Set<number>();
  real.forEach((p, i) => {
    if (paired.has(i)) return;
    const j = real.findIndex((q, k) => k > i && !paired.has(k) && dist(p.closed, q.closed) < 0.5 && dist(p.hinge, q.hinge) > 1);
    if (j >= 0) {
      const q = real[j]; paired.add(j);
      doors.push({ a: p.hinge, b: q.hinge, width: dist(p.hinge, q.hinge), leaves: 2, hinges: [p.hinge, q.hinge], openTo: [p.open, q.open], host: p.host ?? q.host, kind: Math.max(p.radius, q.radius) < 2.4 ? "compartment" : "door" });
    } else doors.push({ a: p.hinge, b: p.closed, width: p.radius, leaves: 1, hinges: [p.hinge], openTo: [p.open], host: p.host, kind: p.radius < 2.4 ? "compartment" : "door" });
  });
  return doors;
}

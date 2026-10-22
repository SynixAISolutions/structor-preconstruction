// Rooms from the walls, doors and glass read off a plan (drawings to 3D, rooms, 22 Oct). The spaces they
// enclose are the faces of the line drawing: walls and glass as their centerlines, each door opening
// closed across. Ends that stop short are extended to the line ahead, ends within a tolerance are joined,
// lines are split where they cross or meet, then every face is traced keeping to the left. The room tags
// read on the plan name the faces they fall in. Pure; feet, y down as on the plan.

import type { Point } from "./plan-vectors";

export type Room = { outline: Point[]; area: number; name: string; number: string; at: Point };
type Line = { a: Point; b: Point };

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export const polygonArea = (pts: Point[]) => Math.abs(signedArea(pts));
const signedArea = (pts: Point[]) => pts.reduce((s, [x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]; return s + x * ny - nx * y; }, 0) / 2;

/** Whether p is inside the polygon (ray casting). */
export function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The enclosed spaces of a set of lines. `snap` joins ends that nearly meet (a wall stopping short of the
 * one it meets) and splits a line where another ends on it. Faces smaller than `minArea` or narrower on
 * average than `minWidth` (wall thickness slivers, chases) and the unbounded outside are dropped.
 */
export function faces(drawn: Line[], snap = 0.75, minArea = 15, gap = 6, minWidth = 1.5): Point[][] {
  const along = (l: Line, p: Point) => { const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], L2 = dx * dx + dy * dy || 1; return ((p[0] - l.a[0]) * dx + (p[1] - l.a[1]) * dy) / L2; };
  const at = (l: Line, t: number): Point => [l.a[0] + t * (l.b[0] - l.a[0]), l.a[1] + t * (l.b[1] - l.a[1])];
  const foot = (l: Line, p: Point) => at(l, Math.max(0, Math.min(1, along(l, p))));
  // 0. An end that meets nothing (a wall stopping at the face of the one it meets, a wall broken by an
  // opening, a door line shorter than its opening) is extended straight ahead to the first line within `gap`;
  // failing that, bridged to the nearest line within twice the snap. So the spaces close.
  // ponytail: O(n²) over a level's few hundred lines; grid-bucket the lines if plans get to thousands.
  const lines = [...drawn];
  drawn.forEach((l, i) => {
    const len = dist(l.a, l.b) || 1;
    for (const [p, q] of [[l.a, l.b], [l.b, l.a]] as [Point, Point][]) {
      const u: Point = [(p[0] - q[0]) / len, (p[1] - q[1]) / len];
      let ahead: Point | null = null, s = gap, near: Point | null = null, d = Infinity;
      for (let j = 0; j < drawn.length; j++) {
        if (j === i) continue;
        const m = drawn[j], f = foot(m, p), e = dist(p, f);
        if (e < d) { d = e; near = f; }
        // where the ray p + s·u meets m, or an end of m lying on the ray (a collinear continuation)
        const mx = m.b[0] - m.a[0], my = m.b[1] - m.a[1], den = u[0] * my - u[1] * mx;
        if (Math.abs(den) > 1e-9) {
          const t = ((m.a[0] - p[0]) * my - (m.a[1] - p[1]) * mx) / den, v = ((m.a[0] - p[0]) * u[1] - (m.a[1] - p[1]) * u[0]) / den;
          const tol = snap / (Math.hypot(mx, my) || 1);
          if (t > 0 && t < s && v > -tol && v < 1 + tol) { s = t; ahead = [p[0] + t * u[0], p[1] + t * u[1]]; }
        }
        for (const e2 of [m.a, m.b]) {
          const t = (e2[0] - p[0]) * u[0] + (e2[1] - p[1]) * u[1], off = Math.abs((e2[0] - p[0]) * u[1] - (e2[1] - p[1]) * u[0]);
          if (t > 0 && t < s && off <= snap) { s = t; ahead = e2; }
        }
      }
      if (d <= snap) continue;
      const to = ahead ?? (d <= 2 * snap ? near : null);
      if (to) lines.push({ a: p, b: to });
    }
  });
  // 1. Split every line where it crosses another, and where another's end lies on it (within snap).
  const cuts: number[][] = lines.map(() => [0, 1]);
  for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines.length; j++) {
    if (i === j) continue;
    const l = lines[i], m = lines[j], L = dist(l.a, l.b) || 1;
    // m's ends on l
    for (const p of [m.a, m.b]) { const t = along(l, p); if (t > 0 && t < 1 && dist(at(l, t), p) <= snap) cuts[i].push(t); }
    // proper crossing
    if (j < i) continue;
    const d = (l.b[0] - l.a[0]) * (m.b[1] - m.a[1]) - (l.b[1] - l.a[1]) * (m.b[0] - m.a[0]);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((m.a[0] - l.a[0]) * (m.b[1] - m.a[1]) - (m.a[1] - l.a[1]) * (m.b[0] - m.a[0])) / d;
    const u = ((m.a[0] - l.a[0]) * (l.b[1] - l.a[1]) - (m.a[1] - l.a[1]) * (l.b[0] - l.a[0])) / d;
    const tol = snap / L, tolM = snap / (dist(m.a, m.b) || 1);
    if (t > -tol && t < 1 + tol && u > -tolM && u < 1 + tolM) { cuts[i].push(Math.min(1, Math.max(0, t))); cuts[j].push(Math.min(1, Math.max(0, u))); }
  }
  // 2. Nodes: points within snap are one node.
  const nodes: Point[] = [];
  const node = (p: Point) => { let k = nodes.findIndex(n => dist(n, p) <= snap); if (k < 0) { nodes.push(p); k = nodes.length - 1; } return k; };
  const edges = new Set<string>();
  lines.forEach((l, i) => {
    const ts = [...new Set(cuts[i].map(t => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) { const p = node(at(l, ts[k])), q = node(at(l, ts[k + 1])); if (p !== q) edges.add(p < q ? `${p},${q}` : `${q},${p}`); }
  });
  // 3. Half-edges around each node by angle; trace faces keeping to the left (next = previous neighbor clockwise).
  const nbrs: number[][] = nodes.map(() => []);
  for (const e of edges) { const [p, q] = e.split(",").map(Number); nbrs[p].push(q); nbrs[q].push(p); }
  const angle = (p: number, q: number) => Math.atan2(nodes[q][1] - nodes[p][1], nodes[q][0] - nodes[p][0]);
  nbrs.forEach((list, p) => list.sort((x, y) => angle(p, x) - angle(p, y)));
  const used = new Set<string>(), out: Point[][] = [];
  for (let p = 0; p < nodes.length; p++) for (const q0 of nbrs[p]) {
    if (used.has(`${p},${q0}`)) continue;
    const ring: number[] = [];
    let a = p, b = q0, guard = 0;
    while (!used.has(`${a},${b}`) && guard++ < 10000) {
      used.add(`${a},${b}`); ring.push(a);
      const around = nbrs[b], k = around.indexOf(a);
      const c = around[(k - 1 + around.length) % around.length]; // the next edge clockwise from the way back: keeps the face on the left
      a = b; b = c;
    }
    const poly = ring.map(k => nodes[k]);
    // Traced this way, enclosed faces have positive signed area; the unbounded outside comes out negative.
    // Mean width 2A/P: a strip between two faces of one wall, or glass along a wall, is not a room (a 3 x 5 closet is).
    const perimeter = poly.reduce((t, p, i) => t + dist(p, poly[(i + 1) % poly.length]), 0);
    if (poly.length >= 3 && signedArea(poly) > minArea && 2 * signedArea(poly) / perimeter >= minWidth) out.push(poly);
  }
  return out;
}

/** The area centroid of a polygon (a label point; for a strongly L-shaped room it can fall outside). */
export function centroid(pts: Point[]): Point {
  const a = signedArea(pts) || 1;
  const c = pts.reduce(([x, y], [x0, y0], i) => { const [x1, y1] = pts[(i + 1) % pts.length], k = x0 * y1 - x1 * y0; return [x + (x0 + x1) * k, y + (y0 + y1) * k]; }, [0, 0]);
  return [c[0] / (6 * a), c[1] / (6 * a)];
}

/**
 * The rooms of a level: the faces of its walls, glass and door openings (closed across), each named by the
 * room tag inside it. A face with no tag keeps an empty name; one with two tags takes the first. Spaces
 * whose walls leave gaps wider than the extension (open to below, an open corridor) are not rooms.
 */
export function levelRooms(input: { walls: Line[]; doors: Line[]; glazing: Line[]; tags: { name: string; number: string; at: Point }[] }): Room[] {
  return faces([...input.walls, ...input.glazing, ...input.doors]).map(outline => {
    const tag = input.tags.find(t => inside(t.at, outline)), r1 = (v: number) => Math.round(v * 10) / 10;
    return { outline: outline.map(([x, y]) => [r1(x), r1(y)] as Point), area: Math.round(polygonArea(outline)), name: tag?.name ?? "", number: tag?.number ?? "", at: (tag?.at ?? centroid(outline)).map(r1) as Point };
  });
}

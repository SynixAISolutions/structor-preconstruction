// Tags on a plan, placed on the walls and doors read from its lines (drawings to 3D, M3, 21 Oct). The AI
// reads each tag's text and where it is ("plan-tags"); positions decide which wall or door it labels.
// A wall-type tag labels the nearest wall and that partition's straight run across door openings; a door
// number goes to the nearest door, one number per door. Pure; feet, y down as on the plan.

import type { Curve, Point, Segment } from "./plan-vectors";

export type PlacedTag = { text: string; kind: "wall" | "door" | "glazing"; at: Point };
/** A tag oval (a stadium): its two semicircle ends' centers and their radius, in feet. */
export type Oval = { a: Point; b: Point; r: number };

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const bezier = (c: Curve, t: number): Point => [0, 1].map(k => (1 - t) ** 3 * c.from[k] + 3 * (1 - t) ** 2 * t * c.c1[k] + 3 * (1 - t) * t ** 2 * c.c2[k] + t ** 3 * c.to[k]) as Point;
function circle(p: Point, q: Point, r: Point): { c: Point; r: number } | null {
  const d = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
  if (Math.abs(d) < 1e-9) return null;
  const s = (a: Point) => a[0] * a[0] + a[1] * a[1];
  const c: Point = [(s(p) * (q[1] - r[1]) + s(q) * (r[1] - p[1]) + s(r) * (p[1] - q[1])) / d, (s(p) * (r[0] - q[0]) + s(q) * (p[0] - r[0]) + s(r) * (q[0] - p[0])) / d];
  return { c, r: dist(c, p) };
}

/**
 * Tag ovals drawn as curves: each end is a semicircle (two or more curves sharing a center) 3-11 pt in
 * radius on paper (a tag's size on paper, whatever the scale), and an oval is two ends of one radius
 * facing each other 0.3-6 ft apart. Rounded corners of callout boxes have one curve per center and never
 * pair. Feet, as the plan.
 */
export function tagOvals(curves: Curve[], pointsPerFoot: number): Oval[] {
  const ends: { c: Point; r: number; n: number }[] = [];
  for (const cv of curves) {
    const f = circle(cv.from, bezier(cv, 0.5), cv.to);
    if (!f || f.r < 3 || f.r > 11) continue;
    const c: Point = [f.c[0] / pointsPerFoot, f.c[1] / pointsPerFoot], r = f.r / pointsPerFoot;
    const e = ends.find(e => dist(e.c, c) < 0.05 && Math.abs(e.r - r) < 0.05);
    if (e) e.n++; else ends.push({ c, r, n: 1 });
  }
  const halves = ends.filter(e => e.n >= 2), used = new Set<number>(), ovals: Oval[] = [];
  halves.forEach((e, i) => {
    if (used.has(i)) return;
    let best = -1, bd = 6;
    halves.forEach((f, j) => { const d = dist(e.c, f.c); if (j !== i && !used.has(j) && Math.abs(f.r - e.r) < 0.05 && d > 0.3 && d < bd) { bd = d; best = j; } });
    if (best >= 0) { used.add(i); used.add(best); ovals.push({ a: e.c, b: halves[best].c, r: e.r }); }
  });
  return ovals;
}

/** Distance from p to a stadium's core segment (so the boundary is at r). */
const toCore = (o: Oval, p: Point) => toSegment(p, o.a, o.b);

/**
 * Where a tag's leader ends: a line leaving the oval's edge outward, followed through joined pieces (up
 * to 4, 20 ft in all). Null when the tag has no leader (it sits against its wall). Feet.
 */
export function leaderTip(o: Oval, segments: [Point, Point][]): Point | null {
  const onEdge = (p: Point) => Math.abs(toCore(o, p) - o.r) < 0.12;
  let tip: Point | null = null, from: [Point, Point] | null = null;
  for (const [a, b] of segments) {
    const [p, q] = onEdge(a) && toCore(o, b) > o.r + 0.3 ? [a, b] : onEdge(b) && toCore(o, a) > o.r + 0.3 ? [b, a] : [null, null];
    if (p && q && (!tip || dist(p, q) > dist(from![0], from![1]))) { tip = q; from = [p, q]; }
  }
  if (!tip || !from) return null;
  let end: Point = tip, back: Point = from[0], length = dist(back, end);
  for (let hop = 0; hop < 3 && length < 20; hop++) {
    const at = end, before = back;
    const next = segments.find(([a, b]) => (dist(a, at) < 0.05 && dist(b, before) > 0.05) || (dist(b, at) < 0.05 && dist(a, before) > 0.05));
    if (!next) break;
    const far: Point = dist(next[0], at) < 0.05 ? next[1] : next[0];
    back = at; length += dist(at, far); end = far;
  }
  return end;
}
type WallLike = { a: Point; b: Point; thickness: number };
type DoorLike = { a: Point; b: Point };

/** "SA. 3. 10" → "SA3.10", the way the partition schedule writes it; "sf-4" → "SF-4". */
export function normalTag(text: string): string {
  return text.toUpperCase().replace(/\s+/g, "").replace(/^([A-Z]+)\.(?=\d)/, "$1");
}

/** The same tag read twice (tiles overlap) or a type repeated within 3 ft counts once, at the mean position. */
export function mergeTags(tags: PlacedTag[], within = 3): PlacedTag[] {
  const out: (PlacedTag & { n: number })[] = [];
  for (const t of tags) {
    const text = normalTag(t.text), same = out.find(o => o.kind === t.kind && o.text === text && Math.hypot(o.at[0] - t.at[0], o.at[1] - t.at[1]) < within);
    if (same) { same.at = [(same.at[0] * same.n + t.at[0]) / (same.n + 1), (same.at[1] * same.n + t.at[1]) / (same.n + 1)]; same.n++; }
    else out.push({ text, kind: t.kind, at: t.at, n: 1 });
  }
  return out.map(({ n, ...t }) => t);
}

const toSegment = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/**
 * Wall types and door numbers from tags. A wall tag takes the nearest wall within 5 ft, then spreads along
 * that run: walls in line with it (within 2°, 0.3 ft off its line), of the same thickness, with gaps up to
 * 4 ft (door openings). Walls a tag already labelled keep their own. A door number takes the nearest door
 * within 6 ft, closest pairs first, one number per door.
 */
export function placeTags(tags: PlacedTag[], walls: WallLike[], doors: DoorLike[], drawn: { ovals: Oval[]; lines: [Point, Point][] } = { ovals: [], lines: [] }): { wallTypes: (string | null)[]; doorNumbers: (string | null)[] } {
  const wallTypes: (string | null)[] = walls.map(() => null);
  const direct = new Set<number>(), usedOvals = new Set<Oval>();
  const nearestWall = (score: (w: WallLike) => number, within: number) => {
    let best = -1, bestD = within;
    walls.forEach((w, i) => { const d = score(w); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };
  for (const t of tags.filter(t => t.kind === "wall")) {
    // The tag's own oval near where the AI read it, if the plan draws tags as ovals.
    const oval = drawn.ovals.filter(o => !usedOvals.has(o)).map(o => ({ o, d: dist([(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], t.at) })).filter(x => x.d < 3).sort((p, q) => p.d - q.d)[0]?.o;
    let best = -1;
    if (oval) {
      usedOvals.add(oval);
      const tip = leaderTip(oval, drawn.lines);
      best = tip
        ? nearestWall(w => toSegment(tip, w.a, w.b) - w.thickness / 2, 1.5) // the wall its leader points at
        : nearestWall(w => Math.min(toSegment(w.a, oval.a, oval.b), toSegment(w.b, oval.a, oval.b), toCore(oval, w.a), toSegment(oval.a, w.a, w.b), toSegment(oval.b, w.a, w.b)) - oval.r - w.thickness / 2, 1.5); // the wall it sits against
    }
    if (best < 0) best = nearestWall(w => toSegment(t.at, w.a, w.b) - w.thickness / 2, 5);
    if (best >= 0) { wallTypes[best] = normalTag(t.text); direct.add(best); }
  }
  const dir = (w: WallLike) => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]; };
  const inLine = (w: WallLike, v: WallLike) => {
    const d = dir(w), e = dir(v);
    if (Math.abs(d[0] * e[1] - d[1] * e[0]) > Math.sin((2 * Math.PI) / 180) || Math.abs(w.thickness - v.thickness) > 0.05) return false;
    const off = (p: Point) => Math.abs((p[0] - w.a[0]) * d[1] - (p[1] - w.a[1]) * d[0]);
    if (off(v.a) > 0.3 || off(v.b) > 0.3) return false;
    const t = (p: Point) => (p[0] - w.a[0]) * d[0] + (p[1] - w.a[1]) * d[1], L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const lo = Math.min(t(v.a), t(v.b)), hi = Math.max(t(v.a), t(v.b));
    return lo <= L + 4 && hi >= -4;
  };
  for (const start of direct) {
    const queue = [start];
    while (queue.length) {
      const i = queue.pop()!;
      walls.forEach((v, j) => { if (wallTypes[j] === null && inLine(walls[i], v)) { wallTypes[j] = wallTypes[start]; queue.push(j); } });
    }
  }
  const doorNumbers: (string | null)[] = doors.map(() => null);
  const pairs = tags.filter(t => t.kind === "door").flatMap(t => doors.map((d, i) => ({ t, i, d: Math.hypot((d.a[0] + d.b[0]) / 2 - t.at[0], (d.a[1] + d.b[1]) / 2 - t.at[1]) }))).filter(p => p.d < 6).sort((p, q) => p.d - q.d);
  const usedTags = new Set<PlacedTag>();
  for (const p of pairs) if (doorNumbers[p.i] === null && !usedTags.has(p.t)) { doorNumbers[p.i] = normalTag(p.t.text); usedTags.add(p.t); }
  return { wallTypes, doorNumbers };
}

/** Wall length and face area by type for one level (area = length × height); untagged walls under "Untagged". */
export function wallTypeTotals(walls: (WallLike & { type?: string | null })[], height: number): { type: string; walls: number; feet: number; squareFeet: number }[] {
  const by = new Map<string, { walls: number; feet: number }>();
  for (const w of walls) {
    const k = w.type ?? "Untagged", t = by.get(k) ?? { walls: 0, feet: 0 };
    t.walls++; t.feet += Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); by.set(k, t);
  }
  return [...by.entries()].map(([type, t]) => ({ type, walls: t.walls, feet: Math.round(t.feet), squareFeet: Math.round(t.feet * height) }))
    .sort((p, q) => Number(p.type === "Untagged") - Number(q.type === "Untagged") || p.type.localeCompare(q.type));
}

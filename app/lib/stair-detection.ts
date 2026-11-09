// Stairs from a plan's own lines (drawings to 3D, 9 Nov). A flight is drawn as its treads: parallel lines of one length,
// evenly spaced a tread's depth apart (Project 1: 11"). Its walkline arrow (a small filled triangle on the line along the
// flight) shows which way it runs. On the plan of the level a stair arrives at, its flights are drawn whole and the arrow
// points down; on the level it leaves from, the plan's cut line (a diagonal across the flight) hides the upper part.
// Pure: feet in, feet out.

export type Point = [number, number];
type Line = { a: Point; b: Point; width: number };

/**
 * A flight from `a` to `b` along the middle of its first and last tread lines, in feet; `width` is the treads' length and
 * `risers` the number of tread lines (each is a riser's nosing, the top one the landing's edge). `arrow` is the end its
 * walkline arrow points to, when one is drawn on it; `cut` when the plan's cut line crosses it (the flight rises from this
 * level, and only its lower part is drawn).
 */
export type Flight = { a: Point; b: Point; width: number; risers: number; going: number; arrow: "a" | "b" | null; cut: boolean };
/** What a stored stair keeps of each flight. */
export type StairFlight = Pick<Flight, "a" | "b" | "width" | "risers" | "arrow">;

/** Tread lines: this long (a stair is at least 3 ft wide; these are 2.5 to allow for stringers) and at most this. */
export const TREAD_MIN_FEET = 2.5, TREAD_MAX_FEET = 12;
/** Treads this deep apart (9" to 15"), each gap within this of the flight's first. */
export const GOING_MIN_FEET = 0.75, GOING_MAX_FEET = 1.25, GOING_SPREAD_FEET = 0.06;
/** A flight has at least this many tread lines (3 treads). */
export const FLIGHT_MIN_LINES = 4;
/** Tread lines of one flight start and end within this of each other. */
const SPAN_FEET = 0.35;

const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
const len = (p: Point) => Math.hypot(p[0], p[1]);
const mid = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

/** The flights on a plan. `wallWeight` (points) keeps walls out; `box` (page points) limits the search to the plan's area. */
export function planFlights(segments: Line[], fills: Point[][], pointsPerFoot: number, wallWeight: number | null, box?: [number, number, number, number] | null): Flight[] {
  const f = (p: Point): Point => [p[0] / pointsPerFoot, p[1] / pointsPerFoot];
  const inBox = (p: Point) => !box || (p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]);
  const thin = (s: Line) => s.width < (wallWeight ? wallWeight * 0.9 : 1);
  const lines = segments.filter(s => thin(s) && inBox(s.a) && inBox(s.b)).map(s => ({ a: f(s.a), b: f(s.b), width: s.width }));
  const heads = arrowheads(fills.filter(p => p.length === 3 && p.every(inBox)).map(p => p.map(f)), lines);
  const treads = lines.filter(l => { const L = len(sub(l.b, l.a)); return L >= TREAD_MIN_FEET && L <= TREAD_MAX_FEET; })
    .map(l => { let angle = Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]); if (angle < 0) angle += Math.PI; if (angle >= Math.PI - 0.01) angle -= Math.PI; return { ...l, angle }; })
    .sort((p, q) => p.angle - q.angle);
  const flights: Flight[] = [];
  // Lines of one direction (within 0.6 degrees of each other, chained), then of one span along it, then evenly spaced across it.
  for (let i = 0; i < treads.length;) {
    let j = i + 1;
    while (j < treads.length && treads[j].angle - treads[j - 1].angle < 0.6 * Math.PI / 180) j++;
    const group = treads.slice(i, j); i = j;
    if (group.length < FLIGHT_MIN_LINES) continue;
    const angle = group.reduce((s, l) => s + l.angle, 0) / group.length, d: Point = [Math.cos(angle), Math.sin(angle)], n: Point = [-d[1], d[0]];
    const rows = group.map(l => { const s = [dot(l.a, d), dot(l.b, d)].sort((p, q) => p - q); return { s0: s[0], s1: s[1], o: dot(mid(l.a, l.b), n), width: l.width }; }).sort((p, q) => p.s0 - q.s0);
    const parent = rows.map((_, k) => k), find = (k: number): number => parent[k] === k ? k : (parent[k] = find(parent[k]));
    for (let p = 0; p < rows.length; p++) for (let q = p + 1; q < rows.length && rows[q].s0 - rows[p].s0 < SPAN_FEET; q++) if (Math.abs(rows[q].s1 - rows[p].s1) < SPAN_FEET) parent[find(q)] = find(p);
    const spans = new Map<number, typeof rows>();
    rows.forEach((r, k) => { const root = find(k); spans.set(root, [...(spans.get(root) ?? []), r]); });
    for (const span of spans.values()) {
      if (span.length < FLIGHT_MIN_LINES) continue;
      const sorted = [...span].sort((p, q) => p.o - q.o), unique: typeof span = [];
      for (const r of sorted) if (!unique.length || r.o - unique[unique.length - 1].o > 0.08) unique.push(r);
      // Runs of even gaps: each gap a tread's depth, within GOING_SPREAD_FEET of the run's first.
      let start = 0;
      for (let k = 1; k <= unique.length; k++) {
        const gap = k < unique.length ? unique[k].o - unique[k - 1].o : NaN, first = k - start >= 2 ? unique[start + 1].o - unique[start].o : gap;
        const even = gap >= GOING_MIN_FEET && gap <= GOING_MAX_FEET && Math.abs(gap - first) <= GOING_SPREAD_FEET;
        if (even) continue;
        const run = unique.slice(start, k);
        if (run.length >= FLIGHT_MIN_LINES && run.every(r => Math.abs(r.width - run[0].width) < 0.1)) {
          const s0 = run.reduce((s, r) => s + r.s0, 0) / run.length, s1 = run.reduce((s, r) => s + r.s1, 0) / run.length, sm = (s0 + s1) / 2;
          const at = (o: number): Point => [d[0] * sm + n[0] * o, d[1] * sm + n[1] * o];
          const flight = { a: at(run[0].o), b: at(run[run.length - 1].o), width: s1 - s0, risers: run.length, going: (run[run.length - 1].o - run[0].o) / (run.length - 1), arrow: null, cut: false } as Flight;
          if (!grid(flight, lines)) flights.push({ ...flight, arrow: arrowOn(flight, heads, lines), cut: cutAcross(flight, lines) });
        }
        start = gap >= GOING_MIN_FEET && gap <= GOING_MAX_FEET ? k - 1 : k;
      }
    }
  }
  return flights.map(fl => ({ ...fl, a: round(fl.a), b: round(fl.b), width: Math.round(fl.width * 100) / 100, going: Math.round(fl.going * 1000) / 1000 }));
}
const round = (p: Point): Point => [Math.round(p[0] * 100) / 100 || 0, Math.round(p[1] * 100) / 100 || 0];

/** A flight's frame: `u` along its run (a to b), `v` across, its length and the point at run t, across w (both from its middle). */
function frame(fl: Pick<Flight, "a" | "b" | "width">) {
  const run = sub(fl.b, fl.a), length = len(run), u: Point = [run[0] / length, run[1] / length], v: Point = [-u[1], u[0]], c = mid(fl.a, fl.b);
  const local = (p: Point) => { const q = sub(p, c); return [dot(q, u), dot(q, v)] as Point; };
  return { u, v, length, local, inside: (p: Point, pad = 0) => { const [t, w] = local(p); return Math.abs(t) <= length / 2 + pad && Math.abs(w) <= fl.width / 2 + pad; } };
}

/** More than 3 long lines across the treads, inside the flight: a grid (a tile or ceiling pattern), not a stair. */
function grid(fl: Flight, lines: Line[]): boolean {
  const { u, local, length } = frame(fl);
  let across = 0;
  for (const l of lines) {
    const d = sub(l.b, l.a), L = len(d);
    if (L < length * 0.6 || Math.abs(dot(d, u)) / L < 0.99) continue;
    const w = local(mid(l.a, l.b))[1];
    if (Math.abs(w) < fl.width / 2 - 0.3 && Math.abs(local(mid(l.a, l.b))[0]) < length / 2) across++;
  }
  return across > 3;
}

/**
 * The plan's cut line: a diagonal (15 to 75 degrees off the treads) right across the flight, at it or just past its end
 * (up to 4 ft: the treads it clips are shorter, so they aren't part of the flight read).
 */
function cutAcross(fl: Flight, lines: Line[]): boolean {
  const { u, local, length } = frame(fl), reach = length / 2 + 4;
  // The line breaks at its zigzag (Project 1: two 2.4 ft pieces across a 4.4 ft flight), so its pieces count together.
  let from = Infinity, to = -Infinity;
  for (const l of lines) {
    const d = sub(l.b, l.a), L = len(d);
    if (L < fl.width * 0.3) continue;
    const off = Math.asin(Math.min(1, Math.abs(dot(d, u)) / L)) * 180 / Math.PI; // 0 along the treads, 90 along the run
    const [ta, wa] = local(l.a), [tb, wb] = local(l.b);
    if (off < 15 || off > 75 || Math.abs(ta) > reach || Math.abs(tb) > reach || Math.max(Math.abs(wa), Math.abs(wb)) > fl.width / 2 + 0.5) continue;
    from = Math.min(from, wa, wb); to = Math.max(to, wa, wb);
  }
  return from <= -fl.width * 0.35 && to >= fl.width * 0.35;
}

/** An arrowhead on a plan: its point, the middle of its back, and the unit direction it points. */
type Arrowhead = { tip: Point; base: Point; dir: Point };

/**
 * A plan's arrowheads: filled triangles (Project 1's walklines), and open ones drawn as two short strokes meeting at a point
 * (Davey Lopes': 0.71 ft strokes at 45 degrees either side), 0.15 to 2 ft from point to back.
 */
function arrowheads(triangles: Point[][], lines: Line[]): Arrowhead[] {
  const heads: Arrowhead[] = [];
  const add = (tip: Point, base: Point) => { const axis = sub(tip, base), size = len(axis); if (size >= 0.15 && size <= 2) heads.push({ tip, base, dir: [axis[0] / size, axis[1] / size] }); };
  for (const tri of triangles) {
    const angleAt = (k: number) => { const p = tri[k], q = sub(tri[(k + 1) % 3], p), r = sub(tri[(k + 2) % 3], p); return Math.acos(Math.max(-1, Math.min(1, dot(q, r) / (len(q) * len(r) || 1)))); };
    const k = [0, 1, 2].sort((p, q) => angleAt(p) - angleAt(q))[0];
    if (len(sub(tri[k], mid(tri[(k + 1) % 3], tri[(k + 2) % 3]))) >= 0.3) add(tri[k], mid(tri[(k + 1) % 3], tri[(k + 2) % 3]));
  }
  // Open heads: strokes 0.2-1.5 ft long, alike within half again, sharing an end, 30-120 degrees apart.
  const strokes = lines.map(l => ({ a: l.a, b: l.b, L: len(sub(l.b, l.a)) })).filter(l => l.L >= 0.2 && l.L <= 1.5);
  const cell = (p: Point) => `${Math.round(p[0] / 0.05)},${Math.round(p[1] / 0.05)}`, ends = new Map<string, { i: number; at: Point; other: Point }[]>();
  strokes.forEach((l, i) => { for (const [at, other] of [[l.a, l.b], [l.b, l.a]] as [Point, Point][]) ends.set(cell(at), [...(ends.get(cell(at)) ?? []), { i, at, other }]); });
  for (const [key, here] of ends) {
    const [cx, cy] = key.split(",").map(Number), near = [-1, 0, 1].flatMap(dx => [-1, 0, 1].flatMap(dy => ends.get(`${cx + dx},${cy + dy}`) ?? []));
    for (const p of here) for (const q of near) {
      if (q.i <= p.i || len(sub(p.at, q.at)) > 0.03) continue;
      const lp = strokes[p.i].L, lq = strokes[q.i].L, vp = sub(p.other, p.at), vq = sub(q.other, q.at);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(vp, vq) / (lp * lq)))) * 180 / Math.PI;
      if (Math.max(lp, lq) / Math.min(lp, lq) <= 1.5 && angle >= 30 && angle <= 120) add(p.at, mid(p.other, q.other));
    }
  }
  return heads;
}

/**
 * The end of the flight its walkline arrow points to: an arrowhead (filled or open) near the middle of the flight's width (the
 * walkline runs along it; Project 1's within 0.15 ft) pointing along the run (within 3 degrees; a leader's arrow is aslant),
 * with a line behind it along the same axis (the walkline itself).
 */
function arrowOn(fl: Flight, heads: Arrowhead[], lines: Line[]): "a" | "b" | null {
  const { u, inside, local } = frame(fl);
  for (const { tip, base, dir } of heads) {
    if (!inside(tip, 0.3) || Math.abs(local(tip)[1]) > fl.width * 0.3 || Math.abs(dot(dir, u)) < Math.cos(3 * Math.PI / 180)) continue;
    const shaft = lines.some(l => {
      const d = sub(l.b, l.a), L = len(d);
      if (L < 0.2 || Math.abs(dot(d, dir)) / L < Math.cos(3 * Math.PI / 180)) return false;
      const side = (p: Point) => Math.abs(dot(sub(p, base), [-dir[1], dir[0]]));
      if (side(l.a) > 0.15 || side(l.b) > 0.15) return false;
      const t = [dot(sub(l.a, base), dir), dot(sub(l.b, base), dir)].sort((p, q) => p - q);
      return t[0] <= 0.3 && t[1] >= -0.3 && t[0] < 0; // reaches the arrow's back from behind it
    });
    if (shaft) return dot(dir, u) > 0 ? "b" : "a";
  }
  return null;
}

/**
 * Flights grouped into stairs: parallel flights within STAIR_WELL_FEET of each other (a U stair's two, a straight stair's two with
 * a landing between) are one stair.
 */
export function groupFlights(flights: Flight[]): Flight[][] {
  const parent = flights.map((_, i) => i), find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const corners = (fl: Flight) => { const { v } = frame(fl), h = fl.width / 2; return [[fl.a[0] + v[0] * h, fl.a[1] + v[1] * h], [fl.a[0] - v[0] * h, fl.a[1] - v[1] * h], [fl.b[0] - v[0] * h, fl.b[1] - v[1] * h], [fl.b[0] + v[0] * h, fl.b[1] + v[1] * h]] as Point[]; };
  const near = (p: Flight, q: Flight) => {
    const fp = frame(p), parallel = Math.abs(dot(fp.u, frame(q).u)) > Math.cos(2 * Math.PI / 180);
    return parallel && (corners(q).some(c => fp.inside(c, STAIR_WELL_FEET)) || corners(p).some(c => frame(q).inside(c, STAIR_WELL_FEET)));
  };
  for (let i = 0; i < flights.length; i++) for (let j = i + 1; j < flights.length; j++) if (near(flights[i], flights[j])) parent[find(j)] = find(i);
  const groups = new Map<number, Flight[]>();
  flights.forEach((fl, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), fl]));
  return [...groups.values()];
}

/** A stair's flights stand at most this far apart: the well between a U stair's two (Project 1's Stair A: 1.7 ft, with its rail). */
export const STAIR_WELL_FEET = 3;

/** The most a riser rises (building codes: 7"), with a little room for a floor height read to the inch. */
export const RISER_MAX_FEET = 7.3 / 12;

/**
 * A stair arriving at a level, walked down from it: the flights in order, each from its top (`a`) to its foot (`b`).
 * The flight with the walkline arrow is the top one (on the arriving level's plan the arrow starts at the floor and points
 * down); each next flight is the one whose end is nearest the last one's foot, entered there. When the flights shown come
 * to fewer risers than the floor height needs at RISER_MAX_FEET each, the stair goes round again under the flights shown
 * (Project 1's Stair B: three runs of 8 under two drawn), until it does. Null without an arrow, or when the flights would
 * have to go round more than 3 times (steps within the level, not a stair between floors).
 */
export function stairRuns(flights: StairFlight[], rise: number): { runs: { a: Point; b: Point; width: number; risers: number }[]; riser: number; repeated: boolean } | null {
  const arrowed = flights.map((_, i) => i).filter(i => flights[i].arrow);
  if (!arrowed.length || !(rise > 0)) return null;
  const shown = flights.reduce((s, f) => s + f.risers, 0), needed = Math.ceil(rise / RISER_MAX_FEET - 1e-9);
  if (shown * 3 < needed) return null;
  const end = (i: number, which: "a" | "b") => flights[i][which], other = (which: "a" | "b") => which === "a" ? "b" as const : "a" as const;
  // Where every flight has its arrow, the top one is the one whose top isn't another's foot.
  const first = arrowed.map(i => ({ i, apart: Math.min(Infinity, ...arrowed.filter(j => j !== i).map(j => len(sub(end(i, other(flights[i].arrow!)), end(j, flights[j].arrow!))))) })).sort((p, q) => q.apart - p.apart)[0].i;
  /** Flight i walked down from its end `top`. */
  const run = (i: number, top: "a" | "b") => { const fl = flights[i]; return top === "a" ? { a: fl.a, b: fl.b, width: fl.width, risers: fl.risers } : { a: fl.b, b: fl.a, width: fl.width, risers: fl.risers }; };
  const runs = [run(first, other(flights[first].arrow!))], used = new Set([first]);
  let total = flights[first].risers, last = first;
  while ((used.size < flights.length || total < needed) && runs.length < 12) {
    const foot = runs[runs.length - 1].b, all = flights.map((_, i) => i);
    const pool = used.size < flights.length ? all.filter(i => !used.has(i)) : flights.length > 1 ? all.filter(i => i !== last) : [last];
    // Entered at the end nearest the last foot. Its own arrow isn't trusted: an egress plan draws arrows one way on both of a
    // U stair's flights (Project 1's page 81), and a U stair's flights can't run the same way.
    const next = pool.map(i => { const top = len(sub(flights[i].a, foot)) <= len(sub(flights[i].b, foot)) ? "a" as const : "b" as const; return { i, top, gap: len(sub(end(i, top), foot)) }; }).sort((p, q) => p.gap - q.gap)[0];
    runs.push(run(next.i, next.top)); used.add(next.i);
    total += flights[next.i].risers; last = next.i;
  }
  return { runs, riser: rise / total, repeated: runs.length > flights.length };
}

/** Below each tread the flight is this thick, so it reads as a stepped slab; a landing is a slab this thick. */
export const STAIR_SLAB_FEET = 0.5;
/** A box of a stair, in feet: its middle on the plan, `top` its height (0 the arriving floor, negative below), `along` the unit direction of `length`. */
export type StairBox = { at: Point; top: number; along: Point; length: number; width: number; thickness: number };

/**
 * A stair drawn in 3D, in the arriving level's frame (stairRuns): each tread as a box at its height walking down from the
 * floor (0) to the floor below (-rise), each landing between runs as a slab, and `openings`, where the arriving floor is open
 * over it (each run, and each landing except the one under the arrival; shrunk a little so none touch).
 */
export function stairPieces(flights: StairFlight[], rise: number): { treads: StairBox[]; landings: StairBox[]; openings: Point[][]; risers: number; riser: number; runs: number; repeated: boolean } | null {
  const walk = stairRuns(flights, rise);
  if (!walk) return null;
  const treads: StairBox[] = [], landings: StairBox[] = [], r = walk.riser;
  const frameOf = (run: { a: Point; b: Point }) => { const d = sub(run.b, run.a), L = len(d) || 1, u: Point = [d[0] / L, d[1] / L]; return { u, v: [-u[1], u[0]] as Point, L }; };
  const at = (o: Point, u: Point, v: Point, t: number, w: number): Point => [o[0] + u[0] * t + v[0] * w, o[1] + u[1] * t + v[1] * w];
  const rect = (o: Point, u: Point, v: Point, t0: number, t1: number, w0: number, w1: number, pad = 0.05): Point[] => [at(o, u, v, t0 + pad, w0 + pad), at(o, u, v, t1 - pad, w0 + pad), at(o, u, v, t1 - pad, w1 - pad), at(o, u, v, t0 + pad, w1 - pad)];
  const openings: Point[][] = [], seen = new Set<string>();
  let z = 0;
  walk.runs.forEach((run, k) => {
    const { u, v, L } = frameOf(run), going = run.risers > 1 ? L / (run.risers - 1) : L;
    for (let i = 1; i < run.risers; i++) treads.push({ at: at(run.a, u, v, (i - 0.5) * going, 0), top: z - i * r, along: u, length: going, width: run.width, thickness: r + STAIR_SLAB_FEET });
    const key = [...run.a, ...run.b].map(n => Math.round(n)).sort().join();
    if (!seen.has(key)) { seen.add(key); openings.push(rect(run.a, u, v, 0, L, -run.width / 2, run.width / 2)); }
    z -= run.risers * r;
    const next = walk.runs[k + 1];
    if (!next) return;
    // The landing: past this run's foot to the next run's top; for a U stair (the next top beside this foot), as deep as the flights are wide.
    const nv = frameOf(next).v, corners = [at(next.a, nv, nv, 0, next.width / 2), at(next.a, nv, nv, 0, -next.width / 2)].map(p => [dot(sub(p, run.b), u), dot(sub(p, run.b), v)]);
    const reach = Math.max(...corners.map(c => c[0])), depth = reach < 0.5 ? Math.max(run.width, next.width) : reach;
    const w0 = Math.min(-run.width / 2, ...corners.map(c => c[1])), w1 = Math.max(run.width / 2, ...corners.map(c => c[1]));
    landings.push({ at: at(run.b, u, v, depth / 2, (w0 + w1) / 2), top: z, along: u, length: depth, width: w1 - w0, thickness: STAIR_SLAB_FEET });
    const top = walk.runs[0], tf = frameOf(top), arrival = at(top.a, tf.u, tf.v, -1, 0), landing = rect(run.b, u, v, 0, depth, w0, w1, 0);
    const under = (() => { const [t, w] = [dot(sub(arrival, run.b), u), dot(sub(arrival, run.b), v)]; return t >= 0 && t <= depth && w >= w0 && w <= w1; })();
    const lkey = landing.flat().map(n => Math.round(n)).sort().join();
    if (!under && !seen.has(lkey)) { seen.add(lkey); openings.push(rect(run.b, u, v, 0, depth, w0, w1)); }
  });
  const risers = walk.runs.reduce((s, x) => s + x.risers, 0);
  return { treads, landings, openings, risers, riser: r, runs: walk.runs.length, repeated: walk.repeated };
}

/** A stair on two plans of one set lines up within this, across its run. */
export const RISING_ALIGN_FEET = 0.75;

/**
 * Directions for a stair arriving at a level whose plan draws no walkline arrow on it (Davey Lopes' A102), from the plan of the
 * level below: each flight lying over a flight that rises there with an UP arrow runs down toward that flight's foot. Plans of
 * one set share their layout, so the same stair sits at the same place on both (within RISING_ALIGN_FEET across its run).
 */
export function borrowArrows(flights: StairFlight[], rising: StairFlight[]): StairFlight[] {
  return flights.map(f => {
    if (f.arrow) return f;
    const fr = frame(f);
    const under = rising.find(r => {
      if (!r.arrow || Math.abs(dot(fr.u, frame(r).u)) < Math.cos(3 * Math.PI / 180)) return false;
      const [ta, wa] = fr.local(r.a), [tb, wb] = fr.local(r.b);
      return Math.abs((wa + wb) / 2) <= RISING_ALIGN_FEET && Math.max(ta, tb) >= -fr.length / 2 && Math.min(ta, tb) <= fr.length / 2;
    });
    if (!under) return f;
    const foot = under.arrow === "a" ? under.b : under.a; // an UP arrow points to the top of the flight; its other end is the foot
    return { ...f, arrow: len(sub(f.a, foot)) <= len(sub(f.b, foot)) ? "a" as const : "b" as const };
  });
}

// Openings in a floor, from the plan's lines (drawings to 3D). A plan marks an opening, "open to below", with a big X from corner to
// corner in fine dashes. So the space under the X has no floor to draw. Deterministic geometry, like the walls; pure. Feet, y down.

import type { Point, Segment } from "./plan-vectors";

/** The fine dashes of an X: lighter than this pen, and between these lengths in feet (Project 1: 0.24 pt, 0.5 ft dashes, about 2 ft apart). */
const DASH_MAX_WEIGHT = 0.4, DASH_MIN_FEET = 0.2, DASH_MAX_FEET = 1.5;
/** A dash's own angle is rough (its ends are close together), so it may be this far off the line it's on. */
const DASH_ANGLE_DEGREES = 6;
/** Dashes on one line: within this of it, with gaps up to this, and at least this many of them over at least this length. */
const LINE_REACH_FEET = 0.2, LINE_GAP_FEET = 4, LINE_MIN_DASHES = 8, LINE_MIN_FEET = 15;
/** The two lines of an X cross near their middles, at a real angle, and neither runs along the plan's square directions. */
const CROSS_MIDDLE_SHARE = 0.25, CROSS_MIN_DEGREES = 20, SQUARE_DEGREES = 5;

/** A line with another this close beside it, at this close to its angle, is part of a hatch. Closer than this it's the same line. */
const HATCH_FEET = 8, HATCH_ANGLE_DEGREES = 3, SAME_LINE_FEET = 1;

type DashedLine = { angle: number; a: Point; b: Point; length: number };
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Runs of fine dashes on a straight line, fitted through the dashes' middles, whose positions are exact. */
function dashedLines(segments: Segment[], pointsPerFoot: number): DashedLine[] {
  const dashes = segments.filter(s => s.width < DASH_MAX_WEIGHT).map(s => {
    const a: Point = [s.a[0] / pointsPerFoot, s.a[1] / pointsPerFoot], b: Point = [s.b[0] / pointsPerFoot, s.b[1] / pointsPerFoot];
    let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (angle < 0) angle += 180;
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point, angle, length: dist(a, b) };
  }).filter(d => d.length >= DASH_MIN_FEET && d.length <= DASH_MAX_FEET);
  const lines: DashedLine[] = [];
  for (let degrees = 0; degrees < 180; degrees += 0.5) {
    const radians = (degrees * Math.PI) / 180, c = Math.cos(radians), s = Math.sin(radians);
    const near = dashes.filter(d => { const off = Math.abs(d.angle - degrees); return Math.min(off, 180 - off) <= DASH_ANGLE_DEGREES; });
    const bins = new Map<number, typeof near>();
    for (const d of near) { const k = Math.round((-d.mid[0] * s + d.mid[1] * c) / LINE_REACH_FEET), list = bins.get(k) ?? []; list.push(d); bins.set(k, list); }
    for (const [k, list] of bins) {
      // A line can sit on a bin's edge: its neighbour's dashes count too. Counted once, from the lower bin.
      const all = [...list, ...(bins.get(k + 1) ?? [])];
      if (all.length < LINE_MIN_DASHES) continue;
      const along = all.map(d => d.mid[0] * c + d.mid[1] * s).sort((p, q) => p - q), offset = all.reduce((t, d) => t + (-d.mid[0] * s + d.mid[1] * c), 0) / all.length;
      const at = (t: number): Point => [t * c - offset * s, t * s + offset * c];
      let from = 0;
      for (let i = 1; i <= along.length; i++) {
        if (i < along.length && along[i] - along[i - 1] <= LINE_GAP_FEET) continue;
        if (i - from >= LINE_MIN_DASHES && along[i - 1] - along[from] >= LINE_MIN_FEET) lines.push({ angle: degrees, a: at(along[from]), b: at(along[i - 1]), length: along[i - 1] - along[from] });
        from = i;
      }
    }
  }
  return lines;
}

/**
 * Where a plan's floor openings are: the crossing of each X, in feet. A sheet's lowest level has no floor below it to open onto,
 * so callers ask only for the levels above. `box` limits it to the plan's area, in page points.
 */
export function floorOpenings(segments: Segment[], pointsPerFoot: number, box?: [number, number, number, number]): Point[] {
  const plan = !box ? segments : segments.filter(s => [s.a, s.b].every(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]));
  const square = (degrees: number) => Math.min(degrees % 90, 90 - (degrees % 90)) < SQUARE_DEGREES;
  const fitted = dashedLines(plan, pointsPerFoot).filter(l => !square(l.angle));
  // An X stands alone. Dashed lines repeating side by side are a hatch, or a section's sloping members. The same line fitted at a
  // neighbouring angle sits right on top of itself, so only lines clear of it count.
  const across = (l: DashedLine, p: Point) => Math.abs((p[0] - l.a[0]) * (l.b[1] - l.a[1]) - (p[1] - l.a[1]) * (l.b[0] - l.a[0])) / l.length;
  const lines = fitted.filter(l => !fitted.some(o => {
    if (o === l) return false;
    const apart = Math.abs(o.angle - l.angle);
    if (Math.min(apart, 180 - apart) > HATCH_ANGLE_DEGREES) return false;
    const middle: Point = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2], off = across(l, middle);
    const along = ((middle[0] - l.a[0]) * (l.b[0] - l.a[0]) + (middle[1] - l.a[1]) * (l.b[1] - l.a[1])) / (l.length * l.length);
    return off > SAME_LINE_FEET && off <= HATCH_FEET && along > 0 && along < 1;
  }));
  const found: Point[] = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const p = lines[i], q = lines[j], apart = Math.abs(p.angle - q.angle);
    if (Math.min(apart, 180 - apart) < CROSS_MIN_DEGREES) continue;
    const rx = p.b[0] - p.a[0], ry = p.b[1] - p.a[1], sx = q.b[0] - q.a[0], sy = q.b[1] - q.a[1], den = rx * sy - ry * sx;
    if (!den) continue;
    const t = ((q.a[0] - p.a[0]) * sy - (q.a[1] - p.a[1]) * sx) / den, u = ((q.a[0] - p.a[0]) * ry - (q.a[1] - p.a[1]) * rx) / den;
    if (Math.abs(t - 0.5) > CROSS_MIDDLE_SHARE || Math.abs(u - 0.5) > CROSS_MIDDLE_SHARE) continue;
    const at: Point = [p.a[0] + t * rx, p.a[1] + t * ry];
    // Neighbouring fits of one X cross within a few feet of each other: one opening.
    if (!found.some(f => dist(f, at) < 5)) found.push(at);
  }
  return found;
}

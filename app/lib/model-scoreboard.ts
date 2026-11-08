// The scoreboard for drawings to 3D (Danial, 6 Nov: "I need very accurate 3D models"). It measures a level's model
// against what the drawing itself says, so accuracy is a number rather than an impression:
//   - dimensions: each dimension's measured length against the value printed on it (is the geometry and scale true?)
//   - wall faces: every long face the drawing dimensions to, and every line in the wall weight, should be on a wall
//   - doors: the door schedule's doors, at the width it gives
//   - rooms: each room's tag in a closed space of its own (a shared or open space means a wall or door is missing)
// Pure; scripts/score-model.mjs runs it on a real PDF. It never changes the model.

import type { Point, Segment } from "./plan-vectors";
import { faces, inside } from "./room-detection";

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const degrees = (p: Point, q: Point) => { const a = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI; return a < 0 ? a + 180 : a >= 180 ? a - 180 : a; };
/** The smaller angle between two undirected lines, in degrees. */
const between = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; };
const median = (values: number[]) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a: number, b: number) => (b ? `${a} of ${b} (${Math.round((100 * a) / b)}%)` : "none to check");

// ── Dimensions ──

/** One dimension's run from tick to tick, in page points. */
export type DimensionSpan = { a: Point; b: Point; feet: number };

/** How far a dimension line may run past its last tick, in page points (Project 1: 3.4). */
const OVERSHOOT_POINTS = 6;

/**
 * A dimension line drawn from tick to tick, the way Revit exports them: a tick is two short strokes leaving one point in
 * opposite directions, about 45 degrees to the line. Dimensions drawn with arrows aren't found, and the check says so.
 */
export function dimensionSpans(segments: Segment[], pointsPerFoot: number): DimensionSpan[] {
  const CELL = 0.5, cell = (v: number) => Math.round(v / CELL);
  const strokes = new Map<string, { at: Point; angle: number }[]>();
  const add = (at: Point, to: Point) => {
    const k = `${cell(at[0])},${cell(at[1])}`;
    strokes.set(k, [...(strokes.get(k) ?? []), { at, angle: (Math.atan2(to[1] - at[1], to[0] - at[0]) * 180) / Math.PI }]);
  };
  for (const s of segments) {
    const L = dist(s.a, s.b);
    if (L >= 1 && L <= 6 && s.width > 0.6) { add(s.a, s.b); add(s.b, s.a); }
  }
  const ticks = new Map<string, { at: Point; angle: number }>();
  for (const [k, list] of strokes) {
    const pair = list.find((p, i) => list.some((q, j) => i !== j && dist(p.at, q.at) < 0.3 && Math.abs(Math.abs(p.angle - q.angle) - 180) < 5));
    if (pair) ticks.set(k, pair);
  }
  const allTicks = [...ticks.values()];
  const seen = new Set<string>(), spans: DimensionSpan[] = [];
  for (const s of segments) {
    const L = dist(s.a, s.b);
    if (L < 1.5 || s.width > 0.7) continue;
    const ux = (s.b[0] - s.a[0]) / L, uy = (s.b[1] - s.a[1]) / L, line = degrees(s.a, s.b);
    const on = allTicks
      .map(t => ({ t, along: (t.at[0] - s.a[0]) * ux + (t.at[1] - s.a[1]) * uy, off: Math.abs((t.at[0] - s.a[0]) * uy - (t.at[1] - s.a[1]) * ux) }))
      .filter(({ along, off, t }) => off < 0.25 && along >= -0.3 && along <= L + 0.3 && Math.abs(between(line, t.angle) - 45) <= 12)
      .sort((p, q) => p.along - q.along);
    if (on.length < 2) continue;
    // A dimension line stops at its ticks or just past them. A witness line runs well past, even where it crosses two ticks.
    if (on[0].along > OVERSHOOT_POINTS || L - on[on.length - 1].along > OVERSHOOT_POINTS) continue;
    for (let i = 0; i + 1 < on.length; i++) {
      const a = on[i].t.at, b = on[i + 1].t.at, gap = dist(a, b);
      if (gap < 1.5) continue;
      const k = [`${Math.round(a[0])},${Math.round(a[1])}`, `${Math.round(b[0])},${Math.round(b[1])}`].sort().join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      spans.push({ a, b, feet: gap / pointsPerFoot });
    }
  }
  return spans;
}

/** Inches as printed or as OCR reads them: 9, 5 3/4, 3/4, and with the space lost, 91/2 or 111/2. */
function parseInches(text: string): number | null {
  const whole = text.match(/^\d{1,2}$/);
  if (whole) return +text;
  const m = text.match(/^(?:(\d{1,2}?) ?)?(\d)\/(2|4|8|16)$/);
  return m ? (m[1] ? +m[1] : 0) + +m[2] / +m[3] : null;
}

/**
 * A printed dimension as feet: 23' - 0", 7' - 5 3/4", 10 1/2", 9". OCR often loses a mark or a space, so 72-7 1/2" and
 * 23 0" read as feet and inches too. Null unless the whole text reads as a dimension: a bare number says nothing of its unit.
 */
export function parseDimension(text: string): number | null {
  const t = text.replace(/[’‘`´]/g, "'").replace(/[”“]|''/g, '"').replace(/\s+/g, " ").trim().replace(/ ?"$/, '"');
  const feet = t.match(/^(\d{1,3}) ?(?:' ?-? ?|- ?)(.+?)"?$/) ?? t.match(/^(\d{1,3}) (\d{1,2})"$/);
  if (feet) {
    const inches = parseInches(feet[2].trim());
    return inches !== null && inches < 12 ? +feet[1] + inches / 12 : null;
  }
  if (!t.endsWith('"')) return null;
  const inches = parseInches(t.slice(0, -1).trim());
  return inches !== null && inches < 12 ? inches / 12 : null;
}

export type DimensionScore = {
  spans: number; read: number; agree: number; medianDiffInches: number | null;
  /** Readings more than half an inch from the measured length: a misread number, or a real difference to look at. */
  disagree: { span: DimensionSpan; printed: string; printedFeet: number; diffInches: number }[];
};

export function scoreDimensions(spans: DimensionSpan[], printed: string[]): DimensionScore {
  const diffs: number[] = [], disagree: DimensionScore["disagree"] = [];
  spans.forEach((span, i) => {
    const printedFeet = parseDimension(printed[i] ?? "");
    if (printedFeet === null) return;
    const diffInches = Math.abs(printedFeet - span.feet) * 12;
    diffs.push(diffInches);
    if (diffInches > 0.5) disagree.push({ span, printed: printed[i], printedFeet, diffInches });
  });
  return { spans: spans.length, read: diffs.length, agree: diffs.length - disagree.length, medianDiffInches: median(diffs), disagree };
}

// ── Lines in the wall weight ──

/** Pieces of one straight line, joined, in page points. */
export type LineRun = { a: Point; b: Point; angle: number };

/** Lines of exactly this weight, joined where pieces of one straight line nearly touch. */
export function lineRuns(segments: Segment[], weight: number, box?: [number, number, number, number]): LineRun[] {
  const within = (p: Point) => !box || (p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]);
  const groups = new Map<number, { angle: number; lines: { off: number; s0: number; s1: number }[] }>();
  for (const s of segments) {
    if (Math.abs(s.width - weight) > 0.011 || dist(s.a, s.b) < 1 || !within(s.a) || !within(s.b)) continue;
    const key = Math.round(degrees(s.a, s.b) * 2);
    const g = groups.get(key) ?? { angle: key / 2, lines: [] };
    const r = (g.angle * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
    const along = (p: Point) => p[0] * c + p[1] * n, across = (p: Point) => -p[0] * n + p[1] * c;
    const [s0, s1] = [along(s.a), along(s.b)].sort((x, y) => x - y);
    g.lines.push({ off: (across(s.a) + across(s.b)) / 2, s0, s1 });
    groups.set(key, g);
  }
  const out: LineRun[] = [];
  for (const { angle, lines } of groups.values()) {
    const r = (angle * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
    const point = (s: number, off: number): Point => [s * c - off * n, s * n + off * c];
    lines.sort((p, q) => p.off - q.off || p.s0 - q.s0);
    const clusters: (typeof lines)[] = [];
    for (const l of lines) { const last = clusters.at(-1); if (last && l.off - last[0].off <= 0.4) last.push(l); else clusters.push([l]); }
    for (const cluster of clusters) {
      cluster.sort((p, q) => p.s0 - q.s0);
      let run = { s0: cluster[0].s0, s1: cluster[0].s1 };
      const off = cluster.reduce((t, l) => t + l.off, 0) / cluster.length;
      for (const l of cluster.slice(1)) {
        if (l.s0 <= run.s1 + 1.5) run.s1 = Math.max(run.s1, l.s1);
        else { out.push({ a: point(run.s0, off), b: point(run.s1, off), angle }); run = { s0: l.s0, s1: l.s1 }; }
      }
      out.push({ a: point(run.s0, off), b: point(run.s1, off), angle });
    }
  }
  return out;
}

type WallLike = { a: Point; b: Point; thickness: number };

/**
 * How well a line on the sheet sits on a wall's face: the closest face within reach, and how much of the line
 * runs beside that wall, as a stretch along it. Feet. Null when no parallel wall is near.
 */
function faceOf(run: { a: Point; b: Point }, walls: WallLike[], reach: number) {
  const L = dist(run.a, run.b) || 1, ux = (run.b[0] - run.a[0]) / L, uy = (run.b[1] - run.a[1]) / L;
  const hits: { offset: number; s0: number; s1: number }[] = [];
  for (const w of walls) {
    const wl = dist(w.a, w.b);
    if (!wl || Math.abs(ux * (w.b[1] - w.a[1]) / wl - uy * (w.b[0] - w.a[0]) / wl) > Math.sin((3 * Math.PI) / 180)) continue;
    const across = (p: Point) => (p[0] - run.a[0]) * -uy + (p[1] - run.a[1]) * ux;
    const center = (across(w.a) + across(w.b)) / 2;
    // A line inside a wall is one of its layers, so it's on that wall.
    const offset = Math.max(0, Math.abs(center) - w.thickness / 2);
    if (offset > reach) continue;
    const along = (p: Point) => (p[0] - run.a[0]) * ux + (p[1] - run.a[1]) * uy;
    const [t0, t1] = [along(w.a), along(w.b)].sort((x, y) => x - y);
    const s0 = Math.max(0, t0 - 0.2), s1 = Math.min(L, t1 + 0.2);
    if (s1 > s0) hits.push({ offset, s0, s1 });
  }
  return { length: L, hits };
}

const covered = (spans: { s0: number; s1: number }[]) => {
  let total = 0, end = -Infinity;
  for (const { s0, s1 } of [...spans].sort((p, q) => p.s0 - q.s0)) { if (s1 <= end) continue; total += s1 - Math.max(s0, end); end = s1; }
  return total;
};

const toFeet = (r: { a: Point; b: Point }, pointsPerFoot: number) => ({ a: [r.a[0] / pointsPerFoot, r.a[1] / pointsPerFoot] as Point, b: [r.b[0] / pointsPerFoot, r.b[1] / pointsPerFoot] as Point });

export type FaceMiss = { a: Point; b: Point; feet: number };
export type FaceScore = { total: number; found: number; medianOffsetInches: number | null; misses: FaceMiss[] };

/** Within this of a wall's face counts as on it. The model keeps positions to 0.1 ft, so it can't be tighter than an inch or so. */
export const FACE_REACH_FEET = 2 / 12;
/** A line in the wall weight shorter than this is a column, jamb or return, not a wall to score. */
export const FACE_MIN_FEET = 3;

/**
 * The long lines in the wall weight that a dimension's witness line lands on (exactly, within an inch): faces the drawing
 * itself pins down. Each should be on a wall in the model. Grid lines and column faces don't count: a grid line isn't in the
 * wall weight, and a column's faces are too short.
 */
export function scoreDimensionedFaces(spans: DimensionSpan[], runs: LineRun[], walls: WallLike[], pointsPerFoot: number): FaceScore {
  const long = runs.filter(r => dist(r.a, r.b) >= FACE_MIN_FEET * pointsPerFoot);
  const pinned = new Set<LineRun>();
  for (const span of spans) {
    const line = degrees(span.a, span.b), L = dist(span.a, span.b) || 1, ux = (span.b[0] - span.a[0]) / L, uy = (span.b[1] - span.a[1]) / L;
    for (const tick of [span.a, span.b]) for (const run of long) {
      if (Math.abs(between(run.angle, line) - 90) > 2) continue;
      if (Math.abs((run.a[0] - tick[0]) * ux + (run.a[1] - tick[1]) * uy) <= (1 / 12) * pointsPerFoot) pinned.add(run);
    }
  }
  const offsets: number[] = [], misses: FaceMiss[] = [];
  for (const run of pinned) {
    const feet = toFeet(run, pointsPerFoot), { length, hits } = faceOf(feet, walls, FACE_REACH_FEET);
    if (hits.length && covered(hits) >= 0.5 * length) offsets.push(Math.min(...hits.map(h => h.offset)) * 12);
    else misses.push({ ...feet, feet: length });
  }
  return { total: pinned.size, found: offsets.length, medianOffsetInches: median(offsets), misses: misses.sort((p, q) => q.feet - p.feet) };
}

export type LineScore = { feet: number; onWalls: number; largestMissed: FaceMiss[] };

/** Of the lines at least 2 ft long drawn in the wall weight, how much lies on a wall's face. What's left is walls missed, or stairs, curbs and columns. */
export function scoreWallLines(runs: LineRun[], walls: WallLike[], pointsPerFoot: number): LineScore {
  let feetTotal = 0, feetOn = 0;
  const missed: FaceMiss[] = [];
  for (const run of runs) {
    if (dist(run.a, run.b) < 2 * pointsPerFoot) continue;
    const feet = toFeet(run, pointsPerFoot), { length, hits } = faceOf(feet, walls, FACE_REACH_FEET), on = Math.min(length, covered(hits));
    feetTotal += length; feetOn += on;
    // Only the stretches off a wall, so a long line missed for a few feet doesn't read as missed all along.
    const at = (t: number): Point => [feet.a[0] + (feet.b[0] - feet.a[0]) * t / length, feet.a[1] + (feet.b[1] - feet.a[1]) * t / length];
    let from = 0;
    for (const { s0, s1 } of [...hits, { s0: length, s1: length }].sort((p, q) => p.s0 - q.s0)) {
      if (s0 - from >= 2) missed.push({ a: at(from), b: at(s0), feet: Math.round((s0 - from) * 10) / 10 });
      from = Math.max(from, s1);
    }
  }
  return { feet: Math.round(feetTotal), onWalls: Math.round(feetOn), largestMissed: missed.sort((p, q) => q.feet - p.feet).slice(0, 25) };
}

// ── Walls that may not be real ──
// Nothing on a drawing lists its walls, so there's no key to score false ones against. These are the patterns real walls
// don't show. A flag means "look at this", not "this is wrong": the report calls them flagged, and a person decides.

export type WallFlag = "touches nothing" | "too thin" | "across a door" | "doubled";
export type FlaggedWall = { a: Point; b: Point; thickness: number; feet: number; flags: WallFlag[] };
export type WallFlagScore = { walls: number; feet: number; flaggedFeet: number; flagged: FlaggedWall[] };

/** Thinner than any wall we'd expect: a 2 1/2" stud with one layer of board is over 3". */
export const THIN_WALL_FEET = 0.25;
/** An end this close to another wall, glass or door touches it. */
const TOUCH_FEET = 1.5;

const distanceToLine = (p: Point, l: { a: Point; b: Point }) => {
  const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], t = Math.max(0, Math.min(1, ((p[0] - l.a[0]) * dx + (p[1] - l.a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return dist(p, [l.a[0] + t * dx, l.a[1] + t * dy]);
};

export function scoreWallFlags(walls: WallLike[], doors: { a: Point; b: Point }[], glazing: { a: Point; b: Point }[]): WallFlagScore {
  const length = (w: { a: Point; b: Point }) => dist(w.a, w.b);
  const flagged: FlaggedWall[] = [];
  walls.forEach((w, i) => {
    const flags: WallFlag[] = [], feet = length(w);
    if (w.thickness < THIN_WALL_FEET) flags.push("too thin");
    const others = walls.filter((_, j) => j !== i);
    const touches = (p: Point) => others.some(o => distanceToLine(p, o) <= o.thickness / 2 + TOUCH_FEET) || [...glazing, ...doors].some(l => distanceToLine(p, l) <= TOUCH_FEET);
    if (!touches(w.a) && !touches(w.b)) flags.push("touches nothing");
    // A door's opening is a gap in its wall: a wall running along through the opening's middle wasn't there to be read.
    const ux = (w.b[0] - w.a[0]) / (feet || 1), uy = (w.b[1] - w.a[1]) / (feet || 1);
    const across = (p: Point) => Math.abs((p[0] - w.a[0]) * uy - (p[1] - w.a[1]) * ux), along = (p: Point) => (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uy;
    const inDoor = doors.some(d => {
      const dl = length(d), mid: Point = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
      if (dl < 1 || Math.abs(((d.b[0] - d.a[0]) * uy - (d.b[1] - d.a[1]) * ux) / dl) > Math.sin((5 * Math.PI) / 180)) return false;
      return across(mid) <= w.thickness / 2 + 0.1 && along(mid) > 0.5 && along(mid) < feet - 0.5;
    });
    if (inDoor) flags.push("across a door");
    // Two walls running side by side and touching, the shorter flagged: one wall read twice would count its quantity twice.
    const doubled = others.some(o => {
      const ol = length(o);
      if (!ol || ol < feet || Math.abs(ux * (o.b[1] - o.a[1]) / ol - uy * (o.b[0] - o.a[0]) / ol) > Math.sin((3 * Math.PI) / 180)) return false;
      const [t0, t1] = [along(o.a), along(o.b)].sort((x, y) => x - y), overlap = Math.min(feet, t1) - Math.max(0, t0);
      const apart = (across(o.a) + across(o.b)) / 2;
      return overlap >= 0.5 * feet && apart <= (w.thickness + o.thickness) / 2 + 1 / 12;
    });
    if (doubled) flags.push("doubled");
    if (flags.length) flagged.push({ a: w.a, b: w.b, thickness: w.thickness, feet: Math.round(feet * 10) / 10, flags });
  });
  return {
    walls: walls.length, feet: Math.round(walls.reduce((t, w) => t + length(w), 0)),
    flaggedFeet: Math.round(flagged.reduce((t, w) => t + w.feet, 0)), flagged: flagged.sort((p, q) => q.feet - p.feet),
  };
}

// ── Glass ──

type GlassRun = { a: Point; b: Point; feet: number };
export type GlassScore = { runs: number; feet: number; tags: number; tagsNearGlass: number; tagsMissed: Point[]; aloneRuns: GlassRun[] };

/** How far a glass tag may sit from its glass, in feet: they sit beside it, or at the end of a short leader. */
export const GLASS_TAG_FEET = 10;

/**
 * Every storefront or curtain wall tag on a plan should have glass near it, which checks glass the reader may have missed.
 * A run with nothing at either end is the opposite check: glass stands in a wall or beside other glass. Tags in page feet.
 */
export function scoreGlass(tags: Point[], glazing: { a: Point; b: Point }[], walls: WallLike[], doors: { a: Point; b: Point }[]): GlassScore {
  const tagsMissed = tags.filter(t => !glazing.some(g => distanceToLine(t, g) <= GLASS_TAG_FEET));
  const run = (g: { a: Point; b: Point }): GlassRun => ({ a: g.a, b: g.b, feet: Math.round(dist(g.a, g.b) * 10) / 10 });
  const aloneRuns = glazing.filter((g, i) => {
    const others = glazing.filter((_, j) => j !== i);
    const touches = (p: Point) => walls.some(w => distanceToLine(p, w) <= w.thickness / 2 + TOUCH_FEET) || [...others, ...doors].some(l => distanceToLine(p, l) <= TOUCH_FEET);
    return !touches(g.a) && !touches(g.b);
  }).map(run);
  return { runs: glazing.length, feet: Math.round(glazing.reduce((t, g) => t + dist(g.a, g.b), 0)), tags: tags.length, tagsNearGlass: tags.length - tagsMissed.length, tagsMissed, aloneRuns };
}

// ── Doors ──

export type ScheduledDoor = { number: string; widthInches: number | null; at: Point | null };
export type FoundDoor = { a: Point; b: Point; width: number; leaves: number; kind: string };
export type DoorRow = { number: string; status: "found" | "missed" | "not on plan key"; scheduledInches: number | null; foundInches: number | null; widthRight: boolean | null };
export type DoorScore = { scheduled: number; checked: number; found: number; widthChecked: number; widthRight: number; rows: DoorRow[]; extra: FoundDoor[] };

/** A door's opening midpoint within this of where the schedule's door is, in feet. */
export const DOOR_NEAR_FEET = 2.5;
/** The schedule's width against the door read, in inches. */
export const DOOR_WIDTH_INCHES = 3;

/**
 * The schedule's doors against those read. `at` says where each is on the plan, in feet. One read door answers for one
 * scheduled door, nearest first. Doors read that the schedule doesn't have are listed: stalls are left out already.
 */
export function scoreDoors(scheduled: ScheduledDoor[], read: FoundDoor[]): DoorScore {
  const doors = read.filter(d => d.kind === "door");
  const mid = (d: FoundDoor): Point => [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
  const pairs = scheduled.flatMap((s, i) => s.at ? doors.map((d, j) => ({ i, j, gap: dist(mid(d), s.at!) })).filter(p => p.gap <= DOOR_NEAR_FEET) : []).sort((p, q) => p.gap - q.gap);
  const doorFor = new Map<number, number>(), used = new Set<number>();
  for (const p of pairs) if (!doorFor.has(p.i) && !used.has(p.j)) { doorFor.set(p.i, p.j); used.add(p.j); }
  const rows = scheduled.map((s, i): DoorRow => {
    if (!s.at) return { number: s.number, status: "not on plan key", scheduledInches: s.widthInches, foundInches: null, widthRight: null };
    const j = doorFor.get(i);
    if (j === undefined) return { number: s.number, status: "missed", scheduledInches: s.widthInches, foundInches: null, widthRight: null };
    const foundInches = Math.round(doors[j].width * 12 * 10) / 10;
    return { number: s.number, status: "found", scheduledInches: s.widthInches, foundInches, widthRight: s.widthInches === null ? null : Math.abs(foundInches - s.widthInches) <= DOOR_WIDTH_INCHES };
  });
  return {
    scheduled: scheduled.length, checked: rows.filter(r => r.status !== "not on plan key").length, found: rows.filter(r => r.status === "found").length,
    widthChecked: rows.filter(r => r.widthRight !== null).length, widthRight: rows.filter(r => r.widthRight).length, rows,
    extra: doors.filter((_, j) => !used.has(j)),
  };
}

// ── Rooms ──

export type RoomTag = { number: string; name: string; at: Point };
export type RoomRow = RoomTag & { status: "closed" | "shared" | "open"; area: number | null; sharedWith: string[] };
export type RoomScore = { total: number; closed: number; shared: number; open: number; rows: RoomRow[] };

/**
 * Each room tag against the spaces the walls, doors and glass close. Its own closed space is right; a space shared with
 * another room's tag means a wall between them is missing; no closed space means a wall or door leaves a gap.
 */
export function scoreRooms(tags: RoomTag[], lines: { a: Point; b: Point }[]): RoomScore {
  const spaces = faces(lines);
  const area = (poly: Point[]) => Math.abs(poly.reduce((s, [x, y], i) => { const [nx, ny] = poly[(i + 1) % poly.length]; return s + x * ny - nx * y; }, 0) / 2);
  const rows = tags.map((t): RoomRow => {
    const holding = spaces.filter(poly => inside(t.at, poly));
    if (!holding.length) return { ...t, status: "open", area: null, sharedWith: [] };
    const space = holding.reduce((p, q) => (area(q) < area(p) ? q : p));
    const sharedWith = tags.filter(o => o !== t && inside(o.at, space)).map(o => o.number);
    return { ...t, status: sharedWith.length ? "shared" : "closed", area: Math.round(area(space)), sharedWith };
  });
  const count = (s: RoomRow["status"]) => rows.filter(r => r.status === s).length;
  return { total: rows.length, closed: count("closed"), shared: count("shared"), open: count("open"), rows };
}

// ── Room shapes ──

export type RoomShapeRow = {
  room: string; name?: string;
  /** The room's ceiling zones, in square feet. */
  zoneArea: number;
  /** The read space holding most of them, its area, and how much of the zones it holds (0-1). Null where none does. */
  spaceArea: number | null; covered: number;
  /** How much of that space is outside the room's zones (0-1): the room runs on into something, or a wall is missing. */
  outside: number;
  /** Other read spaces holding at least a tenth of the zones: a false wall has split the room. */
  splitInto: number[];
};
export type RoomShapeScore = { total: number; whole: number; rows: RoomShapeRow[] };

/** A room counts as whole when one read space holds at least this share of its ceiling zones. */
export const ROOM_WHOLE_SHARE = 0.85;

/**
 * Each room's outline from a source apart from the walls (Project 1: the ceiling zones on its reflected ceiling plans, read from
 * their filled regions), against the spaces read from the walls. Unlike "closed", this sees a room split by a false line or
 * running on into the next. Sampled on a half-foot grid. Spaces run to wall centerlines and zones to wall faces, so a space
 * always has a little outside its zones.
 */
export function scoreRoomShapes(zones: { room: string; name?: string; points: Point[] }[], spaces: Point[][], step = 0.5): RoomShapeScore {
  const area = (poly: Point[]) => Math.abs(poly.reduce((s, [x, y], i) => { const [nx, ny] = poly[(i + 1) % poly.length]; return s + x * ny - nx * y; }, 0) / 2);
  const rooms = new Map<string, { points: Point[][]; name?: string }>();
  for (const z of zones) { const r = rooms.get(z.room) ?? { points: [], name: z.name }; r.points.push(z.points); rooms.set(z.room, r); }
  const rows = [...rooms].map(([room, { points, name }]): RoomShapeRow => {
    const all = points.flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]), tally = new Map<number, number>();
    let total = 0;
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      if (!points.some(poly => inside([x, y], poly))) continue;
      total++;
      let best = -1;
      spaces.forEach((s, i) => { if (inside([x, y], s) && (best < 0 || area(s) < area(spaces[best]))) best = i; });
      if (best >= 0) tally.set(best, (tally.get(best) ?? 0) + 1);
    }
    const ranked = [...tally].sort((p, q) => q[1] - p[1]), top = ranked[0];
    return {
      room, name, zoneArea: Math.round(total * step * step),
      spaceArea: top ? Math.round(area(spaces[top[0]])) : null, covered: top && total ? top[1] / total : 0,
      outside: top ? Math.max(0, 1 - top[1] * step * step / area(spaces[top[0]])) : 0,
      splitInto: ranked.slice(1).filter(([, n]) => n >= 0.1 * total).map(([i]) => Math.round(area(spaces[i]))),
    };
  });
  return { total: rows.length, whole: rows.filter(r => r.covered >= ROOM_WHOLE_SHARE).length, rows };
}

// ── The report ──

export type LevelScore = {
  sheet: string; walls: { count: number; feet: number }; wallWeight: number | null;
  dimensions: DimensionScore; faces: FaceScore; lines: LineScore; doors: DoorScore | null; rooms: RoomScore | null;
  wallFlags: WallFlagScore; glass: GlassScore;
  /** Operable partitions and guardrails read. No key: nothing lists them, so a person checks them on the overlay. */
  partitions: { a: Point; b: Point; kind?: "railing" }[];
  /** Columns read. No key here either: the structural sheets aren't read. */
  columns: { at: Point; width: number; depth: number }[];
  /** Where the plan marks the floor open to the level below. No key: a person checks them on the overlay. */
  openings?: Point[];
  /** Stairs arriving from the level below, each as its flights' risers. No key: a person checks them against the stair sections. */
  stairs?: { flights: { risers: number }[] }[];
  /** Rooms against an outline from another source; null with none to compare against. */
  roomShapes?: RoomShapeScore | null;
};

const inchesText = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100) / 100} in`);

/** The scoreboard as Markdown. A check with nothing to compare against says so rather than scoring zero. */
export function scoreboardReport(levels: LevelScore[], title = "Drawings to 3D scoreboard"): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const out = [`# ${title}`, "", line(["Check", ...levels.map(l => l.sheet)]), line(["---", ...levels.map(() => "---")])];
  const row = (name: string, cell: (l: LevelScore) => string) => out.push(line([name, ...levels.map(cell)]));
  row("Printed values OCR read that match the measured length (within 1/2 in)", l => pct(l.dimensions.agree, l.dimensions.read));
  row("Dimensions found / values OCR could read", l => `${l.dimensions.spans} / ${l.dimensions.read}`);
  row("Dimensioned wall faces in the model (within 2 in)", l => pct(l.faces.found, l.faces.total));
  row("Lines in the wall weight on a wall's face", l => (l.lines.feet ? `${l.lines.onWalls} of ${l.lines.feet} ft (${Math.round((100 * l.lines.onWalls) / l.lines.feet)}%)` : "none to check"));
  row("Scheduled doors found", l => (l.doors ? pct(l.doors.found, l.doors.checked) : "no schedule key"));
  row("Door widths right (within 3 in)", l => (l.doors ? pct(l.doors.widthRight, l.doors.widthChecked) : "no schedule key"));
  row("Doors read at no scheduled door's position", l => (l.doors ? String(l.doors.extra.length) : "no schedule key"));
  row("Rooms with a position, in a closed space of their own", l => (l.rooms ? pct(l.rooms.closed, l.rooms.total) : "no room key"));
  row("Rooms with an outline to compare, whole in one read space (85%+)", l => (l.roomShapes ? pct(l.roomShapes.whole, l.roomShapes.total) : "no outlines"));
  row("Walls read", l => `${l.walls.count} (${l.walls.feet} ft)`);
  row("Walls flagged to check by eye", l => `${l.wallFlags.flagged.length} (${l.wallFlags.flaggedFeet} of ${l.wallFlags.feet} ft)`);
  row("Glass tags with glass within 10 ft", l => pct(l.glass.tagsNearGlass, l.glass.tags));
  row("Glass read", l => `${l.glass.feet} ft in ${l.glass.runs} runs`);
  row("Glass runs touching nothing", l => String(l.glass.aloneRuns.length));
  const runs = (list: { a: Point; b: Point }[]) => `${list.length} (${Math.round(list.reduce((t, p) => t + dist(p.a, p.b), 0))} ft)`;
  row("Operable partitions read (no key: check by eye)", l => runs(l.partitions.filter(p => p.kind !== "railing")));
  row("Guardrails read (no key: check by eye)", l => runs(l.partitions.filter(p => p.kind === "railing")));
  row("Columns read (no key: check by eye)", l => String(l.columns.length));
  row("Floor openings read (no key: check by eye)", l => String(l.openings?.length ?? 0));
  row("Stairs read, risers per flight shown (no key: check by eye)", l => l.stairs?.length ? `${l.stairs.length} (${l.stairs.map(s => s.flights.map(f => f.risers).join(" + ")).join("; ")})` : "0");
  out.push(
    "",
    "A value that disagrees is usually OCR misreading a stray line as a digit: look at its picture in the sheet's strips folder before believing it.",
    "A flagged wall is one to look at, not one known to be wrong: nothing on a drawing lists the walls, so false walls have no key.",
    "Rooms closed only counts rooms with a position in the key, and says nothing about a room's shape. Room outlines come from the ceiling plans, so a room with no ceiling drawn has no outline to compare.",
    "Glass tags only say glass is near. Not scored yet: how much glass is missing between tags, wall types, level heights. Roofs and structure aren't read yet; stairs are read, with no key to score them against.",
  );
  for (const l of levels) {
    out.push("", `## ${l.sheet}`, "", `Wall weight ${l.wallWeight ?? "not found"} pt. Median difference from printed dimensions ${inchesText(l.dimensions.medianDiffInches)}; median wall face offset ${inchesText(l.faces.medianOffsetInches)}.`);
    if (l.dimensions.disagree.length) out.push("", `Dimensions that disagree (${l.dimensions.disagree.length}; a misread number or a real difference):`, ...l.dimensions.disagree.slice(0, 30).map(d => `- printed "${d.printed}", measured ${Math.round(d.span.feet * 12 * 10) / 10} in, off by ${Math.round(d.diffInches * 10) / 10} in`));
    if (l.faces.misses.length) out.push("", `Dimensioned faces not on a wall (${l.faces.misses.length}):`, ...l.faces.misses.slice(0, 30).map(m => `- ${Math.round(m.feet)} ft line at (${Math.round(m.a[0])}, ${Math.round(m.a[1])}) to (${Math.round(m.b[0])}, ${Math.round(m.b[1])}) ft`));
    if (l.lines.largestMissed.length) out.push("", "Longest lines in the wall weight not on a wall:", ...l.lines.largestMissed.slice(0, 15).map(m => `- ${m.feet} ft at (${Math.round(m.a[0])}, ${Math.round(m.a[1])}) to (${Math.round(m.b[0])}, ${Math.round(m.b[1])}) ft`));
    if (l.wallFlags.flagged.length) out.push("", `Walls flagged (${l.wallFlags.flagged.length}):`, ...l.wallFlags.flagged.slice(0, 40).map(w => `- ${w.feet} ft, ${Math.round(w.thickness * 12 * 10) / 10} in thick, at (${Math.round(w.a[0])}, ${Math.round(w.a[1])}) to (${Math.round(w.b[0])}, ${Math.round(w.b[1])}) ft: ${w.flags.join(", ")}`));
    if (l.glass.tagsMissed.length) out.push("", "Glass tags with no glass near them:", ...l.glass.tagsMissed.map(t => `- at (${Math.round(t[0])}, ${Math.round(t[1])}) ft`));
    if (l.glass.aloneRuns.length) out.push("", "Glass touching nothing at either end:", ...l.glass.aloneRuns.map(g => `- ${g.feet} ft at (${Math.round(g.a[0])}, ${Math.round(g.a[1])}) to (${Math.round(g.b[0])}, ${Math.round(g.b[1])}) ft`));
    for (const [title, list] of [["Operable partitions read:", l.partitions.filter(p => p.kind !== "railing")], ["Guardrails read:", l.partitions.filter(p => p.kind === "railing")]] as const) {
      if (list.length) out.push("", title, ...list.map(p => `- ${Math.round(dist(p.a, p.b) * 10) / 10} ft at (${Math.round(p.a[0])}, ${Math.round(p.a[1])}) to (${Math.round(p.b[0])}, ${Math.round(p.b[1])}) ft`));
    }
    if (l.doors) {
      const missed = l.doors.rows.filter(r => r.status === "missed"), wrong = l.doors.rows.filter(r => r.widthRight === false), unkeyed = l.doors.rows.filter(r => r.status === "not on plan key");
      if (missed.length) out.push("", `Scheduled doors not found: ${missed.map(r => r.number).join(", ")}.`);
      if (wrong.length) out.push("", "Door widths off:", ...wrong.map(r => `- ${r.number}: scheduled ${r.scheduledInches} in, read ${r.foundInches} in`));
      if (unkeyed.length) out.push("", `Scheduled but with no position to check: ${unkeyed.map(r => r.number).join(", ")}.`);
      if (l.doors.extra.length) out.push("", "Doors read at no scheduled door's position (real doors with no position above, stalls, or false):", ...l.doors.extra.map(d => `- ${Math.round(d.width * 10) / 10} ft at (${Math.round((d.a[0] + d.b[0]) / 2)}, ${Math.round((d.a[1] + d.b[1]) / 2)}) ft`));
    }
    if (l.rooms) {
      const open = l.rooms.rows.filter(r => r.status === "open"), shared = l.rooms.rows.filter(r => r.status === "shared");
      if (open.length) out.push("", `Rooms not closed: ${open.map(r => `${r.number} ${r.name}`.trim()).join(", ")}.`);
      if (shared.length) out.push("", "Rooms sharing a space:", ...shared.map(r => `- ${r.number} ${r.name} with ${r.sharedWith.join(", ")}`));
    }
    if (l.roomShapes) {
      const off = l.roomShapes.rows.filter(r => r.covered < ROOM_WHOLE_SHARE || r.outside > 0.35).sort((p, q) => p.covered - q.covered);
      if (off.length) out.push("", "Room outlines that don't match a read space:", ...off.map(r => `- ${r.room}: outline ${r.zoneArea} SF, ${Math.round(r.covered * 100)}% in a ${r.spaceArea ?? "no"} SF space${r.outside > 0.35 ? `, ${Math.round(r.outside * 100)}% of that space is outside the outline` : ""}${r.splitInto.length ? `, the rest in ${r.splitInto.join(" and ")} SF` : ""}`));
    }
  }
  return `${out.join("\n")}\n`;
}

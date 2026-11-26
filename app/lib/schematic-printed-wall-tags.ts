import { drawingLengthFeet } from "./drawing-dimensions";
import type { Segment, Point } from "./plan-vectors";
import type { SchematicDoor, SchematicWall } from "./schematic-model";
import { normalTag, scheduleRow, tagKey, type PartitionType } from "./tag-placement";
import type { TextBox } from "./text-anchor";

type Frame = { widthFeet: number; heightFeet: number };
type Page = { width: number; height: number };
export type PrintedWallTag = { tag: string; at: Point; tips?: Point[] };

type TagBox = { left: number; right: number; top: number; bottom: number };
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function boxLeaders(bounds: TagBox, lines: Segment[]): Point[] {
  const { left, top, right, bottom } = bounds;
  const tolerance = .45;
  const outside = ([x, y]: Point) => Math.max(left - x, x - right, top - y, y - bottom);
  const onBorder = (p: Point) => Math.abs(outside(p)) <= tolerance;
  const reaches = lines.filter(line => line.width <= .65 && distance(line.a, line.b) >= 3 &&
    distance(line.a, line.b) <= 170 && Math.min(outside(line.a), outside(line.b)) < 170 &&
    Math.max(outside(line.a), outside(line.b)) > tolerance);
  const seeds = reaches.flatMap(line => onBorder(line.a) && outside(line.b) >= 4 ? [{ start: line.a, tip: line.b, line }]
    : onBorder(line.b) && outside(line.a) >= 4 ? [{ start: line.b, tip: line.a, line }] : []);
  const tips: Point[] = [];
  for (const seed of seeds) {
    let { start, tip, line } = seed;
    for (let jog = 0; jog < 2; jog++) {
      const next = reaches.flatMap(candidate => {
        if (Math.abs(candidate.width - line.width) > .02 || candidate.color !== line.color) return [];
        const end = distance(candidate.a, tip) <= tolerance ? candidate.b
          : distance(candidate.b, tip) <= tolerance ? candidate.a : null;
        return end && distance(end, start) > 4 && outside(end) > outside(tip) + 1
          ? [{ end, line: candidate }] : [];
      });
      if (!next.length || next.some(item => distance(item.end, next[0].end) > tolerance)) break;
      [start, tip, line] = [tip, next[0].end, next[0].line];
    }
    if (!tips.some(other => distance(tip, other) < 1)) tips.push(tip);
  }
  return tips;
}

/** Require the original PDF stroke around a known mark. Dimensions, window marks and room numbers often share its characters. */
export function printedWallTags(boxes: TextBox[], segments: Segment[], page: Page, frame: Frame, types: ReadonlySet<string>): PrintedWallTag[] {
  if (!types.size) return [];
  const horizontal: { y: number; left: number; right: number }[] = [];
  const vertical: { x: number; top: number; bottom: number }[] = [];
  for (const { a, b } of segments) {
    const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
    if (dx > 3 && dx < 90 && dy <= .35) horizontal.push({ y: a[1], left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]) });
    if (dy > 3 && dy < 45 && dx <= .35) vertical.push({ x: a[0], top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]) });
  }
  const seen = new Set<string>();
  return boxes.flatMap(box => {
    const tag = normalTag(box.str);
    if (!types.has(tagKey(tag)) || !/^(?:[A-Z]+[-.]?)?\d{1,3}[A-Z]?(?:\.\d{1,3}){0,2}$/i.test(tag)) return [];
    const x = box.x * page.width, y = (box.y + box.h / 2) * page.height, size = box.h * page.height;
    const w = box.w * page.width;
    if (size < 4 || size > 18) return [];
    const tolerance = .45;
    const candidates = horizontal.filter(line => line.left <= x + tolerance && line.right >= x + w - tolerance &&
      line.right - line.left < w + size * 2.4 && Math.abs(line.y - y) < size * 1.55);
    const top = candidates.filter(line => line.y <= y - size * .28);
    const bottom = candidates.filter(line => line.y >= y + size * .28);
    const border = top.flatMap(a => bottom.filter(b => Math.abs(a.left - b.left) <= tolerance && Math.abs(a.right - b.right) <= tolerance &&
      [a.left, a.right].every(edge => vertical.some(v => Math.abs(v.x - edge) <= tolerance &&
        Math.abs(v.top - a.y) <= tolerance && Math.abs(v.bottom - b.y) <= tolerance)))
      .map(b => ({ left: a.left, right: a.right, top: a.y, bottom: b.y })));
    if (!border.length) return [];
    const limits = border[0];
    const center: Point = [(limits.left + limits.right) / 2, (limits.top + limits.bottom) / 2];
    const key = [tagKey(tag), ...center.map(n => n.toFixed(1))].join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    const toFeet = ([x, y]: Point): Point => [x / page.width * frame.widthFeet, y / page.height * frame.heightFeet];
    const tips = boxLeaders(limits, segments).map(toFeet);
    return [{ tag, at: toFeet(center), ...(tips.length ? { tips } : {}) }];
  });
}

/** Compare printed leaders to the actual wall faces. A mark without a leader still needs a unique nearby wall. */
export function matchPrintedWallTags(walls: SchematicWall[], marks: PrintedWallTag[], schedule: PartitionType[]) {
  const candidates = new Map<number, PrintedWallTag[]>();
  for (const mark of marks) {
    const row = scheduleRow(mark.tag, schedule);
    const expected = row?.thickness ? drawingLengthFeet(row.thickness) : null;
    const points = mark.tips?.length ? mark.tips : [mark.at], reach = mark.tips?.length ? .8 : 2.4;
    for (const point of points) {
      const scores = walls.flatMap((wall, index) => {
        if (wall.excluded || expected !== null && Math.abs(expected - wall.thickness) > Math.max(.18, expected * .25)) return [];
        const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], length = Math.hypot(dx, dy);
        if (!length) return [];
        const x = point[0] - wall.a[0], y = point[1] - wall.a[1], along = (x * dx + y * dy) / length;
        const d = Math.hypot(Math.abs(x * dy - y * dx) / length, Math.max(0, -along, along - length)) - wall.thickness / 2;
        if (d > reach) return [];
        return [{ index, distance: mark.tips?.length ? Math.max(0, d) : d }];
      }).sort((a, b) => a.distance - b.distance);
      const [best, next] = scores;
      if (!best || next && next.distance - best.distance < .35) continue;
      const matches = candidates.get(best.index) ?? [];
      matches.push(mark);
      candidates.set(best.index, matches);
    }
  }
  return walls.map((wall, i) => {
    const marks = candidates.get(i);
    if (!marks?.length) return wall;
    if (new Set(marks.map(mark => tagKey(mark.tag))).size > 1) return { ...wall, type: null, tagRead: undefined, tagReview: true };
    return { ...wall, type: marks[0].tag, tagRead: { basis: "printed" as const, at: marks[0].at }, tagReview: undefined };
  });
}

const unit = (line: { a: Point; b: Point }) => {
  const length = distance(line.a, line.b) || 1;
  return [(line.b[0] - line.a[0]) / length, (line.b[1] - line.a[1]) / length] as Point;
};
const along = ([x, y]: Point, a: Point, p: Point) => (p[0] - a[0]) * x + (p[1] - a[1]) * y;
const off = ([x, y]: Point, a: Point, p: Point) => Math.abs((p[0] - a[0]) * y - (p[1] - a[1]) * x);

/** A printed mark can carry across an aligned seam or a measured door gap in the same partition. */
export function typeWallContinuations(walls: SchematicWall[], doors: SchematicDoor[]): SchematicWall[] {
  const parents = walls.map((_, index) => index);
  const root = (index: number) => {
    for (; parents[index] !== index; index = parents[index]) parents[index] = parents[parents[index]];
    return index;
  };
  const directions = walls.map(unit);
  for (const [i, wall] of walls.entries()) {
    if (wall.excluded) continue;
    const u = directions[i];
    for (let j = i + 1; j < walls.length; j++) {
      const other = walls[j];
      if (other.excluded || Math.abs(wall.thickness - other.thickness) > .075) continue;
      const v = directions[j];
      if (Math.abs(u[0] * v[1] - u[1] * v[0]) > .035 || Math.max(off(u, wall.a, other.a), off(u, wall.a, other.b)) > .18) continue;
      const extent = distance(wall.a, wall.b), a = along(u, wall.a, other.a), b = along(u, wall.a, other.b);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const gap = lo > extent ? [extent, lo] : hi < 0 ? [hi, 0] : null;
      if (gap && gap[1] - gap[0] > .28) {
        const open = doors.some(door => {
          if (door.kind !== "door" || Math.max(off(u, wall.a, door.a), off(u, wall.a, door.b)) > .21) return false;
          const [near, far] = [along(u, wall.a, door.a), along(u, wall.a, door.b)].sort((x, y) => x - y);
          return Math.abs(near - gap[0]) <= .27 && Math.abs(far - gap[1]) <= .27;
        });
        if (!open) continue;
      }
      parents[root(j)] = root(i);
    }
  }
  const types = new Map<number, Map<string, { type: string; at?: Point }>>();
  for (const [i, wall] of walls.entries()) {
    if (wall.excluded || !wall.type || wall.tagRead?.basis !== "printed") continue;
    const group = root(i);
    const known = types.get(group) ?? new Map<string, { type: string; at?: Point }>();
    known.set(tagKey(wall.type), { type: wall.type, at: wall.tagRead.at });
    types.set(group, known);
  }
  return walls.map((wall, i) => {
    const evidence = types.get(root(i));
    if (!evidence || wall.tagRead?.basis === "printed" || wall.excluded || wall.tagReview) return wall;
    if (evidence.size > 1) return { ...wall, tagReview: true };
    const { type, at } = evidence.values().next().value!;
    if (wall.type && tagKey(wall.type) !== tagKey(type)) return { ...wall, tagReview: true };
    return { ...wall, type, tagRead: { basis: "continuation", at } };
  });
}

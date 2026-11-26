import { drawingLengthFeet } from "./drawing-dimensions";
import type { Segment, Point } from "./plan-vectors";
import type { SchematicWall } from "./schematic-model";
import { normalTag, scheduleRow, tagKey, type PartitionType } from "./tag-placement";
import type { TextBox } from "./text-anchor";

type Frame = { widthFeet: number; heightFeet: number };
type Page = { width: number; height: number };
export type PrintedWallTag = { tag: string; at: Point };

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
      .map(b => ({ x: (a.left + a.right) / 2, y: (a.y + b.y) / 2 })));
    if (!border.length) return [];
    const center = border[0], key = [tagKey(tag), center.x.toFixed(1), center.y.toFixed(1)].join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ tag, at: [center.x / page.width * frame.widthFeet, center.y / page.height * frame.heightFeet] as Point }];
  });
}

/** A nearby wall with a unique position and a compatible printed width can take the boxed mark. */
export function matchPrintedWallTags(walls: SchematicWall[], marks: PrintedWallTag[], schedule: PartitionType[]) {
  const candidates = new Map<number, PrintedWallTag[]>();
  for (const mark of marks) {
    const row = scheduleRow(mark.tag, schedule);
    const expected = row?.thickness ? drawingLengthFeet(row.thickness) : null;
    const scores = walls.flatMap((wall, index) => {
      if (expected !== null && Math.abs(expected - wall.thickness) > Math.max(.18, expected * .25)) return [];
      const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], length = Math.hypot(dx, dy);
      if (!length) return [];
      const x = mark.at[0] - wall.a[0], y = mark.at[1] - wall.a[1], along = (x * dx + y * dy) / length;
      const distance = Math.hypot(Math.abs(x * dy - y * dx) / length, Math.max(0, -along, along - length)) - wall.thickness / 2;
      return distance > 2.4 ? [] : [{ index, distance }];
    }).sort((a, b) => a.distance - b.distance);
    const [best, next] = scores;
    if (best && (!next || next.distance - best.distance >= .35)) {
      const matches = candidates.get(best.index) ?? [];
      matches.push(mark);
      candidates.set(best.index, matches);
    }
  }
  return walls.map((wall, i) => {
    const marks = candidates.get(i);
    if (!marks?.length) return wall;
    if (new Set(marks.map(mark => tagKey(mark.tag))).size > 1) return { ...wall, type: null, tagRead: undefined };
    return { ...wall, type: marks[0].tag, tagRead: { basis: "printed" as const } };
  });
}

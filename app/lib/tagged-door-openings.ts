import type { Point, SchematicDoor, SchematicWall } from "./schematic-model";

export type PrintedDoorTag = { number: string; at: Point };

type PdfTextItem = { str: string; width: number; height: number; transform: number[] };
type PlanViewport = { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] };

/** Use the PDF's own text and coordinates. A bare room number is never a door tag. */
export function printedDoorTags(items: readonly (PdfTextItem | { type: string })[], viewport: PlanViewport, frame: { widthFeet: number; heightFeet: number }): PrintedDoorTag[] {
  return items.flatMap(item => {
    if (!("str" in item)) return [];
    const number = item.str.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^D-?\d{1,4}[A-Z]?$/.test(number)) return [];
    const [a, b, c, d, x, y] = item.transform;
    const horizontal = Math.hypot(a, b), vertical = Math.hypot(c, d);
    if (!horizontal || !vertical) return [];
    const advance = item.width / (2 * horizontal), rise = item.height / (2 * vertical);
    const [px, py] = viewport.convertToViewportPoint(x + a * advance + c * rise, y + b * advance + d * rise);
    return [{ number, at: [px / viewport.width * frame.widthFeet, py / viewport.height * frame.heightFeet] }];
  });
}

const MAX_CENTER_OFFSET = 0.65;
const JAMB_ALIGNMENT = 0.15;
const PARALLEL_SINE = 0.035;
const MAX_OPENING = 12;
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const near = (a: Point, b: Point, feet: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= feet;
type WallAxis = SchematicWall & { axis: Point };

/** Two aligned wall ends must bracket the printed tag, without wall linework continuing through the gap. */
function gapAt(tag: PrintedDoorTag, walls: WallAxis[]): SchematicDoor | null {
  const jambs = walls.filter(wall => [wall.a, wall.b].some(end => near(end, tag.at, MAX_OPENING / 2 + MAX_CENTER_OFFSET)));
  const candidates: SchematicDoor[] = [];
  for (const [i, wall] of jambs.entries()) {
    const ends = [wall.a, wall.b].map(end => dot(minus(end, tag.at), wall.axis));
    if (ends[0] * ends[1] <= 0) continue; // The tag must be beyond the wall's endpoint.
    const side = ends[0] > 0 ? -1 : 1;
    const axis: Point = [wall.axis[0] * side, wall.axis[1] * side];
    const a = side > 0 ? wall.b : wall.a;
    const start = dot(minus(a, tag.at), axis);
    if (Math.abs(cross(axis, minus(a, tag.at))) > 0.35) continue;

    for (let j = i + 1; j < jambs.length; j++) {
      const other = jambs[j];
      if (Math.abs(cross(axis, other.axis)) > PARALLEL_SINE) continue;
      const first = dot(minus(other.a, tag.at), axis), last = dot(minus(other.b, tag.at), axis);
      const end = Math.min(first, last), b = first <= last ? other.a : other.b;
      const width = Math.hypot(...minus(b, a));
      if (end <= 0 || width < 2 || width > MAX_OPENING || Math.abs(cross(axis, minus(b, a))) > JAMB_ALIGNMENT) continue;
      if (!near(midpoint(a, b), tag.at, MAX_CENTER_OFFSET)) continue;

      const blocked = walls.some(line => {
        if (line === wall || line === other || Math.abs(cross(axis, line.axis)) > PARALLEL_SINE) return false;
        const u = minus(line.a, a), v = minus(line.b, a);
        if (Math.abs(cross(axis, u)) > JAMB_ALIGNMENT || Math.abs(cross(axis, v)) > JAMB_ALIGNMENT) return false;
        const p = dot(u, axis), q = dot(v, axis);
        return Math.min(end - start, Math.max(p, q)) - Math.max(0, Math.min(p, q)) > JAMB_ALIGNMENT;
      });
      if (!blocked) candidates.push({
        a, b, width: Math.round(width * 100) / 100, thickness: Math.min(wall.thickness, other.thickness),
        kind: "door", number: tag.number, leaves: 0, hinges: [], openTo: [], basis: "tagged-gap",
      });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

/** Add openings whose printed tags corroborate a measured gap. Existing swing detections take precedence. */
export function addTaggedDoorOpenings(doors: SchematicDoor[], walls: SchematicWall[], tags: PrintedDoorTag[]): SchematicDoor[] {
  if (!tags.length) return doors;
  const axes = walls.flatMap((wall): WallAxis[] => {
    const [dx, dy] = minus(wall.b, wall.a), length = Math.hypot(dx, dy);
    return length > 0 && !wall.excluded ? [{ ...wall, axis: [dx / length, dy / length] }] : [];
  });
  const repeated = new Set<string>(), unique = new Map<string, PrintedDoorTag>();
  for (const tag of tags) {
    const prior = unique.get(tag.number);
    if (!prior) unique.set(tag.number, tag);
    else if (!near(prior.at, tag.at, 0.35)) repeated.add(tag.number);
  }
  const matches = [...unique.values()].flatMap(tag => {
    if (repeated.has(tag.number) || doors.some(door => door.number === tag.number)) return [];
    const door = gapAt(tag, axes);
    if (!door || doors.some(existing => near(midpoint(existing.a, existing.b), midpoint(door.a, door.b), MAX_CENTER_OFFSET))) return [];
    return [door];
  });
  return [...doors, ...matches.filter(door => !matches.some(other =>
    other !== door && near(midpoint(door.a, door.b), midpoint(other.a, other.b), MAX_CENTER_OFFSET)))];
}

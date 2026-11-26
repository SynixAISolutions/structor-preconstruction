import { drawingLengthFeet, type DrawingTextRun } from "./drawing-dimensions";
import { printedPlanLevels } from "./floor-plan-label";
import type { Point, Segment } from "./plan-vectors";
import { inside, polygonArea, roomLabelPoint, type Room } from "./room-detection";
import { feetPerInch, footprintValid, levelOfTitle } from "./schematic-model";
import type { DimensionSource } from "./section-datums";

export type StructuralSlab = {
  outline: Point[];
  holes: Point[][];
  source: DimensionSource;
  dimension?: { feet: number; label: string; source: DimensionSource };
};

type StructuralView = { levels: number[]; caption: DrawingTextRun; width: number; scale: number };
const distinct = (points: Point[]) => points.filter((point, i) => distance(point, points.at(i - 1)!) > .025);
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sameFloors = (a: number[], b: number[]) => a.length === b.length && a.every((level, index) => level === b[index]);

/** Limit slab tracing to floor plans. Foundation walls, roof framing and section details can have similar edges. */
export function structuralFloorLevels(title: string) {
  const name = title.toUpperCase().replace(/\s+/g, " ").trim();
  if (!/\b(?:FRAMING|SLAB)\s+PLAN\b/.test(name) ||
    /\b(?:ROOF|FOUNDATION|DETAILS?|DECKING|DEMOLITION|ENLARGED|REINFORCEMENT)\b/.test(name)) return [];
  const floor = name.replace(/\bTYP(?:ICAL)?\.?\s+/g, "").replace(/\s+(?:FLOOR\s+)?(?:FRAMING|SLAB)\s+PLAN$/, " FLOOR PLAN");
  const levels = printedPlanLevels(floor);
  if (levels.length) return levels;
  const level = levelOfTitle(name);
  return level === null || /\d{1,2}(?:ST|ND|RD|TH)\s*[-–—]/.test(name) ? [] : [level];
}

/** Read one captioned framing view with its own scale and a level that agrees with the register. */
export function structuralFloorView(title: string, text: DrawingTextRun[], page: { width: number; height: number }): StructuralView | null {
  const listed = structuralFloorLevels(title);
  if (!listed.length) return null;
  const captions = text.filter(run => run.height >= 12 && run.a[0] < page.width * .79 &&
    Math.abs(run.a[1] - run.b[1]) <= 1 && sameFloors(listed, structuralFloorLevels(run.text)));
  if (captions.length !== 1) return null;
  const caption = captions[0];
  const scales = new Set(text.flatMap(run => {
    const dy = run.a[1] - caption.a[1];
    if (dy <= 0 || dy > caption.height * 1.9 || Math.abs(run.a[0] - caption.a[0]) > caption.height * 4.5) return [];
    const scale = feetPerInch(run.text);
    return scale ? [scale] : [];
  }));
  if (scales.size !== 1) return null;
  return { levels: listed, caption, width: page.width, scale: [...scales][0] };
}

type Stroke = { a: Point; x: number; y: number; length: number };

function withinInk(ring: Point[], strokes: Stroke[]) {
  let supported = 0, perimeter = 0;
  for (const [i, a] of ring.entries()) {
    const b = ring[(i + 1) % ring.length], length = distance(a, b);
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
    // Check along the stroke, not just the vertices at where grid and dimension lines cross.
    const pieces = Math.max(1, Math.ceil(length / 6)), step = length / pieces;
    const aligned = strokes.filter(stroke => Math.abs(dx * stroke.y - dy * stroke.x) < .04 &&
      Math.abs((a[0] - stroke.a[0]) * stroke.y - (a[1] - stroke.a[1]) * stroke.x) <= 1.65 + length * .04);
    for (let k = 0; k < pieces; k++) {
      const x = a[0] + dx * step * (k + .5), y = a[1] + dy * step * (k + .5);
      if (aligned.some(stroke => {
        const rx = x - stroke.a[0], ry = y - stroke.a[1], along = rx * stroke.x + ry * stroke.y;
        return Math.abs(rx * stroke.y - ry * stroke.x) <= 1.65 && along >= -1.65 && along <= stroke.length + 1.65;
      })) supported += step;
    }
    perimeter += length;
  }
  return supported / perimeter;
}

/** One slab boundary must agree with the visible framing strokes, the matched grid, and the architectural extent. */
export function structuralSlabOutline(
  clips: Point[][][], segments: Segment[], view: StructuralView, offset: Point, architectural: Point[],
): Pick<StructuralSlab, "outline" | "holes"> | null {
  if (architectural.length < 3) return null;
  const feetPerPoint = view.scale / 72;
  const size = polygonArea(architectural);
  const xs = architectural.map(p => p[0]), ys = architectural.map(p => p[1]);
  const limits = [Math.min(...xs) - 14, Math.min(...ys) - 14, Math.max(...xs) + 14, Math.max(...ys) + 14];
  const located = ([x, y]: Point): Point => [x * feetPerPoint + offset[0], y * feetPerPoint + offset[1]];
  const inPlan = (p: Point) => p[0] > 0 && p[0] < view.width * .94 && p[1] > 0 && p[1] < view.caption.a[1] - view.caption.height;
  const inExtent = (p: Point) => p[0] >= limits[0] && p[0] <= limits[2] && p[1] >= limits[1] && p[1] <= limits[3];
  const nearbyStrokes = segments.flatMap(({ a, b, width, color }): Stroke[] => {
    if (!inPlan(a) || !inPlan(b) || width < .15 || color.toLowerCase() > "#a0a0a0") return [];
    const length = distance(a, b);
    return length > .12 ? [{ a, x: (b[0] - a[0]) / length, y: (b[1] - a[1]) / length, length }] : [];
  });
  const choices = clips.flatMap(group => {
    const rings = group.map(points => distinct(points))
      .filter(ring => ring.length > 2 && ring.length <= 1200 && ring.every(inPlan))
      .map(ring => ({ ring, polygon: ring.map(located), area: polygonArea(ring) * feetPerPoint ** 2 }));
    const principal = rings.filter(({ polygon, area }) => area >= size * .56 && area <= size * 1.3 && polygon.every(inExtent))
      .sort((a, b) => b.area - a.area)[0];
    if (!principal || !footprintValid(principal.polygon) || withinInk(principal.ring, nearbyStrokes) < .98) return [];
    const holes = rings.filter(other => other !== principal && other.area >= 3 && other.area < principal.area * .35 &&
      other.polygon.every(point => inside(point, principal.polygon)) && footprintValid(other.polygon))
      .filter(other => withinInk(other.ring, nearbyStrokes) >= .9).map(other => other.polygon);
    if (holes.some((hole, i) => holes.some((other, j) => i !== j && hole.some(point => inside(point, other))))) return [];
    return [{ outline: principal.polygon, holes, area: principal.area }];
  }).sort((a, b) => b.area - a.area);
  if (!choices.length || choices[1] && choices[1].area >= choices[0].area * .85) return null;
  const { outline, holes } = choices[0];
  return { outline, holes };
}

export function slabDimension(text: DrawingTextRun[], view: StructuralView, source: DimensionSource): StructuralSlab["dimension"] {
  const candidates = text.flatMap(run => {
    if (run.a[1] <= view.caption.a[1]) return [];
    const match = /^(?:\d+[.)]\s*)?SLAB THICKNESS\s*(?:=|:|IS)\s*(\d+(?:(?:[ -]\d+)?\/\d+|\.\d+)?)\s*("|″|MM|CM)\.?$/i.exec(run.text.trim());
    const label = match ? match[1] + match[2] : "";
    const feet = drawingLengthFeet(label);
    return feet && feet > 0 && feet < 4 ? [{ feet, label, source: { ...source, quote: run.text } }] : [];
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function structuralSlabSurface(slab: StructuralSlab): Room {
  const name = "Structural slab";
  const { outline, holes } = slab;
  const area = Math.round(polygonArea(outline) - holes.reduce((sum, hole) => sum + polygonArea(hole), 0));
  return { name, number: "", outline, holes, area, at: roomLabelPoint(slab) };
}

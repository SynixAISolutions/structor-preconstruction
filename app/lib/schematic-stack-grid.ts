import type { DrawingTextRun } from "./drawing-dimensions";
import type { Curve, Point, Segment } from "./plan-vectors";

type Axis = 0 | 1;
type GridMark = { label: string; axis: Axis; at: number };
type Circle = { center: Point; radius: number };
export type PlanGrid = GridMark[];
const axes = [0, 1] as const;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a: Point, b: Point) => distance(a, b) <= .02;

function closedCircles(strokes: Pick<Segment, "a" | "b">[]): Circle[] {
  const circles: Circle[] = [];
  let path: Point[] = [];
  for (const { a, b } of strokes) {
    if (!path.length || !near(path.at(-1)!, a) || path.length > 65) path = [a];
    path.push(b);
    if (!near(path[0], b)) continue;
    if (path.length >= 9) {
      const limits = axes.map(axis => {
        const values = path.map(point => point[axis]);
        return [Math.min(...values), Math.max(...values)];
      });
      const [width, height] = limits.map(([min, max]) => max - min);
      const radius = (width + height) / 4, center = limits.map(([min, max]) => (min + max) / 2) as Point;
      if (radius >= 5 && radius <= 34 && Math.abs(width - height) <= .1 * radius &&
        path.every(point => Math.abs(distance(point, center) - radius) <= .09 * radius)) {
        circles.push({ center, radius });
      }
    }
    path = [];
  }
  return circles;
}

function curveStrokes(curves: Curve[]) {
  return curves.flatMap(({ from, c1, c2, to }) => {
    const points = [from, ...[.25, .5, .75].map(t => axes.map(axis => {
      const u = 1 - t;
      return u ** 3 * from[axis] + 3 * u ** 2 * t * c1[axis] + 3 * u * t ** 2 * c2[axis] + t ** 3 * to[axis];
    }) as Point), to];
    return points.slice(1).map((b, i) => ({ a: points[i], b }));
  });
}

/** A labelled bubble can jog to one side. Follow its drawn lead to the physical grid axis. */
function gridAxis(circle: Circle, strokes: Segment[]): { axis: Axis; at: number } | undefined {
  const { center, radius } = circle;
  const supported = axes.flatMap(axis => {
    const along = 1 - axis;
    const stem = strokes.find(({ a, b }) => {
      if (Math.abs(a[axis] - center[axis]) > .65 || Math.abs(b[axis] - center[axis]) > .65) return false;
      const start = Math.min(Math.abs(a[along] - center[along]), Math.abs(b[along] - center[along]));
      return Math.abs(start - radius) <= 1.4 && Math.abs(a[along] - b[along]) >= 3 &&
        (a[along] - center[along]) * (b[along] - center[along]) > 0;
    });
    if (!stem) return [];
    let tip = distance(stem.a, center) > distance(stem.b, center) ? stem.a : stem.b;
    const dir = tip[along] > center[along] ? 1 : -1;
    const outward = (point: Point) => (point[along] - center[along]) * dir;
    const matchesPen = (stroke: Segment) => Math.abs(stroke.width - stem.width) <= .02;
    for (let step = 0; step < 4 && outward(tip) < 5 * radius; step++) {
      const next = strokes.flatMap(stroke => {
        if (!matchesPen(stroke) || stroke.color !== stem.color) return [];
        const point = near(stroke.a, tip) ? stroke.b : near(stroke.b, tip) ? stroke.a : null;
        return point && outward(point) > outward(tip) + 1 && Math.abs(point[axis] - center[axis]) <= 3 * radius ? [point] : [];
      });
      if (!next.length || next.some(point => !near(point, next[0]))) break;
      tip = next[0];
    }
    const line = strokes.filter(stroke => matchesPen(stroke) &&
      Math.abs(stroke.a[axis] - tip[axis]) <= .28 && Math.abs(stroke.b[axis] - tip[axis]) <= .28 &&
      Math.max(outward(stroke.a), outward(stroke.b)) > outward(tip) + 2);
    if (!line.some(stroke => Math.max(outward(stroke.a), outward(stroke.b)) >= 6 * radius)) return [];
    return [{ axis, at: tip[axis] }];
  });
  return supported.length === 1 ? supported[0] : undefined;
}

/** Recover printed grid marks in sheet feet. Repeated marks with disagreeing positions are ambiguous. */
export function printedPlanGrid(text: DrawingTextRun[], segments: Segment[], curves: Curve[], feetPerPoint: number): PlanGrid {
  const circles = [...closedCircles(segments), ...closedCircles(curveStrokes(curves))];
  const marks: GridMark[] = [];
  for (const { text: label, a, b, height } of text) {
    if (!/^(?:[A-Z]{1,2}|[1-9]\d?(?:\.\d{1,2})?)$/.test(label) || Math.abs(a[1] - b[1]) > 1) continue;
    const at: Point = [(a[0] + b[0]) / 2, a[1] - .34 * height];
    const circle = circles.find(({ center, radius }) => distance(center, at) <= .43 * radius && height >= .62 * radius && height <= 1.7 * radius);
    if (!circle) continue;
    const line = gridAxis(circle, segments);
    if (line) marks.push({ label, axis: line.axis, at: line.at * feetPerPoint });
  }
  return [...Map.groupBy(marks, ({ label, axis }) => axis + ":" + label).values()].flatMap(group => {
    const first = group[0];
    return group.every(mark => Math.abs(mark.at - first.at) <= .15) ? [first] : [];
  });
}

/** Two scaled plans must have consistent translations across widely spaced grid marks on both axes. */
export function alignStackedPlan(anchor: PlanGrid, incoming: PlanGrid): Point | null {
  const offsets = axes.map(axis => {
    const shared = anchor.flatMap(mark => {
      if (mark.axis !== axis) return [];
      const other = incoming.find(item => item.axis === mark.axis && item.label === mark.label);
      return other ? [{ at: mark.at, offset: mark.at - other.at }] : [];
    });
    const close = shared.map(mark => shared.filter(item => Math.abs(item.offset - mark.offset) <= .13))
      .sort((a, b) => b.length - a.length)[0];
    if (!close || close.length < 3 || close.length < .65 * shared.length ||
      Math.max(...close.map(mark => mark.at)) - Math.min(...close.map(mark => mark.at)) < 8) return null;
    return close.reduce((sum, mark) => sum + mark.offset, 0) / close.length;
  });
  return offsets[0] === null || offsets[1] === null ? null : [offsets[0], offsets[1]];
}

import { inside } from "./room-detection";
import type { Point } from "./plan-vectors";
import { edgesIntersect, footprintValid, levelFootprints, type SchematicLevel } from "./schematic-model";

type Reviewable = { excluded?: boolean; outsidePlan?: boolean };
type Run = Reviewable & { a: Point; b: Point; type?: string | null; thickness?: number };

function distanceTo(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Keep the source trace for detached exterior linework. Tagged elements and supported projections stay visible. */
export function holdOutsidePlanRuns<T extends Run>(runs: T[], building: Run[], outline: Point[]): T[] {
  if (outline.length < 3) return runs;
  const nearPlan = (point: Point) => inside(point, outline) ||
    outline.some((a, i) => distanceTo(point, a, outline[(i + 1) % outline.length]) <= 3.5);
  const anchored = (run: Run) => run.type || [0, .25, .5, .75, 1].some(t =>
    nearPlan([run.a[0] + (run.b[0] - run.a[0]) * t, run.a[1] + (run.b[1] - run.a[1]) * t]));
  const supports = building.filter(anchored);
  if (!supports.length) return runs;
  return runs.map(run => anchored(run) || supports.some(w => [run.a, run.b].some(p =>
    distanceTo(p, w.a, w.b) <= 1.25 + (w.thickness ?? 0) / 2))
    ? run : { ...run, excluded: true, outsidePlan: true });
}

const NEAR_OUTLINE_FEET = 3.5;

function floorBounds(level: SchematicLevel) {
  const slab = level.structuralSlab?.outline;
  if (!slab && !level.sizing?.startsWith("Printed scale")) return [];
  return [...levelFootprints(level), ...(slab ? [slab] : [])].filter(footprintValid);
}

const nearFloor = (point: Point, bounds: Point[][]) => bounds.some(ring => inside(point, ring) ||
  ring.some((a, index) => distanceTo(point, a, ring[(index + 1) % ring.length]) <= NEAR_OUTLINE_FEET));

function touchesFloor(run: Run, bounds: Point[][]) {
  return nearFloor(run.a, bounds) || nearFloor(run.b, bounds) || bounds.some(ring => ring.some((a, index) =>
    distanceTo(a, run.a, run.b) <= NEAR_OUTLINE_FEET || edgesIntersect(run.a, run.b, a, ring[(index + 1) % ring.length])));
}

function holdDetached<T extends Reviewable>(items: T[] | undefined, hasSupport: (item: T) => boolean) {
  if (!items) return items;
  let changed = false;
  const reviewed = items.map(item => {
    // An explicit correction takes precedence. Keep the source trace and its original element index.
    if (item.excluded !== undefined && !item.outsidePlan) return item;
    const outsidePlan = !hasSupport(item);
    if (outsidePlan === !!item.outsidePlan) return item;
    changed = true;
    return { ...item, excluded: outsidePlan || undefined, outsidePlan: outsidePlan || undefined };
  });
  return changed ? reviewed : items;
}

function reviewLevel(level: SchematicLevel, below?: SchematicLevel) {
  const bounds = floorBounds(level);
  if (!bounds.length) return level;

  // A pair of unsupported traces cannot establish each other's placement.
  const anchors = [...(level.walls ?? []), ...(level.glazing ?? [])].filter(run =>
    (!run.excluded || run.outsidePlan) && nearFloor(run.a, bounds) && nearFloor(run.b, bounds));
  const onAnchoredRun = (point: Point) => anchors.some(run =>
    distanceTo(point, run.a, run.b) <= 1.25 + ("thickness" in run ? run.thickness / 2 : 0));
  const supported = (run: Run) => touchesFloor(run, bounds) || onAnchoredRun(run.a) || onAnchoredRun(run.b);
  const stairBounds = below && !below.alignmentUnverified && !level.alignmentUnverified ? [...bounds, ...floorBounds(below)] : bounds;

  const walls = holdDetached(level.walls, supported);
  const doors = holdDetached(level.doors, supported);
  const glazing = holdDetached(level.glazing, supported);
  const partitions = holdDetached(level.partitions, supported);
  const columns = holdDetached(level.columns, column => nearFloor(column.at, bounds) || onAnchoredRun(column.at));
  const stairs = holdDetached(level.stairs, stair => stair.flights.some(flight => touchesFloor(flight, stairBounds) || supported(flight)));
  if (walls === level.walls && doors === level.doors && glazing === level.glazing &&
      partitions === level.partitions && columns === level.columns && stairs === level.stairs) return level;
  return { ...level, walls, doors, glazing, partitions, columns, stairs };
}

/** Apply the same placement check to new conversions and older models opened in the viewer. */
export function reviewSchematicPlacement(levels: SchematicLevel[]) {
  const ordered = [...levels].sort((a, b) => a.order - b.order);
  const below = new Map(ordered.map((level, index) => [level, ordered[index - 1]]));
  const reviewed = levels.map(level => reviewLevel(level, below.get(level)));
  return reviewed.some((level, index) => level !== levels[index]) ? reviewed : levels;
}

export function detachedTraceCount(level: SchematicLevel) {
  return [level.walls, level.doors, level.glazing, level.partitions, level.columns, level.stairs]
    .reduce((count, items) => count + (items?.filter(item => item.excluded && item.outsidePlan).length ?? 0), 0);
}

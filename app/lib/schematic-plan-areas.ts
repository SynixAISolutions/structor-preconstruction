import { alignPlanDrawings, type PlanRegistration } from "./schematic-plan-alignment";
import { footprintValid, openOutline, polygonArea, type LevelFlights, type Point, type SchematicLevel } from "./schematic-model";
import type { PlanGrid } from "./schematic-stack-grid";

export type ReadFloorPlan = { level: SchematicLevel; flights: LevelFlights; registration: PlanRegistration | null; area: string | null; grid: PlanGrid };
type Limit = { axis: 0 | 1; at: number; keep: -1 | 1 };
type Placed = { plan: ReadFloorPlan; offset: Point; limits: Limit[] };
type Segment = { a: Point; b: Point };

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const middle = ({ a, b }: Segment): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const within = (p: Point, limit: Limit) => (p[limit.axis] - limit.at) * limit.keep >= 0;

function intersection(a: Point, b: Point, { axis, at }: Limit): Point {
  const fraction = (at - a[axis]) / (b[axis] - a[axis]);
  const point: Point = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
  point[axis] = at;
  return point;
}

function clippedFootprint(outline: Point[], limits: Limit[]) {
  return limits.reduce((loop, limit) => {
    const next: Point[] = [];
    for (const [i, b] of loop.entries()) {
      const a = loop[(i + loop.length - 1) % loop.length], insideA = within(a, limit), insideB = within(b, limit);
      if (insideA !== insideB) next.push(intersection(a, b, limit));
      if (insideB) next.push(b);
    }
    return next.filter((point, index) => distance(point, next[(index + next.length - 1) % next.length]) > .00001);
  }, openOutline(outline));
}

function areaSide(plan: ReadFloorPlan, axis: Limit["axis"], at: number): Limit["keep"] | null {
  const outline = plan.level.outline;
  const total = polygonArea(outline), low = polygonArea(clippedFootprint(outline, [{ axis, at, keep: -1 }]));
  if (!total) return null;
  if (low / total >= .62) return -1;
  return low / total <= .38 ? 1 : null;
}

function placeArea(anchor: Placed, plan: ReadFloorPlan): Placed | null {
  if (!anchor.plan.registration || !plan.registration || !plan.level.frame) return null;
  const join = alignPlanDrawings(anchor.plan.registration, plan.registration);
  if (!join) return null;
  const { axis, at } = join.anchor;
  if (anchor.limits.some(limit => limit.axis === axis && Math.abs(limit.at - at) <= .15)) return null;
  const incomingAt = at - join.offset[axis];
  const anchorSide = areaSide(anchor.plan, axis, at), incomingSide = areaSide(plan, axis, incomingAt);
  if (!anchorSide || !incomingSide || anchorSide === incomingSide) return null;
  const limits = [...anchor.limits, { axis, at, keep: anchorSide }];
  const incoming: Limit = { axis, at: incomingAt, keep: incomingSide };
  if (!footprintValid(clippedFootprint(anchor.plan.level.outline, limits)) || !footprintValid(clippedFootprint(plan.level.outline, [incoming]))) return null;
  anchor.limits = limits;
  return { plan, offset: add(anchor.offset, join.offset), limits: [incoming] };
}

function trimSegment<T extends Segment>(item: T, limits: Limit[]): T | null {
  let { a, b } = item;
  for (const limit of limits) {
    const insideA = within(a, limit), insideB = within(b, limit);
    if (!insideA && !insideB) return null;
    if (!insideA) a = intersection(a, b, limit);
    if (!insideB) b = intersection(a, b, limit);
  }
  return distance(a, b) > .03 ? { ...item, a, b } : null;
}

function byPosition<T>(items: T[] | undefined, limits: Limit[], point: (item: T) => Point) {
  return (items ?? []).filter(item => limits.every(limit => within(point(item), limit)));
}

function translateArea({ plan, offset, limits }: Placed, index: number) {
  const level = plan.level;
  const point = (p: Point) => add(p, offset);
  const segment = <T extends Segment>(item: T) => ({ ...item, a: point(item.a), b: point(item.b), planArea: index });
  const segments = <T extends Segment>(items: T[] | undefined) => (items ?? []).flatMap(item => {
    const trimmed = trimSegment(item, limits);
    return trimmed ? [segment(trimmed)] : [];
  });
  const arriving = byPosition(plan.flights.arriving.filter(stair => stair.flights.length), limits, stair => middle(stair.flights[0]));
  return {
    outline: clippedFootprint(level.outline, limits).map(point),
    rooms: byPosition(level.rooms, limits, item => item.at).map(item => ({ ...item, at: point(item.at), planArea: index })),
    walls: segments(level.walls).map(wall => wall.tagRead?.at
      ? { ...wall, tagRead: { ...wall.tagRead, at: point(wall.tagRead.at) } } : wall),
    glazing: segments(level.glazing),
    doors: byPosition(level.doors, limits, middle).map(item => ({ ...segment(item), hinges: item.hinges.map(point), openTo: item.openTo.map(point) })),
    partitions: segments(level.partitions),
    columns: byPosition(level.columns, limits, item => item.at).map(item => ({ ...item, at: point(item.at), planArea: index })),
    openings: byPosition(level.openings, limits, item => item).map(point),
    floorReferences: byPosition(level.floorReferences, limits, item => item.at).map(ref => ({ ...ref, at: point(ref.at) })),
    arriving: arriving.map(stair => ({ ...stair, flights: stair.flights.map(segment) })),
    rising: byPosition(plan.flights.rising, limits, middle).map(segment),
  };
}

type LevelPlacement = { areas: Placed[] };
export type FloorPlanBuild = { level: SchematicLevel; flights: LevelFlights; placement: LevelPlacement; warnings: string[] };

/** Build one level from its verified area sheets, keeping the original sheet behind each selectable element. */
export function assembleFloorPlans(plans: ReadFloorPlan[], below?: LevelPlacement, stackOffset?: Point): FloorPlanBuild {
  const [primary, ...others] = plans;
  const areas: Placed[] = [{ plan: primary, offset: stackOffset ?? [0, 0], limits: [] }];
  const unresolved = new Set(others);
  for (const anchor of areas) {
    for (const plan of unresolved) {
      const joined = placeArea(anchor, plan);
      if (!joined) continue;
      areas.push(joined);
      unresolved.delete(plan);
    }
  }

  const warnings: string[] = [];
  const unplacedPlans = [...unresolved].map(plan => plan.level.source);
  if (unplacedPlans.length) warnings.push(primary.level.name + " needs plan alignment for " + unplacedPlans.map(source => source.sheet).join(", ") + ". Their geometry is omitted until the drawing supplies a reliable match.");
  const level = { ...primary.level, ...(unplacedPlans.length ? { unplacedPlans } : {}) };
  const placement: LevelPlacement = { areas };
  if (areas.length === 1 && !stackOffset?.some(value => value !== 0)) return { level, flights: primary.flights, placement, warnings };

  if (below) {
    const offsets = areas.flatMap(area => {
      const earlier = below.areas.find(other => other.plan.area === area.plan.area);
      if (!earlier?.plan.registration || !area.plan.registration) return [];
      const join = alignPlanDrawings(earlier.plan.registration, area.plan.registration);
      return join ? [subtract(add(earlier.offset, join.offset), area.offset)] : [];
    });
    const shift = offsets[0];
    if (shift && offsets.every(offset => distance(offset, shift) <= .15)) {
      for (const area of areas) area.offset = add(area.offset, shift);
    } else {
      warnings.push(level.name + " area plans are joined. Check their stacked positions against the level below.");
    }
  }

  const parts = areas.map(translateArea);
  level.outline = parts[0].outline;
  level.planAreas = areas.map(({ plan, offset }, index) => ({
    source: plan.level.source,
    frame: plan.level.frame!,
    offset,
    ...(index ? { outline: parts[index].outline } : {}),
  }));
  level.rooms = parts.flatMap(part => part.rooms);
  level.walls = parts.flatMap(part => part.walls);
  level.doors = parts.flatMap(part => part.doors);
  level.glazing = parts.flatMap(part => part.glazing);
  level.partitions = parts.flatMap(part => part.partitions);
  level.columns = parts.flatMap(part => part.columns);
  level.openings = parts.flatMap(part => part.openings);
  level.floorReferences = parts.flatMap(part => part.floorReferences);
  level.wallNote = areas.map(({ plan }) => plan.level.source.sheet + ": " + (plan.level.wallNote ?? "")).join(" ");
  return {
    level,
    flights: { arriving: parts.flatMap(part => part.arriving), rising: parts.flatMap(part => part.rising) },
    placement,
    warnings,
  };
}

// A schematic 3D model from a new project's drawings (15 Oct, Danial: "I'll have the AI for this [3D]
// built"). Honest scope: a MASSING model per level, labelled "schematic, not measured". It is not a
// traced, measured model like Jelleff's (lib/jelleff-model.ts).
//
// Levels come from the floor-plan sheet titles. The AI reads each plan image for the building outline
// and its room tags, and a section or elevation image for the level elevations (lib/ai-jobs-more
// "plan-outline", "level-heights"). Scale comes from the plan's printed scale when one is read; without
// it the outline is sized so the floor areas add up to the project's building area, and says so.
// People can correct the outline and heights afterwards. Pure functions.

import { doorsFromSwings, swingArcs } from "./door-detection";
import { mergeTags, placeTags, tagOvals, type PartitionType, type PlacedTag } from "./tag-placement";
import type { Curve, Segment } from "./plan-vectors";
import type { RegisterRow } from "./project-files";
import { levelRooms, type Room } from "./room-detection";
import { planGlazing, planWalls } from "./wall-detection";

export type Point = [number, number];
export type SchematicRoom = { name: string; number: string; at: Point };
export type SchematicLevel = {
  id: string; name: string; order: number;
  /** Feet above the lowest level, and floor-to-floor height. */
  elevation: number; height: number;
  /** Footprint in feet, x right, y down as on the plan. */
  outline: Point[];
  rooms: SchematicRoom[];
  source: { documentId: string; sheet: string; page: number };
  /** How the size was found: the printed scale, or the building area. */
  sizing: string;
  /**
   * The source sheet image in feet: a point at image fraction [fx, fy] is [fx * widthFeet, fy * heightFeet]
   * (fromFraction / toFraction). Kept from the build, so a correction drawn on the sheet uses the same
   * calibration after edits and reloads. Missing on models built before 20 Oct.
   */
  frame?: { widthFeet: number; heightFeet: number };
  /**
   * Walls read from the plan's own vector lines (levelWalls), in the same feet as the outline. Missing on
   * models built before 21 Oct; empty when the sheet is a scan or its walls can't be told apart.
   */
  walls?: SchematicWall[];
  /** How the walls were found, or why there are none. */
  wallNote?: string;
  /** Doors read from the plan's swings (levelDoors), in the same feet. Missing on models built before 21 Oct. */
  doors?: SchematicDoor[];
  /** Glass read from the plan's panes (levelGlazing). Missing on models built before 21 Oct. */
  glazing?: SchematicGlazing[];
};
/** A run of glass from a to b, in feet; `type` from the plan's storefront/window tags (SF-10). */
export type SchematicGlazing = { a: Point; b: Point; type?: string | null; excluded?: boolean };
/** A wall centerline from a to b with its thickness, in feet; `type` is its partition type from the plan's tags. */
export type SchematicWall = { a: Point; b: Point; thickness: number; type?: string | null; /** The type was set by the estimator for untagged walls, not read from a tag. */ typeSet?: boolean; /** Corrected by the estimator on this wall. */ edited?: boolean; /** Marked by the estimator as not a wall (kept so it can be restored). */ excluded?: boolean };
/**
 * A door opening from a to b, its leaves' hinges and where each leaf swings open to, in feet. "compartment"
 * is a leaf under 2.4 ft (toilet stalls): toilet partitions, not the door schedule. `thickness` is the host
 * wall's, for the header above the opening.
 */
export type SchematicDoor = { a: Point; b: Point; width: number; leaves: number; hinges: Point[]; openTo: Point[]; kind: "door" | "compartment"; thickness: number; number?: string | null };

/**
 * Tiles over a plan's area for reading its tags: about `paperPt` points square on the sheet (small enough
 * that the tag text is legible to the AI: half-sheet tiles misread Jelleff's door numbers), as 0-1 sheet
 * fractions [x, y, w, h].
 */
export function tagTiles(page: { widthPt: number; heightPt: number }, frame: Frame, outline: Point[], paperPt = 400): [number, number, number, number][] {
  const { box } = planArea(page, frame, outline);
  const [x0, y0, x1, y1] = box ? [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(page.widthPt, box[2]), Math.min(page.heightPt, box[3])] : [0, 0, page.widthPt, page.heightPt];
  const cols = Math.max(1, Math.round((x1 - x0) / paperPt)), rows = Math.max(1, Math.round((y1 - y0) / paperPt));
  const w = (x1 - x0) / cols, h = (y1 - y0) / rows, ov = 0.08;
  const tiles: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tx0 = Math.max(x0, x0 + c * w - ov * w), ty0 = Math.max(y0, y0 + r * h - ov * h);
    const tx1 = Math.min(x1, x0 + (c + 1) * w + ov * w), ty1 = Math.min(y1, y0 + (r + 1) * h + ov * h);
    tiles.push([tx0 / page.widthPt, ty0 / page.heightPt, (tx1 - tx0) / page.widthPt, (ty1 - ty0) / page.heightPt]);
  }
  return tiles;
}

/**
 * Door numbers and wall types from the tags the AI read on the tiles (each tag at a 0-1 position in its
 * tile), placed on the level's walls and doors through the plan's own tag ovals and leaders.
 */
/** Lines at least this heavy (points) are walls or outlines, never a tag's leader (Jelleff: leaders 0.24-0.48, walls 1.2). */
export const LEADER_MAX_WEIGHT = 1;

export function levelTags(read: { tile: [number, number, number, number]; tags: PlacedTag[] }[], segments: Segment[], curves: Curve[], page: { widthPt: number; heightPt: number }, frame: Frame, walls: SchematicWall[], doors: SchematicDoor[], glazing: SchematicGlazing[] = []): { walls: SchematicWall[]; doors: SchematicDoor[]; glazing: SchematicGlazing[]; tags: PlacedTag[] } {
  const pointsPerFoot = page.widthPt / frame.widthFeet;
  const toFeet = (tile: [number, number, number, number], at: Point): Point => [(tile[0] + at[0] * tile[2]) * frame.widthFeet, (tile[1] + at[1] * tile[3]) * frame.heightFeet];
  const tags = mergeTags(read.flatMap(r => r.tags.map(t => ({ ...t, at: toFeet(r.tile, t.at) }))));
  // Leaders are drawn with the thin pens; a wall's heavy face touching a tag's end is not its leader.
  const lines = segments.filter(s => s.width < LEADER_MAX_WEIGHT).map(s => [[s.a[0] / pointsPerFoot, s.a[1] / pointsPerFoot], [s.b[0] / pointsPerFoot, s.b[1] / pointsPerFoot]] as [Point, Point]);
  const placed = placeTags(tags, walls, doors.filter(d => d.kind === "door"), { ovals: tagOvals(curves, pointsPerFoot), lines }, glazing);
  let k = 0;
  return {
    walls: walls.map((w, i) => ({ ...w, type: placed.wallTypes[i] })),
    doors: doors.map(d => d.kind === "door" ? { ...d, number: placed.doorNumbers[k++] } : d),
    glazing: glazing.map((g, i) => ({ ...g, type: placed.glazingTypes[i] })),
    tags,
  };
}
/**
 * The enclosed rooms of a level, from its walls, doors and glass as they stand now (the estimator's "Not a
 * wall" and "Not glass" corrections included), named by its room tags. Computed, not stored, so a
 * correction reflows the rooms; empty for a level without walls read from its lines.
 */
export function levelSpaces(level: Pick<SchematicLevel, "walls" | "doors" | "glazing" | "rooms">): Room[] {
  if (!level.walls?.length) return [];
  return levelRooms({ walls: level.walls.filter(w => !w.excluded), doors: (level.doors ?? []).filter(d => d.kind === "door"), glazing: (level.glazing ?? []).filter(g => !g.excluded), tags: level.rooms });
}

/** `partitionTypes`: the wall types the partition type sheet lists (read by AI), to describe and check wall types. */
export type SchematicModel = { levels: SchematicLevel[]; warnings: string[]; builtAt: string; partitionTypes?: PartitionType[]; partitionSheet?: string };

/** The sheet that schedules the partition (wall) types, by its title; null when the set has none. */
export function partitionTypeSheet<T extends Pick<RegisterRow, "title" | "discipline">>(register: T[]): T | null {
  return register.find(r => r.discipline === "Architectural" && /PARTITION\s*(TYPES?|SCHEDULES?)|WALL\s*TYPES?/i.test(r.title)) ?? null;
}

/** Tiles of a whole sheet that hold enough drawn lines to be worth reading (blank paper is skipped), as 0-1 [x, y, w, h]. */
export function contentTiles(segments: Segment[], page: { widthPt: number; heightPt: number }, cols = 4, rows = 3, minLines = 40): [number, number, number, number][] {
  const out: [number, number, number, number][] = [], ov = 0.08, w = 1 / cols, h = 1 / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.max(0, c * w - ov * w), y0 = Math.max(0, r * h - ov * h), x1 = Math.min(1, (c + 1) * w + ov * w), y1 = Math.min(1, (r + 1) * h + ov * h);
    const inside = (p: Point) => p[0] >= x0 * page.widthPt && p[0] <= x1 * page.widthPt && p[1] >= y0 * page.heightPt && p[1] <= y1 * page.heightPt;
    if (segments.filter(s => inside(s.a) && inside(s.b)).length >= minLines) out.push([x0, y0, x1 - x0, y1 - y0]);
  }
  return out;
}

const ORDINALS: Record<string, number> = { BASEMENT: 0, GROUND: 1, FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6 };
const NOT_A_FLOOR_PLAN = /ENLARGED|REFLECTED|CEILING|FINISH|FF&E|COORDINATION|DEMOLITION|FURNITURE|SIGNAGE|DETAIL|POOL|KITCHEN|ROOF/;

/** The level a plan title names: "LEVEL 01 - FIRST FLOOR PLAN" → 1; "SECOND FLOOR PLAN" → 2; null when none. */
export function levelOfTitle(title: string): number | null {
  const t = title.toUpperCase();
  const n = t.match(/\bLEVEL\s*0?(\d{1,2})\b/)?.[1] ?? t.match(/\b(\d{1,2})(?:ST|ND|RD|TH)\s+FLOOR\b/)?.[1];
  if (n !== undefined) return Number(n);
  const word = Object.keys(ORDINALS).find(w => new RegExp(`\\b${w}\\s+(FLOOR|LEVEL)\\b`).test(t));
  return word === undefined ? null : ORDINALS[word];
}

/** One architectural floor plan per level, lowest first (the first such sheet in the set wins). */
export function levelPlanSheets<T extends Pick<RegisterRow, "sheet" | "title" | "discipline">>(register: T[]): { level: number; row: T }[] {
  const out = new Map<number, T>();
  for (const row of register) {
    const t = row.title.toUpperCase();
    if (row.discipline !== "Architectural" || !/FLOOR PLAN|LEVEL\s*0?\d+\s*-?\s*PLAN/.test(t) || NOT_A_FLOOR_PLAN.test(t)) continue;
    const level = levelOfTitle(t);
    if (level !== null && !out.has(level)) out.set(level, row);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([level, row]) => ({ level, row }));
}

/** The sheet most likely to show level elevations: building sections, then wall sections, then exterior elevations. */
export function heightSheet<T extends Pick<RegisterRow, "title" | "discipline">>(register: T[]): T | null {
  for (const re of [/BUILDING SECTION/, /WALL SECTION/, /EXTERIOR ELEVATION/]) {
    const row = register.find(r => r.discipline === "Architectural" && re.test(r.title.toUpperCase()));
    if (row) return row;
  }
  return null;
}

/** Feet per inch of paper from a printed architectural scale: 1/8" = 1'-0" → 8; 3/16" = 1'-0" → 5.333. Null when none is found. */
export function feetPerInch(text: string): number | null {
  const m = text.match(/(\d+)\s*\/\s*(\d+)\s*(?:"|''|”|IN\.?)\s*=\s*1\s*'\s*-?\s*0\s*(?:"|''|”)?/i) ?? text.match(/(1)\s*(?:"|''|”)\s*=\s*1\s*'\s*-?\s*0/i);
  if (!m) return null;
  const inches = m[2] ? Number(m[1]) / Number(m[2]) : 1;
  return inches > 0 && inches <= 3 ? Math.round((1 / inches) * 1000) / 1000 : null;
}

export const polygonArea = (pts: Point[]) => Math.abs(pts.reduce((s, [x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]; return s + x * ny - nx * y; }, 0)) / 2;

/**
 * A level's outline and rooms in feet, from 0–1 image positions. With a scale the page size gives
 * the feet; without one the outline is scaled to `targetSf` (its share of the building area).
 */
export function toFeet(input: { outline: Point[]; rooms: SchematicRoom[]; page: { widthIn: number; heightIn: number }; feetPerInch: number | null; targetSf: number }): { outline: Point[]; rooms: SchematicRoom[]; sizing: string; frame: { widthFeet: number; heightFeet: number } } {
  let widthFeet: number, heightFeet: number, sizing: string;
  if (input.feetPerInch) {
    widthFeet = input.page.widthIn * input.feetPerInch; heightFeet = input.page.heightIn * input.feetPerInch;
    sizing = `Printed scale, ${input.feetPerInch} ft per inch`;
  } else {
    const aspect = input.page.heightIn / input.page.widthIn;
    const unitArea = polygonArea(input.outline.map(([x, y]) => [x, y * aspect] as Point));
    const k = unitArea > 0 && input.targetSf > 0 ? Math.sqrt(input.targetSf / unitArea) : 100;
    widthFeet = k; heightFeet = aspect * k;
    sizing = input.targetSf > 0 ? "Sized to the building area (no scale read)" : "Proportional only (no scale or building area)";
  }
  const frame = { widthFeet: Math.round(widthFeet * 1000) / 1000, heightFeet: Math.round(heightFeet * 1000) / 1000 };
  const map = (p: Point) => fromFraction(frame, p);
  return { outline: input.outline.map(map), rooms: input.rooms.map(r => ({ ...r, at: map(r.at) })), sizing, frame };
}

type Frame = { widthFeet: number; heightFeet: number };

/**
 * A level's walls from the plan sheet's vector lines (lib/plan-vectors segments, in page points), in the
 * level's frame, so they sit on the outline. Only the area around the read outline counts (title block,
 * key plan and details stay out). Thickness limits are in feet, so walls need a true scale: with the size
 * taken from the building area they are kept but flagged.
 */
/** Page points per foot in a level's frame, and the plan's area on the sheet around the read outline. */
function planArea(page: { widthPt: number; heightPt: number }, frame: Frame, outline: Point[]) {
  const pointsPerFoot = page.widthPt / frame.widthFeet;
  let box: [number, number, number, number] | undefined;
  if (outline.length >= 3) {
    const xs = outline.map(p => p[0] * page.widthPt), ys = outline.map(p => p[1] * page.heightPt);
    const margin = 0.1 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 20 * pointsPerFoot;
    box = [Math.min(...xs) - margin, Math.min(...ys) - margin, Math.max(...xs) + margin, Math.max(...ys) + margin];
  }
  return { pointsPerFoot, box };
}

/**
 * A level's doors from the plan's swings (lib/door-detection), in the level's frame: the swing arcs in
 * the plan's area, their openings placed against the level's walls (from levelWalls, same frame).
 */
export function levelDoors(segments: Segment[], curves: Curve[], page: { widthPt: number; heightPt: number }, frame: Frame, outline: Point[], walls: SchematicWall[]): SchematicDoor[] {
  const { pointsPerFoot, box } = planArea(page, frame, outline);
  const inside = (p: Point) => !box || (p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]);
  const swings = swingArcs(segments.filter(s => inside(s.a) && inside(s.b)), curves.filter(c => inside(c.from) && inside(c.to)), pointsPerFoot);
  const r1 = (p: Point): Point => [Math.round(p[0] * 10) / 10 || 0, Math.round(p[1] * 10) / 10 || 0];
  return doorsFromSwings(swings, walls.map(w => ({ ...w, weights: [] }))).map(d => ({
    a: r1(d.a), b: r1(d.b), width: Math.round(d.width * 10) / 10, leaves: d.leaves, hinges: d.hinges.map(r1), openTo: d.openTo.map(r1), kind: d.kind,
    thickness: d.host === null ? 0.4 : walls[d.host].thickness,
  }));
}

export function levelWalls(segments: Segment[], page: { widthPt: number; heightPt: number }, frame: Frame, outline: Point[], printedScale: boolean): { walls: SchematicWall[]; note: string; weight: number | null } {
  const { pointsPerFoot, box } = planArea(page, frame, outline);
  const found = planWalls(segments, pointsPerFoot, box);
  const r1 = (n: number) => Math.round(n * 10) / 10 || 0; // no -0
  const walls = found.walls.map(w => ({ a: [r1(w.a[0]), r1(w.a[1])] as Point, b: [r1(w.b[0]), r1(w.b[1])] as Point, thickness: Math.round(w.thickness * 100) / 100 }));
  return { walls, weight: found.weight, note: found.walls.length && !printedScale ? `${found.note} No printed scale was read, so wall sizes follow the building area; check them.` : found.note };
}

/**
 * A level's glass (storefront, windows, glass partitions) from the plan's panes (wall-detection planGlazing):
 * lighter lines a pane's width apart, never inside a wall or along a door's leaf. Same frame as the walls.
 */
export function levelGlazing(segments: Segment[], page: { widthPt: number; heightPt: number }, frame: Frame, outline: Point[], wallWeight: number | null, walls: SchematicWall[], doors: SchematicDoor[]): SchematicGlazing[] {
  const { pointsPerFoot, box } = planArea(page, frame, outline);
  const leaves = doors.flatMap(d => d.hinges.map((h, i) => [h, d.openTo[i]] as [Point, Point]));
  const r1 = (n: number) => Math.round(n * 10) / 10 || 0;
  return planGlazing(segments, pointsPerFoot, wallWeight, walls.map(w => ({ ...w, weights: [] })), box, leaves).map(g => ({ a: [r1(g.a[0]), r1(g.a[1])] as Point, b: [r1(g.b[0]), r1(g.b[1])] as Point }));
}
/** Image fraction → feet in a level's frame (to 0.1 ft). */
export const fromFraction = (frame: Frame, [x, y]: Point): Point => [Math.round(x * frame.widthFeet * 10) / 10, Math.round(y * frame.heightFeet * 10) / 10];
/** Feet → image fraction in a level's frame: where to draw a point over the source sheet. */
export const toFraction = (frame: Frame, [x, y]: Point): Point => [x / frame.widthFeet, y / frame.heightFeet];

const side = (p: Point, q: Point, r: Point) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const segmentsCross = (a: Point, b: Point, c: Point, d: Point) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;

/** Whether a closed polygon's edges cross each other (neighbouring edges share a corner and don't count). */
export function selfCrossing(pts: Point[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
  }
  return false;
}

/**
 * A read outline made usable: repeated points and a closing repeat of the first point removed; if its
 * edges cross, the points re-ordered around their centre (which fixes a footprint read out of order).
 * Null, with the reason, when it still crosses or has fewer than 4 corners.
 */
export function cleanOutline(points: Point[]): { outline: Point[] | null; note: string } {
  const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 0.002 && Math.abs(a[1] - b[1]) < 0.002;
  const pts = points.filter((p, i) => i === 0 || !same(p, points[i - 1]));
  while (pts.length > 1 && same(pts[0], pts[pts.length - 1])) pts.pop();
  if (pts.length < 4) return { outline: null, note: "The outline has fewer than 4 corners." };
  if (!selfCrossing(pts)) return { outline: pts, note: "" };
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  return selfCrossing(sorted)
    ? { outline: null, note: "The outline's edges cross each other." }
    : { outline: sorted, note: "The outline's points were read out of order and were re-ordered around the building's centre; check the shape." };
}

/**
 * Elevations and floor-to-floor heights by level number, from what was read off a section (levels
 * named "LEVEL 02", "ROOF"…). Missing heights use 14 ft and are listed in the warnings.
 */
export function levelHeights(levels: number[], read: { name: string; elevation: number }[]): { elevations: Map<number, number>; heights: Map<number, number>; warnings: string[] } {
  const byLevel = new Map<number, number>();
  let roof: number | null = null;
  for (const r of read) {
    if (!Number.isFinite(r.elevation)) continue;
    if (/ROOF/i.test(r.name)) roof = roof === null ? r.elevation : Math.min(roof, r.elevation);
    else { const n = levelOfTitle(`${r.name} FLOOR`) ?? levelOfTitle(r.name); if (n !== null && !byLevel.has(n)) byLevel.set(n, r.elevation); }
  }
  const warnings: string[] = [];
  const known = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
  // Every marker read, lowest first: the next one above a floor ends that floor's height.
  const markers = [...known.map(([, e]) => e), ...(roof === null ? [] : [roof])].sort((a, b) => a - b);
  let base = 0;
  if (byLevel.has(levels[0])) base = byLevel.get(levels[0])!;
  else if (known.length) {
    const [n0, e0] = known[0];
    base = e0 - 14 * Math.max(0, n0 - levels[0]);
    warnings.push(`${levelName(levels[0])}'s elevation was not read; it is taken as 14 ft per level below ${levelName(n0)}.`);
  }
  const elevations = new Map<number, number>(), heights = new Map<number, number>();
  let assumed = 0, previous = base, previousHeight = 0;
  levels.forEach((level, i) => {
    const abs = byLevel.get(level) ?? (i === 0 ? base : previous + previousHeight);
    const above = markers.find(m => m > abs + 0.5);
    if (above === undefined) assumed++;
    const height = Math.round((above === undefined ? 14 : above - abs) * 100) / 100;
    elevations.set(level, Math.round((abs - base) * 100) / 100);
    heights.set(level, height);
    previous = abs; previousHeight = height;
  });
  if (assumed) warnings.push(`${assumed} floor-to-floor height${assumed === 1 ? " was" : "s were"} not read and use${assumed === 1 ? "s" : ""} 14 ft.`);
  return { elevations, heights, warnings };
}

/** A level marker read off a section; `at` is where its elevation was read, 0–1 in the image it came from. */
export type Marker = { name: string; elevation: number; at?: Point };
/** The level a marker names ("LEVEL 03 - LOW ROOF" → 3); an unnumbered roof ("T.O. ROOF") sorts last. */
const markerKey = (name: string): number | null => levelOfTitle(`${name} FLOOR`) ?? levelOfTitle(name) ?? (/ROOF/i.test(name) ? Infinity : null);

/**
 * One elevation per level from several readings of the same section sheet (the client reads it in
 * tiles so small print is legible; `weights` lets a close-up re-read count more). Each level keeps the
 * value with the most votes (within 0.5 ft); a level whose two best values are within one vote is
 * `disputed`, with where it was read, so the client can read it again close up.
 * Then the set has to make sense, lowest first: each marker 7 to 40 ft per level above the one below
 * (a roof level at least 2 ft). While a pair doesn't fit, its less supported marker is dropped (on a
 * tie, the one that fits fewer of the others) and the warnings say so: a wrong height is worse than
 * the 14 ft default, which levelHeights reports.
 */
export function consensusMarkers(readings: Marker[][], weights: number[] = []): { markers: (Marker & { votes: number })[]; disputed: { name: string; reading: number; at: Point }[]; warnings: string[] } {
  const groups = new Map<number, { name: string; votes: { value: number; weight: number; reading: number; at?: Point }[] }>();
  readings.forEach((reading, r) => {
    const seen = new Set<string>();
    for (const m of reading) {
      const key = markerKey(m.name), id = `${key}|${m.elevation}`;
      if (key === null || !Number.isFinite(m.elevation) || seen.has(id)) continue;
      seen.add(id);
      const group = groups.get(key) ?? { name: m.name.toUpperCase(), votes: [] };
      group.votes.push({ value: m.elevation, weight: weights[r] ?? 1, reading: r, at: m.at });
      groups.set(key, group);
    }
  });
  type Pick = { key: number; name: string; elevation: number; votes: number };
  const disputed: { name: string; reading: number; at: Point }[] = [];
  let picked: Pick[] = [...groups].map(([key, { name, votes }]) => {
    const clusters = votes.map(v => ({ v: v.value, votes: votes.filter(w => Math.abs(w.value - v.value) <= 0.5).reduce((s, w) => s + w.weight, 0) }))
      .sort((a, b) => b.votes - a.votes || a.v - b.v);
    const best = clusters[0], rival = clusters.find(c => Math.abs(c.v - best.v) > 0.5);
    const where = votes.find(v => v.at);
    if (rival && best.votes - rival.votes <= 1 && where?.at) disputed.push({ name, reading: where.reading, at: where.at });
    return { key, name, elevation: best.v, votes: best.votes };
  }).sort((a, b) => a.key - b.key);
  const fits = (x: Pick, y: Pick) => {
    const [lower, upper] = x.key < y.key ? [x, y] : [y, x];
    const rise = upper.elevation - lower.elevation, levels = Number.isFinite(upper.key) ? upper.key - lower.key : 1;
    return rise >= (/ROOF|PARAPET|PENTHOUSE/i.test(upper.name) ? 2 : 7 * levels) && rise <= 40 * levels;
  };
  const warnings: string[] = [];
  for (;;) {
    const i = picked.findIndex((m, n) => n > 0 && !fits(picked[n - 1], m));
    if (i < 0) break;
    const [a, b] = [picked[i - 1], picked[i]];
    const support = (m: Pick) => picked.filter(o => o !== m && fits(o, m)).length;
    const drop = a.votes !== b.votes ? (a.votes < b.votes ? a : b) : support(a) < support(b) ? a : b;
    warnings.push(`${drop.name} read as ${drop.elevation} ft doesn't fit the other level markers and was not used.`);
    picked = picked.filter(m => m !== drop);
  }
  return { markers: picked.map(({ name, elevation, votes }) => ({ name, elevation, votes })), disputed, warnings };
}

export function levelName(level: number): string { return level === 0 ? "Basement" : `Level ${String(level).padStart(2, "0")}`; }

/** Moves one outline point (a correction); the result keeps every other value. */
export function moveOutlinePoint(model: SchematicModel, levelId: string, index: number, to: Point): SchematicModel {
  return { ...model, levels: model.levels.map(l => l.id !== levelId || !l.outline[index] || !to.every(Number.isFinite) ? l : { ...l, outline: l.outline.map((p, i) => i === index ? to : p) }) };
}

/** Sets a level's floor-to-floor height and moves the levels above it. */
/**
 * Gives every wall on a level that no tag typed the estimator's type (typical partitions are usually not
 * tagged; a general note covers them). Tagged walls keep theirs. A blank type clears what this set.
 */
export function setUntaggedWallType(model: SchematicModel, levelId: string, type: string): SchematicModel {
  const t = type.trim().toUpperCase().replace(/\s+/g, "").slice(0, 16);
  return { ...model, levels: model.levels.map(l => l.id !== levelId || !l.walls ? l : {
    ...l, walls: l.walls.map(w => w.edited || (w.type && !w.typeSet) ? w : { ...w, type: t || null, typeSet: !!t }),
  }) };
}

const editLevel = (model: SchematicModel, levelId: string, edit: (l: SchematicLevel) => SchematicLevel): SchematicModel => {
  if (!model.levels.some(l => l.id === levelId)) throw new Error("That level is no longer in the model.");
  return { ...model, levels: model.levels.map(l => l.id === levelId ? edit(l) : l) };
};

/** The estimator's correction of one wall: its type (blank = untyped), or that it is not a wall at all (kept, so it can be restored). */
export function editWall(model: SchematicModel, levelId: string, index: number, change: { type?: string; excluded?: boolean }): SchematicModel {
  return editLevel(model, levelId, l => {
    if (!l.walls?.[index]) throw new Error("That wall is no longer in the model.");
    const t = change.type === undefined ? undefined : change.type.trim().toUpperCase().replace(/\s+/g, "").slice(0, 16);
    return { ...l, walls: l.walls.map((w, i) => i !== index ? w : {
      ...w, ...(t !== undefined ? { type: t || null, typeSet: false, edited: true } : {}), ...(change.excluded !== undefined ? { excluded: change.excluded } : {}),
    }) };
  });
}

/** The estimator's correction of one door's number (blank = none). */
export function editDoorNumber(model: SchematicModel, levelId: string, index: number, number: string): SchematicModel {
  return editLevel(model, levelId, l => {
    if (!l.doors?.[index]) throw new Error("That door is no longer in the model.");
    const n = number.trim().toUpperCase().slice(0, 12);
    return { ...l, doors: l.doors.map((d, i) => i === index ? { ...d, number: n || null } : d) };
  });
}

/** The estimator's correction of one glass run: its type, or that it is not glass. */
export function editGlazing(model: SchematicModel, levelId: string, index: number, change: { type?: string; excluded?: boolean }): SchematicModel {
  return editLevel(model, levelId, l => {
    if (!l.glazing?.[index]) throw new Error("That glass is no longer in the model.");
    const t = change.type === undefined ? undefined : change.type.trim().toUpperCase().replace(/\s+/g, "").slice(0, 16);
    return { ...l, glazing: l.glazing.map((g, i) => i !== index ? g : { ...g, ...(t !== undefined ? { type: t || null } : {}), ...(change.excluded !== undefined ? { excluded: change.excluded } : {}) }) };
  });
}

/** The walls that count: everything read from the plan except what the estimator marked not a wall. */
export const keptWalls = (level: SchematicLevel) => (level.walls ?? []).filter(w => !w.excluded);

export function setLevelHeight(model: SchematicModel, levelId: string, height: number): SchematicModel {
  if (!(Number.isFinite(height) && height >= 6 && height <= 60)) throw new Error("Use a floor-to-floor height between 6 and 60 ft.");
  const levels = model.levels.map(l => l.id === levelId ? { ...l, height } : l);
  let elevation = levels[0]?.elevation ?? 0;
  return { ...model, levels: levels.map((l, i) => { if (i > 0) elevation += levels[i - 1].height; return i === 0 ? l : { ...l, elevation: Math.round(elevation * 100) / 100 }; }) };
}

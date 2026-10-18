// A schematic 3D model from a new project's drawings (15 Oct, Danial: "I'll have the AI for this [3D]
// built"). Honest scope: a MASSING model per level, labelled "schematic, not measured". It is not a
// traced, measured model like Jelleff's (lib/jelleff-model.ts).
//
// Levels come from the floor-plan sheet titles. The AI reads each plan image for the building outline
// and its room tags, and a section or elevation image for the level elevations (lib/ai-jobs-more
// "plan-outline", "level-heights"). Scale comes from the plan's printed scale when one is read; without
// it the outline is sized so the floor areas add up to the project's building area, and says so.
// People can correct the outline and heights afterwards. Pure functions.

import type { RegisterRow } from "./project-files";

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
};
export type SchematicModel = { levels: SchematicLevel[]; warnings: string[]; builtAt: string };

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
export function toFeet(input: { outline: Point[]; rooms: SchematicRoom[]; page: { widthIn: number; heightIn: number }; feetPerInch: number | null; targetSf: number }): { outline: Point[]; rooms: SchematicRoom[]; sizing: string } {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (input.feetPerInch) {
    const fx = input.page.widthIn * input.feetPerInch, fy = input.page.heightIn * input.feetPerInch;
    const map = ([x, y]: Point): Point => [round(x * fx), round(y * fy)];
    return { outline: input.outline.map(map), rooms: input.rooms.map(r => ({ ...r, at: map(r.at) })), sizing: `Printed scale, ${input.feetPerInch} ft per inch` };
  }
  const aspect = input.page.heightIn / input.page.widthIn;
  const unitArea = polygonArea(input.outline.map(([x, y]) => [x, y * aspect] as Point));
  const k = unitArea > 0 && input.targetSf > 0 ? Math.sqrt(input.targetSf / unitArea) : 100;
  const map = ([x, y]: Point): Point => [round(x * k), round(y * aspect * k)];
  return { outline: input.outline.map(map), rooms: input.rooms.map(r => ({ ...r, at: map(r.at) })), sizing: input.targetSf > 0 ? "Sized to the building area (no scale read)" : "Proportional only (no scale or building area)" };
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

export function levelName(level: number): string { return level === 0 ? "Basement" : `Level ${String(level).padStart(2, "0")}`; }

/** Moves one outline point (a correction); the result keeps every other value. */
export function moveOutlinePoint(model: SchematicModel, levelId: string, index: number, to: Point): SchematicModel {
  return { ...model, levels: model.levels.map(l => l.id !== levelId || !l.outline[index] || !to.every(Number.isFinite) ? l : { ...l, outline: l.outline.map((p, i) => i === index ? to : p) }) };
}

/** Sets a level's floor-to-floor height and moves the levels above it. */
export function setLevelHeight(model: SchematicModel, levelId: string, height: number): SchematicModel {
  if (!(Number.isFinite(height) && height >= 6 && height <= 60)) throw new Error("Use a floor-to-floor height between 6 and 60 ft.");
  const levels = model.levels.map(l => l.id === levelId ? { ...l, height } : l);
  let elevation = levels[0]?.elevation ?? 0;
  return { ...model, levels: levels.map((l, i) => { if (i > 0) elevation += levels[i - 1].height; return i === 0 ? l : { ...l, elevation: Math.round(elevation * 100) / 100 }; }) };
}

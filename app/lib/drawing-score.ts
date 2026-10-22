// Scoring an AI's reading of plan tags against the Jelleff hand trace (scripts/score-drawing-ai.mjs).
// The trace is the answer key: its doors (numbered, A8.2), its walls that carry a wall-type tag (A8.1)
// and its room labels, each at its place on the sheet. A read counts when it says the right thing near
// the right place. Positions are page fractions (0-1 across and down the sheet), as the AI reports them.
// The trace was made from the sheet images in public/models/jelleff, which show the whole page.

import { doorScheduleRows, doorTraces } from "./jelleff-doors";
import { allRooms, elements, level2Elements, partitionSchedule, sheetTransformFor, toSheetPoint } from "./jelleff-model";
import type { PlanTag } from "./ai-jobs-more";
import { normalTag, tagKey } from "./tag-placement";

type Pt = [number, number];
export type SheetTruth = {
  sheet: string;
  /** The page image's size in feet, to measure distances in feet from page fractions. */
  widthFeet: number; heightFeet: number;
  doors: { number: string; at: Pt }[];
  walls: { tag: string; a: Pt; b: Pt }[];
  rooms: { number: string; name: string; at: Pt }[];
};
/** A tag as read, at its place on the page. */
export type TagRead = PlanTag;

/** How near a read must be, in feet: door numbers sit beside their door, wall tags on or by their wall. */
export const NEAR_FEET = { door: 8, wall: 12, room: 30 };

export const JELLEFF_PLAN_SHEETS = [{ sheet: "A1.1", page: 46, level: "L1" }, { sheet: "A1.2", page: 47, level: "L2" }] as const;

export function jelleffTruth(sheet: string): SheetTruth {
  const t = sheetTransformFor(sheet);
  const plan = JELLEFF_PLAN_SHEETS.find(s => s.sheet === sheet);
  if (!t || !plan) throw new Error(`No hand trace for sheet ${sheet}.`);
  const frac = ([x, y]: Pt): Pt => [x / t.imageWidth, y / t.imageHeight];
  const fromFeet = (p: Pt): Pt => frac(toSheetPoint(sheet, p)!);
  return {
    sheet, widthFeet: t.imageWidth * t.feetPerPixel, heightFeet: t.imageHeight * t.feetPerPixel,
    doors: doorTraces.filter(d => d.level === plan.level).map(d => ({ number: d.number, at: frac([(d.opening[0][0] + d.opening[1][0]) / 2, (d.opening[0][1] + d.opening[1][1]) / 2]) })),
    walls: [...elements, ...level2Elements].filter(e => e.kind === "wall" && e.partitionTag && (e.level ?? "L1") === plan.level && e.points?.length === 2)
      .map(e => ({ tag: normalTag(e.partitionTag!), a: fromFeet(e.points![0] as Pt), b: fromFeet(e.points![1] as Pt) })),
    rooms: allRooms.filter(r => r.level === plan.level).map(r => ({ number: r.number, name: r.name, at: fromFeet(r.center as Pt) })),
  };
}

const feet = (truth: SheetTruth, [ax, ay]: Pt, [bx, by]: Pt) => Math.hypot((ax - bx) * truth.widthFeet, (ay - by) * truth.heightFeet);
function feetToSegment(truth: SheetTruth, p: Pt, a: Pt, b: Pt): number {
  const [px, py, ax, ay, bx, by] = [p[0] * truth.widthFeet, p[1] * truth.heightFeet, a[0] * truth.widthFeet, a[1] * truth.heightFeet, b[0] * truth.widthFeet, b[1] * truth.heightFeet];
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + k * dx), py - (ay + k * dy));
}
const key = (kind: TagRead["kind"], text: string) => kind === "wall" ? tagKey(normalTag(text)) : tagKey(text);

/** One read per tag: the same text of the same kind read on overlapping tiles within 3 ft is kept once. */
export function mergeReads(truth: SheetTruth, reads: TagRead[]): TagRead[] {
  const kept: TagRead[] = [];
  for (const r of reads) if (!kept.some(k => k.kind === r.kind && key(k.kind, k.text) === key(r.kind, r.text) && feet(truth, k.at, r.at) <= 3)) kept.push(r);
  return kept;
}

export type KindScore = { total: number; correct: number; wrongText: number; missed: number; reads: number; inSchedule: number | null; misses: string[] };
export type SheetScore = { sheet: string; doors: KindScore; walls: KindScore; rooms: KindScore };

/**
 * For each traced door, wall tag and room: correct when a read of the same kind with the same text lies
 * near it, wrong text when only other text lies near, missed when nothing does. `inSchedule` counts reads
 * whose text exists on the drawing set's schedule (A8.2 doors, A8.1 wall types), wherever they are.
 */
export function scoreSheet(truth: SheetTruth, rawReads: TagRead[]): SheetScore {
  const reads = mergeReads(truth, rawReads);
  const doorsRead = reads.filter(r => r.kind === "door"), wallsRead = reads.filter(r => r.kind === "wall"), roomsRead = reads.filter(r => r.kind === "room");
  const doorNumbers = new Set(doorScheduleRows.map(r => tagKey(r.number)));
  const wallTypes = new Set(partitionSchedule.types.map(t => tagKey(normalTag(t.tag))));
  const tally = <T>(items: T[], label: (t: T) => string, expected: (t: T) => string, near: (t: T) => TagRead[], kind: TagRead["kind"], read: TagRead[], schedule: Set<string> | null): KindScore => {
    const s: KindScore = { total: items.length, correct: 0, wrongText: 0, missed: 0, reads: read.length, inSchedule: schedule ? read.filter(r => schedule.has(key(kind, r.text))).length : null, misses: [] };
    for (const item of items) {
      const close = near(item);
      if (close.some(r => key(kind, r.text) === key(kind, expected(item)))) s.correct++;
      else { if (close.length) s.wrongText++; else s.missed++; s.misses.push(`${label(item)}: ${close.length ? `read ${close.map(r => r.text).join(" / ")}` : "nothing read near it"}`); }
    }
    return s;
  };
  return {
    sheet: truth.sheet,
    doors: tally(truth.doors, d => `door ${d.number}`, d => d.number, d => doorsRead.filter(r => feet(truth, r.at, d.at) <= NEAR_FEET.door), "door", doorsRead, doorNumbers),
    walls: tally(truth.walls, w => `wall tag ${w.tag}`, w => w.tag, w => wallsRead.filter(r => feetToSegment(truth, r.at, w.a, w.b) <= NEAR_FEET.wall), "wall", wallsRead, wallTypes),
    rooms: tally(truth.rooms, r => `room ${r.number} ${r.name}`, r => r.number, r => roomsRead.filter(x => feet(truth, x.at, r.at) <= NEAR_FEET.room), "room", roomsRead, null),
  };
}

/** A tile's reads (0-1 within the tile) placed on the page. */
export const onPage = ([x, y, w, h]: [number, number, number, number], tags: TagRead[]): TagRead[] =>
  tags.map(t => ({ ...t, at: [x + t.at[0] * w, y + t.at[1] * h] as Pt }));

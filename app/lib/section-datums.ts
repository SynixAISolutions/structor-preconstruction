import { drawingLengthFeet } from "./drawing-dimensions";
import { levelOfTitle } from "./schematic-model";
import type { TextBox } from "./text-anchor";

export type DimensionSource = { documentId: string; sheet: string; page: number; quote: string };
export type PrintedDatum = { name: string; elevation: number; quote: string };
export type SourcedDatum = Omit<PrintedDatum, "quote"> & { source: DimensionSource };

const LEVEL = /^(?:(?:LEVEL\s*L?\s*\d{1,2}|L\d{1,2}|BASEMENT(?:\s+(?:FLOOR|LEVEL))?|(?:GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+(?:FLOOR|LEVEL))(?:\s*[-–:]?\s*(?:EXISTING|NEW(?: ADDITION)?|ADDITION))?|(?:(?:T\.?\s*O\.?|TOP OF|LOW|HIGH)\s+)?ROOF)$/i;

const label = (text: string) => text.trim().replace(/\s+/g, " ");

/** Roof datums are distinct from floor datums. Parapets, ceilings and intermediate landings are not floors. */
export function sectionDatumLevel(name: string): number | null {
  if (!LEVEL.test(name)) return null;
  if (/\bROOF$/i.test(name)) return Infinity;
  const compact = /^(?:LEVEL\s*)?L(\d{1,2})\b/i.exec(name);
  return compact ? Number(compact[1]) : levelOfTitle(name + " FLOOR") ?? levelOfTitle(name);
}

const xMid = (box: TextBox) => box.x + box.w / 2;
const yMid = (box: TextBox) => box.y + box.h / 2;

/** Match a named datum to its dimension in the same callout, using the original PDF text positions. */
export function printedSectionDatums(boxes: TextBox[]): PrintedDatum[] {
  const lengths = boxes.flatMap(box => {
    // Printed section elevations use feet or a metric datum. A nearby dimension just in inches is not an elevation.
    const text = box.str.trim();
    const elevation = /['′’]|(?:mm|cm|m)$/i.test(text) ? drawingLengthFeet(text) : null;
    return elevation === null || !Number.isFinite(elevation) ? [] : [{ box, elevation }];
  });
  return boxes.flatMap(box => {
    const text = label(box.str);
    const inline = /^(.*?)\s*[:=]\s*(.+)$/.exec(text);
    if (inline && sectionDatumLevel(inline[1]) !== null) {
      const elevation = drawingLengthFeet(inline[2]);
      return elevation !== null ? [{ name: inline[1], elevation, quote: inline[2] }] : [];
    }
    if (sectionDatumLevel(text) === null) return [];
    const matches = lengths.flatMap(({ box: n, elevation }) => {
      const h = Math.max(box.h, n.h);
      const dy = (yMid(n) - yMid(box)) / h;
      const dx = Math.min(Math.abs(xMid(n) - xMid(box)), Math.abs(n.x - box.x), Math.abs(n.x + n.w - box.x - box.w)) / h;
      const nearBelow = dy >= .55 && dy <= 2.1 && dx <= 1.05;
      const right = (n.x - box.x - box.w) / h;
      const nearRight = Math.abs(dy) <= .4 && right >= -.1 && right <= 1.8;
      return nearBelow || nearRight ? [{ elevation, quote: n.str.trim(), distance: nearBelow ? dy + dx : Math.abs(dy) + right }] : [];
    }).sort((a, b) => a.distance - b.distance);
    const nearest = matches[0];
    if (!nearest || matches.some(m => m.elevation !== nearest.elevation && m.distance < nearest.distance + .25)) return [];
    return [{ name: text, elevation: nearest.elevation, quote: nearest.quote }];
  });
}

/** Keep a datum only when the current sheets agree to 1/4 inch. Distinct parts of a level stay unresolved. */
export function resolveSectionDatums(readings: SourcedDatum[]): { markers: SourcedDatum[]; warnings: string[] } {
  const groups = new Map<number, SourcedDatum[]>();
  for (const datum of readings) {
    const key = sectionDatumLevel(datum.name);
    if (key === null || !Number.isFinite(datum.elevation)) continue;
    const group = groups.get(key) ?? [];
    if (!group.some(item => item.elevation === datum.elevation && item.source.sheet === datum.source.sheet)) group.push(datum);
    groups.set(key, group);
  }
  const markers: SourcedDatum[] = [], warnings: string[] = [];
  for (const [key, group] of groups) {
    const ordered = [...group].sort((a, b) => a.elevation - b.elevation);
    if (ordered.at(-1)!.elevation - ordered[0].elevation > .25 / 12) {
      const name = key === Infinity ? "Roof" : `Level ${String(key).padStart(2, "0")}`;
      const options = [...new Set(group.map(d => `${d.source.quote} on ${d.source.sheet}`))].slice(0, 5);
      warnings.push(`${name} has different printed elevations (${options.join(", ")}). Its position needs review.`);
    } else markers.push(group[0]);
  }
  return { markers, warnings };
}

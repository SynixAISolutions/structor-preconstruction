import { drawingLengthFeet, type DrawingTextRun } from "./drawing-dimensions";
import { glazingElevationParts, glazingLegend, type GlazingElevation } from "./glazing-elevation-parts";
import { dimensionLabels, dimensionSpans } from "./model-scoreboard";
import type { Point, Segment } from "./plan-vectors";
import type { RegisterRow } from "./project-files";
import { feetPerInch, type SchematicLevel } from "./schematic-model";
import type { DimensionSource } from "./section-datums";
import type { TextBox } from "./text-anchor";

type GlazingSize = {
  kind: "frame" | "rough-opening";
  width: number; height: number; widthLabel: string; heightLabel: string;
  sill?: { feet: number; quote: string };
  elevation?: GlazingElevation;
};
export type GlazingDimensions = GlazingSize & { source: DimensionSource };
export type GlazingDetailReference = { tag: string; source: DimensionSource; size?: GlazingSize };
type PrintedGlazing = { tag: string; quote: string; size?: GlazingSize };
type Dimension = { from: number; to: number; at: number; feet: number; label: string };
type Axis = 0 | 1;

const CAPTION = /^(?:[A-Z]\d+\s+)?(?:STOREFRONT|CURTAIN\s*WALL|WINDOW)\s*[-–:]\s*((?:SF|CW|W)-?\d{1,3}[A-Z]?(?:-\d+[A-Z]?)?)$/i;
const WINDOW_TAG = /^W-?\d{1,3}[A-Z]?(?:-\d+[A-Z]?)?$/i;

export function glazingDetailSheets<T extends Pick<RegisterRow, "title" | "discipline">>(register: T[]): T[] {
  return register.filter(row => row.discipline === "Architectural" &&
    /\b(?:STOREFRONT|CURTAIN\s*WALL|GLAZING|WINDOWS?)\b[\s\S]*\b(?:TYPES?|SCHEDULES?|ELEVATIONS?|DETAILS?)\b/i.test(row.title));
}

/** Identify the printed title of a type elevation, rather than a tag in a general note. */
export function printedGlazingReferences(boxes: TextBox[]): PrintedGlazing[] {
  return boxes.flatMap(box => {
    const quote = box.str.trim(), tag = CAPTION.exec(quote)?.[1];
    return tag ? [{ tag: tag.toUpperCase(), quote }] : [];
  });
}

/** A window schedule measures the rough opening. Those dimensions describe the opening, not the glass. */
export function printedWindowSizes(boxes: TextBox[]): PrintedGlazing[] {
  const center = (box: TextBox) => box.x + box.w / 2;
  const line = (box: TextBox) => box.y + box.h / 2;
  const phrase = (box: TextBox) => box.str.trim().replace(/\s+/g, " ").toUpperCase();
  const sameRow = (a: TextBox, b: TextBox) => Math.abs(line(a) - line(b)) < Math.max(a.h, b.h) * .53;
  const lengths = boxes.flatMap(box => {
    const feet = drawingLengthFeet(box.str);
    return feet !== null && feet > .4 && feet <= 30 ? [{ box, feet }] : [];
  });
  return boxes.filter(box => /^(?:WINDOW |TYPE )?MARK$/.test(phrase(box))).flatMap(mark => {
    const columns = boxes.filter(box => sameRow(box, mark) && box.x > mark.x + mark.w);
    const h = columns.filter(box => /^(?:ROUGH|ROUGH OPENING) HEIGHT$/.test(phrase(box)));
    const w = columns.filter(box => /^(?:ROUGH|ROUGH OPENING) WIDTH$/.test(phrase(box)));
    if (h.length !== 1 || w.length !== 1 || Math.abs(center(h[0]) - center(w[0])) > .1) return [];
    const spacing = Math.abs(center(h[0]) - center(w[0]));
    const inColumn = (box: TextBox, heading: TextBox) => Math.abs(center(box) - center(heading)) < spacing * .46;
    const rows = boxes.filter(box => WINDOW_TAG.test(phrase(box)) && line(box) > line(mark) && Math.abs(center(box) - center(mark)) <= mark.w);
    return rows.flatMap(row => {
      const height = lengths.filter(cell => sameRow(cell.box, row) && inColumn(cell.box, h[0]));
      const width = lengths.filter(cell => sameRow(cell.box, row) && inColumn(cell.box, w[0]));
      if (height.length !== 1 || width.length !== 1) return [];
      return [{ tag: phrase(row), quote: row.str.trim(), size: {
        kind: "rough-opening" as const,
        height: height[0].feet, width: width[0].feet, heightLabel: height[0].box.str.trim(), widthLabel: width[0].box.str.trim(),
      } }];
    });
  });
}

function titleRule(title: DrawingTextRun, segments: Segment[]) {
  const h = title.height;
  const rules = segments.filter(({ a, b }) => Math.abs(a[1] - b[1]) < .15
    && a[1] >= title.a[1] && a[1] - title.a[1] < h
    && Math.min(a[0], b[0]) <= title.a[0] + .2 * h && Math.min(a[0], b[0]) >= title.a[0] - 1.1 * h
    && Math.max(a[0], b[0]) >= title.b[0] - .1 * h);
  const rule = rules.sort((a, b) => a.a[1] - b.a[1])[0];
  return rule ? [Math.min(rule.a[0], rule.b[0]), Math.max(rule.a[0], rule.b[0])] : null;
}

function edgeCoverage(segments: Segment[], axis: Axis, at: number, from: number, to: number): number {
  const along = axis === 0 ? 1 : 0;
  const intervals = segments.flatMap(({ a, b }) => {
    if (Math.abs(a[axis] - at) > 1.2 || Math.abs(b[axis] - at) > 1.2) return [];
    const start = Math.max(from, Math.min(a[along], b[along])), end = Math.min(to, Math.max(a[along], b[along]));
    return end - start > 1.4 ? [{ start, end }] : [];
  }).sort((a, b) => a.start - b.start);
  let covered = 0, previous = from;
  for (const { start, end } of intervals) {
    covered += Math.max(0, end - Math.max(start, previous));
    previous = Math.max(previous, end);
  }
  return covered / (to - from);
}

/** An uninterrupted frame rail that continues past a rectangle makes it a bay or door, not the assembly. */
function extendsPastFrame(segments: Segment[], axis: Axis, at: number, from: number, to: number) {
  const along = axis === 0 ? 1 : 0;
  return segments.some(({ a, b, width }) => {
    if (width < .22 || Math.abs(a[axis] - at) > .65 || Math.abs(b[axis] - at) > .65) return false;
    const start = Math.min(a[along], b[along]), end = Math.max(a[along], b[along]);
    return (start < from - 2 && end > from + 8) || (end > to + 2 && start < to - 8);
  });
}

function elevationSill(text: DrawingTextRun[], bounds: [number, number, number, number], distance: number) {
  const [left, top, right, bottom] = bounds;
  const candidates = text.flatMap(run => {
    const [x, y] = run.a;
    if (x < left - distance || run.b[0] > right + distance || y < top || y > bottom + distance) return [];
    const value = /^SILL(?: HEIGHT| HT\.?)?\s*[:=]?\s*(.+?)\s*(?:A\.?F\.?F\.?|ABOVE FINISHED FLOOR)$/i.exec(run.text)?.[1];
    const feet = value ? drawingLengthFeet(value) : null;
    return feet !== null && feet >= 0 && feet <= 15 ? [{ feet, quote: run.text }] : [];
  });
  return candidates.length && candidates.every(item => item.feet === candidates[0].feet) ? candidates[0] : undefined;
}

/** Read the dimensions of labeled, scale-verified elevations. Require all four drawn frame edges. */
export function printedGlazingElevations(text: DrawingTextRun[], segments: Segment[]): PrintedGlazing[] {
  const legend = glazingLegend(text);
  const spans = dimensionSpans(segments, 1);
  const labels = dimensionLabels(spans, text);
  const dimensions = spans.flatMap((span, index) => {
    const { a, b } = span, label = labels[index], feet = drawingLengthFeet(label);
    if (feet === null || feet < 1 || feet > 100) return [];
    const axis: Axis = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? 0 : 1;
    const across = axis === 0 ? 1 : 0;
    if (Math.abs(a[across] - b[across]) > .25) return [];
    return [{ axis, from: Math.min(a[axis], b[axis]), to: Math.max(a[axis], b[axis]), at: (a[across] + b[across]) / 2, label, feet }];
  });

  return text.flatMap(title => {
    const tag = CAPTION.exec(title.text)?.[1]?.toUpperCase();
    if (!tag) return [];
    const reference: PrintedGlazing = { tag, quote: title.text };
    const rule = titleRule(title, segments), h = title.height;
    const scale = new Set(text.flatMap(run => {
      const below = run.a[1] - title.a[1];
      const feet = Math.abs(run.a[0] - title.a[0]) <= h && below >= .5 * h && below <= 2.6 * h ? feetPerInch(run.text) : null;
      return feet ? [feet] : [];
    }));
    if (!rule || scale.size !== 1) return [reference];

    const [left, right] = rule, ppf = 72 / [...scale][0];
    const y = title.a[1];
    const correctScale = (dim: Dimension) => Math.abs((dim.to - dim.from) / ppf - dim.feet) <= .75 / 12;
    const widths = dimensions.filter(dim => dim.axis === 0 && dim.from >= left - 1.8 * h && dim.to <= right + 1.8 * h && dim.at < y && correctScale(dim));
    const heights = dimensions.filter(dim => dim.axis === 1 && dim.at >= left - 3.6 * h && dim.at <= right + 3.6 * h && y - dim.to >= .25 * h && y - dim.to <= 8 * h && correctScale(dim));
    const found = widths.flatMap(w => heights.flatMap(v => {
      if (w.at >= v.from || v.from - w.at > 5 * h) return [];
      const outside = v.at < w.from ? w.from - v.at : v.at - w.to;
      if (outside < 2 || outside > 5 * h) return [];
      const edges = [
        edgeCoverage(segments, 0, w.from, v.from, v.to),
        edgeCoverage(segments, 0, w.to, v.from, v.to),
        edgeCoverage(segments, 1, v.from, w.from, w.to),
        edgeCoverage(segments, 1, v.to, w.from, w.to),
      ];
      if (edges.some(cover => cover < .85)) return [];
      if (extendsPastFrame(segments, 1, v.from, w.from, w.to) || extendsPastFrame(segments, 1, v.to, w.from, w.to)
        || extendsPastFrame(segments, 0, w.from, v.from, v.to) || extendsPastFrame(segments, 0, w.to, v.from, v.to)) return [];
      const largerWidth = widths.some(dim => dim.at < v.from && v.from - dim.at <= 6 * h
        && dim.from <= w.from + 1.2 && dim.to >= w.to - 1.2 && dim.feet > w.feet + 1 / 12);
      if (largerWidth) return [];
      return [{ w, v, area: w.feet * v.feet }];
    })).sort((a, b) => b.area - a.area);
    const best = found[0];
    if (!best) return [reference];
    // Only accept an overall rectangle when it contains the other dimensioned rectangles in this view.
    const { w, v } = best;
    if (found.some(other => other.w.from < w.from - 1.2 || other.w.to > w.to + 1.2 || other.v.from < v.from - 1.2 || other.v.to > v.to + 1.2)) return [reference];
    const sill = elevationSill(text, [w.from, v.from, w.to, v.to], 2.5 * h);
    const elevation = glazingElevationParts(text, segments, { left: w.from, right: w.to, top: v.from, bottom: v.to }, ppf, legend);
    return [{ ...reference, size: { kind: "frame" as const, width: w.feet, height: v.feet,
      widthLabel: w.label, heightLabel: v.label, ...(sill ? { sill } : {}), ...(elevation ? { elevation } : {}) } }];
  });
}

const tagKey = (tag: string) => tag.trim().toUpperCase().replace(/^(SF|CW|W)(?=\d)/, "$1-");

/** A plan type opens the original elevation when the drawing set has one unambiguous title. */
export function glazingDetailSource(tag: string, refs: GlazingDetailReference[]): DimensionSource | undefined {
  const hits = refs.filter(ref => tagKey(ref.tag) === tagKey(tag) && ref.size?.kind !== "rough-opening");
  const first = hits[0]?.source;
  return first && hits.every(({ source }) => source.documentId === first.documentId && source.page === first.page && source.quote === first.quote) ? first : undefined;
}

export function glazingSizeForTag(tag: string, refs: GlazingDetailReference[]): GlazingDimensions | undefined {
  const hits = refs.flatMap(ref => tagKey(ref.tag) === tagKey(tag) && ref.size ? [{ ...ref.size, source: ref.source }] : []);
  const frames = hits.filter(hit => hit.kind === "frame");
  const sizes = frames.length ? frames : hits;
  const first = sizes[0];
  if (!first || sizes.some(size => Math.abs(first.width - size.width) > .25 / 12 ||
    Math.abs(first.height - size.height) > .25 / 12 || first.sill?.feet !== size.sill?.feet)) return undefined;
  const source = first.kind === "frame" ? glazingDetailSource(tag, refs) : undefined;
  return source ? first : { ...first, elevation: undefined };
}

export const GLASS_HEIGHT = 10;
type PlanGlazing = { a: Point; b: Point; dimensions?: GlazingDimensions };
type GlazingLevel = Pick<SchematicLevel, "height" | "sizing">;

export function glazingPlacement(run: PlanGlazing, level: GlazingLevel) {
  const d = run.dimensions, sill = d?.sill?.feet ?? 0;
  const width = Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]);
  const scaled = /^Printed scale, [\d.]+ ft per inch$/.test(level.sizing);
  if (scaled && d?.kind === "frame" && Math.abs(width - d.width) <= 2 / 12 && sill + d.height <= level.height + .25 / 12) {
    return { base: sill, height: d.height, dimensioned: true };
  }
  return { base: 0, height: Math.min(level.height, GLASS_HEIGHT), dimensioned: false };
}


/** A symmetric elevation can face either direction along its plan run. Keep its measured part sizes. */
export function placedGlazingElevation(run: PlanGlazing, level: GlazingLevel): GlazingElevation | undefined {
  const elevation = run.dimensions?.elevation;
  return elevation?.symmetric && elevation.parts.length && glazingPlacement(run, level).dimensioned ? elevation : undefined;
}
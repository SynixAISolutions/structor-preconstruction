import type { DrawingTextRun } from "./drawing-dimensions";
import type { Segment } from "./plan-vectors";

export type GlazingFrameKind = "Jamb" | "Head" | "Sill" | "Mullion" | "Rail";
type Face = { x: number; y: number; width: number; height: number };
export type GlazingPart = Face & (
  { kind: "Pane"; mark: string; description?: string } | { kind: GlazingFrameKind }
);
export type GlazingElevation = { width: number; height: number; parts: GlazingPart[]; symmetric: boolean };

type Rect = { left: number; top: number; right: number; bottom: number };
type Run = { at: number; start: number; end: number };
type Axis = 0 | 1;

const TOL = .18; // PDF points. Join drawing fragments without merging separate frame edges.
const other = (axis: Axis): Axis => axis === 0 ? 1 : 0;
const area = (box: Rect) => (box.right - box.left) * (box.bottom - box.top);
const encloses = (a: Rect, b: Rect) => a.left <= b.left + TOL && a.right >= b.right - TOL
  && a.top <= b.top + TOL && a.bottom >= b.bottom - TOL;
const sameRect = (a: Rect, b: Rect) => encloses(a, b) && encloses(b, a);
const interiorsOverlap = (a: Rect, b: Rect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOL
  && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOL;

function drawnRuns(segments: Segment[], box: Rect, axis: Axis): Run[] {
  const min = axis === 0 ? box.left : box.top, max = axis === 0 ? box.right : box.bottom;
  const along = other(axis);
  const pieces = segments.flatMap(({ a, b }) => {
    const at = (a[axis] + b[axis]) / 2;
    if (at < min - TOL || at > max + TOL || Math.abs(a[axis] - b[axis]) > .09) return [];
    return [{ at, start: Math.min(a[along], b[along]), end: Math.max(a[along], b[along]) }];
  }).filter(piece => piece.end - piece.start > 1).sort((a, b) => a.at - b.at);
  const bands: Run[][] = [];
  for (const piece of pieces) {
    const band = bands.at(-1);
    if (band && piece.at - band[0].at <= TOL) band.push(piece);
    else bands.push([piece]);
  }
  return bands.flatMap(band => {
    band.sort((a, b) => a.start - b.start);
    const longest = band.reduce((a, b) => a.end - a.start >= b.end - b.start ? a : b);
    const runs: Run[] = [{ ...band[0], at: longest.at }];
    for (const segment of band.slice(1)) {
      const last = runs[runs.length - 1];
      if (segment.start <= last.end + TOL) last.end = Math.max(last.end, segment.end);
      else runs.push({ ...segment, at: longest.at });
    }
    return runs;
  });
}

const covers = (run: Run, start: number, end: number) => run.start <= start + TOL && run.end >= end - TOL;

function paneBoundary(mark: DrawingTextRun, box: Rect, vertical: Run[], horizontal: Run[]): Rect | null {
  const leftOfText = mark.a[0], rightOfText = mark.b[0], baseline = mark.a[1];
  const atX = (leftOfText + rightOfText) / 2, atY = baseline - mark.height * .55;
  const sideways = vertical.filter(run => covers(run, atY, atY));
  const across = horizontal.filter(run => covers(run, atX, atX));
  const ls = sideways.filter(run => run.at > box.left + TOL && run.at <= leftOfText + TOL).reverse().slice(0, 6);
  const rs = sideways.filter(run => run.at < box.right - TOL && run.at >= rightOfText - TOL).slice(0, 6);
  const ts = across.filter(run => run.at > box.top + TOL && run.at <= atY).reverse().slice(0, 6);
  const bs = across.filter(run => run.at < box.bottom - TOL && run.at >= baseline - TOL).slice(0, 6);
  const candidates: Rect[] = [];
  for (const l of ls) for (const r of rs) for (const t of ts) for (const b of bs) {
    if (!covers(t, l.at, r.at) || !covers(b, l.at, r.at) || !covers(l, t.at, b.at) || !covers(r, t.at, b.at)) continue;
    candidates.push({ left: l.at, right: r.at, top: t.at, bottom: b.at });
  }
  candidates.sort((a, b) => area(a) - area(b));
  const smallest = candidates[0];
  return smallest && candidates.every(candidate => encloses(candidate, smallest)) ? smallest : null;
}

const MARK = /^[A-Z][A-Z0-9]{0,5}(?:[-.][A-Z0-9]{1,9})?$/;
const COMMON_GLASS_MARK = /^(?:IG|GL)[-.][A-Z0-9]{1,9}$/;

/** A mark is defined by the printed legend on this sheet. Unlisted marks can still identify a pane without a glass specification. */
export function glazingLegend(text: DrawingTextRun[]): Map<string, string> {
  const legend = new Map<string, string>(), conflicts = new Set<string>();
  for (const title of text.filter(run => /^(?:GLAZING|GLASS) (?:LEGEND|SCHEDULE)$/i.test(run.text))) {
    const [x, y] = title.a, h = title.height;
    const nearHeader = (item: DrawingTextRun) => item.a[1] > y && item.a[1] < y + 3 * h &&
      item.a[0] >= x - 6 * h && item.a[0] <= title.b[0] + 5 * h;
    const mark = text.find(run => run.text === "MARK" && nearHeader(run));
    const type = text.find(run => /^(?:GLASS )?(?:TYPE|DESCRIPTION)$/.test(run.text) && nearHeader(run));
    if (!mark || !type || Math.abs(mark.a[1] - type.a[1]) > h * .42 || mark.a[0] >= type.a[0]) continue;
    const nextTitle = text.filter(run => /(?:GENERAL NOTES|ELEVATION|SCHEDULE|LEGEND)$/i.test(run.text) &&
      run.a[1] > type.a[1] && run.a[0] >= mark.a[0] - 8 * h && run.a[0] <= title.b[0] + h)
      .reduce((top, run) => Math.min(top, run.a[1]), type.a[1] + 30 * h);
    const rows = text.filter(run => MARK.test(run.text) && run.a[0] >= mark.a[0] - 2 * h &&
      run.b[0] <= type.a[0] - TOL && run.a[1] > mark.a[1] && run.a[1] < nextTitle);
    rows.sort((a, b) => a.a[1] - b.a[1]);
    for (const [index, row] of rows.entries()) {
      const start = row.a[1], end = rows[index + 1]?.a[1] ?? nextTitle;
      const words = text.filter(run => run.a[0] >= type.a[0] - h && run.a[0] < type.a[0] + 1.5 * h &&
        run.a[1] >= start - row.height * .35 && run.a[1] < end - row.height * .35)
        .sort((a, b) => a.a[1] - b.a[1] || a.a[0] - b.a[0]).map(run => run.text);
      const description = words.join(" ");
      if (!/\b(?:GLASS|GLAZING|LAMINAT\w*|FLOAT|TEMPERED)\b/i.test(description)) continue;
      if (legend.has(row.text) && legend.get(row.text) !== description) conflicts.add(row.text);
      else legend.set(row.text, description);
    }
  }
  for (const mark of conflicts) legend.delete(mark);
  return legend;
}

function measuredFrame(panes: Rect[], box: Rect, vertical: Run[], horizontal: Run[], ppf: number) {
  const out: { kind: GlazingFrameKind; rect: Rect }[] = [];
  const narrow = (gap: number) => gap >= ppf * .75 / 12 && gap <= ppf * 8 / 12;
  const add = (kind: GlazingFrameKind, rect: Rect) => {
    if (!out.some(piece => piece.kind === kind && sameRect(piece.rect, rect))) out.push({ kind, rect });
  };
  const hasEdge = (runs: Run[], at: number, from: number, to: number) =>
    runs.some(run => Math.abs(run.at - at) <= TOL * 2 && covers(run, from, to));
  for (const r of panes) {
    if (narrow(r.left - box.left) && hasEdge(vertical, box.left, r.top, r.bottom)) add("Jamb", { ...r, left: box.left, right: r.left });
    if (narrow(box.right - r.right) && hasEdge(vertical, box.right, r.top, r.bottom)) add("Jamb", { ...r, left: r.right, right: box.right });
    if (narrow(r.top - box.top) && hasEdge(horizontal, box.top, r.left, r.right)) add("Head", { ...r, top: box.top, bottom: r.top });
    if (narrow(box.bottom - r.bottom) && hasEdge(horizontal, box.bottom, r.left, r.right)) add("Sill", { ...r, top: r.bottom, bottom: box.bottom });
    for (const neighbour of panes) {
      const top = Math.max(r.top, neighbour.top), bottom = Math.min(r.bottom, neighbour.bottom);
      if (narrow(neighbour.left - r.right) && bottom - top > ppf * .25) add("Mullion", { left: r.right, right: neighbour.left, top, bottom });
      const left = Math.max(r.left, neighbour.left), right = Math.min(r.right, neighbour.right);
      if (narrow(neighbour.top - r.bottom) && right - left > ppf * .25) add("Rail", { left, right, top: r.bottom, bottom: neighbour.top });
    }
  }
  return out;
}

/** Verify what is visible in elevation. Depth and frame material require section/detail evidence. */
export function glazingElevationParts(text: DrawingTextRun[], segments: Segment[], box: Rect, ppf: number, legend: Map<string, string>): GlazingElevation | undefined {
  const labels = text.filter(run => (legend.has(run.text) || COMMON_GLASS_MARK.test(run.text))
    && run.a[0] > box.left && run.b[0] < box.right && run.b[0] > run.a[0]
    && run.a[1] > box.top && run.a[1] < box.bottom && Math.abs(run.a[1] - run.b[1]) <= TOL);
  if (!labels.length || labels.length > 160) return undefined;
  const vertical = drawnRuns(segments, box, 0), horizontal = drawnRuns(segments, box, 1);
  const panes = labels.flatMap(label => {
    const rect = paneBoundary(label, box, vertical, horizontal);
    return rect ? [{ rect, mark: label.text }] : [];
  });
  const unique = panes.filter((pane, i) =>
    !panes.some(other => sameRect(other.rect, pane.rect) ? other.mark !== pane.mark : interiorsOverlap(other.rect, pane.rect))
    && panes.findIndex(other => sameRect(other.rect, pane.rect)) === i)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  if (!unique.length) return undefined;
  const toFace = (r: Rect): Face => ({
    x: (r.left - box.left) / ppf, y: (box.bottom - r.bottom) / ppf,
    width: (r.right - r.left) / ppf, height: (r.bottom - r.top) / ppf,
  });
  const parts: GlazingPart[] = unique.map(({ rect, mark }) => ({
    ...toFace(rect), kind: "Pane", mark, ...(legend.has(mark) ? { description: legend.get(mark) } : {}),
  }));
  parts.push(...measuredFrame(unique.map(pane => pane.rect), box, vertical, horizontal, ppf).map(({ rect, kind }) => ({ ...toFace(rect), kind })));
  const width = (box.right - box.left) / ppf, height = (box.bottom - box.top) / ppf;
  return { width, height, parts, symmetric: symmetricGlazingParts(parts, width) };
}

/** If neither end of the plan run is identified, only use parts whose placement is invariant under reflection. */
export function symmetricGlazingParts(parts: GlazingPart[], width: number): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= .125 / 12;
  return parts.every(part => parts.some(other => other.kind === part.kind
    && (part.kind !== "Pane" || other.kind === "Pane" && part.mark === other.mark)
    && near(width - (part.x + part.width), other.x)
    && near(part.y, other.y) && near(part.width, other.width) && near(part.height, other.height)));
}

import type { DrawingTextRun } from "./drawing-dimensions";
import type { Point, Segment } from "./plan-vectors";

type Axis = 0 | 1;
type MatchLine = { axis: Axis; at: number; from: number; to: number; mark: string };
type Stroke = { a: Point; d: Point };
export type PlanRegistration = { lines: MatchLine[]; strokes: Stroke[] };

const alongAxis = (axis: Axis): Axis => axis === 0 ? 1 : 0;
const middle = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const length = ([x, y]: Point) => Math.hypot(x, y);
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function drawnMatchLine(segments: Segment[], text: DrawingTextRun, mark: string): MatchLine | null {
  const run = sub(text.b, text.a);
  const axis: Axis = Math.abs(run[0]) < Math.abs(run[1]) ? 0 : 1;
  const along = alongAxis(axis), label = middle(text.a, text.b);
  if (Math.abs(run[axis]) > 0.1 * Math.abs(run[along])) return null;
  const dashes = segments.flatMap(segment => {
    const { a, b, width } = segment, at = (a[axis] + b[axis]) / 2, span = Math.abs(a[along] - b[along]);
    if (width < .45 || Math.abs(a[axis] - b[axis]) > .18 || Math.abs(at - label[axis]) > 24 || span < 8 || span > 80) return [];
    return [{ at, from: Math.min(a[along], b[along]), to: Math.max(a[along], b[along]) }];
  });
  const rows = Map.groupBy(dashes, dash => Math.round(dash.at * 4));
  const candidates = [...rows.values()].flatMap(row => {
    const spans = [...new Map(row.map(dash => [Math.round(dash.from * 4), dash])).values()].sort((a, b) => a.from - b.from);
    const runs: typeof spans[] = [];
    for (const dash of spans) {
      const previous = runs.at(-1), last = previous?.at(-1);
      if (previous && last && dash.from - last.to <= 27) previous.push(dash);
      else runs.push([dash]);
    }
    return runs.flatMap(run => {
      const from = run[0].from, to = run.at(-1)!.to;
      if (run.length < 5 || to - from < 170 || label[along] < from - 35 || label[along] > to + 35) return [];
      return [{ axis, at: median(run.map(d => d.at)), from, to, mark }];
    });
  }).sort((a, b) => (b.to - b.from) - (a.to - a.from));
  return candidates[0] ?? null;
}

/** Locate drawn, labeled matchlines and keep nearby vector geometry in scaled feet. */
export function planRegistration(segments: Segment[], text: DrawingTextRun[], feetPerInch: number): PlanRegistration {
  const scale = feetPerInch / 72, lines: MatchLine[] = [];
  for (const item of text) {
    const mark = /^MATCH\s*LINE(?:\s+([A-Z0-9]+))?$/i.exec(item.text);
    if (!mark) continue;
    const line = drawnMatchLine(segments, item, mark[1]?.toUpperCase() ?? "");
    if (!line) continue;
    const scaled = { ...line, at: line.at * scale, from: line.from * scale, to: line.to * scale };
    if (!lines.some(other => other.axis === scaled.axis && Math.abs(other.at - scaled.at) < .25)) lines.push(scaled);
  }
  const strokes = new Map<string, Stroke>();
  const toFeet = ([x, y]: Point): Point => [x * scale, y * scale];
  for (const segment of segments) {
    const p = toFeet(segment.a), q = toFeet(segment.b), delta = sub(q, p), center = middle(p, q);
    const size = length(delta);
    if (size < 2.5 || size > 100) continue;
    if (!lines.some(({ axis, at, from, to }) => {
      const along = center[alongAxis(axis)], across = Math.abs(center[axis] - at);
      return across <= 18 && along >= from && along <= to && (across > .08 || Math.abs(delta[axis]) > .08);
    })) continue;
    const dominant: Axis = Math.abs(delta[0]) >= Math.abs(delta[1]) ? 0 : 1;
    const [a, b] = delta[dominant] > 0 ? [p, q] : [q, p];
    const d = sub(b, a), key = [...a, ...d].map(value => Math.round(value * 36)).join(",");
    strokes.set(key, { a, d });
  }
  return { lines, strokes: [...strokes.values()] };
}

export type PlanJoin = { offset: Point; anchor: MatchLine; incoming: MatchLine; matches: number };
const SIZE_BIN = .06;
const OFFSET_BIN = .14;
const FIT_TOLERANCE = .09;

type Vote = { offset: Point; a: Stroke; b: Stroke };

function comparableLine(a: MatchLine, b: MatchLine) {
  return a.axis === b.axis && (!a.mark || !b.mark || a.mark === b.mark);
}

/** Two parts must agree on the matchline and on positions of several independent strokes. */
export function alignPlanDrawings(anchor: PlanRegistration, incoming: PlanRegistration): PlanJoin | null {
  const pairs = anchor.lines.flatMap(a => incoming.lines.filter(b => comparableLine(a, b)).map(b => ({ a, b })));
  if (!pairs.length) return null;
  const strokes = Map.groupBy(anchor.strokes, ({ d }) => shapeKey(d));
  const bins = new Map<string, Vote[]>();
  const binKey = ([x, y]: Point) => [Math.round(x / OFFSET_BIN), Math.round(y / OFFSET_BIN)].join(",");
  for (const b of incoming.strokes) {
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
      const key = shapeKey([b.d[0] + x * SIZE_BIN, b.d[1] + y * SIZE_BIN]);
      for (const a of strokes.get(key) ?? []) {
        if (length(sub(a.d, b.d)) > SIZE_BIN) continue;
        const offset = sub(a.a, b.a);
        if (!pairs.some(pair => Math.abs(pair.a.at - pair.b.at - offset[pair.a.axis]) <= .21)) continue;
        const bin = binKey(offset);
        const list = bins.get(bin);
        if (list) list.push({ offset, a, b });
        else bins.set(bin, [{ offset, a, b }]);
      }
    }
  }

  const candidates: PlanJoin[] = [];
  for (const [bin, seeds] of [...bins].sort((a, b) => b[1].length - a[1].length).slice(0, 16)) {
    if (seeds.length < 4) break;
    const [bx, by] = bin.split(",").map(Number);
    const center: Point = [median(seeds.map(vote => vote.offset[0])), median(seeds.map(vote => vote.offset[1]))];
    if (candidates.some(candidate => length(sub(candidate.offset, center)) < 2 * FIT_TOLERANCE)) continue;
    const match = pairs.find(({ a, b }) => Math.abs(a.at - b.at - center[a.axis]) <= .21);
    if (!match) continue;
    const near = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
      near.push(...(bins.get([bx + x, by + y].join(",")) ?? []));
    }
    const takenA = new Set<Stroke>(), takenB = new Set<Stroke>();
    const coherent = near.filter(vote => length(sub(vote.offset, center)) <= FIT_TOLERANCE).sort((a, b) => length(sub(a.offset, center)) - length(sub(b.offset, center)));
    const votes = coherent.filter(vote => {
      if (takenA.has(vote.a) || takenB.has(vote.b)) return false;
      takenA.add(vote.a); takenB.add(vote.b); return true;
    });
    if (votes.length < 10) continue;
    const cross = votes.filter(({ a }) => Math.abs(a.d[match.a.axis]) > Math.abs(a.d[alongAxis(match.a.axis)]) / 2);
    const along = votes.map(({ a }) => a.a[alongAxis(match.a.axis)]);
    if (cross.length < 2 || votes.length - cross.length < 2 || Math.max(...along) - Math.min(...along) < 8) continue;
    const offset: Point = [median(votes.map(vote => vote.offset[0])), median(votes.map(vote => vote.offset[1]))];
    candidates.push({ offset, anchor: match.a, incoming: match.b, matches: votes.length });
  }
  candidates.sort((a, b) => b.matches - a.matches);
  const [best, other] = candidates;
  return best && (!other || best.matches >= other.matches * 1.5) ? best : null;
}

function shapeKey([x, y]: Point): string {
  return [Math.round(x / SIZE_BIN), Math.round(y / SIZE_BIN)].join(",");
}

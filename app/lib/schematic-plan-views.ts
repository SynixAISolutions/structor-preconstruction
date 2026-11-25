import type { DrawingTextRun } from "./drawing-dimensions";
import { printedPlanLevels } from "./floor-plan-label";
import type { Point, Segment } from "./plan-vectors";
import { feetPerInch } from "./schematic-model";

/** Coordinates are fractions of the original PDF page, in its displayed orientation. */
export type PlanBox = [number, number, number, number];
export type PlanView = { title: string; levels: number[]; box: PlanBox; scale: number | null };

const left = (line: Segment) => Math.min(line.a[0], line.b[0]);
const right = (line: Segment) => Math.max(line.a[0], line.b[0]);

/**
 * Locate individual plan views by the drawn caption rules under them. This handles a row of
 * side-by-side views, including one typical plan covering several levels. Leave ambiguous
 * layouts unread rather than estimating which of their linework belongs to a level.
 */
export function separatedPlanViews(page: { width: number; height: number }, text: DrawingTextRun[], lines: Segment[]): PlanView[] {
  const horizontal = lines.filter(line => Math.abs(line.a[1] - line.b[1]) < .4 && right(line) - left(line) >= page.width * .12);
  const captions = text.flatMap(run => {
    if (/[&,/]|\bAND\b/i.test(run.text) || Math.abs(run.a[1] - run.b[1]) > 1) return [];
    const levels = printedPlanLevels(run.text);
    if (!levels.length) return [];
    const rule = horizontal.find(line => {
      const dx = run.a[0] - left(line), dy = line.a[1] - run.a[1];
      return dx >= -.25 * run.height && dx <= 1.5 * run.height &&
        dy >= -1 && dy <= .8 * run.height && right(line) >= run.b[0];
    });
    if (!rule) return [];
    const scales = new Set(text.flatMap(item => {
      const dy = item.a[1] - run.a[1];
      if (dy <= 0 || dy > 2.5 * run.height || Math.abs(item.a[0] - run.a[0]) > 1.8 * run.height) return [];
      const scale = feetPerInch(item.text);
      return scale ? [scale] : [];
    }));
    return [{ title: run.text, levels, rule, height: run.height, scale: scales.size === 1 ? [...scales][0] : null }];
  }).sort((a, b) => left(a.rule) - left(b.rule));

  if (!captions.length || captions.length > 6) return [];
  if (captions.some((caption, i) => i > 0 && (left(caption.rule) <= right(captions[i - 1].rule) ||
    Math.abs(caption.rule.a[1] - captions[i - 1].rule.a[1]) > .07 * page.height))) return [];
  if (new Set(captions.flatMap(caption => caption.levels)).size !== captions.reduce((sum, view) => sum + view.levels.length, 0)) return [];

  return captions.map(({ title, levels, rule, height, scale }, i) => {
    const previous = captions[i - 1], next = captions[i + 1];
    const startX = previous ? (right(previous.rule) + left(rule)) / 2 : 0;
    const endX = next ? (right(rule) + left(next.rule)) / 2 : page.width;
    const endY = Math.min(page.height, rule.a[1] + 2.5 * height);
    return { title, levels, scale, box: [startX / page.width, 0, (endX - startX) / page.width, endY / page.height] };
  });
}

export function pointOnPlanSheet([x, y]: Point, [left, top, width, height]: PlanBox): Point {
  return [left + x * width, top + y * height];
}

export function containsPlanPoint([x, y]: Point, [left, top, width, height]: PlanBox) {
  return x >= left && y >= top && x <= left + width && y <= top + height;
}

export function clipPlanBox([x, y, w, h]: PlanBox, [left, top, width, height]: PlanBox): PlanBox | null {
  const startX = Math.max(x, left), startY = Math.max(y, top);
  const endX = Math.min(x + w, left + width), endY = Math.min(y + h, top + height);
  return endX > startX && endY > startY ? [startX, startY, endX - startX, endY - startY] : null;
}

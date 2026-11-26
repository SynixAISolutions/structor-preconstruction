import { inside } from "./room-detection";
import type { Point } from "./plan-vectors";

type Run = { a: Point; b: Point; type?: string | null; thickness?: number; excluded?: boolean; outsidePlan?: boolean };

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

// Counts from the architect's own schedules (ideas 20 Oct, #10 "schedule-driven takeoff"): the door
// schedule read row by row, so the estimate's door, frame and hardware quantities have a basis on the
// sheet. Many sheets have no text layer, so the client reads the schedule in tiles (lib/project-files-
// client renderStoredTiles) and the AI lists the rows it can read in each ("schedule-rows" job).
// Overlapping tiles read some rows twice: rows merge by door number, and each field keeps the value
// most readings agree on. Pure.

export type ScheduleRow = { mark: string; width: string; height: string; material: string; frameMaterial: string; hardwareSet: string };
export type MergedRow = ScheduleRow & { reads: number; disagreements: (keyof ScheduleRow)[] };
const FIELDS: (keyof ScheduleRow)[] = ["width", "height", "material", "frameMaterial", "hardwareSet"];
const norm = (v: string) => v.toUpperCase().replace(/\s+/g, " ").replace(/[“”]/g, "\"").replace(/[‘’]/g, "'").trim();

/** One row per door number, in schedule order; a field read differently by different tiles keeps the commonest value and is listed. */
export function mergeScheduleRows(readings: ScheduleRow[][]): MergedRow[] {
  const byMark = new Map<string, ScheduleRow[]>();
  for (const reading of readings) for (const row of reading) {
    const mark = norm(row.mark);
    if (!mark) continue;
    byMark.set(mark, [...(byMark.get(mark) ?? []), row]);
  }
  const merged = [...byMark].map(([mark, rows]) => {
    const pick = (field: keyof ScheduleRow) => {
      const counts = new Map<string, number>();
      for (const r of rows) { const v = norm(r[field] ?? ""); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
      const ranked = [...counts].sort((a, b) => b[1] - a[1]);
      return { value: ranked[0]?.[0] ?? "", split: ranked.length > 1 };
    };
    const fields = Object.fromEntries(FIELDS.map(f => [f, pick(f)])) as Record<keyof ScheduleRow, { value: string; split: boolean }>;
    return { mark, ...Object.fromEntries(FIELDS.map(f => [f, fields[f].value])), reads: rows.length, disagreements: FIELDS.filter(f => fields[f].split) } as MergedRow;
  });
  return merged.sort((a, b) => a.mark.localeCompare(b.mark, "en", { numeric: true }));
}

/** How many doors per value of a field ("HM" → 31), most first; blanks counted as "(not read)". */
export function scheduleCounts(rows: ScheduleRow[], field: keyof ScheduleRow): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) { const v = norm(r[field] ?? "") || "(not read)"; counts.set(v, (counts.get(v) ?? 0) + 1); }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

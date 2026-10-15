import { parseFeetInches, type BaseBreakdownRow, type ModelObject, type WallFinishRecord } from "../../lib/model";

// Presentation colors approximate the scheduled finishes; no color assigns a finish to an unnoted face.
export const wallFinishColors: Record<string, string> = { "PT-02": "#cfb79d", "PT-03": "#94b645", "WT-01": "#b9a998", "WB-02": "#c9b39b", "WB-03": "#94ad52", "FRP-01": "#eee9dc", "SAW-01": "#bfc998" };
export type FinishDisplay = { wallId: string; recordId: string; tag: string; kind: "band" | "run" | "base"; x: number; z: number; rotation: number; length: number; bottom: number; height: number; wallBase: number; wallHeight: number };

/** Place only documented full runs. Width/height alone never supplies a panel's missing offset. */
export function wallFinishDisplay(objects: ModelObject[], records: WallFinishRecord[], bases: BaseBreakdownRow[]): FinishDisplay[] {
  const result: FinishDisplay[] = [];
  const accentIds = new Set(bases.flatMap(row => row.accents.map(accent => accent.recordId)));
  for (const record of records) {
    if (record.status !== "assigned" || !record.extent) continue;
    for (const face of record.sides) {
      const wall = objects.find(object => object.id === face.wallId);
      if (!wall || wall.kind !== "wall") continue;
      const [a, b] = wall.points, dx = b[0] - a[0], dz = b[1] - a[1], wallLength = Math.hypot(dx, dz);
      if (!wallLength) continue;
      const project = (point: [number, number]) => ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / wallLength;
      const ends = record.extent.map(project), lo = Math.max(0, Math.min(...ends)), hi = Math.min(wallLength, Math.max(...ends));
      if (hi <= lo) continue;
      const direction = face.side === "left" ? 1 : -1, offset = (wall.thickness / 2 + .035) * direction;
      const placement = { wallId: wall.id, recordId: record.id, x: a[0] + dx / wallLength * (lo + hi) / 2 - dz / wallLength * offset, z: a[1] + dz / wallLength * (lo + hi) / 2 + dx / wallLength * offset, rotation: -Math.atan2(dz, dx) + (direction === 1 ? 0 : Math.PI), length: hi - lo, wallBase: wall.base, wallHeight: wall.height };
      for (const band of record.bands) {
        // Combined tile courses and partial panels have no supported per-product placement.
        if (!band.fullRun || band.tags.length !== 1) continue;
        const tag = band.tags[0];
        if (band.heightFt === null) result.push({ ...placement, tag, kind: "run", bottom: wall.base + .75, height: 0 });
        else {
          const from = band.from === null ? null : parseFeetInches(band.from);
          if (from !== null) result.push({ ...placement, tag, kind: "band", bottom: wall.base + from, height: band.heightFt });
        }
      }
      if (accentIds.has(record.id) && record.base?.tag && record.base.fullRun) {
        // WB-02/WB-03 are scheduled 4-inch base. Conflicting gym/tile notes never replace the floor base.
        result.push({ ...placement, tag: record.base.tag, kind: "base", bottom: wall.base, height: 4 / 12 });
      }
    }
  }
  return result;
}

/** Cutaway crops a finish; it never compresses a 7-foot tile band into a 5-foot wall. */
export function displayedFinishHeight(item: FinishDisplay, cutaway: boolean): number {
  return Math.max(0, Math.min(item.height, item.wallBase + (cutaway ? Math.min(5, item.wallHeight) : item.wallHeight) - item.bottom));
}

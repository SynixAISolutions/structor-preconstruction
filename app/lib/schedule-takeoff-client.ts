"use client";

// Reads a project's door schedule in the browser (lib/schedule-takeoff): the sheet in tiles, the AI's
// rows per tile, merged by door number.

import { aiJob } from "./ai-more-client";
import { drawingRegister, type StoredDocument } from "./project-files";
import { renderStoredTiles } from "./project-files-client";
import { mergeScheduleRows, type MergedRow, type ScheduleRow } from "./schedule-takeoff";

/** The sheet that carries the door schedule: the first one titled so. */
export const doorScheduleSheet = (documents: StoredDocument[]) => drawingRegister(documents).find(r => /DOOR.*SCHEDULE|SCHEDULE.*DOOR/i.test(r.title)) ?? null;

/** About one AI image request per tile, at most 3 at a time; `cols` × `rows` tiles (denser tables read better with more). */
export async function readDoorSchedule(doc: StoredDocument, page: number, sheet: string, title: string, options: { cols?: number; rows?: number; signal?: AbortSignal } = {}): Promise<{ rows: MergedRow[]; tiles: number; failed: number }> {
  // ponytail: the default 6% overlap; a wider one lowered the resolution and the hardware-set reads (19 Oct, A8.2: 45/50 → 25/48).
  const tiles = await renderStoredTiles(doc, page, options.cols ?? 3, options.rows ?? 2, 2000);
  const readings: ScheduleRow[][] = [];
  let failed = 0;
  for (let i = 0; i < tiles.length; i += 3) {
    const batch = await Promise.allSettled(tiles.slice(i, i + 3).map(t => aiJob<{ rows: ScheduleRow[] }>("schedule-rows", { sheet, title, image: t.image }, options.signal)));
    for (const r of batch) r.status === "fulfilled" ? readings.push(r.value.rows) : failed++;
  }
  options.signal?.throwIfAborted();
  if (failed === tiles.length) throw new Error(`The schedule on ${sheet} could not be read.`);
  // ponytail: no filter on marks that look like sheet numbers; Jelleff has doors S102 and S202.
  return { rows: mergeScheduleRows(readings), tiles: tiles.length, failed };
}

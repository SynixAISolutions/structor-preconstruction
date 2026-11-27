import { drawingLengthFeet } from "./drawing-dimensions";
import type { RegisterRow } from "./project-files";
import type { SchematicDoor } from "./schematic-model";
import type { DimensionSource } from "./section-datums";
import type { TextBox } from "./text-anchor";

type DoorSize = { number: string; width: number; height: number };
export type SourcedDoorSize = DoorSize & { source: DimensionSource };

export function doorScheduleSheets<T extends Pick<RegisterRow, "title" | "discipline">>(register: T[]): T[] {
  return register.filter(row => row.discipline === "Architectural" && /\bDOOR(?:\s*(?:&|AND)\s*FRAME)?\s+SCHEDULES?\b/i.test(row.title));
}

export const doorNumber = (value: string) => value.trim().toUpperCase();

const text = (box: TextBox) => box.str.trim().toUpperCase().replace(/\s+/g, " ");
const numberHeader = /^(?:DOOR\s+)?(?:NUMBER|NO\.?|MARK)$/;
const doorMark = /^[A-Z0-9](?:[A-Z0-9.-]{0,14}[A-Z0-9])?$/;
const yMiddle = (box: TextBox) => box.y + box.h / 2;
const sameRow = (a: TextBox, b: TextBox) => Math.abs(yMiddle(a) - yMiddle(b)) < Math.max(a.h, b.h) * .55;

/**
 * Read schedules with separate mark, width and height columns. Prefer the printed Total/Overall
 * columns in schedules that also show individual leaf widths. Do not guess missing dimensions.
 */
export function printedDoorSizes(boxes: TextBox[]): DoorSize[] {
  const headers = boxes.filter(box => numberHeader.test(text(box)));
  const sizeHeader = boxes.filter(box => /^(?:(?:TOTAL|OVERALL) )?(?:WIDTH|HEIGHT)$/.test(text(box)));
  const totalHeaders = boxes.filter(box => /^(?:TOTAL|OVERALL)$/.test(text(box)));
  const marks = boxes.filter(box => doorMark.test(text(box)) && /\d/.test(text(box)) && drawingLengthFeet(box.str) === null);
  const dimensions = boxes.flatMap(box => {
    const feet = drawingLengthFeet(box.str);
    return feet !== null && feet >= 1.5 && feet <= 30 ? [{ box, feet }] : [];
  });

  return headers.flatMap(mark => {
    const nextTable = headers.filter(other => other.x > mark.x + mark.w && sameRow(mark, other)).sort((a, b) => a.x - b.x)[0];
    const widths = sizeHeader.filter(col => /WIDTH$/.test(text(col)) && col.x > mark.x + mark.w && col.x < (nextTable?.x ?? 1) && sameRow(col, mark));
    const heights = sizeHeader.filter(col => /HEIGHT$/.test(text(col)) && widths.some(width => col.x > width.x && col.x - width.x < Math.max(.07, width.w * 3)) && sameRow(col, mark));
    // In a split-panel schedule the total width and total height are under one shared heading.
    const pairs = widths.flatMap(width => {
      const height = heights.filter(col => col.x > width.x).sort((a, b) => a.x - b.x)[0];
      if (!height || height.x - width.x > .09) return [];
      const total = /^(?:TOTAL|OVERALL) /.test(text(width)) || totalHeaders.some(top => {
        const above = yMiddle(width) - yMiddle(top);
        return above > 0 && above < Math.max(top.h, width.h) * 5 && top.x + top.w >= width.x && top.x <= height.x + height.w / 2;
      });
      return [{ width, height, total }];
    });
    const preferred = pairs.filter(pair => pair.total);
    const columns = preferred.length === 1 ? preferred[0] : preferred.length === 0 && pairs.length === 1 && heights.length === 1 ? pairs[0] : null;
    if (!columns) return [];

    const gap = columns.height.x - columns.width.x;
    const inColumn = (box: TextBox, column: TextBox) => Math.abs(box.x + box.w / 2 - (column.x + column.w * .2)) < gap * .53;
    const cells = marks.filter(box => yMiddle(box) > mark.y + mark.h && box.x > mark.x - mark.w && box.x < mark.x + mark.w * .57);
    return cells.flatMap(cell => {
      // Some tables print a room number immediately after the door mark. Only use the left entry.
      if (cells.some(other => other.x < cell.x - .001 && sameRow(other, cell))) return [];
      const row = dimensions.filter(d => sameRow(d.box, cell));
      const wide = row.filter(d => inColumn(d.box, columns.width));
      const high = row.filter(d => inColumn(d.box, columns.height));
      if (wide.length !== 1 || high.length !== 1 || wide[0] === high[0] || high[0].feet < 4 || high[0].feet > 20) return [];
      return [{ number: text(cell), width: wide[0].feet, height: high[0].feet }];
    });
  });
}

/** Apply a size only when the door ID and vector opening width agree, and every schedule row agrees. */
export function matchDoorSizes(doors: SchematicDoor[], sizes: SourcedDoorSize[], uniqueMarks?: Set<string>): { doors: SchematicDoor[]; conflicts: string[] } {
  const byNumber = Map.groupBy(sizes, size => size.number);
  const conflicts = new Set<string>();
  const matched = doors.map(door => {
    if (door.kind !== "door" || door.excluded || !door.number) return door;
    const number = doorNumber(door.number), rows = byNumber.get(number);
    if (!rows?.length) return door;
    const size = rows[0];
    if ((uniqueMarks && !uniqueMarks.has(number))
        || rows.some(row => Math.abs(row.width - size.width) > .25 / 12 || Math.abs(row.height - size.height) > .25 / 12)
        || Math.abs(door.width - size.width) > .15) {
      conflicts.add(number);
      return door;
    }
    return { ...door, scheduledSize: size };
  });
  return { doors: matched, conflicts: [...conflicts] };
}

import { parseInches } from "./wall-assemblies";

/** Read a whole dimension with explicit units. Unitless numbers may be door or grid marks. */
export function drawingLengthFeet(raw: string): number | null {
  const text = raw.trim().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/[−–]/g, "-");
  const metric = /^([+-]?\d+(?:\.\d+)?)\s*(mm|cm|m)$/i.exec(text);
  if (metric) return Number(metric[1]) / ({ mm: 304.8, cm: 30.48, m: .3048 }[metric[2].toLowerCase() as "mm" | "cm" | "m"]);

  const feet = /^([+-]?)(\d+(?:\.\d+)?)\s*'\s*(.*)$/.exec(text);
  if (feet) {
    const rest = feet[3].replace(/^-\s*/, "");
    if (!rest) return (feet[1] === "-" ? -1 : 1) * Number(feet[2]);
    if (!rest.endsWith('"') || /\/\s*0+\s*"$/.test(rest) || feet[2].includes(".")) return null;
    const inches = parseInches(rest);
    return inches === null || inches >= 12 ? null : (feet[1] === "-" ? -1 : 1) * (Number(feet[2]) + inches / 12);
  }
  const inches = text.endsWith('"') && !/\/\s*0+\s*"$/.test(text) ? parseInches(text) : null;
  return inches === null ? null : inches / 12;
}

export type DrawingTextRun = { text: string; a: [number, number]; b: [number, number]; height: number };
type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number };
type PdfViewport = { convertToViewportPoint: (x: number, y: number) => number[] };

/** Preserve the baseline direction, including vertical notes and dimensions. The viewport is at scale 1. */
export function drawingTextRuns(items: readonly (PdfTextItem | { type: string })[], viewport: PdfViewport): DrawingTextRun[] {
  const runs: DrawingTextRun[] = [];
  for (const item of items) {
    if (!("str" in item)) continue;
    const text = item.str?.trim();
    if (!text || !item.transform || !item.width) continue;
    const [x, y, c, d, left, bottom] = item.transform;
    const length = Math.hypot(x, y);
    if (!length) continue;
    const a = viewport.convertToViewportPoint(left, bottom) as DrawingTextRun["a"];
    const b = viewport.convertToViewportPoint(left + x * item.width / length, bottom + y * item.width / length) as DrawingTextRun["b"];
    runs.push({ text, a, b, height: item.height || Math.hypot(c, d) });
  }
  return runs;
}

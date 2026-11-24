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

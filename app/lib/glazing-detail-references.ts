import type { RegisterRow } from "./project-files";
import type { DimensionSource } from "./section-datums";
import type { TextBox } from "./text-anchor";

export type GlazingDetailReference = { tag: string; source: DimensionSource };

export function glazingDetailSheets<T extends Pick<RegisterRow, "title" | "discipline">>(register: T[]): T[] {
  return register.filter(row => row.discipline === "Architectural" &&
    /\b(?:STOREFRONT|CURTAIN\s*WALL|GLAZING|WINDOWS?)\b[\s\S]*\b(?:TYPES?|SCHEDULES?|ELEVATIONS?|DETAILS?)\b/i.test(row.title));
}

/** Identify the printed title of a type elevation, never a tag in the schedule or its general notes. */
export function printedGlazingReferences(boxes: TextBox[]): { tag: string; quote: string }[] {
  return boxes.flatMap(box => {
    const quote = box.str.trim();
    const match = /^(?:[A-Z]\d+\s+)?(?:STOREFRONT|CURTAIN\s+WALL|WINDOW)\s*[-–:]\s*((?:SF|CW|W)-?\d{1,3}[A-Z]?(?:-\d+[A-Z]?)?)$/i.exec(quote);
    return match ? [{ tag: match[1].toUpperCase(), quote }] : [];
  });
}

/** A plan type can open its elevation when the drawing set has one unambiguous detail title. */
export function glazingDetailSource(tag: string, refs: GlazingDetailReference[]): DimensionSource | undefined {
  const hits = refs.filter(ref => ref.tag === tag.trim().toUpperCase());
  const first = hits[0]?.source;
  return first && hits.every(({ source }) => source.documentId === first.documentId && source.page === first.page && source.quote === first.quote) ? first : undefined;
}

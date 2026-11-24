import type { SchematicLevel } from "../../lib/schematic-model";
import type { DimensionSource } from "../../lib/section-datums";
import { Button } from "./shared";

const heightLabel = {
  printed: "Height from printed datums",
  image: "Height read from the drawing image",
  estimated: "Estimated height",
  adjusted: "Manually adjusted position or height",
};

export function SchematicHeightEvidence({ level, onOpen }: { level: SchematicLevel; onOpen: (source: DimensionSource, label: string) => void }) {
  const vertical = level.vertical;
  if (!vertical) return null;
  const { datum, upper } = vertical;
  return <>
    <p>{heightLabel[vertical.basis]}</p>
    {datum && <Button onClick={() => onOpen(datum, level.name + " datum")}>Level datum · {datum.sheet}</Button>}
    {upper && <Button onClick={() => onOpen(upper, level.name + " upper datum")}>Upper datum · {upper.sheet}</Button>}
  </>;
}

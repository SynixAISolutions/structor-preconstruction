import type { GlazingElevation, GlazingPart } from "../../lib/glazing-elevation-parts";
import { inchesLabel } from "../../lib/wall-assemblies";

function measuredLength(feet: number) {
  const inches = Math.round(feet * 12 * 16) / 16, whole = Math.floor(inches / 12);
  return (whole ? whole + "′-" : "") + inchesLabel(inches - whole * 12);
}

function partLabel(part: GlazingPart, number: number) {
  return part.kind + " " + number + (part.kind === "Pane" ? " · " + part.mark : "");
}

export function GlazingElevationInspector({ elevation, part, placed, onPart }: {
  elevation: GlazingElevation;
  part?: number;
  placed: boolean;
  onPart: (part: number | undefined) => void;
}) {
  const { width, height, parts } = elevation;
  const counts = new Map<GlazingPart["kind"], number>();
  const labels = parts.map(item => {
    const number = (counts.get(item.kind) ?? 0) + 1;
    counts.set(item.kind, number);
    return partLabel(item, number);
  });
  const selected = part === undefined ? undefined : parts[part];
  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  return <section aria-label="Glazing elevation" style={{ display: "grid", gap: 8 }}>
    <div role="group" aria-label="Elevation parts as drawn" style={{
      position: "relative", width: "min(100%, " + 170 * ratio + "px)", aspectRatio: ratio,
      outline: "1px solid var(--nl-line, #8b98a3)", background: "var(--nl-paper, transparent)",
    }}>
      {parts.map((item, index) => <button type="button" key={index} tabIndex={-1} aria-pressed={part === index}
        aria-label={labels[index]} title={labels[index]} onClick={() => onPart(part === index ? undefined : index)}
        style={{
          position: "absolute", left: item.x / width * 100 + "%", bottom: item.y / height * 100 + "%",
          width: item.width / width * 100 + "%", height: item.height / height * 100 + "%",
          padding: 0, margin: 0, border: 0, borderRadius: 0, cursor: "pointer",
          background: item.kind === "Pane" ? "rgba(124, 196, 232, .65)" : "#87919a",
          outline: part === index ? "2px solid #608cff" : undefined,
          zIndex: part === index ? 1 : 0,
        }}/>
      )}
    </div>
    <label className="ui-field" style={{ margin: 0 }}>Elevation part
      <select value={selected ? String(part) : ""} onChange={event => onPart(event.target.value === "" ? undefined : Number(event.target.value))}>
        <option value="">Whole elevation</option>
        {labels.map((label, index) => <option key={index} value={index}>{label}</option>)}
      </select>
    </label>
    {selected && <dl>
      <div><dt>Width on elevation</dt><dd>{measuredLength(selected.width)}</dd></div>
      <div><dt>Height on elevation</dt><dd>{measuredLength(selected.height)}</dd></div>
      {selected.kind === "Pane" && <div><dt>Glass mark</dt><dd>{selected.mark}</dd></div>}
    </dl>}
    {selected?.kind === "Pane" && selected.description && <p>{selected.description}</p>}
    {!placed && <p>Inspect the drawn parts here. Their placement in the building needs verification.</p>}
    {selected && selected.kind !== "Pane" && <p>The elevation shows the frame face. Profile depth needs a section detail.</p>}
  </section>;
}

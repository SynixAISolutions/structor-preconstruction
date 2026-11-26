import type { FloorAssemblySelection } from "../../lib/schematic-floor-details";
import { layerColor } from "../../lib/wall-assemblies";
import type { Room } from "../../lib/room-detection";
import { Button } from "./shared";

type LayerRow = { material: string; size?: string };

export function AssemblyLayerList({ rows, active, onLayer }: { rows: LayerRow[]; active?: number; onLayer: (layer: number) => void }) {
  return <ol className="sm-layer-list">{rows.map(({ material, size }, index) =>
    <li key={index}><button type="button" aria-pressed={active === index} onClick={() => onLayer(index)}>
      <span className="sm-swatch" style={{ background: layerColor(material) }}/>
      <span>{index + 1}. {material}</span>
      <span>{size || "Thickness unspecified"}</span>
    </button></li>
  )}</ol>;
}

export function FloorLayersCard({ room, level, assembly, active, onLayer, onClose, onOpen, onPlan }: {
  room: Room; level: string; assembly: FloorAssemblySelection | null; active?: number; onLayer: (layer: number) => void;
  onClose: () => void; onOpen?: () => void; onPlan?: () => void;
}) {
  const name = [room.number, room.name].filter(Boolean).join(" ");
  const diagram = assembly?.basis === "reference" || assembly?.layers.some(layer => layer.minimum || !layer.thicknessFeet);
  return <section className="sm-layers" aria-label="Floor layers">
    <header>
      <div><strong>{name || "Selected floor"}</strong><span>{level} · {room.area.toLocaleString()} SF</span></div>
      <button type="button" className="sm-layers-close" aria-label="Return to model" onClick={onClose}>×</button>
    </header>
    {assembly ? <>
      <p>{assembly.source.quote}</p>
      <p>{assembly.basis === "reference" ? "Reference detail · Applicability to this floor needs review." : assembly.matchedBy === "callout" ? "Matched to the plan’s detail callout." : "The detail names this level."}
        {diagram && " Layer spacing is illustrative."}</p>
      <AssemblyLayerList rows={assembly.layers.map(layer => ({ material: layer.material,
        size: layer.label ? layer.label + (layer.minimum ? " minimum" : "") : undefined }))} active={active} onLayer={onLayer}/>
    </> : <p>This floor needs a matching assembly detail. Its outline comes from the floor plan.</p>}
    <div className="sm-layers-actions">
      {onPlan && <Button onClick={onPlan}>Open floor plan</Button>}
      {onOpen && assembly && <Button onClick={onOpen}>Open detail · {assembly.source.sheet}</Button>}
    </div>
  </section>;
}

import { inside, type Room } from "../../lib/room-detection";
import { planSource, type PlanSource, type SchematicLevel } from "../../lib/schematic-model";
import type { DimensionSource } from "../../lib/section-datums";
import { glazingPlacement, placedGlazingElevation } from "../../lib/glazing-detail-references";
import { finishesForRoom, type FloorFinishNote } from "../../lib/schematic-floor-details";
import { Button, Panel } from "./shared";
import { GlazingElevationInspector } from "./schematic-glazing-elevation";
import { isSportsFloor, type SchematicPick, type WallPick } from "./schematic-scene";

type ObjectPick = Exclude<SchematicPick, WallPick>;

const keyFor = ({ kind, levelId, index }: ObjectPick) => JSON.stringify([kind, levelId, index]);
const doorLabel = (level: SchematicLevel, index: number) => "Door " + (level.doors?.[index]?.number || index + 1);
const glazingLabel = (level: SchematicLevel, index: number) => "Glazing " + (level.glazing?.[index]?.type || index + 1);
const roomLabel = (room: Room, index: number) => [room.number, room.name].filter(Boolean).join(" ") || "Unnamed floor " + (index + 1);

export function SchematicObjectInspector({ levels, spaces, floorFinishes, pick, canOpenPlan, onPick, onClose, onPlan, onDimension }: {
  levels: SchematicLevel[];
  spaces: ReadonlyMap<string, Room[]>;
  floorFinishes?: FloorFinishNote[];
  pick: ObjectPick | null;
  canOpenPlan: (source: PlanSource) => boolean;
  onPick: (pick: ObjectPick, isolateLevel?: boolean) => void;
  onClose: () => void;
  onPlan: (level: SchematicLevel, pick: ObjectPick, source: PlanSource) => void;
  onDimension: (source: DimensionSource, label: string) => void;
}) {
  const doors = levels.map(level => ({
    level,
    picks: (level.doors ?? []).flatMap((door, index) => door.kind === "door" ? [{ kind: "door" as const, levelId: level.id, index }] : []),
  })).filter(group => group.picks.length);
  const glazing = levels.map(level => ({
    level,
    picks: (level.glazing ?? []).flatMap((run, index) => run.excluded ? [] : [{ kind: "glazing" as const, levelId: level.id, index }]),
  })).filter(group => group.picks.length);
  const floors = levels.map(level => ({
    level,
    items: (spaces.get(level.id) ?? []).flatMap((room, index) =>
      room.open ? [] : [{ room, pick: { kind: "floor" as const, levelId: level.id, index } }],
    ),
  })).filter(group => group.items.length);
  const sports = floors.flatMap(group => group.items.filter(({ room }) => isSportsFloor(room)));
  if (!doors.length && !floors.length && !glazing.length) return null;

  const level = pick ? levels.find(item => item.id === pick.levelId) : undefined;
  const door = pick?.kind === "door" ? level?.doors?.[pick.index] : undefined;
  const schedule = door?.scheduledSize;
  const selectedGlass = pick?.kind === "glazing" ? level?.glazing?.[pick.index] : undefined;
  const glass = selectedGlass?.excluded ? undefined : selectedGlass;
  const glassSize = glass?.dimensions;
  const glassDetail = glass?.elevationDetail ?? (glassSize?.kind === "frame" ? glassSize.source : undefined);
  const placement = glass && level ? glazingPlacement(glass, level) : undefined;
  const glassPlaced = !!(glass && level && placedGlazingElevation(glass, level));
  const selectedRoom = pick?.kind === "floor" ? spaces.get(pick.levelId)?.[pick.index] : undefined;
  const floor = selectedRoom?.open ? undefined : selectedRoom;
  const floorArea = floor && level?.planAreas?.findIndex(area => inside(floor.at, area.outline ?? level.outline));
  const source = level && planSource(level, door?.planArea ?? glass?.planArea ?? (floorArea ?? 0));
  const slabNotes = floor ? (level?.floorAssemblies ?? []).filter(note => note.planArea === null || note.planArea === (floorArea ?? 0)) : [];
  const finishes = floor ? finishesForRoom(floor, floorFinishes) : [];

  return <Panel title="Object inspector" className="sm-inspector">
    <div className="sm-inspector-body">
      {doors.length > 0 && <label className="ui-field">Find a door
        <select value={pick?.kind === "door" ? keyFor(pick) : ""} onChange={event => {
          const selected = doors.flatMap(group => group.picks).find(item => keyFor(item) === event.target.value);
          if (selected) onPick(selected);
          else if (pick?.kind === "door") onClose();
        }}>
          <option value="">Choose a door…</option>
          {doors.map(group => <optgroup key={group.level.id} label={group.level.name}>
            {group.picks.map(item => <option key={keyFor(item)} value={keyFor(item)}>{doorLabel(group.level, item.index)}</option>)}
          </optgroup>)}
        </select>
      </label>}
      {glazing.length > 0 && <label className="ui-field">Find glazing
        <select value={pick?.kind === "glazing" ? keyFor(pick) : ""} onChange={event => {
          const selected = glazing.flatMap(group => group.picks).find(item => keyFor(item) === event.target.value);
          if (selected) onPick(selected);
          else if (pick?.kind === "glazing") onClose();
        }}>
          <option value="">Choose glazing…</option>
          {glazing.map(group => <optgroup key={group.level.id} label={group.level.name}>
            {group.picks.map(item => <option key={keyFor(item)} value={keyFor(item)}>{glazingLabel(group.level, item.index)}</option>)}
          </optgroup>)}
        </select>
      </label>}
      {floors.length > 0 && <label className="ui-field">Find a floor
        <select value={floor && pick ? keyFor(pick) : ""} onChange={event => {
          const item = floors.flatMap(group => group.items).find(({ pick }) => keyFor(pick) === event.target.value);
          if (item) onPick(item.pick);
          else if (pick?.kind === "floor") onClose();
        }}>
          <option value="">Choose a floor…</option>
          {floors.map(group => <optgroup key={group.level.id} label={group.level.name}>
            {group.items.map(({ room, pick }) => <option key={keyFor(pick)} value={keyFor(pick)}>{roomLabel(room, pick.index)}</option>)}
          </optgroup>)}
        </select>
      </label>}
      {sports.length > 0 && <div className="sm-sports-shortcuts">
        {sports.map(item => <button key={keyFor(item.pick)} type="button" className="ui-btn secondary"
          aria-pressed={pick?.kind === "floor" && keyFor(pick) === keyFor(item.pick)} onClick={() => onPick(item.pick, true)}>
          View {roomLabel(item.room, item.pick.index)}
        </button>)}
      </div>}
      {level && source && pick && (door || floor || glass) && <div className="sm-inspected" aria-live="polite">
        <div className="sm-inspected-head">
          <strong>{floor ? roomLabel(floor, pick.index) : glass ? glazingLabel(level, pick.index) : doorLabel(level, pick.index)}</strong>
          <button type="button" className="sm-layers-close" aria-label="Clear object selection" onClick={onClose}>×</button>
        </div>
        <dl>
          <div><dt>Level</dt><dd>{level.name}</dd></div>
          {door && <div><dt>Opening</dt><dd>{door.width.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft{door.basis !== "tagged-gap" && (door.leaves === 2 ? " · Pair" : " · Single leaf")}</dd></div>}
          {schedule && <div><dt>Scheduled size</dt><dd>{schedule.width.toLocaleString(undefined, { maximumFractionDigits: 3 })} ft wide × {schedule.height.toLocaleString(undefined, { maximumFractionDigits: 3 })} ft high</dd></div>}
          {floor && <div><dt>Detected room area</dt><dd>{floor.area.toLocaleString()} SF</dd></div>}
          {glass && <div><dt>Run on plan</dt><dd>{Math.hypot(glass.b[0] - glass.a[0], glass.b[1] - glass.a[1]).toLocaleString(undefined, { maximumFractionDigits: 2 })} ft</dd></div>}
          {glassSize && <div><dt>{glassSize.kind === "frame" ? "Frame size" : "Scheduled rough opening"}</dt><dd>{glassSize.widthLabel} wide × {glassSize.heightLabel} high</dd></div>}
          {glassSize?.sill && <div><dt>Sill elevation</dt><dd>{glassSize.sill.quote}</dd></div>}
          <div><dt>Source</dt><dd>{source.sheet} · PDF page {source.page}</dd></div>
        </dl>
        {slabNotes.map(note => <details key={note.source.sheet + note.source.quote}>
          <summary>Slab-on-grade layers · {note.source.sheet}</summary>
          <ol>{note.layers.map(layer => <li key={layer.material}>{layer.material} · {layer.label ? layer.label + (layer.minimum ? " minimum" : "") : "Thickness unspecified"}</li>)}</ol>
          <p>Verify this room is over slab-on-grade on the structural plan.</p>
          <Button onClick={() => onDimension(note.source, "Slab-on-grade layers")}>Open slab note</Button>
        </details>)}
        {finishes.length > 0 && <details>
          <summary>Floor finishes for {floor?.name || floor?.number}</summary>
          <ul>{finishes.map(finish => <li key={finish.source.sheet + finish.tag}>
            {finish.tag} · {finish.material} <Button onClick={() => onDimension(finish.source, finish.material)}>{finish.source.sheet}</Button>
          </li>)}</ul>
          <p>Check the finish plan for each finish boundary.</p>
        </details>}
        {floor && !slabNotes.length && !finishes.length && <p>Floor build-up awaits a matching drawing detail.</p>}
        {floor && isSportsFloor(floor) && <p>Court markings and equipment require their own drawing evidence.</p>}
        {door?.basis === "tagged-gap" && <p>A printed door tag matches this gap in the wall. {door.scheduledSize ? "Door swing is unverified." : "Door height and swing are unverified."}</p>}
        {door && door.basis !== "tagged-gap" && !door.scheduledSize && <p>3D door height is estimated until a schedule row is matched.</p>}
        {door && !door.number && <p>The swing was detected on the plan. No door tag was matched.</p>}
        {glass && !placement?.dimensioned && <p>{glassSize?.kind === "frame" ? "The frame size awaits a matching run and level height. The preview uses an estimated height." : "The preview uses an estimated glazing height."}</p>}
        {placement?.dimensioned && !glassSize?.sill && <p>Frame height is dimensioned. Sill placement needs verification.</p>}
        {pick.kind === "glazing" && glassSize?.elevation && <GlazingElevationInspector
          elevation={glassSize.elevation} part={pick.part} placed={glassPlaced} onPart={part => onPick({ ...pick, part })}/>}
        {canOpenPlan(source) && <Button onClick={() => onPlan(level, pick, source)}>{floor ? "Open " + source.sheet : glass ? "Show glazing on plan" : "Show door on plan"}</Button>}
        {schedule && <Button onClick={() => onDimension(schedule.source, doorLabel(level, pick.index))}>Door schedule · {schedule.source.sheet}</Button>}
        {glassSize?.kind === "rough-opening" && <Button onClick={() => onDimension(glassSize.source, "Window schedule")}>Window schedule · {glassSize.source.sheet}</Button>}
        {glassDetail && <Button onClick={() => onDimension(glassDetail, glazingLabel(level, pick.index))}>Glazing elevation · {glassDetail.sheet}</Button>}
      </div>}
    </div>
  </Panel>;
}

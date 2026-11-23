import type { Room } from "../../lib/room-detection";
import type { SchematicLevel } from "../../lib/schematic-model";
import { Button, Panel } from "./shared";
import { isSportsFloor, type SchematicPick, type WallPick } from "./schematic-scene";

type ObjectPick = Exclude<SchematicPick, WallPick>;

const keyFor = ({ levelId, index }: ObjectPick) => JSON.stringify([levelId, index]);
const doorLabel = (level: SchematicLevel, index: number) => "Door " + (level.doors?.[index]?.number || index + 1);
const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(" ");

export function SchematicObjectInspector({ levels, spaces, pick, canOpenPlan, onPick, onClose, onPlan }: {
  levels: SchematicLevel[];
  spaces: ReadonlyMap<string, Room[]>;
  pick: ObjectPick | null;
  canOpenPlan: (level: SchematicLevel) => boolean;
  onPick: (pick: ObjectPick) => void;
  onClose: () => void;
  onPlan: (level: SchematicLevel, pick: ObjectPick) => void;
}) {
  const doors = levels.map(level => ({
    level,
    picks: (level.doors ?? []).flatMap((door, index) => door.kind === "door" ? [{ kind: "door" as const, levelId: level.id, index }] : []),
  })).filter(group => group.picks.length);
  const sports = levels.flatMap(level => (spaces.get(level.id) ?? []).flatMap((room, index) =>
    isSportsFloor(room) ? [{ room, level, pick: { kind: "sports-floor" as const, levelId: level.id, index } }] : [],
  ));
  if (!doors.length && !sports.length) return null;

  const level = pick ? levels.find(item => item.id === pick.levelId) : undefined;
  const door = pick?.kind === "door" ? level?.doors?.[pick.index] : undefined;
  const court = pick?.kind === "sports-floor" ? spaces.get(pick.levelId)?.[pick.index] : undefined;

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
      {sports.length > 0 && <div className="sm-sports-shortcuts">
        {sports.map(item => <button key={keyFor(item.pick)} type="button" className="ui-btn secondary"
          aria-pressed={pick?.kind === "sports-floor" && keyFor(pick) === keyFor(item.pick)} onClick={() => onPick(item.pick)}>
          View {roomLabel(item.room)}
        </button>)}
      </div>}
      {level && pick && (door || court) && <div className="sm-inspected" aria-live="polite">
        <div className="sm-inspected-head">
          <strong>{court ? roomLabel(court) : doorLabel(level, pick.index)}</strong>
          <button type="button" className="sm-layers-close" aria-label="Clear object selection" onClick={onClose}>×</button>
        </div>
        <dl>
          <div><dt>Level</dt><dd>{level.name}</dd></div>
          {door && <div><dt>Opening</dt><dd>{door.width.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft · {door.leaves === 2 ? "Pair" : "Single leaf"}</dd></div>}
          {court && <div><dt>Detected floor area</dt><dd>{court.area.toLocaleString()} SF</dd></div>}
          <div><dt>Source</dt><dd>{level.source.sheet} · PDF page {level.source.page}</dd></div>
        </dl>
        {court && <p>The surface follows the detected room boundary. Court markings and equipment require their own drawing evidence.</p>}
        {door && !door.number && <p>The swing was detected on the plan. No door tag was matched.</p>}
        {canOpenPlan(level) && <Button onClick={() => onPlan(level, pick)}>{court ? "Open " + level.source.sheet : "Show door on plan"}</Button>}
      </div>}
    </div>
  </Panel>;
}

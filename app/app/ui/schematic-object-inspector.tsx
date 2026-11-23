import type { Room } from "../../lib/room-detection";
import type { SchematicLevel } from "../../lib/schematic-model";
import { Button, Panel } from "./shared";
import { isSportsFloor, type SchematicPick, type WallPick } from "./schematic-scene";

type ObjectPick = Exclude<SchematicPick, WallPick>;

const keyFor = ({ kind, levelId, index }: ObjectPick) => JSON.stringify([kind, levelId, index]);
const doorLabel = (level: SchematicLevel, index: number) => "Door " + (level.doors?.[index]?.number || index + 1);
const roomLabel = (room: Room, index: number) => [room.number, room.name].filter(Boolean).join(" ") || "Unnamed floor " + (index + 1);

export function SchematicObjectInspector({ levels, spaces, pick, canOpenPlan, onPick, onClose, onPlan }: {
  levels: SchematicLevel[];
  spaces: ReadonlyMap<string, Room[]>;
  pick: ObjectPick | null;
  canOpenPlan: (level: SchematicLevel) => boolean;
  onPick: (pick: ObjectPick, isolateLevel?: boolean) => void;
  onClose: () => void;
  onPlan: (level: SchematicLevel, pick: ObjectPick) => void;
}) {
  const doors = levels.map(level => ({
    level,
    picks: (level.doors ?? []).flatMap((door, index) => door.kind === "door" ? [{ kind: "door" as const, levelId: level.id, index }] : []),
  })).filter(group => group.picks.length);
  const floors = levels.map(level => ({
    level,
    items: (spaces.get(level.id) ?? []).flatMap((room, index) =>
      room.open ? [] : [{ room, pick: { kind: "floor" as const, levelId: level.id, index } }],
    ),
  })).filter(group => group.items.length);
  const sports = floors.flatMap(group => group.items.filter(({ room }) => isSportsFloor(room)));
  if (!doors.length && !floors.length) return null;

  const level = pick ? levels.find(item => item.id === pick.levelId) : undefined;
  const door = pick?.kind === "door" ? level?.doors?.[pick.index] : undefined;
  const selectedRoom = pick?.kind === "floor" ? spaces.get(pick.levelId)?.[pick.index] : undefined;
  const floor = selectedRoom?.open ? undefined : selectedRoom;

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
      {level && pick && (door || floor) && <div className="sm-inspected" aria-live="polite">
        <div className="sm-inspected-head">
          <strong>{floor ? roomLabel(floor, pick.index) : doorLabel(level, pick.index)}</strong>
          <button type="button" className="sm-layers-close" aria-label="Clear object selection" onClick={onClose}>×</button>
        </div>
        <dl>
          <div><dt>Level</dt><dd>{level.name}</dd></div>
          {door && <div><dt>Opening</dt><dd>{door.width.toLocaleString(undefined, { maximumFractionDigits: 2 })} ft · {door.leaves === 2 ? "Pair" : "Single leaf"}</dd></div>}
          {floor && <div><dt>Detected room area</dt><dd>{floor.area.toLocaleString()} SF</dd></div>}
          <div><dt>Source</dt><dd>{level.source.sheet} · PDF page {level.source.page}</dd></div>
        </dl>
        {floor && isSportsFloor(floor) && <p>Court markings and equipment require their own drawing evidence.</p>}
        {door && !door.number && <p>The swing was detected on the plan. No door tag was matched.</p>}
        {canOpenPlan(level) && <Button onClick={() => onPlan(level, pick)}>{floor ? "Open " + level.source.sheet : "Show door on plan"}</Button>}
      </div>}
    </div>
  </Panel>;
}

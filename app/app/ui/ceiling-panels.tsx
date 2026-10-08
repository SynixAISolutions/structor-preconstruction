"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, FileText, Search } from "lucide-react";
import { finishScheduleRows } from "../../lib/jelleff-model";
import { rcpL1, rcpL2, roomsWithoutCeiling, unplacedCeilingTags } from "../../lib/jelleff-ceilings";
import { roomCeilingSchedule, type LevelId, type ModelObject, type ModelSource } from "../../lib/model";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const levelName = (level: LevelId) => level === "L2" ? "Level 02" : "Level 01";

export function CeilingCard({ object, onSource }: { object: ModelObject; onSource: (source: ModelSource) => void }) {
  const ceiling = object.ceiling;
  if (!ceiling) return null;
  const paint = finishScheduleRows.find(row => row.tag === ceiling.paint?.tag);
  return <section className={`ms-finish-schedule ms-ceiling-card ${ceiling.status !== "tagged" ? "unassigned" : ""}`} aria-label="Ceiling type and height">
    <span className="ms-section-label">REFLECTED CEILING PLAN</span>
    <h3>{ceiling.tag ?? "No ceiling tag"}</h3>
    <span className={`ms-hardware-badge ${ceiling.status !== "tagged" ? "conflict" : ""}`}>{ceiling.status === "tagged" ? "Type and height recorded" : ceiling.status === "height-unresolved" ? "Height unresolved · listed only" : "Type and height unresolved · listed only"}</span>
    <dl>
      <div><dt>Legend</dt><dd>{ceiling.type?.legend ?? "Not assigned"}</dd></div>
      <div><dt>Height above floor</dt><dd>{ceiling.heightText ?? "Not resolved"}<small>Above finished floor (AFF), A3.1 note C.</small></dd></div>
      <div><dt>Model elevation</dt><dd>{ceiling.elevationFt === null ? "Not placed in 3D" : `${number.format(ceiling.elevationFt)} ft`}<small>Level floor elevation + height above floor.</small></dd></div>
      <div><dt>Schedule link</dt><dd>{ceiling.type?.scheduleLink?.tag ?? "No ceiling product row"}{ceiling.type?.scheduleLink && <small>{ceiling.type.scheduleLink.basis}</small>}</dd></div>
      <div><dt>Zone outline</dt><dd>{object.properties.find(item => item.label === "Outline")?.value}</dd></div>
    </dl>
    {ceiling.note && <p className="ms-ceiling-note">{ceiling.note}</p>}
    {!!ceiling.type?.conflicts.length && <div className="ms-ceiling-conflicts"><strong>Source differences · unresolved</strong><ul>{ceiling.type.conflicts.map(text => <li key={text}>{text}</li>)}</ul></div>}
    {paint && <div className="ms-ceiling-paint"><strong>{paint.tag} · {paint.description}</strong><p>{paint.color}</p><p>{paint.manufacturer} · {paint.product}</p><small>{ceiling.paint?.basis === "tagged" ? "Paint tag printed on this zone." : "Default ceiling paint from A12.1; no paint tag printed on this zone."}</small><button onClick={() => onSource({ ...paint.source, drawing: paint.source.drawing ?? "" })}><FileText size={14}/>A12.1 · paint schedule<ArrowUpRight size={13}/></button></div>}
    <p className="ms-ceiling-note">Panels are shown with schematic thickness. Zone boundaries are not wall-angle or trim quantities; walls retain their height to the deck. Bulkhead faces are source references only.</p>
    <button onClick={() => onSource(object.sources[0])}><FileText size={14}/>{object.sources[0].sheet} · page {object.sources[0].page}<ArrowUpRight size={13}/></button>
  </section>;
}

export function CeilingSchedulePanel({ objects, level, onInspect, onSource }: { objects: ModelObject[]; level: LevelId | ""; onInspect: (id: string) => void; onSource: (source: ModelSource) => void }) {
  const [query, setQuery] = useState(""), [status, setStatus] = useState("");
  const ceilings = useMemo(() => objects.filter(object => object.ceiling && (!level || object.level === level)), [objects, level]);
  const schedule = useMemo(() => roomCeilingSchedule(ceilings), [ceilings]);
  const q = query.trim().toLowerCase();
  const shown = schedule.map(row => ({ ...row, zones: row.zones.filter(zone => (!status || (status === "resolved" ? zone.status === "tagged" : zone.status !== "tagged")) && (!q || [row.room, zone.tag, zone.heightText, objects.find(object => object.id === zone.id)?.name].join(" ").toLowerCase().includes(q))) })).filter(row => row.zones.length);
  const missing = roomsWithoutCeiling.filter(item => !level || item.level === level);
  const unplaced = unplacedCeilingTags.filter(item => !level || item.level === level);
  const sourceFor = (level: LevelId): ModelSource => ({ ...(level === "L2" ? rcpL2 : rcpL1), drawing: "Jelleff drawing set" });
  return <details className="ms-room-schedule ms-ceiling-schedule">
    <summary><span><span className="ms-section-label">CEILINGS BY ROOM AND ZONE</span><strong>Room ceiling schedule</strong></span><small>{ceilings.length} zones · {ceilings.filter(object => object.ceiling?.status !== "tagged").length} unresolved</small><ChevronDown size={16}/></summary>
    <p>Heights are above finished floor; elevation adds the level's floor height. Unresolved zones retain their measured area and source outline, and are listed without a 3D placement. Areas cover traced zones only. Room numbers follow the ceiling plans.</p>
    <div className="ms-door-filters"><label><Search size={14}/><input aria-label="Search ceiling schedule" value={query} onChange={event => setQuery(event.target.value)} placeholder="Room, ceiling tag or height…"/></label><select aria-label="Filter ceiling coverage" value={status} onChange={event => setStatus(event.target.value)}><option value="">All ceiling zones</option><option value="resolved">Type and height recorded</option><option value="unresolved">Unresolved zones</option></select></div>
    <div className="ms-room-scroll"><table><thead><tr><th scope="col">Room / level</th><th scope="col">Zone / plan tag</th><th scope="col">Height AFF</th><th scope="col">Elevation</th><th scope="col">Zone area SF</th><th scope="col">Coverage</th></tr></thead><tbody>{shown.flatMap(row => row.zones.map(zone => <tr key={zone.id}><th scope="row">{row.room ?? "Unnumbered"}<small>{levelName(row.level)}</small><small>{number.format(row.areaSf)} SF · room total, all zones</small></th><td><button onClick={() => onInspect(zone.id)} aria-label={`Inspect ceiling ${zone.id}`}><strong>{zone.tag ?? "No tag"}</strong><small>{objects.find(object => object.id === zone.id)?.name}</small><ArrowUpRight size={12}/></button></td><td>{zone.heightText ?? "Unresolved"}</td><td>{zone.elevationFt === null ? "Not placed" : `${number.format(zone.elevationFt)} ft`}</td><td>{number.format(zone.areaSf)}</td><td><span className={`ms-hardware-badge ${zone.status !== "tagged" ? "conflict" : ""}`}>{zone.status === "tagged" ? "Recorded" : zone.status === "untagged" ? "Type / height unresolved" : "Height unresolved"}</span></td></tr>))}</tbody></table></div>
    {!shown.length && <p className="ms-door-empty">No ceiling zones match these filters.</p>}
    <details className="ms-ceiling-coverage"><summary>Coverage notes · {missing.length} rooms with no ceiling shown · {unplaced.length} tags without a zone</summary><p>No ceiling is assumed for these rooms. Tags without a defined zone are not counted in the takeoff.</p><ul>{missing.map(item => <li key={`${item.level}-${item.room}`}><strong>{item.room} · {levelName(item.level)}</strong> {item.reason} <button onClick={() => onSource(sourceFor(item.level))}>View plan</button></li>)}</ul><ul>{unplaced.map((item, index) => <li key={index}><strong>{item.tag} · {item.height} · {levelName(item.level)}</strong> {item.reason} <button onClick={() => onSource(sourceFor(item.level))}>View plan</button></li>)}</ul></details>
  </details>;
}

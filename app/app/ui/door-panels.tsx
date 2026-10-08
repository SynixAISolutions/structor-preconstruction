"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, FileText, Search } from "lucide-react";
import { doorScheduleRows, doorSchedule, scheduleOnlyDoors } from "../../lib/jelleff-doors";
import { hardwareFinishes, hardwareManufacturers } from "../../lib/data/jelleff-hardware";
import { doorCounts, doorHardware, hardwareDoorsNotOnSchedule, type DoorDetail, type DoorHardware, type DoorScheduleRow, type HardwareStatus, type ModelObject, type ModelSource, type SourceRef } from "../../lib/model";
import { Modal } from "./shared";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const hardwareLabel: Record<HardwareStatus, string> = { match: "Sets agree", "different-set": "Different set numbers", "in-several-sets": "Door listed in several sets", "not-in-manual": "Door not listed in manual sets" };
const asSource = (source: SourceRef): ModelSource => ({ ...source, drawing: source.drawing ?? "" });

export function DoorRecordCard({ row, hardware, detail, onSource }: { row: DoorScheduleRow; hardware: DoorHardware; detail?: DoorDetail; onSource: (source: ModelSource) => void }) {
  const fields = [["Panels", row.panels === null ? "Not listed · coiling counter door" : String(row.panels)], ["Size / panel", [row.width, row.height, row.thickness].filter(Boolean).join(" × ") || "See comments"], ["Panel material", row.material], ["Panel type", [row.panelType, row.panelTypeName].filter(Boolean).join(" · ") || "Not listed"], ["Glass type", row.glass || "Not scheduled"], ["Frame", `${row.frameMaterial} · type ${row.frameType}`], ["Fire rating", row.fireRating || "Not listed"], ["Head", row.details.head], ["Left jamb", row.details.jambLeft], ["Right jamb", row.details.jambRight], ["Sill", row.details.sill]];
  return <>
    <section className="ms-finish-schedule ms-door-record" aria-label={`Door ${row.number} schedule details`}>
      <span className="ms-section-label">ARCHITECT'S DOOR & FRAME SCHEDULE</span><h3>Door {row.number}</h3>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
      {row.comments && <p className="ms-door-note">{row.comments}</p>}
      {detail && <div className={`ms-door-width ${detail.widthCheck.within === false ? "conflict" : ""}`}><strong>{detail.widthCheck.within === null ? "No numeric panel width" : detail.widthCheck.within ? "Width within trace tolerance" : "Width needs checking"}</strong><p>Traced opening {number.format(detail.openingFt)} ft{detail.scheduledFt !== null && ` · scheduled ${number.format(detail.scheduledFt)} ft`}. Tolerance {number.format(detail.widthCheck.toleranceFt * 12)} in.{detail.widthCheck.openingDeltaFt !== null && ` Opening difference ${number.format(detail.widthCheck.openingDeltaFt * 12)} in.`}{detail.widthCheck.leafDeltaFt !== null && ` Maximum leaf difference ${number.format(detail.widthCheck.leafDeltaFt * 12)} in.`}</p>{detail.traceNote && <p>{detail.traceNote}</p>}</div>}
      <button onClick={() => onSource(asSource(row.source))}><FileText size={14}/>{row.source.sheet} · page {row.source.page}<ArrowUpRight size={13}/></button>
    </section>
    <section className={`ms-finish-schedule ms-door-hardware ${hardware.status !== "match" ? "conflict" : ""}`} aria-label={`Door ${row.number} hardware`}>
      <span className="ms-section-label">DRAWING / PROJECT MANUAL</span><h3>Door hardware</h3><span className="ms-hardware-badge">{hardwareLabel[hardware.status]}</span>
      <dl><div><dt>A8.2 set</dt><dd>#{hardware.drawingSet}</dd></div><div><dt>Manual lists door in</dt><dd>{hardware.manualSets.length ? hardware.manualSets.map(value => `#${value}`).join(", ") : "No set lists this door"}</dd></div></dl>
      {!hardware.drawingSetInManual && <p className="ms-door-note">Set #{hardware.drawingSet} is not present in the manual.</p>}
      {hardware.status !== "match" && <p className="ms-door-note">Both sources are retained for contractor review.</p>}
      {hardware.sets.map(set => <details className="ms-hardware-set" key={set.number}><summary>#{set.number} · {set.name}<ChevronDown size={13}/></summary><p>Quantities are as stated for this set, not multiplied by the number of leaves.</p><div className="ms-hardware-scroll"><table><thead><tr><th scope="col">Qty</th><th scope="col">Item / product</th><th scope="col">Finish / manufacturer</th></tr></thead><tbody>{set.items.map((item, index) => <tr key={index}><td>{item.qty}</td><td><strong>{item.item}</strong><small>{item.product}</small></td><td>{item.finish || "—"}{hardwareFinishes[item.finish] && <small>{hardwareFinishes[item.finish]}</small>}<small>{item.manufacturer}{hardwareManufacturers[item.manufacturer] && ` · ${hardwareManufacturers[item.manufacturer]}`}</small></td></tr>)}</tbody></table></div>{set.notes.length > 0 && <ul>{set.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}<button onClick={() => onSource(asSource(set.source))}><FileText size={14}/>08 71 00 · page {set.source.page}<ArrowUpRight size={13}/></button></details>)}
    </section>
  </>;
}

export function DoorSchedulePanel({ objects, onInspect, onSource }: { objects: ModelObject[]; onInspect: (id: string) => void; onSource: (source: ModelSource) => void }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [record, setRecord] = useState("");
  const counts = doorCounts(doorScheduleRows, objects);
  const entries = doorScheduleRows.map(row => { const object = objects.find(object => object.door?.row.number === row.number); return { row, object, hardware: object?.door?.hardware ?? doorHardware(row.number, row.hardwareSet, doorSchedule.hardwareSets) }; });
  const q = query.trim().toLowerCase();
  const shown = entries.filter(entry => (filter === "all" || (filter === "modeled" && entry.object) || (filter === "schedule-only" && !entry.object) || (filter === "conflicts" && entry.hardware.status !== "match")) && [entry.row.number, entry.row.material, entry.row.panelType, entry.row.hardwareSet, ...entry.hardware.manualSets].join(" ").toLowerCase().includes(q));
  const selected = entries.find(entry => entry.row.number === record);
  const manualOnly = hardwareDoorsNotOnSchedule(doorScheduleRows, doorSchedule.hardwareSets);
  return <>
    <details className="ms-room-schedule ms-door-schedule"><summary><span><span className="ms-section-label">OPENINGS, LEAVES & HARDWARE</span><strong>Door & frame schedule</strong></span><small>{counts.openings.modeled} modeled · {counts.openings.scheduleOnly} schedule only</small><ChevronDown size={16}/></summary>
      <p>{counts.openings.scheduled} scheduled openings · {counts.leaves.scheduled} listed panels. The model has {counts.openings.modeled} openings and {counts.leaves.modeled} leaves; a pair is one opening. The coiling counter door has no hinged leaves. {entries.filter(entry => entry.hardware.status !== "match").length} hardware conflicts need review. Door panels use scheduled sizes at traced hinges; wall openings and frame profiles are not cut or detailed.</p>
      <div className="ms-door-filters"><label><Search size={14}/><input aria-label="Search door schedule" placeholder="Door, material, panel type or hardware set…" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter door schedule" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All entries</option><option value="modeled">Modeled openings</option><option value="schedule-only">Schedule only</option><option value="conflicts">Hardware conflicts</option></select><span>{shown.length} entries</span></div>
      <div className="ms-room-scroll"><table><thead><tr>{["Door / placement", "Panels", "Size per panel", "Material / panel type", "Frame", "Fire rating", "Hardware sources"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{shown.map(({ row, object, hardware }) => <tr key={row.number}><th scope="row"><button aria-label={object ? `Inspect door ${row.number} in model` : `Read door ${row.number} schedule record`} onClick={() => object ? onInspect(object.id) : setRecord(row.number)}><strong>{row.number}</strong><small>{object ? `Modeled · ${object.level}` : "Schedule only"}</small><ArrowUpRight size={12}/></button>{!object && <small>{scheduleOnlyDoors.find(door => door.number === row.number)?.reason}</small>}</th><td>{row.panels ?? "Coiling"}</td><td>{row.width && row.height ? `${row.width} × ${row.height}` : "See comments"}</td><td>{row.material}<small>{row.panelTypeName || "Coiling counter door"}</small></td><td>{row.frameMaterial}<small>Type {row.frameType}</small></td><td>{row.fireRating || "Not listed"}</td><td><strong>A8.2 #{hardware.drawingSet}</strong><small>Manual: {hardware.manualSets.length ? hardware.manualSets.map(value => `#${value}`).join(", ") : "Door not listed"}</small><span className={`ms-hardware-badge ${hardware.status !== "match" ? "conflict" : ""}`}>{hardwareLabel[hardware.status]}</span></td></tr>)}</tbody></table>{!shown.length && <p className="ms-door-empty">No schedule entries match these filters.</p>}</div>
      {manualOnly.length > 0 && <p className="ms-manual-only">Manual door numbers absent from A8.2: {manualOnly.map(item => `${item.door} (set #${item.set})`).join(", ")}. These have not been treated as aliases.</p>}
    </details>
    {selected && <Modal title={`Door ${selected.row.number} · schedule record`} subtitle={scheduleOnlyDoors.find(door => door.number === record)?.reason ?? "A8.2 door and frame schedule"} onClose={() => setRecord("")}><DoorRecordCard row={selected.row} hardware={selected.hardware} onSource={source => { setRecord(""); onSource(source); }}/></Modal>}
  </>;
}

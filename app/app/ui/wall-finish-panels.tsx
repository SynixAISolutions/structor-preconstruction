"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronDown, FileText, Search } from "lucide-react";
import { excludedFinishTags, wallFinishGaps } from "../../lib/jelleff-wall-finishes";
import { roomWallFinishSchedule, wallFaces, type BaseBreakdownRow, type LevelId, type ModelObject, type ModelSource, type WallFinishRecord, type WallFinishStatus } from "../../lib/model";
import { Modal } from "./shared";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const wallFinishStatus: Record<WallFinishStatus, string> = {
  assigned: "Face and run located", "face-unresolved": "Face unresolved", "extent-unresolved": "Run unresolved", "wall-not-traced": "Wall not traced", graphic: "Graphic · listed only",
};
type SourceAction = (record: WallFinishRecord, source: ModelSource) => void;
const sourceOf = (source: WallFinishRecord["evidence"][number]): ModelSource => ({ ...source, drawing: source.drawing ?? "" });

function FinishDetails({ record, onSource }: { record: WallFinishRecord; onSource: SourceAction }) {
  return <div className="ms-wall-record">
    <span className={`ms-hardware-badge ${record.status !== "assigned" ? "conflict" : ""}`}>{wallFinishStatus[record.status]}</span>
    <p>{record.level === "L2" ? "Level 02" : "Level 01"} · {record.room ? `Room ${record.room}` : "Room not identified"} · {record.lengthFt === null ? "Run not measured" : `${number.format(record.lengthFt)} LF located run`}</p>
    {record.bands.map((band, index) => <section className="ms-wall-band" key={index}>
      <h4>{band.tags.join(" / ")}</h4>
      <dl><div><dt>Area</dt><dd>{band.areaSf === null ? "Not measured" : `${number.format(band.areaSf)} SF · dimensioned band`}</dd></div><div><dt>Height / width</dt><dd>{band.height ?? (band.heightFt === null ? "Height not dimensioned" : `${number.format(band.heightFt)} ft`)} · {band.width ?? (band.fullRun && record.lengthFt !== null ? `${number.format(record.lengthFt)} ft located run` : "Width not dimensioned")}</dd></div><div><dt>Above floor</dt><dd>{band.from ?? "Bottom not dimensioned"}{band.to && ` → ${band.to}`}</dd></div></dl>
      {band.note && <p>{band.note}</p>}
      {band.rows.map(row => <details className="ms-wall-product" key={row.tag}><summary>{row.tag} · {row.description}</summary><dl>{[["Manufacturer", row.manufacturer], ["Product", row.product], ["Color / finish", row.color], ["Size", row.size], ["Comments", row.comments], ["Specification", `${row.section} · ${row.sectionTitle}`]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button onClick={() => onSource(record, sourceOf(row.source))}><FileText size={14}/>{row.source.sheet} · product schedule<ArrowUpRight size={13}/></button></details>)}
    </section>)}
    {record.base && <section className="ms-wall-band"><h4>Base · {record.base.tag ?? "As scheduled"}</h4><p>{record.base.printed}</p><p>{record.base.basis}</p>{record.baseRow && <p>{record.baseRow.manufacturer} · {record.baseRow.color} · {record.baseRow.size}</p>}</section>}
    {record.note && <p>{record.note}</p>}
    {!!record.conflicts.length && <div className="ms-ceiling-conflicts"><strong>Source differences · unresolved</strong><ul>{record.conflicts.map(text => <li key={text}>{text}</li>)}</ul></div>}
    <p className="ms-wall-placement-note">A dimensioned area does not establish its position on the wall. Only bands with a located run and a dimensioned bottom are filled in 3D. Colored run markers identify evidence where height is unknown. Unnoted faces have no assumed paint.</p>
    <div className="ms-wall-sources">{record.evidence.map((source, index) => <button key={index} onClick={() => onSource(record, sourceOf(source))}><FileText size={14}/><span><strong>{source.sheet} · page {source.page}</strong><small>{source.detail}</small></span><ArrowUpRight size={13}/></button>)}</div>
  </div>;
}

export function WallFaceCard({ object, records, onSource }: { object: ModelObject; records: WallFinishRecord[]; onSource: SourceAction }) {
  if (object.kind !== "wall") return null;
  const faces = wallFaces([object], records);
  return <section className="ms-finish-schedule ms-wall-face-card" aria-label="Wall finishes by face"><span className="ms-section-label">FINISH EVIDENCE · BOTH FACES</span><h3>Wall finishes</h3><p>Left and right are relative to the wall's first-to-second plan point.</p>{faces.map(face => <div className="ms-wall-face" key={face.side}><h4>{face.side === "left" ? "Left" : "Right"} face{face.rooms.length ? ` · Room ${face.rooms.join(" / ")}` : ""}</h4>{!face.recordIds.length ? <p>Not noted · no paint or finish assumed.</p> : face.recordIds.map(id => { const record = records.find(item => item.id === id)!; return <details key={id}><summary>{record.title}<small>{record.bands.flatMap(band => band.tags).join(" / ")} · {wallFinishStatus[record.status]}</small></summary><FinishDetails record={record} onSource={onSource}/></details>; })}</div>)}</section>;
}

export function BaseRuns({ row, records, onSource }: { row: BaseBreakdownRow; records: WallFinishRecord[]; onSource: SourceAction }) {
  return <div className="ms-base-runs"><span><strong>{row.field.tag}</strong> · {number.format(row.field.lf)} LF{row.accents.length > 0 && <small>Remaining field base</small>}</span>{row.accents.map((accent, index) => { const record = records.find(item => item.id === accent.recordId)!; return <button key={index} onClick={() => onSource(record, sourceOf(record.evidence[0]))}><strong>{accent.tag} · {number.format(accent.lf)} LF</strong><small>{record.title}</small><ArrowUpRight size={12}/></button>; })}</div>;
}

export function BaseBreakdownCard({ row, records, onSource }: { row?: BaseBreakdownRow; records: WallFinishRecord[]; onSource: SourceAction }) {
  if (!row) return null;
  return <section className="ms-finish-schedule ms-base-card" aria-label="Base quantity breakdown"><span className="ms-section-label">BASE BY TYPE</span><h3>{number.format(row.grossLf)} LF · gross total</h3><BaseRuns row={row} records={records} onSource={onSource}/><p>Supported accent runs replace the same length of field base. Internal finish lines are excluded; door openings are not deducted. Conflicting gym and tile base notes remain unresolved.</p></section>;
}

export function WallFinishPanel({ records, bases, level, onInspect, onSource }: { records: WallFinishRecord[]; bases: BaseBreakdownRow[]; level: LevelId | ""; onInspect: (id: string) => void; onSource: SourceAction }) {
  const [query, setQuery] = useState(""), [status, setStatus] = useState(""), [detailId, setDetailId] = useState<string | null>(null);
  const current = useMemo(() => records.filter(record => !level || record.level === level), [records, level]);
  const q = query.trim().toLowerCase();
  const shown = current.filter(record => (!status || (status === "conflicts" ? !!record.conflicts.length : record.status === status)) && (!q || [record.room, record.title, ...record.bands.flatMap(band => band.tags), record.base?.tag, ...record.evidence.map(source => `${source.sheet} ${source.detail}`)].join(" ").toLowerCase().includes(q)));
  const schedule = roomWallFinishSchedule(shown), detail = records.find(record => record.id === detailId);
  const baseTotals = new Map<string, number>();
  for (const row of bases.filter(row => !level || row.level === level)) for (const item of [row.field, ...row.accents]) baseTotals.set(item.tag, (baseTotals.get(item.tag) ?? 0) + item.lf);
  return <details className="ms-room-schedule ms-wall-schedule"><summary><span><span className="ms-section-label">WALL FACES, FINISH BANDS AND BASE</span><strong>Room wall finish schedule</strong></span><small>{current.length} records · {current.filter(record => record.status !== "assigned").length} unresolved / listed only</small><ChevronDown size={16}/></summary>
    <p>Located faces can still have unmeasured heights or widths. SF covers dimensioned bands only; it is not a complete wall-finish takeoff. Graphics, untraced walls and conflicts remain listed. WB-02 / WB-03 replace supported WB-01 runs only.</p>
    <div className="ms-base-totals" aria-label="Gross base totals by type">{[...baseTotals].map(([tag, lf]) => <span key={tag}><strong>{tag}</strong> {number.format(lf)} LF</span>)}</div>
    <div className="ms-door-filters"><label><Search size={14}/><input aria-label="Search wall finishes" value={query} onChange={event => setQuery(event.target.value)} placeholder="Room, finish tag or source sheet…"/></label><select aria-label="Filter wall finish coverage" value={status} onChange={event => setStatus(event.target.value)}><option value="">All finish records</option>{Object.entries(wallFinishStatus).map(([value, label]) => <option value={value} key={value}>{label}</option>)}<option value="conflicts">Source conflicts</option></select><span>{shown.length} shown</span></div>
    <div className="ms-room-scroll"><table><thead><tr><th scope="col">Room / level</th><th scope="col">Wall face / evidence</th><th scope="col">Finish bands</th><th scope="col">Located run</th><th scope="col">Dimensioned band SF</th><th scope="col">Coverage</th></tr></thead><tbody>{schedule.flatMap(row => row.recordIds.map(id => { const record = records.find(item => item.id === id)!; return <tr key={id}><th scope="row">{row.room ?? "Unnumbered"}<small>{row.level === "L2" ? "Level 02" : "Level 01"}</small></th><td><button aria-label={`Review wall finish ${record.title}`} onClick={() => setDetailId(id)}><strong>{record.title}</strong><small>{record.evidence.map(source => source.sheet).filter((sheet, i, sheets) => sheets.indexOf(sheet) === i).join(" · ")}</small><ArrowUpRight size={12}/></button></td><td>{record.bands.map((band, i) => <span key={i}>{band.tags.join(" / ")}</span>)}{record.base?.tag && <small>Base note: {record.base.tag}</small>}</td><td>{record.lengthFt === null ? "Not measured" : `${number.format(record.lengthFt)} LF`}</td><td>{record.bands.map((band, i) => <span key={i}>{band.areaSf === null ? "Not measured" : `${number.format(band.areaSf)} SF`}<small>{band.tags.join(" / ")}</small></span>)}</td><td><span className={`ms-hardware-badge ${record.status !== "assigned" ? "conflict" : ""}`}>{wallFinishStatus[record.status]}</span>{!!record.conflicts.length && <small>{record.conflicts.length} source difference{record.conflicts.length === 1 ? "" : "s"}</small>}</td></tr>; }))}</tbody></table></div>
    {!shown.length && <p className="ms-door-empty">No wall finishes match these filters.</p>}
    <details className="ms-ceiling-coverage"><summary>Coverage gaps and excluded accessories</summary><ul>{wallFinishGaps.map(text => <li key={text}>{text}</li>)}</ul><ul>{excludedFinishTags.filter(item => !level || item.level === level).map((item, i) => <li key={i}><strong>{item.level} · {item.tag} · {item.source}</strong> {item.reason}</li>)}</ul></details>
    {detail && createPortal(<Modal title={detail.title} subtitle="Wall finish evidence and measurement basis" onClose={() => setDetailId(null)}><FinishDetails record={detail} onSource={(record, source) => { setDetailId(null); onSource(record, source); }}/><div className="ms-dialog-actions">{detail.wallIds.map(id => <button key={id} onClick={() => { setDetailId(null); onInspect(id); }}>Inspect {id}</button>)}<button onClick={() => setDetailId(null)}>Close</button></div></Modal>, document.body)}
  </details>;
}

"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Download, FileText, Layers3 } from "lucide-react";
import { finishScheduleRows } from "../../lib/jelleff-model";
import { CSI_DIVISIONS } from "../../lib/csi";
import { LEVELS, reviewStatus } from "../../lib/model";
import { useActiveProject } from "../../lib/project-scope";
import { useModelReview } from "../../lib/use-model-review";
import { usePreparedModel } from "../../lib/use-prepared-model";
import { getActiveProjectId } from "../../lib/project-scope";
import { Badge, Button, Empty, Panel, SearchBox, Stats, exportRows } from "./shared";
import { DEFAULT_QUANTITY_FILTERS, QUANTITY_CATEGORIES, filterModelQuantityRows, modelQuantityCsv, modelQuantityRows, type ModelInspection, type ModelQuantityFilters, type ModelQuantityRow } from "./model-quantity-rows";

export type ModelQuantityProps = { quantityFilters: ModelQuantityFilters; onQuantityFilters: (filters: ModelQuantityFilters) => void; onInspectModel: (target: ModelInspection) => void };
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const reviewLabels = { unreviewed: "Not reviewed", verified: "Verified", flagged: "Needs checking" };

export function ModelQuantityTakeoffs({ quantityFilters: filters, onQuantityFilters: setFilters, onInspectModel, onPrice, priceLabel, isPriced }: ModelQuantityProps & { onPrice?: (row: ModelQuantityRow) => void; priceLabel?: string; isPriced?: (row: ModelQuantityRow) => boolean }) {
  const projectId = useActiveProject(), { state } = useModelReview();
  const prepared = usePreparedModel(projectId), objects = prepared.objects, [importError, setImportError] = useState("");
  const rows = useMemo(() => modelQuantityRows(objects, prepared.records, prepared.bases, finishScheduleRows), [objects, prepared.records, prepared.bases]);
  const visible = filterModelQuantityRows(rows, filters, state);
  const categoryRows = rows.filter(row => !filters.category || row.category === filters.category);
  const materials = [...new Set(categoryRows.map(row => row.material))].sort(), rooms = [...new Set(rows.flatMap(row => row.rooms))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const divisions = [...new Set(categoryRows.map(row => row.division).filter(Boolean))].sort();
  const groups = Object.entries(QUANTITY_CATEGORIES).map(([id, label]) => ({ id, label, rows: visible.filter(row => row.category === id) })).filter(group => group.rows.length);
  function open(row: ModelQuantityRow, source = false) { onInspectModel({ projectId, level: row.level, objectId: row.objectId, finishId: row.finishId, source: source || !row.objectId ? row.sources[0] : undefined }); }
  if (!objects.length) return <Panel><Empty title="No prepared model quantities for this project" description="This view reads the selected project's prepared interior model. Open Estimate items to enter your own measurements. Uploading a drawing does not generate a model yet."/></Panel>;
  return <div className="mq-workspace">
    <details className="ai-reader"><summary>Local drywall model measurements</summary><p>Load privately traced FRP and sound-panel bands in SF and one point per physical corner guard in EA. The measurements use this project's prepared host walls. Loading does not verify them or publish them.</p><label className="ui-field">Local measurement file<input type="file" accept=".json,application/json" onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return; setImportError("");
      try { if (file.size > 2_000_000) throw new Error("Choose a measurement file of at most 2 MB."); const data = JSON.parse(await file.text()); if (projectId !== getActiveProjectId()) return; prepared.importMeasurements(data); setFilters({ ...DEFAULT_QUANTITY_FILTERS, category: "" }); }
      catch (error) { setImportError(error instanceof Error ? error.message : "The measurement file could not be loaded."); }
    }}/></label>{(importError || prepared.error) && <p role="alert">{importError || prepared.error}</p>}<p>{prepared.data.finishes.length} local finish records · {prepared.data.cornerGuards.length} physical guards. Model and estimate views use the same saved measurements; pricing remains separate.</p></details>
    <Stats items={[{ label: "Interior objects", value: rows.filter(row => !["base", "wall-finish"].includes(row.category)).length, detail: "Prepared model measurements" }, { label: "Quantity rows", value: rows.length, detail: "Objects, finish bands and base splits" }, { label: "Unmeasured bands", value: rows.filter(row => row.value === null).length, detail: "Retained with source evidence", tone: "orange" }, { label: "Matching rows", value: visible.length, detail: "Current filters · export matches" }]}/>
    <Panel title="Model quantities" subtitle="Read the same quantities used by the interior model and its room schedules." action={<Button disabled={!visible.length} onClick={() => exportRows("interior-model-quantities.csv", modelQuantityCsv(visible, state))}><Download size={15}/>Export filtered CSV</Button>}>
      <div className="mq-filters"><SearchBox value={filters.query} onChange={query => setFilters({ ...filters, query })} placeholder="Search model quantities…"/>
        <label>Category<select aria-label="Model quantity category" value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value, material: "", division: "" })}><option value="">All categories</option>{Object.entries(QUANTITY_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Level<select aria-label="Model quantity level" value={filters.level} onChange={event => setFilters({ ...filters, level: event.target.value })}><option value="">Both levels</option>{LEVELS.filter(level => level.id !== "roof").map(level => <option value={level.id} key={level.id}>{level.name}</option>)}</select></label>
        <label>Room<select aria-label="Model quantity room" value={filters.room} onChange={event => setFilters({ ...filters, room: event.target.value })}><option value="">All rooms</option><option value="unnumbered">Unnumbered</option>{rooms.map(room => <option key={room} value={room}>{room}</option>)}</select></label>
        <label>Trade<select aria-label="Model quantity division" value={filters.division} onChange={event => setFilters({ ...filters, division: event.target.value })}><option value="">All divisions</option>{divisions.map(id => <option key={id} value={id}>{id} · {CSI_DIVISIONS[id]}</option>)}</select></label>
        <label>Material / finish<select aria-label="Model quantity material" value={filters.material} onChange={event => setFilters({ ...filters, material: event.target.value })}><option value="">All materials</option>{materials.map(material => <option key={material}>{material}</option>)}</select></label>
        <label>Model review<select aria-label="Model quantity review" value={filters.review} onChange={event => setFilters({ ...filters, review: event.target.value })}><option value="">All review states</option>{Object.entries(reviewLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
        <label>Evidence<select aria-label="Model quantity evidence" value={filters.coverage} onChange={event => setFilters({ ...filters, coverage: event.target.value })}><option value="">All evidence</option><option value="unmeasured">Not measured</option><option value="attention">Unassigned / conflicts / illustrative</option></select></label>
        <Button onClick={() => setFilters(DEFAULT_QUANTITY_FILTERS)}>Reset filters</Button>
      </div>
      <div className="mq-basis"><Layers3 size={17}/><p>Read-only quantities from the prepared model. Base runs are gross; door openings are not deducted. Wall construction and wall finish bands are separate categories. SF is shown for finish bands only where the sources support both dimensions. Model reviews apply to the referenced object; they do not resolve drawing conflicts.</p></div>
      {groups.map(group => <section className="mq-group" key={group.id}><header><h2>{group.label}</h2><Badge>{group.rows.length} rows</Badge></header><div className="ui-table-wrap"><table className="ui-table mq-table"><thead><tr><th scope="col">Item / product</th><th scope="col">Room / level</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Measurement basis</th><th scope="col">Model review</th><th scope="col">Evidence</th>{onPrice && <th scope="col">Estimate</th>}</tr></thead><tbody>{group.rows.map(row => {
        const reviewed = row.objectId ? reviewStatus(state, row.objectId) : null;
        return <tr key={row.id}><th scope="row"><button className="mq-item" aria-label={`${row.objectId ? "Inspect" : "View evidence for"} ${row.label} ${row.tag}`} onClick={() => open(row)}><strong>{row.label}</strong><ArrowUpRight size={13}/></button><small>{row.tag || "No finish / type tag"} · {row.division ? `${row.division} ${CSI_DIVISIONS[row.division]}` : "Not classified"}</small><small>{row.product}</small>{row.color && <small>{row.color}</small>}</th><td>{row.rooms.join(" ↔ ") || "Unnumbered"}<small>{LEVELS.find(level => level.id === row.level)?.name}</small></td><td className={row.value === null ? "mq-unmeasured" : "mq-value"}>{row.value === null ? "Not measured" : number.format(row.value)}</td><td>{row.unit}</td><td><span className={row.warning ? "mq-warning" : ""}>{row.basis}</span>{row.notes && <details><summary>Measurement notes</summary><p>{row.notes}</p></details>}</td><td>{reviewed ? <Badge tone={reviewed === "verified" ? "green" : reviewed === "flagged" ? "orange" : "neutral"}>{reviewLabels[reviewed]}</Badge> : "No model object"}{row.category === "wall-finish" && reviewed && <small>Host wall review</small>}{row.category === "base" && reviewed && <small>Floor object review</small>}</td><td>{row.sources[0] ? <button className="mq-source" aria-label={`Open source for ${row.label} ${row.tag}`} onClick={() => open(row, true)}><FileText size={14}/><span>{row.sources[0].sheet}<small>Page {row.sources[0].page}</small></span><ArrowUpRight size={12}/></button> : "No source"}</td>{onPrice && <td><Button disabled={row.value === null || row.value <= 0 || !!isPriced?.(row)} onClick={() => onPrice(row)}>{isPriced?.(row) ? "Already in estimate" : priceLabel ?? "Price quantity"}</Button></td>}</tr>;
      })}</tbody></table></div></section>)}
      {!visible.length && <Empty title="No matching model quantities" description="Change the category, room or evidence filters, or reset them to show floor zones."/>}
    </Panel>
  </div>;
}

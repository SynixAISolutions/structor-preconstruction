"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useEstimate } from "../../lib/use-estimate";
import { addAcceptedQuantity, addEstimateItem, addModelQuantity, editEstimateItem, lineAmount, modelDrift, removeEstimateItem, setItemReviewed, type EstimateItemInput, type TradeEstimate } from "../../lib/estimate";
import type { TakeoffRow } from "../../lib/data/preconstruction";
import { initialSpecSections } from "../../lib/data/preconstruction";
import { sampleExtraction } from "../../lib/data/extraction";
import type { QuantityDraft } from "../../lib/extraction";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useActiveProject, SAMPLE_PROJECT_ID } from "../../lib/project-scope";
import { finishScheduleRows, modelForProject, wallBaseBreakdown, wallFinishRecords } from "../../lib/jelleff-model";
import { useDrawingFlip } from "../../lib/use-drawing-flip";
import { scopeSources } from "../../lib/scope-sources";
import { ModelQuantityTakeoffs, type ModelQuantityProps } from "./model-quantity-takeoffs";
import { modelQuantityRows, type ModelQuantityRow } from "./model-quantity-rows";
import { ScopeSourceDialog } from "./scope-source-dialog";
import { findingCitationSources } from "./extraction-citations";
import { tradeColors } from "./drawing-flip-ui";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, PreviewNote, SearchBox, Stats, Tabs, exportRows, type ViewProps } from "./shared";
import { estimateMoney, unitRate } from "./estimate-format";
import "./trade-estimates.css";

type Estimate = ReturnType<typeof useEstimate>;
type Editor = { kind: "manual"; packageId: string | null; row?: TakeoffRow } | { kind: "model"; packageId: string; row: ModelQuantityRow } | { kind: "ai"; packageId: string; row: QuantityDraft };

export function TradeEstimateList({ trades, unassigned, onOpen }: { trades: TradeEstimate[]; unassigned: number; onOpen: (id: string) => void }) {
  return <Panel title="Trade estimates" subtitle="Open a trade to price and review its quantity items."><div className="ui-table-wrap"><table className="ui-table est-trade-table"><thead><tr><th>Trade</th><th>Assigned estimator</th><th>Items</th><th>MCN estimate</th><th>Review</th><th/></tr></thead><tbody>{trades.map(trade => <tr key={trade.packageId}><th scope="row"><button className="est-trade-link" onClick={() => onOpen(trade.packageId)}><span>{trade.code}</span><strong>{trade.name}</strong></button></th><td data-label="Estimator">{trade.owner || "Unassigned"}</td><td data-label="Items">{trade.items.length}</td><td data-label="MCN estimate" className="est-money">{trade.items.length ? estimateMoney(trade.total) : "Not started"}</td><td data-label="Review">{trade.items.length ? <><Badge tone={trade.unreviewed ? "amber" : "green"}>{trade.unreviewed ? `${trade.unreviewed} ${trade.unreviewed === 1 ? "needs" : "need"} review` : "Reviewed"}</Badge>{trade.unpriced > 0 && <small>{trade.unpriced} unpriced</small>}</> : "No items"}</td><td className="est-open"><Button onClick={() => onOpen(trade.packageId)}>Open trade<ArrowRight size={13}/></Button></td></tr>)}</tbody></table></div>{!trades.length && <Empty title="No trade packages yet" description="Trade estimates appear when packages are added to this project."/>}{unassigned > 0 && <div className="est-unassigned"><span>{unassigned} saved item{unassigned === 1 ? " needs" : "s need"} a trade assignment.</span><Button onClick={() => onOpen("unassigned")}>Review unassigned items</Button></div>}</Panel>;
}

function EstimateEditor({ editor, estimate, onClose, onSaved, notify, sample }: { editor: Editor; estimate: Estimate; onClose: () => void; onSaved: (packageId: string | null) => void; notify: ViewProps["notify"]; sample: boolean }) {
  const row = editor.row;
  const [value, setValue] = useState<EstimateItemInput>({ packageId: editor.packageId, item: row ? "item" in row ? row.item : row.label : "", unit: row?.unit ?? "EA", quantity: row ? "quantity" in row ? row.quantity : row.value ?? 0 : 1, rate: row && "rate" in row ? row.rate : 0, source: row ? "source" in row ? row.source : "sources" in row ? row.sources.map(s => `${s.sheet} · p. ${s.page} · ${s.detail}`).join(" | ") : row.citations.map(c => `${c.sheet ?? c.document} · p. ${c.page}`).join(" | ") : "" });
  const [error, setError] = useState("");
  const manual = editor.kind === "manual";
  const itemAmount = lineAmount(value);
  function save(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(itemAmount)) { setError("Enter a quantity and rate that produce a finite amount."); return; }
    const message = estimate.run(rows => editor.kind === "model" ? addModelQuantity(rows, estimate.procurement, editor.packageId, { rowId: editor.row.id, label: editor.row.label, unit: editor.row.unit, value: editor.row.value, source: value.source ?? "" }, value.rate) : editor.kind === "ai" ? addAcceptedQuantity(rows, estimate.procurement, editor.row, value.rate) : editor.row ? editEstimateItem(rows, estimate.procurement, editor.row.id, value) : addEstimateItem(rows, estimate.procurement, value));
    if (message) setError(message); else { notify("Estimate item saved for review."); onSaved(value.packageId); }
  }
  return <Modal title={manual && editor.row ? "Edit estimate item" : "Add estimate item"} subtitle={manual ? "Quantity or price changes require a fresh review." : "Copies the source quantity into this trade's estimate. Set your unit rate."} onClose={onClose}><form onSubmit={save}>
    <label className="ui-field">Trade package<select disabled={!manual} value={value.packageId ?? ""} onChange={e => setValue({ ...value, packageId: e.target.value || null })}><option value="">Unassigned</option>{estimate.procurement.packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
    <label className="ui-field">Item description<input required readOnly={!manual} value={value.item} onChange={e => setValue({ ...value, item: e.target.value })}/></label>
    <div className="ui-form-grid"><label className="ui-field">Quantity<input type="number" required readOnly={!manual} min="0" step="any" value={value.quantity} onChange={e => setValue({ ...value, quantity: Number(e.target.value) })}/></label><label className="ui-field">Unit<input required readOnly={!manual} list="estimate-units" value={value.unit} onChange={e => setValue({ ...value, unit: e.target.value })}/><datalist id="estimate-units">{["EA", "LF", "SF", "CY", "TON", "LS"].map(unit => <option key={unit}>{unit}</option>)}</datalist></label><label className="ui-field">Unit rate · USD<input type="number" required min="0" step="any" value={value.rate} onChange={e => setValue({ ...value, rate: Number(e.target.value) })}/></label><label className="ui-field">Source reference<input readOnly={!manual} value={value.source} onChange={e => setValue({ ...value, source: e.target.value })}/></label></div>
    <p className="est-editor-total">Item amount: <strong>{Number.isFinite(itemAmount) ? estimateMoney(itemAmount) : "Amount unavailable"}</strong>{value.rate === 0 && <small>Unpriced until a unit rate is entered.</small>}</p>
    {editor.kind === "model" && <p className="proc-modal-note">{editor.row.basis}{editor.row.warning ? " · Check the source warning before relying on this quantity." : ""}</p>}
    {editor.kind === "ai" && <PreviewNote>{sample ? "Illustrative sample — no documents were read. " : ""}Accepted finding · Review its citations in Scopes & bid forms before pricing.</PreviewNote>}
    {error && <p role="alert" className="proc-source-error">{error}</p>}<div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">{manual && editor.row ? "Save changes" : "Add item"}</Button></div>
  </form></Modal>;
}

export function TradeEstimatesView(props: ViewProps & ModelQuantityProps) {
  const { projectName, notify, navigate } = props;
  const estimate = useEstimate();
  const viewRef = useRef<HTMLDivElement>(null);
  const projectId = useActiveProject();
  const [packageId, setPackageId] = useState<string | null>(null);
  useEffect(() => {
    const heading = viewRef.current?.querySelector<HTMLElement>(packageId ? ".est-trade-heading h2" : ".ui-page-header h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    viewRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [packageId]);
  const [tab, setTab] = useState("Estimate items");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<TakeoffRow | null>(null);
  const [source, setSource] = useState<TakeoffRow | null>(null);
  const [extraction] = useLocalDraft("extraction", sampleExtraction);
  const [sections] = useLocalDraft("specification-sections", initialSpecSections);
  const { state: flip } = useDrawingFlip();
  const modelRows = useMemo(() => modelQuantityRows(modelForProject(projectId), projectId === SAMPLE_PROJECT_ID ? wallFinishRecords : [], projectId === SAMPLE_PROJECT_ID ? wallBaseBreakdown : [], finishScheduleRows), [projectId]);
  const modelById = new Map(modelRows.map(row => [row.id, row]));
  const trade = estimate.byTrade.trades.find(t => t.packageId === packageId);
  const items = packageId === "unassigned" ? estimate.byTrade.unassigned : trade?.items ?? [];
  const visible = items.filter(row => `${row.item} ${row.source} ${row.unit}`.toLowerCase().includes(query.toLowerCase()));
  const accepted = extraction.drafts.filter((draft): draft is QuantityDraft => draft.kind === "quantity" && draft.status === "accepted" && draft.packageId === packageId);
  const colors = new Map(estimate.procurement.packages.map((pkg, i) => [pkg.id, tradeColors[i % tradeColors.length]]));
  const sourceFinding = source?.origin?.kind === "ai" ? extraction.drafts.find(draft => source.origin?.kind === "ai" && draft.id === source.origin.draftId) : undefined;
  const citation = sourceFinding?.citations[0];
  const sources = source ? sourceFinding && citation ? findingCitationSources(sourceFinding, citation, flip, sections) : scopeSources({ id: source.id, source: source.source }, flip, sections) : null;
  function openSource(row: TakeoffRow) {
    const model = row.origin?.kind === "model" ? modelById.get(row.origin.rowId) : undefined;
    if (model) props.onInspectModel({ projectId, level: model.level, objectId: model.objectId, finishId: model.finishId, source: model.sources[0] });
    else setSource(row);
  }
  function open(id: string) { setPackageId(id); setQuery(""); setTab("Estimate items"); }
  const inTrade = !!trade || packageId === "unassigned";
  return <div ref={viewRef} className="intel-view est-view"><PageHeader eyebrow={`${projectName} / Preconstruction budget`} title="Quantity takeoffs" description="Build MCN's direct-cost estimate inside each trade." actions={<><Button onClick={() => navigate("budget")}>Budget & variance<ArrowRight size={14}/></Button><ExportButton onClick={() => exportRows("trade-estimates.csv", [["Trade", "Estimator", "Item", "Unit", "Quantity", "Unit rate", "Amount", "Source", "Origin", "Reviewed"], ...estimate.rows.map(row => { const pkg = estimate.procurement.packages.find(p => p.id === row.packageId); return [pkg?.name ?? "Unassigned", pkg?.owner ?? "", row.item, row.unit, row.quantity, row.rate, lineAmount(row), row.source, row.origin?.kind ?? "manual", row.reviewed ? "Yes" : "No"]; })])}/></>}/>
    <PreviewNote>{projectId === SAMPLE_PROJECT_ID ? "Demo starts with illustrative quantities and rates. " : ""}Direct-cost planning estimate · Indirect costs, markups and allowances are managed separately.</PreviewNote>
    {!inTrade ? <><Stats items={[{ label: "Trade packages", value: estimate.byTrade.trades.length, detail: "Assigned estimator per trade" }, { label: "Estimate items", value: estimate.rows.length }, { label: "Workbook total", value: estimateMoney(estimate.byTrade.total), detail: "Includes unassigned items" }, { label: "Unassigned items", value: estimate.byTrade.unassigned.length, tone: estimate.byTrade.unassigned.length ? "orange" : "green" }]}/><TradeEstimateList trades={estimate.byTrade.trades} unassigned={estimate.byTrade.unassigned.length} onOpen={open}/></> : <>
      <div className="est-trade-heading"><Button onClick={() => setPackageId(null)}><ArrowLeft size={14}/>Back to trades</Button><div><h2>{trade?.name ?? "Unassigned items"}</h2><p>{trade ? `${trade.code} · Estimator: ${trade.owner || "Unassigned"}` : "Assign these saved items to the correct trade."}</p></div>{trade && <strong>MCN estimate <span>{estimateMoney(trade.total)}</span></strong>}</div>
      {trade && <Tabs tabs={["Estimate items", "Model quantities", "Accepted AI quantities"]} value={tab} onChange={setTab}/>}
      {tab === "Model quantities" && trade ? <ModelQuantityTakeoffs {...props} onPrice={row => setEditor({ kind: "model", packageId: trade.packageId, row })} priceLabel={`Add to ${trade.name} estimate`} isPriced={row => items.some(item => item.origin?.kind === "model" && item.origin.rowId === row.id)}/> : tab === "Accepted AI quantities" && trade ? <Panel title="Accepted AI quantities" subtitle="Findings stay in review until accepted in Scopes & bid forms.">{accepted.map(draft => { const added = estimate.rows.some(row => row.origin?.kind === "ai" && row.origin.draftId === draft.id); const sample = extraction.runs.find(run => run.id === draft.runId)?.engine.mode === "sample"; return <article key={draft.id} className="est-ai-quantity"><div><strong>{draft.item}</strong><p>{draft.quantity.toLocaleString()} {draft.unit} · {draft.basis}</p>{sample && <Badge tone="amber">Illustrative sample</Badge>}<small>{draft.citations.map(c => `${c.sheet ?? c.document} · p. ${c.page}`).join(" | ")}</small></div><Button disabled={added} onClick={() => setEditor({ kind: "ai", packageId: trade.packageId, row: draft })}>{added ? "Already in estimate" : "Price quantity"}</Button></article>; })}{!accepted.length && <Empty title="No accepted quantities for this trade" description="Review and accept quantity findings in Scopes & bid forms first." action={<Button onClick={() => navigate("scopes")}>Review AI findings</Button>}/>}</Panel> : <Panel title={trade ? `${trade.name} estimate items` : "Unassigned estimate items"} subtitle={trade ? `${trade.unreviewed} need review · ${trade.unpriced} unpriced · Editing quantities or rates clears review.` : "Edit an item to choose its trade."} action={trade && <Button variant="primary" onClick={() => setEditor({ kind: "manual", packageId: trade.packageId })}><Plus size={14}/>Add item</Button>}>
        <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search this trade's items…"/></div><div className="ui-table-wrap"><table className="ui-table est-item-table"><thead><tr><th>Item / source</th><th>Quantity</th><th>Unit rate</th><th>Amount</th><th>Review</th><th>Actions</th></tr></thead><tbody>{visible.map(row => { const currentModel = row.origin?.kind === "model" ? modelById.get(row.origin.rowId) : null; const drift = modelDrift(row, currentModel?.value ?? null); return <tr key={row.id}><th scope="row"><strong>{row.item}</strong><small>{row.origin?.kind === "model" ? "Model quantity snapshot" : row.origin?.kind === "ai" ? "Accepted AI finding" : "Manual item"}</small>{row.source && <button className="est-source" onClick={() => openSource(row)}><FileText size={12}/>{row.source}</button>}{drift !== null && <small className="est-warning">Model changed to {drift.toLocaleString()} {row.unit}; the estimate keeps its saved quantity.</small>}{row.origin?.kind === "model" && !currentModel && <small className="est-warning">Model source is currently unavailable.</small>}</th><td data-label="Quantity">{row.quantity.toLocaleString()} {row.unit}</td><td data-label="Unit rate">{unitRate(row.rate)}{row.rate === 0 && <small className="est-warning">Unpriced</small>}</td><td data-label="Amount" className="est-money">{estimateMoney(lineAmount(row))}</td><td data-label="Review"><Button onClick={() => { const message = estimate.run(rows => setItemReviewed(rows, row.id, !row.reviewed)); notify(message ?? (row.reviewed ? "Item reopened for review." : "Estimate item reviewed.")); }}>{row.reviewed ? <><Check size={13}/>Reviewed</> : "Mark reviewed"}</Button></td><td data-label="Actions"><div className="est-row-actions"><button className="ui-icon-btn" aria-label={`Edit ${row.item}`} onClick={() => setEditor({ kind: "manual", packageId: row.packageId ?? null, row })}><Pencil size={14}/></button><button className="ui-icon-btn" aria-label={`Remove ${row.item}`} onClick={() => setRemoving(row)}><Trash2 size={14}/></button></div></td></tr>; })}</tbody>{trade && <tfoot><tr><td colSpan={3}>Entire trade estimate</td><td colSpan={3}>{estimateMoney(trade.total)}</td></tr></tfoot>}</table></div>{!visible.length && <Empty title={items.length ? "No items match" : "No estimate items yet"} description={items.length ? "Change your search to see this trade's items." : "Add a manual item, price a model quantity, or price an accepted AI finding."}/>}</Panel>}
    </>}
    {editor && <EstimateEditor editor={editor} sample={editor.kind === "ai" && extraction.runs.find(run => run.id === editor.row.runId)?.engine.mode === "sample"} estimate={estimate} notify={notify} onClose={() => setEditor(null)} onSaved={id => { setEditor(null); if (id !== trade?.packageId && id !== (packageId === "unassigned" ? null : packageId)) open(id ?? "unassigned"); }}/>}
    {removing && <Modal title="Remove estimate item" subtitle={removing.item} onClose={() => setRemoving(null)}><p className="proc-modal-note">This removes the priced line from MCN's estimate. Its source model or AI finding remains available.</p><div className="proc-form-actions"><Button onClick={() => setRemoving(null)}>Cancel</Button><Button onClick={() => { const message = estimate.run(rows => removeEstimateItem(rows, removing.id)); if (message) notify(message); else { notify("Estimate item removed."); setRemoving(null); } }}>Remove item</Button></div></Modal>}
    {source && sources && <ScopeSourceDialog title={source.item} sources={sources} kind={citation ? citation.sheet ? "drawings" : "spec" : sources.spec ? "spec" : "drawings"} colors={colors} citation={citation} sample={sourceFinding && extraction.runs.find(run => run.id === sourceFinding.runId)?.engine.mode === "sample"} onClose={() => setSource(null)}/>}
  </div>;
}

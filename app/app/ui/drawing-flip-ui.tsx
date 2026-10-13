"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  FilePlus2,
  History,
  Link2,
  ListFilter,
  LocateFixed,
  Maximize2,
  MousePointer2,
  PencilRuler,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Unlink,
  UserRound,
} from "lucide-react";
import {
  addPage,
  addRegion,
  approveRegion,
  corrections,
  editRegionNotes,
  filterRegions,
  flipSummary,
  linkScope,
  rectangle,
  regionsForScope,
  reassignRegion,
  tradeLegend,
  unlinkScope,
  unlocatedScopes,
  type DrawingFlipErrors,
  type DrawingPage,
  type FlipRegion,
  type RegionOrigin,
  type RegionStatus,
} from "../../lib/drawing-flip";
import { displayDate } from "../../lib/format";
import { useDrawingFlip } from "../../lib/use-drawing-flip";
import { useProcurement } from "../../lib/use-procurement";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Stats, type ViewProps } from "./shared";
import "./drawing-flip-ui.css";

const CURRENT_USER = "Marcel Khoury";
export const tradeColors = ["#e27f4b", "#4e8ca6", "#8b70aa", "#54a078", "#c99a46", "#c76464", "#657eae", "#8b9870"];
const firstError = (errors: DrawingFlipErrors) => Object.values(errors)[0] ?? "Review the highlighted fields.";
const activityDate = (value: string | null) => value ? displayDate(value.slice(0, 10)) : "Not set";
const eventLabel = (kind: FlipRegion["history"][number]["kind"]) => ({
  created: "Region created",
  approved: "Trade assignment approved",
  reassigned: "Trade assignment corrected",
  linked: "Scope item linked",
  unlinked: "Scope item unlinked",
  notes: "Review notes updated",
})[kind];

type Filters = { query: string; packageId: string; status: "" | RegionStatus; origin: "" | RegionOrigin; corrected: boolean };
type PageDraft = { sheet: string; title: string; discipline: string; revision: string; documentId: string; documentName: string; pageNumber: string };
type RegionDraft = { label: string; packageId: string; x: string; y: string; width: string; height: string; notes: string };

function DrawingBackdrop({ page }: { page: DrawingPage }) {
  if (page.image) return <image href={page.image} x="0" y="0" width="1000" height="667" preserveAspectRatio="xMidYMid meet"/>;
  return <g className="flip-linework">
    <defs><pattern id={`flip-grid-${page.id}`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28"/></pattern></defs>
    <rect width="1000" height="667" fill="#fbfcfb"/>
    <rect x="18" y="18" width="964" height="631" fill={`url(#flip-grid-${page.id})`} stroke="#b9c4cb"/>
    <path className="flip-wall" d="M115 115H842V492H115ZM115 304H842M305 115V304M507 115V492M682 115V304M260 304V492M682 304V492"/>
    <path d="M144 143h128v57H144zm194 0h134v109H338zm205 0h105v109H543zm174 0h92v109h-92zM144 341h82v110h-82zm151 0h177v110H295zm248 0h105v110H543zm174 0h92v110h-92z"/>
    <path d="M111 86H846M111 78V94M305 78V94M507 78V94M682 78V94M846 78V94M80 115V492M72 115H88M72 304H88M72 492H88"/>
    <path d="M186 115v42a42 42 0 0 0 42-42M507 238h-42a42 42 0 0 0 42 42M682 375h42a42 42 0 0 0-42-42M260 418h-42a42 42 0 0 0 42 42"/>
    <g className="flip-room-labels"><text x="210" y="285">ROOM 101</text><text x="405" y="285">MULTIPURPOSE</text><text x="595" y="285">OFFICE</text><text x="760" y="285">COMMUNITY</text><text x="187" y="477">SERVICE</text><text x="385" y="477">LOBBY</text><text x="595" y="477">MEETING</text><text x="760" y="477">RECEPTION</text></g>
    <g className="flip-titleblock"><path d="M674 535h268v91H674zM790 535v91M674 574h268"/><text x="692" y="558">{page.documentName || "PROJECT DRAWING SET"}</text><text x="692" y="597">{page.title || page.discipline}</text><text x="812" y="610" className="sheet">{page.sheet}</text></g>
    <text x="55" y="55" className="flip-demo-note">ILLUSTRATIVE LINEWORK · SOURCE IMAGE NOT LOADED</text>
  </g>;
}

export function DrawingCanvas({ page, regions, selectedId, colors, onSelect, expandable = true }: {
  page: DrawingPage;
  regions: FlipRegion[];
  selectedId: string;
  colors: Map<string, string>;
  onSelect: (id: string) => void;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const drawing = <svg viewBox="0 0 1000 667" role="img" aria-label={`${page.sheet} with ${regions.length} trade regions`}>
    <DrawingBackdrop page={page}/>
    <g className="flip-region-layer">{regions.map(region => {
      const points = region.polygon.map(point => `${point.x * 1000},${point.y * 667}`).join(" ");
      const centerX = region.polygon.reduce((sum, point) => sum + point.x, 0) / region.polygon.length * 1000;
      const centerY = region.polygon.reduce((sum, point) => sum + point.y, 0) / region.polygon.length * 667;
      const color = colors.get(region.packageId) ?? "#697b8c";
      return <g key={region.id} role="button" tabIndex={0} aria-label={`${region.number}: ${region.label}`} className={`${selectedId === region.id ? "selected" : ""} ${region.status === "pending-review" ? "pending" : ""}`} onClick={() => onSelect(region.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(region.id); } }}>
        <polygon points={points} fill={`${color}30`} stroke={color}/>
        <circle cx={centerX} cy={centerY} r="16" fill={color}/>
        <text x={centerX} y={centerY + 4}>{region.number.replace("R-", "")}</text>
      </g>;
    })}</g>
  </svg>;
  return <>
    <div className="flip-canvas-wrap">
      <div className="flip-sheet">{drawing}</div>
      {expandable && <button className="flip-expand" onClick={() => setExpanded(true)} aria-label="Expand drawing"><Maximize2 size={16}/></button>}
      {!page.image && <span className="flip-image-state"><PencilRuler size={13}/>Diagram preview</span>}
    </div>
    {expanded && <Modal title={`${page.sheet} · ${page.title}`} subtitle="Trade regions stay linked as the drawing scales." wide onClose={() => setExpanded(false)}><div className="flip-expanded">{drawing}</div></Modal>}
  </>;
}

function PageEditor({ errors, onClose, onSave }: { errors: DrawingFlipErrors; onClose: () => void; onSave: (draft: PageDraft) => void }) {
  const [draft, setDraft] = useState<PageDraft>({ sheet: "", title: "", discipline: "Architectural", revision: "", documentId: "drawing-set", documentName: "Project drawing set.pdf", pageNumber: "1" });
  return <Modal title="Add a drawing page" subtitle="Connect one sheet to its source file and page number." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    {Object.keys(errors).length > 0 && <div className="flip-error"><CircleDot size={15}/>{firstError(errors)}</div>}
    <div className="ui-form-grid"><label className="ui-field">Sheet number<input autoFocus required value={draft.sheet} onChange={event => setDraft({ ...draft, sheet: event.target.value })} placeholder="A-101"/></label><label className="ui-field">Revision<input value={draft.revision} onChange={event => setDraft({ ...draft, revision: event.target.value })} placeholder="02"/></label></div>
    <label className="ui-field">Drawing title<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="First floor plan"/></label>
    <div className="ui-form-grid"><label className="ui-field">Discipline<input value={draft.discipline} onChange={event => setDraft({ ...draft, discipline: event.target.value })}/></label><label className="ui-field">PDF page<input type="number" min="1" required value={draft.pageNumber} onChange={event => setDraft({ ...draft, pageNumber: event.target.value })}/></label></div>
    <label className="ui-field">Source document<input required value={draft.documentName} onChange={event => setDraft({ ...draft, documentName: event.target.value, documentId: event.target.value.trim().toLowerCase().replace(/\W+/g, "-") || "drawing-set" })}/></label>
    <div className="flip-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add page</Button></div>
  </form></Modal>;
}

function RegionEditor({ packages, errors, onClose, onSave }: { packages: ReturnType<typeof useProcurement>["state"]["packages"]; errors: DrawingFlipErrors; onClose: () => void; onSave: (draft: RegionDraft) => void }) {
  const [draft, setDraft] = useState<RegionDraft>({ label: "", packageId: packages[0]?.id ?? "", x: "15", y: "15", width: "25", height: "20", notes: "" });
  return <Modal title="Mark a drawing region" subtitle="Add an estimator-reviewed rectangle to the current page." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    {Object.keys(errors).length > 0 && <div className="flip-error"><CircleDot size={15}/>{firstError(errors)}</div>}
    <label className="ui-field">What does this region show?<input autoFocus required value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} placeholder="Acoustical ceiling area"/></label>
    <label className="ui-field">Responsible trade<select value={draft.packageId} onChange={event => setDraft({ ...draft, packageId: event.target.value })}>{packages.map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
    <div className="flip-coordinates"><label>X %<input type="number" min="0" max="99" value={draft.x} onChange={event => setDraft({ ...draft, x: event.target.value })}/></label><label>Y %<input type="number" min="0" max="99" value={draft.y} onChange={event => setDraft({ ...draft, y: event.target.value })}/></label><label>Width %<input type="number" min="1" max="100" value={draft.width} onChange={event => setDraft({ ...draft, width: event.target.value })}/></label><label>Height %<input type="number" min="1" max="100" value={draft.height} onChange={event => setDraft({ ...draft, height: event.target.value })}/></label></div>
    <label className="ui-field">Review notes<textarea rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label>
    <div className="flip-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add reviewed region</Button></div>
  </form></Modal>;
}

export function DrawingFlipWorkspace({ projectName, notify, navigate }: ViewProps) {
  const { state, run } = useDrawingFlip();
  const { state: procurement } = useProcurement();
  const [pageId, setPageId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [filters, setFilters] = useState<Filters>({ query: "", packageId: "", status: "", origin: "", corrected: false });
  const [mode, setMode] = useState<"regions" | "corrections" | "unlocated">("regions");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkId, setLinkId] = useState("");
  const [pageEditor, setPageEditor] = useState(false);
  const [regionEditor, setRegionEditor] = useState(false);
  const [errors, setErrors] = useState<DrawingFlipErrors>({});

  const page = state.pages.find(item => item.id === pageId) ?? state.pages[0];
  const activePageId = page?.id ?? "";
  const visible = useMemo(() => filterRegions(state, procurement, {
    pageId: activePageId,
    query: filters.query || undefined,
    packageId: filters.packageId || undefined,
    status: filters.status || undefined,
    origin: filters.origin || undefined,
    corrected: filters.corrected || undefined,
  }), [state, procurement, activePageId, filters]);
  const selected = visible.find(item => item.id === regionId) ?? visible[0] ?? null;
  const pageIndex = Math.max(0, state.pages.findIndex(item => item.id === activePageId));
  const summary = flipSummary(state);
  const pageSummary = flipSummary(state, activePageId);
  const legend = tradeLegend(state, procurement, activePageId);
  const colors = useMemo(() => new Map(procurement.packages.map((pkg, index) => [pkg.id, tradeColors[index % tradeColors.length]])), [procurement.packages]);
  const missing = unlocatedScopes(state, procurement);
  const correctionLog = corrections(state);
  const selectedPackage = selected ? procurement.packages.find(pkg => pkg.id === selected.packageId) : undefined;
  const linkedScopes = selected ? procurement.scopes.filter(scope => selected.scopeIds.includes(scope.id)) : [];
  const availableScopes = selected ? procurement.scopes.filter(scope => !selected.scopeIds.includes(scope.id) && (scope.packageId === selected.packageId || scope.allTrades)) : [];

  useEffect(() => {
    const scopeId = sessionStorage.getItem("drawing-flip-scope");
    if (!scopeId) return;
    sessionStorage.removeItem("drawing-flip-scope");
    const region = regionsForScope(state, scopeId)[0];
    if (region) { setPageId(region.pageId); setRegionId(region.id); }
    else setMode("unlocated");
  }, [state]);

  function act(action: Parameters<typeof run>[0], message: string) {
    const issue = run(action);
    if (issue) { setErrors(issue); notify(firstError(issue)); return false; }
    setErrors({}); notify(message); return true;
  }
  function movePage(next: number) { const target = state.pages[(next + state.pages.length) % state.pages.length]; if (target) { setPageId(target.id); setRegionId(""); } }

  if (!state.pages.length) return <div className="flip-view"><PageHeader eyebrow={`${projectName} / Scope coordination`} title="Drawing Flip" description="Flip through drawing pages, assign every marked region to a trade, and connect it to the bid scope." actions={<Button variant="primary" onClick={() => setPageEditor(true)}><FilePlus2 size={16}/>Add drawing page</Button>}/><Panel><Empty title="No drawing pages in this project" description="Add the first sheet, then mark estimator regions or import Structor proposals for contractor review." action={<Button variant="primary" onClick={() => setPageEditor(true)}>Add first page</Button>}/></Panel><PreviewNote>Drawing Flip stores page references and normalized regions in this browser. It does not extract drawings in the demo.</PreviewNote>{pageEditor && <PageEditor errors={errors} onClose={() => { setPageEditor(false); setErrors({}); }} onSave={draft => { if (act(current => addPage(current, { ...draft, pageNumber: Number(draft.pageNumber) }), "Drawing page added.")) setPageEditor(false); }}/>}</div>;

  return <div className="flip-view">
    <PageHeader eyebrow={`${projectName} / Scope coordination`} title="Drawing Flip" description="Review every trade region on the drawings, correct Structor's assignments, and confirm where each scope item lives." actions={<><Button onClick={() => navigate("scopes")}><ListFilter size={16}/>Scopes & bid forms</Button><Button onClick={() => setPageEditor(true)}><FilePlus2 size={16}/>Add page</Button><Button variant="primary" onClick={() => setRegionEditor(true)}><Plus size={16}/>Mark region</Button></>}/>
    <Stats items={[{ label: "Drawing pages", value: state.pages.length, detail: `${summary.regions} mapped regions` }, { label: "Approved regions", value: summary.approved, detail: `${summary.corrected} trade correction${summary.corrected === 1 ? "" : "s"} retained`, tone: "green" }, { label: "Awaiting review", value: summary.pendingReview, detail: "Contractor decision required", tone: summary.pendingReview ? "orange" : "green" }, { label: "Unlocated scope", value: missing.length, detail: "Items without a drawing region", tone: missing.length ? "orange" : "green" }]}/>

    <div className="flip-toolbar ui-panel">
      <label className="flip-sheet-select"><span>Drawing sheet</span><select value={activePageId} onChange={event => { setPageId(event.target.value); setRegionId(""); }}>{state.pages.map(item => <option value={item.id} key={item.id}>{item.sheet} · {item.title}</option>)}</select></label>
      <div className="flip-page-nav"><button aria-label="Previous drawing" onClick={() => movePage(pageIndex - 1)}><ArrowLeft size={16}/></button><span>{pageIndex + 1} / {state.pages.length}</span><button aria-label="Next drawing" onClick={() => movePage(pageIndex + 1)}><ArrowRight size={16}/></button></div>
      <div className="flip-page-meta"><strong>{page.discipline} · Revision {page.revision || "—"}</strong><span>{page.documentName} · PDF page {page.pageNumber}</span></div>
      <Badge tone={pageSummary.pendingReview ? "orange" : "green"}>{pageSummary.pendingReview ? `${pageSummary.pendingReview} to review` : "Page reviewed"}</Badge>
    </div>

    <div className="flip-workspace">
      <section className="ui-panel flip-viewer-panel">
        <div className="flip-filterbar">
          <label className="flip-search"><Search size={15}/><input aria-label="Search drawing regions" value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Search regions…"/></label>
          <select aria-label="Filter by trade" value={filters.packageId} onChange={event => setFilters({ ...filters, packageId: event.target.value })}><option value="">All trades</option>{legend.map(item => <option value={item.packageId} key={item.packageId}>{item.division} · {item.name} ({item.regions})</option>)}</select>
          <select aria-label="Filter by review status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as Filters["status"] })}><option value="">All review states</option><option value="pending-review">Awaiting review</option><option value="approved">Approved</option></select>
          <select aria-label="Filter by origin" value={filters.origin} onChange={event => setFilters({ ...filters, origin: event.target.value as Filters["origin"] })}><option value="">All origins</option><option value="ai">Structor AI</option><option value="estimator">Estimator</option></select>
          <label className="flip-corrected"><input type="checkbox" checked={filters.corrected} onChange={event => setFilters({ ...filters, corrected: event.target.checked })}/>Corrections</label>
        </div>
        <div className="flip-legend" aria-label="Trade color legend">{legend.map(item => <button key={item.packageId} className={filters.packageId === item.packageId ? "active" : ""} onClick={() => setFilters({ ...filters, packageId: filters.packageId === item.packageId ? "" : item.packageId })}><i style={{ background: colors.get(item.packageId) }}/><span>{item.name}</span><small>{item.regions}</small></button>)}</div>
        {visible.length ? <DrawingCanvas page={page} regions={visible} selectedId={selected?.id ?? ""} colors={colors} onSelect={setRegionId}/> : <div className="flip-no-regions"><Empty title="No regions match these filters" description="Clear a filter or mark a new estimator region on this page." action={<Button onClick={() => setFilters({ query: "", packageId: "", status: "", origin: "", corrected: false })}>Clear filters</Button>}/></div>}
        <div className="flip-region-strip">{visible.map(region => <button key={region.id} className={selected?.id === region.id ? "selected" : ""} onClick={() => setRegionId(region.id)}><i style={{ background: colors.get(region.packageId) }}/><span><strong>{region.number} · {region.label}</strong><small>{procurement.packages.find(pkg => pkg.id === region.packageId)?.name} · {region.status === "pending-review" ? "Awaiting contractor" : "Approved"}</small></span><ChevronRight size={15}/></button>)}</div>
      </section>

      <aside className="flip-inspector">
        <div className="flip-side-tabs" role="tablist"><button className={mode === "regions" ? "active" : ""} onClick={() => setMode("regions")}><MousePointer2 size={14}/>Region</button><button className={mode === "corrections" ? "active" : ""} onClick={() => setMode("corrections")}><History size={14}/>Corrections</button><button className={mode === "unlocated" ? "active" : ""} onClick={() => setMode("unlocated")}><LocateFixed size={14}/>Unlocated</button></div>
        {mode === "regions" && selected && <Panel className="flip-region-detail">
          <div className="flip-detail-title"><span style={{ background: `${colors.get(selected.packageId)}1f`, color: colors.get(selected.packageId) }}>{selected.origin === "ai" ? <Bot size={19}/> : <UserRound size={19}/>}</span><div><small>{selected.number} · {selected.origin === "ai" ? "STRUCTOR PROPOSAL" : "ESTIMATOR REGION"}</small><h2>{selected.label}</h2></div></div>
          <div className={`flip-review-state ${selected.status}`}><ShieldCheck size={18}/><div><strong>{selected.status === "pending-review" ? "Contractor review required" : "Trade assignment approved"}</strong><small>{selected.reviewedBy ? `${selected.reviewedBy} · ${activityDate(selected.reviewedAt)}` : "Review or correct this assignment before it is relied on."}</small></div></div>
          <dl><div><dt>Responsible trade</dt><dd><i style={{ background: colors.get(selected.packageId) }}/>{selectedPackage?.code} · {selectedPackage?.name}</dd></div><div><dt>Drawing evidence</dt><dd>{selected.evidence || "Estimator marked region"}</dd></div><div><dt>Confidence</dt><dd>{selected.confidence === null ? "Estimator reviewed" : `${Math.round(selected.confidence * 100)}%`}</dd></div><div><dt>Review notes</dt><dd>{selected.notes || "No notes recorded"}</dd></div></dl>
          {selected.status === "pending-review" && <Button variant="primary" onClick={() => act(current => approveRegion(current, selected.id, CURRENT_USER), `${selected.number} approved.`)}><Check size={15}/>Approve trade assignment</Button>}
          <div className="flip-detail-actions"><Button onClick={() => { setReassignTo(""); setReassignReason(""); setReassignOpen(true); }}><RotateCcw size={15}/>Correct trade</Button><Button onClick={() => { setNotes(selected.notes); setNotesOpen(true); }}><PencilRuler size={15}/>Notes</Button></div>
          <div className="flip-scope-links"><header><div><Link2 size={15}/><strong>Linked scope items</strong></div><Badge>{linkedScopes.length}</Badge></header>{linkedScopes.map(scope => <article key={scope.id}><div><strong>{scope.title}</strong><small>{scope.source || "No source reference"}</small></div><button aria-label={`Unlink ${scope.title}`} onClick={() => act(current => unlinkScope(current, selected.id, scope.id, CURRENT_USER), "Scope item unlinked.")}><Unlink size={14}/></button></article>)}{!linkedScopes.length && <p>This region is not linked to a bid-form item yet.</p>}{availableScopes.length > 0 && <div className="flip-link-picker"><select aria-label="Scope item to link" value={linkId} onChange={event => setLinkId(event.target.value)}><option value="">Choose scope item…</option>{availableScopes.map(scope => <option value={scope.id} key={scope.id}>{scope.title}</option>)}</select><button disabled={!linkId} aria-label="Link scope item" onClick={() => { if (linkId && act(current => linkScope(current, procurement, selected.id, linkId, CURRENT_USER), "Scope item linked to the drawing.")) setLinkId(""); }}><Link2 size={15}/></button></div>}</div>
          <div className="flip-history"><h3>Region history</h3>{[...selected.history].reverse().map((event, index) => <div key={`${event.at}-${index}`}><i/><span><strong>{eventLabel(event.kind)}</strong><small>{event.by} · {activityDate(event.at)}</small>{event.kind === "reassigned" && <em>{procurement.packages.find(pkg => pkg.id === event.from)?.name} → {procurement.packages.find(pkg => pkg.id === event.to)?.name}{event.reason ? ` · ${event.reason}` : ""}</em>}</span></div>)}</div>
        </Panel>}
        {mode === "regions" && !selected && <Panel><Empty title="Select a region" description="Choose a numbered drawing overlay to inspect its trade, evidence, and scope links."/></Panel>}
        {mode === "corrections" && <Panel title="Correction log" subtitle="Every trade reassignment stays visible."><div className="flip-log">{correctionLog.map(item => <button key={`${item.regionId}-${item.at}`} onClick={() => { const correctedRegion = state.regions.find(region => region.id === item.regionId); if (correctedRegion) { setPageId(correctedRegion.pageId); setRegionId(correctedRegion.id); setMode("regions"); } }}><RotateCcw size={15}/><span><strong>{item.number}</strong><small>{procurement.packages.find(pkg => pkg.id === item.from)?.name} → {procurement.packages.find(pkg => pkg.id === item.to)?.name}</small><p>{item.reason || "No reason recorded"}</p><em>{item.by} · {activityDate(item.at)}</em></span></button>)}{!correctionLog.length && <Empty title="No corrections yet" description="Trade changes will be retained here."/>}</div></Panel>}
        {mode === "unlocated" && <Panel title="Scope without a drawing location" subtitle="Link these items to a region so estimators can see where the work occurs."><div className="flip-unlocated">{missing.map(scope => <button key={scope.id} onClick={() => { const pkgRegion = state.regions.find(region => region.packageId === scope.packageId); if (pkgRegion) { setPageId(pkgRegion.pageId); setRegionId(pkgRegion.id); setMode("regions"); setLinkId(scope.id); } }}><LocateFixed size={15}/><span><strong>{scope.title}</strong><small>{procurement.packages.find(pkg => pkg.id === scope.packageId)?.name} · {scope.source || "No source"}</small></span><ChevronRight size={14}/></button>)}{!missing.length && <Empty title="Every scope item is located" description="All bid-form items connect to at least one drawing region."/>}</div></Panel>}
      </aside>
    </div>
    <PreviewNote>Demo workflow · The linework is illustrative. Trade regions, approvals, corrections, scope links, and history are saved per project in this browser.</PreviewNote>

    {pageEditor && <PageEditor errors={errors} onClose={() => { setPageEditor(false); setErrors({}); }} onSave={draft => { if (act(current => addPage(current, { ...draft, pageNumber: Number(draft.pageNumber) }), "Drawing page added.")) setPageEditor(false); }}/>}
    {regionEditor && <RegionEditor packages={procurement.packages} errors={errors} onClose={() => { setRegionEditor(false); setErrors({}); }} onSave={draft => { const x = Number(draft.x) / 100, y = Number(draft.y) / 100, width = Math.min(Number(draft.width) / 100, 1 - x), height = Math.min(Number(draft.height) / 100, 1 - y); if (act(current => addRegion(current, procurement, { pageId: activePageId, label: draft.label, packageId: draft.packageId, polygon: rectangle(x, y, width, height), notes: draft.notes }, CURRENT_USER), "Reviewed estimator region added.")) setRegionEditor(false); }}/>}
    {reassignOpen && selected && <Modal title={`Correct ${selected.number}'s trade`} subtitle="This approves the region and keeps the old assignment in its history." onClose={() => setReassignOpen(false)}><form onSubmit={event => { event.preventDefault(); if (act(current => reassignRegion(current, procurement, selected.id, reassignTo, CURRENT_USER, reassignReason), `${selected.number} reassigned.`)) setReassignOpen(false); }}>{Object.keys(errors).length > 0 && <div className="flip-error"><CircleDot size={15}/>{firstError(errors)}</div>}<label className="ui-field">Correct trade<select autoFocus required value={reassignTo} onChange={event => setReassignTo(event.target.value)}><option value="">Choose trade…</option>{procurement.packages.filter(pkg => pkg.id !== selected.packageId).map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label><label className="ui-field">Reason for correction<textarea rows={4} value={reassignReason} onChange={event => setReassignReason(event.target.value)} placeholder="Explain why this trade owns the work."/></label><div className="flip-form-actions"><Button onClick={() => setReassignOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save correction</Button></div></form></Modal>}
    {notesOpen && selected && <Modal title={`Notes for ${selected.number}`} subtitle={selected.label} onClose={() => setNotesOpen(false)}><form onSubmit={event => { event.preventDefault(); if (act(current => editRegionNotes(current, selected.id, notes, CURRENT_USER), "Region notes saved.")) setNotesOpen(false); }}><label className="ui-field">Review notes<textarea autoFocus rows={6} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record what the estimator confirmed."/></label><div className="flip-form-actions"><Button onClick={() => setNotesOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save notes</Button></div></form></Modal>}
  </div>;
}

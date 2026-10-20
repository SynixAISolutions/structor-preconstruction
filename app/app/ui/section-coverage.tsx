"use client";

import { useCallback, useState } from "react";
import { assignSection, clearDecision, markNotApplicable, recordSplit, type CoverageRow, type CoverageStatus } from "../../lib/section-coverage";
import { useSectionCoverage } from "../../lib/use-section-coverage";
import type { useProcurement } from "../../lib/use-procurement";
import { Badge, Button, Empty, Modal, Panel, SearchBox, type ViewProps } from "./shared";
import { StoredDocumentViewer } from "./project-file-viewer";
import "./section-coverage.css";

const labels: Record<CoverageStatus, string> = { unassigned: "Unassigned", multiple: "Multiple trades", expected: "Expected", draft: "Draft", approved: "Approved", split: "Split", "not-applicable": "Not applicable" };
const tone = (status: CoverageStatus) => status === "approved" ? "green" : status === "expected" ? "neutral" : status === "split" ? "blue" : status === "not-applicable" ? "neutral" : "amber";
type ProcurementHook = ReturnType<typeof useProcurement>;
type Coverage = ReturnType<typeof useSectionCoverage>;
type Action = { kind: "assign" | "not-applicable" | "split"; row: CoverageRow };
type Props = { procurement: ProcurementHook["state"]; run: ProcurementHook["run"]; actor: string; onBidForm: (packageId: string) => void } & Pick<ViewProps, "notify" | "navigate">;

export function ScopeViewTabs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tabs = ["Bid forms", "Section coverage"];
  return <div className="ui-tabs" role="tablist" aria-label="Scope views">{tabs.map((tab, index) => <button key={tab} id={`scope-tab-${index}`} role="tab" aria-controls="scope-tab-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} className={tab === value ? "active" : ""} onClick={() => onChange(tab)} onKeyDown={event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + 1) % tabs.length;
    onChange(tabs[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }}>{tab}</button>)}</div>;
}

export function SectionCoverage({ procurement, run, actor, onBidForm, notify, navigate }: Props) {
  const coverage = useSectionCoverage(procurement);
  const [action, setAction] = useState<Action | null>(null);
  const [source, setSource] = useState<CoverageRow | null>(null);
  const [page, setPage] = useState(1);
  const closeAction = useCallback(() => setAction(null), []);
  const closeSource = useCallback(() => setSource(null), []);
  if (!coverage.ready) return <p role="status">Loading section coverage…</p>;
  if (!coverage.manual) return <Panel><Empty title="No project manual yet" description="Upload a project manual in Project files to check its sections against the trade bid forms." action={<Button onClick={() => navigate("documents")}>Open project files</Button>}/></Panel>;
  return <>
    <p className="coverage-manual">{coverage.manual.name} · revision {coverage.manual.revision} · {coverage.manual.sections.length} manual sections · {coverage.rows.length} trade sections</p>
    <CoverageList coverage={coverage} procurement={procurement} onAction={setAction} onSource={row => { setSource(row); setPage(row.first); }} onBidForm={onBidForm} onUndo={row => { const message = coverage.decide(d => clearDecision(d, row.section)); notify(message ?? "Coverage decision undone."); }}/>
    {action && <Modal title={action.kind === "assign" ? "Assign to a trade" : action.kind === "split" ? "Record split" : "Mark not applicable"} subtitle={`${action.row.section} · ${action.row.title}`} onClose={closeAction}>
      <CoverageActionForm key={action.row.section + action.kind} action={action} procurement={procurement} warningsFor={coverage.warningsFor} onClose={closeAction} onSave={value => {
        const now = new Date().toISOString();
        const message = action.kind === "assign" ? run(s => assignSection(s, action.row, value.packageId, actor)) : action.kind === "not-applicable" ? coverage.decide(d => markNotApplicable(d, action.row.section, value.reason, actor, now)) : coverage.decide(d => recordSplit(d, procurement, action.row.section, value.parts, actor, now));
        if (message) { notify(message); return message; }
        notify(action.kind === "assign" ? "Trade carries this section in its bid form. Any new line is draft and needs review." : "Coverage decision saved.");
        closeAction(); return null;
      }}/>
    </Modal>}
    {source?.source && coverage.manual.id === source.source.documentId && coverage.manual.revision === source.source.revision && <Modal title="Specification source" subtitle={`${source.section} · ${source.title}`} wide onClose={closeSource}><StoredDocumentViewer doc={coverage.manual} page={page} range={{ first: source.first, last: source.last }} onPageChange={setPage}/></Modal>}
  </>;
}

export function CoverageList({ coverage, procurement, onAction, onSource, onUndo, onBidForm }: {
  coverage: Pick<Coverage, "rows" | "counts">; procurement: ProcurementHook["state"];
  onAction: (action: Action) => void; onSource: (row: CoverageRow) => void; onUndo: (row: CoverageRow) => void; onBidForm: (packageId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("questions");
  const conflicts = coverage.rows.filter(row => row.conflict).length;
  const visible = coverage.rows.filter(row => (filter === "all" || (filter === "questions" ? row.status === "unassigned" || row.status === "multiple" || !!row.conflict : filter === "conflicts" ? !!row.conflict : row.status === filter)) && `${row.section} ${row.section.replaceAll(" ", "")} ${row.title}`.toLowerCase().includes(query.trim().toLowerCase()));
  const name = (id: string) => procurement.packages.find(pkg => pkg.id === id)?.name ?? id;
  return <Panel title="Section coverage" subtitle="Check whether each manual section applies and which trades carry it. Divisions 00 and 01 are handled in General." className="coverage-panel">
    <div className="coverage-intro"><p>Unassigned means <strong>check whether it applies</strong>. Expected ownership is a suggestion; it is not approved coverage. Draft lines still need review.</p><div className="coverage-counts">{Object.entries(coverage.counts).map(([status, count]) => <span key={status}><Badge tone={tone(status as CoverageStatus)}>{labels[status as CoverageStatus]}</Badge><strong>{count}</strong></span>)}<span><Badge tone="orange">Conflict</Badge><strong>{conflicts}</strong></span></div></div>
    <div className="ui-toolbar coverage-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search section number or title…"/><label className="ui-field">Show sections<select value={filter} onChange={event => setFilter(event.target.value)}><option value="questions">Open questions</option><option value="all">All sections</option><option value="conflicts">Conflicts</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <p className="coverage-result" role="status">{visible.length} of {coverage.rows.length} sections · {filter === "questions" ? "Unassigned, Multiple trades and conflicts" : filter === "all" ? "All sections" : filter === "conflicts" ? "Conflicts" : labels[filter as CoverageStatus]}</p>
    <div className="coverage-list">{visible.map(row => <details className={`coverage-row ${row.conflict ? "has-conflict" : ""}`} key={row.section}><summary><span className="coverage-code">{row.section}</span><span className="coverage-title"><strong>{row.title}</strong><small>{row.status === "expected" ? `Suggested: ${row.expected ? name(row.expected) : "Trade to confirm"}` : row.status === "unassigned" ? "Check whether it applies" : row.decision?.kind === "split" ? row.decision.parts.map(part => name(part.packageId)).join(" · ") : row.carriedBy.length ? row.carriedBy.map(c => name(c.packageId)).join(" · ") : "Decision recorded"}</small></span><span className="coverage-badges"><Badge tone={tone(row.status)}>{labels[row.status]}</Badge>{row.conflict && <Badge tone="orange">Conflict</Badge>}</span></summary>
      <div className="coverage-detail"><p>{row.note}</p>{row.conflict && <p className="coverage-warning"><strong>Conflict: </strong>{row.conflict}</p>}
        {(row.expected || row.suggest) && <p className="coverage-suggestion">Suggested ownership: {row.expected ? name(row.expected) : row.suggest!.name}. Confirm against the manual and bid form.</p>}
        {row.source && <Button onClick={() => onSource(row)}>Open manual · {row.first === row.last ? `p. ${row.first}` : `pp. ${row.first}–${row.last}`} · revision {row.source.revision}</Button>}
        {row.carriedBy.map(carried => <div className="coverage-trade" key={carried.packageId}><div><strong>{name(carried.packageId)}</strong>{carried.published && <Badge tone="blue">In published form</Badge>}</div><ul>{carried.scopes.map(scope => <li key={scope.id}><Badge tone={scope.approved ? "green" : "amber"}>{scope.approved ? "Approved" : "Draft"}</Badge>{scope.title}</li>)}</ul><Button onClick={() => onBidForm(carried.packageId)}>Review bid form</Button></div>)}
        {row.decision && <p className="coverage-audit">Decision by {row.decision.by} · {new Date(row.decision.at).toLocaleString()}</p>}
        <div className="coverage-actions"><Button disabled={!procurement.packages.length} onClick={() => onAction({ kind: "assign", row })}>Assign to a trade</Button><Button disabled={procurement.packages.length < 2} onClick={() => onAction({ kind: "split", row })}>Record split</Button><Button onClick={() => onAction({ kind: "not-applicable", row })}>Mark not applicable</Button>{row.decision && <Button onClick={() => onUndo(row)}>Undo decision</Button>}</div>
        {!procurement.packages.length && <p>Add a trade package to assign this section.</p>}
      </div>
    </details>)}</div>
    {!visible.length && <Empty title={coverage.rows.length ? "No sections match" : "No trade sections found"} description={coverage.rows.length ? "Try All sections or change your search." : "This manual has no indexed sections outside Divisions 00 and 01. Check the manual in Project files."}/>}
  </Panel>;
}

export function CoverageActionForm({ action, procurement, warningsFor, onClose, onSave }: {
  action: Action; procurement: ProcurementHook["state"]; warningsFor: Coverage["warningsFor"]; onClose: () => void;
  onSave: (value: { packageId: string; reason: string; parts: { packageId: string; portion: string }[] }) => string | null;
}) {
  const [packageId, setPackageId] = useState(action.row.expected ?? procurement.packages[0]?.id ?? "");
  const [reason, setReason] = useState(action.row.decision?.kind === "not-applicable" ? action.row.decision.reason : "");
  const [parts, setParts] = useState(action.row.decision?.kind === "split" ? action.row.decision.parts : [{ packageId: "", portion: "" }, { packageId: "", portion: "" }]);
  const [error, setError] = useState("");
  const options = procurement.packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.code} · {pkg.name}</option>);
  return <form className="coverage-form" onSubmit={event => { event.preventDefault(); setError(onSave({ packageId, reason, parts }) ?? ""); }}>
    {action.kind === "assign" ? <><label className="ui-field">Trade package<select required value={packageId} onChange={event => setPackageId(event.target.value)}>{options}</select></label><AssignmentWarnings warnings={packageId ? warningsFor(packageId) : []}/><p>This adds one draft line for review in Scopes &amp; bid forms. If the trade already cites this section, no duplicate is added.</p>{action.row.decision && <p className="coverage-warning">This section has a recorded decision. Assignment keeps that decision; check any resulting conflict.</p>}</> : action.kind === "not-applicable" ? <><p>Record why this section does not apply. Existing bid-form lines remain and will be flagged as a conflict.</p><label className="ui-field">Reason<textarea required minLength={3} maxLength={500} rows={4} value={reason} onChange={event => setReason(event.target.value)}/></label></> : <><p>Describe each trade’s part. This records a decision; use Assign to a trade to add any missing draft lines. Published forms and exhibits stay as issued.</p>{parts.map((part, index) => <fieldset key={index}><legend>Part {index + 1}</legend><label className="ui-field">Trade {index + 1}<select required value={part.packageId} onChange={event => setParts(parts.map((p, i) => i === index ? { ...p, packageId: event.target.value } : p))}><option value="">Choose a trade…</option>{options}</select></label><label className="ui-field">Part of the work {index + 1}<textarea required maxLength={200} rows={2} value={part.portion} onChange={event => setParts(parts.map((p, i) => i === index ? { ...p, portion: event.target.value } : p))}/></label>{parts.length > 2 && <Button onClick={() => setParts(parts.filter((_, i) => i !== index))}>Remove part {index + 1}</Button>}</fieldset>)}<Button onClick={() => setParts([...parts, { packageId: "", portion: "" }])}>Add another trade</Button></>}
    {error && <p role="alert" className="coverage-warning">{error}</p>}
    <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={action.kind === "assign" && !packageId}>{action.kind === "assign" ? "Confirm assignment" : action.kind === "split" ? "Save split" : "Save not applicable"}</Button></div>
  </form>;
}

export function AssignmentWarnings({ warnings }: { warnings: string[] }) {
  return warnings.length ? <div className="coverage-warning" role="note"><strong>Before confirming</strong><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div> : null;
}

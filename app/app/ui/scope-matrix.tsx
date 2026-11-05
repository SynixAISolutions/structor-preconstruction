"use client";

import { useMemo, useState } from "react";
import { Check, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { editDraft } from "../../lib/extraction";
import { applyScopeToAllTrades, reopenScope, type ScopeOrigin } from "../../lib/procurement";
import { addCrossover, addMatrixItem, crossoverProgress, EVERY_TRADE, filterMatrix, matrixCsv, matrixRows, matrixStatus, matrixSummary, MATRIX_VIEWS, moveLines, NO_OWNER, type Crossover, type MatrixRow, type MatrixView } from "../../lib/scope-matrix";
import type { useExtraction } from "../../lib/use-extraction";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Badge, Button, Empty, exportRows, Modal, Panel, SearchBox, Stats, Tabs } from "./shared";
import "./scope-matrix.css";

const PAGE = 100;
const ORIGINS: Record<ScopeOrigin, string> = { ai: "AI", drawing: "Drawing", specification: "Specification", estimator: "Estimator" };
const TONES: Record<string, string> = { "To review": "amber", Approved: "green", "AI proposal": "blue", "Check the sheet": "orange" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const blankItem = { packageId: "", title: "", detail: "", source: "" };
const blankCrossover = { item: "", usualId: "", furnishId: "", installId: "", reason: "" };

/**
 * The scope matrix (Marcel's process doc): every scope item on the project in one place, for the bid captain to check,
 * move between trades and add to; and the crossovers estimators agree between trades, which go into each trade's bid
 * form so nobody misses them (lib/scope-matrix).
 */
export function ScopeMatrixView({ review, actor, notify, onOpen }: { review: ReturnType<typeof useExtraction>; actor: string; notify: (message: string) => void; onOpen: (packageId: string | null, itemId: string) => void }) {
  const { procurement: state, runProcurement: run } = review;
  const [crossovers, setCrossovers] = useLocalDraft<Crossover[]>("scope-crossovers", []);
  const [tab, setTab] = useState("All scope items");
  const [view, setView] = useState<MatrixView>("All");
  const [packageId, setPackageId] = useState("");
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [adding, setAdding] = useState<typeof blankItem | null>(null);
  const [crossing, setCrossing] = useState<typeof blankCrossover | null>(null);
  const [removing, setRemoving] = useState<Crossover | null>(null);
  const [formError, setFormError] = useState("");

  const trades = useMemo(() => [...state.packages].sort((a, b) => a.code.localeCompare(b.code)), [state.packages]);
  const rows = useMemo(() => matrixRows(state, review.extraction.drafts), [state, review.extraction.drafts]);
  const summary = useMemo(() => matrixSummary(rows), [rows]);
  const owners = useMemo(() => [...new Set(state.packages.map(p => p.owner.trim()).filter(Boolean))].sort(), [state.packages]);
  const shown = useMemo(() => filterMatrix(rows, { view, packageId, owner, query }), [rows, view, packageId, owner, query]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * PAGE, (current + 1) * PAGE);
  const chosen = rows.filter(r => selected.has(r.id));
  const tradeName = (id: string | null) => id ? state.packages.find(p => p.id === id)?.name ?? "Removed trade" : "—";
  const tradeOptions = trades.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>);

  // Says who was tagged, as tagOwners tags them: a trade's owner, unless that's the person making the change.
  const tagged = (id: string) => { const name = state.packages.find(p => p.id === id)?.owner; return name && name !== actor ? `; ${name} was tagged` : ""; };

  // Changing what's listed clears the ticks, so a bulk move never touches a line nobody can see.
  function filtered<T>(set: (value: T) => void) { return (value: T) => { set(value); setPage(0); setSelected(new Set()); }; }

  function move(targets: MatrixRow[], to: string) {
    const problem = run(s => moveLines(s, targets.filter(r => r.kind === "line").map(r => r.id), to, actor));
    if (problem) { notify(problem); return; }
    for (const proposal of targets.filter(r => r.kind === "proposal")) {
      const message = review.run(s => editDraft(s, state, proposal.id, { packageId: to }, actor));
      if (message) { notify(message); return; }
    }
    setSelected(new Set()); setMoveTo("");
    // An AI proposal waits in the trade's review list; only bid-form lines tag anyone.
    notify(`${targets.length === 1 ? "Scope item" : plural(targets.length, "scope item")} moved to ${tradeName(to)}${targets.some(r => r.kind === "line") ? tagged(to) : ""}.`);
  }
  function setTrade(row: MatrixRow, value: string) {
    if (value !== EVERY_TRADE) { move([row], value); return; }
    const problem = run(s => applyScopeToAllTrades(s, row.id, actor));
    notify(problem ?? "Scope item added to every trade's bid form.");
  }
  function approve(targets: MatrixRow[]) {
    const open = targets.filter(r => r.status !== "approved" && !r.notPrinted);
    for (const row of open) {
      const message = row.kind === "line" ? review.approveScopeItem(row.id, actor) : review.accept(row.id, actor);
      if (message) { notify(message); return; }
    }
    const held = targets.filter(r => r.notPrinted).length;
    setSelected(new Set());
    notify(`${plural(open.length, "scope item")} approved.${held ? ` ${held} not printed on ${held === 1 ? "its" : "their"} sheet left for you to check in the bid form.` : ""}`);
  }
  function saveItem(event: React.FormEvent) {
    event.preventDefault();
    if (!adding) return;
    const problem = run(s => addMatrixItem(s, adding, actor));
    if (problem) { setFormError(problem); return; }
    notify(`Added to ${tradeName(adding.packageId)}${tagged(adding.packageId)}.`);
    setAdding(null); setFormError("");
  }
  function saveCrossover(event: React.FormEvent) {
    event.preventDefault();
    if (!crossing) return;
    const made: { crossover?: Crossover } = {};
    const problem = run(s => { const result = addCrossover(s, crossovers, crossing, actor); made.crossover = result.crossover; return result.state; });
    if (problem || !made.crossover) { setFormError(problem ?? "The crossover could not be added."); return; }
    setCrossovers([...crossovers, made.crossover]);
    notify(`Crossover added: ${plural(made.crossover.lineIds.length, "line")} in the bid forms, for review.`);
    setCrossing(null); setFormError("");
  }
  function removeCrossover(crossover: Crossover) {
    const reviewing = crossover.lineIds.filter(id => state.scopes.find(s => s.id === id)?.status === "draft");
    for (const id of reviewing) { const message = review.removeScope(id, actor); if (message) { notify(message); return; } }
    setCrossovers(crossovers.filter(c => c.id !== crossover.id));
    setRemoving(null);
    notify(`Crossover removed, with ${plural(reviewing.length, "line")} still in review. Approved lines stay in their bid forms.`);
  }

  if (!state.packages.length) return <Empty title="No bid packages yet" description="Upload the drawings and the project manual in Project files: the AI sets the bid packages and writes their scopes."/>;

  return <div className="scope-matrix">
    <Stats items={[
      { label: "Scope items", value: summary.total, detail: "On this project" },
      { label: "To review", value: summary.toReview, detail: summary.proposals ? `${plural(summary.proposals, "AI proposal")} included` : "Not approved yet" },
      { label: "Approved", value: summary.approved, detail: "By an estimator", tone: "green" },
      { label: "In more than one trade", value: summary.shared, detail: "Same wording, worth a look" },
      { label: "Crossovers", value: crossovers.length, detail: "Agreed between trades" },
    ]}/>
    <Tabs tabs={["All scope items", "Crossovers"]} value={tab} onChange={setTab}/>

    {tab === "All scope items" ? <Panel title="All scope items" subtitle="Check every item and decide which trade carries it. Moving an item sends it back to review and tags the receiving estimator." action={<div className="scope-matrix-actions">
      <Button onClick={() => exportRows("scope-matrix.csv", matrixCsv(shown))}><Download size={15}/>Export CSV</Button>
      <Button variant="primary" onClick={() => { setFormError(""); setAdding({ ...blankItem, packageId: packageId && packageId !== EVERY_TRADE ? packageId : trades[0]?.id ?? "" }); }}><Plus size={15}/>Add item</Button>
    </div>}>
      <div className="ui-toolbar scope-matrix-toolbar">
        <Tabs tabs={[...MATRIX_VIEWS]} value={view} onChange={v => filtered(setView)(v as MatrixView)}/>
        <div className="scope-matrix-filters">
          <label className="ui-field">Trade<select value={packageId} onChange={e => filtered(setPackageId)(e.target.value)}><option value="">All trades</option><option value={EVERY_TRADE}>Every trade (general)</option>{tradeOptions}</select></label>
          <label className="ui-field">Owner<select value={owner} onChange={e => filtered(setOwner)(e.target.value)}><option value="">Everyone</option><option value={NO_OWNER}>No owner yet</option>{owners.map(o => <option key={o}>{o}</option>)}</select></label>
          <SearchBox value={query} onChange={filtered(setQuery)} placeholder="Search items, sources or trades…"/>
        </div>
      </div>
      {chosen.length > 0 && <div className="scope-matrix-bulk" role="region" aria-label="Selected items">
        <strong>{plural(chosen.length, "item")} selected</strong>
        <label className="ui-field">Move to<select value={moveTo} onChange={e => setMoveTo(e.target.value)}><option value="">Choose a trade…</option>{tradeOptions}</select></label>
        <Button disabled={!moveTo} onClick={() => move(chosen, moveTo)}>Move</Button>
        <Button onClick={() => approve(chosen)}><Check size={15}/>Approve</Button>
        <Button onClick={() => setSelected(new Set())}>Clear</Button>
      </div>}
      {pageRows.length ? <div className="ui-table-wrap"><table className="ui-table scope-matrix-table"><thead><tr>
        <th><input type="checkbox" aria-label="Select every item on this page" checked={pageRows.every(r => selected.has(r.id))} onChange={e => setSelected(prev => { const next = new Set(prev); for (const r of pageRows) { if (e.target.checked) next.add(r.id); else next.delete(r.id); } return next; })}/></th>
        <th>Scope item</th><th>Trade</th><th>Origin</th><th>Status</th><th><span className="scope-matrix-sr">Actions</span></th>
      </tr></thead><tbody>
        {pageRows.map((row, i) => <MatrixGroupRow key={row.id} heading={i === 0 || pageRows[i - 1].trade !== row.trade ? row : null}>
          <tr className={selected.has(row.id) ? "selected" : ""}>
            <td><input type="checkbox" aria-label={`Select ${row.title}`} checked={selected.has(row.id)} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(row.id); else next.delete(row.id); return next; })}/></td>
            <td className="scope-matrix-item"><strong>{row.title}</strong>{row.detail && <small>{row.detail}</small>}{row.source && <span className="ui-source">{row.source}</span>}{row.alsoIn.length > 0 && <small className="scope-matrix-also">Also in {row.alsoIn.join(", ")}</small>}</td>
            <td><select className="scope-matrix-trade" aria-label={`Trade carrying ${row.title}`} value={row.packageId ?? EVERY_TRADE} onChange={e => setTrade(row, e.target.value)}>{row.kind === "line" && <option value={EVERY_TRADE}>Every trade</option>}{tradeOptions}</select></td>
            <td>{ORIGINS[row.origin]}</td>
            <td><Badge tone={TONES[matrixStatus(row)]}>{matrixStatus(row)}</Badge></td>
            <td className="scope-matrix-row-actions">
              {row.status === "approved" ? <Button onClick={() => { const problem = run(s => reopenScope(s, row.id, actor)); notify(problem ?? "Scope item back in review."); }}><RotateCcw size={14}/>Reopen</Button>
                : !row.notPrinted && <Button onClick={() => approve([row])}><Check size={14}/>Approve</Button>}
              <Button onClick={() => onOpen(row.packageId, row.id)}>Open</Button>
            </td>
          </tr>
        </MatrixGroupRow>)}
      </tbody></table></div> : <Empty title={rows.length ? "No items match" : "No scope items yet"} description={rows.length ? "Try another view, trade, owner or search." : "Upload the documents in Project files, or add an item here."}/>}
      {shown.length > PAGE && <div className="scope-matrix-pages"><Button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button><span>{current * PAGE + 1}–{Math.min((current + 1) * PAGE, shown.length)} of {shown.length}</span><Button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button></div>}
    </Panel> : <Panel title="Crossovers" subtitle="Scope one trade carries for another, agreed between estimators. Each trade's bid form gets its half, and its owner is tagged." action={<Button variant="primary" onClick={() => { setFormError(""); setCrossing({ ...blankCrossover }); }}><Plus size={15}/>Add crossover</Button>}>
      {crossovers.length ? <div className="ui-table-wrap"><table className="ui-table scope-matrix-table"><thead><tr><th>Item</th><th>Usually with</th><th>Furnishes</th><th>Installs</th><th>Why</th><th>Bid-form lines</th><th><span className="scope-matrix-sr">Actions</span></th></tr></thead><tbody>
        {crossovers.map(c => { const progress = crossoverProgress(c, state); return <tr key={c.id}>
          <td><strong>{c.item}</strong></td><td>{tradeName(c.usualId)}</td><td>{tradeName(c.furnishId)}</td><td>{tradeName(c.installId)}</td><td>{c.reason || "—"}</td>
          <td>{progress.approved} of {progress.lines} approved{progress.gone > 0 && <small className="scope-matrix-also">{progress.gone} removed from {progress.gone === 1 ? "its bid form" : "their bid forms"}</small>}</td>
          <td><Button onClick={() => setRemoving(c)}><Trash2 size={14}/>Remove</Button></td>
        </tr>; })}
      </tbody></table></div> : <Empty title="No crossovers yet" description="Record what one trade carries for another, so nobody misses it. For example: masonry façade anchors, with misc metals furnishing and drywall installing, because it's cheaper than having the mason do it."/>}
    </Panel>}

    {adding && <Modal title="Add a scope item" subtitle="For anything missing: from a meeting, or easily missed on the drawings. It goes into the trade's bid form for review." onClose={() => setAdding(null)}>
      <form className="scope-matrix-form" onSubmit={saveItem}>
        <label className="ui-field">Trade<select value={adding.packageId} onChange={e => setAdding({ ...adding, packageId: e.target.value })}>{tradeOptions}</select></label>
        <label className="ui-field">Scope item<input value={adding.title} required maxLength={300} onChange={e => setAdding({ ...adding, title: e.target.value })}/></label>
        <label className="ui-field">Detail<textarea value={adding.detail} rows={2} maxLength={1000} onChange={e => setAdding({ ...adding, detail: e.target.value })}/></label>
        <label className="ui-field">Source<input value={adding.source} maxLength={120} placeholder="A sheet, a section or a meeting" onChange={e => setAdding({ ...adding, source: e.target.value })}/></label>
        {formError && <p className="voice-error" role="alert">{formError}</p>}
        <div className="proc-form-actions"><Button onClick={() => setAdding(null)}>Cancel</Button><Button type="submit" variant="primary">Add item</Button></div>
      </form>
    </Modal>}
    {crossing && <Modal title="Add a crossover" subtitle="Who furnishes it, who installs it, and which trade would otherwise carry it." onClose={() => setCrossing(null)}>
      <form className="scope-matrix-form" onSubmit={saveCrossover}>
        <label className="ui-field">Item<input value={crossing.item} required maxLength={200} placeholder="Masonry façade anchors" onChange={e => setCrossing({ ...crossing, item: e.target.value })}/></label>
        <label className="ui-field">Usually with (optional; its bid form will exclude the item)<select value={crossing.usualId} onChange={e => setCrossing({ ...crossing, usualId: e.target.value })}><option value="">No trade</option>{tradeOptions}</select></label>
        <label className="ui-field">Furnished by<select value={crossing.furnishId} required onChange={e => setCrossing({ ...crossing, furnishId: e.target.value })}><option value="">Choose a trade…</option>{tradeOptions}</select></label>
        <label className="ui-field">Installed by<select value={crossing.installId} required onChange={e => setCrossing({ ...crossing, installId: e.target.value })}><option value="">Choose a trade…</option>{tradeOptions}</select></label>
        <label className="ui-field">Why (optional)<input value={crossing.reason} maxLength={300} placeholder="Cheaper than having the mason do it" onChange={e => setCrossing({ ...crossing, reason: e.target.value })}/></label>
        {formError && <p className="voice-error" role="alert">{formError}</p>}
        <div className="proc-form-actions"><Button onClick={() => setCrossing(null)}>Cancel</Button><Button type="submit" variant="primary">Add crossover</Button></div>
      </form>
    </Modal>}
    {removing && <Modal title="Remove this crossover?" subtitle={removing.item} onClose={() => setRemoving(null)}>
      <p className="proc-modal-note">Its lines still in review come out of the bid forms. Approved lines stay, for their estimators to reopen.</p>
      <div className="proc-form-actions"><Button onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" onClick={() => removeCrossover(removing)}>Remove crossover</Button></div>
    </Modal>}
  </div>;
}

/** A row, with its trade's heading row above when it starts one. */
function MatrixGroupRow({ heading, children }: { heading: MatrixRow | null; children: React.ReactNode }) {
  return <>{heading && <tr className="scope-matrix-group"><th colSpan={6} scope="colgroup">{heading.code && <span>{heading.code}</span>}{heading.trade}{heading.owner && <small>{heading.owner}</small>}</th></tr>}{children}</>;
}

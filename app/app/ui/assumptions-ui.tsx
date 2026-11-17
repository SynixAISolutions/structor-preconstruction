"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, Download, FileText, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, SearchBox, Stats, downloadText, type ViewProps } from "./shared";
import {
  ASSUMPTION_KINDS, AssumptionRuleError, EMPTY_ASSUMPTIONS, addAssumption, assumptionsByTrade, assumptionsMarkdown, editAssumption,
  proposalNotes, removeAssumption, sourceText, takeAllFromProposal, takeFromProposal,
  type AssumptionItem, type AssumptionKind, type AssumptionsState, type ProposalNotes,
} from "../../lib/assumptions";
import { useLocalDraft } from "../../lib/use-local-draft";
import { displayDate, possessive } from "../../lib/format";
import { useSubmissions } from "../../lib/use-submissions";
import { initialBidders, type Bidder } from "../../lib/data/commercial";
import type { Project } from "../../lib/projects";
import "./assumptions.css";

const ACTOR = "Marcel Khoury";

/**
 * Assumptions & clarifications (Marcel's features list, item 35): each trade's list, written by its division leader and
 * taken from the subcontractors' proposals, and the one document that gathers them all.
 */
export function AssumptionsView({ project, projectName, notify }: ViewProps & { project: Project }) {
  const { procurement, submissions } = useSubmissions();
  const [directory] = useLocalDraft<Bidder[]>("directory", initialBidders);
  const [state, setState] = useLocalDraft<AssumptionsState>("assumptions", EMPTY_ASSUMPTIONS);
  const [query, setQuery] = useState(""), [owner, setOwner] = useState("");
  const [adding, setAdding] = useState<{ packageId: string; kind: AssumptionKind } | null>(null);
  const [editing, setEditing] = useState<AssumptionItem | null>(null);
  const [showDocument, setShowDocument] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => { setDate(new Date().toISOString().slice(0, 10)); }, []);
  const packages = procurement.packages;
  const company = (bidderId: string) => directory.find(c => c.id === bidderId)?.company ?? bidderId;
  const owners = [...new Set(packages.map(p => p.owner).filter(Boolean))].sort();
  const shown = packages.filter(p => (!owner || p.owner === owner) && (!query.trim() || `${p.code} ${p.name}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const trades = assumptionsByTrade(state, packages);
  const markdown = assumptionsMarkdown(project.name, trades, date);
  const fromProposals = state.items.filter(i => i.source.type === "proposal").length;

  const run = (action: (current: AssumptionsState) => AssumptionsState, done?: string): boolean => {
    try { setState(action(state)); setError(""); if (done) notify(done); return true; }
    catch (e) { if (e instanceof AssumptionRuleError) { setError(e.message); return false; } throw e; }
  };
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const kind = String(data.get("kind")) as AssumptionKind, text = String(data.get("text") ?? "");
    const ok = editing ? run(s => editAssumption(s, editing.id, { kind, text }, ACTOR), "Saved.") : adding ? run(s => addAssumption(s, packages, { packageId: adding.packageId, kind, text }, ACTOR), `${kind === "assumption" ? "Assumption" : "Clarification"} added.`) : false;
    if (ok) { setAdding(null); setEditing(null); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(markdown); notify("The document is copied."); }
    catch { notify("Copy couldn't reach the clipboard. Use Download instead."); }
  }

  return <div className="cm-view assumptions-view">
    <PageHeader eyebrow={`${projectName} / Preconstruction budget`} title="Assumptions & clarifications" description="Each trade's assumptions and clarifications, from the division leader and from the subcontractors' proposals, gathered into one document."
      actions={<><Button disabled={!trades.length} onClick={() => setShowDocument(true)}><FileText size={15}/>View document</Button><Button disabled={!trades.length} onClick={() => { downloadText(`assumptions-and-clarifications-${project.id}.md`, markdown, "text/markdown;charset=utf-8"); notify("Document downloaded."); }}><Download size={15}/>Download</Button></>}/>
    <Stats items={[
      { label: "Trades with a list", value: `${trades.length} of ${packages.length}`, detail: "Trade packages with at least one item" },
      { label: "Assumptions", value: state.items.filter(i => i.kind === "assumption").length, detail: "Across every trade" },
      { label: "Clarifications", value: state.items.filter(i => i.kind === "clarification").length, detail: "Across every trade" },
      { label: "From proposals", value: fromProposals, detail: "Copied from subcontractors' bids", tone: fromProposals ? "green" : "" },
    ]}/>
    {error && <p className="cm-form-error" role="alert">{error}</p>}
    <Panel>
      <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search trades…"/><select className="cm-select" aria-label="Filter by division leader" value={owner} onChange={e => setOwner(e.target.value)}><option value="">All division leaders</option>{owners.map(o => <option key={o}>{o}</option>)}</select></div>
      {!packages.length ? <Empty title="No trade packages yet" description="Trade packages come from Scopes & bid forms. Each one gets its own list here."/> : !shown.length ? <Empty title="No trades match" description="Clear the search or choose another division leader."/> :
      <div className="assumption-trades">{shown.map(pkg => {
        const items = state.items.filter(i => i.packageId === pkg.id);
        const notes = proposalNotes(state, submissions, pkg.id, company);
        return <section key={pkg.id} className="assumption-trade" aria-label={pkg.name}>
          <header><div><h3>{pkg.name}</h3><small>{pkg.code}{pkg.owner ? ` · ${pkg.owner}` : " · No division leader"}</small></div><div className="assumption-trade-actions"><Button onClick={() => { setError(""); setAdding({ packageId: pkg.id, kind: "assumption" }); }}><Plus size={14}/>Assumption</Button><Button onClick={() => { setError(""); setAdding({ packageId: pkg.id, kind: "clarification" }); }}><Plus size={14}/>Clarification</Button></div></header>
          {ASSUMPTION_KINDS.map(kind => { const list = items.filter(i => i.kind === kind.value); return list.length ? <div key={kind.value} className="assumption-list"><h4>{kind.plural}</h4><ul>{list.map(item => <li key={item.id}><span>{item.text}{item.source.type === "proposal" && <small>{sourceText(item)}</small>}</span><span className="assumption-item-actions"><button type="button" className="ui-icon-btn" aria-label={`Edit: ${item.text}`} onClick={() => { setError(""); setEditing(item); }}><Pencil size={13}/></button><button type="button" className="ui-icon-btn" aria-label={`Remove: ${item.text}`} onClick={() => run(s => removeAssumption(s, item.id), "Removed.")}><Trash2 size={13}/></button></span></li>)}</ul></div> : null; })}
          {!items.length && <p className="assumption-empty">Nothing listed for this trade yet.</p>}
          {notes.length > 0 && <ProposalLines notes={notes} onTake={(n, line) => run(s => takeFromProposal(s, packages, pkg.id, n, line, ACTOR), "Added from the proposal.")} onTakeAll={n => run(s => takeAllFromProposal(s, packages, pkg.id, n, ACTOR), `Added what ${possessive(n.company)} proposal clarifies and excludes.`)}/>}
        </section>;
      })}</div>}
    </Panel>
    {(adding || editing) && <Modal title={editing ? "Edit item" : `Add ${adding!.kind}`} subtitle={packages.find(p => p.id === (editing?.packageId ?? adding?.packageId))?.name} onClose={() => { setAdding(null); setEditing(null); }}>
      <form onSubmit={save}>
        <label className="ui-field">Type<select name="kind" defaultValue={editing?.kind ?? adding?.kind}>{ASSUMPTION_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
        <label className="ui-field">Text<textarea name="text" autoFocus required rows={4} maxLength={1000} defaultValue={editing?.text ?? ""} placeholder={(editing?.kind ?? adding?.kind) === "assumption" ? "e.g. Work is performed during normal working hours, Monday to Friday." : "e.g. Patching of existing walls is limited to areas affected by new work."}/></label>
        {editing?.source.type === "proposal" && <p className="intel-muted intel-small">Taken {sourceText(editing)}. The document keeps saying where it came from.</p>}
        {error && <p className="cm-form-error" role="alert">{error}</p>}
        <div className="cm-form-footer"><Button onClick={() => { setAdding(null); setEditing(null); }}>Cancel</Button><Button type="submit" variant="primary">{editing ? "Save" : "Add"}</Button></div>
      </form>
    </Modal>}
    {showDocument && <Modal title="Assumptions and clarifications" subtitle={`${project.name} · every trade's list in one document`} wide onClose={() => setShowDocument(false)}>
      <article className="assumption-document">
        <header><p>ASSUMPTIONS AND CLARIFICATIONS</p><h2>{project.name}</h2><small>Prepared {date ? displayDate(date) : ""}</small></header>
        {trades.map(t => <section key={t.packageId}><h3>{t.code ? `${t.code} · ` : ""}{t.trade}</h3>{[["Assumptions", t.assumptions], ["Clarifications", t.clarifications]].map(([label, list]) => (list as AssumptionItem[]).length ? <div key={label as string}><h4>{label as string}</h4><ul>{(list as AssumptionItem[]).map(i => <li key={i.id}>{i.text}{i.source.type === "proposal" && <small> ({sourceText(i)})</small>}</li>)}</ul></div> : null)}</section>)}
      </article>
      <div className="cm-form-footer"><Button onClick={() => void copy()}><Copy size={15}/>Copy as text</Button><Button onClick={() => window.print()}><Printer size={15}/>Print</Button><Button variant="primary" onClick={() => { downloadText(`assumptions-and-clarifications-${project.id}.md`, markdown, "text/markdown;charset=utf-8"); notify("Document downloaded."); }}><Download size={15}/>Download</Button></div>
    </Modal>}
  </div>;
}

/** What each subcontractor's latest proposal clarifies or excludes, with the lines already listed marked. */
function ProposalLines({ notes, onTake, onTakeAll }: { notes: ProposalNotes[]; onTake: (notes: ProposalNotes, line: ProposalNotes["lines"][number]) => void; onTakeAll: (notes: ProposalNotes) => void }) {
  const [open, setOpen] = useState(false);
  const waiting = notes.reduce((t, n) => t + n.lines.filter(l => !l.taken).length, 0);
  return <div className="assumption-proposals">
    <button type="button" className="cm-text-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} what the proposals clarify and exclude · {notes.length} {notes.length === 1 ? "company" : "companies"}{waiting ? `, ${waiting} not on the list` : ""}</button>
    {open && notes.map(n => <div key={n.submissionId} className="assumption-proposal">
      <header><strong>{n.company}</strong><small>Proposal V{n.revision}</small>{n.lines.some(l => !l.taken) && <Button onClick={() => onTakeAll(n)}><Plus size={13}/>Add all</Button>}</header>
      <ul>{n.lines.map((line, i) => <li key={i}><span><Badge tone={line.from === "exclusion" ? "amber" : "neutral"}>{line.from === "exclusion" ? "Exclusion" : "Clarification"}</Badge>{line.text}</span>{line.taken ? <small className="assumption-taken">On the list</small> : <button type="button" className="cm-text-button" onClick={() => onTake(n, line)}>Add</button>}</li>)}</ul>
    </div>)}
  </div>;
}

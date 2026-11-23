"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BrainCircuit, Check, Eye, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, SearchBox, Stats, Tabs, type ViewProps } from "./shared";
import { contextPack, tradeTags, type MemoryEntry, type MemoryKind, type MemoryStatus } from "../../lib/memory";
import { addMemory, changeMemory, fetchMemory, memoryCounts } from "../../lib/memory-client";
import type { MemoryCounts } from "../../lib/memory-store";
import { readDraft } from "../../lib/use-local-draft";
import { sampleProcurement } from "../../lib/data/procurement";
import { useActiveProject } from "../../lib/project-scope";
import { displayDate } from "../../lib/format";
import type { Procurement, TradePackage } from "../../lib/procurement";
import type { Project } from "../../lib/projects";
import "./memory.css";

// AI memory (lib/memory): what the AI has learned about how this contractor splits and words its scopes. Proposals
// learned from corrections wait here for an estimator; only approved entries are read by scans.

const TABS: { label: string; status: MemoryStatus }[] = [{ label: "To review", status: "proposed" }, { label: "In use", status: "approved" }, { label: "Retired", status: "retired" }];
const KIND_LABEL: Record<MemoryKind, string> = { rule: "Rule", example: "Wording example", decision: "Project decision" };
const KIND_TONE: Record<MemoryKind, string> = { rule: "blue", example: "green", decision: "amber" };
const ORIGIN_LABEL = { estimator: "Added by an estimator", correction: "Learned from a correction", import: "Imported" } as const;

export function MemoryView({ projects, notify }: ViewProps & { projects: Project[] }) {
  const projectId = useActiveProject();
  const packages: TradePackage[] = useMemo(() => projectId ? readDraft<Procurement>(projectId, "procurement", sampleProcurement).packages : [], [projectId]);
  const projectName = (id: string | null) => id ? projects.find(p => p.id === id)?.name ?? "A deleted project" : "Every project";
  const [tab, setTab] = useState(TABS[0].label);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<MemoryKind | "">("");
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [counts, setCounts] = useState<MemoryCounts | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [editing, setEditing] = useState<MemoryEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const status = TABS.find(t => t.label === tab)!.status;

  useEffect(() => { const timer = setTimeout(() => setSearch(query), 300); return () => clearTimeout(timer); }, [query]);
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const [list, totals] = await Promise.all([fetchMemory({ status: [status], kind: kind ? [kind] : undefined, q: search, limit: 500 }), memoryCounts()]);
      setEntries(list); setCounts(totals); setState({ loading: false, error: "" });
    } catch (error) { setState({ loading: false, error: error instanceof Error ? error.message : "The AI memory couldn't be reached." }); }
  }, [status, kind, search]);
  useEffect(() => { void load(); }, [load]);

  async function change(entry: MemoryEntry, next: Partial<Pick<MemoryEntry, "status" | "text" | "detail" | "trades" | "section">>, done: string) {
    try { await changeMemory(entry, next); notify(done); await load(); return null; }
    catch (error) { const message = error instanceof Error ? error.message : "The change couldn't be saved."; notify(message); await load(); return message; }
  }

  return <div className="cm-view memory-view">
    <PageHeader eyebrow="WORKSPACE" title="AI memory" description="What Structor's AI has learned about how you split and word your scopes. Corrections made while reviewing scopes arrive here as proposals; only entries in use are read when the AI reads drawings and specifications."
      actions={<><Button disabled={!packages.length} onClick={() => setPreviewing(true)}><Eye size={15}/>What the AI reads</Button><Button variant="primary" onClick={() => setAdding(true)}><Plus size={15}/>Add to memory</Button></>}/>
    <Stats items={[
      { label: "To review", value: counts?.proposed ?? "–", detail: "Learned from corrections, not used yet", tone: counts?.proposed ? "orange" : "" },
      { label: "In use", value: counts?.approved ?? "–", detail: "Read by every scan they apply to", tone: "green" },
      { label: "Retired", value: counts?.retired ?? "–", detail: "Kept for the record, never read" },
    ]}/>
    <Panel>
      <div className="ui-toolbar memory-toolbar">
        <Tabs tabs={TABS.map(t => t.label)} value={tab} onChange={setTab}/>
        <SearchBox value={query} onChange={setQuery} placeholder="Search the memory…"/>
        <select className="cm-select" aria-label="Kind" value={kind} onChange={e => setKind(e.target.value as MemoryKind | "")}>
          <option value="">Every kind</option>{(Object.keys(KIND_LABEL) as MemoryKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </div>
      {state.error ? <Empty title="The AI memory isn't available" description={state.error}/>
        : !entries.length && !state.loading ? <Empty title={search ? "Nothing matches that search" : status === "proposed" ? "Nothing waiting for review" : status === "approved" ? "Nothing in use yet" : "Nothing retired"}
          description={status === "proposed" ? "Moving a line to another trade, rejecting an AI proposal as the wrong trade or not required, or rewording one adds a proposal here." : "Approve proposals, or add what the AI should know."}/>
        : <div className="memory-list" aria-busy={state.loading}>{entries.map(entry => <article key={entry.id} className="memory-entry">
          <div className="memory-entry-copy">
            <span className="memory-entry-meta"><Badge tone={KIND_TONE[entry.kind]}>{KIND_LABEL[entry.kind]}</Badge>{entry.seen > 1 && <Badge tone="orange">Seen {entry.seen} times</Badge>}<small>{projectName(entry.projectId)}{entry.trades.length ? ` · ${entry.trades.join(" · ")}` : " · Every trade"}{entry.section ? ` · ${entry.section}` : ""}</small></span>
            <strong>{entry.text}</strong>
            {entry.detail && <p>{entry.detail}</p>}
            <small>{ORIGIN_LABEL[entry.origin]}{entry.source.from && entry.source.to ? ` (moved from ${entry.source.from} to ${entry.source.to})` : entry.source.reason ? ` (${entry.source.reason})` : ""} · {entry.updatedBy || entry.createdBy} · {displayDate(entry.updatedAt.slice(0, 10))}</small>
          </div>
          <div className="memory-entry-actions">
            {entry.status === "proposed" && <Button variant="primary" onClick={() => void change(entry, { status: "approved" }, "In use: scans read it from now on.")}><Check size={14}/>Approve</Button>}
            {entry.status !== "retired" && <Button onClick={() => setEditing(entry)}><Pencil size={14}/>Edit</Button>}
            {entry.status !== "retired" && <Button onClick={() => void change(entry, { status: "retired" }, "Retired: scans no longer read it.")}><X size={14}/>Retire</Button>}
            {entry.status === "retired" && <Button onClick={() => void change(entry, { status: "approved" }, "Back in use.")}><RotateCcw size={14}/>Use again</Button>}
          </div>
        </article>)}</div>}
    </Panel>
    {adding && <MemoryEditor title="Add to memory" packages={packages} projectId={projectId} projectLabel={projectName(projectId)} onClose={() => setAdding(false)} save={async input => {
      try { const { created } = await addMemory(input); notify(created ? "Added and in use." : "That's already in the memory."); setAdding(false); setTab("In use"); await load(); return null; }
      catch (error) { return error instanceof Error ? error.message : "It couldn't be added."; }
    }}/>}
    {editing && <MemoryEditor title="Edit memory" entry={editing} packages={packages} projectId={projectId} projectLabel={projectName(editing.projectId)} onClose={() => setEditing(null)} save={async input => {
      const message = await change(editing, { text: input.text, detail: input.detail, trades: input.trades, section: input.section }, "Saved.");
      if (!message) setEditing(null);
      return message;
    }}/>}
    {previewing && projectId && <MemoryPreview projectId={projectId} packages={packages} onClose={() => setPreviewing(false)}/>}
  </div>;
}

type EditorInput = { kind: MemoryKind; text: string; detail: string; trades: string[]; section: string | null; projectId: string | null };

function MemoryEditor({ title, entry, packages, projectId, projectLabel, onClose, save }: { title: string; entry?: MemoryEntry; packages: TradePackage[]; projectId: string | null; projectLabel: string; onClose: () => void; save: (input: EditorInput) => Promise<string | null> }) {
  const [kind, setKind] = useState<MemoryKind>(entry?.kind ?? "rule");
  const [text, setText] = useState(entry?.text ?? "");
  const [detail, setDetail] = useState(entry?.detail ?? "");
  const known = (id: string) => packages.find(p => p.id === id);
  const [tradeId, setTradeId] = useState(() => entry ? packages.find(p => tradeTags(p).every(t => entry.trades.includes(t)))?.id ?? (entry.trades.length ? "keep" : "") : "");
  const [section, setSection] = useState(entry?.section ?? "");
  const [onlyHere, setOnlyHere] = useState(entry ? !!entry.projectId : false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    const pkg = known(tradeId);
    const trades = tradeId === "keep" && entry ? entry.trades : pkg ? tradeTags(pkg) : [];
    setError(await save({ kind, text, detail, trades, section: section.trim() || null, projectId: kind === "decision" || onlyHere ? projectId : null }) ?? "");
    setBusy(false);
  };
  return <Modal title={title} subtitle="Scans read entries in use before they read the drawings and specifications. Write it as you would tell a new estimator." onClose={onClose}>
    <form className="memory-form" onSubmit={e => void submit(e)}>
      {!entry && <label>Kind<select value={kind} onChange={e => setKind(e.target.value as MemoryKind)}>{(Object.keys(KIND_LABEL) as MemoryKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>}
      <label>{kind === "example" ? "The line as your bid forms word it" : kind === "decision" ? "What was decided" : "The rule"}<textarea rows={3} value={text} autoFocus onChange={e => setText(e.target.value)} placeholder={kind === "example" ? "Furnish and install metal stud framing at all interior partitions, full height to structure." : kind === "decision" ? "Owner provides FF&E; no trade carries it." : "Put acoustic ceiling panels in Drywall, not Acoustical ceilings."}/></label>
      <label>Detail (optional)<textarea rows={2} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Why, or when it applies"/></label>
      <div className="memory-form-row">
        <label>Trade<select value={tradeId} onChange={e => setTradeId(e.target.value)}>
          <option value="">Every trade</option>
          {tradeId === "keep" && entry && <option value="keep">{entry.trades.join(" · ")}</option>}
          {packages.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select></label>
        <label>Specification section (optional)<input value={section} onChange={e => setSection(e.target.value)} placeholder="09 51 13"/></label>
      </div>
      {!entry && kind !== "decision" && projectId && <label className="memory-check"><input type="checkbox" checked={onlyHere} onChange={e => setOnlyHere(e.target.checked)}/> Only for {projectLabel}</label>}
      {!entry && kind === "decision" && <small>A decision belongs to {projectId ? projectLabel : "a project: open one first"}.</small>}
      {error && <p role="alert" className="memory-error">{error}</p>}
      <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || text.trim().length < 3}>{busy ? "Saving…" : entry ? "Save" : "Add and use"}</Button></div>
    </form>
  </Modal>;
}

/** The memory exactly as a scan of one of this project's trades reads it (lib/memory contextPack). */
function MemoryPreview({ projectId, packages, onClose }: { projectId: string; packages: TradePackage[]; onClose: () => void }) {
  const [tradeId, setTradeId] = useState(packages[0]?.id ?? "");
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetchMemory({ status: ["approved"], project: projectId, limit: 500 }).then(setEntries, e => setError(e instanceof Error ? e.message : "The AI memory couldn't be reached.")); }, [projectId]);
  const pkg = packages.find(p => p.id === tradeId);
  const pack = entries && pkg ? contextPack(entries, { projectId, code: pkg.code, name: pkg.name }) : "";
  return <Modal title="What the AI reads" subtitle="Exactly what a scan of this trade is given before the drawings and specifications." wide onClose={onClose}>
    <div className="memory-preview">
      <label>Trade<select value={tradeId} onChange={e => setTradeId(e.target.value)}>{packages.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
      {error ? <p role="alert" className="memory-error">{error}</p> : entries === null ? <p>Loading…</p>
        : pack ? <pre>{pack}</pre> : <p className="memory-empty"><BrainCircuit size={16}/>Nothing in use applies to {pkg?.name ?? "this trade"} yet, so its scans read as before.</p>}
    </div>
  </Modal>;
}

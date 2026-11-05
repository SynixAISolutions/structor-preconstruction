"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCw, Sparkles, Upload } from "lucide-react";
import { triedExplaining, explainChanges, useContractExplaining } from "../../lib/contract-compare-client";
import { CHANGE_DECISIONS, CONTRACT_COMPARISON_KEY, CONTRACT_RISKS, EMPTY_COMPARISON, MAX_EXPLAINED, clipDiff, compareContracts, comparisonRows, comparisonSummary, filterChanges, reviewOf, type ChangeDecision, type ChangeFilter, type ChangeReview, type Clause, type ComparisonState, type ContractChange, type ContractComparison } from "../../lib/contract-compare";
import type { StoredDocument } from "../../lib/project-files";
import { readStoredText, uploadProjectPdf, useProjectDocuments } from "../../lib/project-files-client";
import type { Project } from "../../lib/projects";
import { sharedReady, useSharedStatus } from "../../lib/shared-sync";
import { readDraft, useLocalDraft } from "../../lib/use-local-draft";
import { StoredDocumentViewer } from "./project-file-viewer";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, SearchBox, Source, Stats, exportRows, type ViewProps } from "./shared";
import "./contract-compare.css";

const kindLabel = { changed: "Changed", added: "New clause", removed: "Removed" } as const;
const kindTone = { changed: "blue", added: "green", removed: "red" } as const;
const riskTone = { adds: "red", reduces: "green", neutral: "neutral" } as const;
const fileLabel = (doc: StoredDocument) => `${doc.name}${doc.revision > 1 ? ` · V${doc.revision}` : ""}`;

/**
 * The previous contract with this client against the current one (Marcel's process doc). The differences are found by
 * plain code the moment both files are chosen (lib/contract-compare); the AI then explains each one and rates its risk,
 * and the contracts team decides.
 */
export function ContractCompareView({ project, navigate, notify }: ViewProps & { project: Project }) {
  const { documents, ready } = useProjectDocuments(project.id);
  const files = useMemo(() => documents.filter(d => d.category === "Contracts").sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)), [documents]);
  const [state, setState] = useLocalDraft<ComparisonState>(CONTRACT_COMPARISON_KEY, EMPTY_COMPARISON);
  // With exactly two contracts there is only one way to read them: older against newer.
  const previous = files.find(f => f.id === state.previousId) ?? (files.length === 2 && !state.previousId ? files[0] : null);
  const current = files.find(f => f.id === state.currentId) ?? (files.length === 2 && !state.currentId ? files[1] : null);
  const pair = previous && current && previous.id !== current.id ? `${previous.id}|${current.id}` : "";
  const [comparison, setComparison] = useState<{ pair: string; result: ContractComparison } | null>(null);
  const [problem, setProblem] = useState("");
  const [uploading, setUploading] = useState("");
  const [filter, setFilter] = useState<ChangeFilter>({});
  const [source, setSource] = useState<{ doc: StoredDocument; page: number; clause: Clause } | null>(null);
  const { progress, failure } = useContractExplaining();
  useSharedStatus();
  const pulled = sharedReady(project.id);

  useEffect(() => {
    if (!pair || !previous || !current) return;
    let live = true;
    setProblem("");
    void Promise.all([readStoredText(previous), readStoredText(current)]).then(([a, b]) => {
      if (!live) return;
      const empty = [[previous, a], [current, b]].find(([, pages]) => !(pages as { text: string }[]).some(p => p.text.trim()));
      if (empty) setProblem(`${(empty[0] as StoredDocument).name} has no text to compare. Upload a PDF with selectable text, not a scan.`);
      else setComparison({ pair, result: compareContracts(a, b) });
    }).catch(error => { if (live) setProblem(error instanceof Error ? error.message : "The contracts could not be read."); });
    return () => { live = false; };
  }, [pair]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = comparison?.pair === pair ? comparison.result : null;
  // Explain once, when a comparison of two versions of one contract has changes nobody has explained (the saved copy,
  // as another browser may have done it). Two different documents would only spend credits, so those wait for a click.
  useEffect(() => {
    if (!result || !pulled || progress || !result.similar || triedExplaining(pair)) return;
    const saved = readDraft<ComparisonState>(project.id, CONTRACT_COMPARISON_KEY, EMPTY_COMPARISON);
    if (result.changes.some(c => !saved.explanations[c.id])) void explainChanges(project.id, pair, result.changes);
  }, [result, pulled, progress, pair, project.id]);

  const summary = result ? comparisonSummary(result.changes, state) : null;
  const shown = result ? filterChanges(result.changes, state, filter) : [];
  const review = (id: string, patch: Partial<ChangeReview>) => setState(s => ({ ...s, reviews: { ...s.reviews, [id]: { ...reviewOf(s, id), ...patch } } }));
  const choose = (side: "previousId" | "currentId", id: string) => setState(s => ({ ...s, previousId: previous?.id ?? "", currentId: current?.id ?? "", [side]: id }));
  async function upload(side: "previousId" | "currentId", file: File) {
    setUploading(side);
    setProblem("");
    try {
      const doc = await uploadProjectPdf({ projectId: project.id, file, category: "Contracts" });
      choose(side, doc.id);
      notify(`${doc.name} is in Project files.`);
    } catch (error) { setProblem(error instanceof Error ? error.message : "The contract could not be stored. Try again."); }
    finally { setUploading(""); }
  }

  return <>
    <PageHeader eyebrow="CONTRACTS" title="Contract comparison" description="The previous contract with this client against the current one: every clause that changed, was added or was removed, what it means and what you decided." actions={result ? <ExportButton onClick={() => exportRows(`${project.name} contract comparison.csv`, comparisonRows(result.changes, state))}/> : undefined}/>
    {!ready ? <p role="status">Loading the project's files…</p> : <div className="contract-cmp">
      <Panel title="The two contracts" subtitle="Pick them from the Contracts in Project files, or upload them here.">
        <div className="contract-cmp-pick">
          <FilePick label="Previous contract" files={files} value={previous} busy={uploading === "previousId"} onChoose={id => choose("previousId", id)} onUpload={file => void upload("previousId", file)}/>
          <FilePick label="Current contract" files={files} value={current} busy={uploading === "currentId"} onChoose={id => choose("currentId", id)} onUpload={file => void upload("currentId", file)}/>
        </div>
        {previous && current && previous.id === current.id && <p className="contract-cmp-note" role="alert">Choose two different files.</p>}
        {problem && <p className="contract-cmp-note error" role="alert">{problem}</p>}
      </Panel>
      {!pair && <Empty title="Choose two contracts" description="Upload or pick the previous contract with this client and the current one. Nothing is sent to the AI until both are chosen." action={<Button onClick={() => navigate("documents")}><FileText size={15}/>Open Project files</Button>}/>}
      {pair && !result && !problem && <p role="status">Comparing the two files…</p>}
      {result && summary && <>
        {!result.similar && <p className="contract-cmp-warning" role="alert"><strong>These look like different documents.</strong> Few of their clauses line up, so the AI hasn't been asked to explain them. Check the files, or choose Explain with AI below.</p>}
        <Stats items={[
          { label: "Changed", value: summary.changed, detail: `${result.same} clauses word for word the same` },
          { label: "New clauses", value: summary.added, tone: summary.added ? "orange" : "" },
          { label: "Removed", value: summary.removed },
          { label: "Figures changed", value: summary.figures, detail: "money, percentages, durations", tone: summary.figures ? "orange" : "" },
          { label: "Adds risk", value: summary.addsRisk, detail: `${summary.explained} of ${result.changes.length} explained`, tone: summary.addsRisk ? "red" : "" },
          { label: "To review", value: summary.open, detail: summary.negotiate ? `${summary.negotiate} to negotiate` : undefined },
        ]}/>
        {result.renumbered.length > 0 && <details className="contract-cmp-renumbered"><summary>{result.renumbered.length} clause{result.renumbered.length === 1 ? "" : "s"} only renumbered, same words</summary><ul>{result.renumbered.map(r => <li key={`${r.from}-${r.to}`}>{r.from} is now {r.to}{r.heading ? ` · ${r.heading}` : ""}</li>)}</ul></details>}
        <div className="contract-cmp-tools">
          <SearchBox value={filter.query ?? ""} onChange={query => setFilter(f => ({ ...f, query }))} placeholder="Search the changes…"/>
          <label className="ui-field">Show<select value={filter.kind ?? ""} onChange={e => setFilter(f => ({ ...f, kind: e.target.value as ChangeFilter["kind"] }))}><option value="">All changes</option><option value="changed">Changed</option><option value="added">New clauses</option><option value="removed">Removed</option></select></label>
          <label className="ui-field">Look at<select value={filter.risk ?? ""} onChange={e => setFilter(f => ({ ...f, risk: e.target.value as ChangeFilter["risk"] }))}><option value="">Everything</option><option value="figures">Figures changed</option>{CONTRACT_RISKS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          <label className="ui-field">Decision<select value={filter.decision ?? ""} onChange={e => setFilter(f => ({ ...f, decision: e.target.value as ChangeFilter["decision"] }))}><option value="">All</option>{CHANGE_DECISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
          {summary.explained < Math.min(result.changes.length, MAX_EXPLAINED) && <Button disabled={!!progress} onClick={() => void explainChanges(project.id, pair, result.changes)}>{progress ? <><Sparkles size={15}/>Explaining {progress.done} of {progress.total}…</> : <><RefreshCw size={15}/>{summary.explained ? "Explain the rest" : "Explain with AI"}</>}</Button>}
        </div>
        {failure.pair === pair && !progress && <p className="contract-cmp-note error" role="alert">{failure.message}</p>}
        {state.model && <p className="contract-cmp-note">Explained by {state.model}{state.cost ? ` · $${state.cost.toFixed(2)}` : ""}. The explanations and risk ratings are the AI's reading, not legal advice; the wording shown is the contracts' own.</p>}
        {!result.changes.length && <Empty title="The two contracts say the same thing" description="Every clause matches word for word, apart from case and punctuation."/>}
        {result.changes.length > 0 && !shown.length && <Empty title="Nothing matches" description="Try another word or filter."/>}
        <ol className="contract-cmp-list">{shown.map(change => <ChangeCard key={change.id} change={change} state={state} onReview={patch => review(change.id, patch)} onSource={clause => { const doc = clause === change.previous ? previous : current; if (doc) setSource({ doc, page: clause.page, clause }); }}/>)}</ol>
      </>}
    </div>}
    {source && <Modal title={source.clause.number ? `Clause ${source.clause.number}` : "Contract source"} subtitle={`Page ${source.page} · ${fileLabel(source.doc)}`} wide onClose={() => setSource(null)}><StoredDocumentViewer doc={source.doc} page={source.page} onPageChange={page => setSource(s => s && { ...s, page })}/></Modal>}
  </>;
}

function FilePick({ label, files, value, busy, onChoose, onUpload }: { label: string; files: StoredDocument[]; value: StoredDocument | null; busy: boolean; onChoose: (id: string) => void; onUpload: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="contract-cmp-file">
    <label className="ui-field">{label}<select value={value?.id ?? ""} onChange={e => onChoose(e.target.value)}><option value="">Choose a file</option>{files.map(f => <option key={f.id} value={f.id}>{fileLabel(f)}</option>)}</select></label>
    <input ref={input} type="file" accept="application/pdf,.pdf" hidden aria-label={`Upload the ${label.toLowerCase()}`} onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = ""; }}/>
    <Button disabled={busy} onClick={() => input.current?.click()}><Upload size={15}/>{busy ? "Uploading…" : "Upload PDF"}</Button>
  </div>;
}

function ChangeCard({ change, state, onReview, onSource }: { change: ContractChange; state: ComparisonState; onReview: (patch: Partial<ChangeReview>) => void; onSource: (clause: Clause) => void }) {
  const explained = state.explanations[change.id], review = reviewOf(state, change.id), number = change.current?.number ?? change.previous?.number;
  return <li className={`contract-cmp-change ${change.kind}`}>
    <header>
      <div><Badge tone={kindTone[change.kind]}>{kindLabel[change.kind]}</Badge>{explained && <Badge tone={riskTone[explained.risk]}>{CONTRACT_RISKS.find(r => r.value === explained.risk)?.label}</Badge>}<strong>{number ? `${number} ` : ""}{change.heading}</strong></div>
      <div className="contract-cmp-sources">{change.previous && <Source onClick={() => onSource(change.previous!)}>Previous p. {change.previous.page}</Source>}{change.current && <Source onClick={() => onSource(change.current!)}>Current p. {change.current.page}</Source>}</div>
    </header>
    {explained && <p className="contract-cmp-summary">{explained.summary}</p>}
    {(change.figures.was.length > 0 || change.figures.now.length > 0) && <p className="contract-cmp-figures">{change.figures.was.length > 0 && <span><small>WAS</small>{change.figures.was.join(", ")}</span>}{change.figures.now.length > 0 && <span><small>NOW</small>{change.figures.now.join(", ")}</span>}</p>}
    <blockquote className="contract-cmp-wording">{change.kind === "changed"
      ? clipDiff(change.diff).map((part, i) => part.op === "add" ? <ins key={i}>{part.text} </ins> : part.op === "del" ? <del key={i}>{part.text} </del> : <span key={i}>{part.text} </span>)
      : change.kind === "added" ? <ins>{change.current?.text}</ins> : <del>{change.previous?.text}</del>}</blockquote>
    <footer>
      <label className="ui-field">Decision<select value={review.decision} onChange={e => onReview({ decision: e.target.value as ChangeDecision })}>{CHANGE_DECISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      <label className="ui-field">Note<input value={review.note} placeholder="What to raise with the client" onChange={e => onReview({ note: e.target.value })}/></label>
    </footer>
  </li>;
}

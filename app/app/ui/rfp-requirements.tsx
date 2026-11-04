"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { Project } from "../../lib/projects";
import { latestDocuments, type StoredDocument } from "../../lib/project-files";
import { useProjectDocuments } from "../../lib/project-files-client";
import { readRequirements, triedReading, useRequirementReading } from "../../lib/rfp-requirements-client";
import { EMPTY_REQUIREMENTS, MAX_REQUIREMENT_PAGES, REQUIREMENTS_KEY, REQUIREMENT_GROUPS, REQUIREMENT_STATUSES, REQUIREMENT_TEAMS, TEAM_FOR_GROUP, addRequirement, canRemove, filterRequirements, removeRequirement, requirementRows, requirementSummary, requirementsByGroup, unreadFiles, updateRequirement, type RequirementFilter, type RequirementGroup, type RequirementStatus, type RequirementTeam, type RequirementsState, type RfpRequirement } from "../../lib/rfp-requirements";
import { sharedReady, useSharedStatus } from "../../lib/shared-sync";
import { readDraft, useLocalDraft } from "../../lib/use-local-draft";
import { StoredDocumentViewer } from "./project-file-viewer";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, SearchBox, Source, Stats, exportRows, type ViewProps } from "./shared";
import "./rfp-requirements.css";

/**
 * Everything the RFP asks for, as one list (Marcel's process doc). The RFP and its addenda are read when this page
 * opens and they haven't been read yet (lib/rfp-requirements); every team then works through its own lines.
 */
export function RfpRequirementsView({ project, navigate, notify }: ViewProps & { project: Project }) {
  const { documents, ready } = useProjectDocuments(project.id);
  const files = useMemo(() => latestDocuments(documents).filter(d => d.category === "RFP" || d.category === "Addenda"), [documents]);
  const [state, setState] = useLocalDraft<RequirementsState>(REQUIREMENTS_KEY, EMPTY_REQUIREMENTS);
  const { progress, failures } = useRequirementReading();
  useSharedStatus();
  const pulled = sharedReady(project.id);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<RequirementFilter["team"]>("");
  const [status, setStatus] = useState<RequirementFilter["status"]>("");
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState<{ item: RfpRequirement; doc: StoredDocument; page: number } | null>(null);

  async function read(doc: StoredDocument) {
    const merged = await readRequirements(project.id, doc);
    if (merged) notify(`${doc.name}: ${merged.added} new requirement${merged.added === 1 ? "" : "s"}, ${merged.kept} already listed${merged.missing ? `, ${merged.missing} no longer found` : ""}.`);
  }
  // Read once, when a file is here that hasn't been read (the saved list, as another browser may have read it already).
  useEffect(() => {
    if (!ready || !pulled || progress) return;
    const next = unreadFiles(files, readDraft<RequirementsState>(project.id, REQUIREMENTS_KEY, EMPTY_REQUIREMENTS)).find(f => !triedReading(f.id));
    if (next) void read(next);
  }, [ready, pulled, progress, files, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().slice(0, 10);
  const summary = requirementSummary(state.items, today);
  const groups = requirementsByGroup(filterRequirements(state.items, { query, team, status }));
  const openSource = (item: RfpRequirement) => {
    const doc = documents.find(d => d.id === item.docId);
    if (doc) setSource({ item, doc, page: item.page });
    else notify(`${item.docName} is no longer in Project files.`);
  };

  return <>
    <PageHeader eyebrow="PROJECT REQUIREMENTS" title="RFP requirements" description="Everything the RFP and its addenda ask for, in one list: what to submit, the contract rules, subcontractor qualifications, the costs to include." actions={<>
      <ExportButton onClick={() => exportRows(`${project.name} RFP requirements.csv`, requirementRows(state.items))}/>
      <Button variant="primary" onClick={() => setAdding(true)}><Plus size={16}/>Add requirement</Button>
    </>}/>
    {!ready ? <p role="status">Loading the project's files…</p>
      : !files.length && !state.items.length ? <Empty title="No RFP yet" description="Upload the RFP or invitation to bid, and any addenda, to the RFP folder in Project files. The AI lists what they require here." action={<Button variant="primary" onClick={() => navigate("documents")}><FileText size={15}/>Open Project files</Button>}/>
      : <div className="rfp-req">
        {files.length > 0 && <Panel title="Files read" subtitle="The newest version of each RFP and addendum. A new version is read when this page opens; what you recorded stays."><ul className="rfp-req-files">{files.map(file => {
          const reading = state.readings.find(r => r.docId === file.id), active = progress?.docId === file.id, count = state.items.filter(i => i.docId === file.id).length;
          return <li key={file.id}>
            <div><strong>{file.name}</strong><small>{active
              ? (progress.total ? `Read ${progress.done} of ${progress.total} pages…` : "Getting its pages…")
              : reading ? `${count} requirement${count === 1 ? "" : "s"} · read by ${reading.model} on ${new Date(reading.at).toLocaleDateString("en-US")}${reading.cost ? ` · $${reading.cost.toFixed(2)}` : ""}` : "Not read yet"}</small>
              {reading && !active && reading.failedPages > 0 && <small className="error" role="alert">{reading.failedPages} page{reading.failedPages === 1 ? "" : "s"} could not be read. Read again to finish it.</small>}
              {reading && !active && reading.capped && <small>Only the first {MAX_REQUIREMENT_PAGES} pages are read.</small>}
              {failures[file.id] && !active && <small className="error" role="alert">{failures[file.id]}</small>}</div>
            <Button disabled={!!progress} onClick={() => void read(file)}>{active ? <><Sparkles size={15}/>Reading…</> : <><RefreshCw size={15}/>{reading ? "Read again" : "Read with AI"}</>}</Button>
          </li>;
        })}</ul></Panel>}
        {state.items.length > 0 && <Stats items={[
          { label: "Open", value: summary.open, detail: `of ${summary.total} requirements`, tone: summary.open ? "orange" : "" },
          { label: "Done", value: summary.done, detail: summary.na ? `${summary.na} not applicable` : undefined },
          ...summary.teams.map(t => ({ label: t.team, value: t.open, detail: `open of ${t.total}` })),
          ...(summary.overdue ? [{ label: "Past due", value: summary.overdue, detail: "open, with a date gone by", tone: "red" }] : []),
          ...(summary.missing ? [{ label: "No longer found", value: summary.missing, detail: "check them against the latest file", tone: "yellow" }] : []),
        ]}/>}
        {state.items.length > 0 && <div className="rfp-req-filters">
          <SearchBox value={query} onChange={setQuery} placeholder="Search requirements…"/>
          <label className="ui-field">Team<select value={team} onChange={e => setTeam(e.target.value as RequirementFilter["team"])}><option value="">All teams</option>{REQUIREMENT_TEAMS.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="ui-field">Status<select value={status} onChange={e => setStatus(e.target.value as RequirementFilter["status"])}><option value="">All</option>{REQUIREMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}<option value="missing">No longer found</option></select></label>
        </div>}
        {state.items.length > 0 && !groups.length && <Empty title="Nothing matches" description="Try another word, team or status."/>}
        {groups.map(group => <Panel key={group.group} title={group.group} subtitle={`${group.open} open of ${group.items.length}`}>
          <div className="ui-table-wrap"><table className="ui-table rfp-req-table"><thead><tr><th>Requirement</th><th>Team</th><th>Due</th><th>Status</th><th>Source</th></tr></thead><tbody>
            {group.items.map(item => <tr key={item.id} className={item.status === "na" ? "muted" : ""}>
              <td><strong>{item.text}</strong>
                {item.missing && <div><Badge tone="yellow">Not in the latest reading</Badge></div>}
                <input className="rfp-req-note" aria-label={`Note on ${item.text}`} placeholder="Add a note" value={item.note} onChange={e => setState(s => updateRequirement(s, item.id, { note: e.target.value }))}/></td>
              <td><select aria-label={`Team for ${item.text}`} value={item.team} onChange={e => setState(s => updateRequirement(s, item.id, { team: e.target.value as RequirementTeam }))}>{REQUIREMENT_TEAMS.map(t => <option key={t}>{t}</option>)}</select></td>
              <td><input type="date" aria-label={`Due date for ${item.text}`} value={item.due ?? ""} onChange={e => setState(s => updateRequirement(s, item.id, { due: e.target.value || null }))}/></td>
              <td><select className={`rfp-req-status ${item.status}`} aria-label={`Status of ${item.text}`} value={item.status} onChange={e => setState(s => updateRequirement(s, item.id, { status: e.target.value as RequirementStatus }))}>{REQUIREMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></td>
              <td>{item.docId ? <Source onClick={() => openSource(item)}>Page {item.page}</Source> : <small>Added by hand</small>}
                {canRemove(item) && <button className="ui-icon-btn rfp-req-remove" aria-label={`Remove ${item.text}`} title="Remove" onClick={() => setState(s => removeRequirement(s, item.id))}><Trash2 size={14}/></button>}</td>
            </tr>)}
          </tbody></table></div>
        </Panel>)}
      </div>}
    {adding && <AddRequirement onClose={() => setAdding(false)} onAdd={input => { setState(addRequirement(state, input)); setAdding(false); notify("Requirement added."); }}/>}
    {source && <Modal title="RFP source" subtitle={`Page ${source.page} · ${source.doc.name}`} wide onClose={() => setSource(null)}><blockquote>{source.item.quote}</blockquote><StoredDocumentViewer doc={source.doc} page={source.page} highlight={source.page === source.item.page ? source.item.quote : undefined} onPageChange={page => setSource(s => s && { ...s, page })}/></Modal>}
  </>;
}

function AddRequirement({ onAdd, onClose }: { onAdd: (input: { text: string; group: RequirementGroup; team: RequirementTeam; due: string | null }) => void; onClose: () => void }) {
  const [text, setText] = useState(""), [group, setGroup] = useState<RequirementGroup>(REQUIREMENT_GROUPS[0]), [team, setTeam] = useState<RequirementTeam>(TEAM_FOR_GROUP[REQUIREMENT_GROUPS[0]]), [due, setDue] = useState(""), [error, setError] = useState("");
  return <Modal title="Add a requirement" subtitle="Anything the job requires that isn't on the list." onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); try { onAdd({ text, group, team, due: due || null }); } catch (failure) { setError(failure instanceof Error ? failure.message : "The requirement could not be added."); } }}>
      <div className="ui-form-grid">
        <label className="ui-field full">Requirement<textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={300}/></label>
        <label className="ui-field">Group<select value={group} onChange={e => { const next = e.target.value as RequirementGroup; setGroup(next); setTeam(TEAM_FOR_GROUP[next]); }}>{REQUIREMENT_GROUPS.map(g => <option key={g}>{g}</option>)}</select></label>
        <label className="ui-field">Team<select value={team} onChange={e => setTeam(e.target.value as RequirementTeam)}>{REQUIREMENT_TEAMS.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="ui-field">Due<input type="date" value={due} onChange={e => setDue(e.target.value)}/></label>
      </div>
      {error && <p className="rfp-req-error" role="alert">{error}</p>}
      <div className="ui-form-actions"><Button type="submit" variant="primary">Add requirement</Button></div>
    </form>
  </Modal>;
}

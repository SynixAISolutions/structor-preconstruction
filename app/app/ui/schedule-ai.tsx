"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Modal } from "./shared";
import { displayDate } from "../../lib/format";
import { aiJob } from "../../lib/ai-more-client";
import type { ScheduleSuggestInput, ScheduleSuggestion } from "../../lib/ai-jobs-more";
import { drawingRegister, findManual } from "../../lib/project-files";
import { useProjectDocuments } from "../../lib/project-files-client";
import { useActiveProject } from "../../lib/project-scope";
import { loadProjects, sampleProjectRecords } from "../../lib/projects";
import { projectSpan, reschedule, scheduleFromSuggestion, scheduleRows, ScheduleRuleError, type ImportResult } from "../../lib/schedule";
import type { Procurement } from "../../lib/procurement";

/**
 * 15 Oct: the AI drafts the project schedule "like a suggestion" from the project facts, its bid
 * packages and the stored drawings and specifications; the team reviews it before it replaces the
 * schedule (through the same confirm as an XML import).
 */
export function ScheduleAiSuggest({ procurement, defaultStart, today, onUse }: { procurement: Procurement; defaultStart: string; today: string; onUse: (result: ImportResult) => void }) {
  const projectId = useActiveProject();
  const { documents } = useProjectDocuments();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [start, setStart] = useState(defaultStart), [notes, setNotes] = useState("");
  const [suggestion, setSuggestion] = useState<{ summary: string; basis: Map<string, string>; result: ImportResult } | null>(null);

  async function suggest() {
    const project = (loadProjects() ?? sampleProjectRecords).find(p => p.id === projectId);
    if (!project) { setError("Open a project first."); return; }
    const manual = findManual(documents);
    const input: ScheduleSuggestInput = {
      project: { name: project.name, type: project.type, location: project.location, description: project.description, squareFeet: project.squareFeet, workType: project.workType ?? "", renovationSquareFeet: project.renovationSquareFeet, additionSquareFeet: project.additionSquareFeet, value: project.value },
      start, notes,
      packages: procurement.packages.map(k => ({ id: k.id, code: k.code, name: k.name })),
      drawings: drawingRegister(documents).map(r => `${r.sheet} ${r.title}`.trim()),
      specs: manual?.sections.map(s => `${s.section} ${s.title}`) ?? [],
    };
    setBusy(true); setError(""); setSuggestion(null);
    try {
      const reply = await aiJob<ScheduleSuggestion>("schedule-suggest", input);
      setSuggestion({ summary: reply.summary, basis: new Map(reply.activities.map(a => [a.code, a.basis])), result: scheduleFromSuggestion(reply.activities, start) });
    } catch (e) {
      setError(e instanceof ScheduleRuleError ? Object.values(e.errors)[0] ?? e.message : e instanceof Error ? e.message : "The suggestion failed.");
    } finally { setBusy(false); }
  }

  const planned = suggestion ? reschedule({ activities: suggestion.result.activities, log: [], importedFrom: null }).state : null;
  const rows = planned ? scheduleRows(planned, today) : [];
  const span = planned ? projectSpan(planned) : null;
  const pkg = (id: string | null) => procurement.packages.find(k => k.id === id)?.name ?? "";

  return <>
    <Button onClick={() => { setStart(defaultStart); setOpen(true); }}><Sparkles size={15}/>Suggest schedule with AI</Button>
    {open && <Modal title="Suggested project schedule" subtitle="A first draft from the project information, bid packages, drawings and specifications. Review it before using it." wide onClose={() => { if (!busy) setOpen(false); }}>
      <div className="proc-form-actions">
        <label className="ui-field"><span>Start date</span><input type="date" value={start} onChange={e => setStart(e.target.value)} disabled={busy}/></label>
        <label className="ui-field" style={{ flex: 1 }}><span>Notes for the AI (optional)</span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. the pool stays open until the new building is occupied" disabled={busy}/></label>
        <Button variant="primary" disabled={busy || !start} onClick={() => void suggest()}>{busy ? "Drafting… about a minute" : suggestion ? "Ask again" : "Suggest schedule"}</Button>
      </div>
      {error && <p role="alert" className="sched-error">{error}</p>}
      {suggestion && span && <>
        <p className="proc-modal-note">{suggestion.summary} <strong>{rows.length} activities, {displayDate(span.start)} – {displayDate(span.finish)} ({span.workdays} working days).</strong></p>
        {suggestion.result.warnings.length > 0 && <p className="intel-muted">{suggestion.result.warnings.length} link{suggestion.result.warnings.length === 1 ? " was" : "s were"} dropped: {suggestion.result.warnings.slice(0, 3).join(" ")}</p>}
        <div className="ui-table-wrap"><table className="ui-table">
          <thead><tr><th>Code</th><th>Activity</th><th>Phase</th><th>Trade</th><th>Start</th><th>Finish</th><th>Days</th><th>Why this long</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.code}</td><td>{r.name}{r.critical && <small> · critical</small>}</td><td>{r.phase}</td><td>{pkg(r.packageId)}</td><td>{displayDate(r.start)}</td><td>{displayDate(r.finish)}</td><td>{r.milestone ? "◆" : r.duration}</td><td><small>{suggestion.basis.get(r.code)}</small></td></tr>)}</tbody>
        </table></div>
        <div className="proc-form-actions"><span className="intel-muted">Using it replaces the current schedule; you can export the current one first.</span><Button variant="primary" onClick={() => { onUse(suggestion.result); setOpen(false); }}>Use this schedule</Button></div>
      </>}
    </Modal>}
  </>;
}

"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, Download, FileUp, Link2, Plus, Trash2 } from "lucide-react";
import { dateLabel, displayDate, downloadText } from "../../lib/format";
import {
  LINK_TYPES, PROCUREMENT_LINKS, BUYOUT_DAYS, ScheduleRuleError, addActivity, addDependency, editActivity, filterSchedule,
  lookahead, parseMsProjectXml, phaseSummary, projectSpan, removeActivity, removeDependency,
  replaceSchedule, scheduleRows, setProgress, toCsv, toMsProjectXml, workdaysBetween,
  type ActivityInput, type ImportResult, type LinkType, type ProcurementLink, type ScheduleErrors, type ScheduleRow,
} from "../../lib/schedule";
import { addProcurementActivities, packagesWithoutBuyout, procurementSchedule } from "../../lib/schedule-procurement";
import { useAward } from "../../lib/use-award";
import { useSchedule } from "../../lib/use-schedule";
import { useProcurement } from "../../lib/use-procurement";
import { ScheduleAiSuggest } from "./schedule-ai";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Stats, type ViewProps } from "./shared";
import "./schedule-ui.css";

const ACTOR = "Marcel Khoury";
const dateMs = (value: string) => Date.parse(`${value}T00:00:00Z`);
const currentDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const firstError = (errors: ScheduleErrors) => Object.values(errors)[0] ?? "Check this activity.";

function calendarMonths(start: string, finish: string) {
  const months: { date: number; label: string }[] = [];
  const end = dateMs(finish);
  const cursor = new Date(dateMs(start)); cursor.setUTCDate(1);
  while (cursor.getTime() <= end) {
    months.push({ date: cursor.getTime(), label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function ScheduleView({ projectName, notify }: ViewProps) {
  const { state, run } = useSchedule();
  const { state: procurement } = useProcurement();
  const { state: awards } = useAward();
  const today = currentDay();
  // Bids-due dates and buyout progress come from procurement (lib/schedule-procurement); every view and export reads this plan.
  const plan = useMemo(() => procurementSchedule(state, { procurement, awards }, today), [state, procurement, awards, today]);
  const allRows = scheduleRows(plan.state, today);
  const [query, setQuery] = useState(""), [phase, setPhase] = useState(""), [owner, setOwner] = useState(""), [status, setStatus] = useState(""), [criticalOnly, setCriticalOnly] = useState(false), [lateOnly, setLateOnly] = useState(false);
  const rows = filterSchedule(allRows, { query, phase, owner, status: status ? status as ScheduleRow["status"] : undefined, critical: criticalOnly ? true : undefined, late: lateOnly ? true : undefined });
  const phases = phaseSummary(allRows), span = projectSpan(plan.state), upcoming = lookahead(allRows, today);
  const withoutBuyout = packagesWithoutBuyout(state, procurement);
  const phaseOptions = [...new Set(["Design", "Preconstruction", "Procurement", "Construction", ...phases.map(item => item.phase)])];
  const [selectedId, setSelectedId] = useState(""), [editing, setEditing] = useState<"new" | string | null>(null);
  const [error, setError] = useState(""), [warnings, setWarnings] = useState<string[]>([]), [confirmRemove, setConfirmRemove] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ fileName: string; result: ImportResult } | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const selected = allRows.find(item => item.id === selectedId) ?? allRows[0];
  const edited = editing && editing !== "new" ? state.activities.find(item => item.id === editing) : null;
  const editedPlan = edited ? plan.state.activities.find(item => item.id === edited.id) ?? edited : null;
  const [link, setLink] = useState<ProcurementLink | "">("");
  useEffect(() => { setLink(edited?.procurement ?? ""); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = state.log.at(-1), latestDays = latest?.shifted.length ? Math.max(...latest.shifted.map(item => workdaysBetween(item.from, item.to))) : 0;
  const months = span ? calendarMonths(span.start, span.finish) : [];
  const periodStart = span ? dateMs(span.start) : 0, periodDays = span ? Math.max(1, Math.round((dateMs(span.finish) - periodStart) / 86400000) + 1) : 1;
  const percent = (value: string) => (dateMs(value) - periodStart) / 86400000 / periodDays * 100;
  const width = Math.max(900, months.length * 130);
  function apply(action: Parameters<typeof run>[0], message: string) {
    const issues = run(action);
    if (issues) { setError(firstError(issues)); return false; }
    setError(""); notify(message); return true;
  }
  function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: ActivityInput = { name: String(data.get("name") ?? ""), code: String(data.get("code") ?? ""), phase: String(data.get("phase") ?? ""), owner: String(data.get("owner") ?? ""), packageId: String(data.get("packageId") ?? "") || null, start: String(data.get("start") ?? ""), duration: Number(data.get("duration")), procurement: (String(data.get("procurement") ?? "") || null) as ProcurementLink | null };
    const progress = Number(data.get("progress"));
    if (edited && !input.procurement && input.duration === 0 && progress !== 0 && progress !== 100) {
      setError("A milestone is either not reached (0%) or reached (100%).");
      return;
    }
    const saved = edited ? apply(current => editActivity(current, edited.id, input, ACTOR), "Activity updated; linked work was rescheduled where needed.") : apply(current => addActivity(current, input, ACTOR), "Activity added.");
    if (!saved) return;
    // Progress of an activity that follows procurement is worked out, not typed.
    if (edited && !input.procurement && progress !== edited.progress && !apply(current => setProgress(current, edited.id, progress, ACTOR), "Progress updated.")) return;
    setEditing(null); setConfirmRemove(false);
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) { setError("The file is too large (10 MB at most)."); return; }
      const parsed = parseMsProjectXml(await file.text());
      setError(""); setPendingImport({ fileName: file.name, result: parsed });
    } catch (cause) { setError(cause instanceof ScheduleRuleError ? firstError(cause.errors) : "Could not read this XML file."); }
    finally { if (filePicker.current) filePicker.current.value = ""; }
  }
  function addBuyout() {
    apply(current => addProcurementActivities(current, procurement, today, ACTOR), `Bids-due and buyout activities added for ${withoutBuyout.length} trade${withoutBuyout.length === 1 ? "" : "s"}.`);
  }
  function confirmImport() {
    if (!pendingImport) return;
    const { fileName, result } = pendingImport;
    if (!apply(current => replaceSchedule(current, result, fileName, ACTOR), `${result.activities.length} activities imported from ${fileName}.`)) return;
    setWarnings(result.warnings); setSelectedId(""); setPhase(""); setOwner(""); setStatus(""); setCriticalOnly(false); setLateOnly(false); setPendingImport(null);
  }
  return <div className="sched-view">
    <PageHeader eyebrow={`${projectName} / Operations`} title="Project schedule" description="Plan activities, link their timing, and see what shifts when a predecessor changes." actions={<div className="sched-header-actions"><input ref={filePicker} hidden type="file" accept=".xml,text/xml,application/xml" aria-label="Import MS Project XML" onChange={event => void importFile(event.target.files?.[0])}/><ScheduleAiSuggest procurement={procurement} defaultStart={today} today={today} onUse={result => setPendingImport({ fileName: "AI suggested schedule", result })}/><Button onClick={() => filePicker.current?.click()}><FileUp size={15}/>Import XML</Button><Button onClick={() => downloadText("project-schedule.xml", toMsProjectXml(plan.state, projectName), "application/xml")}><Download size={15}/>Export XML</Button><Button onClick={() => downloadText("project-schedule.csv", toCsv(plan.state, today), "text/csv")}><Download size={15}/>Export CSV</Button>{withoutBuyout.length > 0 && <Button onClick={addBuyout} aria-label={`Add bids-due and buyout activities for ${withoutBuyout.length} trades`}><Plus size={15}/>Buyout activities</Button>}<Button variant="primary" onClick={() => { setError(""); setEditing("new"); }}><Plus size={15}/>Add activity</Button></div>}/>
    <PreviewNote>Demo plan saved in this browser · Weekdays only; holidays are not modeled. MS Project XML can also be exchanged with P6.</PreviewNote>
    {error && !editing && <p className="sched-error" role="alert"><AlertTriangle size={15}/>{error}</p>}
    {warnings.length > 0 && <details className="sched-import-warnings"><summary>{warnings.length} import warning{warnings.length === 1 ? "" : "s"}</summary>{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
    <Stats items={[{ label: "Activities", value: allRows.length, detail: `${phases.length} phases` }, { label: "Project finish", value: span ? displayDate(span.finish) : "—", detail: span ? `${span.workdays} working days` : "No activities yet" }, { label: "Critical path", value: allRows.filter(item => item.critical).length, detail: "Activities with no float", tone: "amber" }, { label: "Late", value: allRows.filter(item => item.late).length, detail: `As of ${displayDate(today)}`, tone: "amber" }]}/>
    {latest?.shifted.length ? <div className="sched-shift"><CalendarDays size={18}/><span><strong>{latest.shifted.length} activit{latest.shifted.length === 1 ? "y" : "ies"} pushed, up to {latestDays} working day{latestDays === 1 ? "" : "s"}</strong><small>{latest.action} · No activity was pulled earlier.</small></span></div> : null}
    {!state.activities.length ? <Panel><Empty title="No schedule activities" description="Add an activity or import a Microsoft Project XML file to start this project's plan." action={<Button onClick={() => setEditing("new")}>Add activity</Button>}/></Panel> : <>
      <Panel title="Phase progress" subtitle="Progress is weighted by working-day duration."><div className="sched-phases">{phases.map(item => <button key={item.phase} onClick={() => setPhase(phase === item.phase ? "" : item.phase)} aria-pressed={phase === item.phase}><span><strong>{item.phase}</strong><small>{item.activities} {item.activities === 1 ? "activity" : "activities"} · {displayDate(item.start)} – {displayDate(item.finish)}</small></span><b>{item.progress}%</b><i><em style={{ width: `${item.progress}%` }}/></i><small>{item.critical} critical · {item.late} late</small></button>)}</div></Panel>
      <Panel title="Linked timeline" subtitle="Select an activity to inspect or edit it. The timeline shows calendar placement; durations and lag use working days.">
        <div className="sched-filters"><input aria-label="Search schedule" placeholder="Search activity, ID, owner…" value={query} onChange={event => setQuery(event.target.value)}/><select aria-label="Filter schedule by phase" value={phase} onChange={event => setPhase(event.target.value)}><option value="">All phases</option>{phases.map(item => <option key={item.phase}>{item.phase}</option>)}</select><select aria-label="Filter schedule by owner" value={owner} onChange={event => setOwner(event.target.value)}><option value="">All owners</option>{[...new Set(allRows.map(item => item.owner).filter(Boolean))].sort().map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter schedule by status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="complete">Complete</option></select><label><input type="checkbox" checked={criticalOnly} onChange={event => setCriticalOnly(event.target.checked)}/>Critical only</label><label><input type="checkbox" checked={lateOnly} onChange={event => setLateOnly(event.target.checked)}/>Late only</label></div>
        <div className="sched-scroll"><div className="sched-gantt" style={{ width }}><div className="sched-gantt-head"><span>Activity / owner</span><div className="sched-time-axis">{months.map(item => <span key={item.date} style={{ left: `${Math.max(0, (item.date - periodStart) / 86400000 / periodDays * 100)}%` }}>{item.label}</span>)}</div></div>{rows.map(item => <button className={`sched-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}><span className="sched-row-label"><strong>{item.code} · {item.name}</strong><small>{item.phase} · {item.owner || "Unassigned"} · {dateLabel(item.start)} – {dateLabel(item.finish)}{plan.sources[item.id] ? ` · ${item.procurement === "bids-due" ? "date from bid package" : "progress from buyout"}` : ""}</small></span><span className="sched-row-track"><span className={`sched-bar ${item.critical ? "critical" : ""} ${item.milestone ? "milestone" : ""} ${item.late ? "late" : ""}`} style={{ left: `${percent(item.start)}%`, width: item.milestone ? 12 : `${Math.max(.8, (dateMs(item.finish) - dateMs(item.start)) / 86400000 / periodDays * 100 + 100 / periodDays)}%` }}><i style={{ width: `${item.progress}%` }}/></span></span></button>)}{!rows.length && <Empty title="No activities match" description="Clear the filters to see the full schedule."/>}</div></div>
        <div className="sched-legend"><span><i className="critical"/>Critical path</span><span><i/>Other activities</span><span>◆ Milestone</span></div>
      </Panel>
      {selected && <Panel title={`${selected.code} · ${selected.name}`} subtitle={`${selected.phase} · ${selected.owner || "Unassigned"}`} action={<Button onClick={() => { setEditing(selected.id); setError(""); setConfirmRemove(false); }}>Edit activity<ArrowRight size={14}/></Button>}><div className="sched-detail"><div><strong>{displayDate(selected.start)} – {displayDate(selected.finish)}</strong><small>{selected.duration === 0 ? "Milestone" : `${selected.duration} working days`} · {selected.progress}% complete · {selected.float} day{selected.float === 1 ? "" : "s"} float</small>{plan.sources[selected.id] && <small className="sched-source"><Link2 size={13}/>{PROCUREMENT_LINKS[plan.sources[selected.id].kind]} · {plan.sources[selected.id].detail}</small>}<Badge tone={selected.critical ? "amber" : selected.status === "complete" ? "green" : "blue"}>{selected.critical ? "Critical" : selected.status.replaceAll("-", " ")}</Badge></div><div><strong>Predecessor links</strong>{selected.predecessors.map(link => { const source = state.activities.find(item => item.id === link.activityId); return <div className="sched-link" key={link.activityId}><Link2 size={15}/><span>{source?.code ?? "Missing"} · {source?.name ?? "Unknown"} · {link.type}{link.lag ? `${link.lag > 0 ? "+" : ""}${link.lag}d` : ""}</span><button aria-label={`Remove link from ${source?.code}`} onClick={() => apply(current => removeDependency(current, selected.id, link.activityId, ACTOR), "Dependency removed.")}><Trash2 size={14}/></button></div>; })}{!selected.predecessors.length && <small>No predecessor links.</small>}<form className="sched-link-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (apply(current => addDependency(current, selected.id, { activityId: String(data.get("activityId")), type: String(data.get("type")) as LinkType, lag: Number(data.get("lag")) }, ACTOR), "Dependency added; dates were pushed where required.")) event.currentTarget.reset(); }}><select name="activityId" required aria-label="Predecessor activity" defaultValue=""><option value="" disabled>Choose predecessor</option>{state.activities.filter(item => item.id !== selected.id && !selected.predecessors.some(link => link.activityId === item.id)).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><select name="type" aria-label="Link type">{LINK_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select><input type="number" name="lag" aria-label="Lag in working days" min={-250} max={250} step="1" defaultValue={0}/><Button type="submit">Add link</Button></form>{error && <p className="sched-error" role="alert">{error}</p>}</div></div></Panel>}
      <div className="sched-secondary"><Panel title="Next 3 weeks" subtitle="Unfinished activities overlapping the working-day look-ahead.">{upcoming.length ? <div className="sched-lookahead">{upcoming.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)}><span><strong>{item.code} · {item.name}</strong><small>{displayDate(item.start)} – {displayDate(item.finish)} · {item.owner || "Unassigned"}</small></span>{item.late && <Badge tone="amber">Late</Badge>}</button>)}</div> : <Empty title="No upcoming activity" description="No unfinished work is scheduled in the next three weeks."/>}</Panel><Panel title="Change log" subtitle="Dates pushed by linked activities are recorded here.">{state.log.length ? <div className="sched-history">{[...state.log].reverse().slice(0, 12).map((entry, index) => <details key={`${entry.at}-${index}`}><summary><span><strong>{entry.action}</strong><small>{new Date(entry.at).toLocaleString()} · {entry.by}</small></span><b>{entry.shifted.length} pushed</b></summary>{entry.shifted.map(item => <p key={item.id}>{item.code}: {displayDate(item.from)} → {displayDate(item.to)} ({workdaysBetween(item.from, item.to)} working days)</p>)}</details>)}</div> : <Empty title="No changes yet" description="Editing activities or their links will record who changed the plan and which dates moved."/>}</Panel></div>
    </>}
    {pendingImport && <Modal title="Replace project schedule?" subtitle={pendingImport.fileName} onClose={() => { setPendingImport(null); setError(""); }}><div className="sched-import-confirm"><p>This schedule has <strong>{pendingImport.result.activities.length} activit{pendingImport.result.activities.length === 1 ? "y" : "ies"}</strong>. Importing it will replace this project's current {state.activities.length} activit{state.activities.length === 1 ? "y" : "ies"} and reload the linked timeline.</p><p>Export the current schedule first if you want to keep it.</p>{pendingImport.result.warnings.length > 0 && <p>{pendingImport.result.warnings.length} import warning{pendingImport.result.warnings.length === 1 ? "" : "s"} will be shown after import.</p>}{error && <p className="sched-error" role="alert">{error}</p>}<div><Button onClick={() => downloadText("project-schedule.xml", toMsProjectXml(state, projectName), "application/xml")}><Download size={14}/>Export current XML</Button><Button onClick={() => { setPendingImport(null); setError(""); }}>Cancel</Button><Button variant="primary" onClick={confirmImport}>Replace schedule</Button></div></div></Modal>}
    {editing && <Modal title={editing === "new" ? "Add activity" : `Edit ${edited?.code ?? "activity"}`} subtitle="Durations and link lag are working days, Monday through Friday." onClose={() => { setEditing(null); setConfirmRemove(false); setError(""); }} wide><form className="sched-form" onSubmit={saveActivity}>{error && <p className="sched-error" role="alert">{error}</p>}<div className="ui-form-grid"><label className="ui-field">Activity name<input autoFocus required name="name" maxLength={200} defaultValue={edited?.name ?? ""}/></label><label className="ui-field">Activity ID<input name="code" maxLength={40} defaultValue={edited?.code ?? ""} placeholder="Auto assigned"/></label><label className="ui-field">Phase<input name="phase" list="sched-phase-options" defaultValue={edited?.phase ?? "Preconstruction"}/><datalist id="sched-phase-options">{phaseOptions.map(item => <option key={item} value={item}/>)}</datalist></label><label className="ui-field">Owner<input name="owner" defaultValue={edited?.owner ?? ""}/></label><label className="ui-field">Start<input key={`start-${link}`} required type="date" name="start" readOnly={link === "bids-due"} defaultValue={(link === "bids-due" ? editedPlan?.start : edited?.start) ?? today}/>{link === "bids-due" && <small className="sched-field-note">The trade's bid due date (Bid packages).</small>}</label><label className="ui-field">Duration · working days<input key={`duration-${link}`} required type="number" name="duration" min={0} max={2000} step={1} readOnly={link === "bids-due"} defaultValue={link === "bids-due" ? 0 : edited?.duration ?? (link === "buyout" ? BUYOUT_DAYS : 1)}/></label><label className="ui-field">Trade package<select name="packageId" defaultValue={edited?.packageId ?? ""}><option value="">None</option>{edited?.packageId && !procurement.packages.some(item => item.id === edited.packageId) && <option value={edited.packageId}>{edited.packageId}</option>}{procurement.packages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="ui-field">Follows procurement<select name="procurement" value={link} onChange={event => setLink(event.target.value as ProcurementLink | "")}><option value="">No · planned by hand</option><option value="bids-due">Bid due date (milestone)</option><option value="buyout">Buyout progress</option></select><small className="sched-field-note">{link === "buyout" ? "Up to 50% as invited companies bid, 75% once awarded, 100% at the executed subcontract." : link === "bids-due" ? "Sits on the trade's bid due date; reached once it has come and bids are in." : "Dates and progress are entered here."}</small></label>{edited && <label className="ui-field">Progress %<input key={`progress-${link}`} type="number" name="progress" min={0} max={100} step={1} readOnly={!!link} defaultValue={link && edited.procurement === link ? editedPlan!.progress : edited.progress}/>{link && <small className="sched-field-note">{edited.procurement === link && plan.sources[edited.id] ? plan.sources[edited.id].detail : "Worked out from procurement once saved."}</small>}</label>}</div><div className="sched-form-actions">{edited && <Button onClick={() => { if (!confirmRemove) { setConfirmRemove(true); return; } if (apply(current => removeActivity(current, edited.id, ACTOR), "Activity and its links removed.")) { setSelectedId(""); setEditing(null); setConfirmRemove(false); } }}><Trash2 size={14}/>{confirmRemove ? "Confirm removal" : "Remove activity"}</Button>}<span/><Button onClick={() => { setEditing(null); setError(""); }}>Cancel</Button><Button type="submit" variant="primary">Save activity</Button></div></form></Modal>}
  </div>;
}

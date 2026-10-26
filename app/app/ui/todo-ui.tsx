"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Download, RefreshCw } from "lucide-react";
import { useTodo } from "../../lib/use-todo-summary";
import { useSubmissions } from "../../lib/use-submissions";
import { useStructorCheck } from "../../lib/use-structor-check";
import { projectOverview } from "../../lib/project-overview";
import { firstOpenStep, todoSteps, type TodoStep } from "../../lib/todo-steps";
import { deliveryMethodLabel, type Project } from "../../lib/projects";
import { screenLabel } from "../../lib/screens";
import type { TodoGroup, TodoSummary } from "../../lib/todo";
import { Badge, Button, Empty, PageHeader, Panel, Tabs, downloadText, type ViewProps } from "./shared";
import { ProgressRing, TradeProgress } from "./project-health";
import { SetupChecklist } from "./project-setup";
import { DoneTaskCard, TodoTaskCard } from "./todo-cards";
import "./todo-ui.css";

export function TodoSteps({ summary, filter, navigate }: { summary: TodoSummary; filter: string; navigate: ViewProps["navigate"] }) {
  return <div className="todo-steps">{summary.groups.map((group, index) => {
    const tasks = summary.tasks.filter(task => task.group === group.group && (filter === "All work" || task.status === (filter === "Waiting" ? "waiting" : "todo")));
    return <details className="todo-step" key={group.group}>
      <summary><span className="todo-step-number">{index + 1}</span><span className="todo-step-title"><strong>{group.label}</strong><small>{group.todo} team actions · {group.waiting} waiting</small></span><Badge>{tasks.length} shown</Badge></summary>
      <div className="todo-step-body">{tasks.length ? <ul className="todo-work-list">{tasks.map(task => <TodoTaskCard key={task.id} task={task} group={group.label} navigate={navigate}/>)}</ul> : <p>No {filter === "Waiting" ? "waiting tasks" : filter === "All work" ? "open tasks" : "team actions"} in this step.</p>}<Button onClick={() => navigate(group.screen)}>Open {screenLabel(group.screen)}<ArrowRight size={14}/></Button></div>
    </details>;
  })}</div>;
}

const tone = (percent: number | null) => percent === null ? "none" : percent >= 100 ? "done" : percent > 0 ? "going" : "start";

function StepRow({ step, number, expanded, onToggle, children }: { step: TodoStep; number: number; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  const id = `todo-step-${step.group}`;
  return <li className={`todo-row-step is-${tone(step.percent)}`}>
    <button className="todo-row-head" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
      <span className="todo-step-number">{number}</span>
      <span className="todo-row-title"><strong>{step.label}</strong><small>{step.measure}</small></span>
      <span className="todo-row-progress"><span className="todo-row-bar" aria-hidden><i style={{ width: `${step.percent ?? 0}%` }}/></span><b>{step.percent === null ? "—" : `${step.percent}%`}</b></span>
      <span className="todo-row-counts">{step.todo > 0 && <Badge tone="orange">{step.todo} to do</Badge>}{step.waiting > 0 && <Badge tone="blue">{step.waiting} waiting</Badge>}{!step.tasks.length && <Badge tone="green">Clear</Badge>}</span>
      <ChevronDown size={16} className="todo-row-chevron" aria-hidden/>
    </button>
    {expanded && <div className="todo-row-body" id={id}>{children}</div>}
  </li>;
}

/**
 * The Preconstruction to-do (Marcel, 24 Oct): every step shows how far it is, and opening a step lists what is left,
 * each with a link to do it. Project setup is step 1, Project information & documents.
 */
export function TurnoverView({ notify, navigate, projectName, project, onSave }: ViewProps & { project: Project; onSave: (project: Project) => void }) {
  const [filter, setFilter] = useState("My actions"), [scanError, setScanError] = useState("");
  // null until the person opens or closes a step: then the first step with work is open by default.
  const [expanded, setExpanded] = useState<TodoGroup[] | null>(null);
  const { summary, history, scanning, lastScan, scanForCompletion } = useTodo(project);
  const { procurement, submissions } = useSubmissions();
  const { state: check } = useStructorCheck();
  const activity = projectOverview(procurement, submissions, check, project.id).activity.slice(0, 5);
  const steps = todoSteps(summary, summary.setup);
  const open = expanded ?? [firstOpenStep(steps) ?? "setup"];
  const toggle = (group: TodoGroup) => setExpanded(open.includes(group) ? open.filter(g => g !== group) : [...open, group]);
  const teamActions = summary.tasks.filter(t => t.status === "todo").length;
  const waiting = summary.tasks.filter(t => t.status === "waiting").length;
  const groupLabel = (group: string) => summary.groups.find(g => g.group === group)?.label ?? group;
  useEffect(() => {
    if (lastScan) notify(lastScan.completed.length ? `${lastScan.completed.length} tasks completed since the last check.` : `Checked: ${lastScan.open} open tasks, nothing new done.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastScan]);
  async function scan() { setScanError(""); try { await scanForCompletion(); } catch (e) { setScanError(e instanceof Error ? e.message : "Could not scan. Please try again."); } }
  function exportTodo() {
    const lines = steps.map((s, i) => `${i + 1}. ${s.label}: ${s.percent === null ? "—" : `${s.percent}%`} (${s.measure})\n${s.tasks.map(t => `   [${t.status === "todo" ? "ACTION" : "WAITING"}] ${t.title}\n   ${t.detail}\n   Open: ${screenLabel(t.screen)}`).join("\n") || "   Nothing open."}`).join("\n\n");
    downloadText("preconstruction-to-do.txt", `PRECONSTRUCTION TO-DO\n${projectName}\n${summary.progress.done}/${summary.progress.total} milestones (${summary.progress.percent}%)\n\n${lines}\n\nTRADE PROGRESS\n${summary.packages.map(p => `${p.code} ${p.name}: ${p.done}/${p.total} (${p.percent}%)`).join("\n")}\n\nDONE HISTORY\n${history.done.map(t => `${t.title} · ${t.at}`).join("\n")}`);
    notify("Preconstruction to-do list downloaded.");
  }
  const shown = (step: TodoStep) => step.tasks.filter(t => filter === "All work" || t.status === (filter === "Waiting" ? "waiting" : "todo"));

  return <div className="cm-view todo-workspace">
    <PageHeader eyebrow="STEP BY STEP" title={screenLabel("turnover")} description="Where every step stands. Open a step to see what is left; tasks move to Done as you complete them on their pages." actions={<><Button disabled={scanning || !summary.ready} onClick={() => void scan()}><RefreshCw size={16} className={scanning ? "todo-scanning" : ""}/>{scanning ? "Scanning…" : "Scan for task completion"}</Button><Button onClick={exportTodo}><Download size={16}/>Export to-do list</Button></>}/>
    <section className="todo-progress-banner health-workflow-card" aria-label="Project progress"><ProgressRing percent={summary.progress.percent} label="Workflow progress" detail={`${summary.progress.done} of ${summary.progress.total} milestones`} pending={!summary.ready}/><div><span className="health-eyebrow">{deliveryMethodLabel(project.deliveryMethod)} · {project.status} · {project.location}</span><h2>{project.name}</h2><p>{summary.progress.done} of {summary.progress.total} milestones complete · {project.squareFeet.toLocaleString()} SF</p><button onClick={() => navigate("information")}>Project information<ArrowRight size={14}/></button></div><div className="todo-progress-count"><strong>{teamActions}</strong><span>actions for your team</span></div></section>
    <div className="todo-status-summary"><div className="missing"><span>Missing files &amp; details</span><strong>{summary.tasks.filter(t => t.flag?.tone === "red").length}</strong></div><div className="review"><span>Information to check</span><strong>{summary.tasks.filter(t => t.flag?.tone === "yellow").length}</strong></div><div className="waiting"><span>Waiting on others</span><strong>{waiting}</strong></div><div className="done"><span>Completed tasks</span><strong>{history.done.length}</strong></div></div>
    {scanError ? <p className="todo-scan-result error" role="alert">{scanError}</p> : lastScan && <p className="todo-scan-result" role="status"><CheckCircle2 size={16}/>Last checked {new Date(lastScan.at).toLocaleTimeString()} · {lastScan.completed.length} newly completed · {lastScan.open} open tasks</p>}
    <Panel title={filter === "Done" ? "Completed work" : "Your preconstruction steps"} subtitle={filter === "Done" ? "Tasks finished on their pages, newest first." : "Each bar shows how much of that step is done. Missing files and details are marked red, information to check yellow."}>
      <div className="ui-toolbar"><Tabs tabs={["My actions", "Waiting", "All work", "Done"]} value={filter} onChange={setFilter}/></div>
      {filter === "Done" ? history.done.length ? <ul className="todo-work-list">{history.done.map(task => <DoneTaskCard key={`${task.id}-${task.at}`} task={task} group={groupLabel(task.group)}/>)}</ul> : <Empty title="Nothing done yet" description="Finished tasks move here automatically. Scan for task completion checks the project again."/>
        : <ol className="todo-row-steps" aria-busy={!summary.ready}>{steps.map((step, index) => <StepRow key={step.group} step={step} number={index + 1} expanded={open.includes(step.group)} onToggle={() => toggle(step.group)}>
          {step.group === "setup"
            ? <SetupChecklist project={project} setup={summary.setupGuide} filter={filter} onSave={onSave} navigate={navigate} notify={notify}/>
            : <>{shown(step).length ? <ul className="todo-work-list">{shown(step).map(task => <TodoTaskCard key={task.id} task={task} group={step.label} navigate={navigate}/>)}</ul> : <p className="todo-row-empty">{step.tasks.length ? `No ${filter === "Waiting" ? "waiting tasks" : "team actions"} here. Choose All work to see the rest.` : "Nothing open in this step."}</p>}
              <Button onClick={() => navigate(step.screen)}>Open {screenLabel(step.screen)}<ArrowRight size={14}/></Button></>}
        </StepRow>)}</ol>}
    </Panel>
    <div className="health-details-grid todo-row-pulse"><TradeProgress packages={summary.packages} navigate={navigate}/><Panel title="Recent activity" subtitle="Saved scope, submission and issue events."><div className="activity-list">{activity.map(a => <button key={a.id} onClick={() => navigate(a.screen)}><i/><div><strong>{a.title}</strong><p>{a.detail}</p><small>{new Date(a.at).toLocaleString()}</small></div></button>)}</div>{!activity.length && <Empty title="No project activity yet" description="Review a scope, submit a bid or add an issue to see activity here."/>}</Panel></div>
  </div>;
}

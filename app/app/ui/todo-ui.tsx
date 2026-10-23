"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useTodo } from "../../lib/use-todo-summary";
import { useSubmissions } from "../../lib/use-submissions";
import { useStructorCheck } from "../../lib/use-structor-check";
import { projectOverview } from "../../lib/project-overview";
import { screenLabel } from "../../lib/screens";
import type { Project } from "../../lib/projects";
import type { TodoSummary } from "../../lib/todo";
import { Badge, Button, Empty, PageHeader, Panel, Tabs, downloadText, type ViewProps } from "./shared";
import { ProgressRing, TradeProgress } from "./project-health";
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

export function TurnoverView({ notify, navigate, projectName, project }: ViewProps & { project: Project }) {
  const [filter, setFilter] = useState("My actions"), [byTask, setByTask] = useState(false), [scanError, setScanError] = useState("");
  const { summary, history, scanning, lastScan, scanForCompletion } = useTodo(project);
  const { procurement, submissions } = useSubmissions();
  const { state: check } = useStructorCheck();
  const activity = projectOverview(procurement, submissions, check, project.id).activity.slice(0, 5);
  const teamActions = summary.tasks.filter(t => t.status === "todo").length;
  const waiting = summary.tasks.filter(t => t.status === "waiting").length;
  const visible = summary.tasks.filter(t => filter === "All work" || t.status === (filter === "Waiting" ? "waiting" : "todo"));
  const groupLabel = (group: string) => summary.groups.find(g => g.group === group)?.label ?? group;
  useEffect(() => {
    if (lastScan) notify(lastScan.completed.length ? `${lastScan.completed.length} tasks completed since the last check.` : `Checked: ${lastScan.open} open tasks, nothing new done.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastScan]);
  async function scan() { setScanError(""); try { await scanForCompletion(); } catch (e) { setScanError(e instanceof Error ? e.message : "Could not scan. Please try again."); } }
  function exportTodo() {
    const steps = summary.groups.map(g => `${g.label}\n${summary.tasks.filter(t => t.group === g.group).map(t => `[${t.status === "todo" ? "ACTION" : "WAITING"}] ${t.title}\n${t.detail}\nOpen: ${screenLabel(t.screen)}`).join("\n\n") || "No open tasks."}`).join("\n\n");
    downloadText("preconstruction-to-do.txt", `PRECONSTRUCTION TO-DO\n${projectName}\n${summary.progress.done}/${summary.progress.total} milestones (${summary.progress.percent}%)\n\n${steps}\n\nTRADE PROGRESS\n${summary.packages.map(p => `${p.code} ${p.name}: ${p.done}/${p.total} (${p.percent}%)`).join("\n")}\n\nDONE HISTORY\n${history.done.map(t => `${t.title} · ${t.at}`).join("\n")}`);
    notify("Preconstruction to-do list downloaded.");
  }
  return <div className="cm-view todo-workspace">
    <PageHeader eyebrow="STEP BY STEP" title={screenLabel("turnover")} description="Work through each step. Tasks move to Done as you complete them on their pages." actions={<><Button disabled={scanning || !summary.ready} onClick={() => void scan()}><RefreshCw size={16} className={scanning ? "todo-scanning" : ""}/>{scanning ? "Scanning…" : "Scan for task completion"}</Button><Button onClick={exportTodo}><Download size={16}/>Export to-do list</Button></>}/>
    <section className="todo-progress-banner health-workflow-card" aria-label="Preconstruction progress"><ProgressRing percent={summary.progress.percent} label="Workflow progress" detail={`${summary.progress.done} of ${summary.progress.total} milestones`} pending={!summary.ready}/><div><span className="health-eyebrow">{project.status} · {project.location}</span><h2>{project.name}</h2><p>{summary.progress.done} of {summary.progress.total} milestones complete · {project.squareFeet.toLocaleString()} SF</p><button onClick={() => navigate("information")}>Project information<ArrowRight size={14}/></button></div><div className="todo-progress-count"><strong>{teamActions}</strong><span>actions for your team</span></div></section>
    <div className="todo-status-summary"><div className="missing"><span>Missing files &amp; details</span><strong>{summary.tasks.filter(t => t.flag?.tone === "red").length}</strong></div><div className="review"><span>Information to check</span><strong>{summary.tasks.filter(t => t.flag?.tone === "yellow").length}</strong></div><div className="waiting"><span>Waiting on others</span><strong>{waiting}</strong></div><div className="done"><span>Completed tasks</span><strong>{history.done.length}</strong></div></div>
    {scanError ? <p className="todo-scan-result error" role="alert">{scanError}</p> : lastScan && <p className="todo-scan-result" role="status"><CheckCircle2 size={16}/>Last checked {new Date(lastScan.at).toLocaleTimeString()} · {lastScan.completed.length} newly completed · {lastScan.open} open tasks</p>}
    <Panel title={filter === "Done" ? "Completed work" : "Your preconstruction steps"} subtitle="Missing files and details are marked red. Information to check is marked yellow.">
      <div className="ui-toolbar"><Tabs tabs={["My actions", "Waiting", "All work", "Done"]} value={filter} onChange={setFilter}/>{filter !== "Done" && <div className="todo-view-switch" aria-label="Task layout"><button aria-pressed={!byTask} onClick={() => setByTask(false)}>By step</button><button aria-pressed={byTask} onClick={() => setByTask(true)}>By task</button></div>}</div>
      {filter === "Done" ? history.done.length ? <ul className="todo-work-list">{history.done.map(task => <DoneTaskCard key={`${task.id}-${task.at}`} task={task} group={groupLabel(task.group)}/>)}</ul> : <Empty title="Nothing done yet" description="Finished tasks move here automatically. Scan for task completion checks the project again."/> : byTask ? visible.length ? <ul className="todo-work-list">{visible.map(task => <TodoTaskCard key={task.id} task={task} group={groupLabel(task.group)} navigate={navigate}/>)}</ul> : <Empty title="No tasks in this view" description="Choose another filter to see the rest of the work."/> : <TodoSteps summary={summary} filter={filter} navigate={navigate}/>}
    </Panel>
    <details className="todo-pulse"><summary>Project pulse &amp; recent activity</summary><div className="health-details-grid"><TradeProgress packages={summary.packages} navigate={navigate}/><Panel title="Recent activity" subtitle="Saved scope, submission and issue events."><div className="activity-list">{activity.map(a => <button key={a.id} onClick={() => navigate(a.screen)}><i/><div><strong>{a.title}</strong><p>{a.detail}</p><small>{new Date(a.at).toLocaleString()}</small></div></button>)}</div>{!activity.length && <Empty title="No project activity yet" description="Review a scope, submit a bid or add an issue to see activity here."/>}{summary.setup && <div className="todo-readiness"><ProgressRing percent={summary.setup.completeness.percent} label="Project information & files" detail={`${summary.setup.completeness.done} of ${summary.setup.completeness.total} items accounted for`} pending={!summary.ready}/><Button onClick={() => navigate("setup")}>Review project readiness<ArrowRight size={14}/></Button></div>}</Panel></div></details>
  </div>;
}

"use client";

import { useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, CheckCheck, ClipboardCheck, FolderCheck, ListChecks } from "lucide-react";
import type { Project } from "../../lib/projects";
import type { SetupSummary } from "../../lib/project-setup";
import type { TodoSummary } from "../../lib/todo";
import { useTodoSummary } from "../../lib/use-todo-summary";
import { Badge, Button, type Screen } from "./shared";
import "./project-health.css";

type Navigate = (screen: Screen) => void;
type HealthSummary = Pick<TodoSummary, "progress" | "packages" | "groups"> & { setup: SetupSummary | null; ready: boolean };
type Segment = { value: number; tone: string };

export function ProgressRing({ percent, label, detail, segments, pending = false }: { percent: number; label: string; detail: string; segments?: Segment[]; pending?: boolean }) {
  const value = Math.max(0, Math.min(100, percent));
  let offset = 0;
  return <div className="health-ring" role="img" aria-label={pending ? `${label}: checking project records` : `${label}: ${value}%. ${detail}`}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="51" className="health-ring-track"/>
      {!pending && (segments ?? [{ value, tone: "accent" }]).map((segment, i) => {
        const length = Math.max(0, Math.min(100 - offset, segment.value)), start = offset;
        offset += length;
        return length > 0 && <circle key={i} cx="60" cy="60" r="51" pathLength="100" className={`health-ring-arc ${segment.tone}`} transform="rotate(-90 60 60)" strokeDashoffset={-start} strokeDasharray={`${length} ${100 - length}`} style={{ "--ring-dash": `${length} ${100 - length}` } as CSSProperties}/>;
      })}
    </svg>
    <div className="health-ring-number" aria-hidden="true"><strong>{pending ? "—" : value}<small>{!pending && "%"}</small></strong><span>{pending ? "Checking" : "complete"}</span></div>
  </div>;
}

/** The cells are saved workflow milestones, not an invented trend over time. */
export function TradeProgress({ packages, navigate }: { packages: TodoSummary["packages"]; navigate: Navigate }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="health-detail-panel" aria-label="Trade progress">
    <header><div><span className="health-eyebrow">FROM INVITATION TO AWARD</span><h3>Trade progress</h3></div><Badge>{packages.length} trades</Badge></header>
    <p className="health-panel-description">Each segment is a milestone, from bidders invited to executed subcontract.</p>
    {packages.length ? <ul className="health-trade-list">{(expanded ? packages : packages.slice(0, 6)).map(pkg => <li key={pkg.packageId}>
      <button onClick={() => navigate("packages")} aria-label={`${pkg.name}: ${pkg.done} of ${pkg.total} milestones, ${pkg.percent}% complete. Open bid packages.`}>
        <span className="health-trade-title"><span><small>{pkg.code}</small><strong>{pkg.name}</strong></span><b>{pkg.percent}<small>%</small></b></span>
        <span className="health-milestones" aria-hidden="true">{pkg.milestones.map(m => <i key={m.key} className={m.done ? "done" : ""} title={`${m.label}: ${m.done ? "done" : "outstanding"}`}/>)}</span>
        <span className="health-trade-detail"><span>{pkg.done} / {pkg.total} milestones</span><span>{pkg.milestones.find(m => !m.done)?.label ?? "All milestones complete"}<ArrowUpRight size={12}/></span></span>
      </button>
    </li>)}</ul> : <div className="health-empty"><ClipboardCheck size={25}/><strong>Your first trade starts here</strong><p>Confirm trades from your drawings or manual to see their progress.</p><Button onClick={() => navigate("scopes")}>Set up trade packages<ArrowRight size={14}/></Button></div>}
    {packages.length > 6 && <button className="health-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "Show fewer trades" : `View all ${packages.length} trades`}<ArrowRight size={14}/></button>}
  </section>;
}

export function ProjectHealthCharts({ summary, navigate }: { summary: HealthSummary; navigate: Navigate }) {
  const setup = summary.setup?.completeness;
  const open = summary.groups.filter(g => g.todo + g.waiting > 0);
  const maxOpen = Math.max(1, ...open.map(g => g.todo + g.waiting));
  const segments = setup ? [{ value: setup.done, tone: "complete" }, { value: setup.missing, tone: "missing" }, { value: setup.review, tone: "review" }, { value: setup.waiting, tone: "waiting" }].map(s => ({ ...s, value: s.value / (setup.total || 1) * 100 })) : [];
  return <section className="project-health" aria-label="Project health" aria-busy={!summary.ready}>
    <header className="health-heading"><div><span className="health-eyebrow">THE BIG PICTURE</span><h2>Know where your project stands.</h2></div><span className="health-live"><i/>{summary.ready ? "From your project records" : "Checking project records…"}</span></header>
    <div className="health-overview-grid">
      <section className="health-workflow-card" aria-label="Project completion">
        <div className="health-card-heading"><span><ClipboardCheck size={16}/>Project completion</span><span>WORKFLOW</span></div>
        <div className="health-ring-layout"><ProgressRing percent={summary.progress.percent} label="Project completion" detail={`${summary.progress.done} of ${summary.progress.total} workflow milestones`} pending={!summary.ready}/><div><span className="health-big-number">{summary.ready ? summary.progress.done : "—"}<small> / {summary.progress.total}</small></span><h3>Milestones complete</h3><p>{summary.packages.length ? "From the first scope review to the final executed subcontract." : "Project milestones only. Trade milestones appear after you confirm trades."}</p></div></div>
        <div className="health-card-footer"><span><CheckCheck size={15}/>Updates as work gets done</span><button onClick={() => navigate("turnover")}>View project to-do<ArrowRight size={15}/></button></div>
      </section>
      <section className="health-readiness-card" aria-label="Project information and files">
        <div className="health-card-heading"><span><FolderCheck size={16}/>Project information &amp; files</span><span>READINESS</span></div>
        <div className="health-readiness-body"><ProgressRing percent={setup?.percent ?? 0} label="Project information & files" detail={`${setup?.done ?? 0} of ${setup?.total ?? 0} items ready or marked not applicable`} segments={segments} pending={!summary.ready}/><div className="health-readiness-detail"><strong>{setup?.done ?? 0} of {setup?.total ?? 0} items accounted for</strong><p>Ready or marked not applicable. Missing items stay visible.</p><ul className="health-status-key">
          <li><i className="missing"/><span>Missing file or detail</span><b>{setup?.missing ?? 0}</b></li>
          <li><i className="review"/><span>Check information</span><b>{setup?.review ?? 0}</b></li>
          <li><i className="waiting"/><span>Waiting on others</span><b>{setup?.waiting ?? 0}</b></li>
        </ul></div></div>
        <div className="health-readiness-actions"><Button variant="primary" onClick={() => navigate("turnover")}><ListChecks size={15}/>Check to-do list for missing information<ArrowRight size={14}/></Button><button onClick={() => navigate("turnover")}>{summary.setup?.next ? `Next: ${summary.setup.next.title}` : "Review project setup"}<ArrowUpRight size={14}/></button></div>
      </section>
    </div>
    <div className="health-details-grid">
      <TradeProgress packages={summary.packages} navigate={navigate}/>
      <section className="health-detail-panel health-work-areas" aria-label="Open tasks by area"><header><div><span className="health-eyebrow">WHERE TO FOCUS</span><h3>Open tasks by area</h3></div><Badge>{open.reduce((n, g) => n + g.todo + g.waiting, 0)} open</Badge></header><p className="health-panel-description">See what needs your team and what is waiting on someone else.</p>
        {open.length ? <ul>{open.map(group => <li key={group.group}><button onClick={() => navigate(group.screen)}><span className="health-area-label"><strong>{group.label}</strong><b>{group.todo + group.waiting}</b></span><span className="health-area-track" aria-hidden="true"><i style={{ width: `${group.todo / maxOpen * 100}%` }}/><i className="waiting" style={{ width: `${group.waiting / maxOpen * 100}%` }}/></span><span className="health-area-detail">{group.todo} team action{group.todo === 1 ? "" : "s"}<span>{group.waiting} waiting<ArrowUpRight size={12}/></span></span></button></li>)}</ul> : <div className="health-empty"><CheckCheck size={25}/><strong>No open tasks</strong><p>New actions appear here when the project needs attention.</p></div>}
        <div className="health-area-key"><span><i/>Team actions</span><span><i className="waiting"/>Waiting on others</span></div>
      </section>
    </div>
  </section>;
}

export function ProjectHealth({ project, navigate }: { project: Project; navigate: Navigate }) {
  return <ProjectHealthCharts summary={useTodoSummary(project)} navigate={navigate}/>;
}

export function SetupContinueCard({ project, navigate }: { project: Project; navigate: Navigate }) {
  const summary = useTodoSummary(project);
  return <section className="setup-continue-card" aria-label="Continue project setup"><span className="setup-continue-icon"><ClipboardCheck size={22}/></span><div><span className="health-eyebrow">PROJECT SETUP</span><h3>{summary.setup?.next ? "A clear next step." : "Keep your project information current."}</h3><p>{summary.ready ? <>{summary.setup && <strong>{summary.setup.progress.done} / {summary.setup.progress.total} steps ready · </strong>}{summary.setup?.next?.title ?? "Review the files and details behind your project."}</> : "Checking the project's files and information…"}</p></div><Button onClick={() => navigate("turnover")}>Continue project setup<ArrowRight size={15}/></Button></section>;
}

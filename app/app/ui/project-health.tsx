"use client";

import { ArrowRight, ListChecks } from "lucide-react";
import type { Project } from "../../lib/projects";
import { useTodoSummary } from "../../lib/use-todo-summary";
import { Badge, Button, Panel, type Screen } from "./shared";
import "./project-health.css";

/** A percentage ring (SVG), its number in the middle; the label and detail carry the meaning, not the color. */
function Ring({ percent, label, detail }: { percent: number; label: string; detail: string }) {
  const r = 44, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, percent));
  return <figure className="health-ring">
    <svg viewBox="0 0 100 100" role="img" aria-label={`${label}: ${p}%. ${detail}`}>
      <circle cx="50" cy="50" r={r} className="track"/>
      <circle cx="50" cy="50" r={r} className="value" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 50 50)"/>
      <text x="50" y="50" dominantBaseline="central" textAnchor="middle">{p}<tspan dx="1" dy="-8">%</tspan></text>
    </svg>
    <figcaption><strong>{label}</strong><small>{detail}</small></figcaption>
  </figure>;
}

/** Horizontal bars with the value written beside each; hovering a bar names it in full. */
function Bars({ title, empty, rows }: { title: string; empty: string; rows: { key: string; label: string; share: number; value: string; tip: string }[] }) {
  return <section className="health-bars" aria-label={title}>
    <h4>{title}</h4>
    {rows.length ? <ul>{rows.map(row => <li key={row.key} title={row.tip}>
      <span className="label">{row.label}</span>
      <span className="track"><i style={{ width: `${Math.max(row.share, row.share > 0 ? 2 : 0)}%` }}/></span>
      <span className="value">{row.value}</span>
    </li>)}</ul> : <p className="health-empty">{empty}</p>}
  </section>;
}

/**
 * Project health on the Overview (18 Oct, Danial): how far the project is through preconstruction,
 * how much of the information and files a project needs are in place (missing in red, to check in
 * yellow), progress per trade and open work by area, with the way to the to-do list.
 */
export function ProjectHealth({ project, navigate }: { project: Project; navigate: (s: Screen) => void }) {
  const summary = useTodoSummary(project);
  const setup = summary.setup?.completeness;
  const open = summary.groups.filter(g => g.todo + g.waiting > 0);
  const mostOpen = Math.max(1, ...open.map(g => g.todo + g.waiting));
  return <Panel title="Project health" subtitle="Worked out from the project's files, records and workflow; it updates as work is done.">
    <div className="health-grid">
      <div className="health-card">
        <Ring percent={summary.progress.percent} label="Project completion" detail={`${summary.progress.done} of ${summary.progress.total} workflow milestones, from approved scopes to executed subcontracts`}/>
      </div>
      <div className="health-card">
        <Ring percent={setup?.percent ?? 0} label="Project information & files" detail={setup ? `${setup.done} of ${setup.total} items a project usually needs are in place` : "Checking the project's files…"}/>
        {setup && <ul className="health-flags">
          <li><Badge tone="red">Missing</Badge>{setup.missing} missing file{setup.missing === 1 ? "" : "s"} or detail{setup.missing === 1 ? "" : "s"}</li>
          <li><Badge tone="yellow">Check</Badge>{setup.review} to check</li>
          {setup.waiting > 0 && <li><Badge tone="blue">Waiting</Badge>{setup.waiting} waiting on others</li>}
        </ul>}
        <Button variant="primary" onClick={() => navigate("turnover")}><ListChecks size={15}/>Check to-do list for missing information</Button>
        {summary.setup?.next && <button className="panel-bottom-link" onClick={() => navigate("setup")}>Next setup step: {summary.setup.next.title}<ArrowRight size={14}/></button>}
      </div>
      <Bars title="Trade progress" empty="No trade packages yet." rows={summary.packages.map(p => ({ key: p.packageId, label: `${p.code} ${p.name}`, share: p.percent, value: `${p.percent}%`, tip: `${p.name}: ${p.done} of ${p.total} milestones${p.milestones.find(m => !m.done) ? ` · next: ${p.milestones.find(m => !m.done)!.label}` : " · complete"}` }))}/>
      <Bars title="Open tasks by area" empty="No open tasks." rows={open.map(g => ({ key: g.group, label: g.label, share: ((g.todo + g.waiting) / mostOpen) * 100, value: String(g.todo + g.waiting), tip: `${g.label}: ${g.todo} to do${g.waiting ? `, ${g.waiting} waiting` : ""}` }))}/>
    </div>
  </Panel>;
}

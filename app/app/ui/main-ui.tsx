"use client";

// Main UI rebuild (Danial, 26 Nov 2026). Approved mockups: design/main-ui/projects/index.html (main page, "design A")
// and design/main-ui/project-landing/b2.html (each project's landing page, "design B2"). Presentation only: navigation
// comes from lib/screens.ts unchanged, and every number comes from the same hooks the Overview and to-do screens use.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUp, CalendarDays, ChevronDown, Flag, Inbox, ListChecks, MapPin, Plus, Ruler, Search, Sparkles, Trash2, Users, Wallet } from "lucide-react";
import { SCREEN_GROUPS, type Screen, type ScreenDef } from "../../lib/screens";
import { PROJECT_TABS, filterProjects, type Project } from "../../lib/projects";
import { projectOverview } from "../../lib/project-overview";
import { useSubmissions } from "../../lib/use-submissions";
import { useStructorCheck } from "../../lib/use-structor-check";
import { budgetTotals } from "../../lib/budget";
import { useBudget } from "../../lib/use-budget";
import { useCommitments } from "../../lib/use-commitments";
import { useTodoSummary } from "../../lib/use-todo-summary";
import { displayDate } from "../../lib/format";
import { openAsk } from "./open-ask";
import "./main-ui.css";

type IconRenderer = (props: { name: string; size: number; id?: Screen }) => ReactNode;

/** $33,328,991 → "$33.3M"; presentation only. */
export const compactUsd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
const daysUntil = (iso: string) => { if (!iso) return null; const d = new Date(`${iso}T12:00:00`); return Number.isNaN(+d) ? null : Math.round((+d - Date.now()) / 864e5); };
const whenLabel = (iso: string) => { const n = daysUntil(iso); return n === null ? "No date yet" : n === 0 ? "Today" : n > 0 ? `In ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} ago`; };

// ---------- Ask: "Hey, need help?" + a real text box that opens Ask Structor with the question ----------
export function AskHero({ variant, placeholder = "Just ask me anything", label }: { variant: "centred" | "pill"; placeholder?: string; label: string }) {
  const [q, setQ] = useState("");
  function submit(e: FormEvent) { e.preventDefault(); openAsk(q.trim()); setQ(""); }
  return <form className={`mu-ask mu-ask-${variant}`} onSubmit={submit} role="search">
    <p className="mu-ask-hello">Hey, need help? <span className="mu-orb" aria-hidden="true"/></p>
    <div className="mu-ask-row">
      <label className="mu-sr" htmlFor={`mu-ask-${variant}`}>{label}</label>
      <input id={`mu-ask-${variant}`} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} autoComplete="off"/>
      {variant === "pill" && <button type="submit" className="mu-send" aria-label="Ask Structor"><ArrowUp size={16}/></button>}
    </div>
  </form>;
}

// ---------- Readiness gauge (tick arc, as in both mockups) ----------
export function Gauge({ percent, label }: { percent: number; label?: string }) {
  const n = 48, cx = 100, cy = 98, r1 = 86, r2 = 72, ticks = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.12 - i * 1.24 / (n - 1)), long = i % 6 === 0, rr = long ? r2 - 6 : r2, on = i / (n - 1) <= percent / 100;
    ticks.push(<line key={i} x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)} x2={cx + rr * Math.cos(a)} y2={cy - rr * Math.sin(a)} className={on ? "on" : ""} strokeWidth={long ? 2.4 : 1.6} strokeLinecap="round"/>);
  }
  return <div className="mu-gauge" role="img" aria-label={`${label ?? "Readiness"}: ${percent}%`}>
    <svg viewBox="0 0 200 134" aria-hidden="true">{ticks}<path d="M100 2 l5 12 h-10 z" className="needle"/></svg>
    <strong>{percent}%</strong>
  </div>;
}

// ---------- Navigation: A's icon rail (main page) and B2's pill bar (project pages). Groups and order: lib/screens.ts ----------
const GROUP_ICON: Record<string, string> = { WORKSPACE: "LayoutDashboard", PRECONSTRUCTION: "ClipboardCheck", "CONTRACTS & PROCUREMENT": "FileCheck2", OPERATIONS: "CalendarDays" };
const groupTitle = (label: string) => label.charAt(0) + label.slice(1).toLowerCase().replace("& procurement", "& procurement");

export function GroupNav({ variant, screen, navigate, icon: Icon, projectName }: { variant: "rail" | "pills"; screen: Screen; navigate: (s: Screen) => void; icon: IconRenderer; projectName: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); (root.current?.querySelector(`[data-group="${open}"]`) as HTMLElement | null)?.focus(); } };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go = (s: Screen) => { setOpen(null); navigate(s); };
  const groups = variant === "pills" ? [...SCREEN_GROUPS.filter(g => g.scope === "project"), ...SCREEN_GROUPS.filter(g => g.scope === "global")] : SCREEN_GROUPS;
  const current = (items: ScreenDef[]) => items.some(i => i.id === screen);
  return <nav ref={root} className={`mu-nav mu-nav-${variant}`} aria-label="Main">
    {variant === "rail"
      ? <button className={`mu-circle${screen === "projects" ? " is-active" : ""}`} aria-label="All projects" aria-current={screen === "projects" ? "page" : undefined} onClick={() => go("projects")}><Icon name="FolderOpen" size={18}/></button>
      : <>
          <button className={`mu-pill${screen === "turnover" ? " is-on" : ""}`} aria-current={screen === "turnover" ? "page" : undefined} onClick={() => go("turnover")}><Icon name="Building2" size={15}/>Home</button>
        </>}
    {groups.map(g => {
      const isOpen = open === g.label, project = g.scope === "project";
      return <div className="mu-nav-item" key={g.label}>
        <button data-group={g.label} className={variant === "rail" ? `mu-circle${current(g.items) ? " is-current" : ""}` : `mu-pill${current(g.items) ? " is-on" : ""}`}
          aria-haspopup="true" aria-expanded={isOpen} aria-label={variant === "rail" ? groupTitle(g.label) : undefined} onClick={() => setOpen(isOpen ? null : g.label)}>
          <Icon name={GROUP_ICON[g.label] ?? "Box"} size={variant === "rail" ? 18 : 15}/>{variant === "pills" && <>{groupTitle(g.label)}<ChevronDown size={13}/></>}
        </button>
        {isOpen && <div className="mu-menu" role="menu">
          <h4>{g.label}{project && projectName ? ` · ${projectName.toUpperCase()}` : ""}</h4>
          {g.items.map((item, i) => <div key={item.id}>
            {item.section && item.section !== g.items[i - 1]?.section && <h5>{item.section}</h5>}
            <button role="menuitem" className={item.id === screen ? "is-current" : ""} onClick={() => go(item.id)}><Icon id={item.id} name={item.icon} size={15}/>{item.label}</button>
          </div>)}
        </div>}
      </div>;
    })}
  </nav>;
}

// ---------- Main page (design A): pick a project ----------
export function MainHome({ projects, active, onOpen, onNew, onDemo, onDelete, canDelete, navigate }: {
  projects: Project[]; active: Project | null; onOpen: (p: Project) => void; onNew: () => void; onDemo: () => void; onDelete: (p: Project) => void; canDelete: (p: Project) => boolean; navigate: (s: Screen) => void;
}) {
  const [q, setQ] = useState(""); const [tab, setTab] = useState(PROJECT_TABS[0]); const [searching, setSearching] = useState(false);
  const shown = filterProjects(projects, q, tab);
  const total = projects.reduce((s, p) => s + (p.value || 0), 0), area = projects.reduce((s, p) => s + (p.squareFeet || 0), 0);
  const dated = projects.filter(p => p.due).sort((a, b) => a.due.localeCompare(b.due));
  return <div className="mu-main">
    <div className="mu-hero"><AskHero variant="centred" label="Ask Structor about any project"/></div>
    <div className="mu-pills" role="toolbar" aria-label="Find a project">
      {searching && <label className="mu-pill mu-search"><span className="mu-sr">Search projects</span><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects…"/></label>}
      <button className="mu-circle" aria-label="Search projects" aria-expanded={searching} onClick={() => { setSearching(v => !v); if (searching) setQ(""); }}><Search size={17}/></button>
      {PROJECT_TABS.map(t => <button key={t} className={`mu-pill${tab === t ? " is-on" : ""}`} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      <button className="mu-pill" onClick={onDemo}><Sparkles size={15}/>Demo project</button>
      <button className="mu-pill is-primary" onClick={onNew}><Plus size={15}/>New project</button>
    </div>
    <div className="mu-grid">
      <div className="mu-left">
        <div className="mu-projects">
          {shown.map(p => <div className="mu-project-wrap" key={p.id}>
            <button className="mu-card mu-project" onClick={() => onOpen(p)}>
              <span className="mu-card-head"><span className={`mu-tile${p.id === active?.id ? " is-orange" : ""}`}><Wallet size={16}/></span><span className="mu-card-title">{p.name}</span><span className={`mu-status s-${p.status.toLowerCase().replace(/\s+/g, "-")}`}>{p.status}</span></span>
              <span className="mu-project-body"><span><span className="mu-stat">{compactUsd(p.value)}</span><span className="mu-stat-label">Planning value · {p.type}</span></span><span className="mu-thumb" aria-hidden="true"/></span>
              <span className="mu-meta"><span><MapPin size={12}/>{p.location || "No location"}</span><span><Ruler size={12}/>{p.squareFeet ? `${p.squareFeet.toLocaleString()} sq ft` : "Area not set"}</span><span><CalendarDays size={12}/>{p.due ? `Bids ${displayDate(p.due)}` : "No bid date"}</span></span>
            </button>
            {canDelete(p) && <button className="mu-delete" aria-label={`Delete ${p.name}`} title="Delete project" onClick={() => onDelete(p)}><Trash2 size={14}/></button>}
          </div>)}
          {!projects.length && <button className="mu-card mu-new" onClick={onNew}><Plus size={22}/><strong>Your first project</strong><small>Bring the whole team and workflow together.</small></button>}
          {!!projects.length && !shown.length && <p className="mu-empty">No projects match. Try another stage or name.</p>}
        </div>
        <div className="mu-row2">
          <section className="mu-card mu-wide"><h3>Portfolio planning value</h3>
            <div className="mu-wide-mid"><strong>{compactUsd(total)}</strong><span>Across {projects.length} project{projects.length === 1 ? "" : "s"}</span><small>{area.toLocaleString()} sq ft in total</small></div>
            <div className="mu-split" aria-hidden="true">{projects.filter(p => p.value).map((p, i) => <i key={p.id} className={`c${i % 3}`} style={{ flexGrow: p.value }}/>)}</div>
            <div className="mu-split-legend">{projects.filter(p => p.value).map((p, i) => <span key={p.id}><i className={`c${i % 3}`}/>{p.name} · {compactUsd(p.value)}</span>)}</div>
          </section>
          <section className="mu-card mu-wide"><h3>Bid days</h3>
            <div className="mu-wide-mid"><strong>{dated.length}</strong><span>Projects with a bid date</span><small>{dated[0] ? `Earliest: ${dated[0].name}, ${displayDate(dated[0].due)}` : "Add a bid date in Project information"}</small></div>
            <ul className="mu-list">{dated.slice(0, 3).map(p => <li key={p.id}><span className="mu-dot"/>{p.name}<small>{displayDate(p.due)} · {whenLabel(p.due)}</small></li>)}</ul>
          </section>
        </div>
      </div>
      {active && <ContinueCard project={active} onOpen={() => onOpen(active)}/>}
    </div>
    <div className="mu-more">
      <button className="mu-card" onClick={() => navigate("bidders")}><span className="mu-card-head"><span className="mu-tile"><Users size={16}/></span><span className="mu-card-title">Subcontractor directory</span><ArrowRight size={15}/></span><small>Every company you invite, by trade</small></button>
      <button className="mu-card" onClick={() => navigate("workload")}><span className="mu-card-head"><span className="mu-tile"><CalendarDays size={16}/></span><span className="mu-card-title">Estimator workload</span><ArrowRight size={15}/></span><small>Who is free, who is over capacity</small></button>
      <button className="mu-card" onClick={() => navigate("memory")}><span className="mu-card-head"><span className="mu-tile"><Sparkles size={16}/></span><span className="mu-card-title">AI memory</span><ArrowRight size={15}/></span><small>What Structor has learned about how you work</small></button>
    </div>
  </div>;
}

function ContinueCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const todo = useTodoSummary(project);
  const open = todo.tasks.length;
  return <section className="mu-card mu-tall">
    <p className="mu-tall-label">Continue where you left off</p>
    <Gauge percent={todo.ready ? todo.progress.percent : 0} label={`${project.name} readiness`}/>
    <h3>{project.name}</h3>
    <p className="mu-tall-sub">{project.type} · {todo.ready ? `${open} open task${open === 1 ? "" : "s"}` : "Loading progress…"}</p>
    <button className="mu-pill is-primary" onClick={onOpen}>Open project<ArrowRight size={15}/></button>
  </section>;
}

// ---------- Project landing (design B2): what a project opens on ----------
export function ProjectHome({ project, navigate }: { project: Project; navigate: (s: Screen) => void }) {
  const { procurement, submissions } = useSubmissions();
  const { state: check } = useStructorCheck();
  const info = projectOverview(procurement, submissions, check, project.id);
  const { state: budgetState } = useBudget();
  const { budget } = useCommitments(budgetState, procurement);
  const costs = budgetTotals(budget);
  const todo = useTodoSummary(project);
  const invited = info.packages.reduce((s, p) => s + p.invited, 0);
  const diff = costs.budget ? costs.budget - project.value : 0;
  const boughtOut = costs.budget > 0 ? Math.round((costs.committed / costs.budget) * 100) : null;
  const moves = [
    { title: "Compare incoming bids", detail: `${info.bidCount} submitted across ${info.packageCount} packages`, screen: "leveling" as const },
    { title: "Review scope drafts", detail: `${info.drafts} waiting for approval`, screen: "scopes" as const },
    { title: "Review document issues", detail: `${info.issueCount} open · ${info.highIssues} high priority`, screen: "checks" as const },
  ];
  return <div className="mu-home">
    <div className="mu-home-grid">
      <div className="mu-home-left">
        <div className="mu-title"><small>{project.status} · {project.type}</small><h1>{project.name}</h1></div>
        <AskHero variant="pill" label={`Ask Structor about ${project.name}`}/>
        <section className="mu-card mu-gauge-card"><div className="mu-card-head"><span className="mu-card-title">Readiness</span><button className="mu-link" onClick={() => navigate("turnover")}>To-do below</button></div>
          <Gauge percent={todo.ready ? todo.progress.percent : 0}/>
          <p className="mu-center-sub">{todo.ready ? `${todo.progress.done} of ${todo.progress.total} milestones done · ${todo.tasks.length} open tasks` : "Loading progress…"}</p>
        </section>
        <div className="mu-two">
          <section className="mu-card mu-mini"><span className="mu-card-title">Bid deadline</span><strong>{project.due ? displayDate(project.due) : "—"}</strong><small><Flag size={12}/>{project.due ? whenLabel(project.due) : "Set it in Project information"}{project.rfi ? ` · RFIs ${displayDate(project.rfi)}` : ""}</small></section>
          <section className="mu-card mu-mini"><span className="mu-card-title">Bids received</span><strong>{info.bidCount}<em> / {invited}</em></strong><small><Inbox size={12}/>Submitted of invited</small></section>
        </div>
        <section className="mu-card"><div className="mu-card-head"><span className="mu-card-title">Budget vs planning value</span><button className="mu-link" onClick={() => navigate("budget")}>Budget summary</button></div>
          <div className="mu-budget"><strong>{costs.budget ? compactUsd(costs.budget) : "—"}</strong><span>{!costs.budget ? `Planning value ${compactUsd(project.value)} · no budget lines yet` : Math.abs(diff) < 5e4 ? `In line with planning value ${compactUsd(project.value)}` : `${diff < 0 ? "−" : "+"}${compactUsd(Math.abs(diff))} ${diff < 0 ? "under" : "over"} planning value ${compactUsd(project.value)}`}</span></div>
          <div className="mu-bar"><i style={{ width: `${Math.min(100, project.value ? (costs.budget / project.value) * 100 : 0)}%` }}/></div>
          <div className="mu-foot"><span><small>Bought out</small><b>{boughtOut === null ? "—" : `${boughtOut}%`}</b></span><span><small>Committed</small><b>{compactUsd(costs.committed)}</b></span></div>
        </section>
      </div>
      <div className="mu-home-right">
        <section className="mu-window" aria-label="Project image">
          <div className="mu-window-title"><h2>{project.name}<br/>Preconstruction overview</h2><small>{[project.squareFeet ? `${project.squareFeet.toLocaleString()} sq ft` : "", project.location].filter(Boolean).join(" · ")}</small></div>
          <div className="mu-window-chips">
            <span className="mu-pill"><CalendarDays size={14}/>{project.due ? `Bids due ${displayDate(project.due)}` : "No bid date"}</span>
            <span className="mu-pill"><Wallet size={14}/>{compactUsd(project.value)} planning</span>
            <button className="mu-pill is-primary" onClick={() => navigate("packages")}><Plus size={14}/>Invite bidders</button>
          </div>
        </section>
        <section className="mu-card mu-table-card">
          <h3>Trade packages <span>/ {info.packageCount} packages · {info.published} of {info.packageCount} bid forms published</span></h3>
          {info.packages.length ? <div className="mu-table-wrap"><table>
            <thead><tr><th>Trade</th><th>Estimator</th><th>Scope items</th><th>Bids / invited</th><th>Bid form</th><th/></tr></thead>
            <tbody>{[...info.packages].sort((a, b) => b.bids - a.bids || b.invited - a.invited).slice(0, 6).map(p => <tr key={p.id}>
              <td><span className="mu-tile sm"><ListChecks size={13}/></span>{p.code} · {p.name}</td><td>{p.owner || "Unassigned"}</td><td>{p.requirements}</td><td>{p.bids} / {p.invited}</td>
              <td><span className={`mu-status ${p.status === "published" ? "s-ok" : "s-warn"}`}>{p.status}</span></td>
              <td><button className="mu-pill sm" onClick={() => navigate(p.bids ? "leveling" : "packages")}>{p.bids ? "Level" : "Open"}</button></td>
            </tr>)}</tbody>
          </table>{info.packages.length > 6 && <button className="mu-link mu-table-more" onClick={() => navigate("packages")}>View all {info.packages.length} packages<ArrowRight size={13}/></button>}</div> : <p className="mu-empty">No trade packages yet. They appear here as soon as scopes are grouped into packages.</p>}
        </section>
      </div>
    </div>
    <div className="mu-more">
      <section className="mu-card"><div className="mu-card-head"><span className="mu-tile"><Sparkles size={16}/></span><span className="mu-card-title">Your next moves</span></div>
        <ul className="mu-list">{moves.map(m => <li key={m.screen}><button onClick={() => navigate(m.screen)}><span className="mu-dot"/>{m.title}<small>{m.detail}</small></button></li>)}</ul></section>
      <section className="mu-card"><div className="mu-card-head"><span className="mu-tile"><Flag size={16}/></span><span className="mu-card-title">Recent activity</span><span className="mu-meta-right">{info.issueCount} open issues</span></div>
        <ul className="mu-list">{info.activity.slice(0, 3).map(a => <li key={a.id}><button onClick={() => navigate(a.screen)}><span className="mu-dot is-amber"/>{a.title}<small>{a.detail}</small></button></li>)}{!info.activity.length && <li><span className="mu-dot is-dim"/>No activity yet</li>}</ul></section>
      <section className="mu-card"><div className="mu-card-head"><span className="mu-tile"><Users size={16}/></span><span className="mu-card-title">Project team</span></div>
        <div className="mu-team">{project.team.map(m => <span key={m.name}><i>{m.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2)}</i>{m.name}<small>{m.role}</small></span>)}{!project.team.length && <small>No team members yet</small>}</div></section>
    </div>
  </div>;
}

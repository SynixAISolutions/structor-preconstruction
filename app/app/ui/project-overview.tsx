"use client";

import { ArrowRight, ArrowUpRight, FileText, Plus, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { projectOverview } from "../../lib/project-overview";
import { useSubmissions } from "../../lib/use-submissions";
import { useStructorCheck } from "../../lib/use-structor-check";
import { displayDate } from "../../lib/format";
import { type Project } from "../../lib/projects";
import { SAMPLE_PROJECT_ID } from "../../lib/project-scope";
import { Badge, Button, Empty, PageHeader, Panel, PreviewNote, Stats, type Screen, usd } from "./shared";
import { ProjectHealth } from "./project-health";

export function ProjectOverview({ project, navigate, onNew, cover }: { project: Project; navigate: (s: Screen) => void; onNew: () => void; cover: ReactNode }) {
  const { procurement, submissions } = useSubmissions();
  const { state: check } = useStructorCheck();
  const info = projectOverview(procurement, submissions, check, project.id);
  const actions = [
    { title: "Review scope drafts", detail: `${info.drafts} requirements waiting for approval`, screen: "scopes" as const },
    { title: "Review document issues", detail: `${info.issueCount} open issues · ${info.highIssues} high priority`, screen: "checks" as const },
    { title: "Compare incoming bids", detail: `${info.bidCount} submitted bids across ${info.packageCount} trade packages`, screen: "leveling" as const },
  ];
  return <><PageHeader eyebrow="YOUR PROJECT, IN FOCUS" title="Overview" description="Progress and next actions from this project's saved workflow." actions={<><Button onClick={() => navigate("documents")}><Upload size={15}/>Project files</Button><Button variant="primary" onClick={onNew}><Plus size={15}/>New project</Button></>}/>
    <PreviewNote>{project.id === SAMPLE_PROJECT_ID ? "Demonstration project · Sample inputs power the working features. " : "Project workflow · "}Counts update from this browser's project records.</PreviewNote>
    <div className="overview-hero"><div className="hero-copy"><div className="hero-meta"><Badge tone="green">{project.status}</Badge></div><h2>{project.name}</h2><p>{project.location} · {project.type}</p><div className="hero-numbers"><div><small>PLANNING VALUE</small><strong>{usd(project.value)}</strong></div><div><small>BID DEADLINE</small><strong style={{fontSize:22}}>{displayDate(project.due)}</strong></div><div><small>PROJECT TEAM</small><strong>{project.team.length}</strong></div></div><Button variant="dark" onClick={() => navigate("information")}>View project information<ArrowUpRight size={15}/></Button></div><div className="hero-visual">{cover}</div></div>
    <Stats items={[{label:"Scope requirements",value:info.scopeCount,detail:`${info.drafts} waiting for approval`},{label:"Submitted bids",value:info.bidCount,detail:"Submitted companies, not draft proposals"},{label:"Open document issues",value:info.issueCount,detail:`${info.highIssues} high priority`,tone:info.issueCount?"amber":"green"},{label:"Published bid forms",value:`${info.published} / ${info.packageCount}`,detail:"Current published forms across trade packages"}]}/>
    <ProjectHealth project={project} navigate={navigate}/>
    <div className="overview-middle"><Panel title="Your next moves" subtitle="Open a working page to make the next decision."><div className="next-moves">{actions.map(a => <button key={a.screen} onClick={() => navigate(a.screen)}><span className="move-icon"><FileText size={18}/></span><div><strong>{a.title}</strong><small>{a.detail}</small></div><ArrowUpRight size={17}/></button>)}</div><button className="panel-bottom-link" onClick={() => navigate("turnover")}>View preconstruction to-do<ArrowRight size={15}/></button></Panel><Panel title="Project activity" subtitle="Recent saved scope, submission and issue events."><div className="activity-list">{info.activity.map(a => <button key={a.id} onClick={() => navigate(a.screen)}><i/><div><strong>{a.title}</strong><p>{a.detail}</p><small>{new Date(a.at).toLocaleString()}</small></div></button>)}</div>{!info.activity.length && <Empty title="No project activity yet" description="Review a scope, submit a bid or add an issue to see activity here."/>}</Panel></div>
    <Panel title="Trade package pulse" subtitle="Counts and status from each package." action={<Button onClick={() => navigate("packages")}>Bid packages<ArrowRight size={14}/></Button>}><div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Trade</th><th>Estimator</th><th>Scope items</th><th>Bids / invited</th><th>Bid form</th></tr></thead><tbody>{info.packages.map(p => <tr key={p.id}><th scope="row"><button className="table-nav" onClick={() => navigate("packages")}>{p.code} · {p.name}</button></th><td>{p.owner || "Unassigned"}</td><td>{p.requirements}</td><td>{p.bids} / {p.invited}</td><td><Badge tone={p.status==="published"?"green":"amber"}>{p.status}</Badge></td></tr>)}</tbody></table></div>{!info.packages.length && <Empty title="No trade packages yet" description="Your project starts empty. Its saved packages will appear here."/>}</Panel>
  </>;
}

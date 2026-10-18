"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Building2, Check, CheckCircle2, Clock3, Download, Pencil, Plus, RefreshCw, Star, UserCheck } from "lucide-react";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, PreviewNote, SearchBox, Stats, Tabs, downloadText, exportRows, type Screen, type ViewProps } from "./shared";
import "./commercial.css";
import { useLocalDraft } from "../../lib/use-local-draft";
import { screenLabel } from "../../lib/screens";
import { trades, initialBidders, type Bidder } from "../../lib/data/commercial";
import type { Project } from "../../lib/projects";
import { ProcurementPackagesView } from "./procurement";
import { SubmissionPortalView } from "./submission-ui";
import { ScheduleView } from "./schedule-ui";
import { useTodo } from "../../lib/use-todo-summary";
import { ProgressRing } from "./project-health";
import { DoneTaskCard, TodoTaskCard } from "./todo-cards";
import { AllowancesView, BudgetView } from "./budget-ui";
import { AwardView } from "./award-ui";
import { ValueEngineeringView } from "./value-engineering-ui";

// Local drafts make every preview screen useful without an account or external service.
function statusTone(status: string) { return /approved|qualified|complete|submitted/i.test(status) ? "green" : /review|provisional|draft|invited/i.test(status) ? "amber" : "blue"; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="ui-field"><span>{label}</span>{children}</label>; }
function RowActions({ children }: { children: ReactNode }) { return <div className="cm-row-actions">{children}</div>; }
function formValues(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }
function SaveFooter({ onCancel, label = "Save changes" }: { onCancel: () => void; label?: string }) { return <div className="cm-form-footer"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{label}</Button></div>; }

function BiddersView({ notify, navigate }: ViewProps) {
  const [bidders,setBidders]=useLocalDraft("directory",initialBidders); const [query,setQuery]=useState(""); const [trade,setTrade]=useState("All trades"); const [edit,setEdit]=useState<Bidder|"new"|null>(null);
  const shown=bidders.filter(b=>`${b.company} ${b.name} ${b.location}`.toLowerCase().includes(query.toLowerCase()) && (trade==="All trades"||b.trade===trade));
  return <div className="cm-view"><PageHeader eyebrow="PARTNER NETWORK" title={screenLabel("bidders")} description="Build a dependable network across every trade." actions={<Button variant="primary" onClick={()=>setEdit("new")}><Plus size={16}/>Add bidder</Button>}/><PreviewNote>Sample contacts · Directory changes are saved locally.</PreviewNote><Stats items={[{label:"Trade partners",value:bidders.length,detail:"In your company directory"},{label:"Qualified",value:bidders.filter(b=>b.status==="Qualified").length,detail:"Ready for invitation"},{label:"Trades covered",value:new Set(bidders.map(b=>b.trade)).size,detail:"Across your network"},{label:"Awaiting review",value:bidders.filter(b=>b.status==="Review required").length,detail:"Company information to verify"}]}/><Panel><div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search company, contact, or location…"/><select className="cm-select" aria-label="Filter bidders by trade" value={trade} onChange={e=>setTrade(e.target.value)}>{["All trades",...new Set([...trades,...bidders.map(b=>b.trade)])].map(t=><option key={t}>{t}</option>)}</select><ExportButton onClick={()=>exportRows("bidder-directory.csv",[["Company","Contact","Email","Trade","Location","Status"],...shown.map(b=>[b.company,b.name,b.email,b.trade,b.location,b.status])])}/></div><div className="cm-bidder-grid">{shown.map(b=><article className="cm-bidder-card" key={b.id}><div className="cm-bidder-top"><span className="cm-company-icon"><Building2 size={22}/></span><Badge tone={statusTone(b.status)}>{b.status}</Badge></div><h3>{b.company}</h3><p>{b.trade} <span>·</span> {b.location}</p><div className="cm-contact"><span className="cm-avatar">{b.name.split(" ").map(n=>n[0]).join("")}</span><div><strong>{b.name}</strong><small>{b.email}</small></div></div><div className="cm-card-foot"><Button onClick={()=>setEdit(b)}><Pencil size={14}/>Edit profile</Button><button className="cm-text-button" onClick={()=>navigate("packages")}>Bid packages<ArrowRight size={14}/></button></div></article>)}</div>{!shown.length&&<Empty title="No trade partners found" description="Adjust your search or add a new company." action={<Button onClick={()=>setEdit("new")}>Add bidder</Button>}/>}</Panel>{edit&&<Modal title={edit==="new"?"Add trade partner":"Edit company profile"} onClose={()=>setEdit(null)}><form onSubmit={e=>{const f=formValues(e);const next:Bidder={id:edit==="new"?crypto.randomUUID():edit.id,company:String(f.get("company")).trim(),name:String(f.get("name")).trim(),email:String(f.get("email")).trim(),trade:String(f.get("trade")),location:String(f.get("location")).trim(),status:String(f.get("status"))};setBidders(prev=>edit==="new"?[...prev,next]:prev.map(b=>b.id===edit.id?next:b));setEdit(null);notify("Trade partner saved.");}}><div className="ui-form-grid">{([['company','Company name'],['name','Contact name'],['email','Email address'],['location','Location']] as const).map(([key,label])=><Field label={label} key={key}><input required name={key} type={key==="email"?"email":"text"} defaultValue={edit==="new"?"":edit[key]}/></Field>)}<Field label="Primary trade"><select name="trade" defaultValue={edit==="new"?trades[0]:edit.trade}>{trades.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Qualification status"><select name="status" defaultValue={edit==="new"?"Review required":edit.status}>{["Qualified","Review required","Invited"].map(s=><option key={s}>{s}</option>)}</select></Field></div><SaveFooter onCancel={()=>setEdit(null)} label="Save trade partner"/></form></Modal>}</div>;
}



const ratingCriteria = ["Change-order performance", "Bid responsiveness", "Professionalism", "On-site performance"];

function RatingsView({ navigate }: ViewProps) {
  return <div className="cm-view"><PageHeader eyebrow="PARTNER NETWORK" title={screenLabel("ratings")} description="Build a consistent record of subcontractor performance across projects." actions={<Button onClick={() => navigate("bidders")}>Open directory<ArrowRight size={15}/></Button>}/><PreviewNote>Placeholder · Rating criteria and scoring rules still need Marcel’s approval.</PreviewNote><Panel title="Rating framework" subtitle="The first review will agree the criteria, scale, and who can submit a rating."><div className="cm-placeholder-grid">{ratingCriteria.map(item => <article key={item}><span><Star size={18}/></span><strong>{item}</strong><p>Score and written evidence will appear here once the rating framework is agreed.</p></article>)}</div></Panel><Panel><Empty title="No ratings recorded" description="Ratings will show the score, project context, review count, and supporting notes for each subcontractor." action={<Button onClick={() => navigate("bidders")}>Review subcontractor directory</Button>}/></Panel></div>;
}

function PrequalificationView({ navigate }: ViewProps) {
  return <div className="cm-view"><PageHeader eyebrow="PARTNER NETWORK" title={screenLabel("prequalification")} description="Track which invited subcontractors are cleared to bid and what remains outstanding." actions={<Button onClick={() => navigate("packages")}>Open bid packages<ArrowRight size={15}/></Button>}/><PreviewNote>Placeholder · The questionnaire and required-document list have not been supplied yet.</PreviewNote><Panel title="Planned qualification workflow" subtitle="One status from invitation through approval."><div className="cm-placeholder-grid">{[["1","Questionnaire","Company details and project-specific questions"],["2","Documents","Licences, insurance, safety and financial files"],["3","Review","Outstanding items and reviewer decisions"],["4","Bid eligibility","Clear status beside every invited company"]].map(([step,title,detail]) => <article key={step}><span><UserCheck size={18}/></span><strong>{step}. {title}</strong><p>{detail}</p></article>)}</div></Panel><Panel><Empty title="Prequalification setup is waiting" description="Once the real questionnaire is provided, this screen will track submissions, missing documents, reviewer notes, and approval status." action={<Button onClick={() => navigate("bidders")}>Open subcontractor directory</Button>}/></Panel></div>;
}

function TurnoverView({ notify, navigate, projectName, project }: ViewProps & { project: Project }) {
  const [filter, setFilter] = useState("My actions");
  const [scanError, setScanError] = useState("");
  const { summary, history, scanning, lastScan, scanForCompletion } = useTodo(project);
  useEffect(() => {
    if (!lastScan) return;
    notify(lastScan.completed.length ? `${lastScan.completed.length} task${lastScan.completed.length === 1 ? "" : "s"} done since the last check: ${lastScan.completed.slice(0, 3).map(d => d.title).join("; ")}${lastScan.completed.length > 3 ? "…" : ""}` : `Checked: ${lastScan.open} open task${lastScan.open === 1 ? "" : "s"}, nothing new done.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastScan]);
  const teamActions = summary.tasks.filter(task => task.status === "todo").length;
  const waiting = summary.tasks.filter(task => task.status === "waiting").length;
  const visible = summary.tasks.filter(task => filter === "All work" || (filter === "My actions" ? task.status === "todo" : task.status === "waiting"));
  const groupLabel = (group: string) => summary.groups.find(item => item.group === group)?.label ?? group;
  const missing = summary.tasks.filter(task => task.flag?.tone === "red").length;
  const review = summary.tasks.filter(task => task.flag?.tone === "yellow").length;
  async function scan() {
    setScanError("");
    try { await scanForCompletion(); }
    catch (error) { setScanError(error instanceof Error ? error.message : "The scan could not finish. Try again."); }
  }

  function exportTodo() {
    const tasks = summary.tasks.length ? summary.tasks.map(task => `[${task.status === "todo" ? "ACTION" : "WAITING"}] ${task.title}\n${task.detail}\nOpen: ${screenLabel(task.screen)}`).join("\n\n") : "No open tasks.";
    const packages = summary.packages.map(pkg => `${pkg.code} ${pkg.name}: ${pkg.done}/${pkg.total} milestones (${pkg.percent}%)`).join("\n");
    downloadText("preconstruction-to-do.txt", `PRECONSTRUCTION TO-DO\n${projectName}\n\n${summary.progress.done}/${summary.progress.total} workflow milestones complete (${summary.progress.percent}%)\n${teamActions} team actions · ${waiting} waiting\n\nOPEN WORK\n${tasks}\n\nPACKAGE PROGRESS\n${packages || "No trade packages."}\n\nCalculated from the current project state.`);
    notify("Preconstruction to-do list downloaded.");
  }

  return <div className="cm-view todo-workspace">
    <PageHeader eyebrow="YOUR NEXT ACTIONS" title={screenLabel("turnover")} description="A clear path through the work. Complete an action on its page and it moves to Done." actions={<><Button disabled={scanning || !summary.ready} onClick={() => void scan()}><RefreshCw size={16} className={scanning ? "todo-scanning" : ""}/>{scanning ? "Scanning…" : "Scan for task completion"}</Button><Button onClick={exportTodo}><Download size={16}/>Export to-do list</Button></>}/>
    <section className="todo-progress-banner health-workflow-card" aria-label="Preconstruction progress"><ProgressRing percent={summary.progress.percent} label="Workflow progress" detail={`${summary.progress.done} of ${summary.progress.total} milestones`} pending={!summary.ready}/><div><span className="health-eyebrow">ONE STEP CLOSER</span><h2>{summary.progress.done} of {summary.progress.total} milestones complete</h2><p>Every reviewed scope, leveled bid and signed subcontract moves the project forward.</p><button onClick={() => navigate("setup")}>Continue project setup<ArrowRight size={14}/></button></div><div className="todo-progress-count"><strong>{teamActions}</strong><span>actions for your team</span></div></section>
    <div className="todo-status-summary"><div className="missing"><span>Missing files &amp; details</span><strong>{missing}</strong></div><div className="review"><span>Information to check</span><strong>{review}</strong></div><div className="waiting"><span>Waiting on others</span><strong>{waiting}</strong></div><div className="done"><span>Completed tasks</span><strong>{history.done.length}</strong></div></div>
    {scanError ? <p className="todo-scan-result error" role="alert">{scanError}</p> : lastScan && <p className="todo-scan-result" role="status"><CheckCircle2 size={16}/><span>Last checked {new Date(lastScan.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {lastScan.completed.length} newly completed · {lastScan.open} open tasks</span></p>}
    <Panel title={filter === "Done" ? "Completed work" : "Your work list"} subtitle={filter === "Done" ? "A record of tasks completed on their source pages." : "Missing files and details are marked red. Information to check is marked yellow."} action={<Badge>{filter === "Done" ? history.done.length : visible.length} shown</Badge>}>
      <div className="ui-toolbar"><Tabs tabs={["My actions", "Waiting", "All work", "Done"]} value={filter} onChange={setFilter}/><div className="cm-todo-groups">{summary.groups.filter(group => group.todo || group.waiting).map(group => <span key={group.group}>{group.label}<b>{group.todo + group.waiting}</b></span>)}</div></div>
      {filter === "Done" ? (history.done.length ? <ul className="todo-work-list">{history.done.map(task => <DoneTaskCard key={`${task.id}-${task.at}`} task={task} group={groupLabel(task.group)}/>)}</ul> : <Empty title="Nothing done yet" description="Finished tasks move here automatically. Scan for task completion checks the project again."/>) : visible.length ? <ul className="todo-work-list">{visible.map(task => <TodoTaskCard key={task.id} task={task} group={groupLabel(task.group)} navigate={navigate}/>)}</ul> : <Empty title={filter === "Waiting" ? "Nothing is waiting" : "Preconstruction is caught up"} description={filter === "Waiting" ? "No outside response is holding the workflow." : "The current project state has no open team actions."}/>}
    </Panel>
    {summary.packages.length > 0 && <Panel title="Package readiness" subtitle="Eight milestones per trade package, from approved scope to executed subcontract.">
      <div className="cm-package-progress-list">{summary.packages.map(pkg => <button key={pkg.packageId} onClick={() => navigate("packages")}><span><strong>{pkg.code} · {pkg.name}</strong><small>{pkg.owner || "Owner not assigned"}</small></span><div><span>{pkg.done}/{pkg.total}</span><i><b style={{width:`${pkg.percent}%`}}/></i></div><Badge tone={pkg.percent === 100 ? "green" : "neutral"}>{pkg.percent}%</Badge><ArrowRight size={15}/></button>)}</div>
    </Panel>}
  </div>;
}

export function CommercialView(props: ViewProps & { screen: Screen; project: Project }) {
  switch(props.screen){case "packages":return <ProcurementPackagesView {...props}/>;case "bidders":return <BiddersView {...props}/>;case "ratings":return <RatingsView {...props}/>;case "prequalification":return <PrequalificationView {...props}/>;case "portal":return <SubmissionPortalView {...props}/>;case "budget":return <BudgetView {...props}/>;case "allowances":return <AllowancesView {...props}/>;case "value-engineering":return <ValueEngineeringView {...props}/>;case "contracts":return <AwardView {...props}/>;case "schedule":return <ScheduleView {...props}/>;case "turnover":return <TurnoverView {...props}/>;default:return null;}
}

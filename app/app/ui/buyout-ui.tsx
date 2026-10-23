"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BUYOUT_STATUS_LABEL, buyoutRows, buyoutSummary, setBuyoutPlan, scheduleScopeReview, addMinutes, markScopeReviewHeld, recordBafo, type BuyoutRow } from "../../lib/buyout";
import { activeAward, awardStage } from "../../lib/award";
import { useBuyout } from "../../lib/use-buyout";
import { useAward } from "../../lib/use-award";
import { useBudget } from "../../lib/use-budget";
import { useSubmissions } from "../../lib/use-submissions";
import { useLocalDraft } from "../../lib/use-local-draft";
import { initialBidders } from "../../lib/data/commercial";
import { tradeBids } from "../../lib/budget-comparison";
import { displayDate } from "../../lib/format";
import { useLevelingComparison } from "./use-leveling-comparison";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Stats, Tabs, usd, type ViewProps } from "./shared";
import "./buyout-ui.css";

const actor = "Marcel Khoury";
const money = (value: number | null) => value === null ? "—" : usd(value);
export function BuyoutTable({ rows, onOpen }: { rows: BuyoutRow[]; onOpen: (id: string) => void }) {
  return <div className="ui-table-wrap"><table className="ui-table buyout-table"><caption>Buyout delta = GMP budget − contract; before award, uses best and final or low bid.</caption><thead><tr>{["Trade","Status","BIC","Low bid","Best and final","Award","Contract sent","Executed","Buyout delta","Next"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.packageId}><th scope="row"><button className="cm-text-button" onClick={()=>onOpen(row.packageId)}>{row.trade}</button><small>{row.code} · {row.owner || "No owner"}</small></th><td><Badge tone={row.executed?"green":"neutral"}>{BUYOUT_STATUS_LABEL[row.status]}</Badge></td><td>{row.bic || "—"}</td><td>{money(row.low?.value??null)}<small>{row.low?.name}</small></td><td>{money(row.bestAndFinal?.amount??null)}<small>{row.bestAndFinal?.company}</small></td><td>{money(row.award?.amount??null)}<small>{row.award?.company}</small></td><td>{row.contractSent?"Sent":"—"}</td><td>{row.executed?"Executed":"—"}</td><td className={row.delta!==null&&row.delta<0?"cm-negative":"cm-positive"}>{money(row.delta)}</td><td>{row.next}</td></tr>)}</tbody></table>{!rows.length&&<Empty title="No trades match" description="Choose another responsibility filter or add trade packages in Scopes & bid forms."/>}</div>;
}

type Action = "Edit plan" | "Schedule scope review" | "Add minute" | "Record best and final";
export function BuyoutView({ projectName, notify, navigate }: ViewProps) {
  const {state,run}=useBuyout(), {state:awards}=useAward(), {state:budget}=useBudget();
  const {procurement,submissions}=useSubmissions();
  const [directory]=useLocalDraft("directory",initialBidders);
  const comparison=useLevelingComparison();
  const [selectedId,setSelectedId]=useState("");
  const [filter,setFilter]=useState("All");
  const [action,setAction]=useState<Action|null>(null),[error,setError]=useState("");
  const rows=buyoutRows({procurement,submissions,candidates:comparison.candidates,directory,budget,awards,buyout:state});
  const summary=buyoutSummary(rows), selected=rows.find(r=>r.packageId===selectedId);
  const entry=selected?.entry, review=entry?.scopeReview;
  const award=selected?activeAward(awards,selected.packageId):null;
  const bidders=selected?tradeBids(procurement,submissions,selected.packageId,comparison.candidates,directory):[];
  function open(next:Action){setError("");setAction(next);}
  function apply(change:Parameters<typeof run>[0], message:string){const issue=run(change);setError(issue||"");if(issue){notify(issue);return false;}notify(message);return true;}
  function contracts(){if(!selected)return;sessionStorage.setItem("contracts-package",selected.packageId);navigate("contracts");}
  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected||!action)return;
    const data=new FormData(event.currentTarget), text=(key:string)=>String(data.get(key)||"");
    const id=selected.packageId;
    const change:Parameters<typeof run>[0]=s=>action==="Edit plan"?setBuyoutPlan(s,procurement,id,{recommended:text("recommended"),targets:text("targets").split(","),anticipatedAward:text("anticipatedAward"),dropDeadAward:text("dropDeadAward"),notes:text("notes"),welcomeSent:data.has("welcomeSent")},actor):action==="Schedule scope review"?scheduleScopeReview(s,procurement,id,{date:text("date"),attendees:text("attendees")},actor):action==="Add minute"?addMinutes(s,procurement,id,text("minute"),actor):recordBafo(s,procurement,id,{company:text("company"),bidderId:bidders.find(b=>b.name===text("company"))?.bidderId,amount:Number(text("amount")),note:text("note")},actor);
    if(apply(change,`${action} saved.`))setAction(null);
  }
  return <div className="cm-view buyout-view"><PageHeader eyebrow={`${projectName} / Subcontractor outreach`} title="Scope review & buyout" description="From scope review to an executed subcontract: every trade and whose move comes next."/>
    <PreviewNote>Reviews, minutes and best and finals save in this browser. Arrange the meeting and send the welcome email separately.</PreviewNote>
    <Stats items={[{label:"Contract amount",value:usd(summary.contracts),detail:"Total awarded"},{label:"Awarded",value:summary.awarded,detail:"Trades with awards"},{label:"Executed",value:summary.executed,detail:"Signed and executed",tone:"green"},{label:"Open",value:summary.open,detail:"Trades still to award"}]}/>
    {selected?<><Button onClick={()=>{setSelectedId("");setAction(null);setError("");}}><ArrowLeft size={15}/>Back to trades</Button><Panel title={`${selected.code} · ${selected.trade}`} subtitle={`${BUYOUT_STATUS_LABEL[selected.status]} · BIC: ${selected.bic||"—"}`} action={<Button variant="primary" onClick={contracts}>Choose subcontractor<ArrowRight size={15}/></Button>}>
      <div className="buyout-trade-body"><p>{selected.next}</p><div className="buyout-actions">{(["Edit plan","Schedule scope review","Add minute","Record best and final"] as Action[]).map(name=><Button key={name} onClick={()=>open(name)}>{name}</Button>)}<Button disabled={!review||!!review.held} onClick={()=>apply(s=>markScopeReviewHeld(s,procurement,selected.packageId,actor),"Scope review marked held.")}>Mark review held</Button><Button onClick={()=>navigate("drawing-flip")}>Open drawings</Button></div>
      {error&&!action&&<p role="alert">{error}</p>}
      <div className="buyout-detail-grid"><section><h3>Buyout plan</h3><dl><dt>Recommended subcontractor</dt><dd>{entry?.recommended||"Not recorded"}</dd><dt>Targets</dt><dd>{entry?.targets.join(", ")||"Not recorded"}</dd><dt>Anticipated award</dt><dd>{displayDate(entry?.anticipatedAward||"")}</dd><dt>Drop-dead award</dt><dd>{displayDate(entry?.dropDeadAward||"")}</dd><dt>Welcome email sent</dt><dd>{entry?.welcomeSent?"Yes":"No"}</dd></dl><p>{entry?.notes||"No plan notes."}</p></section>
      <section><h3>Scope review</h3>{review?<><p>{displayDate(review.date)} · {review.held?"Held":"Scheduled"}</p><p>{review.attendees||"Attendees not recorded"}</p></>:<p>No scope review scheduled.</p>}<h3>Meeting minutes</h3>{review?.minutes.length?review.minutes.map(minute=><article className="buyout-minute" key={minute.id}><p>{minute.text}</p><small>{minute.by} · {new Date(minute.at).toLocaleString()}</small></article>):<p>No minutes recorded.</p>}</section>
      <section><h3>Best and final</h3>{entry?.bafos.length?entry.bafos.map(b=><article className="buyout-minute" key={b.id}><strong>{b.company} · {usd(b.amount)}</strong><p>{b.note}</p><small>{b.by} · {new Date(b.receivedAt).toLocaleString()}</small></article>):<p>No best and final recorded.</p>}</section>
      <section><h3>Exhibit A & subcontract</h3>{award?<><p>{selected.award?.company} · {money(selected.award?.amount??null)}</p><p>Stage: {awardStage(award).replaceAll("-"," ")}</p><p>Exhibit A: {award.exhibit.status.replaceAll("-"," ")}</p><p>Subcontract: {award.subcontract?.status.replaceAll("-"," ")||"Not generated"}</p></>:<p>Choose the subcontractor in Contracts & exhibits to start the award.</p>}<Button onClick={contracts}>Open Contracts & exhibits</Button></section></div></div>
    </Panel></>:<><Tabs tabs={["All","My move","Their move"]} value={filter} onChange={setFilter}/>{comparison.loading&&<p role="status">Reading saved bids…</p>}<Panel title="Trade buyout tracker"><BuyoutTable rows={rows.filter(r=>filter==="All"||r.ballInCourt===(filter==="My move"?"contractor":"subcontractor"))} onOpen={setSelectedId}/></Panel></>}
    {action&&selected&&<Modal title={action} subtitle={selected.trade} onClose={()=>{setAction(null);setError("");}}><form onSubmit={save}>{action==="Edit plan"?<div className="ui-form-grid"><label className="ui-field full">Recommended subcontractor<input autoFocus name="recommended" list="buyout-bidders" defaultValue={entry?.recommended}/></label><label className="ui-field full">Targets · comma separated<input name="targets" defaultValue={entry?.targets.join(", ")}/></label><label className="ui-field">Anticipated award<input type="date" name="anticipatedAward" defaultValue={entry?.anticipatedAward}/></label><label className="ui-field">Drop-dead award<input type="date" name="dropDeadAward" defaultValue={entry?.dropDeadAward}/></label><label className="ui-field full">Notes<textarea name="notes" rows={4} maxLength={4000} defaultValue={entry?.notes}/></label><label className="full"><input type="checkbox" name="welcomeSent" defaultChecked={entry?.welcomeSent}/> Welcome email sent</label></div>:action==="Schedule scope review"?<><label className="ui-field">Date<input autoFocus required type="date" name="date" defaultValue={review?.date}/></label><label className="ui-field">Attendees<textarea name="attendees" rows={3} defaultValue={review?.attendees}/></label></>:action==="Add minute"?<label className="ui-field">Minute<textarea autoFocus required maxLength={4000} name="minute" rows={6}/></label>:<><label className="ui-field">Company<input autoFocus required name="company" list="buyout-bidders" defaultValue={entry?.recommended||selected.low?.name}/></label><label className="ui-field">Amount · USD<input required type="number" min="0.01" step="0.01" name="amount"/></label><label className="ui-field">Note<textarea name="note" rows={3}/></label></>}<datalist id="buyout-bidders">{bidders.map(b=><option key={b.bidderId||b.name} value={b.name}/>)}</datalist>{error&&<p className="cm-form-error" role="alert">{error}</p>}<div className="cm-form-footer"><Button onClick={()=>setAction(null)}>Cancel</Button><Button type="submit" variant="primary">{action}</Button></div></form></Modal>}
  </div>;
}

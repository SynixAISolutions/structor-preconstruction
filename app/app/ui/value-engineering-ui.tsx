"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Lightbulb, Pencil, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import {
  addVeIdea, bestKnownImpact, decideVeIdea, declineVePricing, editVeIdea, recordVeQuote,
  removeVeIdea, reopenVeIdea, requestVePricing, setMarkupFactor, setVeTarget, veSummary,
  weightedImpact, type VeErrors, type VeIdea, type VeOrigin,
} from "../../lib/value-engineering";
import { useValueEngineering } from "../../lib/use-value-engineering";
import { useBudget } from "../../lib/use-budget";
import { budgetTotals } from "../../lib/budget";
import { useProcurement } from "../../lib/use-procurement";
import { useLocalDraft } from "../../lib/use-local-draft";
import { initialBidders } from "../../lib/data/commercial";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, PreviewNote, Stats, Tabs, exportRows, usd, type ViewProps } from "./shared";
import { VeAiOptions } from "./ve-options";
import { AssetLink } from "./contract-files";
import { useSubmissions } from "../../lib/use-submissions";
import { acceptOwnerVe } from "../../lib/ve-bids";
import type { Project } from "../../lib/projects";
import "./value-engineering.css";

const actor = "Marcel Khoury";
const statusLabels = { idea: "Idea", pricing: "Pricing", priced: "Priced", accepted: "Accepted", rejected: "Rejected" } as const;
const statusTone = (status: VeIdea["status"]) => status === "accepted" ? "green" : status === "rejected" ? "red" : status === "priced" ? "blue" : "amber";
const signed = (value: number) => value > 0 ? `+${usd(value)}` : usd(value);
const number = (value: FormDataEntryValue | null, nullable = false) => {
  const text = String(value ?? "").replace(/[$,\s]/g, "");
  if (nullable && !text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
function ErrorText({ value }: { value?: string }) { return value ? <small className="ve-error">{value}</small> : null; }

export function ValueEngineeringView({ notify, project }: ViewProps & { project: Project }) {
  const { state, run } = useValueEngineering();
  const { submissions } = useSubmissions();
  const { state: budget } = useBudget();
  const { state: procurement } = useProcurement();
  const [directory] = useLocalDraft("directory", initialBidders);
  const [tab, setTab] = useState("All ideas");
  const [edit, setEdit] = useState<VeIdea | "new" | null>(null);
  const [detail, setDetail] = useState<VeIdea | null>(null);
  const [pricing, setPricing] = useState<VeIdea | null>(null);
  const [quote, setQuote] = useState<{ idea: VeIdea; requestId: string } | null>(null);
  const [decision, setDecision] = useState<{ idea: VeIdea; outcome: "accepted" | "rejected" } | null>(null);
  const [errors, setErrors] = useState<VeErrors>({});
  const estimate = budgetTotals(budget).totalBudget;
  const summary = veSummary(state, estimate || null);
  const shown = state.ideas.filter(idea => tab === "All ideas" || (tab === "Open" ? !idea.decision : idea.status === tab.toLowerCase()));
  const packageName = (id: string | null) => procurement.packages.find(pkg => pkg.id === id)?.name ?? "No trade package";

  function close() { setEdit(null); setPricing(null); setQuote(null); setDecision(null); setErrors({}); }
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const ownerBudget = number(form.get("ownerBudget"), true), reduction = number(form.get("reduction"), true), factor = number(form.get("markupFactor"));
    const nextErrors = run(current => setMarkupFactor(setVeTarget(current, { ownerBudget, reduction }), factor as number));
    if (nextErrors) { setErrors(nextErrors); return; }
    setErrors({}); notify("Value engineering target updated.");
  }
  function saveIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input = {
      description: String(form.get("description") ?? ""), category: String(form.get("category") ?? ""), csiCode: String(form.get("csiCode") ?? ""),
      packageId: String(form.get("packageId") ?? "") || null, source: String(form.get("source") ?? ""), origin: String(form.get("origin")) as VeOrigin,
      costImpact: number(form.get("costImpact")) as number, notes: String(form.get("notes") ?? ""),
    };
    const nextErrors = run(current => edit === "new" ? addVeIdea(current, input, actor) : editVeIdea(current, edit!.id, input));
    if (nextErrors) { setErrors(nextErrors); return; }
    close(); notify(edit === "new" ? "Value engineering idea added." : "Value engineering idea updated.");
  }
  function sendPricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pricing) return; const selected = new FormData(event.currentTarget).getAll("bidder").map(String);
    const nextErrors = run(current => requestVePricing(current, pricing.id, directory.filter(company => selected.includes(company.id)), actor));
    if (nextErrors) { setErrors(nextErrors); return; }
    close(); setDetail(null); notify("Pricing requests recorded. No email was sent.");
  }
  function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!quote) return; const form = new FormData(event.currentTarget);
    const nextErrors = run(current => recordVeQuote(current, quote.idea.id, quote.requestId, { quotedImpact: number(form.get("quotedImpact")) as number, note: String(form.get("note") ?? "") }));
    if (nextErrors) { setErrors(nextErrors); return; }
    close(); setDetail(null); notify("Subcontractor quote recorded.");
  }
  function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!decision) return; const form = new FormData(event.currentTarget);
    const selectedBid = submissions.find(s => s.id === String(form.get("submissionId")));
    const nextErrors = run(current => decision.outcome === "accepted" && selectedBid ? acceptOwnerVe(current, decision.idea.id, selectedBid, procurement, number(form.get("acceptedImpact")) as number, String(form.get("ownerName") || ""), String(form.get("note") || "")) : decideVeIdea(current, decision.idea.id, decision.outcome, { acceptedImpact: decision.outcome === "accepted" ? number(form.get("acceptedImpact")) as number : undefined, note: String(form.get("note") ?? "") }, actor));
    if (nextErrors) { setErrors(nextErrors); return; }
    close(); setDetail(null); notify(`Idea ${decision.outcome}.`);
  }
  function remove(idea: VeIdea) {
    const nextErrors = run(current => removeVeIdea(current, idea.id));
    if (nextErrors) { setErrors(nextErrors); return; }
    setDetail(null); notify("Value engineering idea removed.");
  }

  const progress = Math.max(0, Math.min(100, summary.percentOfTarget ?? 0));
  return <div className="ve-view">
    <PageHeader eyebrow="COST OPTIMIZATION" title="Value engineering" description="Set the savings target, price each idea, and review alternatives and record owner acceptance against a specific submitted bid." actions={<><ExportButton onClick={() => exportRows("value-engineering.csv", [["Number", "Category", "Idea", "Trade package", "CSI", "Origin", "Estimated impact", "Weighted impact", "Status", "Accepted impact"], ...state.ideas.map(idea => [idea.number, idea.category, idea.description, packageName(idea.packageId), idea.csiCode ?? "", idea.origin, idea.costImpact, weightedImpact(idea.costImpact, state.markupFactor), idea.status, idea.decision?.acceptedImpact ?? ""])])}/><Button variant="primary" onClick={() => { setEdit("new"); setErrors({}); }}><Plus size={16}/>Add idea</Button></>}/>
    <PreviewNote>Owner acceptance changes only the linked current subcontract bid in leveling and the lowest-sub budget. Your in-house budget stays editable. Pricing requests are recorded here; no email is sent.</PreviewNote>
    <Stats items={[
      { label: "Target reduction", value: summary.targetReduction === null ? "Not set" : usd(summary.targetReduction), detail: `Current estimate ${usd(estimate)}` },
      { label: "Accepted savings", value: usd(Math.max(0, -summary.acceptedWeighted)), detail: `${summary.counts.accepted} accepted idea${summary.counts.accepted === 1 ? "" : "s"}`, tone: "green" },
      { label: "Pending savings", value: usd(Math.max(0, -summary.pendingWeighted)), detail: "Best known open impacts" },
      { label: "Gap to target", value: summary.gap === null ? "Set target" : usd(Math.max(0, summary.gap)), detail: summary.gap !== null && summary.gap <= 0 ? "Target met" : `${progress}% of target accepted`, tone: summary.gap !== null && summary.gap <= 0 ? "green" : "orange" },
    ]}/>
    <VeAiOptions area={project.squareFeet || 0} add={input => { const errors = run(s => addVeIdea(s, input, actor)); setErrors(errors || {}); if (!errors) notify("AI option added for review."); return !errors; }}/>
    <Panel title="Savings target" subtitle="Enter the owner’s budget or a direct reduction. A direct reduction takes precedence.">
      <form className="ve-target" onSubmit={saveSettings}>
        <label className="ui-field"><span>Owner budget · USD</span><input name="ownerBudget" inputMode="decimal" defaultValue={state.target.ownerBudget ?? ""} placeholder="Optional"/><ErrorText value={errors.ownerBudget}/></label>
        <label className="ui-field"><span>Target reduction · USD</span><input name="reduction" inputMode="decimal" defaultValue={state.target.reduction ?? ""} placeholder="Optional"/><ErrorText value={errors.reduction}/></label>
        <label className="ui-field"><span>Markup factor</span><input name="markupFactor" inputMode="decimal" required defaultValue={state.markupFactor}/><ErrorText value={errors.markupFactor}/></label>
        <Button type="submit">Save target</Button>
        <div className="ve-target-progress"><span><b style={{width:`${progress}%`}}/></span><small>{summary.projectedEstimate === null ? "Projected estimate unavailable" : `Projected estimate ${usd(summary.projectedEstimate)}`}</small></div>
      </form>
    </Panel>
    <Tabs tabs={["All ideas", "Open", "Pricing", "Accepted", "Rejected"]} value={tab} onChange={setTab}/>
    <Panel title={tab} subtitle="Negative cost impact is a saving; weighted impact includes the project markup factor." action={<Badge>{shown.length} ideas</Badge>}>
      {shown.length ? <div className="ui-table-wrap"><table className="ui-table ve-table"><thead><tr><th>VE item</th><th>Trade / source</th><th>Estimated impact</th><th>Weighted impact</th><th>Pricing</th><th>Status</th><th/></tr></thead><tbody>{shown.map(idea => <tr key={idea.id}><td><div className="ve-primary"><b>{idea.number}</b><span><strong>{idea.description}</strong><small>{idea.category || "Uncategorized"}{idea.csiCode ? ` · CSI ${idea.csiCode}` : ""}</small></span></div></td><td><strong>{packageName(idea.packageId)}</strong><small className="ve-cell-note">{idea.source || `${statusLabels[idea.status]} · ${idea.origin}`}</small></td><td className={idea.costImpact <= 0 ? "ve-saving" : "ve-cost"}>{signed(idea.costImpact)}</td><td className={idea.costImpact <= 0 ? "ve-saving" : "ve-cost"}>{signed(weightedImpact(idea.costImpact, state.markupFactor))}</td><td>{idea.pricing.length}<small className="ve-cell-note">{idea.pricing.filter(item => item.status === "quoted").length} quoted</small></td><td><Badge tone={statusTone(idea.status)}>{statusLabels[idea.status]}</Badge></td><td><Button onClick={() => setDetail(idea)}>Review<ArrowRight size={14}/></Button></td></tr>)}</tbody></table></div> : <Empty title="No value engineering ideas" description="Add a team idea, then ask subcontractors to price it before the decision." action={<Button variant="primary" onClick={() => setEdit("new")}><Plus size={15}/>Add first idea</Button>}/>} 
    </Panel>
    {edit && <Modal title={edit === "new" ? "Add value engineering idea" : `Edit ${edit.number}`} subtitle="Enter savings as a negative cost impact and added cost as positive." onClose={close} wide><form onSubmit={saveIdea}><div className="ui-form-grid">
      <label className="ui-field full"><span>Idea description</span><textarea name="description" rows={3} required defaultValue={edit === "new" ? "" : edit.description}/><ErrorText value={errors.description}/></label>
      <label className="ui-field"><span>Heading / category</span><input name="category" defaultValue={edit === "new" ? "" : edit.category} placeholder="MEP reductions"/></label>
      <label className="ui-field"><span>Trade package</span><select name="packageId" defaultValue={edit === "new" ? "" : edit.packageId ?? ""}><option value="">No trade package</option>{procurement.packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
      <label className="ui-field"><span>CSI code</span><input name="csiCode" defaultValue={edit === "new" ? "" : edit.csiCode ?? ""} placeholder="07 50 00"/></label>
      <label className="ui-field"><span>Source reference</span><input name="source" defaultValue={edit === "new" ? "" : edit.source} placeholder="A-401 / 07 54 23"/></label>
      <label className="ui-field"><span>Origin</span><select name="origin" defaultValue={edit === "new" ? "team" : edit.origin}><option value="team">Team</option><option value="ai">AI suggestion</option><option value="subcontractor">Subcontractor</option></select></label>
      <label className="ui-field"><span>Estimated cost impact · USD</span><input name="costImpact" inputMode="decimal" required defaultValue={edit === "new" ? "" : edit.costImpact} placeholder="-40000"/><ErrorText value={errors.costImpact}/></label>
      <label className="ui-field full"><span>Notes</span><textarea name="notes" rows={2} defaultValue={edit === "new" ? "" : edit.notes}/></label>
    </div><div className="cm-form-footer"><Button onClick={close}>Cancel</Button><Button type="submit" variant="primary">{edit === "new" ? "Add idea" : "Save idea"}</Button></div></form></Modal>}
    {detail && <Modal title={`${detail.number} · ${detail.description}`} subtitle={`${packageName(detail.packageId)} · ${statusLabels[detail.status]}`} onClose={() => { setDetail(null); setErrors({}); }} wide><div className="ve-detail-summary"><div><small>Estimated impact</small><strong className={detail.costImpact <= 0 ? "ve-saving" : "ve-cost"}>{signed(detail.costImpact)}</strong></div><div><small>Weighted impact</small><strong>{signed(weightedImpact(detail.costImpact, state.markupFactor))}</strong></div><div><small>Best known impact</small><strong>{signed(bestKnownImpact(detail))}</strong></div></div>{detail.productData && <p>Product data: <AssetLink asset={detail.productData}/></p>}{detail.bid && <p>Linked submitted bid revision {detail.bid.revisionNumber}{detail.decision?.ownerApproved ? ` · Owner accepted by ${detail.decision.by}` : " · Awaiting owner decision"}</p>}{detail.notes && <p className="ve-notes">{detail.notes}</p>}
      <div className="ve-pricing-list"><header><strong>Subcontractor pricing</strong><Button disabled={!!detail.decision} onClick={() => { setPricing(detail); setDetail(null); setErrors({}); }}><Send size={14}/>Request pricing</Button></header>{detail.pricing.length ? detail.pricing.map(request => <div key={request.id}><span><strong>{request.company}</strong><small>{request.status === "quoted" ? `${signed(request.quotedImpact!)} · ${request.note || "Quote recorded"}` : request.status === "declined" ? request.note || "Declined" : "Awaiting price"}</small></span><Badge tone={request.status === "quoted" ? "green" : request.status === "declined" ? "red" : "amber"}>{request.status}</Badge>{request.status === "requested" && !detail.decision && <><Button onClick={() => { setQuote({ idea: detail, requestId: request.id }); setDetail(null); setErrors({}); }}>Record quote</Button><button className="ve-text-button" onClick={() => { run(current => declineVePricing(current, detail.id, request.id, "Declined to price")); setDetail(null); notify("Pricing request marked declined."); }}>Declined</button></>}</div>) : <p>No companies have been asked to price this idea.</p>}</div>
      <ErrorText value={errors.decision || errors.idea}/><div className="ve-detail-actions">{detail.decision ? <Button onClick={() => { run(current => reopenVeIdea(current, detail.id)); setDetail(null); notify("Idea reopened."); }}><RotateCcw size={15}/>Reopen decision</Button> : <><Button onClick={() => { setEdit(detail); setDetail(null); setErrors({}); }}><Pencil size={15}/>Edit</Button><Button onClick={() => { setDecision({ idea: detail, outcome: "rejected" }); setDetail(null); setErrors({}); }}>Reject</Button><Button variant="primary" onClick={() => { setDecision({ idea: detail, outcome: "accepted" }); setDetail(null); setErrors({}); }}><Check size={15}/>Accept</Button><Button onClick={() => remove(detail)}><Trash2 size={15}/>Remove</Button></>}</div>
    </Modal>}
    {pricing && <Modal title={`Request pricing for ${pricing.number}`} subtitle="The request is recorded in the project. No email is sent." onClose={close}><form onSubmit={sendPricing}><div className="ve-bidder-list">{directory.map(company => { const asked = pricing.pricing.some(item => item.bidderId === company.id); return <label key={company.id} className={asked ? "disabled" : ""}><input type="checkbox" name="bidder" value={company.id} disabled={asked}/><span><strong>{company.company}</strong><small>{company.trade} · {company.name}{asked ? " · Already requested" : ""}</small></span></label>; })}</div><ErrorText value={errors.bidders}/><div className="cm-form-footer"><Button onClick={close}>Cancel</Button><Button type="submit" variant="primary">Record requests</Button></div></form></Modal>}
    {quote && <Modal title={`Record ${quote.idea.number} quote`} subtitle={quote.idea.pricing.find(item => item.id === quote.requestId)?.company} onClose={close}><form onSubmit={saveQuote}><label className="ui-field"><span>Quoted cost impact · USD</span><input name="quotedImpact" inputMode="decimal" required placeholder="-35000"/><small>Negative is a saving; positive is added cost.</small></label><label className="ui-field"><span>Quote note</span><textarea name="note" rows={3}/></label><ErrorText value={errors.quote}/><div className="cm-form-footer"><Button onClick={close}>Cancel</Button><Button type="submit" variant="primary">Record quote</Button></div></form></Modal>}
    {decision && <Modal title={`${decision.outcome === "accepted" ? "Accept" : "Reject"} ${decision.idea.number}`} subtitle="Choose a current bid and record the owner decision to apply its price impact. A team-only decision stays a proposal." onClose={close}><form onSubmit={saveDecision}>{decision.outcome === "accepted" && <><label className="ui-field"><span>Apply owner acceptance to bid</span><select name="submissionId" defaultValue={decision.idea.bid?.submissionId || ""}><option value="">Team-only decision · no bid adjustment</option>{submissions.filter(s => s.revisions.length && (!decision.idea.packageId || s.packageId === decision.idea.packageId)).map(s => <option key={s.id} value={s.id}>{directory.find(d=>d.id===s.bidderId)?.company || s.bidderId} · {packageName(s.packageId)} · revision {s.revisions.at(-1)!.number}</option>)}</select></label><label className="ui-field"><span>Owner approving this change</span><input name="ownerName" placeholder="Required when applying to a bid"/></label></>}{decision.outcome === "accepted" && <label className="ui-field"><span>Accepted cost impact · USD</span><input name="acceptedImpact" inputMode="decimal" required defaultValue={bestKnownImpact(decision.idea)}/><small>Choose the estimate or a quoted impact explicitly.</small></label>}<label className="ui-field"><span>Decision note</span><textarea name="note" rows={3}/></label><ErrorText value={errors.decision}/><div className="cm-form-footer"><Button onClick={close}>Cancel</Button><Button type="submit" variant="primary">Record decision</Button></div></form></Modal>}
  </div>;
}

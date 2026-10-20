"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle, ArrowRight, Award as AwardIcon, Bell, Check, CheckCircle2,
  Download, FileCheck2, FileText, History, MessageSquare, PenLine, Plus,
  Send, ShieldCheck, Signature, Trash2, UserRoundCheck,
} from "lucide-react";
import {
  DEFAULT_EXHIBIT_TEMPLATE, DEFAULT_SUBCONTRACT_TEMPLATE,
  activeAward, addExhibitComment, agreeExhibit, awardCandidates, awardStage,
  cancelAward, createAward, executeSubcontract, generateSubcontract,
  latestExhibit, markAwardNotificationsRead, renderDocumentText,
  requestExhibitChanges, reviseExhibit, sendSubcontract, setCommentResolved,
  shareExhibit, signSubcontract, unresolvedComments,
  type Award, type AwardContext, type AwardErrors, type AwardStage,
  type AwardState, type DocumentContent, type Party, type Signer,
} from "../../lib/award";
import { levelingCandidates, type LevelingBasis, type LevelingCandidate } from "../../lib/budget";
import { initialBidders, type Bidder } from "../../lib/data/commercial";
import type { BidProvenance, LevelingBidder, LevelingScopeItem } from "../../lib/leveling-import";
import { useAward } from "../../lib/use-award";
import { useClarifications } from "../../lib/clarifications-client";
import type { Project } from "../../lib/projects";
import { useBudget } from "../../lib/use-budget";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useSubmissions } from "../../lib/use-submissions";
import { loadWorkspace } from "../../lib/workspace-storage";
import {
  Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Stats, Tabs,
  downloadText, usd, type ViewProps,
} from "./shared";
import { OtherExhibits, ContractScopeDraft, AssetLink } from "./contract-files";
import { useValueEngineering } from "../../lib/use-value-engineering";
import { veLevelingBidders } from "../../lib/ve-bids";
import { templateFor } from "../../lib/company-forms";
import type { CompanyForm } from "../../lib/contract-files";
import { setContractFiles } from "../../lib/contract-files";
import { assetUrl } from "../../lib/document-assets";
import "./award-ui.css";

const actor = "Marcel Khoury";
const basisLabels: Record<LevelingBasis, string> = {
  base: "Base bid", provisional: "Provisional leveled total", reviewed: "Reviewed leveled total",
};
const stageLabels: Record<AwardStage, string> = {
  cancelled: "Cancelled", "exhibit-draft": "Exhibit A draft", "exhibit-shared": "Exhibit A shared",
  "exhibit-changes-requested": "Changes requested", "exhibit-agreed": "Exhibit A agreed",
  "subcontract-draft": "Subcontract draft", "signature-pending": "Awaiting subcontractor",
  "subcontractor-signed": "Needs countersignature", countersigned: "Ready to execute", executed: "Executed",
};
const flow = ["Awarded", "Exhibit A", "Agreed", "Signatures", "Executed"];

function stageIndex(stage: AwardStage) {
  if (stage === "executed") return 4;
  if (["signature-pending", "subcontractor-signed", "countersigned"].includes(stage)) return 3;
  if (["exhibit-agreed", "subcontract-draft"].includes(stage)) return 2;
  if (["exhibit-draft", "exhibit-shared", "exhibit-changes-requested"].includes(stage)) return 1;
  return 0;
}

function stamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function copyDocument(content: DocumentContent): DocumentContent {
  return { title: content.title, sections: content.sections.map(section => ({ heading: section.heading, lines: [...section.lines] })) };
}

function ErrorSummary({ errors }: { errors: AwardErrors }) {
  const messages = [...new Set(Object.values(errors).filter((message): message is string => !!message))];
  return messages.length ? <div className="award-errors" role="alert"><AlertTriangle size={17}/><div>{messages.map(message => <p key={message}>{message}</p>)}</div></div> : null;
}

function DocumentPreview({ content, status, company }: { content: DocumentContent; status: string; company?: import("../../lib/contract-files").CompanyForm }) {
  return <article className="award-paper">
    <header><span className="award-paper-brand">{company?.logo && <img src={assetUrl(company.logo)} alt={`${company.name} logo`} style={{maxWidth:120,maxHeight:45}}/>}{company?.name || "General contractor"}</span><Badge tone="amber">{status}</Badge></header>
    <h2>{content.title}</h2>
    {content.sections.map((section, index) => <section key={`${section.heading}-${index}`}>
      <h3>{/^\d+(?:\.\d+)*[.)]\s/.test(section.heading) ? section.heading : `${String(index + 1).padStart(2, "0")}. ${section.heading}`}</h3>
      {section.lines.length ? <ul>{section.lines.map((line, lineIndex) => <li key={`${line}-${lineIndex}`}>{line}</li>)}</ul> : <p className="award-paper-empty">No entries recorded.</p>}
    </section>)}
    <footer>Prepared in Structor · Browser demo document</footer>
  </article>;
}

function CandidateValues({ candidate }: { candidate: LevelingCandidate }) {
  return <div className="award-candidate-values">
    <span>Base<strong>{candidate.baseBid === null ? "—" : usd(candidate.baseBid)}</strong></span>
    <span>Provisional<strong>{candidate.provisionalTotal === null ? "—" : usd(candidate.provisionalTotal)}</strong></span>
    <span>Reviewed<strong>{candidate.reviewedTotal === null ? "—" : usd(candidate.reviewedTotal)}</strong></span>
  </div>;
}

export function AwardView({ projectName, notify, navigate, project }: ViewProps & { project: Project }) {
  const { projectId, procurement, submissions } = useSubmissions();
  const { requests: clarifications, loading: clarificationsLoading, error: clarificationsError, reload: reloadClarifications } = useClarifications(projectId);
  const { state: budget } = useBudget();
  const { state, run } = useAward();
  const { state: ve } = useValueEngineering();
  const [directory] = useLocalDraft<Bidder[]>("directory", initialBidders);
  const [provenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [loadedPackageId] = useLocalDraft("leveling-submission-package", "");
  const [candidates, setCandidates] = useState<LevelingCandidate[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [packageId, setPackageId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [basis, setBasis] = useState<LevelingBasis>("reviewed");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [allowanceIds, setAllowanceIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<AwardErrors>({});
  const [tab, setTab] = useState("Exhibit A");
  const [revisionNumber, setRevisionNumber] = useState(0);
  const [editDocument, setEditDocument] = useState<{ content: DocumentContent; note: string } | null>(null);
  const [commentMode, setCommentMode] = useState<"comment" | "changes" | null>(null);
  const [commentParty, setCommentParty] = useState<Party>("contractor");
  const [commentAuthor, setCommentAuthor] = useState(actor);
  const [commentText, setCommentText] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementParty, setAgreementParty] = useState<Party>("subcontractor");
  const [agreementName, setAgreementName] = useState("");
  const [contractorOpen, setContractorOpen] = useState(false);
  const [company] = useLocalDraft<CompanyForm>("company-form", { name: "General contractor" });
  const [contractorName, setContractorName] = useState("General contractor");
  const [signatureParty, setSignatureParty] = useState<Party | null>(null);
  const [signer, setSigner] = useState<Signer>({ name: "", title: "", email: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (procurement.packages.some(pkg => pkg.id === packageId)) return;
    const first = loadedPackageId || state.awards.find(award => !award.cancelled)?.packageId || procurement.packages.find(pkg => pkg.published)?.id || procurement.packages[0]?.id || "";
    setPackageId(first);
  }, [loadedPackageId, packageId, procurement.packages, state.awards]);

  useEffect(() => {
    let live = true;
    setWorkspaceLoading(true); setWorkspaceMessage("");
    void loadWorkspace<unknown, LevelingScopeItem, LevelingBidder>().then(workspace => {
      if (!live) return;
      const next = workspace ? levelingCandidates({ packageId: loadedPackageId || null, items: workspace.items, bidders: veLevelingBidders(workspace.bidders, provenance, ve, submissions), provenance }) : [];
      setCandidates(next);
      if (!next.length) setWorkspaceMessage("No saved leveling comparison is available. Load a submitted portal bid in Bid leveling first.");
    }).catch(error => {
      if (live) { setCandidates([]); setWorkspaceMessage(error instanceof Error ? error.message : "The saved leveling comparison could not be read."); }
    }).finally(() => { if (live) setWorkspaceLoading(false); });
    return () => { live = false; };
  }, [loadedPackageId, projectId, provenance, ve, submissions]);

  const pkg = procurement.packages.find(item => item.id === packageId);
  const packageCandidates = candidates.filter(candidate => candidate.packageId === packageId);
  const checkedCandidates = awardCandidates(packageCandidates);
  const defaultCandidate = checkedCandidates.find(item => item.awardable)?.candidate ?? packageCandidates[0];
  const selectedCandidateId = packageCandidates.some(candidate => candidate.levelingBidderId === candidateId) ? candidateId : defaultCandidate?.levelingBidderId ?? "";
  const selectedCandidate = packageCandidates.find(candidate => candidate.levelingBidderId === selectedCandidateId);
  const award = packageId ? activeAward(state, packageId) : undefined;
  const stage = award ? awardStage(award) : null;
  const currentRevision = award ? award.exhibit.revisions.find(revision => revision.number === revisionNumber) ?? latestExhibit(award) : null;
  const directLines = budget.lines.filter(line => line.classification === "direct");
  const availableAllowances = budget.allowances.filter(item => item.status !== "excluded");
  const unread = state.notifications.filter(note => !note.read).length;
  const selectedAmount = selectedCandidate ? (basis === "base" ? selectedCandidate.baseBid : basis === "provisional" ? selectedCandidate.provisionalTotal : selectedCandidate.reviewedTotal) : null;

  function perform(action: (current: AwardState) => AwardState, message: string, close?: () => void) {
    const nextErrors = run(action);
    setErrors(nextErrors ?? {});
    if (!nextErrors) { close?.(); notify(message); }
    return !nextErrors;
  }

  function makeAward() {
    if (clarificationsLoading || clarificationsError) return;
    if (!selectedCandidateId) { setErrors({ candidate: "Choose an eligible submitted bid." }); return; }
    const context: AwardContext = {
      projectId, projectName, procurement, submissions, candidates, budget, directory, clarifications,
      projectAddress: project.location, projectStart: project.start, projectFinish: project.finish,
    };
    if (perform(current => createAward(current, context, { levelingBidderId: selectedCandidateId, basis, budgetLineId: budgetLineId || null, allowanceIds }, actor, undefined, undefined, templateFor(company, "exhibit-a", DEFAULT_EXHIBIT_TEMPLATE)), `${selectedCandidate?.bidderName ?? "Bidder"} selected for ${pkg?.name ?? "the package"}.`)) {
      setTab("Exhibit A"); setRevisionNumber(0);
    }
  }

  function openEditor() {
    if (!award) return;
    setEditDocument({ content: copyDocument(latestExhibit(award).content), note: "" }); setErrors({});
  }

  function saveRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!award || !editDocument) return;
    perform(current => reviseExhibit(current, award.id, editDocument.content, editDocument.note, actor), "A new Exhibit A revision was created.", () => { setEditDocument(null); setRevisionNumber(0); });
  }

  function openComment(mode: "comment" | "changes") {
    if (!award) return;
    const party: Party = mode === "changes" ? "subcontractor" : "contractor";
    setCommentMode(mode); setCommentParty(party); setCommentAuthor(party === "subcontractor" ? award.snapshot.company.contact : actor); setCommentText(""); setErrors({});
  }

  function saveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!award || !commentMode) return;
    const action = commentMode === "changes"
      ? (current: AwardState) => requestExhibitChanges(current, award.id, { author: commentAuthor, text: commentText })
      : (current: AwardState) => addExhibitComment(current, award.id, { author: commentAuthor, party: commentParty, text: commentText });
    perform(action, commentMode === "changes" ? "Change request recorded and the project team was notified." : "Comment added to Exhibit A.", () => setCommentMode(null));
  }

  function openSignature(party: Party) {
    if (!award) return;
    setSignatureParty(party); setSigner(party === "subcontractor"
      ? { name: award.snapshot.company.contact, title: "", email: award.snapshot.company.email }
      : { name: actor, title: "Project manager", email: "" });
    setErrors({});
  }

  const awardsLive = state.awards.filter(item => !item.cancelled);
  const executed = awardsLive.filter(item => item.subcontract?.status === "executed").length;
  const agreements = awardsLive.filter(item => item.exhibit.status === "agreed").length;

  return <div className="award-view">
    <PageHeader eyebrow="BID → AWARD → CONTRACT" title="Contracts & exhibits" description="Select the reviewed bid, agree the trade scope, and carry one award through execution." actions={<>
      <Button onClick={() => navigate("settings")}>Company forms & logo</Button>{unread > 0 && <Button onClick={() => { setTab("Activity"); if (!award) notify(`${unread} recorded contract notifications across this project.`); }}><Bell size={16}/>{unread} unread</Button>}
      <Button onClick={() => navigate("leveling")}>Bid leveling<ArrowRight size={15}/></Button>
    </>}/>
    <PreviewNote>Browser-only demo · Shares, signature requests, and notifications are recorded here; no email is sent. Typed signatures are demonstration records.</PreviewNote>
    <Stats items={[
      { label: "Trade packages", value: procurement.packages.length, detail: `${procurement.packages.filter(item => item.published).length} published bid forms` },
      { label: "Live awards", value: awardsLive.length, detail: "One active award per package" },
      { label: "Agreed exhibits", value: agreements, detail: "Locked scope revisions", tone: agreements ? "green" : undefined },
      { label: "Executed", value: executed, detail: "Final copies available", tone: executed ? "green" : undefined },
    ]}/>

    <div className="award-layout">
      <aside className="award-package-rail" aria-label="Trade packages">
        <header><span>TRADE AWARDS</span><small>{procurement.packages.length} packages</small></header>
        {procurement.packages.map(item => {
          const itemAward = activeAward(state, item.id);
          const itemStage = itemAward ? awardStage(itemAward) : null;
          const ready = awardCandidates(candidates.filter(candidate => candidate.packageId === item.id)).some(candidate => candidate.awardable);
          return <button key={item.id} className={packageId === item.id ? "active" : ""} onClick={() => { setPackageId(item.id); setCandidateId(""); setErrors({}); setTab("Exhibit A"); }}>
            <span className="award-trade-code">{item.division}</span><span><strong>{item.name}</strong><small>{itemStage ? stageLabels[itemStage] : ready ? "Ready to award" : item.published ? "Awaiting reviewed bid" : "Bid form not published"}</small></span>
            {itemStage === "executed" ? <CheckCircle2 size={17}/> : itemAward ? <FileCheck2 size={17}/> : <ArrowRight size={15}/>}
          </button>;
        })}
      </aside>

      <main className="award-main">
        {!pkg ? <Panel><Empty title="No trade packages yet" description="Create a bid package before preparing an award." action={<Button onClick={() => navigate("packages")}>Open bid packages</Button>}/></Panel> : !award ? <>
          <Panel title={`Select the ${pkg.name} subcontractor`} subtitle={`${pkg.code} · Estimator ${pkg.owner} · Explicitly choose the bidder and value used for the award.`} action={<Badge tone={checkedCandidates.some(item => item.awardable) ? "green" : "amber"}>{checkedCandidates.filter(item => item.awardable).length} awardable</Badge>}>
            {workspaceLoading ? <div className="award-loading">Reading the current Bid leveling workspace…</div> : packageCandidates.length ? <div className="award-candidate-list">{checkedCandidates.map(({ candidate, awardable, reasons }) => <label key={candidate.levelingBidderId} className={`award-candidate ${selectedCandidateId === candidate.levelingBidderId ? "selected" : ""} ${!awardable ? "blocked" : ""}`}>
              <input type="radio" name="award-candidate" checked={selectedCandidateId === candidate.levelingBidderId} onChange={() => { setCandidateId(candidate.levelingBidderId); setErrors({}); }}/>
              <span className="award-candidate-heading"><span><strong>{candidate.bidderName}</strong><small>Portal submission · revision {candidate.revisionNumber ?? "—"}</small></span><Badge tone={awardable ? "green" : "amber"}>{awardable ? "Ready" : "Blocked"}</Badge></span>
              <CandidateValues candidate={candidate}/>
              {!awardable && <p className="award-candidate-reasons">{reasons.join(" ")}</p>}
            </label>)}</div> : <Empty title={loadedPackageId && loadedPackageId !== packageId ? "Another package is loaded in leveling" : "No reviewed portal bid is ready"} description={loadedPackageId && loadedPackageId !== packageId ? `Bid leveling currently contains ${procurement.packages.find(item => item.id === loadedPackageId)?.name ?? "another trade"}. Load ${pkg.name} before selecting an award.` : workspaceMessage || "Publish the bid form, receive a portal submission, and complete its leveling review."} action={<Button onClick={() => navigate("leveling")}>Open Bid leveling<ArrowRight size={15}/></Button>}/>} 
          </Panel>
          {packageCandidates.length > 0 && <Panel title="Award basis and attachments" subtitle="These choices are frozen into the award snapshot and Exhibit A.">
            <div className="award-form-grid">
              <label className="ui-field"><span>Award value</span><select value={basis} onChange={event => setBasis(event.target.value as LevelingBasis)}>{(Object.keys(basisLabels) as LevelingBasis[]).map(value => <option value={value} key={value}>{basisLabels[value]}</option>)}</select><small>{selectedAmount === null ? "No value is available for this basis." : `${usd(selectedAmount)} will be the subcontract amount.`}</small></label>
              <label className="ui-field"><span>Budget line · optional</span><select value={budgetLineId} onChange={event => setBudgetLineId(event.target.value)}><option value="">Do not link a budget line</option>{directLines.map(line => <option value={line.id} key={line.id}>{line.description} · {line.csiCode || "No CSI"}</option>)}</select><small>The award does not commit or change the budget automatically.</small></label>
            </div>
            <div className="award-allowances"><header><strong>Allowances included in the award</strong><small>Excluded allowances cannot be selected.</small></header>{availableAllowances.length ? availableAllowances.map(item => <label key={item.id}><input type="checkbox" checked={allowanceIds.includes(item.id)} onChange={event => setAllowanceIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}/><span><strong>{item.name}</strong><small>{item.source || "No source recorded"}</small></span><b>{usd(item.amount)}</b></label>) : <p>No reviewable or included allowances are recorded.</p>}</div>
            <ErrorSummary errors={errors}/>
            {clarificationsLoading && <p role="status">Loading written clarification answers…</p>}
            {clarificationsError && <div role="alert"><p>{clarificationsError} Reload before creating the award so written answers are included.</p><Button onClick={reloadClarifications}>Reload clarifications</Button></div>}
            <div className="award-submit"><div><AwardIcon size={20}/><span><strong>{selectedCandidate?.bidderName ?? "Choose a bidder"}</strong><small>{selectedAmount === null ? "Choose an available award value" : `${basisLabels[basis]} · ${usd(selectedAmount)}`}</small></span></div><Button variant="primary" disabled={!selectedCandidateId || clarificationsLoading || !!clarificationsError} onClick={makeAward}>Create award & Exhibit A<ArrowRight size={16}/></Button></div>
          </Panel>}
        </> : <>
          <section className="award-summary">
            <span className="award-summary-icon"><AwardIcon size={25}/></span>
            <div><small>{award.snapshot.packageCode} · {award.snapshot.packageName}</small><h2>{award.snapshot.company.name}</h2><p>{award.snapshot.company.contact} · {award.snapshot.company.email}</p></div>
            <div className="award-summary-value"><small>AWARD VALUE</small><strong>{usd(award.amount)}</strong><span>{basisLabels[award.basis]}</span></div>
            <Badge tone={stage === "executed" ? "green" : stage === "cancelled" ? "red" : "amber"}>{stage ? stageLabels[stage] : "Awarded"}</Badge>
            {stage !== "executed" && <button className="award-cancel" onClick={() => { setCancelOpen(true); setCancelReason(""); setErrors({}); }}>Cancel award</button>}
          </section>

          {stage && <div className="award-flow">{flow.map((label, index) => <div className={index < stageIndex(stage) ? "done" : index === stageIndex(stage) ? "current" : ""} key={label}><span>{index < stageIndex(stage) ? <Check size={14}/> : index + 1}</span><strong>{label}</strong></div>)}</div>}
          <Tabs tabs={["Exhibit A", "Comments", "All other exhibits", "Subcontract", "Activity"]} value={tab} onChange={setTab}/>
          <ErrorSummary errors={errors}/>

          {tab === "Exhibit A" && currentRevision && <div className="award-document-layout">
            <Panel title={`Exhibit A · Revision ${currentRevision.number}`} subtitle={`${currentRevision.template.name} · Created ${stamp(currentRevision.createdAt)}`} action={<Badge tone={award.exhibit.status === "agreed" ? "green" : "amber"}>{award.exhibit.status.replaceAll("-", " ")}</Badge>}>
              <div className="award-document-actions">
                <Button onClick={() => downloadText(`${slug(award.snapshot.packageName)}-exhibit-a-rev-${currentRevision.number}.txt`, renderDocumentText(currentRevision.content))}><Download size={15}/>Download</Button>
                {award.exhibit.status !== "agreed" && <ContractScopeDraft key={award.id} award={award} save={(content,note) => perform(current => reviseExhibit(current, award.id, content, note, actor), "Reviewed Section 3 saved as a new revision.", () => setRevisionNumber(0))}/>}{award.exhibit.status !== "agreed" && <Button onClick={openEditor}><PenLine size={15}/>Create revision</Button>}
                {award.exhibit.status !== "agreed" && award.exhibit.status !== "shared" && <Button variant="primary" onClick={() => perform(current => shareExhibit(current, award.id), "Exhibit A share recorded. No email was sent.")}><Send size={15}/>{award.exhibit.status === "changes-requested" ? "Reshare revision" : "Share for review"}</Button>}
                {award.exhibit.status === "shared" && <><Button onClick={() => openComment("changes")}><MessageSquare size={15}/>Request changes</Button><Button variant="primary" onClick={() => { setAgreementName(award.snapshot.company.contact); setAgreementParty("subcontractor"); setAgreementOpen(true); setErrors({}); }}><Check size={15}/>Record agreement</Button></>}
              </div>
              <DocumentPreview company={award.contractFiles?.company} content={currentRevision.content} status={`EXHIBIT A · REV ${currentRevision.number}`}/>
            </Panel>
            <aside className="award-document-side">
              <Panel title="Revision history" subtitle={`${award.exhibit.revisions.length} saved revision${award.exhibit.revisions.length === 1 ? "" : "s"}`}>
                <div className="award-revisions">{[...award.exhibit.revisions].reverse().map(revision => <button className={revision.number === currentRevision.number ? "active" : ""} key={revision.number} onClick={() => setRevisionNumber(revision.number)}><span><History size={15}/></span><span><strong>Revision {revision.number}</strong><small>{revision.note || "No revision note"}</small><small>{revision.createdBy} · {stamp(revision.createdAt)}</small></span></button>)}</div>
              </Panel>
              <Panel title="Award snapshot" subtitle="Frozen when the bidder was selected."><dl className="award-facts"><div><dt>Bid form</dt><dd>Version {award.snapshot.formVersion}</dd></div><div><dt>Bid revision</dt><dd>{award.revisionNumber}</dd></div><div><dt>Scope responses</dt><dd>{award.snapshot.scope.length}</dd></div><div><dt>Exclusions</dt><dd>{award.snapshot.scope.filter(item => item.answer === "N").length + award.snapshot.exclusions.length}</dd></div><div><dt>Allowances</dt><dd>{award.snapshot.allowances.length}</dd></div><div><dt>Owner</dt><dd>{award.snapshot.packageOwner}</dd></div></dl></Panel>
              {award.exhibit.agreement && <div className="award-agreement"><ShieldCheck size={20}/><div><strong>Revision {award.exhibit.agreement.revisionNumber} agreed</strong><small>{award.exhibit.agreement.by} · {stamp(award.exhibit.agreement.at)}</small></div></div>}
            </aside>
          </div>}

          {tab === "All other exhibits" && <OtherExhibits key={award.id} award={award} save={files => perform(current => setContractFiles(current, award.id, files), "Contract package saved. Regenerate an existing draft to include the latest files.")}/>}

          {tab === "Comments" && <Panel title="Exhibit A comments" subtitle="Record both sides of the review in one timeline." action={award.exhibit.status !== "agreed" ? <Button variant="primary" onClick={() => openComment("comment")}><Plus size={15}/>Add comment</Button> : <Badge tone="green">Locked after agreement</Badge>}>
            <div className="award-comments">{award.exhibit.comments.map(comment => <article className={comment.resolved ? "resolved" : ""} key={comment.id}><span className={`award-comment-avatar ${comment.party}`}>{comment.author.slice(0, 1).toUpperCase()}</span><div><header><span><strong>{comment.author}</strong><Badge tone={comment.party === "contractor" ? "blue" : "amber"}>{comment.party}</Badge><Badge tone={comment.resolved ? "green" : "red"}>{comment.resolved ? "Resolved" : "Open"}</Badge></span><small>Revision {comment.revisionNumber} · {stamp(comment.at)}</small></header><p>{comment.text}</p>{comment.resolved && <small>Resolved by {comment.resolvedBy} · {stamp(comment.resolvedAt)}</small>}</div>{award.exhibit.status !== "agreed" && <Button onClick={() => perform(current => setCommentResolved(current, award.id, comment.id, !comment.resolved, actor), comment.resolved ? "Comment reopened." : "Comment resolved.")}>{comment.resolved ? "Reopen" : "Resolve"}</Button>}</article>)}</div>
            {!award.exhibit.comments.length && <Empty title="No comments yet" description="Share Exhibit A, then record questions and decisions from either party." action={award.exhibit.status !== "agreed" ? <Button onClick={() => openComment("comment")}>Add first comment</Button> : undefined}/>} 
            {award.exhibit.status === "shared" && <div className="award-comment-footer"><span>{unresolvedComments(award).length} unresolved comment{unresolvedComments(award).length === 1 ? "" : "s"}</span><Button onClick={() => openComment("changes")}>Record subcontractor change request</Button></div>}
          </Panel>}

          {tab === "Subcontract" && <>
            {award.exhibit.status !== "agreed" ? <Panel><Empty title="Agree Exhibit A first" description="The subcontract incorporates the agreed Exhibit A revision. Resolve comments and record agreement before generating it." action={<Button onClick={() => setTab("Exhibit A")}>Review Exhibit A<ArrowRight size={15}/></Button>}/></Panel> : !award.subcontract ? <Panel><Empty title="Exhibit A is agreed" description="Generate the complete subcontract using the agreed scope and selected award amount." action={<Button variant="primary" onClick={() => { setContractorName(company.name || "General contractor"); setContractorOpen(true); setErrors({}); }}>Generate subcontract<FileText size={15}/></Button>}/></Panel> : <div className="award-document-layout">
              <Panel title="Subcontract agreement" subtitle={`${award.subcontract.template.name} · Exhibit A revision ${award.subcontract.exhibitRevision}`} action={<Badge tone={award.subcontract.status === "executed" ? "green" : "amber"}>{award.subcontract.status.replaceAll("-", " ")}</Badge>}>
                <div className="award-document-actions">
                  <Button onClick={() => downloadText(`${slug(award.snapshot.packageName)}-${award.subcontract!.status === "executed" ? "executed-" : ""}subcontract.txt`, award.subcontract!.executedCopy ?? renderDocumentText(award.subcontract!.content))}><Download size={15}/>Download {award.subcontract.status === "executed" ? "executed copy" : "draft"}</Button>
                  {award.subcontract.status === "draft" && <><Button onClick={() => { setContractorName(award.subcontract?.contractorName || company.name || "General contractor"); setContractorOpen(true); }}><PenLine size={15}/>Regenerate</Button><Button variant="primary" onClick={() => perform(current => sendSubcontract(current, award.id), "Signature request recorded. No email was sent.")}><Send size={15}/>Send for signature</Button></>}
                  {award.subcontract.status === "signature-pending" && <Button variant="primary" onClick={() => openSignature("subcontractor")}><Signature size={15}/>Record subcontractor signature</Button>}
                  {award.subcontract.status === "subcontractor-signed" && <Button variant="primary" onClick={() => openSignature("contractor")}><Signature size={15}/>Countersign</Button>}
                  {award.subcontract.status === "countersigned" && <Button variant="primary" onClick={() => perform(current => executeSubcontract(current, award.id), "Subcontract executed and final copy frozen.")}><FileCheck2 size={15}/>Execute subcontract</Button>}
                </div>
                {award.subcontract.attachments && <div className="contract-file-row"><h3>Attached originals</h3><p><AssetLink asset={award.subcontract.attachments.company.form}/></p>{Object.entries(award.subcontract.attachments.files).map(([code, asset]) => <p key={code}>Exhibit {code}: <AssetLink asset={asset}/></p>)}</div>}<DocumentPreview company={award.subcontract.attachments?.company} content={award.subcontract.content} status={award.subcontract.status === "executed" ? "EXECUTED" : "SUBCONTRACT"}/>
              </Panel>
              <aside className="award-document-side"><Panel title="Signature status"><div className="award-signatures">
                <div className={award.subcontract.subcontractorSignature ? "signed" : ""}><span><Signature size={18}/></span><div><strong>Subcontractor</strong>{award.subcontract.subcontractorSignature ? <><p>{award.subcontract.subcontractorSignature.name} · {award.subcontract.subcontractorSignature.title || "Title not recorded"}</p><small>{award.subcontract.subcontractorSignature.email} · {stamp(award.subcontract.subcontractorSignature.signedAt)}</small></> : <small>Awaiting signature</small>}</div></div>
                <div className={award.subcontract.contractorSignature ? "signed" : ""}><span><Signature size={18}/></span><div><strong>General contractor</strong>{award.subcontract.contractorSignature ? <><p>{award.subcontract.contractorSignature.name} · {award.subcontract.contractorSignature.title || "Title not recorded"}</p><small>{award.subcontract.contractorSignature.email} · {stamp(award.subcontract.contractorSignature.signedAt)}</small></> : <small>Signs after the subcontractor</small>}</div></div>
              </div></Panel>{award.subcontract.status === "executed" && <div className="award-executed"><CheckCircle2 size={22}/><div><strong>Subcontract executed</strong><small>{stamp(award.subcontract.executedAt)} · Final copy is frozen</small></div></div>}</aside>
            </div>}
          </>}

          {tab === "Activity" && <Panel title="Recorded contract activity" subtitle="Notifications stay in this browser; nothing here was emailed." action={state.notifications.some(note => note.awardId === award.id && !note.read) ? <Button onClick={() => { const ids = state.notifications.filter(note => note.awardId === award.id && !note.read).map(note => note.id); perform(current => markAwardNotificationsRead(current, ids), "Contract notifications marked read."); }}>Mark all read</Button> : <Badge tone="green">All read</Badge>}>
            <div className="award-activity">{[...state.notifications].filter(note => note.awardId === award.id).reverse().map(note => <article className={note.read ? "read" : ""} key={note.id}><span><Bell size={16}/></span><div><strong>{note.text}</strong><p>{note.recipientType === "team" ? `Project team · ${note.recipient}` : award.snapshot.company.name}</p><small>{stamp(note.at)}</small></div><Badge tone={note.read ? "neutral" : "blue"}>{note.read ? "Read" : "New"}</Badge></article>)}</div>
            {!state.notifications.some(note => note.awardId === award.id) && <Empty title="No recorded activity yet" description="Sharing Exhibit A or sending the subcontract will create a local notification record."/>}
          </Panel>}
        </>}
      </main>
    </div>

    {editDocument && award && <Modal title="Create Exhibit A revision" subtitle={`Revision ${award.exhibit.revisions.length + 1} will return the document to draft.`} onClose={() => setEditDocument(null)} wide><form onSubmit={saveRevision}>
      <label className="ui-field"><span>Document title</span><input required value={editDocument.content.title} onChange={event => setEditDocument(current => current ? { ...current, content: { ...current.content, title: event.target.value } } : current)}/></label>
      <div className="award-section-editor">{editDocument.content.sections.map((section, index) => <section key={index}><header><strong>Section {index + 1}</strong><button type="button" aria-label={`Remove section ${index + 1}`} onClick={() => setEditDocument(current => current ? { ...current, content: { ...current.content, sections: current.content.sections.filter((_, itemIndex) => itemIndex !== index) } } : current)}><Trash2 size={14}/></button></header><label className="ui-field"><span>Heading</span><input required value={section.heading} onChange={event => setEditDocument(current => current ? { ...current, content: { ...current.content, sections: current.content.sections.map((item, itemIndex) => itemIndex === index ? { ...item, heading: event.target.value } : item) } } : current)}/></label><label className="ui-field"><span>Lines · one per paragraph</span><textarea rows={5} value={section.lines.join("\n")} onChange={event => setEditDocument(current => current ? { ...current, content: { ...current.content, sections: current.content.sections.map((item, itemIndex) => itemIndex === index ? { ...item, lines: event.target.value.split("\n") } : item) } } : current)}/></label></section>)}</div>
      <Button onClick={() => setEditDocument(current => current ? { ...current, content: { ...current.content, sections: [...current.content.sections, { heading: "", lines: [] }] } } : current)}><Plus size={14}/>Add section</Button>
      <label className="ui-field"><span>Revision note</span><input value={editDocument.note} onChange={event => setEditDocument(current => current ? { ...current, note: event.target.value } : current)} placeholder="What changed in this revision?"/></label>
      <ErrorSummary errors={errors}/><div className="award-modal-actions"><Button onClick={() => setEditDocument(null)}>Cancel</Button><Button type="submit" variant="primary">Create revision</Button></div>
    </form></Modal>}

    {commentMode && award && <Modal title={commentMode === "changes" ? "Request Exhibit A changes" : "Add Exhibit A comment"} subtitle={commentMode === "changes" ? "This records the subcontractor's request and returns the exhibit to changes requested." : `Comment on revision ${latestExhibit(award).number}.`} onClose={() => setCommentMode(null)}><form onSubmit={saveComment}>
      {commentMode === "comment" && <label className="ui-field"><span>Commenting party</span><select value={commentParty} onChange={event => { const party = event.target.value as Party; setCommentParty(party); setCommentAuthor(party === "subcontractor" ? award.snapshot.company.contact : actor); }}><option value="contractor">Contractor</option><option value="subcontractor">Subcontractor</option></select></label>}
      <label className="ui-field"><span>Author</span><input required value={commentAuthor} onChange={event => setCommentAuthor(event.target.value)}/></label>
      <label className="ui-field"><span>{commentMode === "changes" ? "Requested change" : "Comment"}</span><textarea required rows={5} value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Reference the clause or scope item and record the requested decision."/></label>
      <ErrorSummary errors={errors}/><div className="award-modal-actions"><Button onClick={() => setCommentMode(null)}>Cancel</Button><Button type="submit" variant="primary">{commentMode === "changes" ? "Record change request" : "Add comment"}</Button></div>
    </form></Modal>}

    {agreementOpen && award && <Modal title="Record Exhibit A agreement" subtitle={`Revision ${latestExhibit(award).number} will be locked and used in the subcontract.`} onClose={() => setAgreementOpen(false)}><form onSubmit={event => { event.preventDefault(); perform(current => agreeExhibit(current, award.id, agreementName, agreementParty), "Exhibit A agreement recorded.", () => setAgreementOpen(false)); }}>
      <label className="ui-field"><span>Agreeing party</span><select value={agreementParty} onChange={event => setAgreementParty(event.target.value as Party)}><option value="subcontractor">Subcontractor</option><option value="contractor">Contractor</option></select></label>
      <label className="ui-field"><span>Name</span><input required value={agreementName} onChange={event => setAgreementName(event.target.value)}/></label>
      <ErrorSummary errors={errors}/><div className="award-modal-actions"><Button onClick={() => setAgreementOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Agree revision</Button></div>
    </form></Modal>}

    {contractorOpen && award && <Modal title={award.subcontract ? "Regenerate subcontract" : "Generate subcontract"} subtitle="The agreed Exhibit A revision and award value will be attached." onClose={() => setContractorOpen(false)}><form onSubmit={event => { event.preventDefault(); if (!award.contractFiles) { setErrors({ subcontract: "Prepare All other exhibits before generating the subcontract." }); setContractorOpen(false); setTab("All other exhibits"); return; } perform(current => generateSubcontract(current, award.id, contractorName, actor, undefined, undefined, award.subcontract?.template ?? templateFor(company, "subcontract", DEFAULT_SUBCONTRACT_TEMPLATE)), "Subcontract draft generated.", () => setContractorOpen(false)); }}>
      <label className="ui-field"><span>General contractor legal name</span><input required value={contractorName} onChange={event => setContractorName(event.target.value)}/></label>
      <div className="award-modal-note"><FileText size={17}/><span>The current template is identified inside the generated document. Review every term before signature.</span></div>
      <ErrorSummary errors={errors}/><div className="award-modal-actions"><Button onClick={() => setContractorOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Generate draft</Button></div>
    </form></Modal>}

    {signatureParty && award && <Modal title={signatureParty === "subcontractor" ? "Record subcontractor signature" : "Countersign subcontract"} subtitle="Typed signature for this browser demo; this is not an e-signature integration." onClose={() => setSignatureParty(null)}><form onSubmit={event => { event.preventDefault(); perform(current => signSubcontract(current, award.id, signatureParty, signer), signatureParty === "subcontractor" ? "Subcontractor signature recorded." : "Contractor countersignature recorded.", () => setSignatureParty(null)); }}>
      <label className="ui-field"><span>Signer name</span><input required value={signer.name} onChange={event => setSigner(current => ({ ...current, name: event.target.value }))}/></label>
      <label className="ui-field"><span>Title</span><input value={signer.title} onChange={event => setSigner(current => ({ ...current, title: event.target.value }))}/></label>
      <label className="ui-field"><span>Email</span><input required type="email" value={signer.email} onChange={event => setSigner(current => ({ ...current, email: event.target.value }))}/></label>
      <ErrorSummary errors={errors}/><div className="award-modal-actions"><Button onClick={() => setSignatureParty(null)}>Cancel</Button><Button type="submit" variant="primary"><Signature size={15}/>Record signature</Button></div>
    </form></Modal>}

    {cancelOpen && award && <Modal title="Cancel this award?" subtitle="The package can be awarded again. Executed subcontracts cannot be cancelled here." onClose={() => setCancelOpen(false)}><form onSubmit={event => { event.preventDefault(); perform(current => cancelAward(current, award.id, cancelReason, actor), "Award cancelled; the package is available for a new selection.", () => setCancelOpen(false)); }}>
      <label className="ui-field"><span>Reason</span><textarea required rows={4} value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="Record why the award is being cancelled."/></label>
      <ErrorSummary errors={errors}/><div className="award-modal-actions"><Button onClick={() => setCancelOpen(false)}>Keep award</Button><Button type="submit" variant="primary">Cancel award</Button></div>
    </form></Modal>}
  </div>;
}

"use client";

import { useState, type FormEvent } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { applyBlockers, discardReading, editReading, readingCorrections, setReadAnswer, type ProposalReading, type ReadingContent } from "../../lib/proposal-extraction";
import { useProposals } from "../../lib/use-proposals";
import { useLocalDraft } from "../../lib/use-local-draft";
import { initialBidders } from "../../lib/data/commercial";
import { ANSWERS, type ScopeAnswer, type SubmissionIssue } from "../../lib/submissions";
import type { Citation } from "../../lib/extraction";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, usd, type ViewProps } from "./shared";
import { EstimatorSubmissions } from "./submission-ui";
import { SourcePdf } from "./source-pdf";
import "./proposal-review.css";

type Review = ReturnType<typeof useProposals>;
const lineText = (value: string) => value.split("\n").map(text => text.trim()).filter(Boolean);
const editable = (c: ReadingContent) => ({ baseBid: c.baseBid, responses: c.responses.map(({ scopeItemId, answer, note }) => ({ scopeItemId, answer, note })), exclusions: c.exclusions.map(l => l.text), clarifications: c.clarifications.map(l => l.text), alternates: c.alternates.map(({ kind, description, amount }) => ({ kind, description, amount })), submitter: c.submitter });

export function ProposalWorkspace({ projectName, notify, navigate, initialPackageId, onBack }: ViewProps & { initialPackageId: string; onBack: () => void }) {
  const review = useProposals();
  const [directory] = useLocalDraft("directory", initialBidders);
  const [packageId, setPackageId] = useState(initialPackageId);
  const [readingId, setReadingId] = useState<string | null>(null);
  const pkg = review.procurement.packages.find(p => p.id === packageId) ?? review.procurement.packages[0];
  const readings = review.proposals.readings.filter(r => r.packageId === pkg?.id);
  const reading = review.proposals.readings.find(r => r.id === readingId);
  return <div className="proc-view"><PageHeader eyebrow={`${projectName} / Bid management`} title="Proposal review" description="Check proposal readings before they become submitted bids." actions={<Button onClick={onBack}>Back to bid packages</Button>}/>
    {pkg ? <><label className="ui-field">Trade package<select value={pkg.id} onChange={e => setPackageId(e.target.value)}>{review.procurement.packages.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
      <Panel title={`${pkg.name} · Proposal readings`}><div className="proposal-reading-list">{readings.map(r => <article key={r.id}><strong>{directory.find(b => b.id === r.bidderId)?.company ?? r.bidderId}</strong><small>{r.document.name} · Bid form v{r.formVersion}</small><Badge tone={r.status === "pending-review" ? "amber" : r.status === "applied" ? "green" : "neutral"}>{r.status === "pending-review" ? "Needs review" : r.status === "applied" ? `Applied · revision ${r.applied?.revisionNumber}` : "Discarded"}</Badge>{r.engine.mode === "sample" && <PreviewNote>Illustrative sample — no proposal was read.</PreviewNote>}<Button onClick={() => setReadingId(r.id)}><FileText size={14}/>{r.status === "pending-review" ? "Review proposal" : "View reviewed proposal"}</Button></article>)}</div>{!readings.length && <Empty title="No proposal readings for this trade" description="Completed proposal readings will appear here for review before submission."/>}</Panel>
      <Panel title="Submitted bid revisions" subtitle="Confirmed proposals appear here immediately."><EstimatorSubmissions packageId={pkg.id} procurement={review.procurement} submissions={review.submissions} directory={directory}/></Panel>
    </> : <Empty title="No bid packages yet" description="Proposal review begins after a trade form is published and a company is invited."/>}
    {reading && <ProposalReview key={reading.id} reading={reading} review={review} company={directory.find(b => b.id === reading.bidderId)?.company ?? reading.bidderId} by="Marcel Khoury" notify={notify} onClose={() => setReadingId(null)} onLeveling={() => navigate("leveling")}/>}
  </div>;
}

function ReadingSnapshot({ content, titles }: { content: ReadingContent; titles: Map<string, string> }) {
  return <div className="proposal-snapshot"><strong>Base bid: {content.baseBid === null ? "Not stated" : usd(content.baseBid)}</strong>{content.responses.map(row => <p key={row.scopeItemId}>{titles.get(row.scopeItemId) ?? row.scopeItemId}: <b>{row.answer ?? "Not stated"}</b>{row.note && ` · ${row.note}`}</p>)}{content.exclusions.map((line, i) => <p key={`e${i}`}>Exclusion: {line.text}</p>)}{content.clarifications.map((line, i) => <p key={`c${i}`}>Clarification: {line.text}</p>)}{content.alternates.map((a, i) => <p key={`a${i}`}>{a.kind} alternate: {a.description} · {usd(a.amount)}</p>)}<p>Contact: {content.submitter?.name} · {content.submitter?.email}</p></div>;
}

export function ProposalReview({ reading, review, company, by, notify, onClose, onLeveling }: { reading: ProposalReading; review: Review; company: string; by: string; notify: ViewProps["notify"]; onClose: () => void; onLeveling: () => void }) {
  const [content, setContent] = useState(reading.content);
  const [exclusions, setExclusions] = useState(reading.content.exclusions.map(l => l.text).join("\n"));
  const [clarifications, setClarifications] = useState(reading.content.clarifications.map(l => l.text).join("\n"));
  const [citation, setCitation] = useState<Citation | null>([...reading.content.baseBidCitations, ...reading.content.responses.flatMap(r => r.citations), ...reading.content.exclusions.flatMap(l => l.citations), ...reading.content.clarifications.flatMap(l => l.citations), ...reading.content.alternates.flatMap(a => a.citations)][0] ?? null);
  const [page, setPage] = useState(citation?.page ?? 1);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<SubmissionIssue[]>([]);
  const [discard, setDiscard] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const pending = reading.status === "pending-review";
  const patch = { ...editable(content), exclusions: lineText(exclusions), clarifications: lineText(clarifications) };
  const dirty = JSON.stringify(patch) !== JSON.stringify(editable(reading.content));
  const blockers = pending ? applyBlockers(review, reading.id, review.projectId) : [];
  const pkg = review.procurement.packages.find(p => p.id === reading.packageId);
  const titles = new Map(pkg?.published?.items.map(item => [item.id, item.title]) ?? []);
  const corrections = readingCorrections(reading);
  const changed = corrections.baseBid || corrections.answers.length > 0 || corrections.exclusions || corrections.clarifications || corrections.alternates || corrections.submitter;

  function citations(values: Citation[], modified = false) {
    return modified ? <small className="proposal-correction">Unsaved correction</small> : values.length ? <div className="ext-citations">{values.map((cite, index) => <button type="button" key={index} onClick={() => { setCitation(cite); setPage(cite.page); }}><FileText size={12}/>Source · p. {cite.page}</button>)}</div> : <small className="proposal-correction">Estimator correction · no source quote</small>;
  }
  function save(event: FormEvent) {
    event.preventDefault();
    let nextContent = content;
    const message = review.run(current => {
      let next = editReading(current, reading.id, { baseBid: patch.baseBid, exclusions: patch.exclusions, clarifications: patch.clarifications, alternates: patch.alternates, submitter: patch.submitter }, by);
      for (const row of patch.responses) next = setReadAnswer(next, reading.id, row.scopeItemId, row.answer, row.note, by);
      nextContent = next.readings.find(r => r.id === reading.id)!.content;
      return next;
    });
    if (message) setError(message); else { setContent(nextContent); setExclusions(nextContent.exclusions.map(l => l.text).join("\n")); setClarifications(nextContent.clarifications.map(l => l.text).join("\n")); setError(""); setIssues([]); notify("Proposal corrections saved. Review and confirm the revision when ready."); }
  }
  return <Modal title="Review proposal" subtitle={`${company} · ${pkg?.name ?? reading.packageId} · Bid form v${reading.formVersion}`} onClose={onClose} wide>
    {reading.engine.mode === "sample" && <PreviewNote>Illustrative sample — this file, text, price and page references are invented. No proposal was read.</PreviewNote>}
    <div className="proposal-status"><Badge tone={pending ? "amber" : reading.status === "applied" ? "green" : "neutral"}>{pending ? "Needs review" : reading.status === "applied" ? `Applied as revision ${reading.applied?.revisionNumber}` : "Discarded"}</Badge>{changed && <Badge tone="blue">Corrected by estimator</Badge>}<span>{reading.document.name} · {reading.document.pages} pages</span></div>
    <div className="proposal-layout"><div className="proposal-content">
      {pending ? <form onSubmit={save}>
        <label className="ui-field">Base bid · USD<input type="number" min="0.01" step="0.01" value={content.baseBid ?? ""} onChange={e => setContent({ ...content, baseBid: e.target.value ? Number(e.target.value) : null })}/></label>{citations(reading.content.baseBidCitations, content.baseBid !== reading.content.baseBid)}
        <h3>Bid-form answers</h3><p className="proc-modal-note">Y included · N excluded · P partial · N/A not applicable. Partial and N/A answers require a note.</p>
        {content.responses.map((row, index) => <div className="proposal-answer" key={row.scopeItemId}><strong>{titles.get(row.scopeItemId) ?? row.scopeItemId}</strong><label className="ui-field">Answer for item {index + 1}<select value={row.answer ?? ""} onChange={e => setContent({ ...content, responses: content.responses.map(r => r.scopeItemId === row.scopeItemId ? { ...r, answer: (e.target.value || null) as ScopeAnswer | null } : r) })}><option value="">Not stated</option>{ANSWERS.map(answer => <option key={answer}>{answer}</option>)}</select></label><label className="ui-field">Note for item {index + 1}<textarea maxLength={4000} rows={2} value={row.note} onChange={e => setContent({ ...content, responses: content.responses.map(r => r.scopeItemId === row.scopeItemId ? { ...r, note: e.target.value } : r) })}/></label>{citations(reading.content.responses[index]?.citations ?? [], row.answer !== reading.content.responses[index]?.answer || row.note !== reading.content.responses[index]?.note)}{issues.filter(issue => issue.scopeItemId === row.scopeItemId).map((issue, i) => <p role="alert" className="proc-source-error" key={i}>{issue.message}</p>)}</div>)}
        <label className="ui-field">Exclusions · one per line<textarea rows={3} value={exclusions} onChange={e => setExclusions(e.target.value)}/></label>{reading.content.exclusions.map((line, i) => <div key={i}>{citations(line.citations, JSON.stringify(lineText(exclusions)) !== JSON.stringify(reading.content.exclusions.map(l => l.text)))}</div>)}
        <label className="ui-field">Clarifications · one per line<textarea rows={3} value={clarifications} onChange={e => setClarifications(e.target.value)}/></label>{reading.content.clarifications.map((line, i) => <div key={i}>{citations(line.citations, JSON.stringify(lineText(clarifications)) !== JSON.stringify(reading.content.clarifications.map(l => l.text)))}</div>)}
        <h3>Alternates</h3>{content.alternates.map((a, index) => <div className="proposal-alternate" key={index}><label className="ui-field">Alternate {index + 1} type<select value={a.kind} onChange={e => setContent({ ...content, alternates: content.alternates.map((x, i) => i === index ? { ...x, kind: e.target.value as typeof a.kind } : x) })}><option value="add">Add</option><option value="deduct">Deduct</option></select></label><label className="ui-field">Alternate {index + 1} amount<input type="number" min="0.01" step="0.01" required value={a.amount || ""} onChange={e => setContent({ ...content, alternates: content.alternates.map((x, i) => i === index ? { ...x, amount: Number(e.target.value) } : x) })}/></label><label className="ui-field">Alternate {index + 1} description<input required maxLength={1000} value={a.description} onChange={e => setContent({ ...content, alternates: content.alternates.map((x, i) => i === index ? { ...x, description: e.target.value } : x) })}/></label>{citations(a.citations, JSON.stringify(editable(content).alternates[index]) !== JSON.stringify(editable(reading.content).alternates[index]))}<button type="button" className="ui-icon-btn" aria-label={`Remove alternate ${index + 1}`} onClick={() => setContent({ ...content, alternates: content.alternates.filter((_, i) => i !== index) })}><Trash2 size={14}/></button></div>)}<Button onClick={() => setContent({ ...content, alternates: [...content.alternates, { kind: "add", description: "", amount: 0, citations: [] }] })}><Plus size={14}/>Add alternate</Button>
        <h3>Proposal contact</h3><label className="ui-field">Contact name<input maxLength={200} value={content.submitter?.name ?? ""} onChange={e => setContent({ ...content, submitter: { name: e.target.value, email: content.submitter?.email ?? "" } })}/></label><label className="ui-field">Contact email<input type="email" maxLength={200} value={content.submitter?.email ?? ""} onChange={e => setContent({ ...content, submitter: { email: e.target.value, name: content.submitter?.name ?? "" } })}/></label>
        {error && <p className="proc-source-error" role="alert">{error}</p>}<div className="proc-form-actions"><Button type="submit" disabled={!dirty}>Save corrections</Button></div>
      </form> : <><ReadingSnapshot content={reading.content} titles={titles}/>{reading.discardReason && <p>Discarded: {reading.discardReason}</p>}{citations(reading.content.baseBidCitations)}{[...reading.content.responses, ...reading.content.exclusions, ...reading.content.clarifications, ...reading.content.alternates].map((item, i) => <div key={i}>{citations(item.citations)}</div>)}</>}
      {reading.original && <details className="ext-original"><summary>Original AI reading</summary><ReadingSnapshot content={reading.original} titles={titles}/></details>}
      <details className="ext-history"><summary>Review history</summary><ul>{reading.history.map((event, i) => <li key={i}>{event.kind}{event.kind === "edited" ? `: ${event.fields.join(", ")}` : event.kind === "discarded" ? `: ${event.reason}` : ""}<small>{event.by} · {new Date(event.at).toLocaleString("en-US")}</small></li>)}</ul></details>
    </div><aside className="proposal-source"><h3>Source document</h3><p>{reading.document.name} · page {page}</p>{citation && <blockquote className="proc-citation-quote"><strong>Cited text · page {citation.page}</strong><p>{citation.quote}</p></blockquote>}<SourcePdf page={page} range={{ first: 1, last: reading.document.pages }} onPageChange={setPage}/></aside></div>
    {pending ? <div className="proposal-confirm">
      {dirty ? <p>Save your corrections before confirming the revision.</p> : blockers.length > 0 && <ul>{blockers.map((message, i) => <li key={i}>{message}</li>)}</ul>}
      {issues.filter(issue => !issue.scopeItemId).map((issue, i) => <p className="proc-source-error" role="alert" key={i}>{issue.message}</p>)}
      <p>Confirming submits the company’s next bid revision and makes it available in Bid leveling. File details are recorded; the PDF is not uploaded.</p>
      <div className="proc-form-actions"><Button onClick={() => setDiscard(!discard)}>Discard reading</Button><Button variant="primary" disabled={dirty || blockers.length > 0 || discard} onClick={() => { const result = review.apply(reading.id, by); setIssues(result); if (!result.length) notify("Proposal confirmed and submitted as a bid revision. It is ready to load in Bid leveling."); }}>Confirm and submit revision</Button></div>
      {discard && <form className="proposal-discard" onSubmit={e => { e.preventDefault(); const message = review.run(current => discardReading(current, reading.id, discardReason, by)); if (message) setError(message); else { notify("Proposal reading discarded with its reason retained."); setDiscard(false); } }}><label className="ui-field">Why discard this reading?<textarea required rows={2} maxLength={600} value={discardReason} onChange={e => setDiscardReason(e.target.value)}/></label><Button onClick={() => setDiscard(false)}>Cancel discard</Button><Button type="submit">Discard with reason</Button></form>}
    </div> : reading.status === "applied" && <div className="proc-form-actions"><Button variant="primary" onClick={onLeveling}>Open Bid leveling</Button></div>}
  </Modal>;
}

"use client";
import { useState } from "react";
import { Check, MoveRight, RotateCcw, Trash2, X } from "lucide-react";
import { deleteDraft, editDraft, notOnSheet, rejectDraft, reopenDraft, type Citation, type Draft } from "../../lib/extraction";
import { inlineDrafts } from "../../lib/scope-review";
import type { useExtraction } from "../../lib/use-extraction";
import type { SpecSection } from "../../lib/data/preconstruction";
import { findingCitationSources, findingTitle, IMAGE_CHECK_NOTES } from "./extraction-citations";
import { ScopeSourceDialog } from "./scope-source-dialog";
import { Badge, Button, Modal } from "./shared";

export function InlineScopeDrafts({ review, packageId, query, sections, colors, by, notify, onMove }: {
  review: ReturnType<typeof useExtraction>; packageId: string; query: string; sections: SpecSection[]; colors: Map<string,string>; by: string; notify: (text: string) => void; onMove: (packageId: string) => void;
}) {
  const [moving, setMoving] = useState<Draft | null>(null);
  const [destination, setDestination] = useState("");
  const [source, setSource] = useState<{draft: Draft; citation: Citation} | null>(null);
  const drafts = inlineDrafts(review.extraction.drafts, packageId).filter(d => findingTitle(d).toLowerCase().includes(query.toLowerCase()));
  const act = (message: string | null, success: string) => { notify(message || success); return !message; };
  return <>
    {drafts.map(draft => <article className={`proc-scope-row proc-ai-line ${draft.status}`} key={draft.id}>
      <button className={`proc-approval ${draft.status === "accepted" ? "approved" : "draft"}`} disabled={draft.status === "accepted"} aria-label={`${draft.status === "rejected" ? "Restore" : "Accept"} ${findingTitle(draft)}`} onClick={() => act(draft.status === "rejected" ? review.run(s => reopenDraft(s, draft.id, by)) : review.accept(draft.id, by), "Scope review saved.")}>{draft.status === "rejected" ? <RotateCcw size={14}/> : <Check size={14}/>}</button>
      <div className="proc-scope-copy"><span className="proc-scope-meta"><Badge tone={draft.status === "accepted" ? "green" : draft.status === "rejected" ? "neutral" : "blue"}>{draft.status === "accepted" ? "Accepted" : draft.status === "rejected" ? "Rejected" : "AI proposed"}</Badge>{review.extraction.runs.find(r => r.id === draft.runId)?.engine.mode === "sample" && <Badge tone="amber">Illustrative sample</Badge>}{draft.kind !== "scope" && <Badge>{draft.kind === "region" ? "Drawing region" : "Quantity"}</Badge>}{draft.status === "pending-review" && notOnSheet(draft) && <Badge tone="amber">Not on the sheet</Badge>}</span><strong>{findingTitle(draft)}</strong>{draft.status === "pending-review" && notOnSheet(draft) && <small className="proc-ai-flag">{IMAGE_CHECK_NOTES["not-printed"]}</small>}{draft.kind === "quantity" && <small>{draft.quantity.toLocaleString()} {draft.unit} · {draft.basis}</small>}{draft.citations.map((citation,index) => <button type="button" className="proc-citation-link" key={index} onClick={() => setSource({draft,citation})}>{citation.sheet || citation.document} · p. {citation.page}</button>)}</div>
      <div className="proc-inline-actions">{draft.status === "pending-review" && <><button className="ui-icon-btn" aria-label={`Reject ${findingTitle(draft)}`} title="Reject" onClick={() => act(review.run(s => rejectDraft(s, draft.id, "not-required", "", by)), "Scope proposal rejected.")}><X size={15}/></button><button className="ui-icon-btn" aria-label={`Move ${findingTitle(draft)}`} title="Move trade" onClick={() => { setMoving(draft); setDestination(review.procurement.packages.find(p => p.id !== packageId)?.id || ""); }}><MoveRight size={15}/></button></>}{draft.status !== "accepted" && <button className="ui-icon-btn" aria-label={`Delete ${findingTitle(draft)}`} title="Delete proposal" onClick={() => act(review.run(s => deleteDraft(s,draft.id,by)), "Proposal removed. The source and review history are retained.")}><Trash2 size={15}/></button>}</div>
    </article>)}
    {moving && <Modal title="Move proposed scope" subtitle={findingTitle(moving)} onClose={() => setMoving(null)}><label className="ui-field">Destination trade<select value={destination} onChange={e => setDestination(e.target.value)}>{review.procurement.packages.filter(p => p.id !== packageId).map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label><div className="proc-form-actions"><Button onClick={() => setMoving(null)}>Cancel</Button><Button variant="primary" disabled={!destination} onClick={() => { if(act(review.run(s => editDraft(s,review.procurement,moving.id,{packageId:destination},by)),"Proposal moved for review.")){setMoving(null);onMove(destination);} }}>Move trade</Button></div></Modal>}
    {source && <ScopeSourceDialog title={findingTitle(source.draft)} sources={findingCitationSources(source.draft,source.citation,review.flip,sections)} kind={source.citation.sheet ? "drawings" : "spec"} colors={colors} citation={source.citation} sample={review.extraction.runs.find(r => r.id === source.draft.runId)?.engine.mode === "sample"} onClose={() => setSource(null)}/>}
  </>;
}

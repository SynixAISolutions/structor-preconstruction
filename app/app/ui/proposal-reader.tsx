"use client";

import { useEffect, useRef, useState } from "react";
import { readProposal, type ProposalReadResult } from "../../lib/ai-client";
import type { Procurement } from "../../lib/procurement";
import type { ProposalState } from "../../lib/proposal-extraction";
import { MAX_ATTACHMENT_BYTES } from "../../lib/submissions";
import { getActiveProjectId } from "../../lib/project-scope";
import { AiPdfPicker, type LoadedPdf } from "./ai-pdf-picker";
import { Button } from "./shared";

export function ProposalReader({ pkg, invitations, proposals, companies, onRead }: {
  pkg: Procurement["packages"][number]; invitations: Procurement["invitations"]; proposals: ProposalState; companies: Map<string, string>; onRead: (result: ProposalReadResult, file: File) => string | null;
}) {
  const [invitationId, setInvitationId] = useState("");
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dropped, setDropped] = useState<ProposalReadResult["dropped"]>([]);
  const [progress, setProgress] = useState("");
  const controller = useRef<AbortController | null>(null);
  const request = useRef(0), running = useRef(false);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  const available = invitations.filter(i => i.packageId === pkg.id && i.status !== "declined");
  const invitation = available.find(i => i.id === invitationId);
  const pending = proposals.readings.some(r => r.invitationId === invitationId && r.status === "pending-review");
  async function read() {
    if (!pdf || !pkg.published || !invitation || pending || running.current) return;
    running.current = true;
    const projectId = getActiveProjectId();
    const current = ++request.current;
    controller.current = new AbortController();
    setBusy(true); setError(""); setDropped([]); setProgress("");
    try {
      const result = await readProposal({ invitationId: invitation.id, form: pkg.published, proposal: pdf.text, signal: controller.current.signal, onProgress: (done, total) => { if (current === request.current) setProgress(`${done} of ${total} bid-form batches read`); } });
      if (current !== request.current || projectId !== getActiveProjectId()) return;
      const message = onRead(result, pdf.file);
      if (message) throw new Error(message);
      setDropped(result.dropped);
    } catch (failure) { if (current === request.current) setError(failure instanceof Error && failure.name === "AbortError" ? "Proposal reading canceled. Nothing was applied." : failure instanceof Error ? failure.message : "The proposal reading failed. Try again."); }
    finally { if (current === request.current) { running.current = false; setBusy(false); } }
  }
  return <div className="ai-reader">
    <h3>Read proposal PDF</h3><p>Map an invited company’s proposal to the published bid form, then check it before submitting a revision.</p>
    {!pkg.published ? <p>Publish this trade’s bid form before reading a proposal.</p> : !available.length ? <p>Invite a company to this trade before reading its proposal.</p> : <>
      <label className="ui-field">Invited company<select disabled={busy} value={invitationId} onChange={e => { setInvitationId(e.target.value); setError(""); setDropped([]); }}><option value="">Choose the company that sent this proposal</option>{available.map(i => <option key={i.id} value={i.id}>{companies.get(i.bidderId) ?? i.bidderId}</option>)}</select></label>
      {pending && <p>There is already a proposal waiting for review for this company. Confirm or discard it before reading another.</p>}
      <AiPdfPicker label="Proposal PDF" disabled={busy} maxBytes={MAX_ATTACHMENT_BYTES} onChange={loaded => { setPdf(loaded); setError(""); setDropped([]); }}/>
      <p className="ai-privacy">The PDF stays in this browser. Running AI sends its readable text and the published bid-form items to DeepSeek. The reading and citations are saved here; choose the PDF again after a reload.</p>
      <Button variant="primary" disabled={busy || !pdf || !invitation || pending} onClick={read}>{busy ? "Reading proposal…" : "Read proposal for review"}</Button>
    </>}
    {busy && <p role="status">Reading the proposal against bid form v{pkg.published?.version}… {progress} <Button onClick={() => controller.current?.abort()}>Stop reading</Button></p>}
    {error && <p role="alert" className="proc-source-error">{error}</p>}
    {dropped.length > 0 && <details className="ai-run-result"><summary>Screening notes ({dropped.length}) · check omitted values</summary><ul>{dropped.map((drop, i) => <li key={i}>{drop.what}: {drop.reason}</li>)}</ul></details>}
  </div>;
}

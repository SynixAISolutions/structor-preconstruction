"use client";

import { Download, RefreshCw, Send } from "lucide-react";
import type { SubcontractEnvelope } from "../../lib/award";
import { canCheck, envelopeDead, envelopeLive, nextCheckAt, type DocusignSetup, type EnvelopeSigners, type SignerInput } from "../../lib/docusign";
import { signedCopyUrl } from "../../lib/docusign-client";
import { Badge, Button, Panel } from "./shared";

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const STATUS: Record<string, { label: string; tone: string }> = { sent: { label: "Sent", tone: "amber" }, delivered: { label: "Viewed by all signers", tone: "amber" }, signed: { label: "Signed", tone: "blue" }, completed: { label: "Completed", tone: "green" }, declined: { label: "Declined", tone: "red" }, voided: { label: "Voided", tone: "red" } };

/** Who signs in DocuSign: the subcontractor first, then the countersigner. */
export function SignerFields({ value, onChange }: { value: EnvelopeSigners; onChange: (value: EnvelopeSigners) => void }) {
  const row = (who: keyof EnvelopeSigners, label: string) => {
    const set = (changes: Partial<SignerInput>) => onChange({ ...value, [who]: { ...value[who], ...changes } });
    return <fieldset className="award-signer-row"><legend>{label}</legend>
      <label className="ui-field"><span>Name</span><input required maxLength={100} value={value[who].name} onChange={event => set({ name: event.target.value })}/></label>
      <label className="ui-field"><span>Email</span><input required type="email" maxLength={100} value={value[who].email} onChange={event => set({ email: event.target.value })}/></label>
    </fieldset>;
  };
  return <div className="award-signers">{row("subcontractor", "Subcontractor signs first")}{row("contractor", "General contractor countersigns")}</div>;
}

/** Says when a send is only recorded here, and what's needed to connect DocuSign. */
export function DocusignSetupNote({ setup }: { setup: DocusignSetup }) {
  if (setup.ready) return null;
  if (setup.consentUrl) return <p className="award-package-missing" role="note">DocuSign needs one-time permission for this app before it can send. <a href={setup.consentUrl} target="_blank" rel="noreferrer">Grant access in DocuSign</a>, then reload this page.</p>;
  if (setup.configured) return <p className="award-package-missing" role="note">DocuSign is set up but can't send: {setup.problem} Until that's fixed, sending only records it here.</p>;
  return <p className="award-modal-note-plain">DocuSign isn&apos;t connected, so sending only records it here: nobody is emailed, and signatures are typed by hand.</p>;
}

/** Where the envelope stands, with DocuSign's limit on how often that can be read. */
export function DocusignPanel({ envelope, signed, checking, ready, onCheck, onResend }: { envelope: SubcontractEnvelope; signed: boolean; checking: boolean; ready: boolean; onCheck: () => void; onResend: () => void }) {
  const status = STATUS[envelope.status] ?? { label: envelope.status, tone: "neutral" };
  const live = envelopeLive(envelope.status);
  const allowed = canCheck(envelope.checkedAt);
  const next = signed ? envelope.signers.contractor : envelope.signers.subcontractor;
  return <Panel title="DocuSign" action={<Badge tone={status.tone}>{status.label}</Badge>}>
    <div className="award-docusign">
      {live && <p>With <strong>{next.name}</strong> to sign ({next.email}).</p>}
      {envelope.problem && <p className="award-package-missing" role="alert">{envelope.problem}</p>}
      <small>Sent {time(envelope.sentAt)} by {envelope.sentBy} · last checked {time(envelope.checkedAt)}</small>
      {live && <div className="award-docusign-actions"><Button disabled={!ready || checking || !allowed} onClick={onCheck}><RefreshCw size={14}/>{checking ? "Checking…" : "Check status"}</Button>{!allowed && <small>DocuSign allows a check every 15 minutes. Next at {time(nextCheckAt(envelope.checkedAt))}.</small>}</div>}
      {envelopeDead(envelope.status) && <Button variant="primary" disabled={!ready} onClick={onResend}><Send size={14}/>Send again</Button>}
      {envelope.status === "completed" && <a className="ui-btn" href={signedCopyUrl(envelope.envelopeId)}><Download size={14}/>Signed PDF</a>}
    </div>
  </Panel>;
}

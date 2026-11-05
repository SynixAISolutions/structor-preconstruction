// DocuSign for subcontract signatures (Marcel, 22 Oct, Contracts & exhibits: "the only important thing that we need to
// focus on is we use DocuSign"). What the browser and the server share: the request to send a package, the envelope as
// DocuSign words it, and how often its status may be read. The calls themselves are in lib/docusign-server. Pure.

import type { DocumentContent } from "./award";
import { assetId, type DocumentAsset } from "./document-assets";

export type SignerInput = { name: string; email: string };
/** The subcontractor signs first, then the contractor countersigns, as the contract flow has always run. */
export type EnvelopeSigners = { subcontractor: SignerInput; contractor: SignerInput };
export type EnvelopeRequest = { subject: string; contractorName: string; subcontractorName: string; documents: DocumentContent[]; assets: DocumentAsset[]; signers: EnvelopeSigners };

export type EnvelopeSigner = { routingOrder: number; name: string; email: string; status: string; signedAt: string | null; declinedReason: string };
export type Envelope = { id: string; status: string; signers: EnvelopeSigner[]; completedAt: string | null; voidedReason: string };

/** What the app knows about the connection. `ready` means an envelope can be sent now. */
export type DocusignSetup = { configured: boolean; ready: boolean; consentUrl?: string; problem?: string };

// One status request per envelope every 15 minutes is DocuSign's own limit.
export const CHECK_EVERY_MINUTES = 15;
export const canCheck = (checkedAt: string, now = new Date().toISOString()) => Date.parse(now) - Date.parse(checkedAt) >= CHECK_EVERY_MINUTES * 60_000;
export const nextCheckAt = (checkedAt: string) => new Date(Date.parse(checkedAt) + CHECK_EVERY_MINUTES * 60_000).toISOString();

const FINISHED = new Set(["completed", "declined", "voided"]);
/** Still out with its signers, so it can be signed, and needs voiding if the award is cancelled. */
export const envelopeLive = (status: string) => !FINISHED.has(status);
/** Declined or voided: nobody can sign it any more, so a new envelope is needed. */
export const envelopeDead = (status: string) => status === "declined" || status === "voided";

export const isEnvelopeId = (id: string) => /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DOCUMENT_CHARS = 2_000_000, MAX_ASSETS = 12;
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function signer(value: unknown, who: string): SignerInput {
  const o = (value ?? {}) as Record<string, unknown>;
  const name = text(o.name, 100), email = text(o.email, 100);
  if (!name) throw new Error(`Enter the ${who}'s signer name.`);
  if (!EMAIL.test(email)) throw new Error(`Enter the ${who}'s signer email address.`);
  return { name, email };
}

/** A request from the browser, checked before anything is sent to anyone. Throws with a message fit to show. */
export function parseEnvelopeRequest(raw: unknown): EnvelopeRequest {
  const o = (raw ?? {}) as Record<string, unknown>;
  const signers = (o.signers ?? {}) as Record<string, unknown>;
  const subcontractor = signer(signers.subcontractor, "subcontractor"), contractor = signer(signers.contractor, "contractor");
  if (subcontractor.email.toLowerCase() === contractor.email.toLowerCase()) throw new Error("The subcontractor and the contractor need different signers.");
  const documents = (Array.isArray(o.documents) ? o.documents : []).slice(0, 4).map((d): DocumentContent => {
    const doc = (d ?? {}) as Record<string, unknown>;
    return { title: text(doc.title, 300), sections: (Array.isArray(doc.sections) ? doc.sections : []).map(s => {
      const section = (s ?? {}) as Record<string, unknown>;
      return { heading: text(section.heading, 300), lines: (Array.isArray(section.lines) ? section.lines : []).filter((l): l is string => typeof l === "string") };
    }) };
  });
  if (!documents.length || documents.some(d => !d.title || !d.sections.length)) throw new Error("The subcontract has no content to send.");
  if (JSON.stringify(documents).length > MAX_DOCUMENT_CHARS) throw new Error("The subcontract is too long to send.");
  const assets = (Array.isArray(o.assets) ? o.assets : []).map(a => a as DocumentAsset);
  if (assets.length > MAX_ASSETS || assets.some(a => !assetId(String(a?.id)) || !text(a?.name, 180))) throw new Error("An attachment is invalid. Upload it again.");
  const contractorName = text(o.contractorName, 200), subcontractorName = text(o.subcontractorName, 200);
  if (!contractorName || !subcontractorName) throw new Error("The subcontract needs both company names.");
  // DocuSign allows 100 characters in a subject.
  return { subject: text(o.subject, 100) || "Subcontract for signature", contractorName, subcontractorName, documents, assets: assets.map(a => ({ id: a.id, name: text(a.name, 180), type: String(a.type ?? ""), size: Number(a.size) || 0 })), signers: { subcontractor, contractor } };
}

// Words on the contract's signature page that DocuSign turns into its signing fields (lib/docusign-pdf).
export const ANCHORS = { subcontractor: { sign: "/sn1/", date: "/ds1/" }, contractor: { sign: "/sn2/", date: "/ds2/" } } as const;

const tabs = (who: keyof typeof ANCHORS) => ({
  signHereTabs: [{ anchorString: ANCHORS[who].sign, anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "0" }],
  dateSignedTabs: [{ anchorString: ANCHORS[who].date, anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "0" }],
});

/** The envelope to create: the contract first (it holds the signature page), then the attached originals. */
export function envelopeBody(request: EnvelopeRequest, contractBase64: string, attachments: { name: string; extension: string; base64: string }[]) {
  return {
    emailSubject: request.subject, status: "sent",
    documents: [
      { documentBase64: contractBase64, name: `${request.subject}.pdf`, fileExtension: "pdf", documentId: "1" },
      ...attachments.map((a, i) => ({ documentBase64: a.base64, name: a.name, fileExtension: a.extension, documentId: String(i + 2) })),
    ],
    recipients: { signers: [
      { ...request.signers.subcontractor, recipientId: "1", routingOrder: "1", tabs: tabs("subcontractor") },
      { ...request.signers.contractor, recipientId: "2", routingOrder: "2", tabs: tabs("contractor") },
    ] },
  };
}

/** An envelope as DocuSign returns it, with what the contract flow needs. */
export function readEnvelope(raw: unknown): Envelope {
  const o = (raw ?? {}) as Record<string, any>;
  const signers = (Array.isArray(o.recipients?.signers) ? o.recipients.signers : []).map((s: Record<string, unknown>): EnvelopeSigner => ({
    routingOrder: Number(s.routingOrder) || 0, name: text(s.name, 100), email: text(s.email, 100), status: text(s.status, 40),
    signedAt: text(s.signedDateTime, 40) || null, declinedReason: text(s.declinedReason, 500),
  })).sort((a: EnvelopeSigner, b: EnvelopeSigner) => a.routingOrder - b.routingOrder);
  return { id: text(o.envelopeId, 60), status: text(o.status, 40), signers, completedAt: text(o.completedDateTime, 40) || null, voidedReason: text(o.voidedReason, 200) };
}

/** Whether a signer has signed, in DocuSign's words for it. */
export const signerSigned = (s: EnvelopeSigner | undefined) => s?.status === "completed" || s?.status === "signed";

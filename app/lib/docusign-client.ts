"use client";

import { useEffect, useState } from "react";
import type { DocusignSetup, Envelope, EnvelopeRequest } from "./docusign";

/** Whether DocuSign is connected. Until it answers, or if it can't, the app behaves as if it isn't. */
export function useDocusign(): DocusignSetup {
  const [setup, setSetup] = useState<DocusignSetup>({ configured: false, ready: false });
  useEffect(() => {
    let live = true;
    void fetch("/api/docusign").then(r => r.ok ? r.json() as Promise<DocusignSetup> : null).then(answer => { if (live && answer) setSetup(answer); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return setup;
}

async function answer<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "DocuSign could not be reached. Try again.");
  return body as T;
}

export const sendEnvelope = async (request: EnvelopeRequest) =>
  answer<{ envelopeId: string; status: string }>(await fetch("/api/docusign/envelopes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }));

export const readEnvelopeStatus = async (id: string) =>
  answer<Envelope>(await fetch(`/api/docusign/envelopes/${encodeURIComponent(id)}`, { cache: "no-store" }));

export const voidEnvelopeNow = async (id: string, reason: string) =>
  answer<{ ok: boolean }>(await fetch(`/api/docusign/envelopes/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }));

export const signedCopyUrl = (id: string) => `/api/docusign/envelopes/${encodeURIComponent(id)}/document`;

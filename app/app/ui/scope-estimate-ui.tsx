"use client";

import { useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import { queueScopeEstimate, priceScopeDraft, scopeDraftBlocker, type ScopeEstimateDraft } from "../../lib/scope-estimate";
import { useLocalDraft } from "../../lib/use-local-draft";
import type { Procurement, ScopeItem } from "../../lib/procurement";
import type { useEstimate } from "../../lib/use-estimate";
import { Badge, Button, Empty, Modal, Panel, type ViewProps } from "./shared";
import { estimateMoney } from "./estimate-format";
import "./workflow-features.css";

export function AddScopeToEstimate({ procurement, scope, packageId, notify, navigate }: { procurement: Procurement; scope: ScopeItem; packageId: string } & Pick<ViewProps, "notify" | "navigate">) {
  const [drafts, setDrafts] = useLocalDraft<ScopeEstimateDraft[]>("scope-estimate-drafts", []);
  const added = drafts.some(d => d.scopeId === scope.id && d.packageId === packageId);
  return <><Button disabled={scope.status !== "approved" || added} onClick={() => {
    try { setDrafts(queueScopeEstimate(drafts, procurement, packageId, scope.id, "Marcel Khoury")); notify("Added to estimate drafts. Enter the quantity, unit and rate in Quantity takeoffs."); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "The draft could not be added."); }
  }}>{added ? "Queued for estimate" : "Add to estimate"}</Button>{added && <Button onClick={() => navigate("takeoffs")}>Open estimate drafts</Button>}{scope.status !== "approved" && <small>Approve the scope before adding it to the estimate.</small>}</>;
}

export function ScopeEstimateQueue({ estimate, packageId, notify, navigate, drafts, setDrafts }: { estimate: ReturnType<typeof useEstimate>; packageId: string; drafts: ScopeEstimateDraft[]; setDrafts: Dispatch<SetStateAction<ScopeEstimateDraft[]>> } & Pick<ViewProps, "notify" | "navigate">) {
  const [pricing, setPricing] = useState<ScopeEstimateDraft | null>(null);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(""), [unit, setUnit] = useState(""), [rate, setRate] = useState("");
  const pending = drafts.filter(d => d.packageId === packageId && !estimate.rows.some(r => r.origin?.kind === "scope" && r.origin.draftId === d.id));
  const amount = quantity.trim() && rate.trim() ? Number(quantity) * Number(rate) : null;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pricing) return;
    if (!quantity.trim() || !rate.trim() || !unit.trim()) { setError("Enter the missing quantity, unit and rate."); return; }
    try {
      const message = estimate.run(rows => priceScopeDraft(rows, estimate.procurement, pricing, { packageId, item: pricing.title, quantity: Number(quantity), unit, rate: Number(rate), source: pricing.source }));
      if (message) { setError(message); return; }
      setPricing(null); notify("Scope estimate item added for review. Its source remains linked.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be priced."); }
  }
  return <Panel title="Scope estimate drafts" subtitle="Reviewed responsibilities waiting for a measured quantity, unit and rate. They do not change the estimate total until priced.">{pending.map(d => { const blocker = scopeDraftBlocker(d, estimate.procurement); return <article key={d.id} className="scope-estimate-draft"><div><strong>{d.title}</strong><p>{d.source || "No source reference"}</p><Badge tone="amber">Quantity, unit and rate needed</Badge>{blocker && <small>{blocker}</small>}</div><section><Button disabled={!!blocker} onClick={() => { setPricing(d); setQuantity(""); setUnit(""); setRate(""); setError(""); }}>Price scope item</Button><Button onClick={() => setDrafts(current => current.filter(item => item.id !== d.id))}>Remove draft</Button></section></article>; })}{!pending.length && <Empty title="No pending scope estimate drafts" description="In Scopes & bid forms, select an approved requirement and choose Add to estimate." action={<Button onClick={() => navigate("scopes")}>Open scope review</Button>}/>}
    {pricing && <Modal title="Price scope estimate draft" subtitle={pricing.title} onClose={() => setPricing(null)}><form onSubmit={save}><p className="cost-source-note">{pricing.source || "Source not recorded"}</p><div className="ui-form-grid"><label className="ui-field">Measured quantity<input required type="number" min="0.000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)}/></label><label className="ui-field">Unit<input required placeholder="For example, SF" value={unit} onChange={e => setUnit(e.target.value)}/></label><label className="ui-field">Unit rate · USD<input required type="number" min="0" step="any" value={rate} onChange={e => setRate(e.target.value)}/></label></div><p>Item amount: <strong>{amount !== null && Number.isFinite(amount) ? estimateMoney(amount) : "Enter quantity and rate"}</strong></p>{rate.trim() && Number(rate) === 0 && <p className="cost-source-note">A zero rate remains marked unpriced.</p>}{error && <p role="alert">{error}</p>}<div className="proc-form-actions"><Button onClick={() => setPricing(null)}>Cancel</Button><Button type="submit" variant="primary">Add priced item</Button></div></form></Modal>}
  </Panel>;
}

"use client";

import { useState, type FormEvent } from "react";
import { Paperclip, Send } from "lucide-react";
import { Badge, Button, Empty, Panel, usd } from "./shared";
import { addVeIdea } from "../../lib/value-engineering";
import { useValueEngineering } from "../../lib/use-value-engineering";
import { uploadProjectPdf } from "../../lib/project-files-client";
import { useActiveProject } from "../../lib/project-scope";
import type { TradePackage } from "../../lib/procurement";

/**
 * Subcontractor VE (Marcel, 15 Oct): in the portal a sub proposes a value-engineering option, its
 * saving and the product data the owner needs to judge it. It joins the contractor's VE list as a
 * subcontractor idea; once the owner accepts, it lowers that trade's number in the budget.
 */
export function PortalVe({ company, pkg, notify }: { company: string; pkg: TradePackage; notify: (text: string) => void }) {
  const projectId = useActiveProject();
  const { state, run } = useValueEngineering();
  const [description, setDescription] = useState(""), [saving, setSaving] = useState(""), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const mine = state.ideas.filter(i => i.origin === "subcontractor" && i.source.startsWith(company));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(saving.replace(/[$,\s]/g, ""));
    if (!description.trim() || !(amount > 0)) { setError("Describe the option and enter the saving as a positive amount."); return; }
    setBusy(true); setError("");
    try {
      const doc = file ? await uploadProjectPdf({ projectId, file: new File([file], `VE - ${company} - ${file.name}`, { type: "application/pdf" }), category: "Other" }) : null;
      const errors = run(s => addVeIdea(s, { description: description.trim(), category: "Subcontractor VE", csiCode: pkg.code, packageId: pkg.id, source: `${company} (portal)`, origin: "subcontractor", costImpact: -Math.round(amount * 100) / 100, attachment: doc ? { docId: doc.id, name: doc.name } : null }, company));
      if (errors) { setError(Object.values(errors).join(" ")); return; }
      setDescription(""); setSaving(""); setFile(null);
      notify("VE option sent to the contractor with its product data.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The product data could not be stored."); }
    finally { setBusy(false); }
  }

  return <div className="sub-invitation-grid">
    <Panel title="Propose a value engineering option" subtitle={`${pkg.name} · the owner decides; nothing changes your bid until it is accepted`}>
      <form onSubmit={e => void submit(e)} className="sub-overview">
        <label className="ui-field">Option<textarea required rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Equal acoustical ceiling tile in lieu of the basis of design"/></label>
        <label className="ui-field">Saving to the owner (USD)<input required inputMode="decimal" value={saving} onChange={e => setSaving(e.target.value)} placeholder="25,000"/></label>
        <label className="ui-field">Product data (PDF)<input type="file" accept=".pdf,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
        {error && <p role="alert" className="sub-field-error">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}><Send size={14}/>{busy ? "Sending…" : "Send VE option"}</Button>
      </form>
    </Panel>
    <Panel title="Your VE options" subtitle={`${mine.length} sent`}>
      {mine.length ? <div className="sub-portal-submittals">{mine.map(idea => <article key={idea.id}><header><span><strong>{idea.number} · {idea.description}</strong><small>{usd(-idea.costImpact)} saving{idea.attachment ? ` · ${idea.attachment.name}` : ""}</small></span><Badge tone={idea.decision?.outcome === "accepted" ? "green" : idea.decision?.outcome === "rejected" ? "neutral" : "blue"}>{idea.decision ? idea.decision.outcome : "With the contractor"}</Badge></header>{idea.attachment && <small><Paperclip size={12}/> Product data attached</small>}</article>)}</div> : <Empty title="No VE options yet" description="Options you send appear here with the owner's decision."/>}
    </Panel>
  </div>;
}

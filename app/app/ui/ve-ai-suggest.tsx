"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge, Button, Modal, usd } from "./shared";
import { StoredDocumentViewer } from "./project-file-viewer";
import { aiJob } from "../../lib/ai-more-client";
import type { VeSuggestion } from "../../lib/ai-jobs-more";
import { addVeIdea, type VeErrors, type VeState } from "../../lib/value-engineering";
import type { BudgetState } from "../../lib/budget";
import type { Procurement } from "../../lib/procurement";
import { budgetLinesForTrade } from "../../lib/estimate";
import { findManual } from "../../lib/project-files";
import { readStoredText, useProjectDocuments } from "../../lib/project-files-client";
import { sectionsByTrade } from "../../lib/project-scopes";

/** "Basis-of-Design Product: …" lines from the manual sections of each trade (at most 3 a section). */
async function basisOfDesign(doc: NonNullable<ReturnType<typeof findManual>>, sections: { section: string; first: number; last: number }[]) {
  const out: { section: string; text: string }[] = [];
  for (const s of sections) {
    const pages = await readStoredText(doc, { first: s.first, last: s.last });
    const text = pages.map(p => p.text).join("\n").replace(/\s+/g, " ");
    const found = [...text.matchAll(/Basis-of-Design Product:?\s*(.{10,200}?)(?=\s[a-z]\.\s|\s\d\.\s|$)/gi)].slice(0, 3);
    for (const m of found) out.push({ section: s.section, text: m[1].trim() });
    if (out.length >= 60) break;
  }
  return out;
}

/**
 * Marcel, 15 Oct: "the AI needs to be able to suggest some value engineering options" — compare what
 * the trades cost with what the specifications call for and propose cheaper equals, with the math.
 * Suggestions join the VE list as AI ideas; they still go to subcontractors for pricing and to the owner.
 */
export function VeAiSuggest({ projectName, budget, procurement, run, notify }: { projectName: string; budget: BudgetState; procurement: Procurement; run: (action: (s: VeState) => VeState) => VeErrors | null; notify: (text: string) => void }) {
  const { documents } = useProjectDocuments();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [ideas, setIdeas] = useState<VeSuggestion[]>([]);
  const [chosen, setChosen] = useState<number[]>([]);
  const lines = procurement.packages.map(pkg => ({ packageId: pkg.id, trade: pkg.name, code: pkg.code, amount: budgetLinesForTrade(budget, pkg).lines.reduce((n, l) => n + (l.forecast ?? l.budget), 0) })).filter(l => l.amount > 0);

  async function suggest() {
    setIdeas([]); setChosen([]);
    try {
      const manual = findManual(documents);
      let products: { section: string; text: string }[] = [];
      if (manual) {
        setStatus("Reading basis-of-design products in the project manual…");
        const byTrade = sectionsByTrade(manual.sections, procurement.packages);
        products = await basisOfDesign(manual, lines.flatMap(l => byTrade.get(l.packageId) ?? []));
      }
      setStatus(`Asking the AI for value engineering options across ${lines.length} trades…`);
      const reply = await aiJob<{ ideas: VeSuggestion[] }>("ve-suggest", { project: projectName, lines, products });
      setIdeas(reply.ideas); setChosen(reply.ideas.map((_, i) => i));
      setStatus(reply.ideas.length ? "" : "No VE options were suggested. Check that the budget has trade costs.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "The AI could not suggest VE options."); }
  }

  function add() {
    for (const i of chosen) {
      const idea = ideas[i];
      const errors = run(state => addVeIdea(state, { description: idea.description, category: idea.category || "AI suggestions", csiCode: idea.csiCode || null, packageId: idea.packageId, source: idea.csiCode ? `Spec ${idea.csiCode}` : "AI suggestion", origin: "ai", costImpact: idea.costImpact, notes: idea.rationale }, "Structor AI"));
      if (errors) { notify(Object.values(errors)[0] ?? "An idea could not be added."); return; }
    }
    notify(`${chosen.length} AI VE option${chosen.length === 1 ? "" : "s"} added. Send them to subcontractors for pricing.`);
    setOpen(false);
  }

  const total = chosen.reduce((n, i) => n + ideas[i].costImpact, 0);
  return <>
    <Button onClick={() => { setOpen(true); if (!ideas.length) void suggest(); }}><Sparkles size={15}/>Suggest VE with AI</Button>
    {open && <Modal title="AI value engineering options" subtitle="From each trade's cost and the specified basis-of-design products. Each option still needs subcontractor pricing and owner acceptance." wide onClose={() => setOpen(false)}>
      {status && <p role="status" className="proc-modal-note">{status}</p>}
      {ideas.length > 0 && <>
        <div className="ai-section-list">{ideas.map((idea, i) => <label key={i}><input type="checkbox" checked={chosen.includes(i)} onChange={e => setChosen(e.target.checked ? [...chosen, i] : chosen.filter(x => x !== i))}/><span>
          <strong>{idea.description}</strong>
          <small>{procurement.packages.find(p => p.id === idea.packageId)?.name}{idea.csiCode ? ` · ${idea.csiCode}` : ""} · <Badge tone="green">{usd(idea.costImpact)}</Badge></small>
          <small>{idea.rationale}</small>
        </span></label>)}</div>
        <div className="proc-form-actions"><span className="intel-muted">{chosen.length} selected · {usd(total)} estimated</span><Button onClick={() => void suggest()}>Suggest again</Button><Button variant="primary" disabled={!chosen.length} onClick={add}>Add to the VE list</Button></div>
      </>}
    </Modal>}
  </>;
}

/** A subcontractor's product data for a VE idea, opened from Project files. */
export function VeProductData({ docId, name }: { docId: string; name: string }) {
  const { documents } = useProjectDocuments();
  const doc = documents.find(d => d.id === docId);
  const [open, setOpen] = useState(false), [page, setPage] = useState(1);
  return <p className="ve-notes"><strong>Product data:</strong> {name} {doc ? <Button onClick={() => setOpen(true)}>Open</Button> : <small>(loading…)</small>}
    {open && doc && <Modal title={doc.name} subtitle="Subcontractor product data" wide onClose={() => setOpen(false)}><StoredDocumentViewer doc={doc} page={page} onPageChange={setPage}/></Modal>}</p>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { Project } from "../../lib/projects";
import { applyRfpFacts, compareRfpFacts, type RfpComparison, type RfpFact } from "../../lib/rfp";
import { readRfpFacts } from "../../lib/project-files-client";
import type { StoredDocument } from "../../lib/project-files";
import { StoredDocumentViewer } from "./project-file-viewer";
import { Badge, Button, Modal } from "./shared";

export function RfpComparisonRows({ rows, selected, onSelect, onSource, sourceLabel = "RFP" }: { rows: RfpComparison["rows"]; selected: number[]; onSelect: (index: number, checked: boolean) => void; onSource: (page: number, quote: string) => void; sourceLabel?: string }) {
  return <div className="rfp-review-list">{rows.map((row, index) => <article className={`rfp-review-row ${row.conflict ? "conflict" : ""}`} key={`${row.field}-${index}`}>
    <label className="rfp-field-heading"><input type="checkbox" checked={selected.includes(index)} disabled={row.same} onChange={e => onSelect(index, e.target.checked)}/><strong>{row.label}</strong><Badge tone={row.same ? "green" : row.conflict ? "yellow" : "blue"}>{row.same ? "Already matches" : row.conflict ? "Different from current" : "New detail"}</Badge></label>
    <div className="rfp-value-pair"><div><small>CURRENT VALUE</small><p>{row.current || "Not recorded"}</p></div><div><small>FROM THE {sourceLabel.toUpperCase()}</small><p>{row.proposed}</p></div></div>
    <blockquote>“{row.quote}”</blockquote><button className="rfp-source" onClick={() => onSource(row.page, row.quote)}>View source · page {row.page}<ArrowUpRight size={12}/></button>
  </article>)}</div>;
}

export function RfpReview({ project, doc, onSave, onReviewed }: { project: Project; doc: StoredDocument; onSave: (project: Project) => void; onReviewed: () => string | null }) {
  const kind = doc.category === "Addenda" ? "addendum" : "RFP";
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [facts, setFacts] = useState<RfpFact[] | null>(null), [selected, setSelected] = useState<number[]>([]), [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState<{ page: number; quote: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const comparison = compareRfpFacts(project, facts ?? []);
  const needsConfirmation = comparison.issues.length > 0 || comparison.rows.some((row, i) => selected.includes(i) && row.conflict);
  async function read() {
    request.current = new AbortController(); setBusy(true); setError(""); setFacts(null); setOpen(true); setConfirmed(false);
    try {
      const found = await readRfpFacts(doc, request.current.signal);
      setFacts(found);
      const seen = new Set<string>();
      setSelected(compareRfpFacts(project, found).rows.flatMap((row, i) => { if (row.current || row.same || seen.has(row.field)) return []; seen.add(row.field); return [i]; }));
    } catch (error) { if (!request.current.signal.aborted) setError(error instanceof Error ? error.message : `The ${kind} could not be read. Try again.`); }
    finally { setBusy(false); }
  }
  function save() {
    const updated = applyRfpFacts(project, (facts ?? []).filter((_, i) => selected.includes(i)));
    const message = onReviewed();
    if (message) { setError(message); return; }
    onSave(updated); setOpen(false);
  }
  return <><Button disabled={busy} onClick={() => void read()}><Sparkles size={15}/>Read {kind} with AI</Button>
    {open && !source && <Modal title={`Review ${kind} details`} subtitle={`${doc.name} · version ${doc.revision}. Select the details to save; existing values are never replaced automatically.`} wide onClose={() => { request.current?.abort(); setOpen(false); }}>
      {busy && <p role="status">Reading project details and checking their source quotes…</p>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      {facts && <>{comparison.issues.length > 0 && <div className="rfp-warnings"><strong>Check before saving</strong><ul>{comparison.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
        {!facts.length && <p>No supported project details were found. You can finish the review without changing the project.</p>}
        <RfpComparisonRows rows={comparison.rows} selected={selected} sourceLabel={kind} onSelect={(index, checked) => { setConfirmed(false); setSelected(current => checked ? [...current.filter(i => facts[i].field !== facts[index].field), index] : current.filter(i => i !== index)); }} onSource={(page, quote) => setSource({ page, quote })}/>
        {needsConfirmation && <label className="setup-confirm-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I checked the conflicting values and warnings for the details I selected.</label>}
        <div className="proc-form-actions"><span>{selected.length} details selected</span><Button variant="primary" disabled={needsConfirmation && !confirmed} onClick={save}>{selected.length ? "Save selected details and finish review" : "Finish review without changes"}</Button></div>
      </>}
    </Modal>}
    {source && <Modal title={kind === "addendum" ? "Addendum source" : "RFP source"} subtitle={`Page ${source.page} · ${doc.name}`} wide onClose={() => setSource(null)}><blockquote>{source.quote}</blockquote><StoredDocumentViewer doc={doc} page={source.page} onPageChange={page => setSource(s => s && ({ ...s, page }))}/></Modal>}
  </>;
}

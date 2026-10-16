"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Modal } from "./shared";
import { aiJob } from "../../lib/ai-more-client";
import type { SubmittalFinding } from "../../lib/ai-jobs-more";
import { addRequirement, type SubmittalErrors, type SubmittalState } from "../../lib/submittals";
import type { Procurement } from "../../lib/procurement";
import { findManual, type StoredSection } from "../../lib/project-files";
import { readStoredText, useProjectDocuments } from "../../lib/project-files-client";
import { sectionsByTrade } from "../../lib/project-scopes";

type Found = SubmittalFinding & { section: string; sectionTitle: string; packageId: string; key: string };

/**
 * Marcel, 15 Oct: submittal packages "pull them from the project manual". For every specification
 * section of a trade, the AI reads its SUBMITTALS article in the stored manual and lists what must be
 * submitted, each with its page and quote; the estimator chooses which become requirements.
 */
export function SubmittalAiReader({ state, procurement, run, notify, by }: { state: SubmittalState; procurement: Procurement; run: (action: (s: SubmittalState) => SubmittalState) => SubmittalErrors | null; notify: (text: string) => void; by: string }) {
  const { documents } = useProjectDocuments();
  const manual = findManual(documents);
  const byTrade = useMemo(() => manual ? sectionsByTrade(manual.sections, procurement.packages) : new Map<string, StoredSection[]>(), [manual, procurement.packages]);
  const sections = [...byTrade.entries()].flatMap(([packageId, list]) => list.map(s => ({ ...s, packageId })));
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState("");
  const [found, setFound] = useState<Found[]>([]), [chosen, setChosen] = useState<string[]>([]);
  const existing = new Set(state.submittals.map(s => `${s.specSection}|${s.title.toLowerCase()}`));

  async function read() {
    if (!manual) return;
    setBusy(true); setFound([]); setChosen([]);
    const out: Found[] = [];
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (next < sections.length) {
        const s = sections[next++];
        try {
          const pages = (await readStoredText(manual, { first: s.first, last: Math.min(s.last, s.first + 5) })).filter(p => /SUBMITTALS/i.test(p.text)).slice(0, 3);
          if (pages.length) {
            const reply = await aiJob<{ items: SubmittalFinding[] }>("submittal-requirements", { section: s.section, title: s.title, pages });
            out.push(...reply.items.map(i => ({ ...i, section: s.section, sectionTitle: s.title, packageId: s.packageId, key: `${s.section}|${i.title.toLowerCase()}` })));
          }
        } catch { /* a failed section is reported by the count below */ }
        setProgress(`Read ${++done} of ${sections.length} sections · ${out.length} requirements found`);
      }
    }));
    out.sort((a, b) => a.section.localeCompare(b.section));
    setFound(out); setChosen(out.filter(f => !existing.has(f.key)).map(f => f.key)); setBusy(false);
  }

  function add() {
    let added = 0;
    for (const f of found.filter(x => chosen.includes(x.key) && !existing.has(x.key))) {
      const errors = run(s => addRequirement(s, procurement, { specSection: f.section, title: f.title, packageId: f.packageId, description: `${f.description} (manual p. ${f.page}: "${f.quote}")` }, by));
      if (errors) { notify(Object.values(errors)[0] ?? "A requirement could not be added."); return; }
      added++;
    }
    notify(`${added} submittal requirement${added === 1 ? "" : "s"} added from the project manual.`);
    setOpen(false);
  }

  if (!manual) return null;
  return <>
    <Button onClick={() => setOpen(true)}><Sparkles size={15}/>Read from the manual with AI</Button>
    {open && <Modal title="Submittal requirements from the project manual" subtitle={`${manual.name} · the SUBMITTALS article of ${sections.length} sections across the bid packages`} wide onClose={() => { if (!busy) setOpen(false); }}>
      {!found.length && !busy && <div className="proc-form-actions"><span className="intel-muted">About one AI request per section; each requirement keeps its page and quote.</span><Button variant="primary" onClick={() => void read()}>Read {sections.length} sections</Button></div>}
      {progress && <p role="status" className="proc-modal-note">{progress}</p>}
      {found.length > 0 && <>
        <div className="ai-section-list">{found.map(f => <label key={f.key}><input type="checkbox" disabled={existing.has(f.key)} checked={chosen.includes(f.key)} onChange={e => setChosen(e.target.checked ? [...chosen, f.key] : chosen.filter(k => k !== f.key))}/><span><strong>{f.section} · {f.title}</strong><small>{f.sectionTitle} · {procurement.packages.find(p => p.id === f.packageId)?.name} · manual p. {f.page}{existing.has(f.key) ? " · already in the log" : ""}</small><small>“{f.quote}”</small></span></label>)}</div>
        <div className="proc-form-actions"><span className="intel-muted">{chosen.length} selected</span><Button variant="primary" disabled={!chosen.length} onClick={add}>Add to the submittal log</Button></div>
      </>}
    </Modal>}
  </>;
}

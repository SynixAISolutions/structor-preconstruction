"use client";

import { useState } from "react";
import { ListPlus } from "lucide-react";
import { Badge, Button, Empty, Modal } from "./shared";
import { standardLines, type StandardLine } from "../../lib/memory";
import { memoryForScan } from "../../lib/memory-client";
import { tradeChecklists } from "../../lib/scope-checklist";
import type { ScopeItem, TradePackage } from "../../lib/procurement";
import "./memory.css";

// The contractor's standard lines for one trade: first its scope checklists (lib/scope-checklist tradeChecklists),
// every line in the checklist's own order and ticked, since the contractor puts that language on the trade every time
// (a line with blanks or a condition, "within ___ weeks", "[AS APPLICABLE]", waits unticked for the estimator);
// then what its imported bid forms give the trade (lib/memory standardLines), most-repeated first. Lines on two or more
// forms start ticked; a line from one form names it and waits to be ticked. Lines this bid form already has are left
// out. Nothing reaches the bid form until an estimator adds it, and an added line is a draft to approve like any other.

/** "jelleff rec live bid sheet xlsx" → "Jelleff Rec Live Bid Sheet". */
export const sheetLabel = (slug: string) => slug.replace(/\s+xls[xm]?$/i, "").replace(/\b\w/g, c => c.toUpperCase());

/** A line as it goes on the bid form. */
export type AddedLine = { title: string; detail: string; source: string };
type Offered = { key: string; text: string; note: string; detail?: string; excluded?: boolean; fillIn?: boolean; line: AddedLine };
type Group = { title: string; checklist: boolean; ticked: boolean; lines: Offered[] };

export function StandardLinesButton({ projectId, pkg, form, onAdd }: { projectId: string | null; pkg: TradePackage; form: ScopeItem[]; onAdd: (lines: AddedLine[]) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function show() {
    if (!projectId) return;
    setOpen(true); setGroups(null); setError("");
    const read = await memoryForScan(projectId);
    if (read.error) { setError(read.error); return; }
    const existing = form.map(item => `${item.title} ${item.detail}`);
    const checklists = tradeChecklists(read.entries, pkg, projectId, existing);
    const onChecklist = new Set(checklists.flatMap(c => c.lines.map(l => l.text.toLowerCase())));
    // A line the checklist already offers isn't offered again from a bid form.
    const lines = standardLines(read.entries, pkg, projectId, existing).filter(l => !onChecklist.has(l.text.toLowerCase()));
    const fromForms = (l: StandardLine): Offered => {
      const sheets = l.sheets.map(sheetLabel).join(", ");
      return { key: `form:${l.text}`, text: l.title, note: `${l.group ? `${l.group} · ` : ""}${sheets || "Your bid forms"}`,
        line: { title: l.title, detail: l.title === l.text ? l.group : "", source: `Your bid forms: ${sheets || "imported"}` } };
    };
    const found: Group[] = [
      // A checklist goes on whole, so its lines start ticked; one with blanks or a condition waits for the estimator.
      ...checklists.map((c, n) => ({ title: `Your scope checklist · ${c.name}`, checklist: true, ticked: true, lines: c.lines.map((l, i): Offered => ({
        key: `checklist:${n}:${i}`, text: l.title, detail: l.detail, excluded: l.excluded, fillIn: l.fillIn, note: "",
        line: { title: l.title, detail: l.detail, source: `Your scope checklist: ${c.name}` } })) })),
      { title: "On two or more of your bid forms", checklist: false, ticked: true, lines: lines.filter(l => l.sheets.length > 1).map(fromForms) },
      { title: "On one of your bid forms: check it applies to this project", checklist: false, ticked: false, lines: lines.filter(l => l.sheets.length <= 1).map(fromForms) },
    ].filter(g => g.lines.length);
    setGroups(found);
    setPicked(new Set(found.flatMap(g => g.ticked ? g.lines.filter(l => !l.fillIn).map(l => l.key) : [])));
  }
  const toggle = (key: string) => setPicked(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const tickAll = (keys: string[], on: boolean) => setPicked(prev => { const next = new Set(prev); for (const k of keys) { if (on) next.add(k); else next.delete(k); } return next; });

  return <>
    <Button onClick={() => void show()} disabled={!projectId}><ListPlus size={15}/>Your standard lines</Button>
    {open && <Modal title={`Your standard lines · ${pkg.name}`} subtitle="Your scope checklist for this trade and the lines your imported bid forms give it, less what this bid form already has. Added lines are drafts to approve." wide onClose={() => setOpen(false)}>
      <div className="standard-lines">
        {error ? <p role="alert" className="memory-error">{error}</p>
          : !groups ? <p role="status">Reading your checklists and bid forms…</p>
          : !groups.length ? <Empty title="Nothing to add" description="Every line your scope checklists and imported bid forms give this trade is already on this bid form, or none has been imported for it. Import them in AI memory."/>
          : groups.map(group => {
            const keys = group.lines.map(l => l.key), all = keys.every(k => picked.has(k));
            return <section key={group.title}>
              <h3>{group.title} <Badge>{group.lines.length}</Badge>
                {group.checklist && <button type="button" className="standard-lines-all" onClick={() => tickAll(keys, !all)}>{all ? "Untick all" : "Tick all"}</button>}</h3>
              <ul>{group.lines.map(line => <li key={line.key} className={line.excluded ? "excluded" : undefined}><label>
                <input type="checkbox" checked={picked.has(line.key)} onChange={() => toggle(line.key)}/>
                <span><strong>{line.text}</strong>{line.detail && <small className="standard-lines-detail">{line.detail}</small>}
                  {line.fillIn && <small className="standard-lines-fill">Has blanks or a condition: tick it once it applies, and fill it in on the bid form</small>}{line.note && <small>{line.note}</small>}</span>
              </label></li>)}</ul>
            </section>;
          })}
        <div className="proc-form-actions">
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!picked.size} onClick={() => { onAdd((groups ?? []).flatMap(g => g.lines.filter(l => picked.has(l.key)).map(l => l.line))); setOpen(false); }}><ListPlus size={15}/>Add {picked.size} line{picked.size === 1 ? "" : "s"} for review</Button>
        </div>
      </div>
    </Modal>}
  </>;
}

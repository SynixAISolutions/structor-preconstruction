"use client";

import { useState } from "react";
import { ListPlus } from "lucide-react";
import { Badge, Button, Empty, Modal } from "./shared";
import { standardLines, type StandardLine } from "../../lib/memory";
import { memoryForScan } from "../../lib/memory-client";
import type { ScopeItem, TradePackage } from "../../lib/procurement";
import "./memory.css";

// The contractor's standard lines for one trade (lib/memory standardLines): what its imported bid forms give the trade,
// most-repeated first, without what this bid form already has. Lines on two or more of its forms start ticked; a line
// from one form names it and waits to be ticked. Nothing reaches the bid form until an estimator adds it, and an added
// line is a draft to approve like any other.

/** "jelleff rec live bid sheet xlsx" → "Jelleff Rec Live Bid Sheet". */
export const sheetLabel = (slug: string) => slug.replace(/\s+xls[xm]?$/i, "").replace(/\b\w/g, c => c.toUpperCase());

export function StandardLinesButton({ projectId, pkg, form, onAdd }: { projectId: string | null; pkg: TradePackage; form: ScopeItem[]; onAdd: (lines: StandardLine[]) => void }) {
  const [lines, setLines] = useState<StandardLine[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function show() {
    if (!projectId) return;
    setOpen(true); setLines(null); setError("");
    const read = await memoryForScan(projectId);
    if (read.error) { setError(read.error); return; }
    const found = standardLines(read.entries, pkg, projectId, form.map(item => `${item.title} ${item.detail}`));
    setLines(found);
    setPicked(new Set(found.filter(l => l.sheets.length > 1).map(l => l.text)));
  }
  const toggle = (text: string) => setPicked(prev => { const next = new Set(prev); if (next.has(text)) next.delete(text); else next.add(text); return next; });
  const groups: [string, StandardLine[]][] = lines ? [
    ["On two or more of your bid forms", lines.filter(l => l.sheets.length > 1)],
    ["On one of your bid forms: check it applies to this project", lines.filter(l => l.sheets.length <= 1)],
  ] : [];

  return <>
    <Button onClick={() => void show()} disabled={!projectId}><ListPlus size={15}/>Your standard lines</Button>
    {open && <Modal title={`Your standard lines · ${pkg.name}`} subtitle="Lines your imported bid forms give this trade that this bid form doesn't have yet. Added lines are drafts to approve." wide onClose={() => setOpen(false)}>
      <div className="standard-lines">
        {error ? <p role="alert" className="memory-error">{error}</p>
          : !lines ? <p role="status">Reading your bid forms…</p>
          : !lines.length ? <Empty title="Nothing to add" description="Every line your imported bid forms give this trade is already on this bid form, or no bid form has been imported for it. Import one in AI memory."/>
          : groups.filter(([, list]) => list.length).map(([title, list]) => <section key={title}>
            <h3>{title} <Badge>{list.length}</Badge></h3>
            <ul>{list.map(line => <li key={line.text}><label>
              <input type="checkbox" checked={picked.has(line.text)} onChange={() => toggle(line.text)}/>
              <span><strong>{line.text}</strong><small>{line.group ? `${line.group} · ` : ""}{line.sheets.map(sheetLabel).join(", ") || "Your bid forms"}</small></span>
            </label></li>)}</ul>
          </section>)}
        <div className="proc-form-actions">
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!picked.size} onClick={() => { onAdd((lines ?? []).filter(l => picked.has(l.text))); setOpen(false); }}><ListPlus size={15}/>Add {picked.size} line{picked.size === 1 ? "" : "s"} for review</Button>
        </div>
      </div>
    </Modal>}
  </>;
}

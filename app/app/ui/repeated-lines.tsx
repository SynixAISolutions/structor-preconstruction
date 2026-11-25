"use client";

import { useState } from "react";
import { CopyMinus } from "lucide-react";
import { Button, Modal } from "./shared";
import { findRepeatedLines } from "../../lib/ai-more-client";
import { mergeable, repeatBatches, type RepeatGroup } from "../../lib/repeated-lines";
import type { ScopeItem, TradePackage } from "../../lib/procurement";
import "./repeated-lines.css";

/** Asks the AI which lines of a trade's bid form repeat one another, for an estimator to tick and merge (lib/repeated-lines). */
export function RepeatedLines({ pkg, items, merge, notify }: { pkg: TradePackage; items: ScopeItem[]; merge: (groups: RepeatGroup[]) => string | null; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [groups, setGroups] = useState<RepeatGroup[] | null>(null), [left, setLeft] = useState(0), [off, setOff] = useState<Set<string>>(new Set());
  const lines = items.filter(mergeable), byId = new Map(items.map(i => [i.id, i]));
  async function find() {
    setBusy(true); setError(""); setGroups(null); setOff(new Set());
    try {
      const result = await findRepeatedLines(pkg, repeatBatches(lines));
      setGroups(result.groups); setLeft(result.dropped.length);
      if (result.failed) setError(`${result.failed} of the requests failed, so some lines weren't compared. Try again.`);
    } catch (e) { setError(e instanceof Error ? e.message : "The lines couldn't be compared."); }
    finally { setBusy(false); }
  }
  const chosen = (groups ?? []).map(g => ({ keep: g.keep, same: g.same.filter(id => !off.has(id)) })).filter(g => g.same.length);
  const count = chosen.reduce((n, g) => n + g.same.length, 0);
  function apply() {
    const message = merge(chosen);
    if (message) { setError(message); return; }
    notify(`${count} repeated line${count === 1 ? "" : "s"} merged. Their sheets and wording are on the lines kept.`);
    setOpen(false); setGroups(null);
  }
  return <>
    <Button disabled={lines.length < 2} onClick={() => { setOpen(true); void find(); }}><CopyMinus size={15}/>Find repeated lines</Button>
    {open && <Modal title={`Repeated lines · ${pkg.name}`} subtitle="The same work written more than once. Nothing is merged until you choose." wide onClose={() => { if (!busy) setOpen(false); }}>
      <div className="repeats">
        {busy && <p role="status">The AI is comparing {lines.length} lines…</p>}
        {error && <p role="alert" className="repeats-error">{error}</p>}
        {groups && !groups.length && !busy && <p>No repeated lines found. Every line reads as its own work.</p>}
        {(groups ?? []).map(g => {
          const keep = byId.get(g.keep);
          if (!keep) return null;
          return <section className="repeats-group" key={g.keep}>
            <h3><span>Keep</span>{keep.title}<small>{keep.source}</small></h3>
            {g.same.map(id => { const line = byId.get(id); return line && <label key={id}><input type="checkbox" checked={!off.has(id)} onChange={e => setOff(current => { const next = new Set(current); if (e.target.checked) next.delete(id); else next.add(id); return next; })}/><span>{line.title}<small>{line.source}</small></span></label>; })}
          </section>;
        })}
        {left > 0 && <p className="repeats-note">{left} pair{left === 1 ? "" : "s"} left apart because their numbers, tags or conditions differ.</p>}
        <div className="proc-form-actions"><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={busy || !count} onClick={apply}>Merge {count || ""} line{count === 1 ? "" : "s"}</Button></div>
      </div>
    </Modal>}
  </>;
}

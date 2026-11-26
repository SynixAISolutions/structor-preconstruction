"use client";

// A trade's standard scope tab (Marcel's issues log, item 17): the contractor's scope checklist for the trade, as
// printed, put on the bid form of any project in one click, for one trade or every trade. Logic: lib/standard-scope.

import { useEffect, useState } from "react";
import { Check, ListPlus, Layers3 } from "lucide-react";
import { fetchMemory } from "../../lib/memory-client";
import { tradeTags, type MemoryEntry } from "../../lib/memory";
import { addStandardScope, missingStandard, standardScopeFor, type StandardLine } from "../../lib/standard-scope";
import type { Procurement, TradePackage } from "../../lib/procurement";
import type { useProcurement } from "../../lib/use-procurement";
import { Badge, Button, Empty } from "./shared";

type Run = ReturnType<typeof useProcurement>["run"];

/**
 * The trade's standard lines from the company's approved checklist entries in the AI memory. The memory gives at most
 * 500 entries a page and a trade's imports (bid sheets as well as checklists) can be more, so every page is read.
 */
async function loadStandard(pkg: Pick<TradePackage, "code" | "name">): Promise<StandardLine[]> {
  const entries: MemoryEntry[] = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const page = await fetchMemory({ status: ["approved"], origin: ["import"], trades: tradeTags(pkg), limit: 500, offset });
    entries.push(...page);
    if (page.length < 500) break;
  }
  return standardScopeFor(pkg, entries);
}

export function StandardScopePanel({ state, pkg, run, notify, by }: { state: Procurement; pkg: TradePackage; run: Run; notify: (message: string) => void; by: string }) {
  const [lines, setLines] = useState<StandardLine[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setLines(null); setError("");
    loadStandard(pkg).then(found => { if (live) setLines(found); }).catch((e: Error) => { if (live) setError(e.message || "The standard scope couldn't be loaded."); });
    return () => { live = false; };
  }, [pkg.id, pkg.code, pkg.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Empty title="The standard scope couldn't be loaded" description={error}/>;
  if (!lines) return <div className="std-scope"><p className="std-note">Loading {pkg.name}'s standard scope…</p></div>;
  if (!lines.length) return <Empty title={`No standard scope for ${pkg.name} yet`} description="Add the trade's scope checklist in AI memory (Workspace → AI memory). Its lines then show here on every project."/>;

  const missing = missingStandard(state, pkg.id, lines);
  const checklists = [...new Set(lines.map(l => l.checklist).filter(Boolean))];
  const fillIns = missing.filter(l => l.fillIn).length;

  function addHere() {
    let added = 0;
    const failed = run(current => { const r = addStandardScope(current, pkg.id, lines!, by); added = r.added; return r.state; });
    notify(failed ?? (added ? `${added} standard line${added === 1 ? "" : "s"} added to ${pkg.name}'s bid form${fillIns ? `; ${fillIns} to fill in for this project` : ""}.` : "The whole standard scope is already on this bid form."));
  }
  async function addEverywhere() {
    setBusy(true);
    let added = 0, trades = 0, failed: string | null = null;
    try {
      for (const p of state.packages) {
        const found = p.id === pkg.id ? lines! : await loadStandard(p);
        if (!found.length) continue;
        let n = 0;
        failed = run(current => { const r = addStandardScope(current, p.id, found, by); n = r.added; return r.state; });
        if (failed) break;
        if (n) { added += n; trades++; }
      }
    } catch (e) { failed = e instanceof Error ? e.message : "The standard scope couldn't be loaded."; }
    finally { setBusy(false); }
    notify(failed ?? (added ? `${added} standard lines added across ${trades} trade${trades === 1 ? "" : "s"}.` : "Every trade already has its standard scope."));
  }

  const group = (section: StandardLine["section"], title: string) => {
    const rows = lines.filter(l => l.section === section);
    return rows.length ? <section className="std-group"><h4>{title}<small>{rows.length}</small></h4><ul>{rows.map(l => {
      const on = !missing.includes(l);
      return <li key={l.key} className={on ? "on" : ""}><span className="std-mark" aria-label={on ? "On this bid form" : "Not on this bid form"}>{on ? <Check size={13}/> : null}</span>
        <span><strong>{section === "excludes" ? l.title.replace(/^Excluded:\s*/, "") : l.title}</strong>{l.detail && <small>{l.detail}</small>}</span>
        {l.fillIn && <Badge tone="amber">Fill in for this project</Badge>}</li>;
    })}</ul></section> : null;
  };

  return <div className="std-scope">
    <div className="std-head">
      <span className="std-icon"><Layers3 size={18}/></span>
      <div><h3>Standard scope · {pkg.name}</h3><p>From your scope checklist{checklists.length > 1 ? "s" : ""} {checklists.join(", ") || ""}: carried on every project, whatever the drawings show. {lines.length - missing.length} of {lines.length} lines are on this bid form.</p></div>
      <div className="std-actions">
        <Button variant="primary" onClick={addHere} disabled={!missing.length}><ListPlus size={15}/>{missing.length ? `Add ${missing.length} to this bid form` : "All on this bid form"}</Button>
        <Button onClick={addEverywhere} disabled={busy}>{busy ? "Adding…" : "Add standard scope to every trade"}</Button>
      </div>
    </div>
    {group("includes", "Carried by this trade")}
    {group("excludes", "Exclusions")}
    <p className="std-note">Added lines are approved and marked "Standard scope" on the bid form; lines with blanks stay drafts until this project's value is written in. Edit or remove any of them per project.</p>
  </div>;
}

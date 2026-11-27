"use client";

// A trade's standard scope tab (Marcel's issues log, item 17): the contractor's scope checklist for the trade, as
// printed, put on the bid form of any project in one click, for one trade or every trade. The trade's own checklist is
// ticked; other checklists from the same division (precast or playground surfacing under Concrete) are offered unticked
// for projects that have that work. Logic: lib/standard-scope.

import { useEffect, useState } from "react";
import { Check, ListPlus, Layers3 } from "lucide-react";
import { fetchMemory } from "../../lib/memory-client";
import { tradeTags, type MemoryEntry } from "../../lib/memory";
import { addStandardScope, checklistGroups, defaultStandard, missingStandard, standardScopeFor, type StandardLine } from "../../lib/standard-scope";
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
  // The checklists to put on this bid form: the trade's own, and any already on it (from an earlier pick).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setLines(null); setError("");
    loadStandard(pkg).then(found => {
      if (!live) return;
      const missing = new Set(missingStandard(state, pkg.id, found).map(l => l.key));
      setPicked(new Set(found.filter(l => l.own || !missing.has(l.key)).map(l => l.checklist)));
      setLines(found);
    }).catch((e: Error) => { if (live) setError(e.message || "The standard scope couldn't be loaded."); });
    return () => { live = false; };
  }, [pkg.id, pkg.code, pkg.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Empty title="The standard scope couldn't be loaded" description={error}/>;
  if (!lines) return <div className="std-scope"><p className="std-note">Loading {pkg.name}'s standard scope…</p></div>;
  if (!lines.length) return <Empty title={`No standard scope for ${pkg.name} yet`} description="Add the trade's scope checklist in AI memory (Workspace → AI memory). Its lines then show here on every project."/>;

  const groups = checklistGroups(lines);
  const chosen = lines.filter(l => picked.has(l.checklist));
  const missing = missingStandard(state, pkg.id, chosen);
  const fillIns = missing.filter(l => l.fillIn).length;
  const own = groups.filter(g => g.own).map(g => g.checklist || "scope checklist");
  const others = groups.filter(g => !g.own).length;

  const toggle = (checklist: string) => setPicked(current => {
    const next = new Set(current);
    if (next.has(checklist)) next.delete(checklist); else next.add(checklist);
    return next;
  });
  function addHere() {
    let added = 0;
    const failed = run(current => { const r = addStandardScope(current, pkg.id, chosen, by); added = r.added; return r.state; });
    notify(failed ?? (added ? `${added} standard line${added === 1 ? "" : "s"} added to ${pkg.name}'s bid form${fillIns ? `; ${fillIns} to fill in for this project` : ""}.` : "The ticked standard scope is already on this bid form."));
  }
  async function addEverywhere() {
    setBusy(true);
    let added = 0, trades = 0, failed: string | null = null;
    try {
      for (const p of state.packages) {
        // This trade as ticked here; every other trade with its own checklists.
        const found = p.id === pkg.id ? chosen : defaultStandard(await loadStandard(p));
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

  const list = (rows: StandardLine[], title: string) => rows.length ? <section className="std-group"><h4>{title}<small>{rows.length}</small></h4><ul>{rows.map(l => {
    const on = !missing.includes(l);
    return <li key={l.key} className={on ? "on" : ""}><span className="std-mark" aria-label={on ? "On this bid form" : "Not on this bid form"}>{on ? <Check size={13}/> : null}</span>
      <span><strong>{l.section === "excludes" ? l.title.replace(/^Excluded:\s*/, "") : l.title}</strong>{l.detail && <small>{l.detail}</small>}</span>
      {l.fillIn && <Badge tone="amber">Fill in for this project</Badge>}</li>;
  })}</ul></section> : null;

  return <div className="std-scope">
    <div className="std-head">
      <span className="std-icon"><Layers3 size={18}/></span>
      <div><h3>Standard scope · {pkg.name}</h3><p>From your scope checklist{own.length > 1 ? "s" : ""} {own.join(", ")}: carried on every project, whatever the drawings show. {chosen.length - missing.length} of {chosen.length} ticked lines are on this bid form.{others ? ` ${others} more checklist${others === 1 ? "" : "s"} from this division ${others === 1 ? "is" : "are"} below; tick one when this project has that work.` : ""}</p></div>
      <div className="std-actions">
        <Button variant="primary" onClick={addHere} disabled={!missing.length}><ListPlus size={15}/>{missing.length ? `Add ${missing.length} to this bid form` : chosen.length ? "All on this bid form" : "No checklist ticked"}</Button>
        <Button onClick={addEverywhere} disabled={busy}>{busy ? "Adding…" : "Add standard scope to every trade"}</Button>
      </div>
    </div>
    {groups.map(g => {
      const on = picked.has(g.checklist);
      return <section key={g.checklist} className={`std-checklist${on ? " picked" : ""}`}>
        <label className="std-checklist-head">
          <input type="checkbox" checked={on} onChange={() => toggle(g.checklist)}/>
          <span><strong>{g.checklist || "Scope checklist"}</strong><small>{g.lines.length} line{g.lines.length === 1 ? "" : "s"} · {g.own ? "this trade's checklist" : "same division: tick it when this project has this work"}</small></span>
          {g.own && <Badge tone="green">This trade</Badge>}
        </label>
        {on && <>{list(g.lines.filter(l => l.section === "includes"), "Carried by this trade")}{list(g.lines.filter(l => l.section === "excludes"), "Exclusions")}</>}
      </section>;
    })}
    <p className="std-note">Only ticked checklists are added. Added lines are approved and marked "Standard scope" on the bid form; lines with blanks stay drafts until this project's value is written in. "Every trade" adds each other trade's own checklist. Edit or remove any line per project.</p>
  </div>;
}

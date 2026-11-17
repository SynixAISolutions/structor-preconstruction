"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, SearchBox, Stats, type ViewProps } from "./shared";
import { DEFAULT_LIMITS, normalizeLimits, workload, type PersonLoad, type WorkloadLimits } from "../../lib/workload";
import { readDraft, useLocalDraft } from "../../lib/use-local-draft";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleAwards } from "../../lib/data/sample-award";
import { DRAFT_CHANGED } from "../../lib/shared-sync";
import { displayDate, exportRows } from "../../lib/format";
import type { Procurement } from "../../lib/procurement";
import type { AwardState } from "../../lib/award";
import type { Project } from "../../lib/projects";
import "./workload.css";

const STATUS: Record<PersonLoad["status"], { label: string; tone: string }> = {
  over: { label: "Over capacity", tone: "red" }, within: { label: "Within capacity", tone: "green" }, room: { label: "Has room", tone: "blue" },
};

/**
 * Estimator workload (Marcel's features list, item 33): everyone on a project team or owning a trade, with what's due
 * and whether it passes the team's own limits.
 */
export function WorkloadView({ projects, navigate }: ViewProps & { projects: Project[] }) {
  const [savedLimits, setLimits] = useLocalDraft<WorkloadLimits>("workload-limits", DEFAULT_LIMITS);
  const limits = normalizeLimits(savedLimits);
  const [query, setQuery] = useState(""), [open, setOpen] = useState<string[]>([]), [editing, setEditing] = useState(false), [error, setError] = useState("");
  const [today, setToday] = useState(""), [changed, setChanged] = useState(0);
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);
  // Each project's bid packages and awards, as saved in this browser; a save anywhere refreshes the view.
  useEffect(() => { const bump = () => setChanged(n => n + 1); window.addEventListener(DRAFT_CHANGED, bump); return () => window.removeEventListener(DRAFT_CHANGED, bump); }, []);
  const people = useMemo(() => {
    if (!today) return [];
    const awarded = new Set(projects.flatMap(p => readDraft<AwardState>(p.id, "awards", sampleAwards).awards.filter(a => !a.cancelled).map(a => `${p.id}:${a.packageId}`)));
    return workload({ projects, packagesOf: id => readDraft<Procurement>(id, "procurement", sampleProcurement).packages, awarded, today, limits });
  }, [projects, today, limits.tradesDueIn14, limits.projectsDueIn30, changed]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = people.filter(p => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (name: string) => setOpen(o => o.includes(name) ? o.filter(n => n !== name) : [...o, name]);

  function saveLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = { tradesDueIn14: Number(data.get("tradesDueIn14")), projectsDueIn30: Number(data.get("projectsDueIn30")) };
    if (![next.tradesDueIn14, next.projectsDueIn30].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) { setError("Use whole numbers from 0 to 100."); return; }
    setLimits(next); setEditing(false); setError("");
  }

  return <div className="cm-view workload-view">
    <PageHeader eyebrow="WORKSPACE" title="Estimator workload" description="Who is carrying what across every project: the trades each person owns, what's due soon, and whether it's more than your team's limits."
      actions={<><Button onClick={() => { setError(""); setEditing(true); }}><Settings2 size={15}/>Capacity limits</Button><Button disabled={!people.length} onClick={() => exportRows("estimator-workload.csv", [["Person", "Roles", "Status", "Projects", "Open trades", "Trades due in 14 days", "Project bids due in 30 days"], ...people.map(p => [p.name, p.roles.join("; "), STATUS[p.status].label, p.projects.length, p.trades.length, p.tradesDueIn14, p.projectsDueIn30])])}>Export CSV</Button></>}/>
    <Stats items={[
      { label: "People", value: people.length, detail: "On a project team or owning a trade" },
      { label: "Over capacity", value: people.filter(p => p.status === "over").length, detail: `More than ${limits.tradesDueIn14} trades in 14 days or ${limits.projectsDueIn30} bids in 30`, tone: people.some(p => p.status === "over") ? "orange" : "" },
      { label: "Within capacity", value: people.filter(p => p.status === "within").length, detail: "Busy, within the limits", tone: "green" },
      { label: "Has room", value: people.filter(p => p.status === "room").length, detail: "Nothing due in 30 days" },
    ]}/>
    <Panel>
      <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search people…"/></div>
      {!people.length ? <Empty title="No one to show yet" description="Add people to project teams in Project information, or give each trade package an owner in Scopes & bid forms." action={<Button onClick={() => navigate("projects")}>Open All projects</Button>}/> :
      <div className="ui-table-wrap"><table className="ui-table workload-table">
        <thead><tr><th>Person</th><th>Status</th><th className="num">Projects</th><th className="num">Open trades</th><th className="num">Due in 14 days</th><th className="num">Bids in 30 days</th></tr></thead>
        <tbody>{shown.map(p => { const expanded = open.includes(p.name); return [
          <tr key={p.name}>
            <th scope="row"><button type="button" className="cm-text-button workload-person" aria-expanded={expanded} onClick={() => toggle(p.name)}>{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}{p.name}</button><small>{p.roles.join(", ") || "Trade owner"}</small></th>
            <td><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge><small>{p.reasons.join("; ")}</small></td>
            <td className="num">{p.projects.length}</td><td className="num">{p.trades.length}</td><td className="num">{p.tradesDueIn14}</td><td className="num">{p.projectsDueIn30}</td>
          </tr>,
          expanded && <tr key={`${p.name}-detail`} className="workload-detail"><td colSpan={6}><div className="workload-detail-grid">
            <section><h4>Projects</h4><ul>{p.projects.map(x => <li key={x.id}><span>{x.name}</span><small>{x.status} · bid {x.due ? displayDate(x.due) : "date not set"}</small></li>)}</ul></section>
            <section><h4>Open trades</h4>{p.trades.length ? <ul>{p.trades.map(t => <li key={`${t.projectId}-${t.packageId}`}><span>{t.trade}</span><small>{t.projectName} · due {t.due ? displayDate(t.due) : "not set"}</small></li>)}</ul> : <p className="workload-none">No open trades.</p>}</section>
          </div></td></tr>,
        ]; })}</tbody>
      </table></div>}
      <p className="workload-note">Trades come from each project's bid packages and awards saved for your team; a trade leaves the count once it's awarded.</p>
    </Panel>
    {editing && <Modal title="Capacity limits" subtitle="Someone with more than either is shown as over capacity. Set them to how your team works." onClose={() => setEditing(false)}>
      <form onSubmit={saveLimits}>
        <label className="ui-field">Trades with bids due in the next 14 days, at most<input name="tradesDueIn14" type="number" min="0" max="100" step="1" defaultValue={limits.tradesDueIn14}/></label>
        <label className="ui-field">Project bids due in the next 30 days, at most<input name="projectsDueIn30" type="number" min="0" max="100" step="1" defaultValue={limits.projectsDueIn30}/></label>
        {error && <p className="cm-form-error" role="alert">{error}</p>}
        <div className="cm-form-footer"><Button onClick={() => { setLimits(DEFAULT_LIMITS); setEditing(false); }}>Reset to {DEFAULT_LIMITS.tradesDueIn14} and {DEFAULT_LIMITS.projectsDueIn30}</Button><Button type="submit" variant="primary">Save limits</Button></div>
      </form>
    </Modal>}
  </div>;
}

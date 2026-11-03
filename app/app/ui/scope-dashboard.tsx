"use client";

import { useMemo, useState } from "react";
import { editPackage, type PackageStatus, type Procurement } from "../../lib/procurement";
import { scopeDashboard } from "../../lib/scope-dashboard";
import { Badge, Empty, Panel, SearchBox, Tabs } from "./shared";
import "./scope-dashboard.css";

const STATUS: Record<PackageStatus, { label: string; tone: string }> = { draft: { label: "Draft", tone: "amber" }, ready: { label: "Ready", tone: "blue" }, published: { label: "Published", tone: "green" }, revised: { label: "Revised", tone: "orange" } };
const STAGES = ["All", "Not started", "Under way", "Done"] as const;
const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * The scope dashboard (Marcel, 24 Oct: "a scope dashboard like Wire AI's is optional"): how far the scope review has
 * come, the packages by discipline, and every package with its owner, progress and status. A package opens its bid
 * form; its owner can be set here (lib/scope-dashboard).
 */
export function ScopeDashboardView({ state, run, proposed, onOpen, notify }: { state: Procurement; run: (action: (s: Procurement) => Procurement) => string | null; proposed: (packageId: string) => number; onOpen: (packageId: string) => void; notify: (message: string) => void }) {
  const board = useMemo(() => scopeDashboard(state, proposed), [state, proposed]);
  const [stage, setStage] = useState<(typeof STAGES)[number]>("All");
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState("");
  const owners = [...new Set(state.packages.map(p => p.owner.trim()).filter(Boolean))].sort();
  const stageOf = (r: (typeof board.rows)[number]) => r.status !== "draft" ? "Done" : r.approved > 0 || r.proposed > 0 ? "Under way" : "Not started";
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = board.rows.filter(r => (stage === "All" || stageOf(r) === stage) && (!owner || (owner === "-" ? !r.owner : r.owner === owner)) && words.every(w => `${r.code} ${r.name} ${r.owner}`.toLowerCase().includes(w)));
  const most = Math.max(1, ...board.disciplines.map(d => d.packages));

  function assign(packageId: string, name: string) {
    const problem = run(s => editPackage(s, packageId, { owner: name }));
    notify(problem ?? (name ? `${name} owns ${state.packages.find(p => p.id === packageId)?.name}.` : "Owner removed."));
  }

  if (!board.rows.length) return <Empty title="No bid packages yet" description="Upload the drawings and the project manual in Project files: the AI sets the bid packages and writes their scopes."/>;

  return <div className="scope-dash">
    <div className="scope-dash-top">
      <Panel title="Scope review" subtitle="Bid-form lines approved by an estimator, across every package.">
        <div className="scope-dash-review">
          <div className="scope-dash-ring" style={{ ["--done" as string]: `${board.items.progress * 360}deg` }} role="img" aria-label={`${percent(board.items.progress)} of scope lines approved`}><span><strong>{percent(board.items.progress)}</strong><small>{board.items.approved} of {board.items.total}</small></span></div>
          <dl>
            <dt>Packages done</dt><dd>{board.packages.done}<small> of {board.packages.total}</small></dd>
            <dt>Under way</dt><dd>{board.packages.underway}</dd>
            <dt>Not started</dt><dd>{board.packages.notStarted}</dd>
            <dt>Lines to review</dt><dd>{board.items.needsReview}</dd>
            <dt>AI proposals waiting</dt><dd>{board.items.proposed}</dd>
          </dl>
        </div>
      </Panel>
      <Panel title="Disciplines" subtitle="Bid packages in each discipline.">
        <ul className="scope-dash-disciplines">{board.disciplines.map(d => <li key={d.name}><span>{d.name}</span><i aria-hidden><b style={{ width: `${(d.packages / most) * 100}%` }}/></i><strong>{d.packages}</strong></li>)}</ul>
      </Panel>
    </div>
    <Panel title="Scope assignments" subtitle="Every bid package, its owner and how far its review has come. Open one to review its bid form.">
      <div className="ui-toolbar">
        <Tabs tabs={[...STAGES]} value={stage} onChange={v => setStage(v as (typeof STAGES)[number])}/>
        <div className="scope-dash-filters">
          <label className="ui-field">Owner<select value={owner} onChange={e => setOwner(e.target.value)}><option value="">Everyone</option><option value="-">No owner yet</option>{owners.map(o => <option key={o}>{o}</option>)}</select></label>
          <SearchBox value={query} onChange={setQuery} placeholder="Search package, code or owner…"/>
        </div>
      </div>
      {shown.length ? <div className="ui-table-wrap"><table className="ui-table scope-dash-table"><thead><tr><th>Bid package</th><th>Owner</th><th>Progress</th><th>Lines</th><th>AI proposals</th><th>Status</th></tr></thead><tbody>
        {shown.map((r, i) => <FragmentRow key={r.packageId} header={i === 0 || shown[i - 1].discipline !== r.discipline ? `${r.discipline} · ${shown.filter(x => x.discipline === r.discipline).length}` : null}>
          <tr>
            <td><button className="scope-dash-open" onClick={() => onOpen(r.packageId)}><span>{r.code}</span>{r.name}</button></td>
            <td><select className="scope-dash-owner" aria-label={`Owner of ${r.name}`} value={r.owner} onChange={e => assign(r.packageId, e.target.value)}><option value="">No owner yet</option>{owners.map(o => <option key={o}>{o}</option>)}</select></td>
            <td><span className="scope-dash-progress" aria-label={`${percent(r.progress)} approved`}><i><b style={{ width: percent(r.progress) }}/></i>{percent(r.progress)}</span></td>
            <td>{r.approved}/{r.items}</td>
            <td>{r.proposed || "—"}</td>
            <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
          </tr>
        </FragmentRow>)}
      </tbody></table></div> : <Empty title="No packages match" description="Try another stage, owner or search."/>}
    </Panel>
  </div>;
}

/** A row, with its discipline's heading row above when it starts one. */
function FragmentRow({ header, children }: { header: string | null; children: React.ReactNode }) {
  return <>{header && <tr className="scope-dash-group"><th colSpan={6} scope="colgroup">{header}</th></tr>}{children}</>;
}

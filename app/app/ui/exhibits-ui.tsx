"use client";

import { ArrowRight, Check, Lock } from "lucide-react";
import { exhibitRows } from "../../lib/exhibits";
import { useAward } from "../../lib/use-award";
import { useSubmissions } from "../../lib/use-submissions";
import { Badge, Button, Empty, PageHeader, Panel, type ViewProps } from "./shared";
import "./exhibits.css";

const A_TONE = { draft: "orange", shared: "blue", "changes requested": "orange", agreed: "green" } as const;

/**
 * Exhibits, under Contracts & procurement (Marcel's issues log, item 18): every trade's Exhibit A and Exhibits B to G in
 * one list (lib/exhibits). Each row opens that trade on Contracts, on the tab where its exhibits are prepared.
 */
export function ExhibitsView({ projectName, navigate }: ViewProps) {
  const { procurement } = useSubmissions();
  const { state } = useAward();
  const rows = exhibitRows(procurement.packages, state);
  const awarded = rows.filter(r => r.company);
  const open = (packageId: string, tab: "Exhibit A" | "All other exhibits") => {
    sessionStorage.setItem("contracts-package", packageId);
    sessionStorage.setItem("contracts-tab", tab);
    navigate("contracts");
  };
  return <>
    <PageHeader eyebrow={`${projectName} / Contracts & procurement`} title="Exhibits" description="Every trade's exhibits in one place: Exhibit A, the scope agreed with the subcontractor, and Exhibits B to G, the documents and the contracts department's files attached to the subcontract."/>
    <Panel title="Exhibits by trade" subtitle={`${awarded.length} of ${rows.length} trades awarded. Exhibits are prepared once a trade is awarded.`}>
      {!rows.length ? <Empty title="No trades yet" description="Trades come from Scopes & bid forms."/> :
      <div className="exhibits-table" role="table" aria-label="Exhibits by trade">
        <div className="exhibits-row head" role="row"><span role="columnheader">Trade</span><span role="columnheader">Exhibit A</span><span role="columnheader">Exhibits B to G</span><span role="columnheader"/></div>
        {rows.map(row => <div className="exhibits-row" role="row" key={row.packageId}>
          <span role="cell"><strong>{row.code} · {row.trade}</strong><small>{row.company ?? "Not awarded yet"}</small></span>
          <span role="cell">{row.exhibitA ? <><Badge tone={A_TONE[row.exhibitA.status]}>{row.exhibitA.status}</Badge><small>Revision {row.exhibitA.revision}</small></> : <small>—</small>}</span>
          <span role="cell" className="exhibits-marks">{row.others.length ? row.others.map(mark => <span key={mark.code} className={mark.ready ? "ready" : ""} title={`Exhibit ${mark.code} · ${mark.name}: ${mark.ready ? "ready" : "to prepare"}`}>{mark.ready && <Check size={11}/>}{mark.code}</span>) : <small>—</small>}{row.locked && <Lock size={13} aria-label="Frozen into the sent subcontract"/>}</span>
          <span role="cell" className="exhibits-actions">{row.company && <>
            <Button onClick={() => open(row.packageId, "Exhibit A")}>Exhibit A<ArrowRight size={14}/></Button>
            <Button onClick={() => open(row.packageId, "All other exhibits")}>B to G<ArrowRight size={14}/></Button>
          </>}</span>
        </div>)}
      </div>}
    </Panel>
  </>;
}

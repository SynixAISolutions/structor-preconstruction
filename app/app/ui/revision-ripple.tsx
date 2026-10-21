"use client";

import { useState } from "react";
import { ArrowUpRight, Check, GitBranchPlus } from "lucide-react";
import { applyRipple, revisionRipple, type RippleChange, type RippleTrade, type SheetChanges } from "../../lib/revision-ripple";
import type { useProcurement } from "../../lib/use-procurement";
import type { Submission } from "../../lib/submissions";
import { Badge, Button, Panel, type ViewProps } from "./shared";
import "./revision-ripple.css";

type ProcurementHook = ReturnType<typeof useProcurement>;
type Props = {
  sheets: SheetChanges[];
  procurement: ProcurementHook["state"];
  submissions: Submission[];
  run: ProcurementHook["run"];
} & Pick<ViewProps, "notify" | "navigate">;

export function RevisionRipple({ sheets, procurement, submissions, run, notify, navigate }: Props) {
  const { trades, unmatched } = revisionRipple(sheets, procurement, submissions);
  const reviewed = sheets.reduce((n, s) => n + s.changes.length, 0);
  const [result, setResult] = useState("");

  function add(trade: RippleTrade) {
    let added = 0;
    const error = run(state => {
      const next = applyRipple(state, trade, "Marcel Khoury");
      added = next.scopes.length - state.scopes.length;
      return next;
    });
    const message = error ?? (added ? `${trade.name}: ${added} draft line${added === 1 ? "" : "s"} added. Review and publish in Scopes & bid forms.` : `${trade.name}: these changes are already in the bid form. No duplicate lines added.`);
    setResult(message);
    notify(message);
  }

  return <Panel title="Trade impact" subtitle="All reviewed sheets in the selected comparison. Mark changes reviewed above to include them here." className="ripple-panel">
    <div className="ripple-intro"><GitBranchPlus size={20} aria-hidden="true"/><p>{reviewed ? <><strong>{reviewed} reviewed change{reviewed === 1 ? "" : "s"} · {trades.length} affected trade{trades.length === 1 ? "" : "s"}</strong>Approve each trade to add draft lines. Review and republish its form in Scopes & bid forms so bidders can re-price.</> : <><strong>Review changes before updating bid forms</strong>Describe the sheet changes, then use Mark reviewed on the changes you want to carry into trade bid forms.</>}<span>Adding lines does not publish the form or send email.</span></p></div>
    <p className="ripple-result" role="status">{result}</p>
    {!!trades.length && <div className="ripple-trades">{trades.map(trade => {
      const pkg = procurement.packages.find(p => p.id === trade.packageId)!;
      const carried = trade.changes.filter(c => procurement.scopes.some(s => s.packageId === trade.packageId && s.title === c.title && s.source === `${c.sheet} · ${c.revision}`)).length;
      return <article className="ripple-trade" key={trade.packageId} aria-label={trade.name}>
        <header><div><small>{pkg.code} · {trade.changes.length} change{trade.changes.length === 1 ? "" : "s"}</small><h3>{trade.name}</h3></div><Badge tone={trade.published ? "blue" : "neutral"}>{trade.published ? `Published · version ${pkg.published!.version}` : "Not published"}</Badge></header>
        <RippleChanges changes={trade.changes}/>
        <p className="ripple-bids">{trade.bids ? <><strong>{trade.bids} submitted bid{trade.bids === 1 ? "" : "s"}</strong> {trade.bids === 1 ? "This bidder will" : "These bidders will"} need to resubmit once you {trade.published ? "republish" : "publish"} the revised form.</> : "No submitted bids for this trade yet."}</p>
        <footer><p>{carried ? <><Check size={14} aria-hidden="true"/>{carried} of {trade.changes.length} changes already in bid form. Adding again skips existing lines.</> : "New lines will be draft and need approval before publishing."}</p><div><Button variant="primary" onClick={() => add(trade)}>Add to bid form</Button><Button onClick={() => navigate("scopes")}>Scopes & bid forms<ArrowUpRight size={14} aria-hidden="true"/></Button></div></footer>
      </article>;
    })}</div>}
    {!!unmatched.length && <section className="ripple-unmatched" aria-labelledby="ripple-unmatched-title"><header><div><h3 id="ripple-unmatched-title">Unmatched changes</h3><p>{unmatched.length} reviewed change{unmatched.length === 1 ? " has" : "s have"} no matching trade package. Place {unmatched.length === 1 ? "it" : "them"} by hand in Scopes & bid forms.</p></div><Button onClick={() => navigate("scopes")}>Place changes by hand<ArrowUpRight size={14} aria-hidden="true"/></Button></header><RippleChanges changes={unmatched} showTrade/></section>}
  </Panel>;
}

function RippleChanges({ changes, showTrade = false }: { changes: RippleChange[]; showTrade?: boolean }) {
  return <ol className="ripple-changes">{changes.map((c, i) => <li key={i}><div className="ripple-source"><span>{c.sheet} · {c.revision}</span><Badge tone={c.kind === "Added" ? "orange" : c.kind === "Removed" ? "red" : "blue"}>{c.kind}</Badge>{showTrade && <span>{c.trade || "Trade not named"}</span>}</div><strong>{c.title}</strong>{c.detail && <p>{c.detail}</p>}</li>)}</ol>;
}

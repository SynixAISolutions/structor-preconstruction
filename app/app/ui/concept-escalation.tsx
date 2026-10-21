"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CSI_DIVISIONS } from "../../lib/csi";
import { historyEscalation, midpoint, type IndexPoint } from "../../lib/escalation";
import type { BudgetHistory } from "../../lib/historical-budget";
import type { Project } from "../../lib/projects";
import { Button, Empty, Panel, type ViewProps, usd } from "./shared";

type Prices = { points: Record<string, IndexPoint[]>; fetchedAt: string };
type Result = ReturnType<typeof historyEscalation>;
const percent = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const factorText = (value: number) => `${value.toFixed(4)}×`;
// Share successful data and in-flight requests across screen visits for this session.
let sessionPrices: Promise<Prices> | null = null;
function loadPrices() {
  return sessionPrices ??= fetch("/api/escalation").then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The BLS price indexes could not be loaded. Try again later.");
    if (!data.points || !data.fetchedAt) throw new Error("The BLS price index response is incomplete. Try again later.");
    return data as Prices;
  }).catch(error => { sessionPrices = null; throw error; });
}

export function escalationSummary(project: string, targetLabel: string, target: string, result: Result, fetchedAt: string) {
  return [
    `Escalation check — ${project}`,
    `Target: ${targetLabel} (${target}). Cost-weighted change: ${result.factor === null ? "Unavailable" : `${percent(result.factor - 1)}; factor ${factorText(result.factor)}`}.`,
    "Read-only material index check; no budget cost index changed. History starts in July of each estimate year. Divisions without data are excluded from the weighting.",
    `BLS data fetched: ${fetchedAt}. Projections beyond published data are an assumption, compounded at the trailing 12-month rate where available.`,
    ...result.rows.map(({ record, division, amount, escalation: e }) => `${record} · Division ${division} · ${usd(amount)} weight\n${e.series.name} — BLS ${e.series.id}\nFrom ${e.from.month}: ${e.from.value}; latest published ${e.latest.month}: ${e.latest.value}. Measured to ${target < e.latest.month ? "target" : "latest"}: ${percent(e.measured)}. Projected part (an assumption): ${percent(e.projected)}; trailing annual rate ${percent(e.annualRate)}. Trade factor: ${factorText(e.factor)}.\nSource: ${e.note}`),
    ...(result.missing.length ? [`Missing divisions (excluded): ${result.missing.join("; ")}.`] : []),
  ].join("\n\n");
}

export function EscalationResult({ result, target, fetchedAt }: { result: Result; target: string; fetchedAt: string }) {
  return <>
    {result.factor !== null ? <div className="escalation-headline"><strong>{percent(result.factor - 1)}</strong><div><b>Cost-weighted change to {target}</b><span>{factorText(result.factor)} overall · {result.rows.length} record / trade combinations</span></div></div> : <Empty title="No index data covers this history" description="No positive-cost division has a usable index at the historical start month. Review the missing divisions below."/>}
    <p>Material price indexes are a check on the selected history, starting in July of each estimate year. They do not represent a complete installed-cost estimate. Missing divisions are excluded from the weighting.</p>
    <p className="escalation-source">BLS data fetched <time dateTime={fetchedAt}>{fetchedAt}</time>. Future change is <strong>an assumption</strong>: the trailing 12-month rate compounded to the target, where available. For a target before the latest publication, measured change stops at the target.</p>
    {!!result.missing.length && <div className="escalation-missing"><h3>Missing divisions</h3><ul>{result.missing.map((missing, i) => <li key={i}>{missing}</li>)}</ul></div>}
    <div className="escalation-trades">{result.rows.map(({ record, division, amount, escalation: e }, i) => <article key={i}>
      <header><div><span className="escalation-record">{record}</span><h3>Division {division} · {CSI_DIVISIONS[division] ?? "Unclassified work"}</h3></div><b className="escalation-factor">{factorText(e.factor)}<small>Trade factor</small></b></header>
      <p className="escalation-index"><strong>{e.series.name}</strong><a href={`https://data.bls.gov/timeseries/${e.series.id}`} target="_blank" rel="noreferrer" aria-label={`BLS ${e.series.id} (opens in a new tab)`}>BLS {e.series.id} ↗</a></p>
      <dl>
        <div><dt>From · {e.from.month}</dt><dd>{e.from.value}</dd></div>
        <div><dt>Latest published · {e.latest.month}</dt><dd>{e.latest.value}</dd></div>
        <div><dt>Measured {target < e.latest.month ? "to target" : "to latest"}</dt><dd>{percent(e.measured)}</dd></div>
        <div className="escalation-assumption"><dt>Projected part · an assumption</dt><dd>{percent(e.projected)}<small>Trailing annual rate {percent(e.annualRate)}</small></dd></div>
      </dl>
      <p className="escalation-source">Historical cost weight: {usd(amount)}. Measured and projected changes compound to the trade factor.</p>
      <p className="escalation-source">Source: {e.note}</p>
    </article>)}</div>
  </>;
}

export function ConceptEscalation({ project, history, navigate, notify }: { project: Project; history: BudgetHistory[] } & Pick<ViewProps, "navigate" | "notify">) {
  const [choice, setChoice] = useState("midpoint"), [prices, setPrices] = useState<Prices | null>(null);
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0), [manualCopy, setManualCopy] = useState(false);
  const copyField = useRef<HTMLTextAreaElement>(null);
  const middle = midpoint(project.start, project.finish);
  const target = choice === "bid" ? project.due.slice(0, 7) || null : middle;
  const targetLabel = choice === "bid" ? "Bid date" : "Construction midpoint";
  const enabled = !!history.length && !!target;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setError("");
    loadPrices().then(data => { if (live) setPrices(data); }).catch(failure => { if (live) setError(failure instanceof Error ? failure.message : "The BLS price indexes could not be loaded. Try again later."); });
    return () => { live = false; };
  }, [enabled, attempt]);
  const comparison = useMemo(() => {
    if (!prices || !target || !history.length) return { result: null, error: "" };
    try { return { result: historyEscalation(history, prices.points, target), error: "" }; }
    catch { return { result: null, error: "This target cannot be compared with the selected history. Check that project dates follow the historical estimate years." }; }
  }, [prices, target, history]);
  const result = comparison.result;
  const summary = result && prices && target ? escalationSummary(project.name, targetLabel, target, result, prices.fetchedAt) : "";
  useEffect(() => { setManualCopy(false); }, [summary]);
  useEffect(() => { if (manualCopy) { copyField.current?.focus(); copyField.current?.select(); } }, [manualCopy]);
  async function copy() {
    try { await navigator.clipboard.writeText(summary); notify("Escalation summary copied."); }
    catch { setManualCopy(true); notify("Clipboard unavailable. Copy the selected summary text below."); }
  }
  return <Panel className="concept-escalation" title="Escalation check" subtitle="Public material price indexes · read-only; no budget cost index changed" action={<Button disabled={!result || !summary} onClick={copy}>Copy summary</Button>}>
    <label className="ui-field escalation-target">Escalation target<select value={choice} onChange={event => setChoice(event.target.value)}>
      <option value="midpoint">Construction midpoint{middle ? ` · ${middle}` : " · dates needed"}</option>
      <option value="bid" disabled={!project.due}>Bid date{project.due ? ` · ${project.due}` : " · not recorded"}</option>
    </select></label>
    {!history.length && <Empty title="No history selected" description="Upload a historical budget, then select it in the Comparable project library to check material price changes."/>}
    {!target && <div className="escalation-missing"><h3>No project dates for this target</h3><p>Record construction start and finish dates for the midpoint{project.due ? ", or choose Bid date above" : ", or add a bid date"}.</p><Button onClick={() => navigate("information")}>Open project information</Button></div>}
    {enabled && !prices && !error && <p role="status">Loading public BLS price indexes…</p>}
    {enabled && error && <div role="alert"><p>{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Retry price indexes</Button></div>}
    {comparison.error && <p role="alert">{comparison.error}</p>}
    {result && prices && target && <EscalationResult result={result} target={target} fetchedAt={prices.fetchedAt}/>}
    {manualCopy && <label className="ui-field">Summary text · select and copy<textarea ref={copyField} readOnly rows={10} value={summary}/></label>}
  </Panel>;
}

"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Button, Empty, Panel, usd, type ViewProps } from "./shared";
import { budgetTrend, type BudgetVersion, type TrendStep } from "../../lib/budget-versions";
import type { BudgetState } from "../../lib/budget";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useValueEngineering } from "../../lib/use-value-engineering";
import { displayDate } from "../../lib/format";
import type { Project } from "../../lib/projects";
import "./budget-trends.css";

const compact = (n: number) => Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(Math.abs(n) >= 1e8 ? 0 : 1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}K` : usd(n);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;
const W = 640, H = 230, PAD = { left: 64, right: 24, top: 18, bottom: 40 };

/**
 * Budget trends (Marcel's features list, item 15): the total at each saved budget version, from schematic design to GMP,
 * as one line, and under it the story of each move: the reason the team gave, the lines that moved it, and the VE
 * accepted in between.
 */
export function BudgetTrendsView({ project, budget, onOpenVersions }: { project: Project; budget: BudgetState; onOpenVersions: () => void; notify?: ViewProps["notify"] }) {
  const [saved] = useLocalDraft<BudgetVersion[]>("budget-versions", []);
  const { state: ve } = useValueEngineering();
  const [now, setNow] = useState("");
  useEffect(() => { setNow(new Date().toISOString()); }, []);
  const versions = saved.filter(v => v.projectId === project.id);
  const steps = now ? budgetTrend(versions, ve.ideas, { budget, at: now }) : [];
  const [active, setActive] = useState<number | null>(null);

  if (versions.length < 2) return <Panel title="Budget trends" subtitle="The budget's story from one design stage to the next."><Empty title={versions.length ? "Save one more budget version" : "No budget versions saved yet"} description="Save a version at each stage (schematic design, design development, GMP…) with a line on why it changed. The trend draws itself from them." action={<Button variant="primary" onClick={onOpenVersions}>Open Budget versions</Button>}/></Panel>;

  const totals = steps.map(s => s.total);
  const lo = Math.min(...totals), hi = Math.max(...totals), span = hi - lo || Math.max(1, hi * 0.05);
  const min = lo - span * 0.15, max = hi + span * 0.15;
  const x = (i: number) => PAD.left + (steps.length === 1 ? 0 : (i / (steps.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const ticks = Array.from({ length: 4 }, (_, i) => min + ((i + 0.5) / 4) * (max - min));
  const first = steps[0], last = steps[steps.length - 1];
  const shown = active === null ? null : steps[active];

  return <>
    <Panel title="Budget trends" subtitle={`${first.stage} to ${last.name === "Working budget" ? "today's working budget" : last.stage}: ${signed(last.total - first.total)} across ${steps.length - 1} ${steps.length === 2 ? "move" : "moves"}`}>
      <div className="trend-chart" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Total budget at each version: ${steps.map(s => `${s.name} ${usd(s.total)}`).join("; ")}`}>
          {ticks.map(t => <g key={t}><line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="trend-grid"/><text x={PAD.left - 10} y={y(t) + 4} className="trend-axis" textAnchor="end">{compact(t)}</text></g>)}
          <polyline points={steps.map((s, i) => `${x(i)},${y(s.total)}`).join(" ")} className="trend-line"/>
          {steps.map((s, i) => <g key={s.id}>
            <circle cx={x(i)} cy={y(s.total)} r={4} className={`trend-dot${s.id === "working" ? " working" : ""}`}/>
            <text x={x(i)} y={H - PAD.bottom + 18} className="trend-axis" textAnchor={i === 0 ? "start" : i === steps.length - 1 ? "end" : "middle"}>{s.id === "working" ? "Now" : s.stage}</text>
            <circle cx={x(i)} cy={y(s.total)} r={16} className="trend-hit" tabIndex={0} aria-label={`${s.name}, ${usd(s.total)}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}/>
          </g>)}
          <text x={x(steps.length - 1)} y={y(last.total) - 12} className="trend-label" textAnchor="end">{compact(last.total)}</text>
        </svg>
        {shown && <div className="trend-tooltip" role="status" style={{ left: `${(x(active!) / W) * 100}%`, top: `${(y(shown.total) / H) * 100}%` }}>
          <strong>{shown.name}</strong><span>{shown.stage} · {displayDate(shown.at.slice(0, 10))}</span><span className="trend-tip-total">{usd(shown.total)}</span>{shown.delta !== null && <span>{signed(shown.delta)} from the version before</span>}
        </div>}
      </div>
    </Panel>
    <Panel title="Why it moved" subtitle="Each version in turn: the reason saved with it, the lines that changed most, and the VE accepted since the one before.">
      <ol className="trend-story">{steps.map(s => <TrendCard key={s.id} step={s}/>)}</ol>
    </Panel>
  </>;
}

function TrendCard({ step }: { step: TrendStep }) {
  const Arrow = step.delta === null || step.delta === 0 ? Minus : step.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return <li className="trend-card">
    <header><div><strong>{step.name}</strong><small>{step.stage} · {displayDate(step.at.slice(0, 10))}{step.by ? ` · ${step.by}` : ""}</small></div><div className="trend-total"><span>{usd(step.total)}</span>{step.delta !== null && <small><Arrow size={13} aria-hidden/>{signed(step.delta)}</small>}</div></header>
    {step.reason && <p className="trend-reason">{step.reason}</p>}
    {step.drivers.length > 0 && <div className="trend-section"><h4>What moved it</h4><ul>{step.drivers.map((d, i) => <li key={i}><span>{d.description}{d.center ? <small> · {d.center}</small> : null}{d.change !== "Changed" ? <small> · {d.change.toLowerCase()}</small> : null}</span><span>{signed(d.delta)}</span></li>)}</ul></div>}
    {step.ve.length > 0 && <div className="trend-section"><h4>VE accepted</h4><ul>{step.ve.map(v => <li key={v.number}><span>{v.number} · {v.description}</span><span>{v.impact === null ? "—" : signed(-Math.abs(v.impact))}</span></li>)}</ul></div>}
    {step.delta === null && <p className="trend-first">The starting point.</p>}
  </li>;
}

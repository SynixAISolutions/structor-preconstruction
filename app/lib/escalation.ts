// Escalation to the bid date and the construction midpoint from public price indices (ideas 20 Oct,
// #11): "these historical numbers are from 2022". Each trade uses the BLS Producer Price Index series
// for its main material (all checked on data.bls.gov, 19 Oct 2026), else the index of inputs to
// nonresidential construction. Measured change runs to the latest published month; beyond it the
// trailing 12-month rate is projected and labelled as an assumption. Pure; the BLS fetch is the
// route's (app/api/escalation).

export type IndexSeries = { id: string; name: string };
export const GENERAL_SERIES: IndexSeries = { id: "WPUIP2312301", name: "Inputs to other nonresidential construction, goods" };
/** Main-material series by CSI division. */
export const DIVISION_SERIES: Record<string, IndexSeries> = {
  "03": { id: "WPU1333", name: "Ready-mix concrete" },
  "05": { id: "WPU101", name: "Iron and steel" },
  "06": { id: "WPU0811", name: "Softwood lumber" },
  "07": { id: "WPU1392", name: "Insulation materials" },
  "09": { id: "WPU1371", name: "Gypsum products" },
  "22": { id: "WPU0721", name: "Plastic construction products" },
  "23": { id: "WPU1073", name: "Sheet metal products" },
  "26": { id: "WPU102502", name: "Copper and brass mill shapes" },
};
export const seriesFor = (csi: string | null | undefined): IndexSeries => DIVISION_SERIES[(csi ?? "").replace(/\D/g, "").slice(0, 2)] ?? GENERAL_SERIES;

/** One monthly value, "2026-09". */
export type IndexPoint = { month: string; value: number };
const monthOf = (iso: string) => iso.slice(0, 7);
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const fmtMonth = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** The construction midpoint: halfway between start and finish, to the month. */
export function midpoint(start: string, finish: string): string | null {
  if (!/^\d{4}-\d{2}/.test(start) || !/^\d{4}-\d{2}/.test(finish) || finish < start) return null;
  const a = Date.parse(`${start.slice(0, 10)}T00:00:00Z`), b = Date.parse(`${finish.slice(0, 10)}T00:00:00Z`);
  return new Date((a + b) / 2).toISOString().slice(0, 7);
}

export type Escalation = { series: IndexSeries; from: IndexPoint; latest: IndexPoint; measured: number; projected: number; annualRate: number; factor: number; target: string; note: string };

/**
 * From the cost's own month to `target` (the bid date or the midpoint). Measured to the latest month
 * published; for months after it, the trailing 12-month rate compounded. Null without enough data.
 */
export function escalation(series: IndexSeries, points: IndexPoint[], fromDate: string, target: string): Escalation | null {
  const sorted = [...points].filter(p => Number.isFinite(p.value) && p.value > 0).sort((a, b) => a.month.localeCompare(b.month));
  if (!sorted.length) return null;
  const from = sorted.filter(p => p.month <= monthOf(fromDate)).at(-1) ?? null;
  const latest = sorted.at(-1)!, yearAgo = sorted.find(p => monthsBetween(p.month, latest.month) === 12);
  if (!from) return null;
  const to = monthOf(target);
  const measuredTo = to < latest.month ? sorted.filter(p => p.month <= to).at(-1)! : latest;
  const measured = measuredTo.value / from.value - 1;
  const annualRate = yearAgo ? latest.value / yearAgo.value - 1 : 0;
  const ahead = Math.max(0, monthsBetween(latest.month, to));
  const projected = ahead && yearAgo ? (1 + annualRate) ** (ahead / 12) - 1 : 0;
  const factor = (1 + measured) * (1 + projected);
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  const note = `${series.name} (BLS ${series.id}): ${fmtMonth(from.month)} ${from.value} → ${fmtMonth(measuredTo.month)} ${measuredTo.value} (${pct(measured)})`
    + (ahead ? (yearAgo ? `; ${fmtMonth(to)} projected at the trailing 12-month rate ${pct(annualRate)}/yr: ${pct(projected)} more (an assumption)` : `; nothing projected past ${fmtMonth(latest.month)} (no 12-month history)`) : "") + ".";
  return { series, from, latest, measured, projected, annualRate, factor: Math.round(factor * 10000) / 10000, target: to, note };
}

/** BLS API v1 response → points per series ("M13" annual averages skipped). */
export function parseBls(json: unknown): Record<string, IndexPoint[]> {
  const series = (json as { Results?: { series?: { seriesID: string; data: { year: string; period: string; value: string }[] }[] } })?.Results?.series ?? [];
  return Object.fromEntries(series.map(s => [s.seriesID, (s.data ?? []).filter(d => /^M(0[1-9]|1[0-2])$/.test(d.period)).map(d => ({ month: `${d.year}-${d.period.slice(1)}`, value: Number(d.value) })).filter(p => Number.isFinite(p.value))]));
}

/**
 * How much a concept budget's history has escalated by `target` (the bid date or the construction
 * midpoint): each record's lines escalate with their division's index from the middle of the record's
 * year, and the total is weighted by cost, so a budget heavy in steel follows steel. Lines whose index has
 * no data are left out of the weighting and listed. Null factor when nothing could be escalated.
 */
export type EscalationRow = { record: string; recordId: string; division: string; amount: number; escalation: Escalation };
export function historyEscalation(history: { id?: string; name: string; year: number; lines: { csiCode: string | null; amount: number }[] }[], points: Record<string, IndexPoint[]>, target: string): { factor: number | null; rows: EscalationRow[]; missing: string[] } {
  const rows: EscalationRow[] = [], missing: string[] = [];
  for (const record of history) {
    const byDivision = new Map<string, number>();
    for (const line of record.lines) { const d = (line.csiCode ?? "").replace(/\D/g, "").slice(0, 2) || "—"; byDivision.set(d, (byDivision.get(d) ?? 0) + line.amount); }
    for (const [division, amount] of byDivision) {
      if (!(amount > 0)) continue;
      const series = seriesFor(division), e = escalation(series, points[series.id] ?? [], `${record.year}-07-01`, target);
      if (e) rows.push({ record: record.name, recordId: record.id ?? record.name, division, amount, escalation: e }); else missing.push(`${record.name} · division ${division}`);
    }
  }
  const total = rows.reduce((t, r) => t + r.amount, 0);
  return { factor: total ? Math.round(rows.reduce((t, r) => t + r.amount * r.escalation.factor, 0) / total * 10000) / 10000 : null, rows, missing };
}

/**
 * The escalation to apply to a concept budget: each history record's own cost-weighted factor (records
 * differ in year, so one factor for all would misstate the older ones), with the target month and a basis
 * line naming the indexes. Null when nothing could be escalated.
 */
export function conceptEscalation(result: { rows: EscalationRow[]; missing: string[] }): { byRecord: Record<string, number>; target: string; basis: string } | null {
  if (!result.rows.length) return null;
  const sums = new Map<string, { amount: number; weighted: number }>();
  for (const r of result.rows) { const s = sums.get(r.recordId) ?? { amount: 0, weighted: 0 }; s.amount += r.amount; s.weighted += r.amount * r.escalation.factor; sums.set(r.recordId, s); }
  const byRecord = Object.fromEntries([...sums].map(([id, s]) => [id, Math.round(s.weighted / s.amount * 10000) / 10000]));
  const target = result.rows[0].escalation.target, series = [...new Set(result.rows.map(r => r.escalation.series.id))];
  const basis = `Escalated to ${target} with BLS producer price indexes (${series.join(", ")}): measured to the latest month, then projected at each index's trailing annual rate (an assumption).${result.missing.length ? ` Not escalated, no index data: ${result.missing.join("; ")}.` : ""}`;
  return { byRecord, target, basis };
}

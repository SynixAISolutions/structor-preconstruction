// The unit cost database (Marcel's process doc: "Unit cost area to plug near every line item, and saves a data base
// which can be used as a benchmark for unit prices based on project requirements (i.e. taxable, CBE, first source,
// etc.), location, and based on market trends. Unit prices also per division for cost per square foot pricing").
// A job's reviewed rates are kept for the organization, with what made them what they were, and benchmark the next job.
// Plain arithmetic over rates people entered: no AI, and nothing is filled in by itself. Pure.

import { CSI_DIVISIONS } from "./csi";
import type { TakeoffRow } from "./data/preconstruction";
import type { BudgetHistory } from "./historical-budget";
import type { Project, TaxStatus } from "./projects";

export type UnitCost = {
  id: string; item: string; unit: string; rate: number;
  /** The CSI division, two digits, when the line had one. */
  division: string | null;
  /** The job the price is from, and what shaped it. */
  project: string; projectId: string | null; location: string; taxStatus: TaxStatus | null; certifications: string[];
  /** When the price was recorded, yyyy-mm-dd. */
  date: string; by: string; source: "Estimate" | "Typed in";
};
export type UnitCostState = { entries: UnitCost[] };
export const EMPTY_UNIT_COSTS: UnitCostState = { entries: [] };
export const UNIT_COSTS_KEY = "unit-costs";

/** A rate this far from the benchmark's median gets a second look. */
export const BENCHMARK_MARGIN = 0.15;
const SIMILAR_ITEM = 0.6;

const hashOf = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
};
const round = (n: number) => Math.round(n * 100) / 100;
const UNIT_NAMES: Record<string, string> = { SQFT: "SF", SQFEET: "SF", SQUAREFEET: "SF", LNFT: "LF", LINFT: "LF", LINEARFEET: "LF", EACH: "EA", CUYD: "CY", CUBICYARDS: "CY", SQYD: "SY", TONS: "TON", LUMPSUM: "LS" };
/** SF, sq ft and S.F. are one unit: a rate only compares with a rate per the same thing. */
export const unitKey = (unit: string) => { const u = unit.toUpperCase().replace(/[^A-Z0-9]/g, ""); return UNIT_NAMES[u] ?? u; };
export const itemKey = (item: string) => item.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const divisionOf = (code: string | null | undefined): string | null => {
  const division = (code ?? "").replace(/\D/g, "").slice(0, 2);
  return division in CSI_DIVISIONS ? division : null;
};

// ── Into the database ──

/** The open project's lines worth keeping: priced and reviewed. What was left out is counted, for the person saving. */
export function entriesFromEstimate(rows: TakeoffRow[], project: Pick<Project, "id" | "name" | "location" | "taxStatus" | "certifications">, date: string, by: string): { entries: UnitCost[]; unreviewed: number; unpriced: number; samples: number } {
  let unreviewed = 0, unpriced = 0, samples = 0;
  const entries: UnitCost[] = [];
  for (const row of rows) {
    if (!(row.rate > 0)) { unpriced++; continue; }
    // The sample project's illustrative rates aren't prices anyone quoted.
    if (/^illustrative/i.test(row.source)) { samples++; continue; }
    if (!row.reviewed) { unreviewed++; continue; }
    entries.push({ id: `uc-${hashOf(`${project.id}|${itemKey(row.item)}|${unitKey(row.unit)}`)}`, item: row.item.trim(), unit: unitKey(row.unit), rate: row.rate, division: divisionOf(row.division), project: project.name, projectId: project.id, location: project.location, taxStatus: project.taxStatus, certifications: [...project.certifications], date, by, source: "Estimate" });
  }
  return { entries, unreviewed, unpriced, samples };
}

/** One price per job per item: saving again replaces a changed rate and leaves an unchanged one with its date. */
export function saveUnitCosts(state: UnitCostState, entries: UnitCost[]): { state: UnitCostState; added: number; updated: number; unchanged: number } {
  const list = [...state.entries];
  let added = 0, updated = 0, unchanged = 0;
  for (const entry of entries) {
    const at = list.findIndex(e => e.id === entry.id);
    if (at < 0) { list.push(entry); added++; }
    else if (list[at].rate !== entry.rate) { list[at] = entry; updated++; }
    else unchanged++;
  }
  return { state: { entries: list }, added, updated, unchanged };
}

export type UnitCostInput = { item: string; unit: string; rate: number; division?: string | null; project?: string; location?: string; taxStatus?: TaxStatus | null; certifications?: string[]; date: string };
/** A price typed in by hand, from a quote or an earlier job. Throws what's wrong with it. */
export function addUnitCost(state: UnitCostState, input: UnitCostInput, by: string): UnitCostState {
  const item = input.item.trim(), unit = unitKey(input.unit), project = input.project?.trim() || "Typed in";
  if (!item) throw new Error("Describe the item.");
  if (!unit) throw new Error("Enter the unit, e.g. SF, LF, EA.");
  if (!(Number.isFinite(input.rate) && input.rate > 0 && input.rate < 1e9)) throw new Error("The unit cost must be a number above 0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter the date of the price.");
  const id = `uc-${hashOf(`${itemKey(project)}|${itemKey(item)}|${unit}|${input.date}`)}`;
  if (state.entries.some(e => e.id === id)) throw new Error("That price is already in the database.");
  return { entries: [...state.entries, { id, item, unit, rate: input.rate, division: divisionOf(input.division), project, projectId: null, location: input.location?.trim() ?? "", taxStatus: input.taxStatus ?? null, certifications: input.certifications ?? [], date: input.date, by, source: "Typed in" }] };
}

export const removeUnitCost = (state: UnitCostState, id: string): UnitCostState => ({ entries: state.entries.filter(e => e.id !== id) });

// ── Which prices apply ──

export type UnitCostFilter = { query?: string; taxStatus?: TaxStatus | ""; program?: string; location?: string; since?: string };
const hasRequirements = (e: { location: string; taxStatus: TaxStatus | null; certifications: string[] }, { taxStatus = "", program = "", location = "" }: UnitCostFilter) =>
  (!taxStatus || e.taxStatus === taxStatus) && (!program || e.certifications.includes(program)) && (!location.trim() || e.location.toLowerCase().includes(location.trim().toLowerCase()));

/** Prices from jobs with these requirements, this location, and this year on. */
export function filterUnitCosts(entries: UnitCost[], filter: UnitCostFilter): UnitCost[] {
  const words = (filter.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(e => hasRequirements(e, filter) && (!filter.since || e.date >= `${filter.since}-01-01`) && words.every(w => `${e.item} ${e.project} ${e.division ?? ""}`.toLowerCase().includes(w)));
}

/** The filter that asks for prices from jobs like this one. */
export const requirementsOf = (project: Pick<Project, "location" | "taxStatus" | "certifications">): UnitCostFilter => ({
  taxStatus: project.taxStatus ?? "", program: project.certifications[0] ?? "", location: project.location.split(",").at(-1)?.trim() ?? "",
});

// ── Benchmarks ──

export type RateStats = { low: number; median: number; high: number };
export function rateStats(rates: number[]): RateStats {
  const sorted = [...rates].sort((a, b) => a - b), mid = sorted.length >> 1;
  return { low: sorted[0] ?? 0, high: sorted.at(-1) ?? 0, median: round(sorted.length % 2 ? sorted[mid] ?? 0 : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2) };
}

export type Benchmark = RateStats & { key: string; item: string; unit: string; division: string | null; count: number; jobs: number; latest: string; byYear: { year: string; median: number; count: number }[]; entries: UnitCost[] };

/** Every item's prices side by side, by division. The newest wording names the group; `byYear` shows the trend. */
export function benchmarks(entries: UnitCost[]): Benchmark[] {
  const groups = new Map<string, UnitCost[]>();
  for (const e of entries) { const key = `${itemKey(e.item)}|${unitKey(e.unit)}`; groups.set(key, [...(groups.get(key) ?? []), e]); }
  return [...groups].map(([key, list]) => {
    const newest = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const years = Map.groupBy(list, e => e.date.slice(0, 4));
    return {
      ...rateStats(list.map(e => e.rate)), key, item: newest[0].item, unit: unitKey(newest[0].unit), division: list.find(e => e.division)?.division ?? null,
      count: list.length, jobs: new Set(list.map(e => e.project)).size, latest: newest[0].date, entries: newest,
      byYear: [...years].map(([year, inYear]) => ({ year, median: rateStats(inYear.map(e => e.rate)).median, count: inYear.length })).sort((a, b) => a.year.localeCompare(b.year)),
    };
  }).sort((a, b) => (a.division ?? "99").localeCompare(b.division ?? "99") || a.item.localeCompare(b.item) || a.unit.localeCompare(b.unit));
}

const wordSet = (text: string) => new Set(itemKey(text).split(" ").filter(w => w.length > 1));
function similarity(a: string, b: string): number {
  const x = wordSet(a), y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const word of x) if (y.has(word)) common++;
  return (2 * common) / (x.size + y.size);
}

/** The benchmark for a line: the same item and unit, else the closest wording per the same unit, never another unit. */
export function benchmarkFor(line: { item: string; unit: string; division?: string | null }, list: Benchmark[]): Benchmark | null {
  const unit = unitKey(line.unit), same = list.filter(b => b.unit === unit);
  const exact = same.find(b => b.key === `${itemKey(line.item)}|${unit}`);
  if (exact) return exact;
  const division = divisionOf(line.division);
  let best: Benchmark | null = null, score = SIMILAR_ITEM;
  for (const b of same) {
    if (division && b.division && division !== b.division) continue;
    const s = similarity(line.item, b.item);
    if (s >= score) { best = b; score = s; }
  }
  return best;
}

export type EstimateCheck = { row: TakeoffRow; benchmark: Benchmark | null; difference: number | null; flag: "high" | "low" | "close" | "unpriced" | "none" };
/** The open project's lines against prices from other jobs; a job never benchmarks itself. */
export function checkEstimate(rows: TakeoffRow[], entries: UnitCost[], projectId: string): EstimateCheck[] {
  const list = benchmarks(entries.filter(e => e.projectId !== projectId));
  return rows.map(row => {
    const benchmark = benchmarkFor({ item: row.item, unit: row.unit, division: row.division }, list);
    if (!benchmark) return { row, benchmark, difference: null, flag: "none" as const };
    if (!(row.rate > 0)) return { row, benchmark, difference: null, flag: "unpriced" as const };
    const difference = (row.rate - benchmark.median) / benchmark.median;
    return { row, benchmark, difference, flag: difference > BENCHMARK_MARGIN ? "high" as const : difference < -BENCHMARK_MARGIN ? "low" as const : "close" as const };
  });
}

// ── Cost per square foot, by division ──

export type DivisionCost = RateStats & { division: string; name: string; jobs: number };
/** What each division cost per square foot on past jobs (the comparable project library), for pricing a job with few
 * drawings. Each job counts once per division; a job that didn't record a division says nothing about it. */
export function divisionCostsPerSf(history: BudgetHistory[], filter: UnitCostFilter): { divisions: DivisionCost[]; total: (RateStats & { jobs: number }) | null; jobs: number } {
  const since = Number(filter.since) || 0;
  const jobs = history.filter(r => hasRequirements(r, filter) && r.year >= since && r.squareFeet > 0);
  const byDivision = new Map<string, number[]>(), totals: number[] = [];
  for (const job of jobs) {
    const sums = new Map<string, number>();
    for (const line of job.lines) {
      const division = line.classification === "direct" && !line.byOwner ? divisionOf(line.csiCode) : null;
      if (division) sums.set(division, (sums.get(division) ?? 0) + line.amount);
    }
    if (sums.size) totals.push([...sums.values()].reduce((n, v) => n + v, 0) / job.squareFeet);
    for (const [division, amount] of sums) byDivision.set(division, [...(byDivision.get(division) ?? []), amount / job.squareFeet]);
  }
  const divisions = [...byDivision].map(([division, rates]) => ({ division, name: CSI_DIVISIONS[division], jobs: rates.length, ...rateStats(rates) })).sort((a, b) => a.division.localeCompare(b.division));
  return { divisions, total: totals.length ? { jobs: totals.length, ...rateStats(totals) } : null, jobs: jobs.length };
}

// ── Export ──

export function unitCostRows(entries: UnitCost[]): (string | number)[][] {
  return [["Division", "Item", "Unit", "Unit cost", "Job", "Location", "Tax status", "Programs", "Date", "Source", "Recorded by"],
    ...benchmarks(entries).flatMap(b => b.entries.map(e => [e.division ?? "", e.item, e.unit, e.rate, e.project, e.location, e.taxStatus ?? "", e.certifications.join("; "), e.date, e.source, e.by]))];
}

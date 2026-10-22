// The bid package summary: one trade's bids side by side, as the estimator hands them on (Ask Structor's
// first saved task, 22 Oct). Every figure comes from the leveling engine (leveling.mjs bidderTotals), the
// same as Bid leveling and the budget, so the report never differs from the page. Pure: the browser
// gathers the comparison (assistant-data levelingPackages) and downloads the workbook (reportWorkbook).

import type { WorkBook } from "xlsx";
import { usd } from "./format";
import type { LevelingBidder, LevelingScopeItem } from "./leveling-import";
import { bidderTotals } from "./leveling.mjs";

export type ReportBid = {
  rank: number | null; company: string; status: string;
  baseBid: number | null; adjustments: number | null; bond: number | null; acceptedVe: number | null;
  provisionalTotal: number | null; leveledTotal: number | null;
  /** Against the leveled low (or the apparent low when nothing is leveled yet); negative = below it. */
  vsLow: number | null;
};
export type ReportLine = { company: string; item: string; answer: string; amount: number; approved: boolean; required: boolean; resolved: boolean; note: string };
export type BidPackageReport = {
  title: string; projectName: string; trade: string; code: string; packageId: string; asOf: string;
  /** Bids as submitted when nobody has reviewed them in Bid leveling yet. */
  asSubmitted: boolean;
  bids: number;
  leveledLow: { company: string; total: number } | null;
  apparentLow: { company: string; total: number } | null;
  selected: { company: string; amount: number; stage: string } | null;
  /** The range is of leveled totals when two or more are leveled, else of the totals as they stand (provisional). */
  spreadBasis: "leveled" | "provisional";
  lowestTotal: number | null; highestTotal: number | null; spread: number | null; spreadPercent: number | null;
  budget: number | null; budgetBasis: string | null; lowVsBudget: number | null;
  summary: string;
  ranked: ReportBid[];
  /** Amounts added to a bid for scope it leaves out or prices in part (plugs) and other adjustments. */
  adjustments: ReportLine[];
  /** Required or answered scope a bidder excludes (N) or covers in part (P), not yet resolved. */
  gaps: ReportLine[];
};

const REASONS: Record<string, string> = {
  "missing-price": "no price", "invalid-price": "price unreadable", "zero-price-unapproved": "zero price not approved",
  "invalid-bond-rate": "bond rate unreadable", "invalid-adjustment": "an adjustment is unreadable", "invalid-adjustment-total": "adjustments unreadable",
  "negative-subtotal": "subtotal below zero", "invalid-subtotal": "subtotal unreadable", "invalid-bond": "bond unreadable", "invalid-total": "total unreadable",
  "invalid-ve-adjustment": "VE adjustment unreadable", "source-ineligible": "source not eligible", "invalid-source-eligibility": "source eligibility unreadable",
};

export function bidPackageReport(input: {
  projectName: string; trade: string; code: string; packageId: string; asOf: string;
  items: LevelingScopeItem[]; bidders: LevelingBidder[]; asSubmitted: boolean;
  budget: number | null; budgetBasis: string | null; selected: { company: string; amount: number; stage: string } | null;
}): BidPackageReport {
  const rows = input.bidders.map(b => ({ b, t: bidderTotals(b, input.items) }));
  const status = ({ t }: (typeof rows)[number]) => {
    if (t.eligible) return input.asSubmitted ? "Complete as submitted" : "Leveled";
    const why = t.eligibilityReasons.filter((r: string) => r !== "open-scope-review").map((r: string) => REASONS[r] ?? r.replace(/-/g, " "));
    if (t.exceptions) why.unshift(`${t.exceptions} scope item${t.exceptions === 1 ? "" : "s"} to review`);
    if (t.unapprovedAdjustments) why.push(`${t.unapprovedAdjustments} adjustment${t.unapprovedAdjustments === 1 ? "" : "s"} not approved`);
    return `Not rankable: ${why.join("; ")}`;
  };
  const sortKey = ({ t }: (typeof rows)[number]) => (t.eligible ? 0 : 1e15) + (t.reviewedTotal ?? t.provisionalTotal ?? 1e14);
  const sorted = [...rows].sort((p, q) => sortKey(p) - sortKey(q));
  const leveled = sorted.filter(r => r.t.eligible && r.t.reviewedTotal != null);
  const priced = sorted.filter(r => r.t.provisionalTotal != null).sort((p, q) => p.t.provisionalTotal! - q.t.provisionalTotal!);
  const leveledLow = leveled[0] ? { company: leveled[0].b.name, total: leveled[0].t.reviewedTotal! } : null;
  const apparentLow = priced[0] ? { company: priced[0].b.name, total: priced[0].t.provisionalTotal! } : null;
  const low = leveledLow?.total ?? apparentLow?.total ?? null;
  // Ties share a rank, as rankedBidders ranks them.
  let lastTotal: number | null = null, lastRank = 0;
  const ranked: ReportBid[] = sorted.map(r => {
    let rank: number | null = null;
    if (r.t.eligible && r.t.reviewedTotal != null) { const i = leveled.indexOf(r) + 1; rank = r.t.reviewedTotal === lastTotal ? lastRank : i; lastTotal = r.t.reviewedTotal; lastRank = rank; }
    const total = r.t.reviewedTotal ?? r.t.provisionalTotal;
    return {
      rank, company: r.b.name, status: status(r),
      baseBid: typeof r.b.baseBid === "number" && Number.isFinite(r.b.baseBid) ? r.b.baseBid : null,
      adjustments: r.t.adjustment, bond: r.t.bond, acceptedVe: r.t.acceptedVeAdjustment,
      provisionalTotal: r.t.provisionalTotal, leveledTotal: r.t.reviewedTotal,
      vsLow: total != null && low != null ? Math.round((total - low) * 100) / 100 : null,
    };
  });
  const spreadBasis = leveled.length >= 2 ? "leveled" as const : "provisional" as const;
  const range = spreadBasis === "leveled" ? leveled.map(r => r.t.reviewedTotal!) : priced.map(r => r.t.provisionalTotal!);
  const lowestTotal = range.length ? Math.min(...range) : null, highestTotal = range.length ? Math.max(...range) : null;
  const spread = lowestTotal != null && highestTotal != null && range.length > 1 ? Math.round((highestTotal - lowestTotal) * 100) / 100 : null;
  const itemLabel = (id: string) => { const it = input.items.find(i => i.id === id); return it ? `${it.number} ${it.description}`.trim() : id; };
  const lines = (keep: (r: LevelingBidder["responses"][string], item: LevelingScopeItem) => boolean): ReportLine[] => input.bidders.flatMap(b => input.items.flatMap(item => {
    const r = b.responses[item.id];
    return r && keep(r, item) ? [{ company: b.name, item: itemLabel(item.id), answer: r.status || "No answer", amount: Number(r.adjustment) || 0, approved: !!r.adjustmentApproved, required: item.required, resolved: !!r.resolved, note: r.note }] : [];
  }));
  const report: BidPackageReport = {
    title: `Bid package summary: ${input.trade}`, projectName: input.projectName, trade: input.trade, code: input.code, packageId: input.packageId, asOf: input.asOf,
    asSubmitted: input.asSubmitted, bids: rows.length, leveledLow, apparentLow, selected: input.selected,
    spreadBasis, lowestTotal, highestTotal, spread, spreadPercent: spread != null && lowestTotal ? Math.round((spread / lowestTotal) * 1000) / 10 : null,
    budget: input.budget, budgetBasis: input.budgetBasis, lowVsBudget: low != null && input.budget ? Math.round((low - input.budget) * 100) / 100 : null,
    summary: "", ranked,
    adjustments: lines(r => Number(r.adjustment) !== 0 && Number.isFinite(Number(r.adjustment))),
    gaps: lines(r => (r.status === "N" || r.status === "P") && !r.resolved),
  };
  report.summary = summarize(report, sorted.find(r => r.b.name === apparentLow?.company));
  return report;
}

function summarize(r: BidPackageReport, apparent?: { t: ReturnType<typeof bidderTotals> }): string {
  const parts: string[] = [`${r.bids} bid${r.bids === 1 ? "" : "s"}${r.asSubmitted ? ", as submitted: nobody has reviewed them in Bid leveling yet" : ""}.`];
  if (r.leveledLow) parts.push(`${r.leveledLow.company} is the ${r.asSubmitted ? "lowest complete bid" : "leveled low"} at ${usd(r.leveledLow.total)}.`);
  else parts.push("No bid is fully leveled yet.");
  if (r.apparentLow && r.apparentLow.company !== r.leveledLow?.company) {
    const open = r.gaps.filter(g => g.company === r.apparentLow!.company).length;
    parts.push(`${r.apparentLow.company} is the apparent low at ${usd(r.apparentLow.total)}${apparent?.t.exceptions || open ? `, with ${open || apparent!.t.exceptions} scope item${(open || apparent!.t.exceptions) === 1 ? "" : "s"} excluded or partly covered` : ""}.`);
  }
  if (r.spread != null) parts.push(`Spread ${usd(r.spread)} (${r.spreadPercent}%) between the lowest and highest ${r.spreadBasis} totals.`);
  if (r.lowVsBudget != null) parts.push(`The low is ${usd(Math.abs(r.lowVsBudget))} ${r.lowVsBudget > 0 ? "over" : "under"} the trade budget of ${usd(r.budget!)} (${r.budgetBasis}).`);
  parts.push(r.selected ? `${r.selected.company} is selected at ${usd(r.selected.amount)} (${r.selected.stage}).` : "No bidder is selected yet.");
  return parts.join(" ");
}

/** "Jelleff Recreation Center Drywall bid summary 2026-10-22.xlsx", safe as a file name. */
export const reportFileName = (r: BidPackageReport) => `${r.projectName} ${r.trade} bid summary ${r.asOf}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() + ".xlsx";

type Xlsx = typeof import("xlsx");
const MONEY = '"$"#,##0;[Red]-"$"#,##0';

/** The report as a workbook: Summary, Ranked bids, Plugs and adjustments, Exclusions and gaps. Pass the loaded xlsx module. */
export function reportWorkbook(r: BidPackageReport, XLSX: Xlsx): WorkBook {
  const book = XLSX.utils.book_new();
  const sheet = (name: string, rows: (string | number | null)[][], money: number[], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows); // a null leaves its cell blank
    for (let i = 1; i < rows.length; i++) for (const c of money) { const cell = ws[XLSX.utils.encode_cell({ r: i, c })]; if (cell && typeof cell.v === "number") cell.z = MONEY; }
    ws["!cols"] = widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(book, ws, name);
  };
  sheet("Summary", [
    ["Bid package summary", ""],
    ["Project", r.projectName], ["Trade", [r.code, r.trade].filter(Boolean).join(" ")], ["As of", r.asOf],
    ["Basis", r.asSubmitted ? "Bids as submitted, not yet reviewed in Bid leveling" : "Leveled in Bid leveling"],
    ["Bids", r.bids],
    ["Leveled low", r.leveledLow ? `${r.leveledLow.company}` : "None yet"], ["Leveled low total", r.leveledLow?.total ?? null],
    ["Apparent low", r.apparentLow?.company ?? "None"], ["Apparent low total", r.apparentLow?.total ?? null],
    ["Selected bidder", r.selected ? `${r.selected.company} (${r.selected.stage})` : "None yet"], ["Selected amount", r.selected?.amount ?? null],
    [`Lowest ${r.spreadBasis} total`, r.lowestTotal], [`Highest ${r.spreadBasis} total`, r.highestTotal], ["Spread", r.spread], ["Spread %", r.spreadPercent],
    ["Trade budget", r.budget], ["Low vs budget", r.lowVsBudget], ["Budget from", r.budgetBasis ?? "No budget line found"],
    ["Summary", r.summary],
  ], [], [22, 90]);
  sheet("Ranked bids", [
    ["Rank", "Company", "Status", "Base bid", "Adjustments (plugs)", "Bond", "Accepted VE", "Provisional total", "Leveled total", "Vs low"],
    ...r.ranked.map(b => [b.rank, b.company, b.status, b.baseBid, b.adjustments, b.bond, b.acceptedVe, b.provisionalTotal, b.leveledTotal, b.vsLow]),
  ], [3, 4, 5, 6, 7, 8, 9], [6, 28, 44, 14, 18, 12, 13, 16, 14, 12]);
  sheet("Plugs and adjustments", [
    ["Company", "Scope item", "Answer", "Amount", "Approved", "Note"],
    ...r.adjustments.map(l => [l.company, l.item, l.answer, l.amount, l.approved ? "Yes" : "No", l.note]),
  ], [3], [28, 60, 10, 14, 10, 60]);
  sheet("Exclusions and gaps", [
    ["Company", "Scope item", "Required", "Answer", "Plugged", "Note"],
    ...r.gaps.map(l => [l.company, l.item, l.required ? "Yes" : "No", l.answer, l.amount || null, l.note]),
  ], [4], [28, 60, 10, 10, 14, 60]);
  // The Summary sheet's money rows (the totals, spread, budget) and its percentage.
  const summary = book.Sheets.Summary;
  for (const row of [7, 9, 11, 12, 13, 14, 16, 17]) { const cell = summary[XLSX.utils.encode_cell({ r: row, c: 1 })]; if (cell && typeof cell.v === "number") cell.z = MONEY; }
  const pctCell = summary[XLSX.utils.encode_cell({ r: 15, c: 1 })]; if (pctCell && typeof pctCell.v === "number") pctCell.z = '0.0"%"';
  return book;
}

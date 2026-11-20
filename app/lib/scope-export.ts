// Exporting scopes (Marcel's issues log, item 20, 18 Nov: "Export function is weird, when i click export it exports all
// the trades, but seems to be missing language or not the same language as scope shown under every trade ... it also
// exports as a CSV, in the CSV it needs to break them out into every trade as a tab. Also have it ask us what we want to
// export, as in which trades ... also will need the option to export as a PDF as well ... So our software would need to
// extract scopes as excel or as PDF only"). The old CSV held only the detailed items, each once, with the lines that
// apply to every trade under none of them, while each trade opens on its General scope. Now: tradeScopes gives what each
// chosen trade shows — its General scope lines and its whole bid form, the lines for every trade included — and it
// becomes an Excel workbook (a Summary tab, then a tab per trade) here, or a PDF in lib/scope-pdf. Pure; the screen
// passes the loaded xlsx module.

import type { WorkBook } from "xlsx";
import { bidForm, type Procurement } from "./procurement";

export type ScopeExportChoice = { packageIds: string[]; general: boolean; detailed: boolean };
export type ExportSheet = { name: string; rows: (string | number)[][]; widths: number[] };

const STATUS: Record<string, string> = { approved: "Approved", draft: "Draft" };
/** Excel's rules for a tab name: at most 31 characters, none of \ / ? * [ ] :, unique in the book. */
export function sheetName(wanted: string, taken: Set<string>): string {
  const base = wanted.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Trade";
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

/** What one trade shows, for any format: its General scope lines and its whole bid form, the lines for every trade first. */
export type TradeScope = {
  packageId: string; code: string; trade: string;
  /** The published bid form's version, or null before publishing. */
  publishedVersion: number | null;
  /** The General scope lines with how many detailed items each covers; null when the General scope wasn't chosen. */
  general: { text: string; covers: number }[] | null;
  /** The detailed bid-form lines; null when the detailed scope wasn't chosen. Counts are kept either way. */
  detailed: { title: string; detail: string; source: string; status: string; everyTrade: boolean }[] | null;
  counts: { general: number; detailed: number; approved: number };
};

/** The chosen trades' scopes, in the trades' order. Throws with a message to show. */
export function tradeScopes(state: Procurement, choice: ScopeExportChoice): TradeScope[] {
  const chosen = state.packages.filter(p => choice.packageIds.includes(p.id));
  if (!chosen.length) throw new Error("Choose at least one trade to export.");
  if (!choice.general && !choice.detailed) throw new Error("Choose the general scope, the detailed scope, or both.");
  return chosen.map(pkg => {
    const lines = pkg.general?.lines ?? [], items = bidForm(state, pkg.id);
    return {
      packageId: pkg.id, code: pkg.code, trade: pkg.name, publishedVersion: pkg.published?.version ?? null,
      general: choice.general ? lines.map(line => ({ text: line.text, covers: line.members.length })) : null,
      detailed: choice.detailed ? items.map(item => ({ title: item.title, detail: item.detail, source: item.source, status: STATUS[item.status] ?? item.status, everyTrade: !!item.allTrades })) : null,
      counts: { general: lines.length, detailed: items.length, approved: items.filter(s => s.status === "approved").length },
    };
  });
}

export const publishedLabel = (scope: TradeScope) => scope.publishedVersion === null ? "Bid form not published yet" : `Bid form published, version ${scope.publishedVersion}`;
export const NO_GENERAL = "No general scope written for this trade yet.";
export const NO_DETAILED = "No detailed scope items for this trade yet.";

/** One trade's tab. */
function tradeSheet(scope: TradeScope, projectName: string, name: string): ExportSheet {
  const rows: (string | number)[][] = [[`${projectName} · ${scope.code} ${scope.trade}`], [publishedLabel(scope)]];
  if (scope.general) {
    rows.push([], ["General scope"]);
    if (scope.general.length) { rows.push(["#", "Scope", "Detailed items it covers"]); scope.general.forEach((line, i) => rows.push([i + 1, line.text, line.covers])); }
    else rows.push(["", NO_GENERAL]);
  }
  if (scope.detailed) {
    rows.push([], ["Detailed scope"]);
    if (scope.detailed.length) {
      rows.push(["#", "Scope", "Detail", "Source", "Status", "Applies to"]);
      scope.detailed.forEach((item, i) => rows.push([i + 1, item.title, item.detail, item.source, item.status, item.everyTrade ? "Every trade" : scope.trade]));
    } else rows.push(["", NO_DETAILED]);
  }
  return { name, rows, widths: [6, 70, 60, 26, 12, 22] };
}

/** The workbook's tabs: a Summary, then one per chosen trade, in the trades' order. Throws with a message to show. */
export function scopeExportSheets(state: Procurement, choice: ScopeExportChoice, projectName: string): ExportSheet[] {
  const scopes = tradeScopes(state, choice);
  const taken = new Set<string>(["summary"]);
  const trades = scopes.map(scope => tradeSheet(scope, projectName, sheetName(`${scope.code} ${scope.trade}`, taken)));
  const summary: ExportSheet = { name: "Summary", widths: [12, 44, 16, 16, 16, 24, 34], rows: [
    [`${projectName} · Scopes`], [],
    ["CSI", "Trade", "General lines", "Detailed items", "Approved", "Bid form", "Tab"],
    ...scopes.map((scope, i) => [scope.code, scope.trade, scope.counts.general, scope.counts.detailed, scope.counts.approved, scope.publishedVersion === null ? "Not published" : `Published v${scope.publishedVersion}`, trades[i].name]),
  ]};
  return [summary, ...trades];
}

/** The tabs as an Excel workbook. Pass the loaded xlsx module. */
export function scopeWorkbook(sheets: ExportSheet[], XLSX: typeof import("xlsx")): WorkBook {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!cols"] = sheet.widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(book, ws, sheet.name);
  }
  return book;
}

/** A name safe on Windows and macOS: none of \ / : * ? " < > |, single spaces. */
export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

/** "Maple Street Recreation Center scopes 2026-11-20.xlsx" (or .pdf, .zip). */
export const scopeExportFileName = (projectName: string, date = new Date().toISOString().slice(0, 10), extension: "xlsx" | "pdf" | "zip" = "xlsx") =>
  `${safeFileName(`${projectName} scopes ${date}`)}.${extension}`;

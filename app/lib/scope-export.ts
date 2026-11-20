// Exporting scopes (Marcel's issues log, item 20, 18 Nov: "Export function is weird, when i click export it exports all
// the trades, but seems to be missing language or not the same language as scope shown under every trade ... it also
// exports as a CSV, in the CSV it needs to break them out into every trade as a tab. Also have it ask us what we want to
// export, as in which trades"). The old CSV held only the detailed items, each once, with the lines that apply to every
// trade under none of them, while each trade opens on its General scope. Now: an Excel workbook, one tab per chosen
// trade, each holding what that trade shows — its General scope lines and its whole bid form, the lines for every trade
// included — and a Summary tab first. Pure; the screen passes the loaded xlsx module.

import type { WorkBook } from "xlsx";
import { bidForm, type Procurement, type TradePackage } from "./procurement";

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

/** One trade's tab: its General scope lines, then its bid form, the lines for every trade first, as the trade shows them. */
function tradeSheet(state: Procurement, pkg: TradePackage, choice: ScopeExportChoice, projectName: string, name: string): ExportSheet {
  const rows: (string | number)[][] = [
    [`${projectName} · ${pkg.code} ${pkg.name}`],
    [pkg.published ? `Bid form published, version ${pkg.published.version}` : "Bid form not published yet"],
  ];
  if (choice.general) {
    rows.push([], ["General scope"]);
    const lines = pkg.general?.lines ?? [];
    if (lines.length) { rows.push(["#", "Scope", "Detailed items it covers"]); lines.forEach((line, i) => rows.push([i + 1, line.text, line.members.length])); }
    else rows.push(["", "No general scope written for this trade yet."]);
  }
  if (choice.detailed) {
    rows.push([], ["Detailed scope"]);
    const items = bidForm(state, pkg.id);
    if (items.length) {
      rows.push(["#", "Scope", "Detail", "Source", "Status", "Applies to"]);
      items.forEach((item, i) => rows.push([i + 1, item.title, item.detail, item.source, STATUS[item.status] ?? item.status, item.allTrades ? "Every trade" : pkg.name]));
    } else rows.push(["", "No detailed scope items for this trade yet."]);
  }
  return { name, rows, widths: [6, 70, 60, 26, 12, 22] };
}

/** The workbook's tabs: a Summary, then one per chosen trade, in the trades' order. Throws with a message to show. */
export function scopeExportSheets(state: Procurement, choice: ScopeExportChoice, projectName: string): ExportSheet[] {
  const chosen = state.packages.filter(p => choice.packageIds.includes(p.id));
  if (!chosen.length) throw new Error("Choose at least one trade to export.");
  if (!choice.general && !choice.detailed) throw new Error("Choose the general scope, the detailed scope, or both.");
  const taken = new Set<string>(["summary"]);
  const trades = chosen.map(pkg => tradeSheet(state, pkg, choice, projectName, sheetName(`${pkg.code} ${pkg.name}`, taken)));
  const summary: ExportSheet = { name: "Summary", widths: [12, 44, 16, 16, 16, 24, 34], rows: [
    [`${projectName} · Scopes`], [],
    ["CSI", "Trade", "General lines", "Detailed items", "Approved", "Bid form", "Tab"],
    ...chosen.map((pkg, i) => {
      const items = bidForm(state, pkg.id);
      return [pkg.code, pkg.name, pkg.general?.lines.length ?? 0, items.length, items.filter(s => s.status === "approved").length, pkg.published ? `Published v${pkg.published.version}` : "Not published", trades[i].name];
    }),
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

/** "Maple Street Recreation Center scopes 2026-11-20.xlsx", safe as a file name. */
export const scopeExportFileName = (projectName: string, date = new Date().toISOString().slice(0, 10)) =>
  `${projectName} scopes ${date}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() + ".xlsx";

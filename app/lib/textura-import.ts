// Percent complete from Textura (Marcel's Software Features list, item 28: "Subcontractor aggregate limits - links to
// textura and other accounting softwares used by GCs"). Textura's API needs credentials only MCN's Textura administrator
// can issue, so until then the contracts team exports Textura's payment report (Excel or CSV) and imports it here.
// The report's columns are found by their names (Textura and other accounting exports word them differently), its
// line items are added up per subcontractor and project, and each total is matched to an awarded contract in
// Structor. Nothing changes until the preview is applied. Pure; the browser reads the file (xlsx for Excel).

import type { Exposure } from "./aggregate-limits";

/** One subcontractor's billing on one project, as the report gives it. `percent` is 0 to 100. */
export type TexturaRow = { company: string; project: string; contract: string; value: number | null; completed: number | null; percent: number };
export type TexturaMatch = { awardId: string; companyId: string; company: string; projectName: string; trade: string; was: number | null; percent: number; row: TexturaRow };
export type TexturaMiss = { row: TexturaRow; reason: string };

const COLUMNS: Record<keyof Omit<TexturaRow, "percent"> | "percent", RegExp> = {
  company: /^(sub ?contractor|subcontractor name|vendor|vendor name|company|organi[sz]ation|payee|trade partner)\b/i,
  project: /^(project|project name|job|job name)\b/i,
  contract: /^(contract|commitment|subcontract) ?(#|no\.?|number|id)$/i,
  value: /(revised|current|adjusted|total)?\s*(contract|commitment|scheduled)\s*(value|amount|sum)|^scheduled value$/i,
  completed: /(total )?(work )?completed( (and|&) stored)?( to date)?|billed to date|earned to date|amount billed/i,
  percent: /^(%|percent|pct\.?)\s*(complete|completed)?$|^% ?complete|percent complete|% comp/i,
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** "$1,250,000.50", "(25,000)", "1250000" → dollars; null when the cell isn't an amount. */
export function money(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = clean(v); if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const n = Number(s.replace(/[()$,\s-]/g, ""));
  return Number.isFinite(n) && /\d/.test(s) ? (neg ? -n : n) : null;
}
/** "45%", "45", 0.45 (Excel's percent cells) → 45; null when it isn't one. */
function percentCell(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? (v > 0 && v <= 1 ? v * 100 : v) : null;
  const s = clean(v).replace("%", ""); if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The first row that names a company column and a progress column (a percent, or completed and value): the header. */
function headerAt(table: unknown[][]): { at: number; col: Partial<Record<keyof typeof COLUMNS, number>> } | null {
  for (let r = 0; r < Math.min(table.length, 25); r++) {
    const col: Partial<Record<keyof typeof COLUMNS, number>> = {};
    table[r].forEach((cell, c) => {
      const h = clean(cell);
      if (!h) return;
      for (const key of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) if (col[key] === undefined && COLUMNS[key].test(h)) { col[key] = c; break; }
    });
    if (col.company !== undefined && (col.percent !== undefined || (col.completed !== undefined && col.value !== undefined))) return { at: r, col };
  }
  return null;
}

/**
 * The report's rows, one per subcontractor and project: line items (schedule-of-values lines) added up, the percent
 * worked out from dollars when both are there (completed ÷ value), else read from the % column. Totals and blank rows
 * are left out. Throws a plain message when the file has no usable columns.
 */
export function readTexturaTable(table: unknown[][]): TexturaRow[] {
  const head = headerAt(table);
  if (!head) throw new Error("This file has no subcontractor column with a percent complete (or completed and contract value) next to it. Export Textura's payment or draw report with those columns.");
  const { col } = head;
  const cell = (row: unknown[], key: keyof typeof COLUMNS) => (col[key] === undefined ? undefined : row[col[key]!]);
  const groups = new Map<string, { company: string; project: string; contract: string; value: number; completed: number; hasDollars: boolean; percents: number[] }>();
  for (const row of table.slice(head.at + 1)) {
    const company = clean(cell(row, "company"));
    if (!company || /^(grand )?total\b|^subtotal\b/i.test(company)) continue;
    const project = clean(cell(row, "project")), contract = clean(cell(row, "contract"));
    const value = money(cell(row, "value")), completed = money(cell(row, "completed")), percent = percentCell(cell(row, "percent"));
    if (value === null && completed === null && percent === null) continue;
    const key = `${company.toLowerCase()}|${project.toLowerCase()}|${contract.toLowerCase()}`;
    const g = groups.get(key) ?? { company, project, contract, value: 0, completed: 0, hasDollars: false, percents: [] };
    if (value !== null && completed !== null) { g.value += value; g.completed += completed; g.hasDollars = true; }
    if (percent !== null) g.percents.push(percent);
    groups.set(key, g);
  }
  return [...groups.values()].map(g => {
    const fromDollars = g.hasDollars && g.value > 0 ? (g.completed / g.value) * 100 : null;
    const raw = fromDollars ?? (g.percents.length ? g.percents.reduce((a, b) => a + b, 0) / g.percents.length : 0);
    return { company: g.company, project: g.project, contract: g.contract, value: g.hasDollars ? g.value : null, completed: g.hasDollars ? g.completed : null, percent: Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10 };
  });
}

/** A CSV export as rows of cells: quoted cells may hold commas, line breaks and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) { if (ch === "\"") { if (s[i + 1] === "\"") { cell += "\""; i++; } else quoted = false; } else cell += ch; continue; }
    if (ch === "\"") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/** "Capitol Wall Systems, Inc." → "capitol wall systems"; names compared without punctuation and company endings. */
export const companyKey = (name: string) => name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(inc|incorporated|llc|l l c|co|corp|corporation|company|ltd|limited|the|lp|llp)\b/g, " ").replace(/\s+/g, " ").trim();
const sameName = (a: string, b: string) => { const x = companyKey(a), y = companyKey(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x)))); };
const sameProject = (a: string, b: string) => { const x = companyKey(a), y = companyKey(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

/**
 * Each report row against the awarded contracts on the Aggregate limits page: same company, then the same project when
 * the report names one, then the contract amount (within 1%) when the company still has several. A row that can't be
 * tied to exactly one contract is listed with the reason, never guessed.
 */
export function matchTextura(rows: TexturaRow[], exposures: Pick<Exposure, "companyId" | "company" | "contracts">[]): { matches: TexturaMatch[]; misses: TexturaMiss[] } {
  const matches: TexturaMatch[] = [], misses: TexturaMiss[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const companies = exposures.filter(e => sameName(e.company, row.company));
    if (!companies.length) { misses.push({ row, reason: `No company called "${row.company}" has an awarded contract in Structor.` }); continue; }
    let options = companies.flatMap(e => e.contracts.map(c => ({ e, c })));
    if (row.project) {
      const onProject = options.filter(o => sameProject(o.c.projectName, row.project));
      if (!onProject.length) { misses.push({ row, reason: `${row.company} has no awarded contract on a project called "${row.project}".` }); continue; }
      options = onProject;
    }
    if (options.length > 1 && row.value !== null) {
      const byAmount = options.filter(o => Math.abs(o.c.amount - row.value!) <= Math.max(1, o.c.amount * 0.01));
      if (byAmount.length) options = byAmount;
    }
    if (options.length !== 1) { misses.push({ row, reason: `${row.company} has ${options.length} awarded contracts here; add the project (or contract value) column to the export so it can tell them apart.` }); continue; }
    const { e, c } = options[0];
    if (taken.has(c.awardId)) { misses.push({ row, reason: `Another row already set ${row.company}'s ${c.trade} contract on ${c.projectName}.` }); continue; }
    taken.add(c.awardId);
    matches.push({ awardId: c.awardId, companyId: e.companyId, company: e.company, projectName: c.projectName, trade: c.trade, was: c.percent, percent: row.percent, row });
  }
  return { matches, misses };
}

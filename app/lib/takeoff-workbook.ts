// The takeoff by trade as Marcel's ROM unit-pricing workbook (issues log, item 16: "see example on one drive under -
// templates, takeoff folder"; his "Take off by trade example.xlsx"): a START HERE tab, then a tab per trade with
// # · Scope Description · GC Qty · Unit · Bidder Qty · Unit Price ($) · Extended ($) · Scope Status · Qualifications /
// Assumptions, a base subtotal, four alternate rows, the totals and the trade's qualifications. Bidders fill the yellow
// cells; Extended and the totals are formulas. A Reference column after his nine says which sheet or section each line
// is from. The copy for bidders never shows the contractor's unit prices (his sheets: "Do not include MCN budget
// rates"); the internal copy does, and says so on every tab.
//
// Written as SpreadsheetML here, not through the xlsx package, whose free build writes no fills, borders or drop-downs.
// Pure: bytes in, nothing else.

import { strToU8, zipSync } from "fflate";
import { sheetName } from "./scope-export";
import type { Project } from "./projects";
import type { TradeTakeoff } from "./takeoff-by-trade";

export type TakeoffWorkbookInput = {
  project: Pick<Project, "name" | "location">;
  /** As it should read, e.g. "Thursday, December 10, 2026". */
  pricingDue: string;
  laborBasis: string;
  trades: TradeTakeoff[];
  /** The contractor's unit prices in the Unit Price column: an internal copy, never for bidders. */
  includeRates: boolean;
};

export const SCOPE_STATUSES = ["Included", "Excluded", "By Others", "Clarify"] as const;
export const ALTERNATE_ROWS = 4;
export const QUALIFICATION_ROWS = 5;
const HEADERS = ["#", "Scope Description", "GC Qty", "Unit", "Bidder Qty", "Unit Price ($)", "Extended ($)", "Scope Status", "Qualifications / Assumptions", "Reference"];
const WIDTHS = [6, 62, 12, 8, 12, 14, 16, 13, 40, 24];
const COLS = "ABCDEFGHIJ";

// Cell styles, by their place in styles.xml's cellXfs.
const S = { plain: 0, title: 1, bold: 2, header: 3, text: 4, center: 5, int: 6, dec: 7, inText: 8, inInt: 9, inDec: 10, inMoney: 11, money: 12, totalLabel: 13, totalMoney: 14, note: 15, coverLabel: 16, coverValue: 17, inCenter: 18 } as const;

/** "Thursday, December 10, 2026" from "2026-12-10"; any other text as it is. */
export function dueLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return date.trim();
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** The labor basis as the project states it: its wage scale and certification programs. Empty when it says nothing. */
export function laborBasisOf(project: Pick<Project, "kickoff" | "certifications" | "certificationTargets">): string {
  const wage = project.kickoff?.wageScale;
  const parts = [wage === true ? `${project.kickoff.wageScaleType.trim() || "Prevailing wage"} rates apply` : wage === false ? "No wage scale" : ""];
  for (const program of project.certifications ?? []) {
    const target = project.certificationTargets?.[program];
    parts.push(target ? `${program} ${target}% required` : `${program} required`);
  }
  return parts.filter(Boolean).join("; ");
}

const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (text: string) => text.replace(XML_BAD, "").slice(0, 32_000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Cell = { s: number; v?: string | number; f?: string; cached?: number | "" };
type Row = { cells: Map<number, Cell>; height?: number };
class Sheet {
  rows = new Map<number, Row>();
  merges: string[] = [];
  validations: string[] = [];
  set(row: number, col: number, cell: Cell) {
    const r: Row = this.rows.get(row) ?? { cells: new Map() };
    r.cells.set(col, cell);
    this.rows.set(row, r);
  }
  height(row: number, height: number) { const r: Row = this.rows.get(row) ?? { cells: new Map() }; r.height = height; this.rows.set(row, r); }
  /** One value across columns `from`..`to`: the first cell holds it, every cell carries the style (and so the border). */
  merge(row: number, from: number, to: number, cell: Cell) {
    this.set(row, from, cell);
    for (let c = from + 1; c <= to; c++) this.set(row, c, { s: cell.s });
    this.merges.push(`${COLS[from]}${row}:${COLS[to]}${row}`);
  }
  xml(opts: { widths: number[]; selected: boolean; frozen?: number }): string {
    const ordered = [...this.rows].sort((a, b) => a[0] - b[0]);
    const last = ordered.at(-1)?.[0] ?? 1;
    const data = ordered.map(([r, row]) => {
      const cells = [...row.cells].sort((a, b) => a[0] - b[0]).map(([c, cell]) => cellXml(`${COLS[c]}${r}`, cell)).join("");
      return `<row r="${r}"${row.height ? ` ht="${row.height}" customHeight="1"` : ""}>${cells}</row>`;
    }).join("");
    const pane = opts.frozen ? `<pane ySplit="${opts.frozen}" topLeftCell="A${opts.frozen + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${opts.frozen + 1}" sqref="A${opts.frozen + 1}"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${COLS[opts.widths.length - 1]}${last}"/>`
      + `<sheetViews><sheetView workbookViewId="0"${opts.selected ? ` tabSelected="1"` : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`
      + `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      + `<sheetData>${data}</sheetData>`
      + (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "")
      + (this.validations.length ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${this.validations.join(" ")}"><formula1>${esc(`"${SCOPE_STATUSES.join(",")}"`)}</formula1></dataValidation></dataValidations>` : "")
      + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
}
function cellXml(ref: string, cell: Cell): string {
  const style = cell.s ? ` s="${cell.s}"` : "";
  if (cell.f !== undefined) {
    const cached = cell.cached === undefined || cell.cached === "" ? null : cell.cached;
    return cached === null ? `<c r="${ref}"${style} t="str"><f>${esc(cell.f)}</f><v></v></c>` : `<c r="${ref}"${style}><f>${esc(cell.f)}</f><v>${cached}</v></c>`;
  }
  if (typeof cell.v === "number") return `<c r="${ref}"${style}><v>${cell.v}</v></c>`;
  if (typeof cell.v === "string" && cell.v) return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
  return `<c r="${ref}"${style}/>`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const qtyStyle = (n: number, input: boolean) => Number.isInteger(n) ? (input ? S.inInt : S.int) : (input ? S.inDec : S.dec);

/** One trade's tab, laid out like his; `includeRates` fills Unit Price with the contractor's own. */
function tradeSheet(trade: TradeTakeoff, includeRates: boolean): Sheet {
  const sh = new Sheet();
  sh.merge(1, 0, 9, { s: S.title, v: `${trade.code} | ${trade.name.toUpperCase()}` });
  sh.merge(2, 0, 9, { s: S.note, v: includeRates
    ? "INTERNAL COPY: the Unit Price column holds the GC's own unit prices. Do not send this copy to bidders."
    : "Enter yellow cells only. GC quantities are preliminary. Quote complete turnkey installed unit pricing." });
  sh.height(2, 30);
  sh.set(3, 0, { s: S.bold, v: "Subcontractor:" }); sh.merge(3, 1, 2, { s: S.inText });
  sh.set(3, 3, { s: S.bold, v: "Contact:" }); sh.merge(3, 4, 5, { s: S.inText });
  sh.set(3, 6, { s: S.bold, v: "Date:" }); sh.merge(3, 7, 8, { s: S.inText });
  HEADERS.forEach((h, c) => sh.set(4, c, { s: S.header, v: h }));
  sh.height(4, 30);

  let r = 5;
  const first = r;
  if (!trade.lines.length) { sh.merge(r, 1, 9, { s: S.note, v: "No detailed scope lines for this trade yet." }); r++; }
  for (const line of trade.lines) {
    const q = line.item.quantity, rate = includeRates && line.extended !== null ? line.item.unitPrice!.rate : null;
    sh.set(r, 0, { s: S.center, v: line.number });
    sh.set(r, 1, { s: S.text, v: line.item.title });
    sh.set(r, 2, q ? { s: qtyStyle(q.value, false), v: q.value } : { s: S.text });
    sh.set(r, 3, { s: S.center, v: q?.unit ?? "" });
    sh.set(r, 4, q ? { s: qtyStyle(q.value, true), v: q.value } : { s: S.inDec });
    sh.set(r, 5, rate !== null ? { s: S.inMoney, v: rate } : { s: S.inMoney });
    sh.set(r, 6, { s: S.money, f: `IF(OR(E${r}="",F${r}=""),"",E${r}*F${r})`, cached: q && rate !== null ? round2(q.value * rate) : "" });
    sh.set(r, 7, { s: S.inCenter, v: "Included" });
    sh.set(r, 8, { s: S.inText });
    sh.set(r, 9, { s: S.text, v: line.item.source });
    r++;
  }
  const lastLine = r - 1;
  if (trade.lines.length) sh.validations.push(`H${first}:H${lastLine}`);
  const base = r;
  const baseCached = includeRates ? round2(trade.lines.reduce((sum, l) => sum + (l.extended ?? 0), 0)) : 0;
  for (let c = 0; c < 10; c++) sh.set(base, c, { s: S.totalLabel });
  sh.set(base, 1, { s: S.totalLabel, v: "BASE SCOPE SUBTOTAL" });
  sh.set(base, 6, { s: S.totalMoney, f: `SUM(G${first}:G${Math.max(first, lastLine)})`, cached: baseCached });
  r = base + 2;
  sh.set(r, 1, { s: S.bold, v: "ADDITIONAL ALLOWANCES / ALTERNATES (identify separately)" });
  r++;
  const altFirst = r;
  for (let i = 0; i < ALTERNATE_ROWS; i++, r++) {
    sh.set(r, 0, { s: S.center, v: "ALT" });
    sh.set(r, 1, { s: S.inText });
    sh.set(r, 2, { s: S.text });
    sh.set(r, 3, { s: S.center, v: "LS" });
    sh.set(r, 4, { s: S.inInt, v: 1 });
    sh.set(r, 5, { s: S.inMoney });
    sh.set(r, 6, { s: S.money, f: `IF(OR(E${r}="",F${r}=""),"",E${r}*F${r})`, cached: "" });
    sh.set(r, 7, { s: S.inCenter });
    sh.set(r, 8, { s: S.inText });
    sh.set(r, 9, { s: S.text });
  }
  sh.validations.push(`H${altFirst}:H${r - 1}`);
  const altTotal = r;
  for (let c = 0; c < 10; c++) sh.set(altTotal, c, { s: S.totalLabel });
  sh.set(altTotal, 1, { s: S.totalLabel, v: "ADDITIONAL ALLOWANCES TOTAL" });
  sh.set(altTotal, 6, { s: S.totalMoney, f: `SUM(G${altFirst}:G${r - 1})`, cached: 0 });
  const grand = altTotal + 1;
  for (let c = 0; c < 10; c++) sh.set(grand, c, { s: S.totalLabel });
  sh.set(grand, 1, { s: S.totalLabel, v: "TOTAL INCLUDING ADDITIONAL ALLOWANCES" });
  sh.set(grand, 6, { s: S.totalMoney, f: `G${base}+G${altTotal}`, cached: baseCached });
  r = grand + 2;
  sh.set(r, 1, { s: S.bold, v: "Trade qualifications / exclusions:" });
  for (let i = 1; i <= QUALIFICATION_ROWS; i++) sh.merge(r + i, 1, 8, { s: S.inText });
  return sh;
}

function coverSheet(input: TakeoffWorkbookInput, tabs: { trade: TradeTakeoff }[]): Sheet {
  const sh = new Sheet();
  sh.merge(1, 0, 3, { s: S.title, v: `${input.project.name.toUpperCase()} | ROM UNIT PRICING` });
  if (input.includeRates) sh.merge(2, 0, 3, { s: S.note, v: "INTERNAL COPY with the GC's unit prices. Do not send it to bidders." });
  const fields: [string, string, boolean?][] = [
    ["PROJECT", [input.project.name, input.project.location].filter(s => s?.trim()).join(" · ")],
    ["PRICING DUE", input.pricingDue],
    ["SUBCONTRACTOR", "", true],
    ["CONTACT / EMAIL", "", true],
    ["TRADE / BID PACKAGE", "Complete only applicable trade tab(s)"],
    ["LABOR BASIS", input.laborBasis],
    ["PRICING BASIS", "Complete turnkey installed unit costs; labor, material, equipment, access, supervision, testing and coordination"],
    ["QUANTITIES", "GC preliminary quantities; confirm or revise in the Bidder Qty column"],
    ["SCOPE", "Mark Included, Excluded, By Others or Clarify for every applicable row"],
    ["ALLOWANCES", "List concealed conditions and extra scope separately; avoid double counting"],
    ["RETURN", "Return completed Excel with proposal, exclusions and qualifications"],
  ];
  let r = 3;
  for (const [label, value, input_] of fields) {
    sh.set(r, 0, { s: S.coverLabel, v: label });
    sh.merge(r, 1, 3, { s: input_ ? S.inText : S.coverValue, v: value });
    r++;
  }
  r++;
  sh.set(r++, 0, { s: S.bold, v: "HOW TO COMPLETE" });
  sh.merge(r, 0, 3, { s: S.coverValue, v: "1. Open your trade tab. 2. Confirm scope and enter your quantity, installed unit rate and comments in yellow cells. 3. Add separate allowances/alternates below the base scope. 4. Return this file with your formal proposal." });
  sh.height(r, 48);
  r += 2;
  sh.set(r++, 0, { s: S.bold, v: "Trade tabs provided" });
  ["Code", "Trade", "Lines"].forEach((h, c) => sh.set(r, c, { s: S.header, v: h }));
  r++;
  for (const { trade } of tabs) {
    sh.set(r, 0, { s: S.text, v: trade.code });
    sh.set(r, 1, { s: S.text, v: trade.name });
    sh.set(r, 2, { s: S.int, v: trade.lines.length });
    r++;
  }
  return sh;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>`
  + `<fonts count="5"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>`
  + `<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF99"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>`
  + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + (() => {
    const xf = (num: number, font: number, fill: number, border: number, align = "") =>
      `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${align ? ` applyAlignment="1">${align}</xf>` : "/>"}`;
    const top = `<alignment vertical="top"/>`, wrap = `<alignment vertical="top" wrapText="1"/>`, center = `<alignment horizontal="center" vertical="top"/>`;
    const list = [
      xf(0, 0, 0, 0),                     // plain
      xf(0, 2, 0, 0),                     // title
      xf(0, 1, 0, 0),                     // bold
      xf(0, 4, 3, 1, `<alignment horizontal="center" vertical="center" wrapText="1"/>`), // header
      xf(0, 0, 0, 1, wrap),               // text
      xf(0, 0, 0, 1, center),             // center
      xf(3, 0, 0, 1, top),                // int
      xf(4, 0, 0, 1, top),                // dec
      xf(0, 0, 2, 1, wrap),               // inText
      xf(3, 0, 2, 1, top),                // inInt
      xf(4, 0, 2, 1, top),                // inDec
      xf(164, 0, 2, 1, top),              // inMoney
      xf(164, 0, 0, 1, top),              // money
      xf(0, 1, 4, 1, top),                // totalLabel
      xf(164, 1, 4, 1, top),              // totalMoney
      xf(0, 3, 0, 0, wrap),               // note
      xf(0, 1, 0, 1, top),                // coverLabel
      xf(0, 0, 0, 1, wrap),               // coverValue
      xf(0, 0, 2, 1, center),             // inCenter
    ];
    return `<cellXfs count="${list.length}">${list.join("")}</cellXfs>`;
  })()
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** The workbook's bytes: START HERE, then a tab per trade given. */
export function takeoffWorkbook(input: TakeoffWorkbookInput): Uint8Array {
  const taken = new Set<string>(["start here"]);
  const tabs = input.trades.map(trade => ({ trade, name: sheetName(`${trade.code} ${trade.name}`.trim(), taken) }));
  const sheets = [
    { name: "START HERE", xml: coverSheet(input, tabs).xml({ widths: [24, 56, 12, 30], selected: true }) },
    ...tabs.map(t => ({ name: t.name, xml: tradeSheet(t.trade, input.includeRates).xml({ widths: WIDTHS, selected: false, frozen: 4 }) })),
  ];
  const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>`
    + (tabs.length ? `<definedNames>${tabs.map((t, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i + 1}">${esc(`${quoted(t.name)}!$4:$4`)}</definedName>`).join("")}</definedNames>` : "")
    + `<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(types),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml); });
  return zipSync(files, { level: 6 });
}

/** The file's name: the project, and whether it's the internal copy. */
export const workbookName = (project: string, includeRates: boolean) =>
  `${project.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Project"} takeoff by trade${includeRates ? " (internal, with unit prices)" : ""}.xlsx`;

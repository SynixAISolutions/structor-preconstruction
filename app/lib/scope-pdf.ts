// Scopes as a PDF (Marcel's issues log, item 20: "also will need the option to export as a PDF as well ... So our
// software would need to extract scopes as excel or as PDF only"). The same content as the Excel tabs (lib/scope-export
// tradeScopes): each trade from a new page with its General scope and its detailed bid form, the lines for every trade
// first. One PDF for all the chosen trades opens on a summary page; one PDF per trade is what goes to that trade's
// subcontractors. Landscape US Letter, text only, so it stays small and searchable.

import { wrapText } from "./docusign-pdf";
import { pdfText } from "./markup-export";
import { NO_DETAILED, NO_GENERAL, publishedLabel, safeFileName, type TradeScope } from "./scope-export";

const WIDTH = 792, HEIGHT = 612, MARGIN = 40, FOOTER = 30; // US Letter, landscape
const INNER = WIDTH - MARGIN * 2, BOTTOM = MARGIN + FOOTER;
const SIZE = 9, LINE = 11.5, PAD = 5;

type Column = { label: string; width: number; align?: "right" };
const GENERAL_COLUMNS: Column[] = [{ label: "#", width: 28 }, { label: "Scope", width: INNER - 28 - 110 }, { label: "Detailed items it covers", width: 110, align: "right" }];
const DETAILED_COLUMNS: Column[] = [{ label: "#", width: 28 }, { label: "Scope", width: 226 }, { label: "Detail", width: 206 }, { label: "Source", width: 112 }, { label: "Qty", width: 52, align: "right" }, { label: "Unit", width: 34 }, { label: "Status", width: INNER - 28 - 226 - 206 - 112 - 52 - 34 }];
const SUMMARY_COLUMNS: Column[] = [{ label: "CSI", width: 72 }, { label: "Trade", width: INNER - 72 - 86 * 3 - 110 }, { label: "General lines", width: 86, align: "right" }, { label: "Detailed items", width: 86, align: "right" }, { label: "Approved", width: 86, align: "right" }, { label: "Bid form", width: 110 }];

/** A cell's lines at this width: words wrapped, and a word too long for the column broken where it overflows. */
export function cellLines(text: string, width: number, widthOf: (text: string) => number): string[] {
  const out: string[] = [];
  for (const line of wrapText(pdfText(text), t => widthOf(t) <= width)) {
    let rest = line;
    while (widthOf(rest) > width && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && widthOf(rest.slice(0, cut)) > width) cut--;
      out.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }
    out.push(rest);
  }
  return out;
}

export type ScopePdfOptions = { projectName: string; exportedAt: string; summary: boolean };

/** The chosen trades as one PDF: a summary page first when `summary`, then each trade from a new page. */
export async function scopePdf(scopes: TradeScope[], options: ScopePdfOptions): Promise<Uint8Array> {
  if (!scopes.length) throw new Error("Choose at least one trade to export.");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const only = scopes.length === 1 ? scopes[0] : null;
  pdf.setTitle(pdfText(only ? `${options.projectName} · ${only.code} ${only.trade} scope` : `${options.projectName} scopes`));
  pdf.setProducer("Structor"); pdf.setCreator("Structor");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.13, 0.16), muted = rgb(0.4, 0.45, 0.49), rule = rgb(0.85, 0.87, 0.86), band = rgb(0.95, 0.96, 0.955);
  const widthOf = (face: typeof font, size: number) => (text: string) => face.widthOfTextAtSize(text, size);

  type Page = ReturnType<typeof pdf.addPage>;
  const footers: { page: Page; label: string }[] = [];
  let page = null as Page | null, y = 0, label = "";
  const newPage = () => { page = pdf.addPage([WIDTH, HEIGHT]); y = HEIGHT - MARGIN; footers.push({ page, label }); };
  const current = () => { if (!page) newPage(); return page as Page; };
  const write = (text: string, size: number, face = font, color = ink, gap = 4) => {
    for (const line of cellLines(text, INNER, widthOf(face, size))) {
      if (y - size - gap < BOTTOM) newPage();
      current().drawText(line, { x: MARGIN, y: y - size, size, font: face, color });
      y -= size + gap;
    }
  };

  /** A table: header band, rows wrapped per cell, a row too tall for the page carried on to the next with the header again. */
  const table = (columns: Column[], rows: { cells: string[]; group?: boolean }[]) => {
    const header = () => {
      const height = PAD * 2 + LINE;
      current().drawRectangle({ x: MARGIN, y: y - height, width: INNER, height, color: band });
      let x = MARGIN;
      for (const column of columns) {
        const text = pdfText(column.label), w = bold.widthOfTextAtSize(text, 8);
        current().drawText(text, { x: column.align === "right" ? x + column.width - PAD - w : x + PAD, y: y - PAD - 8.5, size: 8, font: bold, color: muted });
        x += column.width;
      }
      y -= height;
    };
    const fresh = () => { newPage(); header(); };
    if (y - (PAD * 2 + LINE) * 2 < BOTTOM) newPage();
    header();
    for (const row of rows) {
      if (row.group) {
        const lines = cellLines(row.cells[0], INNER - PAD * 2, widthOf(bold, SIZE));
        const height = PAD * 2 + lines.length * LINE;
        if (y - height - (PAD * 2 + LINE) < BOTTOM) fresh();
        lines.forEach((line, i) => current().drawText(line, { x: MARGIN + PAD, y: y - PAD - SIZE - i * LINE + 1.5, size: SIZE, font: bold, color: ink }));
        y -= height;
        current().drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.5, color: rule });
        continue;
      }
      const cells = columns.map((column, i) => cellLines(row.cells[i] ?? "", column.width - PAD * 2, widthOf(font, SIZE)));
      // A short row moves whole to the next page; a tall one (a long detail) carries on there once a few lines fit here.
      const total = Math.max(...cells.map(c => c.length));
      if (y - PAD * 2 - total * LINE < BOTTOM && (total <= 8 || Math.floor((y - BOTTOM - PAD * 2) / LINE) < 4)) fresh();
      for (let start = 0; start < total;) {
        const room = Math.floor((y - BOTTOM - PAD * 2) / LINE);
        if (room <= 0) { fresh(); continue; }
        const count = Math.min(room, total - start);
        let x = MARGIN;
        columns.forEach((column, c) => {
          cells[c].slice(start, start + count).forEach((line, i) => {
            const w = font.widthOfTextAtSize(line, SIZE);
            current().drawText(line, { x: column.align === "right" ? x + column.width - PAD - w : x + PAD, y: y - PAD - SIZE - i * LINE + 1.5, size: SIZE, font, color: ink });
          });
          x += column.width;
        });
        y -= PAD * 2 + count * LINE;
        current().drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + INNER, y }, thickness: 0.5, color: rule });
        start += count;
        if (start < total) fresh();
      }
    }
  };
  const section = (title: string) => { if (y - 70 < BOTTOM) newPage(); y -= 14; write(title, 12, bold, ink, 8); };

  if (options.summary) {
    label = `${options.projectName} · Scopes`;
    newPage();
    write(`${options.projectName} · Scopes`, 18, bold, ink, 6);
    write(`${scopes.length} trade${scopes.length === 1 ? "" : "s"}, each from a new page.`, 10, font, muted, 10);
    table(SUMMARY_COLUMNS, scopes.map(s => ({ cells: [s.code, s.trade, String(s.counts.general), String(s.counts.detailed), String(s.counts.approved), s.publishedVersion === null ? "Not published" : `Published v${s.publishedVersion}`] })));
  }

  for (const scope of scopes) {
    label = `${options.projectName} · ${scope.code} ${scope.trade}`;
    newPage();
    write(scope.trade, 18, bold, ink, 6);
    write(`${scope.code} · ${options.projectName}`, 10, font, muted, 3);
    write(publishedLabel(scope), 9, font, muted, 4);
    if (scope.general) {
      section("General scope");
      if (scope.general.length) table(GENERAL_COLUMNS, scope.general.map((line, i) => ({ cells: [String(i + 1), line.text, String(line.covers)] })));
      else write(NO_GENERAL, 10, font, muted);
    }
    if (scope.detailed) {
      section("Detailed scope");
      if (!scope.detailed.length) { write(NO_DETAILED, 10, font, muted); continue; }
      const everyTrade = scope.detailed.filter(item => item.everyTrade).length;
      const rows: { cells: string[]; group?: boolean }[] = [];
      scope.detailed.forEach((item, i) => {
        if (everyTrade && i === 0) rows.push({ cells: ["Lines for every trade"], group: true });
        if (everyTrade && i === everyTrade) rows.push({ cells: [scope.trade], group: true });
        rows.push({ cells: [String(i + 1), item.title, item.detail, item.source, item.quantity ? item.quantity.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "", item.quantity?.unit ?? "", item.status] });
      });
      table(DETAILED_COLUMNS, rows);
    }
  }

  const exported = pdfText(`Exported ${options.exportedAt}`);
  footers.forEach(({ page: p, label: text }, i) => {
    const left = cellLines(text, INNER - 220, widthOf(font, 8))[0] ?? "";
    const right = `${exported} · Page ${i + 1} of ${footers.length}`, w = font.widthOfTextAtSize(right, 8);
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 14 }, end: { x: WIDTH - MARGIN, y: MARGIN + 14 }, thickness: 0.5, color: rule });
    p.drawText(left, { x: MARGIN, y: MARGIN, size: 8, font, color: muted });
    p.drawText(right, { x: WIDTH - MARGIN - w, y: MARGIN, size: 8, font, color: muted });
  });
  return pdf.save();
}

/** One PDF per trade, named for the trade, ready to send to that trade's subcontractors. */
export async function scopePdfsByTrade(scopes: TradeScope[], options: Omit<ScopePdfOptions, "summary">): Promise<{ name: string; bytes: Uint8Array }[]> {
  const taken = new Set<string>(), out: { name: string; bytes: Uint8Array }[] = [];
  for (const scope of scopes) {
    const base = safeFileName(`${scope.code} ${scope.trade} scope`) || "Trade scope";
    let name = `${base}.pdf`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n}).pdf`;
    taken.add(name.toLowerCase());
    out.push({ name, bytes: await scopePdf([scope], { ...options, summary: false }) });
  }
  return out;
}

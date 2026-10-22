// Export of a file's markups (content viewer, 22 Oct): each marked-up page as an image with its markups drawn
// and numbered as in the viewer's list, then a list of the markups with their details, comments and links.
// Pages go in as rendered images (a drawing set can be hundreds of MB; only the marked-up pages are read).
// pdf-lib loads only when someone exports.

import type { ContentLink, Markup, TagColor } from "./project-content";
import { LINK_KINDS } from "./project-content";

export type ExportPage = { page: number; jpeg: Uint8Array };
const COLORS: Record<TagColor, [number, number, number]> = { blue: [0.15, 0.39, 0.92], orange: [0.92, 0.35, 0.05], pink: [0.86, 0.15, 0.47], purple: [0.49, 0.23, 0.93], green: [0.09, 0.64, 0.29], gray: [0.42, 0.45, 0.5] };
const LONG_SIDE = 1224; // points: an 11 x 17 sheet

/** Helvetica in a PDF covers Latin-1; typographic quotes and dashes become plain ones, anything else "?". */
export const pdfText = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/\s+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?").trim();
const linkText = (l: ContentLink) => `${LINK_KINDS.find(k => k.kind === l.kind)?.label.replace(/s$/, "") ?? l.kind}: ${l.label || l.id}`;

/**
 * The export as PDF bytes. `markups` are one revision's, numbered in the order given (docMarkups: by page,
 * then position); `pages` holds the rendered image of every page that has one.
 */
export async function markupsPdf(input: { title: string; exportedAt: string; markups: Markup[]; pages: ExportPage[] }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfText(`Markups: ${input.title}`)); pdf.setProducer("Structor"); pdf.setCreator("Structor");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const number = new Map(input.markups.map((m, i) => [m.id, i + 1]));

  for (const { page, jpeg } of [...input.pages].sort((a, b) => a.page - b.page)) {
    const marks = input.markups.filter(m => m.page === page);
    if (!marks.length) continue;
    const image = await pdf.embedJpg(jpeg), k = LONG_SIDE / Math.max(image.width, image.height);
    const W = image.width * k, H = image.height * k, sheet = pdf.addPage([W, H]);
    sheet.drawImage(image, { x: 0, y: 0, width: W, height: H });
    for (const m of marks) {
      const [x, y, w, h] = m.rect, c = rgb(...COLORS[m.color]);
      sheet.drawRectangle({ x: x * W, y: H - (y + h) * H, width: w * W, height: h * H, color: c, opacity: m.status === "resolved" ? .08 : .18, borderColor: c, borderWidth: 2 });
      const label = String(number.get(m.id)), cx = x * W, cy = H - y * H;
      sheet.drawCircle({ x: cx, y: cy, size: 11, color: c });
      sheet.drawText(label, { x: cx - bold.widthOfTextAtSize(label, 10) / 2, y: cy - 3.5, size: 10, font: bold, color: rgb(1, 1, 1) });
    }
    const head = pdfText(`${input.title} - page ${page} - ${marks.length} markup${marks.length === 1 ? "" : "s"}`);
    sheet.drawRectangle({ x: 0, y: H - 22, width: font.widthOfTextAtSize(head, 10) + 20, height: 22, color: rgb(1, 1, 1), opacity: .9 });
    sheet.drawText(head, { x: 10, y: H - 15, size: 10, font, color: rgb(.1, .1, .1) });
  }

  // The list: one block per markup, wrapped to the page, continuing onto new pages.
  const [PW, PH, M] = [792, 612, 40];
  let list = pdf.addPage([PW, PH]), y = PH - M;
  const line = (text: string, size: number, f = font, indent = 0, color = rgb(.1, .1, .1)) => {
    const words = pdfText(text).split(" "), width = PW - 2 * M - indent;
    let row = "";
    const flush = () => { if (y < M + size) { list = pdf.addPage([PW, PH]); y = PH - M; } list.drawText(row, { x: M + indent, y: y - size, size, font: f, color }); y -= size * 1.35; row = ""; };
    for (const word of words) { const next = row ? `${row} ${word}` : word; if (row && f.widthOfTextAtSize(next, size) > width) flush(); row = row ? `${row} ${word}` : word; }
    if (row) flush();
  };
  line(`Markups: ${input.title}`, 16, bold);
  line(`Exported ${input.exportedAt} - ${input.markups.length} markup${input.markups.length === 1 ? "" : "s"}`, 10, font, 0, rgb(.35, .35, .35));
  y -= 8;
  for (const m of input.markups) {
    line(`${number.get(m.id)}. ${m.title}`, 12, bold);
    line(`Page ${m.page} - ${m.status === "resolved" ? "Resolved" : "Open"}${m.assignedTo ? ` - Assigned to ${m.assignedTo}` : ""} - by ${m.createdBy}, ${m.createdAt.slice(0, 10)}`, 9, font, 14, rgb(.35, .35, .35));
    if (m.description) line(m.description, 10, font, 14);
    if (m.links.length) line(`Linked: ${m.links.map(linkText).join("; ")}`, 9, font, 14);
    for (const c of m.comments) line(`${c.by}, ${c.at.slice(0, 10)}: ${c.text}`, 9, font, 28, rgb(.25, .25, .25));
    y -= 6;
  }
  return pdf.save();
}

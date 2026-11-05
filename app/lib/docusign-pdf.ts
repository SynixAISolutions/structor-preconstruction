// The contract DocuSign carries: the subcontract and Exhibit A as one PDF, ending in a signature page whose hidden
// anchor words DocuSign turns into its signing fields (lib/docusign ANCHORS). Text only, so it's small and searchable.

import { ANCHORS, type EnvelopeRequest } from "./docusign";
import { pdfText } from "./markup-export";

const WIDTH = 612, HEIGHT = 792, MARGIN = 54; // US Letter
// A contract line that points at a stored file reads "name — /api/document-assets?id=…": a link only this app can open.
const attachedLine = (line: string) => line.replace(/\s+—\s+\/api\/document-assets\?id=[^\s]+/g, " (attached)");

/** The words that fit each line of a paragraph at this width. */
export function wrapText(line: string, fits: (text: string) => boolean): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of line.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (fits(next) || !current) current = next;
    else { out.push(current); current = word; }
  }
  if (current) out.push(current);
  return out.length ? out : [""];
}

export async function contractPdf(request: EnvelopeRequest): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfText(request.subject)); pdf.setProducer("Structor"); pdf.setCreator("Structor");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.13, 0.16), rule = rgb(0.6, 0.63, 0.66), white = rgb(1, 1, 1);
  let page = pdf.addPage([WIDTH, HEIGHT]), y = HEIGHT - MARGIN;
  const room = (height: number) => { if (y - height < MARGIN) { page = pdf.addPage([WIDTH, HEIGHT]); y = HEIGHT - MARGIN; } };
  const write = (text: string, size: number, face = font, gap = 3, indent = 0) => {
    for (const line of wrapText(pdfText(text), t => face.widthOfTextAtSize(t, size) <= WIDTH - MARGIN * 2 - indent)) {
      room(size + gap);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font: face, color: ink });
      y -= size + gap;
    }
  };

  request.documents.forEach((document, index) => {
    if (index) { page = pdf.addPage([WIDTH, HEIGHT]); y = HEIGHT - MARGIN; }
    write(document.title, 15, bold, 6);
    y -= 8;
    for (const section of document.sections) {
      room(40);
      y -= 8;
      write(section.heading, 11, bold, 4);
      for (const line of section.lines) write(attachedLine(line), 10, font, 4);
    }
  });

  // The signature page, kept whole.
  page = pdf.addPage([WIDTH, HEIGHT]); y = HEIGHT - MARGIN;
  write("Signatures", 15, bold, 6);
  y -= 6;
  write("Signing below accepts the subcontract, Exhibit A and the attached documents in this envelope.", 10, font, 4);
  const block = (party: string, company: string, signer: { name: string; email: string }, anchors: { sign: string; date: string }) => {
    y -= 26;
    write(`${party}: ${company}`, 11, bold, 4);
    write(`${signer.name} · ${signer.email}`, 10, font, 4);
    y -= 34;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 280, y }, thickness: 0.75, color: rule });
    page.drawLine({ start: { x: MARGIN + 320, y }, end: { x: WIDTH - MARGIN, y }, thickness: 0.75, color: rule });
    // White on white: invisible on paper, found by DocuSign, which draws its fields just above the lines.
    page.drawText(anchors.sign, { x: MARGIN + 2, y: y + 4, size: 8, font, color: white });
    page.drawText(anchors.date, { x: MARGIN + 322, y: y + 4, size: 8, font, color: white });
    y -= 12;
    page.drawText("Signature", { x: MARGIN, y, size: 8, font, color: rule });
    page.drawText("Date", { x: MARGIN + 320, y, size: 8, font, color: rule });
  };
  block("Subcontractor", request.subcontractorName, request.signers.subcontractor, ANCHORS.subcontractor);
  block("General contractor", request.contractorName, request.signers.contractor, ANCHORS.contractor);
  return pdf.save();
}

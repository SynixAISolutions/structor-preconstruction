// The paragraphs of a Word (.docx) file, read in the browser without a library (18 Oct: company forms
// by AI). A .docx is a zip; its text is word/document.xml. Only what a template needs is kept: each
// paragraph's text, its style (Heading1, Title, ListParagraph…) and whether it is numbered.

export type FormParagraph = { text: string; style: string; numbered: boolean };

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

/** Paragraphs of word/document.xml, in order; empty paragraphs are skipped, tabs and breaks become spaces. */
export function docxParagraphs(xml: string): FormParagraph[] {
  const out: FormParagraph[] = [];
  for (const [, body] of xml.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
    const text = decodeXml([...body.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br)\/>/g)].map(m => m[1] ?? " ").join("")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ text, style: body.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "", numbered: /<w:numPr>/.test(body) });
  }
  return out;
}

/** The text of one file inside a zip (stored or deflated), using the browser's DecompressionStream. */
export async function zipEntry(buffer: ArrayBuffer, name: string): Promise<string | null> {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This file is not a Word document (.docx).");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && at + 46 <= bytes.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const entry = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (entry === name) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return new TextDecoder().decode(data);
      if (method !== 8) throw new Error("This Word document uses an unsupported compression.");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    at += 46 + nameLength + extra + comment;
  }
  return null;
}

/** A .docx file's paragraphs. */
export async function readDocx(buffer: ArrayBuffer): Promise<FormParagraph[]> {
  const xml = await zipEntry(buffer, "word/document.xml");
  if (xml === null) throw new Error("This file is not a Word document (.docx).");
  return docxParagraphs(xml);
}

import WordExtractor from "word-extractor";
import * as XLSX from "xlsx";
import { alignLevels, docParagraphs, docxParagraphs, type LeveledLine } from "../../../lib/word-levels";

// A scope checklist's text (lib/scope-checklist): the contractor's checklists are Word files, MCN's mostly the old .doc
// format a browser can't read, so the file comes here as it is and only its text goes back, each line with its list
// level (lib/word-levels) so a sub-item stays with the line it belongs to. Nothing is kept. Behind the Structor
// sign-in like every API route (proxy.ts).

export const runtime = "nodejs";
/** The largest file read: MCN's checklists are about 100 KB. */
const MAX_BYTES = 5_000_000;

type Entry = { name: string; content: Uint8Array | number[] };
/** SheetJS's container reader (OLE compound files and zips); its types aren't published with the package. */
const CFB = (XLSX as unknown as { CFB: { read(data: Buffer, opts: { type: "buffer" }): unknown; find(container: unknown, path: string): Entry | null } }).CFB;

/** Each paragraph's list level from the file itself; [] when it can't be read, and the lines go without levels. */
function paragraphs(bytes: Buffer): LeveledLine[] {
  try {
    const container = CFB.read(bytes, { type: "buffer" });
    const stream = (name: string) => { const e = CFB.find(container, name); return e?.content ? Uint8Array.from(e.content) : null; };
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const xml = stream("word/document.xml");
      return xml ? docxParagraphs(new TextDecoder().decode(xml)) : [];
    }
    const doc = stream("WordDocument");
    return doc ? docParagraphs(doc, { "0Table": stream("0Table"), "1Table": stream("1Table") }) : [];
  } catch { return []; }
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return Response.json({ error: "Send one Word file under 5 MB." }, { status: 413 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return Response.json({ error: "Send one Word file under 5 MB." }, { status: 400 });
  let text: string;
  try { text = (await new WordExtractor().extract(bytes)).getBody(); }
  catch { return Response.json({ error: "This file couldn't be read as a Word document (.doc or .docx)." }, { status: 400 }); }
  const lines = alignLevels(text.split(/\r?\n/), paragraphs(bytes));
  return Response.json({ text, lines }, { headers: { "Cache-Control": "no-store" } });
}

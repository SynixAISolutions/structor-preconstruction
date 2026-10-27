import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const AI = await import("../lib/ai-jobs.ts");
const T = await import("../lib/text-anchor.ts");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

// The highlight is the program's, not anyone's hand: the AI cites a quote, the AI's screen (quoteOnPage) keeps
// it only if it is on the page, and the viewer must then find those words on the page and box them. On a real
// PDF, every quote the screen accepts — the whole page cut into AI-sized quotes, with the spacing, punctuation
// and "…" the model writes — must be found, and boxed over the text item it starts in.
const file = new URL("../../work/understanding-guide/rendered/Structor_AI_Beginners_Guide.pdf", import.meta.url);
const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
const pdf = await task.promise;
const squeeze = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

let accepted = 0, pages = 0;
const misses = [];
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // The page text exactly as Project files stores it (lib/pdf-text), and the boxes from the viewer's own code (readPageTextBoxes → pageTextBoxes).
  const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "").join("");
  const boxes = T.pageTextBoxes(content.items, viewport);
  page.cleanup();
  assert(boxes.length && boxes.every(b => b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.001 && b.y + b.h <= 1.001 && b.h > 0), `Page ${n}: every piece of text has a box on the page`);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 12) continue;
  pages++;

  // The text item a quote starts in, found independently: the first item whose squeezed text, joined in order, reaches the quote's start.
  let joined = "";
  const starts = boxes.map(b => { const at = joined.length; joined += squeeze(b.str); return { at, end: joined.length, box: b }; });
  const startBox = q => { const at = joined.indexOf(squeeze(q)); return starts.find(s => at >= s.at && at < s.end)?.box; };

  const quotes = [];
  for (let i = 0; i + 8 <= words.length; i += 5) {
    const take = words.slice(i, i + 8 + (i % 33));
    quotes.push(take.join(" "));
    quotes.push(take.join(" ").replace(/[,;:]/g, "").replace(/-/g, " - ").replace(/'/g, "’"));
    if (i + 30 < words.length) quotes.push(`${take.slice(0, 8).join(" ")} … ${words.slice(i + 20, i + 30).join(" ")}`);
  }
  for (const quote of quotes) {
    if (!AI.quoteOnPage(quote, text)) continue;
    accepted++;
    const parts = quote.split(/\.{3}|…/).filter(p => squeeze(p).length >= 6);
    const marks = T.findOnSheet(boxes, quote);
    const inside = marks.every(m => m.x >= 0 && m.y >= 0 && m.x + m.width <= 1.0001 && m.y + m.height <= 1.0001);
    const first = startBox(parts[0]);
    const placed = marks.length === parts.length && inside && first && overlaps(marks[0], { x: first.x, y: first.y, width: first.w, height: first.h });
    if (!placed) misses.push(`page ${n}: “${quote.slice(0, 60)}” → ${marks.length} mark(s) ${JSON.stringify(marks[0])} start ${JSON.stringify(first)}`);
  }
}
await task.destroy();

assert(pages >= 5 && accepted >= 500, `A real document's worth of quotes (${pages} pages, ${accepted} accepted)`);
assert.deepEqual(misses.slice(0, 10), [], `${misses.length} of ${accepted} screened quotes were not highlighted where they are`);
console.log(`Quote highlights checked on a real PDF: all ${accepted} quotes the AI's screen accepts (${pages} pages, with model-style spacing, punctuation and “…”) are boxed on their words.`);

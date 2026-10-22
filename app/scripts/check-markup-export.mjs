import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const X = await import("../lib/markup-export.ts");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Text a PDF's standard font can't carry is made plain, never dropped.
assert.equal(X.pdfText("Carpet R&R — “polished” concrete… ✓"), "Carpet R&R - \"polished\" concrete... ?");

// A plain 8 x 6 JPEG stands in for a rendered page.
const jpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAGAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDuKKKKAP/Z", "base64"));
const markup = (id, page, title, extra = {}) => ({ id, docId: "d2", page, rect: [0.4, 0.5, 0.2, 0.1], color: "orange", title, description: "", assignedTo: "", status: "open", createdBy: "Marcel Khoury", createdAt: "2026-10-22T12:00:00.000Z", updatedAt: "", comments: [], links: [], ...extra });
const markups = [
  markup("a", 46, "Ceiling tile conflict"),
  markup("b", 46, "Carpet R&R with polished concrete", { assignedTo: "Brent Fowler", description: "Replace carpet in lieu of polished concrete in the high-traffic areas", links: [{ kind: "ve", id: "ve-7", label: "Polished concrete" }], comments: [{ id: "c1", by: "Marcel Khoury", at: "2026-10-22T13:00:00.000Z", text: "Priced as a VE option" }] }),
  markup("c", 47, "Door 117B swing", { status: "resolved" }),
];
const bytes = await X.markupsPdf({ title: "Jelleff GMP drawings V2", exportedAt: "Oct 22, 2026", markups, pages: [{ page: 47, jpeg }, { page: 46, jpeg }, { page: 12, jpeg }] });
const pdf = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
const text = async n => (await (await pdf.getPage(n)).getTextContent()).items.map(i => i.str).join(" ");
assert.equal(pdf.numPages, 3, "Page 46, page 47 (page 12 has no markups), then the list");
const p1 = await text(1), list = await text(3);
assert.match(p1, /page 46 - 2 markups/);
assert.match(p1, /1.*2/, "Markups numbered on the page as in the viewer's list");
assert.match(await text(2), /page 47 - 1 markup\b/);
for (const s of ["1. Ceiling tile conflict", "2. Carpet R&R with polished concrete", "Assigned to Brent Fowler", "Linked: VE item: Polished concrete", "Marcel Khoury, 2026-10-22: Priced as a VE option", "3. Door 117B swing", "Resolved"]) assert.ok(list.includes(s), s);
const [w, h] = (await pdf.getPage(1)).view.slice(2);
assert.deepEqual([Math.round(w), Math.round(h)], [1224, 918], "An 11 x 17 sheet at the page's own proportions");

console.log("Markup export checked: marked-up pages only, numbered markups, the list with details, links and comments, plain text for the PDF font, sheet size.");

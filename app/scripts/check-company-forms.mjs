import assert from "node:assert/strict";
import { register } from "node:module";
import { deflateRawSync } from "node:zlib";

register("./ts-resolver.mjs", import.meta.url);
const D = await import("../lib/docx-text.ts");
const F = await import("../lib/company-forms.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// A minimal .docx: one deflated word/document.xml (plus a stored file before it) in a real zip layout.
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const { name, data, method } of files) {
    const body = method === 8 ? deflateRawSync(data) : data, n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, body); centrals.push(central, n); offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, dir, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}
const xml = `<w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>EXHIBIT A</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Project: </w:t></w:r><w:r><w:t>Riverside &amp; Co</w:t></w:r></w:p>
<w:p></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Subcontractor shall furnish all labor.</w:t><w:tab/><w:t>End</w:t></w:r></w:p>
</w:body></w:document>`;
assert.deepEqual(D.docxParagraphs(xml), [
  { text: "EXHIBIT A", style: "Title", numbered: false },
  { text: "Project: Riverside & Co", style: "", numbered: false },
  { text: "Subcontractor shall furnish all labor. End", style: "", numbered: true },
], "Text runs joined, entities decoded, empty paragraphs skipped, style and numbering kept");
const docx = zip([{ name: "[Content_Types].xml", data: Buffer.from("<Types/>"), method: 0 }, { name: "word/document.xml", data: Buffer.from(xml), method: 8 }]);
assert.equal((await D.readDocx(docx)).length, 3, "Reads a deflated document.xml out of the zip");
assert.equal(await D.zipEntry(docx, "[Content_Types].xml"), "<Types/>", "Stored entries too");
assert.equal(await D.zipEntry(docx, "missing.xml"), null);
await assert.rejects(() => D.readDocx(new TextEncoder().encode("not a zip at all, just text").buffer), /not a Word document/);

// Mapping screen: wording from the form only, known kinds and placeholders, a place for the scope.
const paragraphs = [
  { text: "EXHIBIT A SCOPE OF WORK", style: "", numbered: false }, { text: "Project Name", style: "", numbered: false },
  { text: "GENERAL NOTES", style: "", numbered: false }, { text: "Bidders are to familiarize themselves with the site conditions prior to bid.", style: "", numbered: true },
  { text: "SCOPE EXCLUSIONS", style: "", numbered: false }, { text: "Permits and fees are excluded unless noted.", style: "", numbered: true },
];
const mapped = F.screenMappedForm({ title: "EXHIBIT A SCOPE OF WORK · {trade}", blocks: [
  { kind: "text", heading: "", lines: ["{project}", "{ownerName}"] },
  { kind: "text", heading: "GENERAL NOTES", numbered: true, lines: ["Bidders are to familiarize themselves with the site conditions prior to bid.", "Subcontractor shall carry a $10 million umbrella policy at all times."] },
  { kind: "exclusions", heading: "SCOPE EXCLUSIONS" },
  { kind: "text", heading: "", numbered: true, lines: ["Permits and fees are excluded unless noted."] },
  { kind: "signature-page", heading: "Signatures" },
] }, { kind: "exhibit-a", paragraphs });
assert.deepEqual(mapped.layout.blocks.map(b => [b.kind, b.heading, b.lines?.length ?? null]), [
  ["text", "", 2], ["text", "GENERAL NOTES", 1], ["exclusions", "SCOPE EXCLUSIONS", null], ["text", "", 1], ["scope", "Scope of work", null],
], "An invented line and an unknown block kind are dropped; a missing scope section is added at the end");
assert.deepEqual(mapped.layout.blocks[0].lines, ["{project}", "[ownerName]"], "Unknown placeholders show as a visible gap");
assert.equal(mapped.layout.blocks[1].numbered, true);
assert.equal(mapped.dropped, 2);
assert.equal(mapped.warnings.length, 2);
assert.match(mapped.warnings.join(" "), /not found in the uploaded form/);
assert.match(mapped.warnings.join(" "), /Scope of work section was added/);
assert.equal(mapped.layout.title, "EXHIBIT A SCOPE OF WORK · {trade}");
assert.equal(F.screenMappedForm({}, { kind: "subcontract", paragraphs }).layout.title, "Subcontract agreement · {trade}");

const template = F.companyTemplate("exhibit-a", "Exhibit A shell.docx", mapped, "2026-10-18T12:00:00.000Z");
assert.equal(template.sample, false);
assert.match(template.notice, /Mapped from Exhibit A shell.docx by AI/);
assert.equal(template.id, "company-exhibit-a-20261018120000");
assert.throws(() => F.companyTemplate("exhibit-a", "x.pdf", { layout: { title: "t", blocks: [] }, warnings: [], dropped: 0 }), /Nothing usable/);
const fallback = { id: "default", name: "Default", version: "1", sample: false, notice: "" };
assert.equal(F.templateFor({ name: "GC" }, "exhibit-a", fallback), fallback);
assert.equal(F.templateFor({ name: "GC", exhibitTemplate: template }, "exhibit-a", fallback), template);
assert.equal(F.templateFor({ name: "GC", exhibitTemplate: template }, "subcontract", fallback), fallback);

const J = EXTRA_JOBS["template-from-form"];
assert.equal(J.parse({ kind: "nonsense", paragraphs }).kind, "exhibit-a");
assert.throws(() => J.parse({ paragraphs: [] }), /form's text/);
assert.throws(() => J.parse({ paragraphs: Array.from({ length: 40 }, () => ({ text: "x".repeat(2000) })) }), /too long/);
assert.match(J.messages(J.parse({ kind: "exhibit-a", paragraphs }))[0].content, /Never add, reword or summarise/);

console.log("Company forms checked: .docx paragraphs from a real zip layout, mapping screen (wording from the form only, known kinds and placeholders, scope section), templates and defaults, job input limits.");

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { drawingLog, type StoredDocument } from "../../lib/project-files";
import { DrawingLogView, SheetCollection, SheetComparison, SheetVersions, UploadCheck, VersionPills, uploadTime } from "./drawing-log";

const doc = (id: string, name: string, sheets: [string, number][], uploadedAt: string): StoredDocument => ({ id, name, projectId: "revision-test", category: "Drawings", kind: "drawings", series: id, revision: 1, size: 100, pageCount: sheets.length, uploadedAt, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sections: [], sheets: sheets.map(([sheet, page]) => ({ sheet, page, title: `Title ${sheet}`, date: "2026-10-01" })) });
const documents = [doc("permit", "Permit set.pdf", [["A-101", 1], ["M-101", 2], ["A-102", 3]], "2026-10-01T08:02:13Z"), doc("asi", "ASI 01.pdf", [["A-101", 1], ["M-101", 2], ["A-103", 3], ["", 4], ["A-103", 5]], "2026-10-02T09:03:27Z")];
const log = drawingLog(documents);
const noop = () => {};

test("version pills distinguish current and selected versions with exact upload times", () => {
  const html = renderToStaticMarkup(<SheetVersions sheet={log.sheets[0]} selected="permit" onOpen={noop}/>);
  assert.match(html, /class=" selected"[^>]*aria-label="Open V1 · Permit set" aria-pressed="true"/);
  assert.match(html, /class="current "[^>]*aria-label="Open V2 · ASI 01 · Current" aria-pressed="false"/);
  assert.ok(html.includes(uploadTime(documents[1].uploadedAt)));
  const file = renderToStaticMarkup(<VersionPills versions={documents.map((d, i) => ({ ...d, version: i + 1 }))} current="asi" onOpen={noop}/>);
  assert.match(file, />V1<\/button>/); assert.match(file, />V2<\/button>/);
});

test("Sheets starts in a card grid, keeps sheets omitted by a partial set and lists sets oldest first", () => {
  const html = renderToStaticMarkup(<DrawingLogView log={log} ready onOpen={noop} onRevision={noop} onUpload={noop} onReview={noop}/>);
  for (const text of ["dl-sheet-grid", "A-102", "Architectural", "Mechanical", "Search sheet number or title", "Changed in set", "Revised in ASI 01", "New", "Current from", "Add revision"]) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('class="dl-set-step">01') < html.indexOf('class="dl-set-step">02'));
  assert.match(html, /aria-label="Sheet grid" aria-pressed="true"/);
  const list = renderToStaticMarkup(<SheetCollection sheets={log.sheets} grid={false} onOpen={noop} onRevision={noop}/>);
  for (const text of ["<th>Sheet</th>", "<th>Title</th>", "<th>Versions</th>", "<th>Current from</th>", "<th>Actions</th>", "Compare"]) assert.ok(list.includes(text));
});

test("upload check shows changes, unread-page naming, repeated-number recovery and a nonblocking close", () => {
  const html = renderToStaticMarkup(<UploadCheck documents={documents} ids={["asi"]} onDone={noop}/>);
  for (const text of ["Your files are stored", "2 revised", "1 new", "1 unchanged", "Repeated sheet numbers: A-103", "Number not read", "Sheet number · page 4", "Sheet number · page 5", "Save sheet number", "Looks right"]) assert.ok(html.includes(text), text);
  assert.match(html, /<input required="" maxLength="40"[^>]*name="sheet"/);
});

test("comparison selects sheet versions across separate uploads even though both file revisions are V1", () => {
  const html = renderToStaticMarkup(<SheetComparison sheet={log.sheets[0]}/>);
  for (const text of ["Compare A-101", "Before version", "After version", "Before · V1 · Permit set", "After · V2 · ASI 01", "Comparison zoom"]) assert.ok(html.includes(text), text);
});

test("no-drawings and unread-only states provide the relevant recovery action", () => {
  const empty = renderToStaticMarkup(<DrawingLogView log={drawingLog([])} ready onOpen={noop} onRevision={noop} onUpload={noop} onReview={noop}/>);
  assert.match(empty, /No drawing sheets yet/); assert.match(empty, /Upload drawings/);
  const unread = renderToStaticMarkup(<DrawingLogView log={drawingLog([doc("scan", "Scan.pdf", [["", 1]], "2026-10-03T09:00:00Z")])} ready onOpen={noop} onRevision={noop} onUpload={noop} onReview={noop}/>);
  assert.match(unread, /Name sheets/); assert.match(unread, /1 unnamed/);
});

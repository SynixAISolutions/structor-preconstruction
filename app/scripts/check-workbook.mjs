import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import XLSX from "xlsx";
import {
  BIDDER_SLOT_STARTS,
  exportBidWorkbook,
  findOpenBidderSlot,
  importBidWorkbook,
} from "../lib/workbook.mjs";

const sourcePath = new URL("../../references/Jelleff%20Rec%20Live%20Bid%20sheet.xlsx", import.meta.url);
const sourceBytes = new Uint8Array(fs.readFileSync(sourcePath));
const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");

const imported = importBidWorkbook(sourceBytes, { sheetName: "Demo" });
assert.deepEqual(imported.bidders.map((bidder) => bidder.baseBid), [290000, 240000, 358597, 154826, 255000, 260000]);
assert.deepEqual(imported.bidders.map((bidder) => bidder.sourceSlot), [0, 1, 2, 3, 4, 5]);
assert.equal(imported.bidders[5].sourceStatus, "NO");
assert.equal(imported.bidders[0].bondRate, 0.02);
assert.equal(findOpenBidderSlot(imported.bidders), 6);
assert.equal(imported.items.find((item) => item.sourceRow === 15)?.rowKind, "coverage");
assert.equal(imported.sourceRows.find((row) => row.sourceRow === 36)?.rowKind, "section-heading");
assert.equal(imported.sourceRows.find((row) => row.sourceRow === 75)?.rowKind, "schedule");
assert.equal(imported.bidders[0].responses["row-76"].note, "5 weeks");
assert.equal(imported.bidders[0].responses["row-76"].rawValue, " total duration");

const emptyTemplate = importBidWorkbook(sourceBytes, { sheetName: "SOWTemplate" });
assert.equal(emptyTemplate.bidders.length, 0);
assert.equal(emptyTemplate.summary.bidderCount, 0);
const firstTemplateBidder = {
  id: "first-template-bidder",
  name: "First Bidder",
  contact: "",
  baseBid: null,
  bondRate: 0.02,
  sourceStatus: "NO",
  sourceSlot: 0,
  responses: {},
};
const emptyTemplateExport = exportBidWorkbook(sourceBytes, {
  project: emptyTemplate.project,
  items: emptyTemplate.items,
  bidders: [firstTemplateBidder],
});
assert.equal(emptyTemplateExport.ok, true, JSON.stringify(emptyTemplateExport.errors));
const templateSheet = XLSX.read(emptyTemplateExport.bytes, { type: "array" }).Sheets.SOWTemplate;
assert.equal(templateSheet.K1.v, "First Bidder");
assert.equal(templateSheet.K2?.v, undefined);
assert.equal(templateSheet.L6?.v, undefined);

const celtic = imported.bidders[0];
const scopeItem = imported.items.find((item) => item.sourceRow === 38);
const workspace = {
  project: imported.project,
  items: imported.items,
  bidders: imported.bidders.map((bidder) => bidder.id !== celtic.id ? bidder : {
    ...bidder,
    name: "Celtic Updated",
    contact: "Updated Contact",
    baseBid: 300000,
    bondRate: 0.025,
    sourceStatus: "NO",
    responses: {
      ...bidder.responses,
      [scopeItem.id]: {
        ...bidder.responses[scopeItem.id],
        status: "N",
        note: "Verified exclusion",
        adjustment: 1234,
        adjustmentApproved: true,
      },
    },
  }),
};
const exported = exportBidWorkbook(sourceBytes, workspace);
assert.equal(exported.ok, true, JSON.stringify(exported.errors));
assert.ok(exported.warnings.some((warning) => warning.code === "EXCEL_RECALC_REQUIRED"));
assert.ok(exported.changes.some((change) => change.address === "L6"));
assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), sourceHash, "source bytes changed");

const resultWorkbook = XLSX.read(exported.bytes, { type: "array", cellFormula: true });
const demo = resultWorkbook.Sheets.Demo;
assert.equal(demo.K6.v, "Base Bid:");
assert.equal(demo.K1.v, "Celtic Updated");
assert.equal(demo.L6.v, 300000);
assert.equal(demo.K2.v, "Updated Contact");
assert.equal(demo.L5.v, "NO");
assert.equal(demo.J8.v, 0.025);
assert.equal(demo.J39.v, "N");
assert.equal(demo.K39.v, "Verified exclusion");
assert.equal(demo.L39.v, 1234);
assert.equal(demo.L7.f, "SUM(L13:L18,L20:L91)");

const repeatedExport = exportBidWorkbook(sourceBytes, workspace);
assert.equal(repeatedExport.ok, true, JSON.stringify(repeatedExport.errors));
assert.equal(Buffer.compare(Buffer.from(repeatedExport.bytes), Buffer.from(exported.bytes)), 0, "repeated export changed output");

const reimported = importBidWorkbook(exported.bytes, { sheetName: "Demo" });
assert.equal(reimported.bidders[0].baseBid, 300000);
assert.equal(reimported.bidders[0].sourceSlot, 0);
assert.equal(reimported.bidders[4].sourceSlot, 4);

const draftWorkspace = {
  ...workspace,
  bidders: workspace.bidders.map((bidder) => bidder.id !== celtic.id ? bidder : {
    ...bidder,
    responses: {
      ...bidder.responses,
      [scopeItem.id]: { ...bidder.responses[scopeItem.id], adjustment: 9999, adjustmentApproved: false },
    },
  }),
};
const draftExport = exportBidWorkbook(sourceBytes, draftWorkspace);
assert.equal(draftExport.ok, true, JSON.stringify(draftExport.errors));
assert.ok(draftExport.warnings.some((warning) => warning.code === "DRAFT_ADJUSTMENTS_NOT_EXPORTED"));
assert.equal(XLSX.read(draftExport.bytes, { type: "array" }).Sheets.Demo.L39?.v, undefined);

const archive = (bytes) => XLSX.CFB.read(bytes, { type: "array" });
const partMap = (container) => new Map(container.FullPaths.map((path, index) => [
  path.replace(/^Root Entry\//, ""),
  new Uint8Array(container.FileIndex[index].content),
]));
const beforeParts = partMap(archive(sourceBytes));
const afterParts = partMap(archive(exported.bytes));
assert.deepEqual([...afterParts.keys()].sort(), [...beforeParts.keys()].sort());
const changedParts = [];
for (const [path, before] of beforeParts) {
  const after = afterParts.get(path);
  if (!after || Buffer.compare(Buffer.from(before), Buffer.from(after)) !== 0) changedParts.push(path);
}
assert.deepEqual(changedParts.sort(), ["xl/workbook.xml", "xl/worksheets/sheet8.xml"]);
const sourceSheetXml = new TextDecoder().decode(beforeParts.get("xl/worksheets/sheet8.xml"));
const resultSheetXml = new TextDecoder().decode(afterParts.get("xl/worksheets/sheet8.xml"));
for (const tag of ["conditionalFormatting", "dataValidations", "drawing", "mergeCells"]) {
  assert.equal((resultSheetXml.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length, (sourceSheetXml.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length, `${tag} changed`);
}
const workbookXml = new TextDecoder().decode(afterParts.get("xl/workbook.xml"));
assert.match(workbookXml, /<calcPr\b[^>]*calcMode="auto"[^>]*fullCalcOnLoad="1"[^>]*forceFullCalc="1"/);

const gapWorkspace = {
  ...workspace,
  bidders: workspace.bidders
    .filter((bidder) => bidder.sourceSlot !== 2)
    .map((bidder) => bidder.sourceSlot === 4 ? { ...bidder, baseBid: 256000 } : bidder),
};
const gapExport = exportBidWorkbook(sourceBytes, gapWorkspace);
assert.equal(gapExport.ok, true, JSON.stringify(gapExport.errors));
const gapSheet = XLSX.read(gapExport.bytes, { type: "array" }).Sheets.Demo;
assert.equal(gapSheet.X6.v, 256000, "bidder after gap moved out of its source slot");
assert.equal(gapSheet.R6.v, 358597, "removed middle bidder's source slot was overwritten");

const unsafe = exportBidWorkbook(sourceBytes, {
  project: { ...imported.project, budget: imported.project.budget + 1, sourceBudget: imported.project.budget + 1, sourceBudgetFormula: false },
  items: [...imported.items, { id: "new", description: "New row", section: "Inclusions", required: true }],
  bidders: imported.bidders,
});
assert.equal(unsafe.ok, false);
assert.ok(unsafe.errors.some((error) => error.field === "project.budget"));
assert.ok(unsafe.errors.some((error) => error.code === "NEW_SCOPE_ROW_UNSUPPORTED" && error.rowId === "new"));

console.log(JSON.stringify({
  ok: true,
  demo: imported.summary,
  emptyTemplateBidderCount: emptyTemplate.bidders.length,
  preservation: { changedParts },
  exportChanges: exported.changes,
  bidderSlotStarts: BIDDER_SLOT_STARTS,
}, null, 2));

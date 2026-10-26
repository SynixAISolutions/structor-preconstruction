import * as XLSXModule from "xlsx";

const XLSX = "CFB" in XLSXModule ? XLSXModule : Reflect.get(XLSXModule, "default");

export const BIDDER_SLOT_STARTS = Object.freeze([9, 12, 15, 18, 21, 24, 27]);
export const WORKBOOK_MAPPING_ID = "jelleff-bid-sheet-v1";

const VALID_STATUSES = new Set(["", "Y", "N", "P", "N/A"]);
const PLACEHOLDER_BIDDER = /^bidder\s+\d+$/i;

export class WorkbookMappingError extends Error {
  constructor(code, message, issues = []) {
    super(message);
    this.name = "WorkbookMappingError";
    this.code = code;
    this.issues = issues;
  }
}

function bytesFrom(input) {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  }
  throw new WorkbookMappingError("INVALID_WORKBOOK_BYTES", "Workbook input must be an ArrayBuffer or typed array.");
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function numberOrNull(value) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function cell(rows, row, column) {
  return rows[row]?.[column] ?? null;
}

function normalizedStatus(value) {
  const status = text(value).toUpperCase();
  return VALID_STATUSES.has(status) ? status : "";
}

function formulaAt(sheet, row, column) {
  return Boolean(sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.f);
}

function validateSheet(rows) {
  const sectionRows = new Map();
  rows.forEach((row, index) => {
    const label = text(row?.[1]);
    const match = /^section\s+(\d+)\b/i.exec(label);
    if (match) sectionRows.set(Number(match[1]), index);
  });
  const baseBidLabels = BIDDER_SLOT_STARTS.filter(
    (start) => /^base\s+bid:?$/i.test(text(cell(rows, 5, start + 1))),
  ).length;
  const issues = [];
  if (!sectionRows.has(1)) issues.push("Section 1 heading was not found in column B.");
  if (!sectionRows.has(2)) issues.push("Section 2 heading was not found in column B.");
  if (!sectionRows.has(3)) issues.push("Section 3 heading was not found in column B.");
  if (baseBidLabels !== BIDDER_SLOT_STARTS.length) {
    issues.push(`Expected ${BIDDER_SLOT_STARTS.length} Base Bid labels on row 6; found ${baseBidLabels}.`);
  }
  return { supported: issues.length === 0, issues, sectionRows };
}

function rowHasModeledContent(row) {
  const columns = [0, 1, 2, 3, ...BIDDER_SLOT_STARTS.flatMap((start) => [start, start + 1, start + 2])];
  return columns.some((column) => text(row?.[column]) !== "");
}

function sourceRowsFrom(rows, sheetName, firstRow) {
  let topSection = "Scope";
  let activeSection = topSection;
  let specialKind = "";
  const parsed = [];

  rows.forEach((row, sourceRow) => {
    if (sourceRow < firstRow || !rowHasModeledContent(row)) return;
    const number = text(row?.[0]);
    const description = text(row?.[1]);
    const scopeMarker = text(row?.[2]);
    const estimatorNote = text(row?.[3]);
    const sectionMatch = /^section\s+\d+\b/i.test(description);
    const letterHeading = /^[A-Z]$/.test(number) && Boolean(description);
    const namedSpecial = /^(allowances|alternates|unit prices)$/i.exec(description)?.[1]?.toLowerCase();
    const knownHeading = /^(specific scope items|standard\s*\/\s*general scope|building\b.*demolition)$/i.test(description);
    let rowKind = "coverage";

    if (sectionMatch) {
      topSection = description;
      activeSection = description;
      specialKind = "";
      rowKind = "section-heading";
    } else if (letterHeading) {
      activeSection = description;
      specialKind = /^schedule$/i.test(description) ? "schedule" : "";
      rowKind = "section-heading";
    } else if (namedSpecial) {
      activeSection = description;
      specialKind = namedSpecial === "unit prices" ? "unit-price" : namedSpecial.slice(0, -1);
      rowKind = "section-heading";
    } else if (knownHeading) {
      activeSection = description;
      rowKind = "section-heading";
    } else if (/^section\s+2\b/i.test(topSection)) {
      rowKind = "breakdown";
    } else if (specialKind) {
      rowKind = specialKind;
    } else if (!description) {
      return;
    }

    parsed.push({
      id: `row-${sourceRow + 1}`,
      number,
      description,
      section: activeSection,
      sourceSection: activeSection,
      required: rowKind === "coverage" && scopeMarker.toUpperCase() === "Y",
      source: `${sheetName}!B${sourceRow + 1}`,
      estimatorNote,
      sourceRow,
      rowKind,
      scopeMarker,
      sourceDescription: description,
      sourceEstimatorNote: estimatorNote,
    });
  });

  return parsed;
}

function bidderFrom(rows, sourceRows, slot, warnings) {
  const start = BIDDER_SLOT_STARTS[slot];
  const name = text(cell(rows, 0, start + 1));
  if (!name || PLACEHOLDER_BIDDER.test(name)) return null;

  const rawBaseBid = cell(rows, 5, start + 2);
  const baseBid = numberOrNull(rawBaseBid);
  if (baseBid == null && text(rawBaseBid)) {
    warnings.push({
      code: "INVALID_BASE_BID",
      bidderSlot: slot,
      message: `${name}'s base bid is not numeric and was imported as missing.`,
    });
  }
  const rawBondRate = cell(rows, 7, start);
  const importedBondRate = numberOrNull(rawBondRate);
  const bondRate = importedBondRate ?? 0.02;
  if (importedBondRate == null) {
    warnings.push({
      code: "DEFAULT_BOND_RATE",
      bidderSlot: slot,
      message: `${name} has no numeric source bond rate; the template fallback of 2% was used.`,
    });
  }

  const responses = Object.fromEntries(sourceRows.map((sourceRow) => {
    const rawStatus = text(cell(rows, sourceRow.sourceRow, start)).toUpperCase();
    const rawValue = cell(rows, sourceRow.sourceRow, start + 2);
    const adjustment = sourceRow.rowKind === "coverage" ? numberOrNull(rawValue) : null;
    if (sourceRow.rowKind === "coverage" && rawStatus && !VALID_STATUSES.has(rawStatus)) {
      warnings.push({
        code: "UNRECOGNIZED_COVERAGE_STATUS",
        bidderSlot: slot,
        sourceRow: sourceRow.sourceRow,
        message: `${name} has unsupported status ${JSON.stringify(rawStatus)} at row ${sourceRow.sourceRow + 1}.`,
      });
    }
    return [sourceRow.id, {
      status: normalizedStatus(rawStatus),
      rawStatus,
      note: text(cell(rows, sourceRow.sourceRow, start + 1)),
      adjustment: adjustment ?? 0,
      rawValue,
      sourceStatus: normalizedStatus(rawStatus),
      sourceNote: text(cell(rows, sourceRow.sourceRow, start + 1)),
      sourceRawValue: rawValue,
    }];
  }));

  const sourceStatus = text(cell(rows, 4, start + 2)).toUpperCase();
  const sourceRank = cell(rows, 9, start + 1);
  return {
    id: `bidder-slot-${slot + 1}`,
    name,
    contact: text(cell(rows, 1, start + 1)),
    baseBid,
    bondRate,
    bondRateSource: importedBondRate == null ? "template-default" : "workbook",
    sourceStatus,
    sourceRank,
    sourceSlot: slot,
    responses,
    sourceName: name,
    sourceContact: text(cell(rows, 1, start + 1)),
    sourceBaseBid: baseBid,
    sourceBondRate: bondRate,
    originalSourceStatus: sourceStatus,
  };
}

function readWorkbook(input) {
  const originalBytes = bytesFrom(input);
  if (originalBytes[0] !== 0x50 || originalBytes[1] !== 0x4b) {
    throw new WorkbookMappingError(
      "UNSUPPORTED_FILE_TYPE",
      "Only unencrypted .xlsx-compatible ZIP workbooks can use the preservation-safe import/export path.",
    );
  }
  let workbook;
  try {
    workbook = XLSX.read(originalBytes, { type: "array", cellFormula: true, cellStyles: true });
  } catch (error) {
    throw new WorkbookMappingError(
      "INVALID_WORKBOOK",
      error instanceof Error ? `Workbook could not be read: ${error.message}` : "Workbook could not be read.",
    );
  }
  return { originalBytes, workbook };
}

export function importBidWorkbook(input, { sheetName } = {}) {
  const { originalBytes, workbook } = readWorkbook(input);
  const inspected = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: true });
    return { name, rows, validation: validateSheet(rows) };
  });
  const supported = inspected.filter((entry) => entry.validation.supported);
  const selected = sheetName
    ? inspected.find((entry) => entry.name === sheetName)
    : supported.find((entry) => /^demo$/i.test(entry.name))
      ?? supported.find((entry) => /^sowtemplate$/i.test(entry.name))
      ?? supported[0];

  if (!selected) {
    throw new WorkbookMappingError("UNSUPPORTED_TEMPLATE", "No supported Project 1-style bid sheet was found.", [
      { field: "sheet", message: "Expected Section 1, Section 2, Section 3, and seven Base Bid labels." },
    ]);
  }
  if (!selected.validation.supported) {
    throw new WorkbookMappingError(
      "UNSUPPORTED_TEMPLATE",
      `${selected.name} is not a supported Project 1-style bid sheet.`,
      selected.validation.issues.map((message) => ({ field: "sheet", sheetName: selected.name, message })),
    );
  }

  const warnings = [];
  if (!sheetName && supported.length > 1) {
    warnings.push({
      code: "SHEET_AUTO_SELECTED",
      message: `${selected.name} was selected from ${supported.length} supported trade sheets. Let the user confirm the trade before replacing active work.`,
    });
  }
  const sourceRows = sourceRowsFrom(
    selected.rows,
    selected.name,
    selected.validation.sectionRows.get(1),
  );
  const items = sourceRows.filter((row) => row.rowKind === "coverage");
  const bidders = BIDDER_SLOT_STARTS
    .map((_, slot) => bidderFrom(selected.rows, sourceRows, slot, warnings))
    .filter(Boolean);
  const sourceSheet = workbook.Sheets[selected.name];
  const sourceBudget = numberOrNull(cell(selected.rows, 6, 8)) ?? 0;
  const projectName = text(cell(selected.rows, 0, 1)) || "Imported project";
  const trade = text(cell(selected.rows, 3, 1)) || selected.name;
  const usedSlots = new Set(bidders.map((bidder) => bidder.sourceSlot));

  return {
    schemaVersion: 1,
    originalBytes,
    project: {
      name: projectName,
      trade,
      budget: sourceBudget,
      sheetName: selected.name,
      sourceName: projectName,
      sourceTrade: trade,
      sourceBudget,
      sourceNameFormula: formulaAt(sourceSheet, 0, 1),
      sourceTradeFormula: formulaAt(sourceSheet, 3, 1),
      sourceBudgetFormula: formulaAt(sourceSheet, 6, 8),
    },
    items,
    sourceRows,
    bidders,
    source: {
      mappingId: WORKBOOK_MAPPING_ID,
      sheetName: selected.name,
      supportedSheetNames: supported.map((entry) => entry.name),
      availableBidderSlots: BIDDER_SLOT_STARTS.map((_, slot) => slot).filter((slot) => !usedSlots.has(slot)),
    },
    summary: {
      project: projectName,
      trade,
      sheetName: selected.name,
      scopeCount: items.length,
      bidderCount: bidders.length,
      sourceRowCount: sourceRows.length,
    },
    warnings,
  };
}

export function findOpenBidderSlot(bidders) {
  const used = new Set(bidders.map((bidder) => bidder.sourceSlot).filter(Number.isInteger));
  return BIDDER_SLOT_STARTS.map((_, slot) => slot).find((slot) => !used.has(slot)) ?? null;
}

function issue(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

function sameValue(left, right) {
  return left == null && right == null
    ? true
    : typeof left === "number" && typeof right === "number"
      ? Object.is(left, right)
      : String(left ?? "") === String(right ?? "");
}

function exportDiagnostics(workspace, baseline) {
  const errors = [];
  const project = workspace?.project ?? {};
  const items = workspace?.items ?? [];
  const bidders = workspace?.bidders ?? [];
  const sourceProject = baseline?.project ?? project;
  const sourceItems = new Map((baseline?.items ?? []).map((item) => [item.sourceRow, item]));

  if (!project.sheetName) errors.push(issue("MISSING_SOURCE_SHEET", "project.sheetName", "The source worksheet is missing."));
  if (!sameValue(project.budget, sourceProject.budget)) {
    errors.push(issue(
      "UNSUPPORTED_FIELD_CHANGE",
      "project.budget",
      "Project budget cannot be written safely: the verified source cell I7 is a formula, not an editable project-budget cell.",
    ));
  }
  if (!sameValue(project.name, sourceProject.name) && sourceProject.sourceNameFormula) {
    errors.push(issue("UNSUPPORTED_FIELD_CHANGE", "project.name", "Project name is formula-linked in the source workbook and cannot be replaced safely."));
  }
  if (!sameValue(project.trade, sourceProject.trade) && sourceProject.sourceTradeFormula) {
    errors.push(issue("UNSUPPORTED_FIELD_CHANGE", "project.trade", "Trade is formula-linked in the source workbook and cannot be replaced safely."));
  }

  const rows = new Set();
  for (const item of items) {
    if (!Number.isInteger(item.sourceRow)) {
      errors.push(issue(
        "NEW_SCOPE_ROW_UNSUPPORTED",
        "items.sourceRow",
        `Scope item ${JSON.stringify(item.description || item.id)} has no verified source row; export would drop it.`,
        { rowId: item.id },
      ));
      continue;
    }
    if (baseline && !sourceItems.has(item.sourceRow)) {
      errors.push(issue(
        "UNMAPPED_SOURCE_ROW",
        "items.sourceRow",
        `Row ${item.sourceRow + 1} is not a coverage row in the immutable source workbook.`,
        { rowId: item.id, sourceRow: item.sourceRow },
      ));
    }
    if (rows.has(item.sourceRow)) {
      errors.push(issue("DUPLICATE_SOURCE_ROW", "items.sourceRow", `More than one scope item targets row ${item.sourceRow + 1}.`, { rowId: item.id, sourceRow: item.sourceRow }));
    }
    rows.add(item.sourceRow);
    const sourceItem = sourceItems.get(item.sourceRow);
    if (sourceItem && item.section !== sourceItem.section) {
      errors.push(issue(
        "UNSUPPORTED_FIELD_CHANGE",
        "items.section",
        `Section changes require row movement and formula-range updates; row ${item.sourceRow + 1} cannot be exported safely yet.`,
        { rowId: item.id, sourceRow: item.sourceRow },
      ));
    }
  }

  const slots = new Set();
  for (const bidder of bidders) {
    if (!Number.isInteger(bidder.sourceSlot) || bidder.sourceSlot < 0 || bidder.sourceSlot >= BIDDER_SLOT_STARTS.length) {
      errors.push(issue("MISSING_BIDDER_SOURCE_SLOT", "bidders.sourceSlot", `${bidder.name || "A bidder"} has no valid workbook source slot.`, { bidderId: bidder.id }));
      continue;
    }
    if (slots.has(bidder.sourceSlot)) {
      errors.push(issue("DUPLICATE_BIDDER_SOURCE_SLOT", "bidders.sourceSlot", `Two bidders target workbook slot ${bidder.sourceSlot + 1}.`, { bidderId: bidder.id, bidderSlot: bidder.sourceSlot }));
    }
    slots.add(bidder.sourceSlot);
    if (!text(bidder.name)) errors.push(issue("INVALID_BIDDER_NAME", "bidders.name", "Bidder company name is required.", { bidderId: bidder.id, bidderSlot: bidder.sourceSlot }));
    if (bidder.baseBid != null && !Number.isFinite(bidder.baseBid)) errors.push(issue("INVALID_MONEY", "bidders.baseBid", `${bidder.name}'s base bid must be a finite number or missing.`, { bidderId: bidder.id }));
    if (!Number.isFinite(bidder.bondRate) || bidder.bondRate < 0) errors.push(issue("INVALID_RATE", "bidders.bondRate", `${bidder.name}'s bond rate must be a finite non-negative number.`, { bidderId: bidder.id }));

    for (const item of items) {
      if (!Number.isInteger(item.sourceRow)) continue;
      const response = bidder.responses?.[item.id];
      if (!response) continue;
      if (!VALID_STATUSES.has(text(response.status).toUpperCase())) {
        errors.push(issue("INVALID_COVERAGE_STATUS", "responses.status", `Unsupported coverage status at row ${item.sourceRow + 1}.`, { bidderId: bidder.id, rowId: item.id, sourceRow: item.sourceRow }));
      }
      const adjustment = response.approvedAdjustment ?? response.adjustment;
      if (adjustment != null && !Number.isFinite(adjustment)) {
        errors.push(issue("INVALID_MONEY", "responses.adjustment", `Adjustment at row ${item.sourceRow + 1} must be finite.`, { bidderId: bidder.id, rowId: item.id, sourceRow: item.sourceRow }));
      }
    }
  }
  return errors;
}

function archiveEntry(archive, path) {
  const normalized = path.replace(/^\/+/, "");
  const index = archive.FullPaths.findIndex((entryPath) => entryPath.replace(/^Root Entry\//, "") === normalized);
  if (index < 0) throw new WorkbookMappingError("INVALID_XLSX_PACKAGE", `Workbook package part ${normalized} was not found.`);
  return archive.FileIndex[index];
}

function entryText(archive, path) {
  return new TextDecoder().decode(archiveEntry(archive, path).content);
}

function setEntryText(archive, path, value) {
  const entry = archiveEntry(archive, path);
  entry.content = new TextEncoder().encode(value);
  entry.size = entry.content.length;
}

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(tag, name) {
  const match = new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]) : "";
}

function sheetPartPath(archive, sheetName) {
  const workbookXml = entryText(archive, "xl/workbook.xml");
  const sheetTag = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => xmlAttribute(tag, "name") === sheetName);
  if (!sheetTag) throw new WorkbookMappingError("MISSING_SOURCE_SHEET", `Worksheet ${sheetName} is not present in the workbook package.`);
  const relationshipId = xmlAttribute(sheetTag, "r:id");
  const relationships = entryText(archive, "xl/_rels/workbook.xml.rels");
  const relationshipTag = [...relationships.matchAll(/<Relationship\b[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => xmlAttribute(tag, "Id") === relationshipId);
  if (!relationshipTag) throw new WorkbookMappingError("INVALID_XLSX_PACKAGE", `Worksheet relationship ${relationshipId} was not found.`);
  const target = xmlAttribute(relationshipTag, "Target").replace(/^\/+/, "");
  return target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cellXml(address, value, existing = "") {
  const open = /^<c\b([^>]*?)(?:\/>|>)/.exec(existing)?.[1] ?? "";
  const preserved = open
    .replace(/\s+r="[^"]*"/g, "")
    .replace(/\s+t="[^"]*"/g, "")
    .trim();
  const attributes = ` r="${address}"${preserved ? ` ${preserved}` : ""}`;
  if (value == null || value === "") return `<c${attributes}/>`;
  if (typeof value === "number") return `<c${attributes}><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c${attributes} t="b"><v>${value ? 1 : 0}</v></c>`;
  const stringValue = String(value);
  const preserveSpace = /^\s|\s$/.test(stringValue) ? ' xml:space="preserve"' : "";
  return `<c${attributes} t="inlineStr"><is><t${preserveSpace}>${escapeXml(stringValue)}</t></is></c>`;
}

function columnNumber(address) {
  const letters = /^[A-Z]+/.exec(address)?.[0] ?? "";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function setWorksheetCell(xml, address, value) {
  const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existingPattern = new RegExp(`<c\\b[^>]*\\br="${escapedAddress}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const existing = xml.match(existingPattern)?.[0] ?? "";
  if (existing) return xml.replace(existingPattern, cellXml(address, value, existing));

  const rowNumber = Number(/\d+$/.exec(address)?.[0]);
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  const match = rowPattern.exec(xml);
  if (!match) throw new WorkbookMappingError("UNSUPPORTED_SOURCE_ROW", `Source row ${rowNumber} is absent from the worksheet XML.`);
  const newCell = cellXml(address, value);
  const targetColumn = columnNumber(address);
  let insertion = match[2].length;
  for (const candidate of match[2].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
    if (columnNumber(candidate[1]) > targetColumn) {
      insertion = candidate.index;
      break;
    }
  }
  const body = `${match[2].slice(0, insertion)}${newCell}${match[2].slice(insertion)}`;
  return `${xml.slice(0, match.index)}${match[1]}${body}${match[3]}${xml.slice(match.index + match[0].length)}`;
}

function forceExcelRecalculation(workbookXml) {
  const update = (tag) => {
    const existing = /^<calcPr\b([^>]*)/.exec(tag)?.[1]
      ?.replace(/\/$/, "")
      .replace(/\s+(?:calcMode|fullCalcOnLoad|forceFullCalc)="[^"]*"/g, "")
      .trim();
    return `<calcPr${existing ? ` ${existing}` : ""} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`;
  };
  if (/<calcPr\b[^>]*\/>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b[^>]*\/>/, update);
  }
  if (/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b[^>]*>[\s\S]*?<\/calcPr>/, update);
  }
  return workbookXml.replace(/<\/workbook>/, `${update("<calcPr/>")}</workbook>`);
}

export function exportBidWorkbook(input, workspace) {
  const warnings = [{
    code: "EXCEL_RECALC_REQUIRED",
    message: "The original OOXML parts are preserved and Excel is told to recalculate, but cached formula results can remain stale until the file is opened and recalculated in desktop Excel.",
  }];
  try {
    const originalBytes = bytesFrom(input);
    if (!workspace?.project?.sheetName) {
      return { ok: false, errors: exportDiagnostics(workspace), warnings, changes: [] };
    }
    const baseline = importBidWorkbook(originalBytes, { sheetName: workspace.project.sheetName });
    const errors = exportDiagnostics(workspace, baseline);
    if (errors.length) return { ok: false, errors, warnings, changes: [] };
    const archive = XLSX.CFB.read(originalBytes, { type: "array" });
    const sheetPath = sheetPartPath(archive, workspace.project.sheetName);
    let sheetXml = entryText(archive, sheetPath);
    const changes = [];
    let skippedDraftAdjustments = 0;
    const setIfChanged = (address, value, sourceValue, force = false) => {
      if (!force && sameValue(value, sourceValue)) return;
      sheetXml = setWorksheetCell(sheetXml, address, value);
      changes.push({ sheetName: workspace.project.sheetName, address });
    };

    setIfChanged("B1", workspace.project.name, baseline.project.name);
    setIfChanged("B4", workspace.project.trade, baseline.project.trade);
    for (const item of workspace.items) {
      const sourceItem = baseline.items.find((candidate) => candidate.sourceRow === item.sourceRow);
      const row = item.sourceRow + 1;
      setIfChanged(`B${row}`, item.description, sourceItem.description);
      const scopeMarker = item.required ? "Y" : "N";
      setIfChanged(`C${row}`, scopeMarker, sourceItem.scopeMarker);
      setIfChanged(`D${row}`, item.estimatorNote ?? "", sourceItem.estimatorNote ?? "");
    }

    for (const bidder of workspace.bidders) {
      const sourceBidder = baseline.bidders.find((candidate) => candidate.sourceSlot === bidder.sourceSlot);
      const newSlot = !sourceBidder;
      const start = BIDDER_SLOT_STARTS[bidder.sourceSlot];
      const statusColumn = XLSX.utils.encode_col(start);
      const nameColumn = XLSX.utils.encode_col(start + 1);
      const valueColumn = XLSX.utils.encode_col(start + 2);
      setIfChanged(`${nameColumn}1`, text(bidder.name), sourceBidder?.name ?? "", newSlot);
      setIfChanged(`${nameColumn}2`, text(bidder.contact), sourceBidder?.contact ?? "", newSlot);
      setIfChanged(`${valueColumn}5`, text(bidder.sourceStatus).toUpperCase(), sourceBidder?.sourceStatus ?? "", newSlot);
      setIfChanged(`${valueColumn}6`, bidder.baseBid, sourceBidder?.baseBid ?? null, newSlot);
      setIfChanged(`${statusColumn}8`, bidder.bondRate, sourceBidder?.bondRate ?? null, newSlot);

      for (const item of workspace.items) {
        const answer = bidder.responses?.[item.id];
        if (!answer) continue;
        const row = item.sourceRow + 1;
        const sourceAnswer = sourceBidder?.responses?.[item.id];
        setIfChanged(`${statusColumn}${row}`, text(answer.status).toUpperCase(), sourceAnswer?.status ?? "");
        setIfChanged(`${nameColumn}${row}`, answer.note ?? "", sourceAnswer?.note ?? "");
        const sourceAdjustment = numberOrNull(sourceAnswer?.rawValue) ?? 0;
        const adjustment = answer.approvedAdjustment
          ?? (answer.adjustmentApproved === false ? sourceAdjustment : answer.adjustment ?? 0);
        if (answer.adjustmentApproved === false && !sameValue(answer.adjustment ?? 0, sourceAdjustment)) {
          skippedDraftAdjustments += 1;
        }
        setIfChanged(`${valueColumn}${row}`, adjustment, sourceAdjustment);
      }
    }

    if (skippedDraftAdjustments) {
      warnings.push({
        code: "DRAFT_ADJUSTMENTS_NOT_EXPORTED",
        message: `${skippedDraftAdjustments} unapproved draft adjustment${skippedDraftAdjustments === 1 ? " was" : "s were"} left out of the workbook export.`,
      });
    }

    setEntryText(archive, sheetPath, sheetXml);
    setEntryText(archive, "xl/workbook.xml", forceExcelRecalculation(entryText(archive, "xl/workbook.xml")));
    const output = XLSX.CFB.write(archive, { type: "array", fileType: "zip", compression: true });
    return { ok: true, bytes: bytesFrom(output), errors: [], warnings, changes };
  } catch (error) {
    const mappingError = error instanceof WorkbookMappingError
      ? error
      : new WorkbookMappingError("WORKBOOK_EXPORT_FAILED", error instanceof Error ? error.message : "Workbook export failed.");
    return {
      ok: false,
      errors: mappingError.issues.length
        ? mappingError.issues
        : [issue(mappingError.code, "workbook", mappingError.message)],
      warnings,
      changes: [],
    };
  }
}

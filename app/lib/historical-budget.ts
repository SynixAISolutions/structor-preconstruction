import { addBudgetLine, budgetTotals, validateLineInput, type BudgetClass, type BudgetState } from "./budget";
import { ESTIMATE_STAGES, WORK_TYPES, TAX_STATUSES, type EstimateStage, type Project, type WorkType, type TaxStatus } from "./projects";

export type HistoryLine = { description: string; costCenter: string; classification: BudgetClass; csiCode: string | null; amount: number; byOwner: boolean };
export type BudgetHistory = {
  id: string; name: string; location: string; type: string; year: number; squareFeet: number;
  stage: EstimateStage; workType: WorkType | null; taxStatus: TaxStatus | null; certifications: string[];
  locationIndex: number; costIndex: number; source: string; lines: HistoryLine[];
};
export type ConceptFactors = { locationIndex: number; costIndex: number; profileFactor: number; basis: string };
export type ConceptBudget = { lines: (HistoryLine & { unitCost: number; observations: number })[]; total: number; area: number; records: { id: string; name: string; source: string }[]; factors: ConceptFactors; warnings: string[] };
type Cell = { v?: unknown; f?: string; t?: string };
export type BudgetSheet = Record<string, Cell>;
function fail(message: string): never { throw new Error(message); }
const text = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const money = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = text(v); if (!s) return NaN;
  return Number(s.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
};
const validAmount = (n: number) => Number.isFinite(n) && n >= 0 && n < 1e12;
const round = (n: number) => Math.round(n * 100) / 100;
const csiText = (value: unknown) => typeof value === "number" && Number.isInteger(value) ? String(value).padStart(value < 100 ? 2 : 5, "0") : text(value).replace(/\s+/g, "");
const column = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26);
const columnNumber = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Reads the app's flat budget export or the MCN estimate-summary layout; never guesses a total column. */
export function parseBudgetSheet(rows: unknown[][], cells: BudgetSheet): { lines: HistoryLine[]; total: number; sourceTotal: number | null } {
  if (!Array.isArray(rows) || rows.length > 5000) fail("Choose a budget summary with at most 5,000 rows.");
  const header = rows.findIndex(row => row.some(v => key(v) === "description") && row.some(v => ["budget", "amount"].includes(key(v))));
  const lines: HistoryLine[] = [];
  let sourceTotal: number | null = null;
  function add(description: string, costCenter: string, classification: BudgetClass, csi: unknown, amount: number, byOwner: boolean) {
    if (!description || description.length > 300 || !costCenter || costCenter.length > 150 || !validAmount(amount)) fail("Every imported line needs a description, cost center and a non-negative amount below $1 trillion. Check blank amounts and formula errors.");
    const csiCode = csiText(csi) || null;
    if (Object.keys(validateLineInput({ description, costCenter, classification, csiCode, budget: round(amount) })).length) fail(`Check the cost line and CSI code for ${description}. Use a valid division or five/six-digit code.`);
    lines.push({ description, costCenter, classification, csiCode, amount: round(amount), byOwner });
  }
  if (header >= 0) {
    const heads = rows[header].map(key), index = (...names: string[]) => heads.findIndex(h => names.includes(h));
    const description = index("description"), amount = index("budget", "amount"), center = index("costcenter"), classification = index("class", "classification"), csi = index("csi", "csicode"), owner = index("byowner");
    if (classification < 0) fail("Include a Class column with direct or indirect on every budget line.");
    for (const row of rows.slice(header + 1)) {
      if (row.every(v => !text(v))) continue;
      const kind = key(row[classification]);
      if (!["direct", "indirect"].includes(kind)) fail("Class must be direct or indirect; remove subtotal rows from flat imports.");
      const owned = owner < 0 ? "" : key(row[owner]);
      if (!["", "yes", "no", "true", "false"].includes(owned)) fail("By owner must be Yes or No.");
      add(text(row[description]), center < 0 ? "Project-wide" : text(row[center]), kind as BudgetClass, csi < 0 ? null : row[csi], money(row[amount]), ["yes", "true"].includes(owned));
    }
  } else {
    const csiRow = rows.findIndex(row => key(row[0]) === "csi" && key(row[1]) === "description");
    const totalCol = csiRow > 0 ? rows[csiRow - 1].findIndex(v => key(v) === "totalcost") : -1;
    if (csiRow < 0 || totalCol < 0) fail("Choose the MCN Estimate Summary sheet or a flat CSV with Description, Class and Budget columns.");
    const first = rows.findIndex((row, i) => i > csiRow && /^\d{5,6}$/.test(csiText(row[0])));
    const formula = first >= 0 ? cells[`${column(totalCol)}${first + 1}`]?.f ?? "" : "";
    const range = formula.match(/^\s*SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)\s*$/i);
    let included: number[];
    if (range && Number(range[2]) === first + 1 && Number(range[4]) === first + 1) {
      const start = columnNumber(range[1].toUpperCase()), end = columnNumber(range[3].toUpperCase());
      included = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
    } else {
      const parts = formula.trim().split("+").map(part => part.trim().match(/^\$?([A-Z]+)\$?(\d+)$/i));
      if (parts.length < 2 || parts.some(part => !part || Number(part[2]) !== first + 1)) fail("The MCN total must add its included cost-center cells or SUM their range on the same row. Check the workbook before importing.");
      included = parts.map(part => columnNumber(part![1].toUpperCase()));
    }
    if (!included.length || new Set(included).size !== included.length || included.some(c => c < 2 || c >= totalCol)) fail("The included cost-center range is invalid.");
    let indirect = false;
    for (let r = csiRow + 1; r < rows.length; r++) {
      const row = rows[r], label = text(row[1]);
      if (row.some(v => key(v) === "totaltradescost")) { indirect = true; continue; }
      if (row.some(v => key(v) === "totalcost")) { sourceTotal = money(row[totalCol]); break; }
      if (!label || row.some(v => key(v) === "constructioncost")) continue;
      if (!indirect && !/^\d{5,6}$/.test(csiText(row[0]))) continue;
      let any = false;
      for (const c of included) {
        const value = row[c];
        if (/by owner/i.test(label) && ["nic", "byowner", "excluded"].includes(key(value))) continue;
        if (value === null || value === undefined || value === "") {
          if (cells[`${column(c)}${r + 1}`]?.f) fail("A budget formula has no cached value. Recalculate and save the workbook first.");
          continue;
        }
        const amount = money(value);
        if (!validAmount(amount)) fail(`Invalid budget value at ${column(c)}${r + 1}; recalculate the workbook and check that cell.`);
        any = true; add(label, text(rows[csiRow - 1][c]), indirect ? "indirect" : "direct", indirect ? null : row[0], amount, /by owner/i.test(label));
      }
      if (!any && /by owner/i.test(label)) add(label, "Project-wide", indirect ? "indirect" : "direct", indirect ? null : row[0], 0, true);
    }
    const sum = round(lines.reduce((n, line) => n + line.amount, 0));
    if (sourceTotal === null || !validAmount(sourceTotal) || Math.abs(sum - sourceTotal) > .02) fail("The imported detail does not reconcile to the workbook's Total Cost. Nothing was saved.");
  }
  if (!lines.length || lines.length > 2000) fail("Import between 1 and 2,000 detail lines; totals and subtotals must not be imported twice.");
  const total = round(lines.filter(line => !line.byOwner).reduce((sum, line) => sum + line.amount, 0));
  if (!validAmount(total) || !total) fail("The historical contractor budget must have a positive total.");
  return { lines, total, sourceTotal };
}

export function validateBudgetHistory(record: BudgetHistory): BudgetHistory {
  if (!record || ![record.id, record.name, record.source, record.location, record.type].every(value => typeof value === "string" && value.trim()) || !Number.isInteger(record.year) || record.year < 1900 || record.year > 2200 || !Number.isFinite(record.squareFeet) || record.squareFeet <= 0 || record.squareFeet > 1e9 || !ESTIMATE_STAGES.some(s => s.value === record.stage) || !Array.isArray(record.certifications) || record.certifications.some(value => typeof value !== "string") || !Array.isArray(record.lines) || !record.lines.length || record.lines.length > 2000) fail("Complete the historical project's name, location, type, estimate year, stage, gross building area and source.");
  if ((record.workType !== null && !WORK_TYPES.some(item => item.value === record.workType)) || (record.taxStatus !== null && !TAX_STATUSES.some(item => item.value === record.taxStatus))) fail("Check the historical work type and tax status.");
  if (![record.locationIndex, record.costIndex].every(n => Number.isFinite(n) && n > 0 && n <= 1000)) fail("Location and cost indexes must be positive numbers, at most 1,000.");
  if (record.lines.some(line => !line || typeof line.description !== "string" || typeof line.costCenter !== "string" || (line.csiCode !== null && typeof line.csiCode !== "string") || typeof line.byOwner !== "boolean" || !validAmount(line.amount) || Object.keys(validateLineInput({ ...line, budget: line.amount })).length)) fail("The historical detail contains an invalid cost line.");
  const total = record.lines.filter(line => !line.byOwner).reduce((sum, line) => sum + line.amount, 0);
  if (!validAmount(total) || total <= 0) fail("The historical contractor total must be positive and below $1 trillion.");
  return record;
}

/** Area-weighted costs across observed matching lines; missing lines are disclosed, not treated as zero. */
export function generateConceptBudget(project: Project, history: BudgetHistory[], factors: ConceptFactors): ConceptBudget {
  if (!history.length || history.length > 50 || new Set(history.map(record => record.id)).size !== history.length) fail("Choose between 1 and 50 different historical projects.");
  history.forEach(validateBudgetHistory);
  if (!Number.isFinite(project.squareFeet) || project.squareFeet <= 0 || !project.estimateStage) fail("Record the target project's estimate stage and gross building area first.");
  if (![factors.locationIndex, factors.costIndex, factors.profileFactor].every(n => Number.isFinite(n) && n > 0 && n <= 1000) || factors.profileFactor > 10) fail("Use positive indexes up to 1,000 and a project-profile factor up to 10.");
  if ((factors.profileFactor !== 1 || history.some(record => record.locationIndex !== factors.locationIndex || record.costIndex !== factors.costIndex)) && !factors.basis.trim()) fail("Explain the source and reason for the adjustment factors.");
  const groups = new Map<string, { line: HistoryLine; cost: number; area: number; observations: number }>();
  const warnings: string[] = [];
  for (const record of history) {
    if (record.location !== project.location) warnings.push(`${record.name}: location differs. Review the location index against the same source and base.`);
    if (record.type !== project.type || record.workType !== project.workType || record.taxStatus !== project.taxStatus || [...record.certifications].sort().join() !== [...project.certifications].sort().join()) warnings.push(`${record.name}: project type, work, tax or certification profile differs. Review scope and any profile adjustment.`);
    const perProject = new Map<string, { line: HistoryLine; cost: number }>();
    for (const line of record.lines) {
      const id = [line.costCenter, line.classification, line.csiCode ?? "", line.description, line.byOwner].map(key).join(":");
      const entry = perProject.get(id) ?? { line, cost: 0 }; entry.cost += line.amount; perProject.set(id, entry);
    }
    for (const [id, item] of perProject) {
      const group = groups.get(id) ?? { line: item.line, cost: 0, area: 0, observations: 0 };
      group.cost += item.cost * factors.locationIndex / record.locationIndex * factors.costIndex / record.costIndex;
      group.area += record.squareFeet; group.observations++; groups.set(id, group);
    }
  }
  const lines = [...groups.values()].map(group => ({ ...group.line, unitCost: group.cost / group.area * factors.profileFactor, amount: round(group.cost / group.area * project.squareFeet * factors.profileFactor), observations: group.observations }));
  if (lines.some(line => !validAmount(line.amount))) fail("The generated amounts exceed the supported budget size.");
  if (lines.some(line => line.observations !== history.length)) warnings.push("Some cost lines are absent from selected projects. Their rate uses only the projects that recorded that line; absence is not a zero cost.");
  warnings.push("Costs use gross building area, including site and indirect costs. Review differences in site scope, renovation mix, exclusions and estimate stage. No RSMeans data or automatic tax/labor premium is assumed.");
  const total = round(lines.filter(line => !line.byOwner).reduce((n, line) => n + line.amount, 0));
  if (!validAmount(total)) fail("The generated total exceeds the supported budget size.");
  return { lines, area: project.squareFeet, total, records: history.map(({ id, name, source }) => ({ id, name, source })), factors: { ...factors }, warnings };
}

export function applyConceptBudget(state: BudgetState, result: ConceptBudget, by: string): BudgetState {
  if (state.lines.length || state.allowances.length) fail("This project already has a cost plan. Export the concept for comparison; existing budgets and commitments are kept.");
  let next = state;
  for (const line of result.lines) next = addBudgetLine(next, { ...line, budget: line.amount, forecast: null, committed: 0 }, by);
  if (Math.abs(budgetTotals(next).totalBudget - result.total) > .01) fail("The generated budget did not reconcile; nothing was applied.");
  return { ...next, conceptSource: { ...result, appliedBy: by, appliedAt: new Date().toISOString() } };
}

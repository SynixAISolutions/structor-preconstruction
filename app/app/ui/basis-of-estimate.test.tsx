import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { basisOfEstimate } from "../../lib/basis-of-estimate";
import type { BudgetState } from "../../lib/budget";
import { sampleBudget } from "../../lib/data/budget";
import type { StoredDocument } from "../../lib/project-files";
import { EMPTY_SETUP } from "../../lib/project-setup";
import { sampleProjectRecords } from "../../lib/projects";
import { BasisDocument, BasisOfEstimatePreview } from "./basis-of-estimate";

const project = sampleProjectRecords[0];
const documents: StoredDocument[] = [{ id: "drawing", projectId: project.id, series: "drawings", revision: 1, name: "Issued drawings.pdf", kind: "drawings", category: "Drawings", size: 1, pageCount: 1, uploadedAt: "2026-10-15T09:00:00Z", sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sheets: [{ page: 1, sheet: "A1.1", title: "Plan", date: "" }], sections: [] }];
const emptyBudget: BudgetState = { lines: [], allowances: [], costCenters: [] };
const preview = (budget = sampleBudget, docs = documents, ready = true) => renderToStaticMarkup(<BasisOfEstimatePreview project={project} budget={budget} documents={docs} setup={EMPTY_SETUP} ready={ready} navigate={() => {}} onBack={() => {}}/>);

test("Jelleff preview matches the budget's 11 fee lines, 6 owner items and all 19 allowances to confirm", () => {
  const result = basisOfEstimate({ project, budget: sampleBudget, documents, setup: EMPTY_SETUP });
  const byHeading = Object.fromEntries(result.sections.map(s => [s.heading, s.lines]));
  assert.equal(byHeading["Contingency and fee"].length, 11);
  assert.equal(byHeading["Excluded or carried by the owner"].length, 6);
  assert.equal(sampleBudget.allowances.filter(a => a.status === "review").length, 19);
  assert.equal(byHeading["Open items"].filter(line => line.startsWith("Allowance to confirm:")).length, 19);
  assert.ok(!byHeading.Clarifications);
  const html = preview();
  for (const section of result.sections) {
    assert.ok(html.includes(section.heading));
    for (const line of section.lines) assert.ok(html.includes(renderToStaticMarkup(<li>{line}</li>)), line);
  }
  for (const label of ["Copy as text", "Download .md", "Print", "Review Allowances", "Review Project setup", "Back to Budget summary"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes('disabled=""'));
});

test("document has a project name, preparation date, semantic headings and escaped source text", () => {
  const html = renderToStaticMarkup(<BasisDocument projectName="Library <draft>" date="2026-10-21" sections={[{ heading: "Basis", lines: ["Drawing <A1.1>"] }]}/>);
  for (const part of ["<article", "<h2>Library &lt;draft&gt;</h2>", '<time dateTime="2026-10-21">2026-10-21</time>', "<h3>Basis</h3>", "<li>Drawing &lt;A1.1&gt;</li>"]) assert.ok(html.includes(part), part);
});

test("fresh project explains both missing inputs, offers next steps and disables exports", () => {
  const html = preview(emptyBudget, []);
  for (const text of ["Build this project&#x27;s basis of estimate", "No budget lines recorded", "No project documents recorded", "Open Budget summary", "Open Project files"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  assert.ok(!html.includes("<article"));
  assert.ok(!html.includes("Direct cost $0"));
});

test("loading documents cannot export an incomplete basis; partial records keep missing-input guidance", () => {
  const loading = preview(sampleBudget, [], false);
  assert.ok(loading.includes("Loading project documents"));
  assert.equal((loading.match(/disabled=""/g) ?? []).length, 3);
  assert.ok(!loading.includes("<article"));
  const noDocuments = preview(sampleBudget, []);
  assert.ok(noDocuments.includes("No project documents recorded"));
  assert.ok(noDocuments.includes("<article"));
  const noBudget = preview(emptyBudget);
  assert.ok(noBudget.includes("No budget lines recorded"));
  assert.ok(noBudget.includes("<article"));
});

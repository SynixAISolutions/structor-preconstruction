import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProjectRecords } from "../../lib/projects";
import type { useBudget } from "../../lib/use-budget";

require.extensions[".css"] = () => {};
const { ConceptBudgetView } = require("./concept-budget") as typeof import("./concept-budget");
const { ProjectForm } = require("./project-record") as typeof import("./project-record");

test("legacy projects keep an unknown stage and cannot generate a concept from unrecorded history", () => {
  const project = { ...sampleProjectRecords[0], estimateStage: null };
  const budget = { state: { lines: [], allowances: [], costCenters: [] }, run: () => null } as unknown as ReturnType<typeof useBudget>;
  const html = renderToStaticMarkup(<ConceptBudgetView project={project} budget={budget} notify={() => {}} navigate={() => {}}/>);
  assert.match(html, /Record this project&#x27;s estimate stage/);
  assert.match(html, /No historical budgets uploaded/);
  assert.match(html, /RSMeans is not connected/);
  assert(!html.includes("Create project budget from this concept"));
});

test("project form offers concept, schematic and design-development stages", () => {
  const html = renderToStaticMarkup(<ProjectForm onSave={() => {}} onCancel={() => {}}/>);
  assert.match(html, /name="estimateStage"/);
  for (const [value, label] of [["concept", "Concept"], ["schematic", "Schematic design"], ["dd", "Design development"]]) assert.match(html, new RegExp(`value="${value}"[^>]*>${label}`));
});

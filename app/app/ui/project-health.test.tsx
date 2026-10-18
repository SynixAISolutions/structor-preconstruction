import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { ProjectHealthCharts, ProgressRing } from "./project-health";
import { TodoTaskCard, DoneTaskCard } from "./todo-cards";
import { RfpComparisonRows } from "./rfp-review";
import { SetupStatusBadge } from "./project-setup";
import { compareRfpFacts } from "../../lib/rfp";
import { sampleProjectRecords } from "../../lib/projects";

const navigate = () => {};
const empty: ComponentProps<typeof ProjectHealthCharts>["summary"] = { ready: true, progress: { done: 0, total: 4, percent: 0 }, packages: [], groups: [], setup: { steps: [], next: null, progress: { done: 0, total: 9, percent: 0 }, completeness: { done: 0, total: 7, percent: 0, missing: 7, review: 0, waiting: 0 } } };

test("an empty project has honest zero progress and a path to its first trade", () => {
  const html = renderToStaticMarkup(<ProjectHealthCharts summary={empty} navigate={navigate}/>);
  assert.match(html, /Project completion: 0%/);
  assert.match(html, /0 of 4 workflow milestones/);
  assert.match(html, /Your first trade starts here/);
  assert.match(html, /Project milestones only. Trade milestones appear after you confirm trades./);
  assert.match(html, /No open tasks/);
  assert.doesNotMatch(html, /NaN|Infinity|100%/);
});

test("readiness exposes its denominator, warning counts and not-applicable basis", () => {
  const summary = { ...empty, setup: { ...empty.setup!, completeness: { done: 2, total: 7, percent: 29, missing: 3, review: 1, waiting: 1 } }, groups: [{ group: "setup" as const, label: "Project setup", screen: "setup" as const, todo: 3, waiting: 1 }] };
  const html = renderToStaticMarkup(<ProjectHealthCharts summary={summary} navigate={navigate}/>);
  assert.match(html, /2 of 7 items ready or marked not applicable/);
  assert.match(html, /Missing file or detail<\/span><b>3/);
  assert.match(html, /Check information<\/span><b>1/);
  assert.match(html, /3 team actions/);
  assert.match(html, /1 waiting/);
  assert.match(html, /Check to-do list for missing information/);
});

test("loading rings do not present preliminary percentages as checked facts", () => {
  const html = renderToStaticMarkup(<ProgressRing percent={71} label="Files" detail="Preliminary" pending/>);
  assert.match(html, /Files: checking project records/);
  assert.doesNotMatch(html, /71|health-ring-arc/);
});

test("task flags are readable without color and completed work is not a manual checkbox", () => {
  const task = { id: "setup:survey", group: "setup" as const, title: "Survey not uploaded", detail: "Needed for sitework", status: "todo" as const, priority: "high" as const, screen: "setup" as const, packageId: null, refs: {}, count: 1, flag: { tone: "red" as const, label: "Missing file" } };
  const missing = renderToStaticMarkup(<TodoTaskCard task={task} group="Project setup" navigate={navigate}/>);
  assert.match(missing, /Missing file/);
  assert.match(missing, /Open Project setup for Survey not uploaded/);
  const review = renderToStaticMarkup(<TodoTaskCard task={{ ...task, flag: { tone: "yellow", label: "Check information" } }} group="Project setup" navigate={navigate}/>);
  assert.match(review, /Check information/);
  const done = renderToStaticMarkup(<DoneTaskCard task={{ id: task.id, title: task.title, group: task.group, at: "2026-10-18T08:00:00Z" }} group="Project setup"/>);
  assert.match(done, /Done/);
  assert.match(done, /dateTime="2026-10-18T08:00:00Z"/i);
  assert.doesNotMatch(done, /type="checkbox"/);
});

test("RFP conflicts retain both values and a source without preselecting replacements", () => {
  const project = sampleProjectRecords[0];
  const rows = compareRfpFacts(project, [{ field: "name", value: "A different project name", page: 2, quote: "A different project name" }]).rows;
  const html = renderToStaticMarkup(<RfpComparisonRows rows={rows} selected={[]} onSelect={() => {}} onSource={() => {}}/>);
  assert.match(html, /Different from current/);
  assert.ok(html.includes(project.name));
  assert.match(html, /A different project name/);
  assert.match(html, /View source · page 2/);
  assert.doesNotMatch(html, /checked=""/);
});

test("setup status labels distinguish failed, waiting and reconsidered decisions", () => {
  assert.match(renderToStaticMarkup(<SetupStatusBadge status="failed"/>), /yellow.*Check file/);
  assert.match(renderToStaticMarkup(<SetupStatusBadge status="waiting"/>), /Waiting/);
  assert.match(renderToStaticMarkup(<SetupStatusBadge status="not-applicable" reconsider/>), /Reconsider/);
});

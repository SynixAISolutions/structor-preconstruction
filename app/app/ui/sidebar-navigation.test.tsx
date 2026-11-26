import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarNavigation } from "./sidebar-navigation";
import type { Screen } from "../../lib/screens";

const Icon = () => <svg/>;
const render = (screen: Screen, projectOpen: boolean, sample = false) => renderToStaticMarkup(<SidebarNavigation screen={screen} projectOpen={projectOpen} sample={sample} navigate={() => {}} icon={Icon}/>);

test("workspace navigation shows only the global tools, without Ratings until it is built", () => {
  const html = render("projects", false);
  assert.equal((html.match(/<button/g) ?? []).length, 6);
  for (const label of ["All projects", "Subcontractor directory", "Subcontractor aggregate limits", "Estimator workload", "Unit cost database", "AI memory"]) assert.ok(html.includes(label));
  assert.ok(!html.includes("Subcontractor ratings"), "Hidden until the rating rules are agreed (25 Nov)");
  assert.ok(!html.includes("PRECONSTRUCTION"));
  assert.ok(!html.includes("Preview as subcontractor"));
});

/** A collapsible section's entries, by its label (sidebar-controls renders each section as details/summary). */
const section = (html: string, label: string) => html.match(new RegExp(`<summary[^>]*><span>${label}</span>.*?</summary>(.*?)</details>`, "s"))?.[1];

test("project navigation closes each section before the next standalone tool", () => {
  const html = render("checks", true);
  const outreach = section(html, "Subcontractor outreach");
  assert.ok(outreach?.includes("Bid packages"));
  assert.ok(outreach?.includes("Bid leveling"));
  assert.ok(!outreach?.includes("Structor Check"));
  assert.ok(!outreach?.includes("Revision comparison"));
  assert.ok(html.includes("Back to All projects"));
  assert.ok(!html.includes("Subcontractor directory"));
  assert.ok(section(html, "Preconstruction budget")?.includes("Budget summary"));
  assert.equal(section(html, "Compliance and contracts"), undefined, "Folded into Subcontractor outreach (24 Oct)");
  assert.ok(section(html, "3D model studio")?.includes("Interior finishes"));
});

test("the subcontractor preview remains reachable and marks its active entry", () => {
  const html = render("portal", true);
  assert.match(html, /aria-current="page"[^>]*><svg.*?Preview as subcontractor/s);
  assert.equal((html.match(/Preview as subcontractor/g) ?? []).length, 1);
});

test("the traced MEP, structural and exterior models are Project 1's only", () => {
  const sample = render("model", true, true);
  for (const label of ["Interior finishes", "MEP coordination", "Structural model", "Exterior model"]) assert.ok(sample.includes(label));
  const other = render("model", true, false);
  assert.ok(other.includes("Interior finishes"));
  for (const label of ["MEP coordination", "Structural model", "Exterior model"]) assert.ok(!other.includes(label), `${label} shows the same generated model as Interior finishes on another project`);
});

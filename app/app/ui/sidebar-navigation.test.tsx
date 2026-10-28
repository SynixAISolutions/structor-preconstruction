import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarNavigation } from "./sidebar-navigation";
import type { Screen } from "../../lib/screens";

const Icon = () => <svg/>;
const render = (screen: Screen, projectOpen: boolean) => renderToStaticMarkup(<SidebarNavigation screen={screen} projectOpen={projectOpen} navigate={() => {}} icon={Icon}/>);

test("workspace navigation shows only the four global tools", () => {
  const html = render("projects", false);
  assert.equal((html.match(/<button/g) ?? []).length, 4);
  for (const label of ["All projects", "Subcontractor directory", "Subcontractor ratings", "Subcontractor prequalification"]) assert.ok(html.includes(label));
  assert.ok(!html.includes("PRECONSTRUCTION"));
  assert.ok(!html.includes("Preview as subcontractor"));
});

test("project navigation closes each section before the next standalone tool", () => {
  const html = render("checks", true);
  const outreach = html.match(/aria-label="Subcontractor outreach">(.*?)<\/div>/s)?.[1];
  assert.ok(outreach?.includes("Bid packages"));
  assert.ok(outreach?.includes("Bid leveling"));
  assert.ok(!outreach?.includes("Structor Check"));
  assert.ok(!outreach?.includes("Revision comparison"));
  assert.ok(html.includes("Back to All projects"));
  assert.ok(!html.includes("Subcontractor directory"));
  assert.ok(html.includes('aria-label="Preconstruction budget"'));
  assert.ok(!html.includes('aria-label="Compliance and contracts"'), "Folded into Subcontractor outreach (24 Oct)");
  assert.ok(html.includes('aria-label="3D model studio"'));
});

test("the subcontractor preview remains reachable and marks its active entry", () => {
  const html = render("portal", true);
  assert.match(html, /aria-current="page"[^>]*><svg.*?Preview as subcontractor/s);
  assert.equal((html.match(/Preview as subcontractor/g) ?? []).length, 1);
});

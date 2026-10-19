import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparableRanking, initialComparables } from "./concept-ai-review";
import type { ConceptSuggestion } from "../../lib/concept-ai";
test("comparable ranking selects scores at sixty, retains reasons and leaves lower scores optional", () => {
  const suggestion: ConceptSuggestion = { comparables: [{ id: "same", name: "Same-city recreation", score: 95, reasons: "Same city and building type" }, { id: "edge", name: "Similar size", score: 60, reasons: "Similar area" }, { id: "other", name: "Office", score: 40, reasons: "Different use" }], factors: { locationIndex: 100, costIndex: 100, profileFactor: 1, basis: "No change" }, notes: [] };
  const selected = initialComparables(suggestion); assert.deepEqual(selected, ["same", "edge"]);
  const html = renderToStaticMarkup(<ComparableRanking suggestion={suggestion} selected={selected} onSelect={() => {}}/>);
  assert.equal((html.match(/checked=""/g) ?? []).length, 2); assert.match(html, /Same city and building type/); assert.match(html, /40\/100 match/); assert.match(html, /width:95%/);
  assert.ok(!html.includes("$"));
});

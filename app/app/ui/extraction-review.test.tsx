import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleExtraction } from "../../lib/data/extraction";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleDrawingFlip } from "../../lib/data/drawing-flip";
import { acceptDraft, type Draft, type ExtractionState } from "../../lib/extraction";
import { findingCitationSources, findingTitle } from "./extraction-citations";
import type { useExtraction } from "../../lib/use-extraction";

// Node does not render styles; the browser checks layout separately.
require.extensions[".css"] = () => {};
const { ExtractionReview } = require("./extraction-review") as typeof import("./extraction-review");
const { DrawingCanvas, DrawingFlipWorkspace } = require("./drawing-flip-ui") as typeof import("./drawing-flip-ui");
const region = sampleExtraction.drafts.find(d => d.kind === "region")!;
const scope = sampleExtraction.drafts.find(d => d.kind === "scope" && d.status === "pending-review")!;
const render = (extraction: ExtractionState, packageId = "drywall") => renderToStaticMarkup(<ExtractionReview review={{ extraction, procurement: sampleProcurement, flip: sampleDrawingFlip, run: () => null, accept: () => null, runProcurement: () => null, runFlip: () => null } as ReturnType<typeof useExtraction>} packageId={packageId} sections={[]} colors={new Map()} by="Reviewer" notify={() => {}} onOpenScope={() => {}}/>);

test("citations match document, PDF page and sheet together", () => {
  const cite = region.citations[0];
  assert.equal(findingCitationSources(region, cite, sampleDrawingFlip, []).drawings.length, 1);
  for (const change of [{ document: "Another set.pdf" }, { page: 4 }, { sheet: "A-102" }]) {
    const sources = findingCitationSources(region, { ...cite, ...change }, sampleDrawingFlip, []);
    assert.equal(sources.drawings.length, 0);
    assert.ok(sources.unresolved);
  }
});

test("accepted region source shows its own highlight and scope source follows the accepted ID", () => {
  let records = { extraction: sampleExtraction, procurement: sampleProcurement, flip: sampleDrawingFlip };
  records = acceptDraft(records, region.id, "Reviewer");
  records = acceptDraft(records, scope.id, "Reviewer");
  const acceptedRegion = records.extraction.drafts.find(d => d.id === region.id)!;
  const sources = findingCitationSources(acceptedRegion, region.citations[0], records.flip, []);
  assert.deepEqual(sources.drawings[0].regions.map(r => r.id), [acceptedRegion.kind === "region" && acceptedRegion.acceptedId]);
  const acceptedScope = records.extraction.drafts.find(d => d.id === scope.id)!;
  assert.equal(findingCitationSources(acceptedScope, region.citations[0], records.flip, []).drawings[0].regions.length, 1);
});

test("sample review separates pending findings from rejected findings and states the source limit", () => {
  const html = render(sampleExtraction);
  assert.match(html, /Illustrative sample.*no documents were read/);
  assert.equal((html.match(/class="ext-card pending-review"/g) ?? []).length, 5);
  assert.ok(!html.includes("Sound-rated doors"));
  assert.match(html, /1 rejected/);
  assert.match(html, /1.*Edited/);
});

test("empty trade and failed run do not show acceptance controls", () => {
  assert.match(render(sampleExtraction, "concrete"), /No AI findings for this trade/);
  const failed: ExtractionState = { runs: [{ ...sampleExtraction.runs[0], status: "failed", error: "Source could not be read" }], drafts: [] };
  const html = render(failed);
  assert.match(html, /Extraction failed: Source could not be read/);
  assert.ok(!html.includes("Accept selected"));
});

test("a run remains visible after its finding moves to a different trade", () => {
  const moved = { ...sampleExtraction, drafts: [{ ...scope, packageId: "concrete" } as Draft] };
  assert.match(render(moved, "concrete"), new RegExp(findingTitle(scope)));
});

test("drawing highlights use the sheet aspect rather than a fixed canvas height", () => {
  const page = { ...sampleDrawingFlip.pages[0], aspect: 2, image: "/test-sheet.png" };
  const html = renderToStaticMarkup(<DrawingCanvas page={page} regions={[{ id: "r", number: "D", label: "Test area", packageId: "drywall", status: "pending-review", polygon: [{ x: .1, y: .25 }, { x: .2, y: .25 }, { x: .2, y: .5 }] }]} selectedId="r" colors={new Map()} onSelect={() => {}} expandable={false}/>);
  assert.match(html, /viewBox="0 0 1000 500"/);
  assert.match(html, /points="100,125 200,125 200,250"/);
  assert.match(html, /width="1000" height="500"/);
});

test("a trade remains available in the drawing filter on a sheet without its regions", () => {
  const html = renderToStaticMarkup(<DrawingFlipWorkspace projectName="Sample project" notify={() => {}} navigate={() => {}}/>);
  const filter = html.match(/<select aria-label="Filter by trade"[^>]*>([\s\S]*?)<\/select>/)?.[1];
  assert.ok(filter);
  assert.match(filter, /<option value="drywall">09 · Drywall \(0\)<\/option>/);
  assert.match(filter, /<option value="demolition">02 · Demolition \(3\)<\/option>/);
});

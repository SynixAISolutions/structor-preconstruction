import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleDrawingFlip } from "../../lib/data/drawing-flip";
require.extensions[".css"] = () => {};
const {DrawingCanvas, DrawingFlipWorkspace, pointerToPage, RedrawOutlineButton, RegionHistory, TraceControls}=require("./drawing-flip-ui") as typeof import("./drawing-flip-ui");
test("sheet overlays are keyboard selectable and the sheet picker groups disciplines and region counts",()=>{
 const page=sampleDrawingFlip.pages[0], regions=sampleDrawingFlip.regions.filter(r=>r.pageId===page.id);
 const html=renderToStaticMarkup(<DrawingCanvas page={page} regions={regions} selectedId={regions[0]?.id||""} colors={new Map()} onSelect={()=>{}}/>);
 assert.equal((html.match(/role="button" tabindex="0"/g)||[]).length,regions.length);
 assert.match(html,/Expand drawing/);
 const screen=renderToStaticMarkup(<DrawingFlipWorkspace projectName="Jelleff" notify={()=>{}} navigate={()=>{}}/>);
 for(const text of ["Search sheets","optgroup","regions","Open full page","Find on drawings","Confidence","Linked scope items"])assert.ok(screen.includes(text),text);
});

test("pointer coordinates follow the sheet bounds at 100% and 200% after panning", () => {
  assert.deepEqual(pointerToPage(350, 225, { left: 100, top: 100, width: 1000, height: 500 }), { x: .25, y: .25 });
  assert.deepEqual(pointerToPage(350, 225, { left: -150, top: -25, width: 2000, height: 1000 }), { x: .25, y: .25 });
  assert.deepEqual(pointerToPage(1100, 600, { left: 100, top: 100, width: 1000, height: 500 }), { x: 1, y: 1 });
  assert.equal(pointerToPage(99, 225, { left: 100, top: 100, width: 1000, height: 500 }), null);
  assert.equal(pointerToPage(350, 601, { left: 100, top: 100, width: 1000, height: 500 }), null);
  assert.equal(pointerToPage(0, 0, { left: 0, top: 0, width: 0, height: 0 }), null);
});

test("redraw button uses the guide label and history offers previous-outline comparison", () => {
  assert.match(renderToStaticMarkup(<RedrawOutlineButton onClick={() => {}}/>), /<button[^>]*>.*Redraw outline<\/button>/);
  const event = { kind: "redrawn" as const, by: "Marcel Khoury", at: "2026-10-23T10:00:00Z", from: sampleDrawingFlip.regions[0].polygon, reason: "Tighter around the curb" };
  const region = { ...sampleDrawingFlip.regions[0], history: [...sampleDrawingFlip.regions[0].history, event] };
  const html = renderToStaticMarkup(<RegionHistory region={region} packages={[]} comparison={event} onCompare={() => {}}/>);
  for (const text of ['aria-pressed="true"', "Outline redrawn", "Marcel Khoury", "Oct", "2026", "Tighter around the curb", "Compare previous outline"]) assert.ok(html.includes(text), text);
  assert.match(renderToStaticMarkup(<DrawingFlipWorkspace projectName="Jelleff" notify={() => {}} navigate={() => {}}/>), /Redraw outline/);
  const page = sampleDrawingFlip.pages[0];
  const sheet = renderToStaticMarkup(<DrawingCanvas page={page} regions={[region]} selectedId={region.id} colors={new Map()} onSelect={() => {}} comparison={{ regionId: region.id, from: event.from }}/>);
  assert.match(sheet, /class="flip-previous-outline"/);
  assert.match(sheet, /aria-label="Previous outline"/);
  assert.doesNotMatch(renderToStaticMarkup(<RegionHistory region={{ ...region, history: [{ ...event, reason: "" }] }} packages={[]} onCompare={() => {}}/>), /<em>/);
});

test("trace controls disable Finish below three points and present all contract errors", () => {
  const actions = { onUndo() {}, onFinish() {}, onCancel() {}, onReason() {} };
  const trace = { regionId: "r-001", points: [{ x: .1, y: .1 }, { x: .2, y: .2 }], reason: "", errors: { polygon: "Outline is too small", region: "Region missing", by: "Reviewer required" } };
  const html = renderToStaticMarkup(<TraceControls trace={trace} number="R-001" {...actions}/>);
  assert.match(html, /disabled="">Finish/);
  for (const text of ["Tracing R-001", "Enter to finish", "Esc to cancel", "Reason (optional)", "Outline is too small", "Region missing", "Reviewer required"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(renderToStaticMarkup(<TraceControls trace={{ ...trace, points: [...trace.points, { x: .3, y: .1 }] }} number="R-001" {...actions}/>), /disabled="">Finish/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleDrawingFlip } from "../../lib/data/drawing-flip";
require.extensions[".css"] = () => {};
const {DrawingCanvas, DrawingFlipWorkspace}=require("./drawing-flip-ui") as typeof import("./drawing-flip-ui");
test("sheet overlays are keyboard selectable and the sheet picker groups disciplines and region counts",()=>{
 const page=sampleDrawingFlip.pages[0], regions=sampleDrawingFlip.regions.filter(r=>r.pageId===page.id);
 const html=renderToStaticMarkup(<DrawingCanvas page={page} regions={regions} selectedId={regions[0]?.id||""} colors={new Map()} onSelect={()=>{}}/>);
 assert.equal((html.match(/role="button" tabindex="0"/g)||[]).length,regions.length);
 assert.match(html,/Expand drawing/);
 const screen=renderToStaticMarkup(<DrawingFlipWorkspace projectName="Jelleff" notify={()=>{}} navigate={()=>{}}/>);
 for(const text of ["Search sheets","optgroup","regions","Open full page","Find on drawings","Confidence","Linked scope items"])assert.ok(screen.includes(text),text);
});

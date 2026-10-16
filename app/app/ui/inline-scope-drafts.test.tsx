import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleExtraction } from "../../lib/data/extraction";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleDrawingFlip } from "../../lib/data/drawing-flip";
import type { useExtraction } from "../../lib/use-extraction";
import { deleteDraft, type ExtractionState } from "../../lib/extraction";
require.extensions[".css"] = () => {};
const { InlineScopeDrafts } = require("./inline-scope-drafts") as typeof import("./inline-scope-drafts");
const review=(extraction:ExtractionState)=>({extraction,procurement:sampleProcurement,flip:sampleDrawingFlip,run:()=>null,runProcurement:()=>null,runFlip:()=>null,accept:()=>null,removeScope:()=>null}) as ReturnType<typeof useExtraction>;
const render=(state:ExtractionState)=>renderToStaticMarkup(<InlineScopeDrafts review={review(state)} packageId="drywall" query="" sections={[]} colors={new Map()} by="Reviewer" notify={()=>{}} onMove={()=>{}}/>);
test("AI proposals expose inline decisions and page citations without a second upload",()=>{
 const html=render(sampleExtraction);
 for(const name of ['Accept','Reject','Move','Delete','Illustrative sample'])assert.ok(html.includes(name));
 assert.match(html,/p\. 431/);assert.ok(!html.includes('type="file"'));
});
test("deleting a proposal hides its inline line while retaining its audit",()=>{
 const draft=sampleExtraction.drafts.find(d=>d.kind==='scope'&&d.status==='pending-review')!;
 const next=deleteDraft(sampleExtraction,draft.id,'Reviewer');
 assert.ok(next.drafts.find(d=>d.id===draft.id)?.removed);
 assert.ok(!render(next).includes(`Accept ${draft.kind==='scope'?draft.title:''}`));
});

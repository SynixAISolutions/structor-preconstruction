import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleSubmittals } from "../../lib/data/submittals";
require.extensions[".css"] = () => {};
const {SubmittalTradeTiles}=require("./submittal-log-ui") as typeof import("./submittal-log-ui");
test("submittals have one keyboard trade tile in procurement order, retaining zero counts",()=>{
 const html=renderToStaticMarkup(<SubmittalTradeTiles packages={sampleProcurement.packages} submittals={sampleSubmittals.submittals} onOpen={()=>{}}/>);
 assert.equal((html.match(/class="leveling-trade-tile"/g)||[]).length,26);
 let position=-1;for(const p of sampleProcurement.packages){const next=html.indexOf(`<h2>${p.name.replaceAll("&","&amp;")}</h2>`);assert.ok(next>position,p.name);position=next;}
 for(const text of ["Drafts","Sent","In review","Approved","0 submittals"])assert.ok(html.includes(text),text);
 assert.match(renderToStaticMarkup(<SubmittalTradeTiles packages={[]} submittals={[]} onOpen={()=>{}}/>),/No trade packages yet/);
});

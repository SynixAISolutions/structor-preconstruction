import assert from 'node:assert/strict';import {test} from 'node:test';import {renderToStaticMarkup} from 'react-dom/server';
import {AssetLink,AssetUpload} from './contract-files';
test('private document links use the protected app route, with accessible upload labels',()=>{const html=renderToStaticMarkup(<><AssetLink asset={{id:'11111111-1111-4111-8111-111111111111',name:'Insurance.pdf',type:'application/pdf',size:200}}/><AssetUpload label="Upload Exhibit C" onSave={()=>{}}/></>);assert.match(html,/\/api\/document-assets\?id=/);assert.match(html,/Insurance.pdf/);assert.match(html,/Upload Exhibit C/);assert.match(html,/accept="application\/pdf"/);});

import { groupedContractScope, contractScopeDraft } from "./contract-files";
import { sampleAwards } from "../../lib/data/sample-award";
test("scope draft groups General first and preserves system order and per-line text",()=>{
 const result=groupedContractScope([{id:"a",group:"Gypsum Board",text:"Board"},{id:"b",group:"General",text:"Cleanup"},{id:"c",group:"Ceilings",text:"Tiles"},{id:"d",group:"Gypsum Board",text:"Finish"}]);
 assert.deepEqual(result,{lines:["General","Cleanup","Gypsum Board","Board","Finish","Ceilings","Tiles"],headings:[0,2,5]});
});
test("replacing scope preserves the mapped document table and other sections",()=>{
 const award=structuredClone(sampleAwards.awards[0]);
 award.snapshot.documents=[{section:"Drawings",description:"Drawing set",date:"2026-01-01"}];
 const template=award.exhibit.revisions.at(-1)!.template;
 const block=template.layout?.blocks.find(b=>b.kind==="scope");
 if(block&&block.kind==="scope")block.documents=["Drawing set"];
 const draft=contractScopeDraft(award,["General","Provide reviewed scope."]);
 assert.ok(draft.content.sections[draft.index].lines.includes("General"));
 if(block)assert.ok(draft.content.sections[draft.index].lines.some(l=>l.includes("Drawing set")));
});

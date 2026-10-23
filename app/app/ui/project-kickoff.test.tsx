import assert from "node:assert/strict";
import {test} from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {sampleProjectRecords} from "../../lib/projects";
import {ProjectForm,ProjectInformation} from "./project-record";
test("Kickoff exposes every form field and shows saved project requirements",()=>{
 const project=sampleProjectRecords[0];
 const form=renderToStaticMarkup(<ProjectForm project={project} onSave={()=>{}} onCancel={()=>{}}/>);
 for(const name of ["scopesDue","rfiResponses","drawingFlip","demolitionStart","jobWalk","minBidders","wageScale"])assert.ok(form.includes(`name="${name}"`),name);
 assert.match(form,/>Kickoff</);assert.match(form,/min="1" max="10"/);
 const html=renderToStaticMarkup(<ProjectInformation project={project} cover={null} onSave={()=>{}} navigate={()=>{}}/>);
 for(const name of ["Kickoff","Scopes to subcontractors","RFI responses","Drawing Flip","Job walk","Minimum bidders per trade","Wage scale"])assert.ok(html.includes(name),name);
 assert.match(html,/N\/A unless requested by your subcontractors/);assert.match(form,/type="text"[^>]*name="jobWalk" value="N\/A unless requested/);
});

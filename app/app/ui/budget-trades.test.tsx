import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProjectRecords } from "../../lib/projects";
require.extensions[".css"] = () => {};
const { BudgetView } = require("./budget-ui") as typeof import("./budget-ui");
test("all cost centers render one misc metals trade and accessible expand action",()=>{
 const html=renderToStaticMarkup(<BudgetView project={sampleProjectRecords[0]} projectName="Jelleff" notify={()=>{}} navigate={()=>{}}/>);
 assert.equal((html.match(/<strong>Miscellaneous metals<\/strong>/gi)||[]).length,1);
 assert.match(html,/aria-expanded="false"/);assert.match(html,/2 cost centers/);assert.match(html,/Pull lowest sub/);
 assert.doesNotMatch(html,/From takeoff estimate/);
});

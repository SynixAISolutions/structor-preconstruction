import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-resolver.mjs", import.meta.url);
const { saveBudgetVersion, compareBudgetVersions, budgetTrend } = await import("../lib/budget-versions.ts");
const { queueScopeEstimate, priceScopeDraft, scopeDraftBlocker } = await import("../lib/scope-estimate.ts");
const { approveGapCost, gapCostAmount } = await import("../lib/bid-gap-cost.ts");
const { projectOverview } = await import("../lib/project-overview.ts");
const { addBudgetLine, addAllowance, editBudgetLine, budgetTotals } = await import("../lib/budget.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleSubmissions } = await import("../lib/data/sample-award.ts");
const { sampleStructorCheck } = await import("../lib/data/rfi.ts");
const { draftStorageKey } = await import("../lib/project-scope.ts");
const at = "2026-10-15T12:00:00Z";
let budget = { lines: [], allowances: [], costCenters: [] };
budget = addBudgetLine(budget, { description:"Illustrative test wall",costCenter:"Building",classification:"direct",csiCode:"09",budget:100.11 },"Test",at);
budget = addBudgetLine(budget, { description:"Owner-carried test cost",costCenter:"Building",classification:"direct",budget:999,byOwner:true },"Test",at);
budget = addAllowance(budget,{name:"Test linked allowance",amount:10,costCenter:"Building",status:"included",budgetLineId:budget.lines[0].id},at);
budget = addAllowance(budget,{name:"Test additional allowance",amount:20,costCenter:"Building",status:"included"},at);
const input = { projectId:"sample-test",name:"Concept baseline",stage:"concept",reason:"Illustrative baseline",by:"Test",at };
const original = JSON.stringify(budget);
let versions = saveBudgetVersion([],budget,input);
const later = editBudgetLine(budget,budget.lines[0].id,{budget:150.12},"Test",at);
versions = saveBudgetVersion(versions,later,{...input,name:"DD review",stage:"dd",reason:"Test wall scope increased"});
assert.equal(JSON.stringify(budget),original);
assert.equal(versions[0].budget.lines[0].budget,100.11);
budget.lines[0].budget=666;
assert.equal(versions[0].budget.lines[0].budget,100.11,"Versions retain a deep copy");
const compared=compareBudgetVersions(versions[0],versions[1]);
assert.equal(compared.beforeTotal,120.11); assert.equal(compared.afterTotal,170.12); assert.equal(compared.delta,50.01);
assert.equal(compared.rows.reduce((s,r)=>s+Math.round(r.delta*100),0),5001,"All row movements reconcile, without double-counting allowances or owner costs");
// Budget trends (Marcel's features list, item 15): every version in order, what moved it, and the VE accepted in between.
{
  const gmp = editBudgetLine(later, later.lines[0].id, { budget: 120.12 }, "Test", at);
  const three = saveBudgetVersion(versions, gmp, { ...input, name: "GMP", stage: "gmp", reason: "VE: lighter wall", at: "2026-11-15T12:00:00Z" }).map((v, i) => i === 0 ? { ...v, at: "2026-10-01T12:00:00Z" } : v);
  const ve = [
    { number: "VE-001", description: "Lighter wall", decision: { outcome: "accepted", at: "2026-11-01T00:00:00Z", acceptedImpact: 30 } },
    { number: "VE-002", description: "Rejected one", decision: { outcome: "rejected", at: "2026-11-02T00:00:00Z", acceptedImpact: null } },
    { number: "VE-003", description: "Before the first", decision: { outcome: "accepted", at: "2026-09-01T00:00:00Z", acceptedImpact: 5 } },
  ];
  const trend = budgetTrend(three, ve);
  assert.deepEqual(trend.map(s => [s.name, s.stage, s.total, s.delta]), [["Concept baseline", "Concept", 120.11, null], ["DD review", "Design development", 170.12, 50.01], ["GMP", "Guaranteed maximum price (GMP)", 140.12, -30]], "Oldest first, each move against the one before");
  assert.deepEqual(trend[2].drivers.map(d => [d.description, d.delta]), [["Illustrative test wall", -30]], "The line that moved it");
  assert.deepEqual([trend[1].ve, trend[2].ve], [[], [{ number: "VE-001", description: "Lighter wall", impact: 30 }]], "Only VE accepted between the two versions; rejected and earlier ones are left out");
  assert.equal(trend[2].reason, "VE: lighter wall");
  const withNow = budgetTrend(three, [], { budget: editBudgetLine(gmp, gmp.lines[0].id, { budget: 110 }, "Test", at), at: "2026-11-17T12:00:00Z" });
  assert.deepEqual([withNow.length, withNow.at(-1).name, withNow.at(-1).delta], [4, "Working budget", -10.12], "Today's working budget ends the story when it differs from the last version");
  assert.equal(budgetTrend(three, [], { budget: three[2].budget, at: "2026-11-17T12:00:00Z" }).length, 3, "An unchanged working budget adds nothing");
  assert.deepEqual(budgetTrend([], [], { budget: gmp, at }), [], "No versions, no story");
}

assert.equal(compared.afterTotal,budgetTotals(later).totalBudget);
assert.throws(()=>saveBudgetVersion([],later,{...input,reason:""}),/explanation/);
assert.throws(()=>saveBudgetVersion([],later,{...input,stage:"wrong"}),/stage/);
assert.throws(()=>saveBudgetVersion([],{lines:[],allowances:[],costCenters:[]},input),/budget lines/);
assert.throws(()=>compareBudgetVersions(versions[0],{...versions[1],projectId:"different"}),/same project/);
assert.notEqual(draftStorageKey("sample-test","budget-versions"),draftStorageKey("different","budget-versions"));
const removed = {...later,lines:later.lines.slice(1),allowances:later.allowances.filter(a=>a.budgetLineId!==later.lines[0].id)};
const third=saveBudgetVersion(versions,removed,{...input,name:"Removed line",reason:"Scope removed"}).at(-1);
assert.ok(compareBudgetVersions(versions[1],third).rows.some(r=>r.change==="Removed"));

const proc=structuredClone(sampleProcurement);
const scope=proc.scopes.find(s=>s.packageId==="drywall" && s.status==="approved");
assert.ok(scope);
let drafts=queueScopeEstimate([],proc,"drywall",scope.id,"Test");
assert.equal(drafts[0].title,scope.title); assert.equal("quantity" in drafts[0],false,"No fabricated quantity in a scope draft");
assert.throws(()=>queueScopeEstimate(drafts,proc,"drywall",scope.id,"Test"),/already/);
assert.throws(()=>queueScopeEstimate([],{...proc,scopes:proc.scopes.map(s=>s.id===scope.id?{...s,status:"draft"}:s)},"drywall",scope.id,"Test"),/Approve/);
assert.match(scopeDraftBlocker(drafts[0],{...proc,scopes:proc.scopes.map(s=>s.id===scope.id?{...s,title:"Revised"}:s)}),/changed/);
const values={packageId:"drywall",item:"Ignored replacement title",unit:"SF",quantity:12.5,rate:2.75,source:"Ignored replacement source"};
const priced=priceScopeDraft([],proc,drafts[0],values);
assert.equal(priced[0].item,scope.title); assert.equal(priced[0].source,scope.source); assert.equal(priced[0].reviewed,false);
assert.equal(priced[0].origin.scopeId,scope.id);
assert.throws(()=>priceScopeDraft(priced,proc,drafts[0],values),/already/);
assert.throws(()=>priceScopeDraft([],proc,drafts[0],{...values,quantity:0}),/quantity/);
assert.throws(()=>priceScopeDraft([],proc,drafts[0],{...values,quantity:1e308}),/too large/);
assert.throws(()=>priceScopeDraft([],proc,drafts[0],{...values,packageId:"concrete"}),/assigned trade/);

const response={status:"P",note:"Install only",adjustment:99,resolved:true,adjustmentApproved:false};
const basis={quantity:12.5,rate:2.75,unit:"SF",source:"Illustrative test rate"};
assert.equal(gapCostAmount(basis),34.38);
assert.throws(()=>approveGapCost(response,basis,false),/Review/);
assert.throws(()=>approveGapCost({...response,status:"Y"},basis,true),/excluded or partial/);
assert.throws(()=>gapCostAmount({...basis,quantity:NaN}),/quantity/);
assert.throws(()=>gapCostAmount({...basis,rate:-1}),/rate/);
assert.throws(()=>gapCostAmount({...basis,source:""}),/basis/);
const applied=approveGapCost(response,basis,true);
assert.equal(applied.adjustment,34.38); assert.equal(applied.adjustmentApproved,true); assert.equal(applied.resolved,false);
assert.equal(response.adjustment,99,"The original response is not mutated");
assert.match(applied.note,/Illustrative test rate/);
assert.equal(approveGapCost(applied,basis,true).note.match(/Cost basis:/g).length,1,"Reapplying replaces the basis rather than duplicating it");

const dashboard=projectOverview(proc,sampleSubmissions,sampleStructorCheck,"jelleff");
assert.equal(dashboard.scopeCount,proc.scopes.length);
assert.equal(dashboard.bidCount,sampleSubmissions.filter(s=>s.projectId==="jelleff" && s.revisions.length).length);
assert.equal(projectOverview(proc,sampleSubmissions,sampleStructorCheck,"another").bidCount,0);
const empty=projectOverview({packages:[],scopes:[],invitations:[],outreach:[],notifications:[]},[],{issues:[],rfis:[],notifications:[],lastIssueNumber:0,lastRfiNumber:0},"empty");
assert.equal(empty.scopeCount+empty.bidCount+empty.issueCount+empty.published,0); assert.deepEqual(empty.activity,[]);
console.log("Workflow feature checks passed: retained budget versions, scope drafts, reviewed gap costs and derived dashboard.");

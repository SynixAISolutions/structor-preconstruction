import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { deriveTodo, missingProjectFacts, TODO_GROUPS } = await import("../lib/todo.ts");
const P = await import("../lib/procurement.ts");
const S = await import("../lib/submissions.ts");
const A = await import("../lib/award.ts");
const { levelingCandidates } = await import("../lib/budget.ts");
const { buildLevelingImport } = await import("../lib/leveling-import.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleSubmissions, sampleAwards } = await import("../lib/data/sample-award.ts");
const { ruleFixtureBudget } = await import("./fixtures/budget-rules.mjs");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { sampleFiles } = await import("../lib/data/preconstruction.ts");
const { sampleProjectRecords, parseProjectForm } = await import("../lib/projects.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-30T12:00:00.000Z";
const ids = (summary) => summary.tasks.map(t => t.id);
const task = (summary, id) => summary.tasks.find(t => t.id === id);
const has = (summary, id) => ids(summary).includes(id);
const milestones = (summary, pkg) => summary.packages.find(p => p.packageId === pkg).milestones.filter(m => m.done).map(m => m.key);
const noAwards = freeze({ awards: [], notifications: [] });
const base = freeze({ project: sampleProjectRecords[0], documents: sampleFiles, procurement: structuredClone(sampleProcurement), submissions: structuredClone(sampleSubmissions), leveling: null, budget: structuredClone(ruleFixtureBudget), awards: structuredClone(sampleAwards) });
const derive = (patch = {}) => deriveTodo({ ...base, ...patch });

// An empty project: only setup and budget work, nothing invented.
const newProject = parseProjectForm((() => { const f = new FormData(); for (const [k, v] of Object.entries({ name: "New job", location: "DC", type: "Civic", workType: "new", squareFeet: "1000", taxStatus: "taxable", estimateStage: "concept" })) f.append(k, v); return f; })()).project;
assert(newProject, "The setup fixture must be a valid project");
assert(missingProjectFacts({ ...newProject, estimateStage: null }).includes("estimate stage"));
const empty = deriveTodo({ project: newProject, documents: [], procurement: { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] }, submissions: [], leveling: null, budget: { lines: [], allowances: [] }, awards: noAwards });
assert.deepEqual(ids(empty).sort(), ["budget:empty", "setup:facts", "setup:files", "setup:packages"]);
assert.equal(task(empty, "setup:facts").detail, "Missing: bid due date.");
assert.deepEqual([empty.packages.length, empty.progress], [0, { done: 1, total: 4, percent: 25 }], "Only 'allowances decided' is true on an empty project");
assert.deepEqual(missingProjectFacts(null), ["project"]);

// Jelleff as sampled: Concrete and Drywall carried through to executed subcontracts; drafts in the other trades; budget partly approved.
const start = derive();
assert.equal(ids(start).filter(id => id.startsWith("scopes:approve:")).length, 7, "Every package with draft items, excluding Carpentry and the four published sample trades");
for (const trade of ["concrete", "drywall"]) assert.deepEqual([start.packages.find(p => p.packageId === trade).percent, ids(start).filter(id => id.endsWith(`:${trade}`))], [100, []], `${trade}: every milestone done, nothing left to do`);
assert(has(start, "scopes:empty:carpentry") && !ids(start).some(id => id.startsWith("scopes:publish") || id.startsWith("outreach:")));
assert.deepEqual(task(start, "scopes:approve:demolition").count, 2);
assert.deepEqual([task(start, "budget:approve").count, task(start, "budget:over").count, task(start, "budget:allowances").count, has(start, "budget:forecast")], [11, 2, 2, false]);
assert.match(task(start, "budget:over").detail, /Structural steel \(Modernization\), Exterior improvements \(Site work\)/);
assert(has(start, "setup:facts") && !has(start, "setup:files"), "Sample files exist; work type and tax status are not recorded");
assert.deepEqual(milestones(start, "demolition"), ["bidders-invited"]);
assert.equal(start.tasks.at(-1).status, "todo");

// Approve Demolition → it becomes "publish"; publish → outreach.
let proc = P.bidForm(base.procurement, "demolition").reduce((s, i) => P.approveScope(s, i.id, "Safi", at), base.procurement);
let t = derive({ procurement: proc });
assert(!has(t, "scopes:approve:demolition") && task(t, "scopes:publish:demolition").priority === "high");
proc = P.publishPackage(proc, "demolition", "Safi", at);
t = derive({ procurement: proc });
assert(!has(t, "scopes:publish:demolition"));
assert.deepEqual([task(t, "outreach:waiting:demolition").status, task(t, "outreach:waiting:demolition").count, has(t, "outreach:follow-up:demolition")], ["waiting", 1, false], "Capital Demolition already has a call logged");
proc = freeze(P.inviteBidder(proc, "demolition", "b6", "Safi", at));
t = derive({ procurement: proc });
assert.deepEqual([task(t, "outreach:follow-up:demolition").count, task(t, "outreach:waiting:demolition").count], [1, 2], "Greenline has no outreach logged");
assert.deepEqual(milestones(t, "demolition"), ["scope-approved", "bid-form-published", "bidders-invited"]);

// Bids submitted → load into leveling; loaded → exceptions + an awardable bid.
const form = P.bidForm(proc, "demolition");
const inv = (b) => proc.invitations.find(i => i.packageId === "demolition" && i.bidderId === b).id;
let subs = ["b1", "b6"].reduce((acc, b) => S.openSubmission(acc, proc, { projectId: "jelleff", invitationId: inv(b) }, at), []);
const sid = (b) => subs.find(x => x.bidderId === b).id;
subs = form.reduce((acc, i, n) => S.setResponse(S.setResponse(acc, sid("b1"), i.id, "Y", "", at), sid("b6"), i.id, n === 1 ? "N" : "Y", "", at), subs);
subs = S.updateDraft(S.updateDraft(subs, sid("b1"), { baseBid: 498000 }, at), sid("b6"), { baseBid: 450000 }, at);
subs = freeze(["b1", "b6"].reduce((acc, b) => S.submitBid(acc, proc, sid(b), { name: "Estimator", email: "bids@example.com" }, at), subs));
t = derive({ procurement: proc, submissions: subs });
assert.deepEqual([task(t, "leveling:load:demolition").count, has(t, "outreach:waiting:demolition"), has(t, "award:select:demolition")], [2, false, false]);
const imported = buildLevelingImport({ projectId: "jelleff", projectName: "Jelleff", packageId: "demolition", procurement: proc, submissions: subs, directory: initialBidders });
const leveling = freeze({ packageId: "demolition", items: imported.items, bidders: imported.bidders, provenance: imported.provenance });
t = derive({ procurement: proc, submissions: subs, leveling });
assert.deepEqual([has(t, "leveling:load:demolition"), task(t, "leveling:exceptions:demolition").count, has(t, "award:select:demolition")], [false, 1, true]);
assert(milestones(t, "demolition").includes("bids-leveled") && milestones(t, "demolition").includes("bids-received"));
assert.equal(derive({ procurement: proc, submissions: subs, leveling: { ...leveling, packageId: "concrete" } }).tasks.find(x => x.id === "leveling:load:demolition").count, 2, "Leveling loaded for another package does not count");

// A revised form makes the submitted bids stale.
const withItem = P.addScope(proc, { packageId: "demolition", title: "Remove the ceiling grid." }, "Safi", at);
const revised = P.publishPackage(P.bidForm(withItem, "demolition").reduce((acc, i) => P.approveScope(acc, i.id, "Safi", at), withItem), "demolition", "Safi", at);
assert.equal(task(derive({ procurement: revised, submissions: subs }), "leveling:stale:demolition").count, 2);

// Award → Exhibit A → subcontract: exactly one next step at each stage.
const candidates = levelingCandidates({ packageId: "demolition", items: imported.items, bidders: imported.bidders, provenance: imported.provenance });
let aw = A.createAward(base.awards, { projectId: "jelleff", projectName: "Jelleff", procurement: proc, submissions: subs, candidates, budget: base.budget, directory: initialBidders }, { levelingBidderId: candidates[0].levelingBidderId, basis: "reviewed" }, "Safi", at);
const id = aw.awards.at(-1).id; // after the sample's executed concrete and drywall awards
const stageTask = (awards) => { const s = derive({ procurement: proc, submissions: subs, leveling, awards }); return s.tasks.filter(x => x.group === "award").map(x => [x.id, x.status]); };
const expectStep = (awards, id2, status) => assert.deepEqual(stageTask(awards), [[`award:${id2}:demolition`, status]], id2);
t = derive({ procurement: proc, submissions: subs, leveling, awards: aw });
assert(!has(t, "award:select:demolition") && !has(t, "leveling:exceptions:demolition"), "Once awarded, leveling work for the trade is finished");
expectStep(aw, "exhibit-draft", "todo");
aw = A.shareExhibit(aw, id, at); expectStep(aw, "exhibit-shared", "waiting");
aw = A.requestExhibitChanges(aw, id, { author: "Michael", text: "Slab by others." }, at); expectStep(aw, "exhibit-changes-requested", "todo");
assert.match(derive({ procurement: proc, submissions: subs, leveling, awards: aw }).tasks.find(x => x.group === "award").detail, /1 comment unresolved/);
aw = A.setCommentResolved(A.shareExhibit(aw, id, at), id, aw.awards.at(-1).exhibit.comments[0].id, true, "Safi", at);
aw = A.agreeExhibit(aw, id, "Michael", "subcontractor", at); expectStep(aw, "exhibit-agreed", "todo");
aw = A.generateSubcontract(aw, id, "Contractor LLC", "Safi", at); expectStep(aw, "subcontract-draft", "todo");
aw = A.sendSubcontract(aw, id, at); expectStep(aw, "signature-pending", "waiting");
aw = A.signSubcontract(aw, id, "subcontractor", { name: "Michael", title: "", email: "m@example.com" }, at); expectStep(aw, "subcontractor-signed", "todo");
aw = A.signSubcontract(aw, id, "contractor", { name: "Marcel", title: "", email: "k@example.com" }, at); expectStep(aw, "countersigned", "todo");
aw = freeze(A.executeSubcontract(aw, id, at));
const finished = derive({ procurement: proc, submissions: subs, leveling, awards: aw });
assert.deepEqual([stageTask(aw), finished.packages.find(p => p.packageId === "demolition").percent], [[], 100], "Executed: nothing left, Demolition 100%");
assert(finished.progress.done > start.progress.done && finished.progress.total === start.progress.total);

// Budget: approving and fixing forecasts clears those tasks; by-owner lines are ignored.
const approved = { ...base.budget, lines: base.budget.lines.map(l => ({ ...l, status: "approved", forecast: Math.min(l.forecast ?? l.budget, l.budget) })), allowances: base.budget.allowances.map(a => ({ ...a, status: "included" })) };
// This budget has none of the sample awards' lines, so each award becomes a task to place it (lib/commitments).
const unplacedAwards = derive({ budget: approved });
assert.deepEqual(ids(unplacedAwards).filter(x => x.startsWith("budget:")), ["budget:awards"], "Awards the budget can't place are budget work");
assert.equal(task(unplacedAwards, "budget:awards").count, 2);
assert.match(task(unplacedAwards, "budget:awards").detail, /District Concrete \(Concrete\): Its budget line no longer exists/);
const bt = derive({ budget: approved, awards: noAwards });
assert(!ids(bt).some(x => x.startsWith("budget:")), "No budget work left");
assert.deepEqual(bt.project.filter(m => m.done).map(m => m.key), ["project-files", "budget-approved", "allowances-decided"]);
assert.equal(task(derive({ budget: { ...approved, lines: [...approved.lines, { ...approved.lines[0], id: "own", status: "draft", byOwner: true }] } }), "budget:approve"), undefined, "A by-owner line is not the team's to approve");

// Ordering and group counts.
const order = finished.tasks.map(x => [x.status, x.priority]);
const rank = ([s, p]) => (s === "todo" ? 0 : 3) + { high: 0, normal: 1, low: 2 }[p];
assert(order.every((x, i) => i === 0 || rank(order[i - 1]) <= rank(x)), "Team actions first, then by priority");
assert.deepEqual(start.groups.map(g => g.group), TODO_GROUPS.map(g => g.group));
assert.equal(start.groups.reduce((n, g) => n + g.todo + g.waiting, 0), start.tasks.length);

// Schedule: late, not-started-on-time and next-3-week activities become tasks; finished ones don't.
const Sch = await import("../lib/schedule.ts");
const { sampleSchedule } = await import("../lib/data/schedule.ts");
const withSchedule = deriveTodo({ ...base, schedule: { rows: Sch.scheduleRows(sampleSchedule, "2026-10-16"), today: "2026-10-16" } });
const sched = withSchedule.tasks.filter(task => task.group === "schedule");
assert.deepEqual(sched.map(task => task.id.split(":")[1] + " " + task.title.split(" ")[0] + task.title.split(" ")[1]).sort(), ["late A1000Design", "late A1010Scope", "soon A1040GMP", "soon A1050Award", "soon A1060Long-lead", "start StartA1030"].sort());
assert.ok(sched.filter(task => task.id.startsWith("schedule:late") || task.id.startsWith("schedule:start")).every(task => task.priority === "high" && task.screen === "schedule"));
assert.equal(withSchedule.groups.find(g => g.group === "schedule").todo, sched.length);
assert.equal(withSchedule.tasks.length, start.tasks.length + sched.length, "Schedule tasks add to, never replace, the workflow tasks");
assert.ok(!sched.some(task => task.title.includes("A1020")), "A finished milestone is not a task");

// Project setup warnings: red when missing, yellow when information needs checking; they replace the basic setup tasks.
const T = await import("../lib/todo.ts");
const setupStep = (o) => ({ title: o.id, detail: o.detail ?? "", level: o.level ?? "recommended", route: false, status: o.status ?? "missing", screen: o.screen ?? "documents", items: o.items ?? [], decision: o.decision ?? null, reconsider: o.reconsider ?? false, ...o });
const setupItem = (o) => ({ label: o.id, level: "recommended", status: "missing", note: "", why: "", category: "", decision: null, reconsider: false, ...o });
const setup = { progress: { done: 0, total: 5, percent: 0 }, next: null, steps: [
  setupStep({ id: "documents", level: "required", items: [setupItem({ id: "drawings", label: "Drawing set", level: "required", status: "needs-review", note: "Sheet numbers were read on 2 of 40 pages.", category: "Drawings" }), setupItem({ id: "manual", label: "Project manual", status: "ready", category: "Specifications" })] }),
  setupStep({ id: "details", level: "required", screen: "information", items: [setupItem({ id: "facts", label: "Project information", level: "required", note: "Missing: tax status." }), setupItem({ id: "rfp", label: "RFP", category: "RFP", why: "Due dates come from it." })] }),
  setupStep({ id: "trades", level: "required", status: "needs-review", detail: "Confirm the 4 suggested trades.", screen: "scopes" }),
  setupStep({ id: "scopes", status: "missing", screen: "scopes" }), setupStep({ id: "budget", status: "missing", screen: "budget" }),
  setupStep({ id: "reports", items: [setupItem({ id: "hazmat", label: "Hazardous materials survey", category: "Reports", reconsider: true, status: "missing", decision: { reason: "None found in 2019" } }), setupItem({ id: "geotech", label: "Geotechnical report", category: "Reports", status: "waiting", decision: { responsible: "DGS", reason: "Owner is commissioning it", followUp: "2026-11-01" } })] }),
] };
const withSetup = deriveTodo({ ...base, setup });
const setupTasks = withSetup.tasks.filter(task => task.group === "setup");
assert.deepEqual(setupTasks.map(task => [task.id, task.flag.tone, task.flag.label, task.status]).sort(), [
  ["setup:details:facts", "red", "Missing", "todo"], ["setup:details:rfp", "red", "Missing file", "todo"],
  ["setup:documents:drawings", "yellow", "Check information", "todo"], ["setup:reports:geotech", "red", "Missing file", "waiting"],
  ["setup:reports:hazmat", "yellow", "Check information", "todo"], ["setup:trades", "yellow", "Check information", "todo"],
].sort());
assert.equal(setupTasks.find(task => task.id === "setup:documents:drawings").title, "Drawing set needs checking");
assert.equal(setupTasks.find(task => task.id === "setup:details:rfp").title, "RFP not uploaded");
assert.equal(setupTasks.find(task => task.id === "setup:details:rfp").detail, "Due dates come from it.", "Without a note the task says why");
assert.match(setupTasks.find(task => task.id === "setup:reports:geotech").detail, /DGS: Owner is commissioning it. Follow up 2026-11-01/);
assert.match(setupTasks.find(task => task.id === "setup:reports:hazmat").title, /Reconsider/);
assert.equal(setupTasks.find(task => task.id === "setup:details:facts").priority, "high", "Required items are high priority");
assert.ok(!withSetup.tasks.some(task => task.id === "setup:facts" || task.id === "setup:files"), "The guide replaces the basic setup tasks");
assert.ok(!setupTasks.some(task => task.id.startsWith("setup:scopes") || task.id.startsWith("setup:budget") || task.id === "setup:documents:manual"), "Ready items and steps covered elsewhere make no task");

// Done: tasks that disappear between checks move to done; nothing changes when nothing did.
const t1 = withSetup.tasks, at1 = "2026-10-18T10:00:00.000Z", at2 = "2026-10-18T11:00:00.000Z";
const first = T.reconcileTodo(T.EMPTY_TODO_HISTORY, t1, at1);
assert.equal(first.completed.length, 0);
assert.equal(Object.keys(first.history.open).length, t1.length);
assert.equal(T.reconcileTodo(first.history, t1, at2).history, first.history, "Same tasks, same history object");
const t2 = t1.filter(task => task.id !== "setup:details:rfp");
const second = T.reconcileTodo(first.history, t2, at2);
assert.deepEqual(second.completed.map(d => [d.id, d.title, d.at]), [["setup:details:rfp", "RFP not uploaded", at2]]);
assert.equal(second.history.done[0].id, "setup:details:rfp");
const reopened = T.reconcileTodo(second.history, t1, at2);
assert.equal(reopened.history.done.some(d => d.id === "setup:details:rfp"), false, "A task that comes back is open again, not done");

console.log(`To-do checked: empty project, ${start.tasks.length} tasks on the Jelleff sample, Demolition walked from draft to executed subcontract (${finished.packages.find(p => p.packageId === "demolition").percent}%), stale forms, budget, ordering.`);

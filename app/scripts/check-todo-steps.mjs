import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { TODO_GROUPS } = await import("../lib/todo.ts");
const { firstOpenStep, todoSteps } = await import("../lib/todo-steps.ts");

// Progress per step of the Preconstruction to-do (Marcel, 24 Oct: "files uploaded 90%, scopes approved 0%").
const pkg = (packageId, done) => ({ packageId, name: packageId, code: "00", owner: "", done: 0, total: 8, percent: 0,
  milestones: ["scope-approved", "bid-form-published", "bidders-invited", "bids-received", "bids-leveled", "awarded", "exhibit-agreed", "subcontract-executed"].map(key => ({ key, label: key, done: done.includes(key) })) });
const task = (id, group, status = "todo") => ({ id, group, title: id, detail: "", status, priority: "normal", screen: "scopes", packageId: null });
const summary = (o = {}) => {
  const tasks = o.tasks ?? [];
  return {
    tasks, packages: o.packages ?? [], progress: { done: 0, total: 0, percent: 0 },
    project: o.project ?? [{ key: "project-facts", label: "Project information complete", done: true }, { key: "project-files", label: "Project files uploaded", done: false }, { key: "budget-approved", label: "Budget approved", done: true }, { key: "allowances-decided", label: "Allowances decided", done: false }],
    groups: TODO_GROUPS.map(g => ({ ...g, todo: tasks.filter(t => t.group === g.group && t.status === "todo").length, waiting: tasks.filter(t => t.group === g.group && t.status === "waiting").length })),
  };
};
const setup = { completeness: { done: 9, total: 10, percent: 90, missing: 1, review: 0, waiting: 0 } };
const by = (steps, group) => steps.find(s => s.group === group);

// Every to-do step, in the to-do's order, each with its own tasks.
const two = summary({ packages: [pkg("demolition", ["scope-approved", "bid-form-published", "bidders-invited"]), pkg("drywall", [])], tasks: [task("a", "scopes"), task("b", "outreach", "waiting"), task("c", "setup")] });
const steps = todoSteps(two, setup);
assert.deepEqual(steps.map(s => s.group), TODO_GROUPS.map(g => g.group));
assert.deepEqual(by(steps, "scopes").tasks.map(t => t.id), ["a"]);

// Step 1 is the setup guide's completeness; trade steps count their milestones over every trade.
assert.deepEqual([by(steps, "setup").percent, by(steps, "setup").measure], [90, "9 of 10 items in place · 1 missing"]);
assert.deepEqual([by(steps, "scopes").percent, by(steps, "scopes").measure], [50, "1 of 2 trades approved · 1 published"]);
assert.deepEqual([by(steps, "outreach").percent, by(steps, "outreach").measure], [25, "1 of 2 trades invited · 0 with bids in"]);
assert.deepEqual([by(steps, "award").percent, by(steps, "award").measure], [0, "0 of 2 trades with Exhibit A agreed · 0 executed"]);
assert.deepEqual([by(steps, "budget").percent, by(steps, "budget").measure], [50, "Budget approved · Allowances decided: not yet"]);
assert.deepEqual([by(steps, "outreach").todo, by(steps, "outreach").waiting], [0, 1]);

// Nothing to measure is not 0%: no trades yet, RFIs and the schedule have no total.
const none = todoSteps(summary(), null);
assert.deepEqual([by(none, "scopes").percent, by(none, "scopes").measure], [null, "No trades yet"]);
assert.deepEqual([by(none, "rfis").percent, by(none, "rfis").measure], [null, "Nothing open"]);
assert.deepEqual([by(none, "setup").percent, by(none, "setup").measure], [50, "Project information complete: yes · Project files uploaded: no"], "Without the setup guide, the two project milestones");
assert.equal(by(todoSteps(summary({ tasks: [task("r", "rfis"), task("w", "rfis", "waiting")] }), null), "rfis").measure, "1 action · 1 waiting");

// The step that opens first: the earliest with team actions, else the earliest with anything open.
assert.equal(firstOpenStep(steps), "setup");
assert.equal(firstOpenStep(todoSteps(summary({ tasks: [task("w", "outreach", "waiting"), task("l", "leveling")] }), null)), "leveling");
assert.equal(firstOpenStep(todoSteps(summary({ tasks: [task("w", "outreach", "waiting")] }), null)), "outreach");
assert.equal(firstOpenStep(none), null);

console.log("To-do steps checked: every step in order, setup completeness, trade milestones per step, budget, nothing-to-measure steps, and which step opens first.");

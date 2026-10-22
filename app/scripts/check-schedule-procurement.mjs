import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const S = await import("../lib/schedule.ts");
const { procurementSchedule, addProcurementActivities, packagesWithoutBuyout } = await import("../lib/schedule-procurement.ts");
const { deriveTodo } = await import("../lib/todo.ts");
const { sampleSchedule } = await import("../lib/data/schedule.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleAwards } = await import("../lib/data/sample-award.ts");
const D = await import("../lib/assistant-data.ts");
const A = await import("../lib/assistant-actions.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-08T12:00:00.000Z", today = "2026-10-08", by = "Marcel";

// ── A small project: three trades ──
const pkg = (id, name, due) => ({ id, name, division: "00", code: "00 00 00", owner: `${name} lead`, due });
const invite = (id, packageId, status, invitedAt) => ({ id, packageId, bidderId: id, status, invitedAt: `${invitedAt}T09:00:00.000Z`, by });
const procurement = freeze({ ...structuredClone(sampleProcurement), packages: [pkg("conc", "Concrete", "2026-10-06"), pkg("roof", "Roofing", "2026-10-10"), pkg("door", "Doors", "")], invitations: [
  invite("c1", "conc", "submitted", "2026-09-15"), invite("c2", "conc", "submitted", "2026-09-14"), invite("c3", "conc", "declined", "2026-09-14"),
  invite("r1", "roof", "submitted", "2026-09-20"), invite("r2", "roof", "invited", "2026-09-22"), invite("r3", "roof", "bidding", "2026-09-22"),
] });
const noAwards = freeze({ awards: [], notifications: [] });

// One click: a buyout activity per trade through bidding and award, and a bids-due milestone inside it.
assert.equal(packagesWithoutBuyout(S.EMPTY_SCHEDULE, procurement).length, 3);
const added = freeze(addProcurementActivities(S.EMPTY_SCHEDULE, procurement, today, by, at));
const act = (state, name) => state.activities.find(a => a.name === name);
assert.deepEqual(added.activities.map(a => [a.code, a.name, a.phase, a.owner, a.packageId, a.procurement, a.start, a.duration]), [
  ["A1010", "Buyout · Concrete", "Procurement", "Concrete lead", "conc", "buyout", "2026-09-14", S.workdaysBetween("2026-09-14", "2026-10-06") + 1 + S.BUYOUT_DAYS],
  ["A1020", "Bids due · Concrete", "Procurement", "Concrete lead", "conc", "bids-due", "2026-10-06", 0],
  ["A1030", "Buyout · Roofing", "Procurement", "Roofing lead", "roof", "buyout", "2026-09-21", S.workdaysBetween("2026-09-21", "2026-10-12") + 1 + S.BUYOUT_DAYS],
  ["A1040", "Bids due · Roofing", "Procurement", "Roofing lead", "roof", "bids-due", "2026-10-12", 0],
  ["A1050", "Buyout · Doors", "Procurement", "Doors lead", "door", "buyout", "2026-10-08", S.BIDDING_DAYS + 1 + S.BUYOUT_DAYS],
  ["A1060", "Bids due · Doors", "Procurement", "Doors lead", "door", "bids-due", S.addWorkdays(today, S.BIDDING_DAYS), 0],
], "Buyout from the first invitation (a Sunday counts as Monday), bids due on the package date (a Saturday counts as Monday); no due date: two weeks out");
assert.equal(S.finishOf(act(added, "Buyout · Concrete")), S.addWorkdays("2026-10-06", S.BUYOUT_DAYS), "Buyout runs 15 working days past bids due");
assert.deepEqual(act(added, "Bids due · Concrete").predecessors, [{ activityId: act(added, "Buyout · Concrete").id, type: "SS", lag: S.workdaysBetween("2026-09-14", "2026-10-06") }]);
assert.deepEqual(added.log.map(l => l.action), ["Added 6 bids-due and buyout activities from the bid packages"]);
assert.equal(addProcurementActivities(added, procurement, today, by, at), added, "Nothing to add twice");
assert.deepEqual(packagesWithoutBuyout(added, procurement), []);

// Progress and dates from procurement.
const plan = (state, patch = {}) => procurementSchedule(state, { procurement, awards: noAwards, ...patch }, patch.today ?? today);
const p0 = plan(added);
const src = (p, name) => p.sources[act(added, name).id];
const row = (p, name, day = today) => S.scheduleRows(p.state, day).find(r => r.name === name);
assert.deepEqual([src(p0, "Bids due · Concrete").progress, src(p0, "Bids due · Concrete").detail], [100, "Concrete bids due 2026-10-06 (Bid packages) · 2 bids in"], "Due date passed and bids are in: reached");
assert.deepEqual([src(p0, "Buyout · Concrete").progress, src(p0, "Buyout · Concrete").detail], [50, "2 of 2 invited companies bid on Concrete"], "Declined companies don't count");
assert.deepEqual([src(p0, "Bids due · Roofing").progress, row(p0, "Bids due · Roofing").start], [0, "2026-10-12"], "Not due yet");
assert.deepEqual([src(p0, "Buyout · Roofing").progress, src(p0, "Buyout · Roofing").detail], [17, "1 of 3 invited companies bid on Roofing"]);
assert.deepEqual([src(p0, "Bids due · Doors").detail, row(p0, "Bids due · Doors").start, src(p0, "Buyout · Doors").detail], ["Doors has no bid due date yet: set it on Bid packages.", S.addWorkdays(today, S.BIDDING_DAYS), "No companies invited to bid on Doors yet"]);
assert.deepEqual([row(p0, "Buyout · Concrete").status, row(p0, "Bids due · Concrete").status], ["in-progress", "complete"]);
assert(added.activities.every(a => a.progress === 0), "Nothing is written into the schedule");

// Due date passed with no bids: not reached, and late.
const noBids = { ...procurement, invitations: procurement.invitations.map(i => i.packageId === "conc" ? { ...i, status: "invited" } : i) };
assert.deepEqual([src(plan(added, { procurement: noBids }), "Bids due · Concrete").progress, row(plan(added, { procurement: noBids }), "Bids due · Concrete").late], [0, true]);

// Award and subcontract.
const template = sampleAwards.awards.find(a => a.subcontract?.status === "executed");
const award = (packageId, stage, extra = {}) => {
  const a = structuredClone(template);
  Object.assign(a, { id: `${packageId}-${stage}`, packageId, cancelled: null, ...extra });
  a.leveling = { ...a.leveling, bidderName: "Best Builders" };
  if (stage.startsWith("exhibit-")) { a.subcontract = null; a.exhibit = { ...a.exhibit, status: stage.slice("exhibit-".length) }; }
  else a.subcontract = { ...a.subcontract, status: stage };
  return a;
};
const withAward = (...awards) => plan(added, { awards: { awards, notifications: [] } });
assert.deepEqual([src(withAward(award("conc", "exhibit-agreed")), "Buyout · Concrete").progress, src(withAward(award("conc", "exhibit-agreed")), "Buyout · Concrete").detail], [75, "Concrete awarded to Best Builders · exhibit agreed"]);
assert.deepEqual([src(withAward(award("conc", "countersigned")), "Buyout · Concrete").progress], [75], "Signed by both but not executed");
assert.deepEqual([src(withAward(award("conc", "executed")), "Buyout · Concrete").progress, src(withAward(award("conc", "executed")), "Buyout · Concrete").detail], [100, "Concrete subcontract executed · Best Builders"]);
assert.equal(src(withAward(award("conc", "executed", { cancelled: { by, at, reason: "x" } })), "Buyout · Concrete").progress, 50, "A cancelled award goes back to the bids");

// A buyout milestone is reached only at the executed subcontract.
const milestone = S.addActivity(added, { name: "Roofing subcontract executed", packageId: "roof", procurement: "buyout", start: "2026-11-02", duration: 0, phase: "Procurement" }, by, at);
const ms = (p) => p.sources[milestone.activities.at(-1).id].progress;
assert.deepEqual([ms(plan(milestone)), ms(plan(milestone, { awards: { awards: [award("roof", "exhibit-shared")], notifications: [] } })), ms(plan(milestone, { awards: { awards: [award("roof", "executed")], notifications: [] } }))], [0, 0, 100]);
assert.deepEqual(packagesWithoutBuyout(S.EMPTY_SCHEDULE, procurement).length, packagesWithoutBuyout(S.addActivity(S.EMPTY_SCHEDULE, { name: "x", packageId: "roof", procurement: "buyout", start: today, duration: 0 }, by, at), procurement).length, "A milestone isn't the buyout bar");

// A later bid due date moves the milestone and pushes what follows it, without touching the saved schedule.
const install = S.addActivity(added, { name: "Roof install", start: "2026-10-13", duration: 5, phase: "Construction" }, by, at);
const linked = S.addDependency(install, act(install, "Roof install").id, { activityId: act(install, "Bids due · Roofing").id, type: "FS", lag: 0 }, by, at);
const later = { ...procurement, packages: procurement.packages.map(p => p.id === "roof" ? { ...p, due: "2026-11-02" } : p) };
const moved = plan(linked, { procurement: later });
assert.deepEqual([act(moved.state, "Bids due · Roofing").start, act(moved.state, "Roof install").start, act(linked, "Roof install").start], ["2026-11-02", "2026-11-03", "2026-10-13"]);

// Worked out, not typed: progress by hand is refused until the activity stops following procurement.
const buyoutId = act(added, "Buyout · Concrete").id;
assert.throws(() => S.setProgress(added, buyoutId, 60, by, at), e => e instanceof S.ScheduleRuleError && /progress comes from its trade's bids, award and subcontract/.test(e.errors.progress));
const handPlanned = S.setProgress(S.editActivity(added, buyoutId, { procurement: null }, by, at), buyoutId, 60, by, at);
assert.equal(act(handPlanned, "Buyout · Concrete").progress, 60);
assert.equal(plan(handPlanned).sources[buyoutId], undefined);
assert.throws(() => S.addActivity(S.EMPTY_SCHEDULE, { name: "x", procurement: "buyout", start: today, duration: 3 }, by, at), e => e.errors.procurement === "Choose the trade package it follows.");
assert.equal(S.addActivity(S.EMPTY_SCHEDULE, { name: "x", packageId: "conc", procurement: "bids-due", start: today, duration: 3 }, by, at).activities[0].duration, 0, "Bids due is a milestone");
assert.throws(() => S.addActivity(S.EMPTY_SCHEDULE, { name: "x", packageId: "conc", procurement: "weekly", start: today, duration: 3 }, by, at), e => !!e.errors.procurement);

// The to-do sees the same schedule.
const todo = deriveTodo({ project: null, documents: [], procurement: noBids, submissions: [], leveling: null, budget: { lines: [], allowances: [] }, awards: noAwards, schedule: { rows: S.scheduleRows(plan(added, { procurement: noBids }).state, today), today } });
const lateBids = todo.tasks.find(t => t.id === `schedule:late:${act(added, "Bids due · Concrete").id}`);
assert.deepEqual([lateBids?.title, lateBids?.screen], ["A1020 Bids due · Concrete: no bids in yet", "packages"], "Bids due and none in: a task on Bid packages");
assert.equal(todo.tasks.find(t => t.id === `schedule:start:${act(added, "Buyout · Concrete").id}`), undefined, "One task per trade: the late bids-due");
const early = deriveTodo({ project: null, documents: [], procurement: noBids, submissions: [], leveling: null, budget: { lines: [], allowances: [] }, awards: noAwards, schedule: { rows: S.scheduleRows(plan(added, { procurement: noBids, today: "2026-10-01" }).state, "2026-10-01"), today: "2026-10-01" } });
assert.equal(early.tasks.find(t => t.id === `schedule:start:${act(added, "Buyout · Concrete").id}`)?.title, "A1010 Buyout · Concrete: no bids in yet", "Before bids are due: the buyout has none in yet");

// ── The Jelleff sample and Ask Structor ──
const a1020 = sampleSchedule.activities.find(a => a.code === "A1020");
assert.deepEqual([a1020.procurement, procurementSchedule(sampleSchedule, { procurement: sampleProcurement, awards: sampleAwards }, today).sources[a1020.id].progress], ["buyout", 100], "Concrete subcontract executed: reached from the award");
const sched = JSON.parse((await D.runAssistantTool({ id: "c", name: "schedule", arguments: {} }, { projectId: "jelleff", today })).content);
assert(sched.activities.some(l => l.startsWith("A1020") && l.includes("100% done") && l.includes("progress from the buyout, not set by hand: Concrete subcontract executed · District Concrete")));
const refused = A.prepareProposal({ id: "p", name: "propose_activity_progress", arguments: { activity: "A1020", progress: 50 } }, "jelleff");
assert.match(refused.error, /A1020's progress comes from its trade's bids, award and subcontract/, "Ask Structor can't set it by hand either");

console.log("Schedule from procurement checked: buyout and bids-due activities added once per trade (from the first invitation, around the bid due date), bids in, award, executed subcontract and cancellation, buyout milestones, bid due dates passed, missing and moved later (successors pushed, nothing saved), progress by hand refused until unlinked, the to-do, the Jelleff sample and Ask Structor.");

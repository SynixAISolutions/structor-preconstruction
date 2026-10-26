import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/schedule.ts");
const { sampleSchedule } = await import("../lib/data/schedule.ts");
const { sampleAwards } = await import("../lib/data/sample-award.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof S.ScheduleRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const at = "2026-10-02T15:00:00.000Z", today = "2026-10-02";
const base = freeze(structuredClone(sampleSchedule));
const act = (s, code) => s.activities.find(a => a.code === code);
const id = (s, code) => act(s, code).id;
const rows = (s, t = today) => S.scheduleRows(s, t);
const dates = (s) => Object.fromEntries(s.activities.map(a => [a.code, [a.start, S.finishOf(a)]]));

// ── Working days: Monday–Friday, no holidays ──
assert.equal(S.addWorkdays("2026-10-02", 1), "2026-10-05", "Friday + 1 = Monday");
assert.equal(S.addWorkdays("2026-10-05", -1), "2026-10-02");
assert.equal(S.addWorkdays("2026-10-03", 0), "2026-10-05", "A Saturday counts as the Monday");
assert.equal(S.workdaysBetween("2026-10-02", "2026-10-09"), 5);
assert.deepEqual([S.isDate("2026-02-30"), S.isDate("2026-13-01"), S.isDate("2026-10-02"), S.isDate(20261002), S.isDate(["2026-10-02"])], [false, false, true, false, false]);
assert.deepEqual([S.finishOf({ start: "2026-10-05", duration: 5 }), S.finishOf({ start: "2026-10-05", duration: 0 })], ["2026-10-09", "2026-10-05"]);

// ── Sample: the screen's milestones as linked activities ──
assert.deepEqual(dates(base), {
  A1000: ["2026-09-01", "2026-09-25"], A1010: ["2026-09-14", "2026-10-02"], A1020: ["2026-09-25", "2026-09-25"], A1030: ["2026-10-05", "2026-10-23"],
  A1040: ["2026-10-23", "2026-10-23"], A1050: ["2026-10-26", "2026-11-06"], A1060: ["2026-10-26", "2026-12-18"], A1070: ["2026-11-09", "2026-12-11"],
  A1080: ["2026-12-07", "2027-02-26"], A1090: ["2027-02-01", "2027-06-18"], A1100: ["2027-06-01", "2027-07-30"], A1110: ["2027-07-30", "2027-07-30"],
});
assert.equal(S.reschedule(base).shifted.length, 0, "The sample already satisfies every link");
assert.deepEqual(base.activities.map(a => a.id), base.activities.map((_, i) => `act-${i + 1}`), "Fixed ids");
assert.deepEqual([base.log, base.importedFrom], [[], null]);
assert.equal(act(base, "A1020").start, sampleAwards.awards[0].subcontract.executedAt.slice(0, 10), "Matches the sample Concrete award");
assert.deepEqual([act(base, "A1020").packageId, act(base, "A1080").packageId, act(base, "A1070").packageId], ["concrete", "concrete", "demolition"]);
assert.deepEqual(startingDraft("p2", "schedule-plan", sampleSchedule), S.EMPTY_SCHEDULE, "A new project starts with no schedule");
const r0 = rows(base);
assert.deepEqual(r0.filter(r => r.critical).map(r => r.code), ["A1000", "A1010", "A1030", "A1040", "A1050", "A1070", "A1080", "A1090", "A1100", "A1110"], "Critical path");
assert.deepEqual([r0.find(r => r.code === "A1060").float, r0.find(r => r.code === "A1060").lateStart, r0.find(r => r.code === "A1020").critical], [30, "2026-12-07", false], "Long-lead has 30 days of float; a finished milestone isn't critical");
assert.deepEqual(r0.filter(r => r.late).map(r => r.code), ["A1000"], "Design review is past its finish at 80%");
assert.deepEqual([r0.find(r => r.code === "A1010").status, r0.find(r => r.code === "A1020").status, r0.find(r => r.code === "A1020").milestone], ["in-progress", "complete", true]);
assert.deepEqual(S.projectSpan(base), { start: "2026-09-01", finish: "2027-07-30", workdays: 239 });
assert.equal(S.projectSpan(S.EMPTY_SCHEDULE), null);
assert.deepEqual(S.scheduleRows(S.EMPTY_SCHEDULE, today), []);
assert.deepEqual(S.phaseSummary(r0).map(p => [p.phase, p.start, p.finish, p.activities, p.progress]), [
  ["Design", "2026-09-01", "2026-09-25", 1, 80], ["Preconstruction", "2026-09-14", "2026-10-23", 4, 29], ["Procurement", "2026-10-26", "2026-12-18", 2, 0], ["Construction", "2026-11-09", "2027-07-30", 5, 0],
], "Phases in schedule order, progress weighted by duration");

// ── Reads ──
const codes = (list) => list.map(r => r.code);
assert.deepEqual(codes(S.filterSchedule(r0, { phase: "Procurement" })), ["A1050", "A1060"]);
assert.deepEqual(codes(S.filterSchedule(r0, { owner: "Naija" })), ["A1060", "A1080"]);
assert.deepEqual(codes(S.filterSchedule(r0, { packageId: "concrete" })), ["A1020", "A1080"]);
assert.deepEqual(codes(S.filterSchedule(r0, { critical: false })), ["A1020", "A1060"]);
assert.deepEqual(codes(S.filterSchedule(r0, { late: true })), ["A1000"]);
assert.deepEqual(codes(S.filterSchedule(r0, { status: "in-progress" })), ["A1000", "A1010"]);
assert.deepEqual(codes(S.filterSchedule(r0, { query: "gmp" })), ["A1040"]);
assert.deepEqual(codes(S.lookahead(r0, today)), ["A1010", "A1030"], "Three weeks from today (to 10-22), unfinished work only; A1000 ended before today");
assert.deepEqual(codes(S.lookahead(r0, today, 4)), ["A1010", "A1030", "A1040", "A1050", "A1060"], "Four weeks: to 10-29");

// ── Link types, each satisfied by the earliest start ──
const two = (type, lag, durB = 3) => {
  let s = S.addActivity(S.EMPTY_SCHEDULE, { name: "A", start: "2026-10-05", duration: 5 }, "x", at);
  s = S.addActivity(s, { name: "B", start: "2026-10-05", duration: durB }, "x", at);
  s = S.addDependency(s, s.activities[1].id, { activityId: s.activities[0].id, type, lag }, "x", at);
  return [s.activities[1].start, S.finishOf(s.activities[1])];
};
assert.deepEqual(two("FS", 0), ["2026-10-12", "2026-10-14"], "FS: the next working day after A finishes");
assert.deepEqual(two("FS", 2), ["2026-10-14", "2026-10-16"]);
assert.deepEqual(two("FS", -2), ["2026-10-08", "2026-10-12"], "A lead overlaps");
assert.deepEqual(two("FS", 0, 0), ["2026-10-09", "2026-10-09"], "A milestone sits on the day A finishes");
assert.deepEqual(two("SS", 2), ["2026-10-07", "2026-10-09"]);
assert.deepEqual(two("FF", 1), ["2026-10-08", "2026-10-12"], "FF: B finishes a day after A");
assert.deepEqual(two("SF", 5), ["2026-10-08", "2026-10-12"], "SF: B finishes 5 days after A starts");
assert.deepEqual(two("SS", -5), ["2026-10-05", "2026-10-07"], "Never earlier than its own start");

// ── The date-shift rule: push later, never pull ──
const longer = freeze(S.editActivity(base, id(base, "A1030"), { duration: 20 }, "Sadie", at));
const moved = longer.log.at(-1).shifted.map(x => [x.code, x.from, x.to]);
assert.deepEqual(moved, [
  ["A1040", "2026-10-23", "2026-10-30"], ["A1050", "2026-10-26", "2026-11-02"], ["A1060", "2026-10-26", "2026-11-02"], ["A1070", "2026-11-09", "2026-11-16"],
  ["A1080", "2026-12-07", "2026-12-14"], ["A1090", "2027-02-01", "2027-02-08"], ["A1100", "2027-06-01", "2027-06-08"], ["A1110", "2027-07-30", "2027-08-06"],
], "Five more days on A1030 push every successor five working days");
assert.deepEqual([longer.log.at(-1).action, longer.log.at(-1).by], ["Changed A1030 Bid leveling & owner approval", "Sadie"]);
const shorter = S.editActivity(longer, id(longer, "A1030"), { duration: 15 }, "Sadie", at);
assert.deepEqual([act(shorter, "A1040").start, shorter.log.at(-1).shifted, shorter.log.length], ["2026-10-30", [], 2], "Shortening it again does not pull successors back; both changes are logged");
fails(() => S.editActivity(base, id(base, "A1030"), { start: "2026-10-01" }, "Sadie", at), "start", /A1030 can't start before 2026-10-05: it follows A1010 \(FS\)/);
assert.equal(act(S.editActivity(base, id(base, "A1030"), { start: "2026-10-10" }, "Sadie", at), "A1030").start, "2026-10-12", "A Saturday start moves to Monday");
const started = S.setProgress(base, id(base, "A1030"), 10, "Sadie", at);
assert.equal(act(S.editActivity(started, id(started, "A1010"), { duration: 20 }, "Victor", at), "A1030").start, "2026-10-05", "A started activity keeps its start");
assert.equal(act(S.editActivity(base, id(base, "A1010"), { duration: 20 }, "Victor", at), "A1030").start, "2026-10-12", "…a not-started one moves");

// ── Activities ──
fails(() => S.addActivity(base, { name: " ", start: today, duration: 1 }, "Sadie", at), "name", /Name/);
fails(() => S.addActivity(base, { name: "x", start: "2026-02-30", duration: 1 }, "Sadie", at), "start", /start date/);
fails(() => S.addActivity(base, { name: "x", start: today, duration: -1 }, "Sadie", at), "duration", /whole working days/);
fails(() => S.addActivity(base, { name: "x", start: today, duration: 1.5 }, "Sadie", at), "duration", /whole working days/);
fails(() => S.addActivity(base, { name: "x", start: today, duration: 2001 }, "Sadie", at), "duration", /2000/);
fails(() => S.addActivity(base, { name: "x", start: today, duration: 1, code: "A1000" }, "Sadie", at), "code", /already used/);
fails(() => S.addActivity(base, { name: "x", start: today, duration: 1 }, " ", at), "by", /who/);
const added = S.addActivity(base, { name: " Punch list ", phase: "", start: "2026-10-04", duration: 5 }, "Sadie", at);
assert.deepEqual((({ code, name, phase, start, progress, predecessors }) => ({ code, name, phase, start, progress, predecessors }))(added.activities.at(-1)),
  { code: "A1120", name: "Punch list", phase: "General", start: "2026-10-05", progress: 0, predecessors: [] }, "Next code, Sunday → Monday, default phase");
fails(() => S.setProgress(base, id(base, "A1030"), 101, "Sadie", at), "progress", /0 to 100/);
fails(() => S.setProgress(base, id(base, "A1030"), 12.5, "Sadie", at), "progress", /0 to 100/);
fails(() => S.setProgress(base, id(base, "A1040"), 50, "Sadie", at), "progress", /milestone/);
fails(() => S.setProgress(base, "nope", 50, "Sadie", at), "activity", /no longer exists/);
const removed = S.removeActivity(base, id(base, "A1050"), "Sadie", at);
assert(!removed.activities.some(a => a.predecessors.some(p => p.activityId === id(base, "A1050"))), "Links to it go too");
assert.equal(act(removed, "A1070").start, "2026-11-09", "Removing a predecessor doesn't pull its successor in");
assert.equal(S.addActivity(removed, { name: "x", start: today, duration: 1 }, "Sadie", at).activities.at(-1).code, "A1120", "Codes are never reused");
const saturday = S.reschedule({ ...S.EMPTY_SCHEDULE, activities: [{ ...act(base, "A1030"), predecessors: [], start: "2026-10-10" }] });
assert.deepEqual([saturday.state.activities[0].start, saturday.shifted.map(x => x.to)], ["2026-10-12", ["2026-10-12"]], "Stored weekend starts move to the Monday");
const done = rows(S.setProgress(base, id(base, "A1010"), 100, "Victor", at));
assert.deepEqual([done.find(r => r.code === "A1010").float, done.find(r => r.code === "A1010").critical, codes(S.lookahead(done, today))], [0, false, ["A1030"]], "Finished work is neither critical nor in the look-ahead");
assert.deepEqual(rows(base, "2026-10-06").filter(r => r.notStartedOnTime).map(r => r.code), ["A1030"], "Should have started by 10-06");
assert.deepEqual(rows(added).map(r => r.code).slice(0, 6), ["A1000", "A1010", "A1020", "A1030", "A1120", "A1040"], "Rows run by start date, then code");

// ── Links ──
const a1000 = id(base, "A1000"), a1010 = id(base, "A1010"), a1110 = id(base, "A1110");
fails(() => S.addDependency(base, a1000, { activityId: a1000, type: "FS", lag: 0 }, "Sadie", at), "link", /can't follow itself/);
fails(() => S.addDependency(base, a1010, { activityId: a1000, type: "FS", lag: 0 }, "Sadie", at), "link", /already follows A1000/);
fails(() => S.addDependency(base, a1000, { activityId: a1110, type: "XX", lag: 0 }, "Sadie", at), "type", /FS, SS, FF or SF/);
fails(() => S.addDependency(base, a1000, { activityId: a1110, type: "FS", lag: 0.5 }, "Sadie", at), "lag", /whole working days/);
fails(() => S.addDependency(base, a1000, { activityId: a1110, type: "FS", lag: 251 }, "Sadie", at), "lag", /250/);
fails(() => S.addDependency(base, a1000, { activityId: a1110, type: "FS", lag: 0 }, "Sadie", at), "link", /loop/);
const linked = S.addDependency(base, id(base, "A1060"), { activityId: id(base, "A1050"), type: "FS", lag: 0 }, "Naija", at);
assert.deepEqual([act(linked, "A1060").start, linked.log.at(-1).action], ["2026-11-09", "A1060 now follows A1050 (FS)"], "A new link pushes the successor");
const unlinked = S.removeDependency(linked, id(linked, "A1060"), id(linked, "A1050"), "Naija", at);
assert.deepEqual([act(unlinked, "A1060").start, act(unlinked, "A1060").predecessors.length], ["2026-11-09", 1], "Removing a link doesn't pull back");
assert.equal(S.removeDependency(base, a1000, a1110, "Sadie", at), base, "Removing a link that isn't there changes nothing");

// ── Microsoft Project XML (P6 reads and writes it too) ──
const xml = S.toMsProjectXml(base, "Jelleff & Partners <Rec>");
assert.match(xml, /^<\?xml version="1.0"/);
assert.match(xml, /<Name>Jelleff &amp; Partners &lt;Rec&gt;<\/Name>/, "Names are escaped");
assert.equal((xml.match(/<Summary>1<\/Summary>/g) ?? []).length, 4, "One summary task per phase");
assert.equal((xml.match(/<Summary>0<\/Summary>/g) ?? []).length, 12);
assert.match(xml, /<WBS>A1080<\/WBS><OutlineLevel>2<\/OutlineLevel><Summary>0<\/Summary><Milestone>0<\/Milestone><Start>2026-12-07T08:00:00<\/Start><Finish>2027-02-26T17:00:00<\/Finish><Duration>PT480H0M0S<\/Duration>/);
assert.match(xml, /<Type>3<\/Type><LinkLag>96000<\/LinkLag>/, "SS +20 as MS Project stores it");
const round = S.parseMsProjectXml(xml);
assert.deepEqual(round.warnings, []);
const simple = (s) => s.activities.map(a => [a.code, a.name, a.phase, a.owner, a.start, a.duration, a.progress, a.predecessors.map(p => `${s.activities.find(x => x.id === p.activityId).code} ${p.type}${p.lag}`)]);
assert.deepEqual(simple(round).sort(), simple(base).map(([c, n, ph, o, st, d, pr, pre]) => [c, n, ph, o, st, d, pr, pre]).sort(), "Round trip keeps codes, names, phases, owners, dates, durations, progress and links");
const imported = freeze(S.replaceSchedule(base, round, " jelleff.xml ", "Sadie", at));
assert.deepEqual([imported.importedFrom, imported.log.at(-1).action, imported.log.at(-1).shifted], ["jelleff.xml", "Imported 12 activities from jelleff.xml", []]);
fails(() => S.replaceSchedule(base, { activities: [], warnings: [] }, "x.xml", "Sadie", at), "file", /Nothing to import/);

// A file as MS Project writes it: no WBS codes, hours, an SS link with 2 days' lag, a summary link, a missing task.
const msp = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Test</Name><Tasks>
<Task><UID>0</UID><ID>0</ID><Name>Test</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
<Task><UID>1</UID><ID>1</ID><Name>Sitework</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>
<Task><UID>2</UID><ID>2</ID><Name>Clear &amp; grub</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-02T08:00:00</Start><Finish>2026-11-06T17:00:00</Finish><Duration>PT40H0M0S</Duration><PercentComplete>25</PercentComplete></Task>
<Task><UID>3</UID><ID>3</ID><Name>Excavation</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-04T08:00:00</Start><Duration>PT24H0M0S</Duration><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>3</Type><LinkLag>9600</LinkLag></PredecessorLink><PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink><PredecessorLink><PredecessorUID>99</PredecessorUID><Type>1</Type></PredecessorLink></Task>
<Task><UID>4</UID><ID>4</ID><Name>Pad ready</Name><OutlineLevel>2</OutlineLevel><Milestone>1</Milestone><Start>2026-11-06T17:00:00</Start><Duration>PT0H0M0S</Duration><PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type></PredecessorLink></Task>
<Task><UID>5</UID><ID>5</ID><Name></Name><OutlineLevel>2</OutlineLevel></Task>
<Task><UID>6</UID><ID>6</ID><Name>Undated</Name><OutlineLevel>2</OutlineLevel></Task>
</Tasks></Project>`;
const parsed = S.parseMsProjectXml(msp);
assert.deepEqual(parsed.activities.map(a => [a.code, a.name, a.phase, a.start, a.duration, a.progress]), [
  ["A1010", "Clear & grub", "Sitework", "2026-11-02", 5, 25], ["A1020", "Excavation", "Sitework", "2026-11-04", 3, 0], ["A1030", "Pad ready", "Sitework", "2026-11-06", 0, 0],
]);
assert.deepEqual(parsed.activities[1].predecessors.map(p => [p.type, p.lag]), [["SS", 2]]);
assert.deepEqual(parsed.warnings, ["Skipped a task without a name or start date.", "Skipped a task without a name or start date (Undated).", "A1020: a link to a summary task was dropped.", "A1020: a link to a missing task was dropped."]);
fails(() => S.parseMsProjectXml("<html>nope</html>"), "file", /not a Microsoft Project XML file/);
fails(() => S.parseMsProjectXml("<Project><Tasks></Tasks></Project>"), "file", /no tasks/);
fails(() => S.parseMsProjectXml(`<Project><Tasks>${"<Task></Task>".repeat(2001)}</Tasks></Project>`), "file", /at most 2000/);
fails(() => S.parseMsProjectXml("x".repeat(10 * 1024 * 1024 + 1)), "file", /too large/);
const loop = `<Project><Tasks><Task><UID>1</UID><Name>A</Name><Start>2026-11-02T08:00:00</Start><Duration>PT8H0M0S</Duration><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink></Task><Task><UID>2</UID><Name>B</Name><Start>2026-11-03T08:00:00</Start><Duration>PT8H0M0S</Duration><PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink></Task></Tasks></Project>`;
fails(() => S.parseMsProjectXml(loop), "file", /loop/);

// ── CSV ──
const csv = S.toCsv(S.editActivity(base, id(base, "A1050"), { name: 'Award "remaining", trades' }, "Sadie", at), today).split("\n");
assert.equal(csv[0], "Activity ID,Activity,Phase,Owner,Start,Finish,Working days,Progress %,Predecessors,Total float,Critical");
assert.equal(csv.find(l => l.startsWith("A1050")), 'A1050,"Award ""remaining"", trades",Procurement,Victor,2026-10-26,2026-11-06,10,0,A1040 FS,0,Yes');
assert.equal(csv.find(l => l.startsWith("A1080")), "A1080,Foundations & structure,Construction,Naija,2026-12-07,2027-02-26,60,0,A1070 SS+20,0,Yes");
assert.equal(csv.length, 14, "Header, 12 rows, trailing newline");

// AI-suggested schedule: links by code, unknown and self links dropped, loops and duplicates refused.
const sug = [
  { code: "A1000", name: "Notice to proceed", phase: "Preconstruction", packageId: null, duration: 0, after: [] },
  { code: "A1010", name: "Demolition", phase: "Construction", packageId: "demolition", duration: 10, after: [{ code: "A1000", type: "FS", lag: 0 }, { code: "A9999", type: "FS", lag: 0 }, { code: "A1010", type: "SS", lag: 0 }] },
  { code: "A1020", name: "Foundations", phase: "Construction", packageId: "concrete", duration: 20.4, after: [{ code: "A1010", type: "SS", lag: 5 }] },
];
const fromAi = S.scheduleFromSuggestion(freeze(sug), "2026-11-02");
assert.equal(fromAi.warnings.length, 2, "Unknown and self links are dropped with a warning");
const placed = S.replaceSchedule(S.EMPTY_SCHEDULE, fromAi, "AI suggested schedule", "Marcel", at);
assert.deepEqual(placed.activities.map(a => [a.code, a.start, a.duration, a.progress, a.owner]), [["A1000", "2026-11-02", 0, 0, ""], ["A1010", "2026-11-03", 10, 0, ""], ["A1020", "2026-11-10", 20, 0, ""]], "Links push each activity from the start date");
assert.equal(placed.importedFrom, "AI suggested schedule");
fails(() => S.scheduleFromSuggestion([{ ...sug[1], after: [{ code: "A1020", type: "FS", lag: 0 }] }, { ...sug[2] }], "2026-11-02"), "file", /loop/);
fails(() => S.scheduleFromSuggestion([sug[0], sug[0]], "2026-11-02"), "code", /share a code/);
fails(() => S.scheduleFromSuggestion(sug, "2026-02-30"), "start", /start date/);
fails(() => S.scheduleFromSuggestion([], "2026-11-02"), "file", /no activities/);

console.log(`Schedule checked: ${base.activities.length} sample activities; working days, FS/SS/FF/SF and lags, push-only date shift, critical path and float, progress, look-ahead, phases, MS Project XML in and out, CSV.`);

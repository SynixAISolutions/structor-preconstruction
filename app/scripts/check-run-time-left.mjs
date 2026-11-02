import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const T = await import("../lib/run-time-left.ts");
const Pool = await import("../lib/ai-pool.ts");

// The automatic run's time left (Danial, 2 Nov: "CAN THIS GIVE ME AN ACCURATE TIME LEFT").
const lanes = { pool: 18, ocr: 4, references: 6 };
const pace = { ...T.FIRST_PACE, scope: 20, lines: 10, drawing: 6, references: 12, tile: 4, tilesPerCheck: 10, sheetTiles: 20, checkShare: 0.5 };
const none = { setup: null, scope: 0, lines: 0, drawing: 0, references: 0, checks: 0, scannedTiles: 0 };

// The longer queue sets the time: the pool's requests over its 18 slots, or the OCR workers' tiles over 4 workers.
assert.equal(T.secondsLeft({ ...none, scope: 90 }, pace, lanes), 100, "90 specification requests of 20 s, 18 at a time");
assert.equal(T.secondsLeft({ ...none, checks: 20 }, pace, lanes), 200, "20 checks of 10 tiles at 4 s a tile, over 4 workers");
assert.equal(T.secondsLeft({ ...none, scope: 90, checks: 20 }, pace, lanes), 200, "Both queues run side by side: the OCR's is longer");
assert.equal(T.secondsLeft({ ...none, setup: 10 }, pace, lanes), pace.setup - 10, "Setting the packages: what's left of its usual time");
assert.equal(T.secondsLeft({ ...none, setup: 400 }, pace, lanes), 5, "A slow setup still says a few seconds, not none");
assert.equal(T.secondsLeft(none, pace, lanes), 0, "Nothing left");
assert.equal(T.secondsLeft({ ...none, scope: 1 }, pace, lanes), 20, "The last request takes a request's time, however empty the pool");
assert.equal(T.secondsLeft({ ...none, checks: 0.5 }, pace, lanes), 40, "The last check reads its tiles on one worker");
// The drawing search waits for the scanned sheets, then sends six requests at a time.
assert.equal(T.secondsLeft({ ...none, references: 12 }, pace, lanes), 24, "12 requests six at a time: two rounds of 12 s");
assert.equal(T.secondsLeft({ ...none, references: 12, scannedTiles: 40 }, pace, lanes), 40 + 24, "After 40 scanned tiles at 4 s over 4 workers");

// What the trades still have: their files' estimate until they start, then their own counts.
const trade = (parts, sections, sheets, counts = null, done = false) => ({ estimate: { parts, sections, sheets }, counts, done });
const counts = (c) => ({ ...T.NO_COUNTS, ...c });
assert.deepEqual(T.tradesLeft([trade(10, 4, 6)], pace), { scope: 10, lines: 4 * 0.7, drawing: 6, checks: 3 }, "Not started: every part, about one line request per 0.7 sections, every sheet, half the sheets checked");
assert.deepEqual(T.tradesLeft([trade(2, 1, 0)], pace), { scope: 2, lines: 0, drawing: 0, checks: 0 }, "A short specification isn't merged into lines");
assert.deepEqual(T.tradesLeft([trade(10, 4, 6, null, true)], pace), { scope: 0, lines: 0, drawing: 0, checks: 0 }, "A finished trade has nothing left");
assert.deepEqual(T.tradesLeft([trade(10, 4, 6, counts({ parts: 8, partsDone: 5, lines: 3, linesDone: 1, sheetsRead: 4, sheetsSettled: 3, checks: 2, checksDone: 1 }))], pace),
  { scope: 3, lines: 2, drawing: 2, checks: 3 * 0.5 + 1 }, "Started: its own counts; checks still to come from the 3 sheets not settled, plus the one being read");
assert.equal(T.tradesLeft([trade(10, 4, 6, counts({ parts: 8, partsDone: 8, specDone: true }))], pace).lines, 0, "Lines are done with the specification");
assert.equal(T.tradesLeft([trade(10, 0, 0, counts({ parts: 5 })), trade(20, 0, 0)], pace).scope, 5 + 10, "Blank pages aren't sent: trades not started are scaled by how the started ones compared (5 of 10)");
assert.deepEqual(T.checkShare([trade(0, 0, 6, counts({ sheetsSettled: 4, checks: 3 })), trade(0, 0, 2, counts({ sheetsSettled: 2, checks: 0 }))]), { n: 6, value: 0.5 }, "3 of the 6 settled sheets needed a check");

// The pace: this run's measurements since it began, outweighing the starting pace as they add up.
const before = { requests: { scope: { n: 10, ms: 100_000 } }, ocr: { tiles: 50, busyMs: 200_000, checks: 5, checkTiles: 50, sheets: 0, sheetTiles: 0 } };
const now = { requests: { scope: { n: 30, ms: 700_000 }, drawing: { n: 4, ms: 20_000 } }, ocr: { tiles: 150, busyMs: 500_000, checks: 15, checkTiles: 130, sheets: 2, sheetTiles: 40 } };
const measured = T.measurePace(before, now);
assert.deepEqual(measured, { setup: undefined, scope: { n: 20, value: 30 }, lines: undefined, drawing: { n: 4, value: 5 }, references: undefined, tile: { n: 100, value: 3 }, tilesPerCheck: { n: 10, value: 8 }, sheetTiles: { n: 2, value: 20 } });
const blended = T.blendPace(T.FIRST_PACE, measured);
assert.equal(blended.scope, (24 * 12 + 30 * 20) / 32, "20 requests outweigh the starting pace's 12");
assert.equal(blended.lines, T.FIRST_PACE.lines, "Nothing measured: the starting pace");
assert(Math.abs(blended.tile - 3) < Math.abs(T.FIRST_PACE.tile - 3), "OCR moves toward what this computer does");

// The time shown counts down by itself and moves toward new estimates gradually.
let shown = T.steadyLeft(null, 600, 0);
assert.deepEqual(shown, { seconds: 600, at: 0 });
shown = T.steadyLeft(shown, 560, 5_000);
assert.equal(shown.seconds, 595, "Within a tenth of the countdown: keeps counting down");
shown = T.steadyLeft(shown, 295, 10_000);
assert.equal(shown.seconds, 590 - (590 - 295) / 3, "Far off: a third of the way toward the new estimate");
assert.equal(T.steadyLeft({ seconds: 3, at: 0 }, 0, 10_000).seconds, 0, "Never below zero");
assert.deepEqual([30, 60, 100, 12 * 60 + 10, 75 * 60].map(T.timeLeftLabel), ["Less than a minute left", "About a minute left", "About 2 min left", "About 12 min left", "About 1 h 15 min left"]);

// Replaying the 2 Nov run (Project 1, live): every trade's specification requests and sheets, and when it started and
// finished, from 05:41 (after the first six trades and the hidden-tab stall) to the last trade at 05:51:05. Each
// trade's work is spread evenly over its own time, the OCR workers are busy throughout, and the estimate is asked every
// 30 seconds. After the first two minutes it is within two minutes of the truth.
const at = (hms) => { const [h, m, s] = hms.split(":").map(Number); return h * 3600 + m * 60 + s; };
const RUN = [ // parts, sections, sheets, started, finished
  [11, 5, 4, "05:39:50", "05:41:38"], [10, 5, 5, "05:40:12", "05:42:13"], [10, 5, 4, "05:40:47", "05:44:01"], [9, 2, 4, "05:40:51", "05:44:12"],
  [9, 5, 4, "05:41:00", "05:45:19"], [12, 4, 3, "05:41:38", "05:45:01"], [11, 5, 3, "05:42:13", "05:44:43"], [13, 5, 5, "05:39:49", "05:44:43"],
  [12, 6, 2, "05:44:01", "05:45:36"], [9, 5, 4, "05:44:12", "05:45:12"], [6, 2, 4, "05:44:43", "05:45:52"], [6, 5, 4, "05:44:43", "05:46:46"],
  [5, 3, 4, "05:45:01", "05:48:41"], [7, 4, 4, "05:45:12", "05:47:14"], [5, 3, 4, "05:45:19", "05:46:24"], [5, 3, 3, "05:45:36", "05:50:02"],
  [5, 2, 4, "05:45:52", "05:50:29"], [0, 0, 6, "05:46:24", "05:50:59"], [0, 0, 6, "05:46:46", "05:50:05"], [3, 2, 2, "05:47:14", "05:51:05"],
  [3, 2, 2, "05:48:41", "05:49:28"], [2, 1, 2, "05:49:28", "05:50:29"], [3, 2, 2, "05:50:02", "05:50:51"], [2, 1, 1, "05:50:05", "05:51:01"],
].map(([parts, sections, sheets, s, f]) => ({ parts, sections, sheets, start: at(s), end: at(f) }));
const from = at("05:41:00"), end = Math.max(...RUN.map(t => t.end)), share = 0.75, tilesPerCheck = 9;
const progress = (t, now) => now <= t.start ? 0 : now >= t.end ? 1 : (now - t.start) / (t.end - t.start);
const state = (now) => {
  const ledger = RUN.map(t => {
    const p = progress(t, now), started = now > t.start;
    const settled = Math.floor(t.sheets * p);
    return { estimate: { parts: t.parts, sections: t.sections, sheets: t.sheets }, done: p === 1, counts: started ? counts({ parts: t.parts, partsDone: Math.floor(t.parts * p), sheetsRead: settled, sheetsSettled: settled, checks: Math.round(settled * share), checksDone: Math.round(settled * share), specDone: p > 0.8 }) : null };
  });
  const checksDone = ledger.reduce((n, l) => n + (l.counts?.checksDone ?? 0), 0), partsDone = ledger.reduce((n, l) => n + (l.counts?.partsDone ?? 0), 0);
  return { ledger, counters: { requests: { scope: { n: partsDone, ms: partsDone * 24_000 } }, ocr: { tiles: checksDone * tilesPerCheck, busyMs: 4 * (now - from) * 1000, checks: checksDone, checkTiles: checksDone * tilesPerCheck, sheets: 0, sheetTiles: 0 } } };
};
const start = state(from).counters;
let worst = 0;
shown = null;
for (let now = from; now < end; now += 30) {
  const { ledger, counters } = state(now);
  const checks = T.checkShare(ledger);
  const p = T.blendPace(T.FIRST_PACE, { ...T.measurePace(start, counters), checkShare: checks.n ? checks : undefined });
  const work = { setup: null, ...T.tradesLeft(ledger, p), references: 0, scannedTiles: 0 };
  shown = T.steadyLeft(shown, T.secondsLeft(work, p, lanes), now * 1000);
  if (now - from >= 120) worst = Math.max(worst, Math.abs(shown.seconds - (end - now)));
}
assert(worst <= 120, `The 2 Nov replay is within two minutes of the truth after two minutes (worst ${Math.round(worst)} s)`);

// Requests are timed by kind, answered ones only, for the pace.
await Pool.timed("scope", () => new Promise(resolve => setTimeout(resolve, 30)));
await assert.rejects(Pool.timed("scope", async () => { throw new Error("The AI request failed (500)."); }));
assert.equal(Pool.aiTimes().scope.n, 1, "A failed request isn't counted");
assert(Pool.aiTimes().scope.ms >= 25, "The answered one's time is");

console.log(`Run time left checks passed (2 Nov replay: worst ${Math.round(worst)} s off over the last ${Math.round((end - from - 120) / 60)} minutes).`);

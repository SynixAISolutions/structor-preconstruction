// One browser reads a project's files at a time (lib/reading-claim; 25 Nov, 2626 Penn was read twice because a tab in the
// background judged another's reading by an old copy): what holds a claim, who gets it when two ask at once, when a
// background tab's copy is old, when the holder is gone, and with no shared copy. A made-up shared copy and made-up tabs.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/reading-claim.ts");
const { mergeJson } = await import("../lib/shared-merge.ts");

// ── What holds ──
const at = Date.parse("2026-11-25T13:56:29Z"), iso = ms => new Date(at + ms).toISOString();
const a = { tab: "a", browser: "ba" }, b = { tab: "b", browser: "bb" }, a2 = { tab: "a2", browser: "ba" };
const claim = (who, beat) => ({ key: "k", ...who, beat });
assert.equal(C.claimHeld(C.NO_CLAIM, a, at), false, "No one is reading");
assert.equal(C.claimHeld(claim(a, iso(-200_000)), a, at), false, "Its own claim never holds it back");
assert.equal(C.claimHeld(claim(a, iso(-60_000)), b, at), true, "A beat a minute old holds: a background tab's timers run about once a minute");
assert.equal(C.claimHeld(claim(a, iso(-119_000)), b, at), true);
assert.equal(C.claimHeld(claim(a, iso(-121_000)), b, at), false, "Two minutes without a word: another may take over");
assert.equal(C.claimHeld(claim(a, iso(-61_000)), a2, at), true, "The same browser's other tab: a minute-old beat still holds");
assert.equal(C.claimHeld(claim(a, iso(-91_000)), a2, at), false, "A reload's old tab lapses sooner");
assert.equal(C.claimHeld(claim(a, ""), b, at), false, "A released claim holds no one");
assert.ok(C.CLAIM_LASTS_HERE > 60_000 && C.CLAIM_LASTS > C.CLAIM_LASTS_HERE, "Longer than a background tab's minute");

// ── Two browsers, one shared copy (as lib/shared-sync keeps it: a save 2 s after the change, ours winning a conflict) ──
function world() {
  let clock = at, server = { value: C.NO_CLAIM, version: 1 };
  const tick = []; // [time, fn]
  const later = (ms, fn) => tick.push([clock + ms, fn]);
  const advance = async ms => {
    const end = clock + ms;
    for (;;) {
      tick.sort((x, y) => x[0] - y[0]);
      const next = tick[0];
      if (!next || next[0] > end) break;
      tick.shift(); clock = next[0]; next[1]();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
    clock = end;
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  const tab = (me, { lag = 0, online = true } = {}) => {
    const state = { local: C.NO_CLAIM, base: C.NO_CLAIM, version: 1, sends: 0 };
    const send = () => {
      if (state.version !== server.version) { const merged = mergeJson(state.base, state.local, server.value); state.local = merged; }
      server = { value: state.local, version: server.version + 1 }; state.base = state.local; state.version = server.version; state.sends++;
    };
    const pull = () => { if (state.version < server.version) { state.local = server.value; state.base = server.value; state.version = server.version; } };
    const io = { me, key: "k", now: () => clock,
      sync: () => new Promise(done => { if (!online) return done(false); later(lag, () => { pull(); done(true); }); }),
      read: () => state.local,
      write: c => { state.local = c; if (online) later(2_000, send); },
      wait: ms => new Promise(done => later(ms, done)),
    };
    return { me, state, io, start: () => C.acquireClaim(io), beat: () => { if (C.claimMine(state.local, me)) { state.local = { ...state.local, beat: new Date(clock).toISOString() }; send(); } }, pull };
  };
  return { tab, advance, clock: () => clock, server: () => server.value };
}

{ // Nobody else: it gets the reading.
  const w = world(), one = w.tab(a); let got; one.start().then(v => got = v); await w.advance(20_000);
  assert.equal(got, true, "A tab alone takes it");
  assert.equal(w.server().tab, "a", "And the shared copy says so");
}
{ // Already being read: the second asks the shared copy, not its own old one.
  const w = world(), one = w.tab(a), two = w.tab(b);
  one.start(); await w.advance(20_000); one.beat(); await w.advance(60_000); one.beat();
  let got; two.start().then(v => got = v); await w.advance(30_000);
  assert.equal(got, false, "Its own copy is empty, but the shared copy says someone reads (2626 Penn's bug)");
  assert.equal(w.server().tab, "a", "The reading stays the first browser's");
}
{ // The holder has been silent two minutes: the other takes over.
  const w = world(), one = w.tab(a), two = w.tab(b);
  one.start(); await w.advance(20_000); await w.advance(130_000);
  let got; two.start().then(v => got = v); await w.advance(30_000);
  assert.equal(got, true, "A closed tab's reading can be picked up");
  one.pull();
  assert.equal(C.claimMine(one.state.local, a), false, "The first, back from sleep, sees it lost the reading");
}
for (const gap of [0, 500, 1_500, 3_000, 5_000]) { // Two ask at (almost) the same moment.
  const w = world(), one = w.tab(a), two = w.tab(b); let x, y;
  one.start().then(v => x = v); if (gap) await w.advance(gap); two.start().then(v => y = v); await w.advance(60_000);
  assert.equal([x, y].filter(Boolean).length, 1, `Two browsers asking ${gap} ms apart: exactly one reads (got ${x}, ${y})`);
}
{ // No shared copy to ask: this browser decides alone, as before.
  const w = world(), alone = w.tab(a, { online: false }); let got; alone.start().then(v => got = v); await w.advance(1_000);
  assert.equal(got, true, "Offline or without a database a browser reads by itself");
}

console.log("Reading claim checked: what holds a claim (a background tab's beats, a reload's old tab, a released or lapsed one), two browsers asking for one reading at the same time or late, a stale copy that no longer decides, a silent holder replaced and told, and no shared copy to ask.");

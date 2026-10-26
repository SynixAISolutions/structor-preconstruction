import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/sample-refresh.ts");

/** localStorage in memory; `limit` characters simulates a full browser store. */
function memoryStorage(entries = {}, limit = Infinity) {
  const map = new Map(Object.entries(entries));
  const size = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const before = map.get(k);
      map.set(k, String(v));
      if (size() > limit) { if (before === undefined) map.delete(k); else map.set(k, before); throw new Error("QuotaExceededError"); }
    },
    removeItem: (k) => { map.delete(k); },
    snapshot: () => Object.fromEntries([...map].sort()),
  };
}
const fails = (fn, pattern) => assert.throws(fn, e => e instanceof R.SampleRefreshError && pattern.test(e.message));
const at = "2026-10-02T15:00:00.000Z";

// A returning browser: Jelleff drafts from the old sample, plus things that must never be touched.
const returning = () => memoryStorage({
  "structor-ui-procurement": '{"old":"procurement"}',
  "structor-ui-awards": '{"awards":[]}',
  "structor-ui-submittal-log": '{"old":"submittals"}',
  "structor-ui-p2:procurement": '{"other":"project"}',
  "structor-ui-directory": '[{"id":"b1"}]',
  "structor-ui-portal-profile": '{"name":"me"}',
  "structor-ui-projects": '[{"id":"jelleff"},{"id":"p2"}]',
  "structor-ui-active-project": "jelleff",
  "unrelated": "x",
});
const untouched = ["structor-ui-p2:procurement", "structor-ui-portal-profile", "structor-ui-projects", "structor-ui-active-project", "unrelated"];

let s = returning();
assert.deepEqual(R.jelleffDraftKeys(s), ["structor-ui-awards", "structor-ui-procurement", "structor-ui-submittal-log"], "Only Jelleff's own drafts");
assert.deepEqual(R.sampleStatus(s), { current: R.SAMPLE_VERSION, applied: null, savedKeys: R.jelleffDraftKeys(s), needsChoice: true }, "Saved data from before versioning: offer the choice");
R.markFreshBrowser(s);
assert.equal(s.getItem(R.SAMPLE_VERSION_KEY), null, "Not a fresh browser: nothing marked");
assert.match(R.SAMPLE_VERSION, /^\d{4}-\d{2}-\d{2}$/);
assert(R.SAMPLE_CHANGES.length > 20);

// A fresh browser starts on the current sample and is never asked.
const fresh = memoryStorage({ "structor-ui-projects": "[]" });
assert.equal(R.sampleStatus(fresh).needsChoice, false, "Nothing saved: nothing to offer, even before marking");
R.markFreshBrowser(fresh);
assert.deepEqual([fresh.getItem(R.SAMPLE_VERSION_KEY), R.sampleStatus(fresh).needsChoice], [R.SAMPLE_VERSION, false]);
fresh.setItem("structor-ui-procurement", "{}");
assert.equal(R.sampleStatus(fresh).needsChoice, false, "Its own later edits are on the current sample");

// "Keep my data": nothing changes except the offer stops.
const kept = returning();
const before = kept.snapshot();
R.keepMyData(kept);
assert.deepEqual(R.sampleStatus(kept).needsChoice, false);
assert.deepEqual({ ...kept.snapshot(), [R.SAMPLE_VERSION_KEY]: undefined }, { ...before, [R.SAMPLE_VERSION_KEY]: undefined });

// Load the updated sample: everything is backed up first, then only Jelleff drafts go.
const old = s.snapshot();
const backupKey = R.loadUpdatedSample(s, at);
assert.equal(backupKey, `structor-sample-backup:${at}`);
assert.deepEqual(R.jelleffDraftKeys(s), [], "Jelleff screens now start from the new sample");
for (const k of untouched) assert.equal(s.getItem(k), old[k], `${k} untouched`);
assert.deepEqual(R.sampleStatus(s), { current: R.SAMPLE_VERSION, applied: R.SAMPLE_VERSION, savedKeys: [], needsChoice: false });
// The shared directory keeps its own entries as they are and only gains the sample companies it lacks.
const { initialBidders } = await import("../lib/data/commercial.ts");
assert.deepEqual(JSON.parse(s.getItem("structor-ui-directory")), [{ id: "b1" }, ...initialBidders.filter(c => c.id !== "b1")], "Edited b1 kept; missing sample companies added");
const dirOf = (raw) => { const t = memoryStorage(raw === undefined ? {} : { "structor-ui-directory": raw }); R.addMissingSampleCompanies(t); return t.getItem("structor-ui-directory"); };
assert.deepEqual([dirOf(undefined), dirOf("not json"), dirOf('{"id":"b1"}')], [null, "not json", '{"id":"b1"}'], "No saved directory, or one that can't be read: left alone");
const full = JSON.stringify(initialBidders.map(c => ({ ...c, name: "Edited" })));
assert.equal(dirOf(full), full, "Nothing missing: unchanged, edits kept");
assert.deepEqual(R.listSampleBackups(s), [{ key: backupKey, at, version: null, keys: ["structor-ui-awards", "structor-ui-procurement", "structor-ui-submittal-log"], bytes: s.getItem(backupKey).length }]);
const file = R.sampleBackupFile(s, backupKey);
assert.equal(file.name, "structor-jelleff-backup-2026-10-02-15-00-00.json");
assert.deepEqual(JSON.parse(file.text).entries["structor-ui-procurement"], '{"old":"procurement"}');

// New edits on the new sample, then restore: those edits are backed up too, and the old data comes back exactly.
s.setItem("structor-ui-procurement", '{"new":"procurement"}');
s.setItem("structor-ui-schedule-plan", '{"new":"schedule"}');
const second = R.restoreSampleBackup(s, backupKey, at);
assert.equal(second, `structor-sample-backup:${at}#2`, "Same-moment backups don't collide");
assert.deepEqual(Object.fromEntries(R.jelleffDraftKeys(s).map(k => [k, s.getItem(k)])), { "structor-ui-awards": old["structor-ui-awards"], "structor-ui-procurement": old["structor-ui-procurement"], "structor-ui-submittal-log": old["structor-ui-submittal-log"] });
assert.equal(s.getItem(R.SAMPLE_VERSION_KEY), null, "Back to the pre-versioning state, so the offer returns");
assert.equal(R.sampleStatus(s).needsChoice, true);
assert.deepEqual(JSON.parse(s.getItem(second)).entries, { "structor-ui-procurement": '{"new":"procurement"}', "structor-ui-schedule-plan": '{"new":"schedule"}' }, "The edits made on the new sample are kept");
assert.deepEqual(R.listSampleBackups(s).map(b => b.key), [second, backupKey], "Newest first");
for (const k of untouched) assert.equal(s.getItem(k), old[k], `${k} still untouched`);

// Full storage: no backup, no change.
const tight = returning();
const tightBefore = tight.snapshot();
const limited = memoryStorage(tightBefore, Object.entries(tightBefore).reduce((n, [k, v]) => n + k.length + v.length, 0) + 20);
fails(() => R.loadUpdatedSample(limited, at), /enough browser storage.*nothing was changed/);
assert.deepEqual(limited.snapshot(), tightBefore, "Nothing removed when the backup can't be written");
s.setItem("structor-ui-x", "y");
const sBefore = s.snapshot();
const limitedRestore = memoryStorage(sBefore, Object.entries(sBefore).reduce((n, [k, v]) => n + k.length + v.length, 0) + 20);
fails(() => R.restoreSampleBackup(limitedRestore, backupKey, at), /nothing was changed/);
assert.deepEqual(limitedRestore.snapshot(), sBefore);

// A small current draft can be backed up even when the much larger target cannot fit.
// That later failure must roll the active draft and sample version back completely.
const largeTarget = memoryStorage({
  "structor-sample-backup:large": JSON.stringify({ at, version: null, entries: { "structor-ui-procurement": "X".repeat(1000) } }),
  "structor-ui-procurement": "small current draft",
  [R.SAMPLE_VERSION_KEY]: R.SAMPLE_VERSION,
});
const largeBefore = largeTarget.snapshot();
const largeLimit = Object.entries(largeBefore).reduce((n, [k, v]) => n + k.length + v.length, 0) + 300;
const limitedLargeRestore = memoryStorage(largeBefore, largeLimit);
fails(() => R.restoreSampleBackup(limitedLargeRestore, "structor-sample-backup:large", at), /current Project 1 data was kept/);
assert.deepEqual(limitedLargeRestore.snapshot(), largeBefore, "A failed restore does not partially remove the active draft");

// Bad backups.
fails(() => R.restoreSampleBackup(s, "structor-ui-procurement", at), /not a sample backup/);
fails(() => R.restoreSampleBackup(s, "structor-sample-backup:nope", at), /no longer exists/);
s.setItem("structor-sample-backup:broken", "{not json");
s.setItem("structor-sample-backup:hostile", JSON.stringify({ at, entries: { "structor-ui-projects-evil": 1, "elsewhere": "x" } }));
fails(() => R.restoreSampleBackup(s, "structor-sample-backup:broken", at), /can't be read/);
fails(() => R.restoreSampleBackup(s, "structor-sample-backup:hostile", at), /can't be read/);
s.setItem("structor-sample-backup:numeric", JSON.stringify({ at, entries: { "structor-ui-procurement": 5 } }));
fails(() => R.restoreSampleBackup(s, "structor-sample-backup:numeric", at), /can't be read/);
s.setItem("structor-sample-backup:sneaky", JSON.stringify({ at, entries: { "structor-ui-projects": "[]" } }));
fails(() => R.restoreSampleBackup(s, "structor-sample-backup:sneaky", at), /can't be read/);
assert.equal(s.getItem("structor-ui-projects"), old["structor-ui-projects"], "A backup can only restore Jelleff drafts, never the project list");
assert(!R.listSampleBackups(s).some(b => /broken|hostile|sneaky|numeric/.test(b.key)), "Unreadable backups aren't listed");
R.deleteSampleBackup(s, second);
assert.deepEqual(R.listSampleBackups(s).map(b => b.key), [backupKey]);
fails(() => R.deleteSampleBackup(s, second), /no longer exists/);

console.log(`Sample refresh checked: version ${R.SAMPLE_VERSION}; Jelleff drafts only, fresh vs returning browsers, keep my data, backup-then-load, directory gains missing sample companies, restore (itself backed up), quota failures roll back, bad backups refused.`);

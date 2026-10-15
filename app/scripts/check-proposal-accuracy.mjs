import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const P = await import("../lib/proposal-accuracy.ts");

const e = (lineId, answer, note = "") => ({ lineId, text: `Line ${lineId}`, answer, note });
const r = (lineId, answer, note = "") => ({ lineId, answer, note });
const expected = [e("B-14", "Y"), e("B-15", "Y"), e("B-67", "N", "W/Div 10"), e("B-68", "N", "W/Div 10"), e("B-33", "P", "Level 4 only"), e("B-71", null), e("B-72", null), e("B-90", "Y")];
const read = [r("B-14", "Y"), r("B-15", "N"), r("B-67", "Y"), r("B-68", "N", "By Div 10"), r("B-33", "Y"), r("B-71", "Y"), r("B-90", null)];
const s = P.scoreReading(expected, read, { expected: 1247628, read: 1247628 });

assert.deepEqual(s.lines.map(l => [l.lineId, l.outcome]), [
  ["B-14", "agree"], ["B-15", "disagree"], ["B-67", "hidden-exclusion"], ["B-68", "agree"], ["B-33", "disagree"],
  ["B-71", "unverifiable"], ["B-72", "both-blank"], ["B-90", "unanswered"],
], "Y where the estimator found N hides an exclusion; a blank estimator line can't be scored");
assert.deepEqual([s.lines[3].expectedNote, s.lines[3].readNote], ["W/Div 10", "By Div 10"], "Both notes kept for a person to compare");
assert.deepEqual(s.summary, { leveled: 6, agree: 2, disagree: 2, hiddenExclusions: 1, unanswered: 1, unverifiable: 1, agreement: 0.4, coverage: 0.833 });
assert.deepEqual(s.baseBid, { expected: 1247628, read: 1247628, matches: true });
assert.deepEqual(P.scoreReading(expected, read, { expected: 1247628, read: 1274628 }).baseBid.matches, false, "Transposed digits are a miss");
assert.equal(P.scoreReading(expected, read, { expected: 1247628, read: 1247627 }).baseBid.matches, false, "A dollar off is a miss");
assert.equal(P.scoreReading(expected, read, { expected: 1247628, read: 1247628.001 }).baseBid.matches, true, "Float noise is not");
assert.deepEqual(P.scoreReading(expected, read, { expected: 1247628, read: null }).baseBid.matches, null, "No price read: not a match, not a miss");
assert.deepEqual(P.scoreReading(expected, [], { expected: null, read: null }).summary, { leveled: 6, agree: 0, disagree: 0, hiddenExclusions: 0, unanswered: 6, unverifiable: 0, agreement: null, coverage: 0 }, "Nothing compared is unassessed, not 0% accurate");
assert.equal(P.scoreReading([], read, { expected: null, read: null }).lines.length, 0, "Only the estimator's lines are scored");

console.log("Proposal accuracy checked: agree / disagree / hidden exclusions / unanswered / unverifiable, notes kept, base bid match, empty readings.");

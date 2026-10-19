import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/clarifications.ts");

const at = "2026-10-20T14:00:00.000Z";
let n = 0;
const newId = () => `cl-${++n}`;
const items = [
  { id: "s1", number: "1", description: "Firestopping at rated partitions", section: "07 84 00", required: true, source: "Manual p. 512, 07 84 00 §1.2", estimatorNote: "" },
  { id: "s2", number: "2", description: "Level 4 finish at back of house", section: "09 29 00", required: true, source: "A8.1 note 6", estimatorNote: "" },
  { id: "s3", number: "3", description: "Deflection track", section: "09 22 16", required: true, source: "A8.1 partition types", estimatorNote: "" },
  { id: "s4", number: "4", description: "Owner-furnished blocking", section: "06 10 00", required: false, source: "", estimatorNote: "" },
];
const r = (status, note = "", extra = {}) => ({ status, note, adjustment: 0, ...extra });
const bidders = [
  { id: "b1", name: "Capitol Drywall", contact: "", baseBid: 1_250_000, responses: { s1: r("N", "Firestopping by others"), s2: r("P", "Level 4 at lobby only"), s3: r("Y"), s4: r("N") } },
  { id: "b2", name: "Metro Interiors", contact: "", baseBid: 1_310_000, responses: { s1: r("Y"), s2: r("Y"), s3: r("", "") } },
  { id: "b3", name: "Late Bidder", contact: "", baseBid: null, responses: {} },
  { id: "b4", name: "Resolved Co", contact: "", baseBid: 1_400_000, responses: { s1: r("N", "", { resolved: true }), s2: r("Y"), s3: r("Y") } },
];

// Gaps: required items excluded, partial or unanswered, not already resolved. No bid yet, no request.
const drafts = C.draftClarifications({ packageId: "drywall", trade: "Drywall", items, bidders, open: [], at, newId });
assert.deepEqual(drafts.map(d => [d.bidder, d.lines.map(l => l.scopeItemId)]), [["Capitol Drywall", ["s1", "s2"]], ["Metro Interiors", ["s3"]]], "Optional items, answered Y, resolved gaps and bidders without a bid are left out");
assert.deepEqual(drafts[0].lines[0].bid, { status: "N", note: "Firestopping by others" });
assert.deepEqual(C.draftClarifications({ packageId: "drywall", trade: "Drywall", items, bidders, open: drafts, at, newId }), [], "A gap already asked is not asked again");

// The letter quotes the bid and the requirement; nothing else.
const letter = C.clarificationLetter({ ...drafts[0], dueAt: "2026-10-23" }, "Jelleff Recreation Center");
assert.match(letter, /^Jelleff Recreation Center: Drywall\. Clarification of your proposal/);
assert.match(letter, /1\. 1 Firestopping at rated partitions \(07 84 00\)\. Your proposal excludes it: "Firestopping by others"\. The bid documents require it: Manual p\. 512, 07 84 00 §1\.2\./);
assert.match(letter, /2\. 2 Level 4 finish at back of house \(09 29 00\)\. Your proposal includes it only in part: "Level 4 at lobby only"/);
assert.match(letter, /by 2026-10-23/);
assert.match(C.clarificationLetter(drafts[1], "P"), /does not say whether it is included/);

// Sending, answering, overdue.
let state = drafts;
assert.throws(() => C.answerLine(state, "cl-1", "s1", { kind: "included", amount: null, note: "" }, "x", at), /not open/);
assert.throws(() => C.sendClarification(state, "cl-1", "2026-10-19", at), /from today/);
state = C.sendClarification(state, "cl-1", "2026-10-23", at);
assert.equal(state[0].status, "sent");
assert.throws(() => C.sendClarification(state, "cl-1", "2026-10-23", at), /already sent/);
assert.equal(C.isOverdue(state[0], "2026-10-24"), true);
assert.equal(C.isOverdue(state[0], "2026-10-23"), false);
assert.throws(() => C.answerLine(state, "cl-1", "s1", { kind: "add", amount: 0, note: "" }, "x", at), /amount to add/);
assert.throws(() => C.answerLine(state, "cl-1", "s1", { kind: "included", amount: 5, note: "" }, "x", at), /Only an addition/);
assert.throws(() => C.answerLine(state, "cl-1", "s9", { kind: "included", amount: null, note: "" }, "x", at), /not in this request/);
state = C.answerLine(state, "cl-1", "s1", { kind: "add", amount: 4200.004, note: "UL systems per 07 84 00" }, "J. Ortiz", at);
assert.equal(state[0].status, "sent", "One of two lines answered");

// Applying a partial answer changes only that line and keeps the request open.
const partial = C.applyClarification(bidders, state[0], at);
assert.equal(partial.request.status, "sent");
assert.deepEqual(partial.bidders[0].responses.s1, { status: "P", note: 'Adds $4200.00. Confirmed in writing 2026-10-20 by J. Ortiz: "UL systems per 07 84 00"', adjustment: 4200, resolved: true, adjustmentApproved: true });
assert.deepEqual(partial.bidders[0].responses.s2, bidders[0].responses.s2, "Unanswered lines change nothing");

state = C.answerLine(state, "cl-1", "s2", { kind: "excluded", amount: null, note: "" }, "J. Ortiz", at);
assert.equal(state[0].status, "answered");
const applied = C.applyClarification(bidders, state[0], at);
assert.equal(applied.request.status, "applied");
assert.deepEqual([applied.bidders[0].responses.s2.status, applied.bidders[0].responses.s2.resolved, applied.bidders[0].responses.s2.note], ["N", false, "Excluded. Confirmed in writing 2026-10-20 by J. Ortiz"], "Excluded stays a gap for the plug or another trade");
assert.equal(applied.bidders[1], bidders[1], "Other bidders untouched");
assert.deepEqual(C.draftClarifications({ packageId: "drywall", trade: "Drywall", items, bidders: applied.bidders, open: [applied.request], at, newId }).map(d => [d.bidder, d.lines.map(l => l.scopeItemId)]),
  [["Metro Interiors", ["s3"]]], "A confirmed exclusion is not asked again by itself");

// Included closes the gap.
let m = C.sendClarification(drafts, "cl-2", "2026-10-23", at);
m = C.answerLine(m, "cl-2", "s3", { kind: "included", amount: null, note: "Deflection track is in our price" }, "K. Lee", at);
const metro = C.applyClarification(bidders, m[1], at);
assert.deepEqual([metro.bidders[1].responses.s3.status, metro.bidders[1].responses.s3.resolved], ["Y", true]);

console.log("Clarifications checked: gaps per bidder, no repeats, letter from the bid and the documents only, sending, answers (included / add / excluded), overdue, applying into leveling.");

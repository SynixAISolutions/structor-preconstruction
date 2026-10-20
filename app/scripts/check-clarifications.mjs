import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/clarifications.ts");
process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "test-blob-token";
const L = await import("../lib/portal-links.ts");

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
  { id: "b1", name: "Capitol Drywall", contact: "", baseBid: 1_250_000, responses: { s1: r("N", "Firestopping by others", { adjustment: 6000, adjustmentApproved: true }), s2: r("P", "Level 4 at lobby only"), s3: r("Y"), s4: r("N") } },
  { id: "b2", name: "Metro Interiors", contact: "", baseBid: 1_310_000, responses: { s1: r("Y"), s2: r("Y"), s3: r("", "") } },
  { id: "b3", name: "Late Bidder", contact: "", baseBid: null, responses: {} },
  { id: "b4", name: "Resolved Co", contact: "", baseBid: 1_400_000, responses: { s1: r("N", "", { resolved: true }), s2: r("Y"), s3: r("Y") } },
];
const base = { projectId: "jelleff", projectName: "Jelleff Recreation Center", packageId: "drywall", trade: "Drywall", items, bidders, at, newId };

// Gaps: required items excluded, partial or unanswered, not already resolved. No bid yet, no request.
const drafts = C.draftClarifications({ ...base, open: [] });
assert.deepEqual(drafts.map(d => [d.bidder, d.lines.map(l => l.scopeItemId), d.version, d.baseBid]), [["Capitol Drywall", ["s1", "s2"], 0, 1_250_000], ["Metro Interiors", ["s3"], 0, 1_310_000]]);
assert.deepEqual(C.draftClarifications({ ...base, open: drafts }), [], "A gap already asked is not asked again");
assert.equal(C.draftClarifications({ ...base, open: [{ ...drafts[0], status: "cancelled" }] }).find(d => d.bidderId === "b1").lines.length, 2, "A cancelled request can be asked again");

// The letter quotes the bid and the requirement; nothing else.
const letter = C.clarificationLetter({ ...drafts[0], dueAt: "2026-10-23" });
assert.match(letter, /^Jelleff Recreation Center: Drywall\. Clarification of your proposal\n\nTo Capitol Drywall,/);
assert.match(letter, /1\. 1 Firestopping at rated partitions \(07 84 00\)\. Your proposal excludes it: "Firestopping by others"\. The bid documents require it: Manual p\. 512, 07 84 00 §1\.2\./);
assert.match(letter, /2\. 2 Level 4 finish at back of house \(09 29 00\)\. Your proposal includes it only in part: "Level 4 at lobby only"/);
assert.match(C.clarificationLetter(drafts[1]), /does not say whether it is included/);

// Drafts from the browser are parsed strictly.
assert.deepEqual(C.parseDraftRequest({ ...drafts[0], status: "applied", version: 9, history: [{ what: "x" }], lines: drafts[0].lines.map(l => ({ ...l, answer: { kind: "included" } })) }), drafts[0], "Status, version, history and answers can't be smuggled in");
assert.throws(() => C.parseDraftRequest({ ...drafts[0], id: "../x" }), /invalid id/);
assert.throws(() => C.parseDraftRequest({ ...drafts[0], lines: [] }), /no items/);
assert.throws(() => C.parseDraftRequest({ ...drafts[0], lines: [drafts[0].lines[0], drafts[0].lines[0]] }), /twice/);

// Sending, answering, cancelling; each change raises the version.
let req = drafts[0];
assert.throws(() => C.answerClarification(req, [{ scopeItemId: "s1", kind: "included", amount: null, note: "" }], "x", at), /not open/);
assert.throws(() => C.sendClarification(req, { name: "J", email: "nope" }, "2026-10-23", "Marcel", at), /email/);
assert.throws(() => C.sendClarification(req, { name: "J", email: "j@capitol.test" }, "2026-10-19", "Marcel", at), /from today/);
req = C.sendClarification(req, { name: "J. Ortiz", email: "j@capitol.test" }, "2026-10-23", "Marcel", at);
assert.deepEqual([req.status, req.version, req.recipient, req.history.at(-1).what], ["sent", 1, { name: "J. Ortiz", email: "j@capitol.test" }, "Sent to j@capitol.test, reply by 2026-10-23"]);
assert.throws(() => C.sendClarification(req, { name: "J", email: "j@capitol.test" }, "2026-10-23", "Marcel", at), /already sent/);
assert.equal(C.isOverdue(req, "2026-10-24"), true);
assert.throws(() => C.answerClarification(req, [{ scopeItemId: "s1", kind: "add", amount: 0, note: "" }], "x", at), /amount to add/);
assert.throws(() => C.answerClarification(req, [{ scopeItemId: "s1", kind: "included", amount: 5, note: "" }], "x", at), /Only an addition/);
assert.throws(() => C.answerClarification(req, [{ scopeItemId: "s9", kind: "included", amount: null, note: "" }], "x", at), /not in this request/);
assert.throws(() => C.answerClarification(req, [{ scopeItemId: "s1", kind: "maybe", amount: null, note: "" }], "x", at), /Included, Add or Excluded/);
assert.throws(() => C.answerClarification(req, [], "x", at), /at least one/);
req = C.answerClarification(req, [{ scopeItemId: "s1", kind: "add", amount: "4200.004", note: "UL systems per 07 84 00" }], "J. Ortiz", at);
assert.deepEqual([req.status, req.version, req.lines[0].answer.amount], ["sent", 2, 4200], "One of two lines answered; amounts to the cent");

// The sub's view leaves out the GC's history.
assert.equal("history" in C.portalView(req), false);
assert.equal(C.portalView(req).version, 2);

// Applying: answered, current lines only; a second apply changes nothing; a stale line is skipped.
const first = C.applyClarification(bidders, req, "Marcel", at);
assert.deepEqual([first.applied, first.skipped, first.request.status], [["s1"], ["s2"], "sent"]);
assert.deepEqual(first.bidders[0].responses.s1, { status: "P", note: 'Adds $4200.00. Confirmed in writing 2026-10-20 by J. Ortiz: "UL systems per 07 84 00"', adjustment: 4200, adjustmentApproved: true, resolved: true }, "The sub's amount replaces the $6,000 plug");
assert.deepEqual(first.bidders[0].responses.s2, bidders[0].responses.s2, "Unanswered lines change nothing");
assert.equal(first.bidders[1], bidders[1], "Other bidders untouched");
const again = C.applyClarification(first.bidders, first.request, "Marcel", at);
assert.deepEqual([again.applied, again.bidders === first.bidders, again.request === first.request], [[], true, true], "A second apply changes nothing");

let rest = C.answerClarification(first.request, [{ scopeItemId: "s2", kind: "excluded", amount: null, note: "" }], "J. Ortiz", at);
assert.equal(rest.status, "answered");
const edited = first.bidders.map(b => b.id === "b1" ? { ...b, responses: { ...b.responses, s2: r("P", "Revised bid: level 4 at lobby and gym") } } : b);
assert.deepEqual(C.staleLines(rest, edited), { lines: ["s2"], baseBidChanged: false }, "The estimator changed s2 after the request was drafted");
assert.deepEqual(C.applyClarification(edited, rest, "Marcel", at).skipped, ["s2"], "A stale line is not applied blindly");
const done = C.applyClarification(first.bidders, rest, "Marcel", at);
assert.deepEqual([done.applied, done.request.status, done.bidders[0].responses.s2.status, done.bidders[0].responses.s2.resolved], [["s2"], "applied", "N", false], "Excluded stays a gap for the plug or another trade");
assert.equal(C.staleLines(rest, bidders.map(b => b.id === "b1" ? { ...b, baseBid: 1_200_000 } : b)).baseBidChanged, true);
assert.throws(() => C.answerClarification({ ...done.request, status: "answered" }, [{ scopeItemId: "s1", kind: "included", amount: null, note: "" }], "x", at), /already applied/);

// The server's record of an apply done in the browser: only answered, unapplied lines; repeat-safe.
const marked = C.markLinesApplied(rest, ["s1", "s2", "s9"], "Marcel", at);
assert.deepEqual([marked.lines.map(l => !!l.appliedAt), marked.status], [[true, true], "applied"]);
assert.equal(C.markLinesApplied(marked, ["s1", "s2"], "Marcel", at), marked);
assert.throws(() => C.cancelClarification(marked, "Marcel", at), /already closed/);
assert.equal(C.cancelClarification(drafts[1], "Marcel", at).status, "cancelled");
assert.throws(() => C.applyClarification(bidders, C.cancelClarification(drafts[1], "Marcel", at), "Marcel", at), /cancelled/);

// Signed portal links: one request, one bidder, expiring, tamper-proof.
const now = new Date(at);
const token = L.issuePortalToken({ projectId: "jelleff", requestId: "cl-1", bidderId: "b1" }, 30, now);
assert.deepEqual(L.verifyPortalToken(token, now), { projectId: "jelleff", requestId: "cl-1", bidderId: "b1", expiresAt: "2026-11-19T14:00:00.000Z" });
assert.equal(L.verifyPortalToken(token, new Date("2026-11-20T00:00:00Z")), null, "Expired");
const [payload, sig] = token.split(".");
const forged = Buffer.from(JSON.stringify({ p: "jelleff", r: "cl-1", b: "b2", e: "2027-01-01T00:00:00.000Z" })).toString("base64url");
assert.equal(L.verifyPortalToken(`${forged}.${sig}`, now), null, "Another bidder's claim with this signature is refused");
assert.equal(L.verifyPortalToken(`${payload}.${sig.slice(0, -2)}xx`, now), null);
for (const bad of [null, "", "abc", `${payload}.${sig}.x`]) assert.equal(L.verifyPortalToken(bad, now), null);
assert.throws(() => L.issuePortalToken({ projectId: "../x", requestId: "cl-1", bidderId: "b1" }), /unsafe/);

const { strongEtag } = await import("../lib/clarification-store.ts");
assert.equal(strongEtag('W/"88572374b7"'), '"88572374b7"', "The server's read can carry a weak ETag; the conditional write needs the strong one (19 Oct: every apply got 409)");
assert.equal(strongEtag('"abc"'), '"abc"');

console.log("Clarifications checked: gaps per bidder, no repeats, letter from the bid and the documents only, strict draft parsing, send / answer / cancel with versions, stale lines, repeat-safe apply replacing the plug, the server's apply record, signed portal links.");

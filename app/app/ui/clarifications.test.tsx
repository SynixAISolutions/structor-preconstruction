import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClarificationRequest } from "../../lib/clarifications";
import type { LevelingBidder } from "../../lib/leveling-import";
require.extensions[".css"] = () => {};
const { ApplyClarificationPreview } = require("./clarifications") as typeof import("./clarifications");
const { PortalQuestion } = require("./clarification-portal") as typeof import("./clarification-portal");

const request: ClarificationRequest = {
  id: "test", projectId: "test-project", projectName: "Test project", packageId: "drywall", trade: "Drywall", bidderId: "rock", bidder: "Rock Creek", baseBid: 100000,
  recipient: { name: "Test", email: "test@example.com" }, status: "sent", createdAt: "2026-10-20T00:00:00Z", sentAt: "2026-10-20T00:00:00Z", dueAt: "2026-10-21", appliedAt: null, version: 2, history: [],
  lines: [{ scopeItemId: "fire", number: "1", item: "Firestopping", section: "07 84 00", requirement: "Spec page 42", bid: { status: "N", note: "By others" }, answer: { kind: "add", amount: 4200.75, note: "All penetrations", by: "Test sub", at: "2026-10-20T00:01:00Z" }, appliedAt: null }],
};
const bidders: LevelingBidder[] = [{ id: "rock", name: "Rock Creek", contact: "", baseBid: 100000, responses: { fire: { status: "N", note: "By others", adjustment: 8000 } } }];
const preview = (r = request, b = bidders) => renderToStaticMarkup(<ApplyClarificationPreview request={r} bidders={b}/>);

test("apply preview shows the exact replacement amount, current plug and written evidence", () => {
  const html = preview();
  for (const text of ["$4,200.75", "$8,000.00", "P · $4,200.75 · Resolved", "Answered", "Test sub", "Spec page 42"]) assert.ok(html.includes(text), text);
  assert.equal(bidders[0].responses.fire.adjustment, 8000);
});
test("included removes the plug; excluded keeps it unresolved", () => {
  const included = { ...request, lines: [{ ...request.lines[0], answer: { ...request.lines[0].answer!, kind: "included" as const, amount: null } }] };
  assert.match(preview(included), /Y · \$0.00 · Resolved/);
  assert.match(preview({ ...included, lines: [{ ...included.lines[0], answer: { ...included.lines[0].answer!, kind: "excluded" } }] }), /N · \$8,000.00 · Unresolved; plug kept/);
});
test("changed response and base price show warnings and no promised application", () => {
  assert.match(preview(request, [{ ...bidders[0], responses: { fire: { ...bidders[0].responses.fire, note: "Revised bid" } } }]), /This line will be skipped/);
  const html = preview(request, [{ ...bidders[0], baseBid: 120000 }]);
  assert.match(html, /base bid changed/); assert.match(html, /Applying is blocked/); assert.match(html, /No change/);
});
test("already applied and unanswered lines preview no change", () => {
  assert.match(preview({ ...request, lines: [{ ...request.lines[0], appliedAt: "2026-10-20" }] }), /Applied/);
  assert.match(preview({ ...request, lines: [{ ...request.lines[0], appliedAt: "2026-10-20" }] }), /No change/);
  assert.match(preview({ ...request, lines: [{ ...request.lines[0], answer: null }] }), /Awaiting answer/);
});
test("portal question has named controls, cited requirement and decimal money validation", () => {
  const html = renderToStaticMarkup(<PortalQuestion line={request.lines[0]} value={{ kind: "add", amount: "4200.75", note: "All penetrations" }} disabled={false} onChange={() => {}}/>);
  for (const text of ["<legend>", "Your proposal said", "By others", "Spec page 42", "Included", "Add $", "Excluded", 'step="0.01"', 'min="0.01"', 'maxLength="1000"']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("8000")); assert.ok(!html.includes("100000")); assert.ok(!html.includes("test@example.com"));
});
test("applied portal question locks the answer and explains how to request a change", () => {
  const html = renderToStaticMarkup(<PortalQuestion line={{ ...request.lines[0], appliedAt: "2026-10-20" }} value={{ kind: "add", amount: "4200.75", note: "" }} disabled={false} onChange={() => {}}/>);
  assert.match(html, /fieldset[^>]+disabled/); assert.match(html, /Contact them to change this answer/);
});

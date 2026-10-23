import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TODO_GROUPS, type TodoSummary, type TodoTask } from "../../lib/todo";
import type { BidSheetSummary } from "../../lib/bid-sheet-summary";
require.extensions[".css"] = () => {};
const { TodoSteps } = require("./todo-ui") as typeof import("./todo-ui");
const { BidSheetTable, LevelingHome, LevelingViews } = require("./leveling-home") as typeof import("./leveling-home");
const { GapQuantityProposal } = require("./bid-gap-cost") as typeof import("./bid-gap-cost");

const rfi: TodoTask = { id: "rfis:review", group: "rfis", title: "Review RFIs", detail: "RFI deadline: 2026-01-20", status: "todo", priority: "high", screen: "checks", packageId: null, refs: {}, count: 1 };
const todo: TodoSummary = { groups: TODO_GROUPS.map(g => ({ ...g, todo: g.group === "rfis" ? 1 : 0, waiting: g.group === "rfis" ? 1 : 0 })), tasks: [rfi, { ...rfi, id: "rfis:waiting", title: "Await answers", status: "waiting" }], packages: [], project: [], progress: { done: 0, total: 4, percent: 0 } };

test("nine numbered steps stay in contract order, collapsed and filtered by task status", () => {
  const html = renderToStaticMarkup(<TodoSteps summary={todo} filter="My actions" navigate={() => {}}/>);
  assert.equal((html.match(/class="todo-step"/g) ?? []).length, 9);
  let previous = -1;
  for (const g of TODO_GROUPS) { const i = html.indexOf(g.label.replaceAll("&", "&amp;")); assert.ok(i > previous, g.label); previous = i; }
  assert.doesNotMatch(html, /<details[^>]* open|New project|Await answers/);
  assert.match(html, /Review RFIs/); assert.match(html, /RFI deadline: 2026-01-20/);
  const waiting = renderToStaticMarkup(<TodoSteps summary={todo} filter="Waiting" navigate={() => {}}/>);
  assert.match(waiting, /Await answers/); assert.doesNotMatch(waiting, /Review RFIs/);
});

const summary: BidSheetSummary = { rows: [
  { packageId: "concrete", code: "03 30 00", trade: "Concrete", owner: "Safi", budget: 1700000, carried: { packageId: "concrete", bidderId: "a", submissionId: "bid", name: "Low sub", value: 1685000, basis: "base" }, delta: -15000, perSquareFoot: 25, bids: [{ packageId: "concrete", bidderId: "a", submissionId: "bid", name: "Low sub", value: 1685000, basis: "base" }] },
  { packageId: "asphalt", code: "32 12 16", trade: "Asphalt", owner: "", budget: null, carried: null, delta: null, perSquareFoot: null, bids: [] },
], total: { budget: 1700000, carried: 1685000, delta: -15000, perSquareFoot: 25 }, withoutBids: 1 };

test("bid sheet retains trades without bids, shared-budget explanation, basis and totals", () => {
  const html = renderToStaticMarkup(<BidSheetTable summary={summary} onOpen={() => {}}/>);
  for (const text of ["$1,685,000", "Low sub", "Base bid · needs leveling", "Asphalt", "No bids yet", "site trades share", "Total", "Cost/SF"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("trade tiles show bid and leveling counts, award status and a keyboard tab stop", () => {
  const html = renderToStaticMarkup(<LevelingHome summary={summary} awarded={["concrete"]} ready tab="Trade packages" onTab={() => {}} onOpen={() => {}}/>);
  for (const text of ["Awarded", "Awaiting bids", "bids in", "leveled", "Concrete", "Asphalt"]) assert.ok(html.includes(text), text);
  const tabs = renderToStaticMarkup(<LevelingViews value="Bid sheet summary" onChange={() => {}}/>);
  assert.equal((tabs.match(/tabindex="0"/g) ?? []).length, 1);
  assert.match(tabs, /aria-controls="leveling-view"/);
});

test("unpriced takeoffs propose a sourced quantity without presenting zero as a unit price", () => {
  const item = { id: "gap", description: "Missing slab finish" };
  const suggestion = { gapId: item.id, referenceId: "takeoff", item: "Slab finish", quantity: 3000, unit: "SF", rate: 0, amount: 0, priced: false, source: "Quantity takeoff (not reviewed) · S101", explanation: "Review the missing portion." };
  const html = renderToStaticMarkup(<GapQuantityProposal item={item} suggestion={suggestion} onUse={() => {}}/>);
  for (const text of ["3,000 SF", "not reviewed", "S101", "Review the missing portion", "Plug it"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /\$0|Saved unit price|Apply approved/);
  const missing = renderToStaticMarkup(<GapQuantityProposal item={item} onUse={() => {}}/>);
  assert.match(missing, /No matching takeoff line found/); assert.doesNotMatch(missing, /Plug it/);
});

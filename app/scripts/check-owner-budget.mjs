import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const O = await import("../lib/owner-budget.ts");
const B = await import("../lib/budget.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// The owner's budget, read from its file (Marcel, 24 Oct: "the budget upload is optional and the AI extracts from it").

// ── The quote carries the amount ──
assert(O.quoteHasAmount("03 Concrete $1,250,000", 1250000), "Printed with commas and a dollar sign");
assert(O.quoteHasAmount("General conditions 412,500.50", 412500.5), "With cents");
assert(O.quoteHasAmount("Concrete ($000) 1,250", 1250000), "A table stated in thousands");
assert(!O.quoteHasAmount("Concrete $1,200,000", 1250000), "A different amount");

// ── The AI's lines are screened: on the page, with the amount, once ──
const J = EXTRA_JOBS["budget-lines"];
const input = J.parse({ pages: [{ page: 1, text: "DD Budget\n03 Concrete $1,250,000\n09 Finishes $980,000\nGeneral Conditions $412,500\nSubtotal $2,642,500" }, { page: 2, text: "" }] });
assert.equal(input.pages.length, 1, "Empty pages aren't sent");
assert.throws(() => J.parse({ pages: [] }), /budget's pages/);
const out = J.screen({ lines: [
  { description: "Concrete", csiCode: "03", classification: "direct", amount: 1250000, page: 1, quote: "03 Concrete $1,250,000" },
  { description: "Concrete", csiCode: "03", classification: "direct", amount: 1250000, page: 1, quote: "03 Concrete $1,250,000" },
  { description: "Finishes", csiCode: "9", classification: "direct", amount: 980000, page: 1, quote: "09 Finishes $980,000" },
  { description: "General conditions", csiCode: null, classification: "indirect", amount: 412500, page: 1, quote: "General Conditions $412,500" },
  { description: "Masonry", csiCode: "04", classification: "direct", amount: 300000, page: 1, quote: "04 Masonry $300,000" },
  { description: "Electrical", csiCode: "26", classification: "direct", amount: 900000, page: 1, quote: "09 Finishes $980,000" },
  { description: "Steel", csiCode: "05", classification: "maybe", amount: 5, page: 1, quote: "03 Concrete $1,250,000" },
] }, input).lines;
assert.deepEqual(out.map(l => [l.description, l.csiCode, l.amount]), [["Concrete", "03", 1250000], ["Finishes", null, 980000], ["General conditions", null, 412500]],
  "Once each, quote on the page, amount in the quote, a known type; an unclear CSI code is dropped, not guessed");

// ── Into the budget: matching lines take the amount, the rest are added ──
const by = "Marcel Khoury", at = "2026-11-03T10:00:00.000Z";
let state = { lines: [], allowances: [], costCenters: [{ name: "Base building", squareFeet: 20000 }] };
state = B.addBudgetLine(state, { costCenter: "Base building", classification: "direct", csiCode: "03 30 00", description: "Cast-in-place concrete", budget: 1000000 }, by, at);
state = B.addBudgetLine(state, { costCenter: "Base building", classification: "indirect", csiCode: null, description: "General Conditions", budget: 0 }, by, at);
state = B.addBudgetLine(state, { costCenter: "Base building", classification: "direct", csiCode: "09", description: "Painting", budget: 50000 }, by, at);
assert.equal(O.matchBudgetLine(state.lines, out[0]).description, "Cast-in-place concrete", "Same CSI division and a word in common");
assert.equal(O.matchBudgetLine(state.lines, out[2]).description, "General Conditions", "The same description");
assert.equal(O.matchBudgetLine(state.lines, { ...out[1], csiCode: "09" }), null, "Same division but nothing in common: not Painting");
const applied = O.applyOwnerBudget(state, out, "Base building", by, at);
assert.deepEqual([applied.updated, applied.added], [2, 1]);
assert.deepEqual(applied.state.lines.map(l => [l.description, l.budget, l.status]), [["Cast-in-place concrete", 1250000, "draft"], ["General Conditions", 412500, "draft"], ["Painting", 50000, "draft"], ["Finishes", 980000, "draft"]],
  "Two lines filled, Finishes added in the chosen cost center, Painting untouched");
assert.equal(applied.state.lines.at(-1).costCenter, "Base building");
assert.equal(O.applyOwnerBudget(applied.state, out, "Base building", by, at).updated, 0, "Applying the same lines again changes nothing");
assert.equal(O.applyOwnerBudget(applied.state, out, "Base building", by, at).added, 0);

console.log("Owner's budget checked: amounts found in their quotes, the AI's lines screened, matching budget lines filled and new ones added.");

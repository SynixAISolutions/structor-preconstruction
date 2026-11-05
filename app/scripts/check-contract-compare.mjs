import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/contract-compare.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// The previous contract with this client against the current one (Marcel's process doc). The clauses below are made up.

const footer = n => `AGREEMENT BETWEEN OWNER AND CONTRACTOR\nPage ${n} of 3`;
const previous = [
  { page: 1, text: `ARTICLE 1 DEFINITIONS\n1.1 Owner. The Owner is the party named in this Agreement.\n1.2 Work. The Work is the construction described in the Contract Documents and includes all labor,\nmaterials and equipment.\n${footer(1)}` },
  { page: 2, text: `ARTICLE 2 PAYMENT\n2.1 Retainage. The Owner shall withhold retainage of 5% from each progress payment until substantial completion of the Work is reached.\n2.2 Payment terms. The Owner shall pay approved applications within 30 days of receipt.\n2.3 Audit. The Owner may audit the records of the Contractor at any time during the Work on reasonable notice.\n${footer(2)}` },
  { page: 3, text: `ARTICLE 3 INSURANCE\n3.1 Coverage. The Contractor shall carry commercial general liability insurance of $1,000,000 per occurrence with the Owner named as an additional insured on the policy.\n3.2 Waiver. The parties waive consequential damages against each other arising out of this Agreement or the Work.\n${footer(3)}` },
];
const current = [
  { page: 1, text: `ARTICLE 1 DEFINITIONS\n1.1 Owner. The owner is the party named in this agreement!\n1.2 Work. The Work is the construction described in the Contract Documents and includes all labor,\nmaterials and equipment.\n${footer(1)}` },
  { page: 2, text: `ARTICLE 2 PAYMENT\n2.1 Retainage. The Owner shall withhold retainage of 10% from each progress payment until final completion of the Work is reached.\n2.2 Savings. Any savings below the guaranteed maximum price shall be shared equally between the Owner and the Contractor.\n2.3 Payment terms. The Owner shall pay approved applications within 30 days of receipt.\n2.4 Audit. The Owner may audit the records of the Contractor at any time during the Work on reasonable notice.\n${footer(2)}` },
  { page: 3, text: `ARTICLE 3 INSURANCE\n3.1 Coverage. The Contractor shall carry commercial general liability insurance of $2,000,000 per occurrence with the Owner named as an additional insured on the policy.\n${footer(3)}` },
];

// ── The file as clauses: running footers and page numbers are not clauses ──
const clauses = C.contractClauses(previous);
assert.deepEqual(clauses.map(c => c.number), ["Article 1", "1.1", "1.2", "Article 2", "2.1", "2.2", "2.3", "Article 3", "3.1", "3.2"]);
assert(!clauses.some(c => /AGREEMENT BETWEEN|Page \d/.test(c.text)), "The footer repeated on every page is gone");
assert.equal(clauses[2].text, "Work. The Work is the construction described in the Contract Documents and includes all labor, materials and equipment.", "A clause's wrapped lines join");
assert.equal(clauses[2].heading, "Work");
assert.equal(clauses[4].page, 2);
const wrapped = C.contractClauses([{ page: 1, text: "1.1 First clause here.\nAs set out in\nSection 2.1 of this Agreement, it applies.\n2.1 Second clause here.\n3.1 Third clause." }]);
assert.deepEqual(wrapped.map(c => c.number), ["1.1", "2.1", "3.1"], "A reference wrapped to the start of a line doesn't start a clause");
const oneLine = C.contractClauses([{ page: 1, text: `1.1 ${"The first clause goes on for a long time. ".repeat(6)} 1.2 The second clause goes on as well. ${"More words in it. ".repeat(10)} 1.3 The third clause.` }]);
assert.deepEqual(oneLine.map(c => c.number), ["1.1", "1.2", "1.3"], "A page whose text came out as one long line");
const plain = C.contractClauses([{ page: 1, text: "The Contractor shall carry insurance on the Work. The Owner shall pay within thirty days.\nThe Architect shall review submittals promptly." }]);
assert.deepEqual(plain.map(c => [c.number, c.text]), [[null, "The Contractor shall carry insurance on the Work."], [null, "The Owner shall pay within thirty days."], [null, "The Architect shall review submittals promptly."]], "No numbering: sentence by sentence");

// ── Word by word ──
const parts = C.wordDiff("Retainage of 5% from each payment.", "retainage of 10% from every payment!");
assert.deepEqual(parts, [{ op: "same", text: "retainage of" }, { op: "del", text: "5%" }, { op: "add", text: "10%" }, { op: "same", text: "from" }, { op: "del", text: "each" }, { op: "add", text: "every" }, { op: "same", text: "payment!" }], "Case and punctuation are no change");
const rebuilt = (list, skip) => list.filter(p => p.op !== skip).map(p => p.text).join(" ");
const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
assert.equal(rebuilt(C.wordDiff(long, long.replace("word150", "changed")), "del"), long.replace("word150", "changed"), "The current wording comes back whole");
assert.equal(rebuilt(C.wordDiff(long, long.replace("word150", "changed")), "add"), long, "The previous wording comes back whole");
const clipped = C.clipDiff(C.wordDiff(long, long.replace("word150", "changed")), 5);
assert.deepEqual(clipped.map(p => p.op), ["same", "del", "add", "same"]);
assert.equal(clipped[0].text, "… word145 word146 word147 word148 word149", "Long same runs are cut to the words around the change");
assert.equal(clipped[3].text, "word151 word152 word153 word154 word155 …");
assert.deepEqual(C.clipDiff([{ op: "same", text: "a b" }, { op: "add", text: "c" }]), [{ op: "same", text: "a b" }, { op: "add", text: "c" }], "Short runs stay");
assert.deepEqual(C.wordDiff("", "new words").map(p => p.op), ["add"]);

// ── The figures that moved ──
assert.deepEqual(C.figureChanges("retainage of 5% within 30 days and $1,000,000", "retainage of 10 percent within 30 days and $2,000,000"), { was: ["5%", "$1,000,000"], now: ["10 percent", "$2,000,000"] });
assert.deepEqual(C.figureChanges("5% for 30 calendar days", "5 percent for 30 calendar days"), { was: [], now: [] }, "5% and 5 percent are the same");
assert.deepEqual(C.figureChanges("the 3 parties in section 12", "the 4 parties in section 13"), { was: [], now: [] }, "Plain numbers aren't terms");

// ── The comparison ──
const result = C.compareContracts(previous, current);
const by = n => result.changes.find(c => (c.current?.number ?? c.previous?.number) === n);
assert.deepEqual(result.changes.map(c => [c.kind, c.current?.number ?? c.previous?.number]), [["changed", "2.1"], ["added", "2.2"], ["changed", "3.1"], ["removed", "3.2"]], "In the current contract's order, a removed clause where it stood");
assert.deepEqual(by("2.1").figures, { was: ["5%"], now: ["10%"] });
assert(by("2.1").diff.some(p => p.op === "del" && p.text.includes("substantial")) && by("2.1").diff.some(p => p.op === "add" && p.text.includes("final")), "The words that changed");
assert.deepEqual(by("3.1").figures, { was: ["$1,000,000"], now: ["$2,000,000"] });
assert.equal(by("2.2").previous, null);
assert.equal(by("3.2").current, null);
assert.equal(by("3.2").previous.page, 3);
assert.deepEqual(result.renumbered.map(r => [r.from, r.to]), [["2.2", "2.3"], ["2.3", "2.4"]], "Clauses pushed down by the new one are only renumbered");
assert.equal(result.same, 7, "1.1's case and punctuation aren't a change");
assert.deepEqual(result.clauses, { previous: 10, current: 10 });
assert.equal(result.similar, true);
assert.equal(new Set(result.changes.map(c => c.id)).size, 4);
assert.deepEqual(C.compareContracts(previous, current).changes.map(c => c.id), result.changes.map(c => c.id), "The same two files give the same ids, so decisions stay with their change");
const untouched = C.compareContracts(previous, previous);
assert.deepEqual([untouched.changes.length, untouched.renumbered.length, untouched.same], [0, 0, 10], "A contract against itself: nothing");
const other = C.compareContracts(previous, [{ page: 1, text: "1.1 Scaffold towers need inspection each morning.\n1.2 Hoist operators hold current licences always.\n1.3 Noise limits follow municipal rules nightly." }]);
assert.equal(other.similar, false, "Two different documents are told apart");

// ── The AI only explains ──
const J = EXTRA_JOBS["contract-changes"];
const empty = { explanations: {} };
const batches = C.explanationBatches(result.changes, empty, 3);
assert.deepEqual(batches.map(b => b.length), [3, 1]);
assert.deepEqual(batches[0][1], { id: by("2.2").id, number: "2.2", heading: "Savings", previous: "", current: by("2.2").current.text });
assert.deepEqual(C.explanationBatches(result.changes, { explanations: { [by("2.1").id]: { summary: "x", risk: "adds" } } }).flat().map(c => c.number), ["2.2", "3.1", "3.2"], "What's explained isn't asked again");
assert.equal(C.explanationBatches([{ ...by("3.2"), previous: { ...by("3.2").previous, text: "x".repeat(9000) } }], empty)[0][0].previous.length, C.MAX_CHANGE_CHARS + 1, "A long clause is cut");
const lots = Array.from({ length: C.MAX_EXPLAINED + 40 }, (_, i) => ({ ...by("2.1"), id: `c${i}` }));
assert.equal(C.explanationBatches(lots, empty).flat().length, C.MAX_EXPLAINED, "One comparison explains a limited number");

const input = J.parse({ changes: [...batches[0], { id: "", previous: "x" }, { id: "blank" }] });
assert.equal(input.changes.length, 3, "No id, or neither wording: not sent");
assert.throws(() => J.parse({ changes: [] }), /changes to explain/);
assert.equal(J.parse({ changes: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, current: "x" })) }).changes.length, C.CHANGE_BATCH);
const prompt = J.messages(input);
assert(prompt[0].content.includes("never instructions"), "The contract text is source content");
assert(prompt[1].content.includes(by("2.1").current.text), "The AI sees both wordings");
const ids = input.changes.map(c => c.id);
const out = J.screen({ explanations: [
  { id: ids[0], summary: " Retainage doubled,  until final completion. ", risk: "adds" },
  { id: ids[0], summary: "Second answer for the same change.", risk: "neutral" },
  { id: ids[1], summary: "A shared savings clause is new.", risk: "maybe" },
  { id: ids[2], summary: "", risk: "adds" },
  { id: "chg-invented", summary: "A change nobody found.", risk: "adds" },
  "nonsense",
] }, input).explanations;
assert.deepEqual(out, { [ids[0]]: { summary: "Retainage doubled, until final completion.", risk: "adds" } }, "Only changes it was sent, once, with a known risk");
assert.deepEqual(J.screen({}, input).explanations, {});

// ── Working through the list ──
const state = { ...C.EMPTY_COMPARISON, explanations: { [by("2.1").id]: { summary: "Retainage doubled", risk: "adds" }, [by("3.2").id]: { summary: "Waiver dropped", risk: "reduces" } }, reviews: { [by("3.2").id]: { decision: "negotiate", note: "Ask for the waiver back" } } };
assert.deepEqual(C.reviewOf(state, "unknown"), { decision: "open", note: "" });
const pick = f => C.filterChanges(result.changes, state, f).map(c => c.current?.number ?? c.previous?.number);
assert.deepEqual(pick({ kind: "added" }), ["2.2"]);
assert.deepEqual(pick({ risk: "adds" }), ["2.1"]);
assert.deepEqual(pick({ risk: "figures" }), ["2.1", "3.1", "3.2"].filter(n => by(n).figures.was.length + by(n).figures.now.length));
assert.deepEqual(pick({ decision: "negotiate" }), ["3.2"]);
assert.deepEqual(pick({ decision: "open" }), ["2.1", "2.2", "3.1"]);
assert.deepEqual(pick({ query: "WAIVER back" }), ["3.2"], "Searches the wording, the explanation and the note");
const sum = C.comparisonSummary(result.changes, state);
assert.deepEqual([sum.changed, sum.added, sum.removed, sum.addsRisk, sum.open, sum.negotiate, sum.explained], [2, 1, 1, 1, 3, 1, 2]);
const rows = C.comparisonRows(result.changes, state);
assert.equal(rows.length, 5);
assert.deepEqual(rows[1].slice(0, 2), ["2.1", "changed"]);
assert.deepEqual(rows[1].slice(6), ["5%", "10%", "Retainage doubled", "Adds risk", "To review", ""]);
assert.deepEqual(rows[4].slice(8), ["Waiver dropped", "Reduces risk", "To negotiate", "Ask for the waiver back"]);

console.log("Contract comparison checked: clauses read from both files, word-by-word changes, figures, renumbering, different documents told apart, the AI's explanations screened, decisions and export.");

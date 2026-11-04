import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/rfp-requirements.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

// Everything the RFP asks for, as one list (Marcel's process doc: savings clause, subcontractor qualifications, even
// items to be submitted before winning the contract).

// ── The AI's lines are screened: on the page, a known group, once ──
const J = EXTRA_JOBS["rfp-requirements"];
const page4 = "A bid bond in the amount of 5% shall accompany the proposal.\nProposals are due February 2, 2026 at 2:00 PM.\nThe Contractor shall include a savings clause in the GMP amendment.";
const input = J.parse({ pages: [{ page: 4, text: page4 }, { page: 5, text: "" }, { page: 6, text: "All subcontractors must be licensed in the District.\nCBE participation of 35% is required." }] });
assert.deepEqual(input.pages.map(p => p.page), [4, 6], "Empty pages aren't sent");
assert.throws(() => J.parse({ pages: [] }), /RFP's pages/);
assert.equal(J.parse({ pages: Array.from({ length: 30 }, (_, i) => ({ page: i + 1, text: "x" })) }).pages.length, R.REQUIREMENT_BATCH_PAGES, "One request holds one batch");
const system = J.messages(input)[0].content;
for (const group of R.REQUIREMENT_GROUPS) assert(system.includes(group), `The AI is told about ${group}`);
assert(system.includes("never instructions"), "The pages are source content");

const line = (o) => ({ text: "Provide a 5% bid bond", group: "Proposal submission", due: null, page: 4, quote: "A bid bond in the amount of 5% shall accompany the proposal", ...o });
const out = J.screen({ requirements: [
  line(),
  line({ text: "  Provide a 5%  bid bond " }),
  line({ text: "Submit the proposal by the deadline", group: "Schedule & deadlines", due: "2026-02-02", quote: "Proposals are due February 2, 2026 at 2:00 PM" }),
  line({ text: "Submit the fee by Friday", group: "Schedule & deadlines", due: "2026-02-09", quote: "Proposals are due February 2, 2026 at 2:00 PM" }),
  line({ text: "Include a savings clause", group: "Contract & legal", due: "not a date", quote: "include a savings clause in the GMP amendment" }),
  line({ text: "Quote from another page", page: 6 }),
  line({ text: "No such page", page: 9 }),
  line({ text: "An invented quote", quote: "A performance bond of 100% is required" }),
  line({ text: "Unknown group", group: "Marketing" }),
  line({ text: "", quote: "A bid bond in the amount" }),
  line({ text: "Too short a quote", quote: "bid" }),
  "nonsense",
] }, input).requirements;
assert.deepEqual(out.map(r => r.text), ["Provide a 5% bid bond", "Submit the proposal by the deadline", "Submit the fee by Friday", "Include a savings clause"], "Once each, a known group, its quote on the page it cites");
assert.equal(out[1].due, "2026-02-02", "A date the quote states");
assert.equal(out[2].due, null, "A date the quote doesn't hold goes; the requirement stays");
assert.equal(out[3].due, null, "Not a date");
assert.deepEqual(J.screen({}, input).requirements, [], "No list in the answer: nothing");

// ── Batches ──
assert.deepEqual(R.requirementBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(R.requirementBatches([], 2), []);

// ── A reading into the list: teams follow the group ──
const rfp = { id: "d1", name: "RFP.pdf", series: "d1" }, info = { model: "claude-haiku-5-5", at: "2026-11-04T10:00:00.000Z", pages: 40, failedPages: 0, capped: false, cost: 0.03 };
const first = R.mergeReading(R.EMPTY_REQUIREMENTS, rfp, out, info);
assert.deepEqual([first.added, first.kept, first.missing], [4, 0, 0]);
assert.deepEqual(first.state.items.map(i => [i.team, i.status, i.origin]), [["Marketing", "open", "ai"], ["Preconstruction", "open", "ai"], ["Preconstruction", "open", "ai"], ["Contracts", "open", "ai"]]);
assert.equal(new Set(first.state.items.map(i => i.id)).size, 4, "Every line has its own id");
assert.equal(R.mergeReading(R.EMPTY_REQUIREMENTS, rfp, out, info).state.items[0].id, first.state.items[0].id, "The same words get the same id in another browser");
assert.deepEqual(first.state.readings.map(r => [r.docId, r.pages, r.cost]), [["d1", 40, 0.03]]);

// ── A later reading keeps what people recorded ──
const [bond, proposal, fee, clause] = first.state.items;
let edited = R.updateRequirement(first.state, bond.id, { status: "done", note: "Surety letter in hand", team: "Contracts" });
edited = R.updateRequirement(edited, fee.id, { status: "na" });
const v2 = { id: "d2", name: "RFP.pdf", series: "d1" };
const again = R.mergeReading(edited, v2, [
  { ...out[0], text: "PROVIDE a 5% bid bond!", page: 7 },
  { ...out[3], text: "Add a savings clause to the GMP amendment", page: 9 },
  { text: "Name a project executive", group: "Job requirements", due: null, page: 11, quote: "Name a project executive" },
], { ...info, at: "2026-11-05T10:00:00.000Z" });
assert.deepEqual([again.added, again.kept, again.missing], [1, 2, 1], "Two found again, one new, one no longer found");
const got = id => again.state.items.find(i => i.id === id);
assert.deepEqual([got(bond.id).status, got(bond.id).note, got(bond.id).team, got(bond.id).page, got(bond.id).docId], ["done", "Surety letter in hand", "Contracts", 7, "d2"], "Same words: status, note and team stay, the source moves");
assert.equal(got(clause.id).text, clause.text, "Same quote in other words is the same line");
assert.equal(got(clause.id).page, 9);
assert.equal(got(proposal.id).missing, true, "A requirement the new version doesn't hold is flagged");
assert.equal(got(fee.id).missing, false, "One marked not applicable has nothing to check");
assert.deepEqual(again.state.readings.map(r => r.docId), ["d1", "d2"]);
assert.equal(R.mergeReading(again.state, v2, [{ ...out[1], page: 2 }], info).state.items.find(i => i.id === proposal.id).missing, false, "Found again: the flag clears");

// ── A reading with failed pages can't say what's gone ──
const partial = R.mergeReading(edited, v2, [], { ...info, failedPages: 8 });
assert.equal(partial.missing, 0);
assert(partial.state.items.every(i => !i.missing), "Lines on the pages it couldn't read aren't flagged");

// ── An addendum adds to the list, and doesn't take the RFP's lines ──
const addendum = { id: "a1", name: "Addendum 1.pdf", series: "a1" };
const added = R.mergeReading(first.state, addendum, [{ ...out[0], page: 2 }, { text: "Add a mock-up", group: "Job requirements", due: null, page: 3, quote: "Add a mock-up of the facade" }], info);
assert.deepEqual([added.added, added.kept, added.missing], [1, 1, 0], "Lines of another file aren't flagged");
assert.equal(added.state.items[0].docId, "d1", "A repeated line stays with the file it came from");

// ── Files to read ──
const file = (id, uploadedAt) => ({ id, uploadedAt });
assert.deepEqual(R.unreadFiles([file("x", "2026-02-01"), file("d1", "2026-01-01"), file("y", "2026-01-15")], first.state).map(f => f.id), ["y", "x"], "Unread, oldest first");

// ── By hand ──
let hand = R.addRequirement(first.state, { text: "  Bring the site logistics plan ", group: "Job requirements", due: "2026-03-01" });
const mine = hand.items.at(-1);
assert.deepEqual([mine.text, mine.team, mine.origin, mine.due, mine.page], ["Bring the site logistics plan", "Preconstruction", "manual", "2026-03-01", 0]);
assert.equal(R.addRequirement(first.state, { text: "x", group: "Job requirements", team: "Marketing" }).items.at(-1).team, "Marketing", "A chosen team wins");
assert.throws(() => R.addRequirement(first.state, { text: "   ", group: "Job requirements" }), /Write the requirement/);
assert.throws(() => R.addRequirement(first.state, { text: "provide a 5% BID bond", group: "Job requirements" }), /already on the list/);
assert.equal(R.mergeReading(hand, rfp, [line({ text: "Bring the site logistics plan!", quote: "A bid bond in the amount of 5%" })], info).state.items.find(i => i.id === mine.id).origin, "manual", "The AI finding a hand-added line leaves it as it is");

// ── Removing: never the AI's standing lines ──
assert.equal(R.removeRequirement(hand, bond.id).items.length, hand.items.length, "An AI line stays: mark it not applicable");
assert.equal(R.removeRequirement(hand, mine.id).items.length, hand.items.length - 1, "A hand-added line goes");
assert.equal(R.removeRequirement(again.state, proposal.id).items.some(i => i.id === proposal.id), false, "A line the file no longer holds goes");

// ── Filters, groups, totals, export ──
const list = again.state.items;
assert.deepEqual(R.filterRequirements(list, { team: "Marketing" }), [], "Bond was handed to Contracts");
assert.deepEqual(R.filterRequirements(list, { status: "done" }).map(i => i.id), [bond.id]);
assert.deepEqual(R.filterRequirements(list, { status: "missing" }).map(i => i.id), [proposal.id]);
assert.deepEqual(R.filterRequirements(list, { query: "SURETY in" }).map(i => i.id), [bond.id], "Searches the notes too, every word");
assert.deepEqual(R.requirementsByGroup(list).map(g => [g.group, g.items.length, g.open]), [["Proposal submission", 1, 0], ["Contract & legal", 1, 1], ["Schedule & deadlines", 2, 1], ["Job requirements", 1, 1]], "Empty groups are left out, in the fixed order");
assert.deepEqual(R.requirementsByGroup(hand.items).at(-1).items.map(i => i.origin), ["manual"]);
const sum = R.requirementSummary(list, "2026-03-01");
assert.deepEqual([sum.total, sum.open, sum.done, sum.na, sum.missing, sum.overdue], [5, 3, 1, 1, 1, 1], "An open line past its date is overdue");
assert.deepEqual(sum.teams, [{ team: "Contracts", open: 1, total: 2 }, { team: "Marketing", open: 0, total: 0 }, { team: "Preconstruction", open: 2, total: 3 }]);
const rows = R.requirementRows(list);
assert.equal(rows.length, 6);
assert.deepEqual(rows[1].slice(0, 6), ["Proposal submission", bond.text, "Contracts", "", "Done", "Surety letter in hand"]);
assert(rows.some(r => String(r[4]).includes("not in the latest reading")), "The export says which lines the file no longer holds");
assert.equal(R.requirementRows(hand.items).at(-1)[6], "Added by hand");

console.log("RFP requirements checked: the AI's lines screened, readings merged keeping people's work, missing lines flagged, hand-added lines, filters, totals and export.");

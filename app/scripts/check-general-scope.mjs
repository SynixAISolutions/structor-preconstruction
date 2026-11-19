// A trade's general scope (Marcel, 18 Nov meeting): a few general lines lumping its detailed items, each keeping the
// items it covers.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const G = await import("../lib/general-scope.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

const item = (id, title, packageId = "demo", allTrades = false) => ({ id, packageId, title, detail: "", source: "", origin: "ai", status: "draft", allTrades, history: [] });
const state = {
  packages: [{ id: "demo", name: "Demolition", division: "02", code: "02 41 19", owner: "", due: "" }, { id: "steel", name: "Structural steel", division: "05", code: "05 12 00", owner: "", due: "" }],
  scopes: [
    item("s1", "Remove aluminum windows, frames and sashes at level 1"), item("s2", "Remove aluminum windows, frames and sashes at level 2"),
    item("s3", "Abate asbestos-containing floor tile"), item("s4", "Raze the 1930s building including foundations"),
    item("s5", "Saw cut trenches for new utilities"), item("all", "Daily clean-up", "demo", true), item("x", "Steel columns", "steel"),
  ],
  invitations: [], outreach: [], notifications: [],
};

// The detailed items: the trade's own, not the all-trades General ones.
assert.deepEqual(G.generalItems(state, "demo").map(i => i.id), ["s1", "s2", "s3", "s4", "s5"]);
const input = G.generalScopeInput(state.packages[0], G.generalItems(state, "demo"));
assert.deepEqual([input.trade, input.code, input.items.length, input.items[0]], ["Demolition", "02 41 19", 5, { title: "Remove aluminum windows, frames and sashes at level 1", detail: "" }]);

// The AI job: input checked, prompt in Marcel's style, answer screened.
const job = EXTRA_JOBS["general-scope"];
assert.ok(job, "The AI route knows the job");
assert.throws(() => job.parse({ trade: "Demolition", items: [] }), /scope items/);
assert.throws(() => job.parse({ trade: "", items: [{ title: "x" }] }), /Name the trade/);
assert.throws(() => job.parse({ trade: "D", items: Array.from({ length: G.GENERAL_MAX_ITEMS + 1 }, (_, i) => ({ title: `i${i}` })) }), /At most/);
const messages = job.messages(job.parse(input));
assert.match(messages[0].content, /Asbestos abatement/);
assert.match(messages[0].content, /Every item belongs to exactly one line/);
assert.match(messages[0].content, /at most 10 words/);
assert.match(messages[0].content, /never more than 10/);
assert.match(messages[0].content, /"as shown on the plans"/, "It says what to leave out: conditions, locations, approvals");
assert.match(messages[1].content, /^Trade: Demolition \(02 41 19\)/);
assert.match(messages[0].content, /Most lines name work the trade furnishes, installs, builds or removes/, "Work first (19 Nov: Concrete's lines were meetings and submittals)");
assert.match(messages[0].content, /together in one line, the last one/, "Admin requirements in one closing line");
assert.match(messages[0].content, /check that none is left out/);
assert.equal(job.maxTokens >= 8000, true, "Room for the numbers of 900 items");

// Every item goes (19 Nov: Concrete 567, Electrical 898; 400 used to be the most), titles only above 300.
const many = Array.from({ length: 898 }, (_, n) => ({ title: `Item ${n}`, detail: `Detail ${n}` }));
const big = G.generalScopeInput({ name: "Electrical", code: "26 00 00" }, many);
assert.deepEqual([big.items.length, big.items[897], big.items[0].detail], [898, { title: "Item 897", detail: "" }, ""], "Every item, titles only");
assert.equal(G.generalScopeInput({ name: "E", code: "" }, many.slice(0, 300)).items[0].detail, "Detail 0", "Details up to 300 items");
assert.equal(job.parse(big).items.length, 898, "The route takes them");
assert.equal(G.GENERAL_MAX_ITEMS >= 1500, true);

// Items the first answer left out are asked again with the lines it wrote, and joined to them.
const first = [{ text: "Raceways and conductors", members: [0, 1, 3] }, { text: "Submittals, testing, warranties and closeout", members: [4] }];
const five = G.generalScopeInput({ name: "Electrical", code: "26 00 00" }, many.slice(0, 6));
const left = G.leftoverInput(five, first);
assert.deepEqual([left.index, left.input.items.map(i => i.title), left.input.lines], [[2, 5], ["Item 2", "Item 5"], ["Raceways and conductors", "Submittals, testing, warranties and closeout"]]);
assert.equal(G.leftoverInput(five, [{ text: "All", members: [0, 1, 2, 3, 4, 5] }]), null, "Nothing left out, no second request");
const again = job.messages(job.parse(left.input));
assert.match(again[0].content, /already written; the items you receive were left out/);
assert.match(again[1].content, /General lines already written:\n- Raceways and conductors\n- Submittals, testing, warranties and closeout\n\nItems left out of them:\n0\. Item 2/);
const merged = G.mergeLeftovers(first, [{ text: " raceways and  CONDUCTORS", members: [0] }, { text: "Lighting fixtures", members: [1, 7] }], left.index);
assert.deepEqual(merged, [{ text: "Raceways and conductors", members: [0, 1, 3, 2] }, { text: "Submittals, testing, warranties and closeout", members: [4] }, { text: "Lighting fixtures", members: [5] }], "Same words join the line; a new line is added; numbers map back");
assert.deepEqual(first[0].members, [0, 1, 3], "The first answer is left as it was");
const full = Array.from({ length: G.GENERAL_MAX_LINES }, (_, n) => ({ text: `Line ${n}`, members: [n] }));
assert.equal(G.mergeLeftovers(full, [{ text: "One more", members: [0] }], [99]).length, G.GENERAL_MAX_LINES, "No line past the most");
assert.match(messages[1].content, /\n0\. Remove aluminum windows, frames and sashes at level 1\n1\./);
const screened = job.screen({ lines: [
  { text: "Removal of windows, frames and sashes", members: [0, 1, 9] },
  { text: "Asbestos abatement", members: [2] },
  { text: "", members: [3] },
  { text: "Nothing covered", members: [] },
  { text: "Full raze of the 1930s building, including foundations", members: [3] },
] }, job.parse(input));
assert.deepEqual(screened.lines, [
  { text: "Removal of windows, frames and sashes", members: [0, 1] },
  { text: "Asbestos abatement", members: [2] },
  { text: "Full raze of the 1930s building, including foundations", members: [3] },
], "Lines without words or items are dropped, and numbers outside the list");

// Applied to the package: numbers become item ids, an item claimed twice stays with its first line.
const at = "2026-11-19T10:00:00.000Z";
let s = G.applyGeneralScope(state, "demo", [...screened.lines, { text: "Trench cutting", members: [4, 2] }], "claude-haiku", "Structor AI", at);
const general = s.packages[0].general;
assert.deepEqual(general.lines.map(l => [l.text, l.members]), [
  ["Removal of windows, frames and sashes", ["s1", "s2"]], ["Asbestos abatement", ["s3"]],
  ["Full raze of the 1930s building, including foundations", ["s4"]], ["Trench cutting", ["s5"]],
]);
assert.deepEqual([general.by, general.model, general.at], ["Structor AI", "claude-haiku", at]);
assert.equal(s.packages[1].general, undefined, "Other trades are untouched");
assert.deepEqual([G.generalStale(s, s.packages[0]), G.uncovered(s, s.packages[0]).length], [false, 0], "Fresh, and every item covered");
assert.throws(() => G.applyGeneralScope(state, "demo", [{ text: "x", members: [] }], "m", "b", at), /no general lines/);

// Out of date once the detailed items change; a new item isn't covered until rewritten.
const grown = { ...s, scopes: [...s.scopes, item("s6", "Remove existing roofing")] };
assert.deepEqual([G.generalStale(grown, grown.packages[0]), G.uncovered(grown, grown.packages[0]).map(i => i.id)], [true, ["s6"]]);
const renamed = { ...s, scopes: s.scopes.map(i => i.id === "s3" ? { ...i, title: "Abate asbestos pipe insulation" } : i) };
assert.equal(G.generalStale(renamed, renamed.packages[0]), true, "Rewording an item makes it out of date too");
assert.equal(G.generalBasis([{ id: "a", title: "x" }, { id: "b", title: "y" }]), G.generalBasis([{ id: "b", title: "y" }, { id: "a", title: "x" }]), "Order doesn't matter");

// The estimator's own changes.
const firstLine = general.lines[0].id;
s = G.editGeneralLine(s, "demo", firstLine, "  Removal of  existing windows ");
assert.deepEqual([s.packages[0].general.lines[0].text, s.packages[0].general.lines[0].edited, s.packages[0].general.lines[0].members], ["Removal of existing windows", true, ["s1", "s2"]], "Reworded, keeping its items");
assert.throws(() => G.editGeneralLine(s, "demo", firstLine, " "), /Write the line/);
s = G.addGeneralLine(s, "demo", "Temporary protection of adjacent finishes");
assert.deepEqual(s.packages[0].general.lines.at(-1).members, [], "An added line covers no detailed item");
s = G.removeGeneralLine(s, "demo", firstLine);
assert.deepEqual(G.uncovered(s, s.packages[0]).map(i => i.id), ["s1", "s2"], "Removing a line uncovers its items");
assert.throws(() => G.addGeneralLine(state, "steel", "x"), /no general scope yet/);

console.log("General scope checked: the trade's own items (all of them, titles only above 300), the AI job's input, prompt and screening, the items left out asked again, applying lines to item ids, out-of-date detection, and the estimator's edits.");

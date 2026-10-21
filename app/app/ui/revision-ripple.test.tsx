import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleSubmissions } from "../../lib/data/sample-award";
import { applyRipple, revisionRipple, type SheetChanges } from "../../lib/revision-ripple";
require.extensions[".css"] = () => {};
const { RevisionRipple } = require("./revision-ripple") as typeof import("./revision-ripple");
const sheets: SheetChanges[] = [{ sheet: "A1.1", revision: "V2", changes: [
  { title: "New storage enclosure", detail: "Partitions at C/4", kind: "Added", trade: "Drywall" },
  { title: "Ceiling removed", detail: "Remove existing ACT", kind: "Removed", trade: "Ceilings" },
  { title: "Specialist work", detail: "Confirm specialist owner", kind: "Revised", trade: "Unlisted specialist" },
] }, { sheet: "A8.1", revision: "V2", changes: [{ title: "Revised door hardware", detail: "New lockset", kind: "Revised", trade: "Doors" }] }];
const html = (input = sheets, procurement = sampleProcurement) => renderToStaticMarkup(<RevisionRipple sheets={input} procurement={procurement} submissions={sampleSubmissions} run={() => null} notify={() => {}} navigate={() => {}}/>);

test("trade impact keeps sheet/revision/kind and separates unmatched work", () => {
  const markup = html();
  for (const text of ["Trade impact", "All reviewed sheets", "4 reviewed changes", "2 affected trades", "A1.1 · V2", "A8.1 · V2", "Added", "Removed", "Revised", "New storage enclosure", "Revised door hardware", "Unmatched changes", "Unlisted specialist", "Place changes by hand", "Add to bid form", "Scopes &amp; bid forms"]) assert.ok(markup.includes(text), text);
  assert.equal((markup.match(/class="ripple-trade"/g) ?? []).length, 2);
  assert.equal((markup.match(/>Add to bid form</g) ?? []).length, 2);
});

test("published forms warn using the same submissions that feed leveling", () => {
  const markup = html();
  const count = sampleSubmissions.filter(s => s.packageId === "drywall" && s.status !== "draft").length;
  assert.ok(count > 0);
  assert.ok(markup.includes(`${count} submitted bids`));
  assert.match(markup, /Published · version/);
  assert.match(markup, /need to resubmit once you republish/);
  assert.match(markup, /Adding lines does not publish the form or send email/);
});

test("repeat approval shows carried changes without duplicating draft scope", () => {
  const trade = revisionRipple(sheets, sampleProcurement, sampleSubmissions).trades.find(t => t.packageId === "drywall")!;
  const applied = applyRipple(sampleProcurement, trade, "Marcel Khoury");
  const again = applyRipple(applied, trade, "Marcel Khoury");
  assert.equal(applied, again);
  assert.ok(html(sheets, again).includes("2 of 2 changes already in bid form"));
  assert.equal(again.scopes.filter(s => s.source === "A1.1 · V2" && s.status === "draft").length, 2);
});

test("an unreviewed comparison offers guidance and no trade approval", () => {
  const markup = html([]);
  assert.match(markup, /Review changes before updating bid forms/);
  assert.match(markup, /Mark reviewed/);
  assert.ok(!markup.includes("Add to bid form"));
  assert.ok(!markup.includes("Unmatched changes"));
});

test("unpublished empty project can still place reviewed unmatched changes by hand", () => {
  const procurement = { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] };
  const markup = html(sheets, procurement);
  assert.match(markup, /0 affected trade/);
  assert.match(markup, /Unmatched changes/);
  assert.match(markup, /Place changes by hand/);
  assert.ok(!markup.includes("Add to bid form"));
});

test("revision comparison includes reviewed changes across sheets only for the selected issue pair", () => {
  const drafts = require("../../lib/use-local-draft") as typeof import("../../lib/use-local-draft");
  const original = drafts.useLocalDraft;
  const change = { title: "Reviewed enclosure", detail: "At C/4", kind: "Added", trade: "Drywall", id: "one", key: "v1>v2:A1.1", reviewed: true };
  const saved = [change, { ...change, id: "two", title: "Reviewed door", trade: "Doors", key: "v1>v2:A8.1" }, { ...change, id: "three", title: "Unreviewed work", reviewed: false }, { ...change, id: "four", title: "Other issue pair", key: "v0>v1:A1.1" }];
  Object.assign(drafts, { useLocalDraft: (key: string, initial: unknown) => [key === "revision-changes" ? saved : initial, () => {}] });
  try {
    const { RevisionCompare } = require("./revision-compare") as typeof import("./revision-compare");
    const documents = [1, 2].map(revision => ({ id: `v${revision}`, projectId: "jelleff", name: "Drawing set", kind: "drawings" as const, category: "Drawings", series: "v1", revision, uploadedAt: "2026-10-21", size: 100, pageCount: 2, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sections: [], sheets: [{ page: 1, sheet: "A1.1", title: "Plan", date: "" }, { page: 2, sheet: "A8.1", title: "Partitions", date: "" }] }));
    const markup = renderToStaticMarkup(<RevisionCompare projectName="Jelleff" notify={() => {}} navigate={() => {}} documents={documents}/>);
    const impact = markup.slice(markup.indexOf('class="ui-panel ripple-panel"'));
    assert.match(impact, /2 reviewed changes · 2 affected trades/);
    assert.match(impact, /Reviewed enclosure/);
    assert.match(impact, /Reviewed door/);
    assert.ok(!impact.includes("Unreviewed work"));
    assert.ok(!impact.includes("Other issue pair"));
  } finally { Object.assign(drafts, { useLocalDraft: original }); }
});

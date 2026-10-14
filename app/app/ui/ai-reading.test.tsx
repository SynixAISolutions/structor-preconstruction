import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleProposals } from "../../lib/data/proposals";
import { extractTradeScope, readProposal } from "../../lib/ai-client";
import { EMPTY_EXTRACTION, recordRun } from "../../lib/extraction";
import { EMPTY_PROPOSALS, recordReading } from "../../lib/proposal-extraction";
import { manualSections, sectionsInDivision } from "../../lib/manual-sections";

require.extensions[".css"] = () => {};
const { SpecificationReader } = require("./specification-reader") as typeof import("./specification-reader");
const { ProposalReader } = require("./proposal-reader") as typeof import("./proposal-reader");
const drywall = sampleProcurement.packages.find(p => p.id === "drywall")!;
const concrete = sampleProcurement.packages.find(p => p.id === "concrete")!;
const proposal = (pkg = concrete, invitations = sampleProcurement.invitations) => renderToStaticMarkup(<ProposalReader pkg={pkg} invitations={invitations} proposals={sampleProposals} companies={new Map()} onRead={() => null}/>);

test("specification reader is available before any run and cannot send an unselected manual", () => {
  const html = renderToStaticMarkup(<SpecificationReader pkg={drywall} onRun={() => null}/>);
  assert.match(html, /Project manual PDF/);
  assert.match(html, /disabled=""[^>]*>Read selected sections/);
  assert.match(html, /selected section text to DeepSeek/);
});

test("proposal upload requires a published form and an eligible invited company", () => {
  assert.match(proposal({ ...concrete, published: undefined }), /Publish this trade/);
  assert.ok(!proposal({ ...concrete, published: undefined }).includes('type="file"'));
  assert.match(proposal(concrete, sampleProcurement.invitations.map(i => ({ ...i, status: "declined" }))), /Invite a company/);
  const html = proposal();
  assert.match(html, /Choose the company that sent this proposal/);
  assert.match(html, /disabled=""[^>]*>Read proposal for review/);
});

test("only selected manual sections are sent and findings remain pending even after a partial run", async () => {
  const pages = [
    { page: 1, text: "SECTION 092900 - GYPSUM BOARD\nProvide gypsum board partitions." },
    ...Array.from({ length: 5 }, (_, i) => ({ page: i + 2, text: "GYPSUM BOARD 092900 - 2\nProvide gypsum board partitions." })),
    { page: 7, text: "SECTION 081113 - HOLLOW METAL DOORS\nInstall door frames." },
  ];
  const fetchBefore = globalThis.fetch;
  const sent: { input: { pages: { page: number }[] } }[] = [];
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init!.body as string));
    if (sent.length === 2) return Response.json({ error: "Request timed out" }, { status: 502 });
    return Response.json({ model: "test-model", dropped: [], drafts: [{ kind: "scope", key: "gwb", packageId: drywall.id, title: "Gypsum partitions", detail: "", source: "09 29 00", citations: [{ document: "manual.pdf", page: 1, sheet: null, quote: "Provide gypsum board partitions." }] }] });
  };
  try {
    const result = await extractTradeScope({ pkg: drywall, manual: { name: "manual.pdf", pageCount: 7 }, sections: sectionsInDivision(manualSections(pages), "09") });
    assert.deepEqual(sent.map(s => s.input.pages.map(p => p.page)), [[1, 2, 3, 4, 5], [6]]);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].error, "Request timed out");
    const recorded = recordRun(EMPTY_EXTRACTION, sampleProcurement, result.input);
    assert.equal(recorded.drafts[0].status, "pending-review");
    assert.equal(recorded.drafts[0].packageId, drywall.id);
    assert.equal(recorded.runs[0].engine.mode, "live");
  } finally { globalThis.fetch = fetchBefore; }
});

test("an unavailable AI server becomes a failed run with no findings", async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "AI is not configured" }, { status: 503 });
  try {
    const result = await extractTradeScope({ pkg: drywall, manual: { name: "manual.pdf", pageCount: 1 }, sections: manualSections([{ page: 1, text: "SECTION 092900 - GYPSUM BOARD\nProvide gypsum board." }]) });
    const recorded = recordRun(EMPTY_EXTRACTION, sampleProcurement, result.input);
    assert.equal(recorded.runs[0].status, "failed");
    assert.equal(recorded.runs[0].error, "AI is not configured");
    assert.equal(recorded.drafts.length, 0);
  } finally { globalThis.fetch = fetchBefore; }
});

test("proposal reading uses the published items and records a review without submitting a bid", async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.input.form.items.map((i: { id: string }) => i.id), concrete.published!.items.map(i => i.id));
    return Response.json({ model: "test-model", dropped: [], reading: { baseBid: null, responses: [] } });
  };
  try {
    const result = await readProposal({ invitationId: "inv-2", form: concrete.published!, proposal: { name: "proposal.pdf", size: 1000, pageCount: 1, emptyPages: 0, pages: [{ page: 1, text: "Illustrative proposal terms." }] } });
    const recorded = recordReading(EMPTY_PROPOSALS, sampleProcurement, result.input);
    assert.equal(recorded.readings[0].status, "pending-review");
    assert.equal(recorded.readings[0].applied, null);
    assert.equal(recorded.readings[0].packageId, "concrete");
    assert.ok(recorded.readings[0].content.responses.every(r => r.answer === null));
  } finally { globalThis.fetch = fetchBefore; }
});

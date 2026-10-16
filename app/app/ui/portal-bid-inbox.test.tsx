import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
require.extensions[".css"] = () => {};
const { PortalBidList } = require("./portal-bid-inbox") as typeof import("./portal-bid-inbox");
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleSubmissions } from "../../lib/data/sample-award";
import { initialBidders } from "../../lib/data/commercial";

test("proposal inbox shows submitted portal revisions and labels illustrative bids", () => {
  const html = renderToStaticMarkup(<PortalBidList procurement={sampleProcurement} submissions={sampleSubmissions} directory={initialBidders} onReview={() => {}}/>);
  for (const trade of ["Concrete", "Drywall", "Doors, frames &amp; hardware", "Roofing &amp; waterproofing"]) assert.ok(html.includes(trade));
  assert.equal((html.match(/Illustrative sample bid/g) ?? []).length, 8);
  assert.match(html, /Review in leveling/);
});

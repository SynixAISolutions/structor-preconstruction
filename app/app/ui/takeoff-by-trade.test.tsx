import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProcurement } from "../../lib/data/procurement";
import { initialTakeoffs } from "../../lib/data/preconstruction";
import { estimateByTrade } from "../../lib/estimate";
import { setScopeQuantity, setScopeUnitPrice } from "../../lib/procurement";
import { linePlug, takeoffByTrade } from "../../lib/takeoff-by-trade";

require.extensions[".css"] = () => {};
const { DetailedTakeoff, takeoffSummary } = require("./takeoff-by-trade") as typeof import("./takeoff-by-trade");
const { TradeEstimateList } = require("./trade-estimates") as typeof import("./trade-estimates");
const { OwnTakeoffPlug } = require("./bid-gap-cost") as typeof import("./bid-gap-cost");

const line = sampleProcurement.scopes.find(s => s.packageId === "drywall" && !s.allTrades)!;
const priced = setScopeUnitPrice(setScopeQuantity(sampleProcurement, line.id, { value: 4200, unit: "SF", basis: "A8.1: measured" }, "Sadie"), line.id, { rate: 3.1 }, "Sadie");

test("the trade list shows each trade's detailed takeoff beside its in-house estimate", () => {
  const takeoffs = new Map(takeoffByTrade(priced).map(t => [t.packageId, t]));
  const html = renderToStaticMarkup(<TradeEstimateList trades={estimateByTrade(initialTakeoffs, priced).trades} unassigned={0} onOpen={() => {}} takeoffs={takeoffs}/>);
  assert.match(html, /<th>Detailed takeoff<\/th>/);
  assert.match(html, /\$13,020\.00 · 1 of \d+ priced/);
  assert.match(html, />1 line, none priced</, "One line, not one lines");
  assert.equal(takeoffSummary(undefined), "No scope lines");
  assert.equal(takeoffSummary({ total: 0, priced: 0, lines: [1, 2] }), "2 lines, none priced");
  assert.doesNotMatch(renderToStaticMarkup(<TradeEstimateList trades={[]} unassigned={0} onOpen={() => {}}/>), /Detailed takeoff/, "Callers without takeoffs keep the old table");
});

test("a trade's takeoff lists its own lines, a quantity first, then a price", () => {
  const html = renderToStaticMarkup(<DetailedTakeoff packageId="drywall" project={{ id: "sample", name: "Sample" } as never} notify={() => {}} records={{ procurement: sampleProcurement, runProcurement: () => null, rows: initialTakeoffs }}/>);
  const own = sampleProcurement.scopes.filter(s => s.packageId === "drywall" && !s.allTrades).length;
  assert.match(html, new RegExp(`Scope lines</span><strong[^>]*>${own}<`));
  assert.match(html, /Unit prices stay with your team: bidders see a line&#x27;s quantity, never its price/);
  assert.match(html, /Add quantity/);
  assert.match(html, /Quantity first/, "No price box before the line has a quantity");
  assert.match(html, /Trade total/);
  assert.match(html, /With a quantity<\/span><strong[^>]*>0 of \d+<\/strong><small>None yet</, "Not \"All checked\" when nothing has a quantity");
  assert.doesNotMatch(html, new RegExp(sampleProcurement.scopes.find(s => s.allTrades)?.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "^$"), "The lines for every trade aren't listed");
});

test("leveling plugs an excluded line from its own takeoff", () => {
  const plug = linePlug(priced.scopes.find(s => s.id === line.id))!;
  const html = renderToStaticMarkup(<OwnTakeoffPlug plug={plug} onUse={() => {}}/>);
  assert.match(html, /This line&#x27;s takeoff/);
  assert.match(html, /4,200 SF<\/strong> × \$3\.10 \/ SF = <strong>\$13,020/);
  assert.doesNotMatch(html, /isn&#x27;t checked/, "An estimator's own quantity is checked");
  const unpriced = renderToStaticMarkup(<OwnTakeoffPlug plug={{ ...plug, rate: null, checked: false }} onUse={() => {}}/>);
  assert.match(unpriced, /No unit price yet: enter one below/);
  assert.match(unpriced, /The quantity isn&#x27;t checked yet/);
});

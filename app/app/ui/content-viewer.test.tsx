import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { gestureMarkupRect, keyboardMarkupRect } from "./content-viewer";
import { ContentLinks } from "./project-content-links";
import type { Markup } from "../../lib/project-content";

const rect: Markup["rect"] = [.25, .3, .2, .15];
test("keyboard movement and resizing keep a markup inside its page", () => {
  assert.deepEqual(keyboardMarkupRect(rect, "ArrowRight", false), [.255, .3, .2, .15]);
  assert.deepEqual(keyboardMarkupRect(rect, "ArrowDown", true), [.25, .3, .2, .155]);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    for (const resize of [true, false]) {
      let r = rect;
      for (let n = 0; n < 500; n++) r = keyboardMarkupRect(r, key, resize, .02);
      const [x, y, w, h] = r;
      assert.ok(x >= 0 && y >= 0 && w >= .01 && h >= .01 && x + w <= 1.000001 && y + h <= 1.000001);
    }
  }
});

test("drawing in reverse and dragging at page edges use normalized page coordinates", () => {
  assert.deepEqual(gestureMarkupRect({ mode: "draw", start: [.8, .9], rect: [0, 0, 0, 0] }, [.2, .4]).map(n => +n.toFixed(4)), [.2, .4, .6, .5]);
  assert.deepEqual(gestureMarkupRect({ mode: "move", start: [.3, .35], rect }, [1, 1]), [.8, .85, .2, .15]);
  for (const mode of ["nw", "ne", "sw", "se"] as const) {
    for (const point of [[0, 0], [1, 1]] as [number, number][]) {
      const [x, y, w, h] = gestureMarkupRect({ mode, start: [.3, .35], rect }, point);
      assert.ok(x >= 0 && y >= 0 && w >= .009999 && h >= .009999 && x + w <= 1.000001 && y + h <= 1.000001);
    }
  }
});

test("record groups show live names and status, preserving saved labels for removed records", () => {
  const html = renderToStaticMarkup(<ContentLinks links={[{ kind: "package", id: "trade", label: "Old name" }, { kind: "rfi", id: "missing", label: "RFI <saved>" }]} records={[{ kind: "package", id: "trade", label: "09 · Finishes", status: "published" }]}/>);
  for (const text of ["Issues", "RFIs", "Bid packages", "Clarifications", "VE items", "09 · Finishes", "published", "RFI &lt;saved&gt;", "record unavailable"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Old name"));
});

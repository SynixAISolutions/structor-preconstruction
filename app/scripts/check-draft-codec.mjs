// Drafts packed in the browser (19 Nov: Whittier's full run saved 6.15 million characters for one project; Chrome keeps
// about 5.2 million a site, so Danial's Chrome showed "No bid packages yet").
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/draft-codec.ts");

// Small drafts stay plain JSON, as every copy saved before is; null stays null.
const small = JSON.stringify({ packages: [{ id: "tile", name: "Tile" }] });
assert.equal(C.packDraft(small), small);
assert.equal(C.unpackDraft(small), small, "A plain copy reads as it is");
assert.equal(C.unpackDraft(null), null);

// A whole project's scope items: packed small, back exactly, words in any script and quotes as typed.
const item = n => ({ id: `item-${n}`, packageId: ["concrete", "roofing", "electrical"][n % 3], title: `Provide ${n} “PVC” roofing membrane — façade 07 54 19 ½" ✓`, detail: "Fluid-applied air barrier, vapor permeable, on exterior sheathing.", source: `07 27 26 · §2.${n % 9}`, origin: "ai", status: "draft", history: [{ kind: "created", at: "2026-11-19T09:36:22.001Z", by: "Structor AI" }] });
const big = JSON.stringify({ packages: [], scopes: Array.from({ length: 2603 }, (_, n) => item(n)) });
assert.ok(big.length > 800_000, `A full run is big (${big.length})`);
const packed = C.packDraft(big);
assert.ok(packed.length < big.length / 5, `Packed to ${packed.length} of ${big.length} characters`);
assert.ok([...packed].every(ch => ch.charCodeAt(0) < 256), "One byte a character");
assert.equal(C.unpackDraft(packed), big, "Back exactly");
assert.doesNotThrow(() => JSON.parse(C.unpackDraft(packed)));
assert.throws(() => JSON.parse(packed), "A packed copy is never mistaken for JSON");
const started = Date.now();
for (let i = 0; i < 5; i++) C.unpackDraft(C.packDraft(big));
assert.ok((Date.now() - started) / 5 < 500, "Fast enough to read as a screen renders");

console.log(`Draft packing checked: small drafts plain, a 2,603-item run packed to ${Math.round(packed.length / big.length * 100)}% and read back exactly, quick enough for every render.`);

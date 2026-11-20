import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./ts-resolver.mjs", import.meta.url);
const D = await import("../lib/demo-readonly.ts");

// The new-look demo shares the live file store; STRUCTOR_DEMO_READONLY=1 turns away every change to it (NEW_LOOK_DEMO.md).
assert.deepEqual(["1", "true", "YES", " on ", "0", "", "false", undefined].map(v => D.demoReadOnly({ STRUCTOR_DEMO_READONLY: v })), [true, true, true, true, false, false, false, false]);
assert.equal(D.demoGuard({}), null, "The live site (switch unset) is never turned away");
const turned = D.demoGuard({ STRUCTOR_DEMO_READONLY: "1" });
assert.equal(turned.status, 403);
assert.deepEqual(await turned.json(), { error: D.DEMO_READONLY_MESSAGE, demo: true });

// Every API route that changes something answers the demo switch, except the ones that only touch the database
// (the demo has its own copy), the AI, or sign-in. A new route that writes must take the guard or be listed here.
const NO_FILE_WRITES = new Set(["ai", "bid-portal/link", "login", "portal/bid", "shared"]);
const api = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "api");
const routes = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "route.ts") routes.push(full);
  }
})(api);
let guarded = 0;
for (const file of routes) {
  const name = path.relative(api, path.dirname(file)).split(path.sep).join("/");
  const src = fs.readFileSync(file, "utf8");
  const writers = [...src.matchAll(/^export async function (POST|PUT|PATCH|DELETE)\(.*\) \{\n(.*)$/gm)];
  if (!writers.length || NO_FILE_WRITES.has(name)) continue;
  for (const [, method, first] of writers) assert.equal(first.trim(), "const demo = demoGuard(); if (demo) return demo;", `${method} /api/${name} must turn the read-only demo away first`);
  guarded += writers.length;
}
assert.ok(guarded >= 13, `Expected at least 13 guarded handlers, found ${guarded}`);

// And they really do, before reading the request or reaching the file store.
const saved = process.env.STRUCTOR_DEMO_READONLY;
try {
  process.env.STRUCTOR_DEMO_READONLY = "1";
  for (const [name, methods] of [["project-files", ["POST"]], ["project-files/text", ["POST", "PATCH"]], ["project-files/upload", ["POST"]], ["project-content", ["POST"]], ["portal/bid/upload", ["POST"]]]) {
    const route = await import(`../app/api/${name}/route.ts`);
    for (const method of methods) {
      const res = await route[method](new Request(`https://structor.example/api/${name}`, { method, body: "{}" }));
      assert.equal(res.status, 403, `${method} /api/${name} on the demo`);
    }
  }
} finally {
  if (saved === undefined) delete process.env.STRUCTOR_DEMO_READONLY; else process.env.STRUCTOR_DEMO_READONLY = saved;
}

console.log(`demo read-only: ${guarded} file-writing handlers turn the demo away; the live site is untouched`);

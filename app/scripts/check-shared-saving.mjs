import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

register("./ts-resolver.mjs", import.meta.url);
const M = await import("../lib/shared-merge.ts");

// Shared saving (Danial, 3 Nov): one copy of every project, its scopes and bid forms for the whole team.

// ── Two people changing the same draft at once: both changes kept where they don't touch the same thing ──
const base = { packages: [{ id: "a", name: "Concrete", owner: "" }, { id: "b", name: "Masonry", owner: "" }], note: "x" };
const ours = { packages: [{ id: "a", name: "Concrete", owner: "Sadie" }, { id: "b", name: "Masonry", owner: "" }], note: "x" };
const theirs = { packages: [{ id: "a", name: "Concrete", owner: "" }, { id: "b", name: "Masonry", owner: "Victor" }, { id: "c", name: "Steel", owner: "" }], note: "y" };
assert.deepEqual(M.mergeJson(base, ours, theirs), { packages: [{ id: "a", name: "Concrete", owner: "Sadie" }, { id: "b", name: "Masonry", owner: "Victor" }, { id: "c", name: "Steel", owner: "" }], note: "y" },
  "Our owner, their owner, their new trade and their note all stand");
assert.deepEqual(M.mergeJson(base, { ...base, packages: [base.packages[0]] }, theirs).packages.map(p => p.id), ["a", "b", "c"], "We removed b, they changed it: their change keeps it");
assert.deepEqual(M.mergeJson(base, { ...base, packages: [base.packages[0], base.packages[1]] }, { ...base, packages: [base.packages[0]] }).packages.map(p => p.id), ["a"], "They removed b we didn't touch: it goes");
assert.deepEqual(M.mergeJson(base, { ...base, note: "ours" }, { ...base, note: "theirs" }).note, "ours", "Both changed the same value: this browser's wins");
assert.deepEqual(M.mergeJson(base, base, theirs), theirs, "Nothing changed here: theirs is taken whole");
assert.deepEqual(M.mergeJson(undefined, ours, theirs).packages.map(p => [p.id, p.owner]), [["a", "Sadie"], ["b", ""], ["c", ""]], "No base (reloaded): our values win, records only they have are kept");
assert.deepEqual(M.mergeJson(base, { list: [1, 2] }, { list: [3] }), { list: [1, 2] }, "Lists without ids: ours");
const scope = (id, status) => ({ id, status, history: [] });
assert.deepEqual(M.mergeJson({ scopes: [scope("s1", "draft"), scope("s2", "draft")] }, { scopes: [scope("s1", "approved"), scope("s2", "draft")] }, { scopes: [scope("s1", "draft"), scope("s2", "approved")] }).scopes.map(s => s.status), ["approved", "approved"],
  "Marcel approves one scope item while Danial approves another: both are approved");
assert(M.sameJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }) && !M.sameJson({ a: 1 }, { a: 1, b: undefined }), "JSON equality");

// ── The save API, on the local stand-in store ──
const dir = mkdtempSync(path.join(tmpdir(), "structor-shared-"));
const cwd = process.cwd();
process.chdir(dir);
try {
  const api = await import("../app/api/shared/route.ts");
  const at = (q) => `http://local/api/shared?${q}`;
  const put = (q, value, body = gzipSync(JSON.stringify(value))) => api.PUT(new Request(at(q), { method: "PUT", body }));
  const get = (q) => api.GET(new Request(at(q)));

  let r = await put("scope=p1&key=procurement&base=0", { packages: [] });
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { version: 1 }, "A new draft is version 1");
  r = await put("scope=p1&key=procurement&base=0", { packages: [1] });
  assert.equal(r.status, 409); assert.deepEqual(await r.json(), { version: 1 }, "A save over an older version is refused, with the current one");
  r = await put("scope=p1&key=procurement&base=1", { packages: [2] });
  assert.deepEqual(await r.json(), { version: 2 }, "A save over the current version goes up by one");
  r = await get("scope=p1&key=procurement");
  assert.equal(r.headers.get("x-version"), "2");
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()), { packages: [2] }, "The value comes back compressed, as saved");
  assert.deepEqual((await (await get("scope=p1")).json()).rows.map(x => [x.key, x.version]), [["procurement", 2]], "A project's rows and versions");
  assert.equal((await get("scope=p1&key=extraction")).status, 404, "Nothing saved under that name");

  await put("scope=p1&key=project&base=0", { id: "p1", name: "Project A" });
  await put("scope=p2&key=project&base=0", { id: "p2", name: "Project B" });
  assert.deepEqual((await (await get("every=project")).json()).rows.map(x => [x.scope, x.value.name]), [["p1", "Project A"], ["p2", "Project B"]], "Every project's record, as JSON");
  await put("scope=_org&key=directory&base=0", [{ id: "d1" }]);
  assert.equal((await (await get("scope=_org")).json()).rows[0].key, "directory", "The organization's drafts have their own scope");

  assert.equal((await put("scope=p1&key=procurement&base=2", null, Buffer.from("not gzip"))).status, 400, "Only compressed JSON is kept");
  assert.equal((await put("scope=../x&key=procurement&base=0", {})).status, 400, "Project names are checked");
  assert.equal((await put("scope=p1&key=Bad%20Key&base=0", {})).status, 400, "Draft names are checked");
  assert.equal((await put("scope=p1&key=procurement&base=-1", {})).status, 400, "The version is checked");
  assert.equal((await put("scope=p1&key=big&base=0", null, Buffer.alloc(4_000_001))).status, 413, "Over 4 MB compressed is refused");
} finally {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log("Shared saving checked: both people's changes kept in a merge, versions and conflicts, compressed drafts, project records, the organization's drafts, bad input refused.");

import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

register("./ts-resolver.mjs", import.meta.url);

// Shared saving's browser side (lib/shared-sync), against the real save API (app/api/shared) on the local stand-in store:
// what arrives from the shared copy, what only this browser had goes up, and storage freed when the browser is full.
const dir = mkdtempSync(path.join(tmpdir(), "structor-sync-"));
const cwd = process.cwd();
process.chdir(dir);

/** This browser's storage; `limit` characters before it refuses, like a full browser. */
class Storage {
  constructor(limit = Infinity) { this.map = new Map(); this.limit = limit; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    const used = [...this.map].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0);
    if (used + k.length + String(v).length > this.limit) { const e = new Error("The quota has been exceeded."); e.name = "QuotaExceededError"; throw e; }
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new Storage();
globalThis.window = globalThis.window ?? { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
globalThis.CustomEvent = globalThis.CustomEvent ?? class extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };

try {
  const api = await import("../app/api/shared/route.ts");
  globalThis.fetch = async (url, init = {}) => {
    const request = new Request(`http://local${url}`, { method: init.method ?? "GET", body: init.body ? Buffer.from(await init.body.arrayBuffer()) : undefined });
    return request.method === "PUT" ? api.PUT(request) : api.GET(request);
  };
  const put = (q, value) => api.PUT(new Request(`http://local/api/shared?${q}`, { method: "PUT", body: gzipSync(JSON.stringify(value)) }));
  const stored = async (q) => { const r = await api.GET(new Request(`http://local/api/shared?${q}`)); return r.ok ? JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()) : null; };
  const S = await import("../lib/shared-sync.ts");
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Someone else saved a project and its bid packages: opening it brings both in.
  await put("scope=p1&key=project&base=0", { id: "p1", name: "Riverside library" });
  await put("scope=p1&key=procurement&base=0", { packages: [{ id: "concrete", name: "Concrete" }] });
  await S.syncProject("p1");
  assert.deepEqual(JSON.parse(localStorage.getItem("structor-ui-projects")).map(p => p.name), ["Riverside library"], "Their project is listed here");
  assert.deepEqual(JSON.parse(localStorage.getItem("structor-ui-p1:procurement")).packages.map(p => p.name), ["Concrete"], "Its bid packages are here");
  assert(S.sharedReady("p1"), "The project's shared copy is in: the AI run may decide");

  // This browser's own project, saved before shared saving, goes up with its drafts the first time.
  localStorage.setItem("structor-ui-projects", JSON.stringify([...JSON.parse(localStorage.getItem("structor-ui-projects")), { id: "p2", name: "Old browser project" }]));
  localStorage.setItem("structor-ui-p2:extraction", JSON.stringify({ runs: [{ id: "r1" }] }));
  await S.syncProject("p1");
  await wait(2600);
  assert.deepEqual(await stored("scope=p2&key=project"), { id: "p2", name: "Old browser project" }, "Its record went up");
  assert.deepEqual(await stored("scope=p2&key=extraction"), { runs: [{ id: "r1" }] }, "And its AI findings, without opening it");

  // A change here goes up a couple of seconds later, over the version it was made on.
  localStorage.setItem("structor-ui-p1:procurement", JSON.stringify({ packages: [{ id: "concrete", name: "Concrete" }, { id: "steel", name: "Steel" }] }));
  S.noteDraftSaved("p1", "procurement");
  await wait(2600);
  assert.deepEqual((await stored("scope=p1&key=procurement")).packages.map(p => p.id), ["concrete", "steel"]);
  // Theirs and ours at once: both kept.
  await put("scope=p1&key=procurement&base=2", { packages: [{ id: "concrete", name: "Concrete" }, { id: "steel", name: "Steel" }, { id: "masonry", name: "Masonry" }] });
  localStorage.setItem("structor-ui-p1:procurement", JSON.stringify({ packages: [{ id: "concrete", name: "Concrete", owner: "Sadie" }, { id: "steel", name: "Steel" }] }));
  S.noteDraftSaved("p1", "procurement");
  await wait(2600);
  const merged = await stored("scope=p1&key=procurement");
  assert.deepEqual(merged.packages.map(p => [p.id, p.owner ?? ""]), [["concrete", "Sadie"], ["steel", ""], ["masonry", ""]], "Our owner and their new trade both stand");
  assert.deepEqual(JSON.parse(localStorage.getItem("structor-ui-p1:procurement")), merged, "This browser has the merged copy too");

  // A full browser: other projects' drafts already in the shared copy make room; changes not sent yet never do.
  localStorage.setItem("structor-ui-p3:procurement", JSON.stringify({ unsent: true }));
  S.noteDraftSaved("p3", "procurement"); // waiting to be sent
  assert.equal(S.freeStorage("p1"), true, "Room was made");
  assert.equal(localStorage.getItem("structor-ui-p2:extraction"), null, "p2's findings, safe in the shared copy, were dropped here");
  assert.notEqual(localStorage.getItem("structor-ui-p3:procurement"), null, "p3's unsent change was kept");
  assert.notEqual(localStorage.getItem("structor-ui-p1:procurement"), null, "The open project's drafts are kept");
  await S.syncProject("p2");
  assert.deepEqual(JSON.parse(localStorage.getItem("structor-ui-p2:extraction")), { runs: [{ id: "r1" }] }, "Opening p2 brings its findings back");
  await wait(2600);
} finally {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log("Shared sync checked: another person's project and drafts arrive, a browser's own projects go up with their drafts, changes go up and merge with someone else's, a full browser makes room without losing unsent changes.");

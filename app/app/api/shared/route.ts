import { gunzipSync } from "node:zlib";
import { MAX_SAVED_BYTES, sharedStore, validKey, validScope } from "../../../lib/shared-store";

// Shared saving (lib/shared-store, lib/shared-sync): every screen's saved data, one row per project and draft name.
//   GET  ?scope=<project>             the scope's rows and versions
//   GET  ?scope=<project>&key=<name>  one row's value, gzip-compressed JSON (version in x-version)
//   GET  ?every=<name>                that row of every scope, as JSON (the project records)
//   PUT  ?scope=&key=&base=<version>  saves a gzip-compressed JSON body over `base`; 409 with the current version
//                                     when someone else's save landed first
// 503 when no database is connected: the app then keeps saving in the browser only. The sign-in (proxy.ts) guards it.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const notSetUp = () => json({ error: "Shared saving isn't set up yet: connect the database in Vercel.", configured: false }, 503);
const failed = (error: unknown) => json({ error: `The shared copy couldn't be reached (${error instanceof Error ? error.message : "database error"}).` }, 502);

export async function GET(request: Request) {
  const store = sharedStore();
  if (!store) return notSetUp();
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope"), key = params.get("key"), every = params.get("every");
  try {
    if (every !== null) {
      if (!validKey(every)) return json({ error: "Name the draft." }, 400);
      const rows = await store.everyScope(every);
      return json({ rows: rows.map(({ value, ...r }) => ({ ...r, value: JSON.parse(gunzipSync(Buffer.from(value, "base64")).toString("utf8")) })) });
    }
    if (!validScope(scope)) return json({ error: "Name the project." }, 400);
    if (key === null) return json({ rows: await store.list(scope) });
    if (!validKey(key)) return json({ error: "Name the draft." }, 400);
    const found = await store.get(scope, key);
    if (!found) return json({ error: "Nothing is saved under that name." }, 404);
    return new Response(Buffer.from(found.value, "base64"), { headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-version": String(found.version), "x-updated-at": found.updatedAt } });
  } catch (error) {
    return failed(error);
  }
}

export async function PUT(request: Request) {
  const store = sharedStore();
  if (!store) return notSetUp();
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope"), key = params.get("key"), base = Number(params.get("base"));
  if (!validScope(scope) || !validKey(key)) return json({ error: "Name the project and the draft." }, 400);
  if (!Number.isInteger(base) || base < 0) return json({ error: "Say which version this change was made on." }, 400);
  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > MAX_SAVED_BYTES) return json({ error: `A saved draft must be between 1 byte and ${MAX_SAVED_BYTES / 1_000_000} MB compressed.` }, 413);
  // Only readable JSON is kept: a broken save must not become everyone's copy.
  try { JSON.parse(gunzipSync(body).toString("utf8")); } catch { return json({ error: "The saved draft isn't compressed JSON." }, 400); }
  const by = (request.headers.get("x-by") ?? "").trim().slice(0, 80);
  try {
    const result = await store.save(scope, key, body.toString("base64"), base, by);
    return json({ version: result.version }, result.saved ? 200 : 409);
  } catch (error) {
    return failed(error);
  }
}

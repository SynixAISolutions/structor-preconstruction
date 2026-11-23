import { MemoryRuleError, MEMORY_KINDS, MEMORY_ORIGINS, MEMORY_STATUSES, type MemoryChange, type MemoryInput, type MemoryKind, type MemoryOrigin, type MemoryStatus } from "../../../lib/memory";
import { memoryStore } from "../../../lib/memory-store";

// The AI memory (lib/memory, lib/memory-store):
//   GET   ?status=&kind=&origin=&project=&projectOnly=&trades=&q=&limit=&offset=   entries, best match first when q
//         is given; at most 500 a page, `offset` for the next
//         ?counts=1                                                 how many are proposed, approved and retired
//   POST  { entry }                                                 an estimator's entry, approved at once (200 with
//                                                                   created: false when it is already there)
//   POST  { learn: [corrections] }                                  corrections as proposals; the same one twice is a no-op
//   POST  { status: { ids, to } }                                   approves or retires many at once (an imported sheet)
//   PATCH { id, version, change }                                   approve, retire, restore or reword; 409 with the
//                                                                   current entry when someone else changed it first
// The sign-in (proxy.ts) guards it. 503 when no database is connected.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const notSetUp = () => json({ error: "The AI memory needs the database: connect Neon in Vercel.", configured: false }, 503);
const failed = (error: unknown) => error instanceof MemoryRuleError ? json({ error: error.message }, 400) : json({ error: `The AI memory couldn't be reached (${error instanceof Error ? error.message : "database error"}).` }, 502);
const list = <T extends string>(value: string | null, allowed: readonly T[]): T[] => (value ?? "").split(",").map(v => v.trim()).filter((v): v is T => (allowed as readonly string[]).includes(v));
const byOf = (request: Request) => (request.headers.get("x-by") ?? "").trim().slice(0, 80);

export async function GET(request: Request) {
  const store = memoryStore();
  if (!store) return notSetUp();
  const params = new URL(request.url).searchParams;
  try {
    if (params.get("counts")) return json({ counts: await store.counts() });
    const project = params.get("project") ?? undefined, projectOnly = params.get("projectOnly") ?? undefined;
    const entries = await store.search({
      status: list<MemoryStatus>(params.get("status"), MEMORY_STATUSES), kind: list<MemoryKind>(params.get("kind"), MEMORY_KINDS), origin: list<MemoryOrigin>(params.get("origin"), MEMORY_ORIGINS),
      forProject: project, projectOnly, trades: (params.get("trades") ?? "").split("|").map(t => t.trim()).filter(Boolean).slice(0, 12),
      q: params.get("q") ?? undefined, limit: Number(params.get("limit")) || undefined, offset: Math.max(0, Math.floor(Number(params.get("offset")) || 0)),
    });
    return json({ entries });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  const store = memoryStore();
  if (!store) return notSetUp();
  let body: { entry?: MemoryInput; learn?: MemoryInput[]; status?: { ids?: unknown; to?: unknown } };
  try { body = await request.json(); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  const by = byOf(request);
  if (!by) return json({ error: "Say who is making the change." }, 400);
  try {
    if (Array.isArray(body?.learn)) return json(await store.learn(body.learn.slice(0, 200), by));
    if (body?.status && Array.isArray(body.status.ids) && typeof body.status.to === "string" && (MEMORY_STATUSES as readonly string[]).includes(body.status.to))
      return json({ changed: await store.setStatus(body.status.ids.filter((id): id is string => typeof id === "string"), body.status.to as MemoryStatus, by) });
    if (body?.entry && typeof body.entry === "object") return json(await store.add(body.entry, by));
    return json({ error: "Send an entry, or corrections to learn from." }, 400);
  } catch (error) { return failed(error); }
}

export async function PATCH(request: Request) {
  const store = memoryStore();
  if (!store) return notSetUp();
  let body: { id?: unknown; version?: unknown; change?: MemoryChange };
  try { body = await request.json(); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  const by = byOf(request);
  if (!by) return json({ error: "Say who is making the change." }, 400);
  if (typeof body?.id !== "string" || !Number.isInteger(body.version) || !body.change || typeof body.change !== "object") return json({ error: "Name the entry, its version and the change." }, 400);
  try {
    const result = await store.update(body.id, body.version as number, body.change, by);
    if (result.saved) return json({ entry: result.entry });
    return result.entry ? json({ error: "Someone else changed this entry first. Here is the latest.", entry: result.entry }, 409) : json({ error: "That entry no longer exists." }, 404);
  } catch (error) { return failed(error); }
}

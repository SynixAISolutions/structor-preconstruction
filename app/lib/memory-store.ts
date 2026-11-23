// The AI memory's table in Neon Postgres (lib/memory): one row per entry, indexed for the lookups a scan and the AI
// memory screen make, so reading what applies stays one fast query however much the company has taught it:
//
//   memory_entries_lookup    (status, kind)          approved rules, proposals waiting for review
//   memory_entries_trades    GIN (trades)            entries for a trade: trades && ARRAY['09 29 00', 'drywall']
//   memory_entries_project   (project_id, status)    a project's decisions and rules
//   memory_entries_section   (section)               entries about one specification section
//   memory_entries_search    GIN (search)            full-text search with English stemming ("barriers" finds "barrier"):
//                                                    the words weigh most, then the detail, then the trades and section
//   memory_entries_dedupe    UNIQUE (dedupe_key)     one row per thing learned, however often it is learned
//
// The table is created on first use, like shared_state. The queries are written once against a small `Db` interface,
// so the checks run them against a real Postgres (PGlite) and production against Neon. Locally, without a database, a
// JSON file stands in. Server only.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { cleanMemoryInput, dedupeKey, MemoryRuleError, type MemoryChange, type MemoryEntry, type MemoryEvent, type MemoryInput, type MemoryKind, type MemoryStatus, MEMORY_STATUSES, MEMORY_LIMITS, MEMORY_KINDS } from "./memory";

/** What the store needs from a database: a parameterized query returning rows. */
export type Db = { query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]> };

export type MemoryQuery = {
  status?: MemoryStatus[]; kind?: MemoryKind[];
  /** Entries for the whole company plus this project's own. */
  forProject?: string;
  /** Only this project's own entries. */
  projectOnly?: string;
  /** Entries tagged with any of these trades, or with none (every trade). */
  trades?: string[];
  /** Full-text search over the words, detail, trades and section. */
  q?: string;
  limit?: number;
};
export type MemoryCounts = Record<MemoryStatus, number>;
export type UpdateResult = { saved: true; entry: MemoryEntry } | { saved: false; entry: MemoryEntry | null };

export interface MemoryStore {
  search(query: MemoryQuery): Promise<MemoryEntry[]>;
  counts(): Promise<MemoryCounts>;
  get(id: string): Promise<MemoryEntry | null>;
  /** An estimator's entry, approved at once; the existing one when it is already there. */
  add(input: MemoryInput, by: string): Promise<{ entry: MemoryEntry; created: boolean }>;
  /** Corrections as proposals: new ones added, known ones counted once per correction id. */
  learn(inputs: MemoryInput[], by: string): Promise<{ added: number; seenAgain: number }>;
  /** Changes an entry saved at version `base`; refused, with the current entry, when someone else's change landed first. */
  update(id: string, base: number, change: MemoryChange, by: string): Promise<UpdateResult>;
}

export const MAX_RESULTS = 500;

/** Creates the table and its indexes, once per process. Statements run one at a time (Neon's HTTP driver takes one). */
export const MEMORY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS memory_entries (
    id text PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('rule', 'example', 'decision')),
    status text NOT NULL CHECK (status IN ('proposed', 'approved', 'retired')),
    origin text NOT NULL CHECK (origin IN ('estimator', 'correction', 'import')),
    project_id text,
    trades text[] NOT NULL DEFAULT '{}',
    tags text NOT NULL DEFAULT '',
    section text,
    text text NOT NULL,
    detail text NOT NULL DEFAULT '',
    dedupe_key text NOT NULL,
    seen integer NOT NULL DEFAULT 1,
    events jsonb NOT NULL DEFAULT '[]',
    source jsonb NOT NULL DEFAULT '{}',
    history jsonb NOT NULL DEFAULT '[]',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL DEFAULT '',
    search tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('english', text), 'A') || setweight(to_tsvector('english', detail), 'B') || setweight(to_tsvector('simple', coalesce(section, '') || ' ' || tags), 'C')
    ) STORED
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS memory_entries_dedupe ON memory_entries (dedupe_key)`,
  `CREATE INDEX IF NOT EXISTS memory_entries_lookup ON memory_entries (status, kind)`,
  `CREATE INDEX IF NOT EXISTS memory_entries_trades ON memory_entries USING GIN (trades)`,
  `CREATE INDEX IF NOT EXISTS memory_entries_project ON memory_entries (project_id, status) WHERE project_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS memory_entries_section ON memory_entries (section) WHERE section IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS memory_entries_search ON memory_entries USING GIN (search)`,
];

const COLUMNS = "id, kind, status, origin, project_id, trades, section, text, detail, seen, events, source, history, version, created_at, created_by, updated_at, updated_by";
const json = <T>(value: unknown, fallback: T): T => typeof value === "string" ? JSON.parse(value) as T : (value ?? fallback) as T;
const iso = (value: unknown) => new Date(value as string).toISOString();
const textArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : typeof value === "string" && value.startsWith("{") ? value.slice(1, -1).split(",").filter(Boolean).map(v => v.replace(/^"|"$/g, "")) : [];

export function rowToEntry(r: Record<string, unknown>): MemoryEntry {
  return {
    id: String(r.id), kind: r.kind as MemoryKind, status: r.status as MemoryStatus, origin: r.origin as MemoryEntry["origin"],
    projectId: (r.project_id as string | null) ?? null, trades: textArray(r.trades), section: (r.section as string | null) ?? null,
    text: String(r.text), detail: String(r.detail ?? ""), seen: Number(r.seen), events: json<string[]>(r.events, []),
    source: json<Record<string, string>>(r.source, {}), history: json<MemoryEvent[]>(r.history, []), version: Number(r.version),
    createdAt: iso(r.created_at), createdBy: String(r.created_by ?? ""), updatedAt: iso(r.updated_at), updatedBy: String(r.updated_by ?? ""),
  };
}

/** Arrays go in as JSON and are unpacked in SQL, so the same query runs on Neon's driver and on PGlite. */
const asTextArray = (n: number) => `ARRAY(SELECT jsonb_array_elements_text($${n}::jsonb))`;

export function postgresMemory(db: Db): MemoryStore {
  let ready: Promise<unknown> | null = null;
  const table = () => ready ??= (async () => { for (const statement of MEMORY_SCHEMA) await db.query(statement); })().catch(error => { ready = null; throw error; });
  const one = async (id: string) => { const r = (await db.query(`SELECT ${COLUMNS} FROM memory_entries WHERE id = $1`, [id]))[0]; return r ? rowToEntry(r) : null; };
  const insert = async (input: ReturnType<typeof cleanMemoryInput>, by: string, action: MemoryEvent["action"]) => {
    const now = new Date().toISOString();
    const rows = await db.query(
      `INSERT INTO memory_entries (id, kind, status, origin, project_id, trades, tags, section, text, detail, dedupe_key, seen, events, source, history, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, ${asTextArray(6)}, $15, $7, $8, $9, $10, 1, $11::jsonb, $12::jsonb, $13::jsonb, $14, $14)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING ${COLUMNS}`,
      [randomUUID(), input.kind, input.status, input.origin, input.projectId, JSON.stringify(input.trades), input.section, input.text, input.detail, dedupeKey(input),
        JSON.stringify(input.events), JSON.stringify(input.source), JSON.stringify([{ at: now, by, action }]), by, input.trades.join(" ")]);
    return rows[0] ? rowToEntry(rows[0]) : null;
  };
  return {
    async search(query) {
      await table();
      const where: string[] = [], params: unknown[] = [];
      const add = (value: unknown) => { params.push(value); return params.length; };
      if (query.status?.length) where.push(`status = ANY(${asTextArray(add(JSON.stringify(query.status)))})`);
      if (query.kind?.length) where.push(`kind = ANY(${asTextArray(add(JSON.stringify(query.kind)))})`);
      if (query.forProject) where.push(`(project_id IS NULL OR project_id = $${add(query.forProject)})`);
      if (query.projectOnly) where.push(`project_id = $${add(query.projectOnly)}`);
      if (query.trades?.length) where.push(`(trades = '{}' OR trades && ${asTextArray(add(JSON.stringify(query.trades)))})`);
      let order = "CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, seen DESC, updated_at DESC";
      if (query.q?.trim()) {
        const n = add(query.q.trim().slice(0, 200));
        where.push(`search @@ websearch_to_tsquery('english', $${n})`);
        order = `ts_rank(search, websearch_to_tsquery('english', $${n})) DESC, seen DESC, updated_at DESC`;
      }
      const limit = add(Math.max(1, Math.min(MAX_RESULTS, query.limit ?? 200)));
      const rows = await db.query(`SELECT ${COLUMNS} FROM memory_entries ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT $${limit}`, params);
      return rows.map(rowToEntry);
    },
    async counts() {
      await table();
      const rows = await db.query(`SELECT status, count(*)::int AS n FROM memory_entries GROUP BY status`);
      return Object.fromEntries(MEMORY_STATUSES.map(s => [s, Number(rows.find(r => r.status === s)?.n ?? 0)])) as MemoryCounts;
    },
    async get(id) { await table(); return one(id); },
    async add(raw, by) {
      await table();
      const input = cleanMemoryInput({ ...raw, origin: "estimator", events: [] });
      const created = await insert(input, by, "added");
      if (created) return { entry: created, created: true };
      const there = (await db.query(`SELECT ${COLUMNS} FROM memory_entries WHERE dedupe_key = $1`, [dedupeKey(input)]))[0];
      return { entry: rowToEntry(there!), created: false };
    },
    async learn(raws, by) {
      await table();
      let added = 0, seenAgain = 0;
      for (const raw of raws.slice(0, 200)) {
        let input: ReturnType<typeof cleanMemoryInput>;
        try { input = cleanMemoryInput({ ...raw, origin: raw.origin === "import" ? "import" : "correction" }); } catch (error) { if (error instanceof MemoryRuleError) continue; throw error; }
        if (!input.events.length) continue;
        if (await insert(input, by, "proposed")) { added++; continue; }
        // Known already: count each new correction once; one sent again changes nothing.
        const now = new Date().toISOString();
        const bumped = await db.query(
          `UPDATE memory_entries SET seen = seen + 1, events = events || $2::jsonb, history = history || $3::jsonb, version = version + 1, updated_at = now(), updated_by = $4
           WHERE dedupe_key = $1 AND NOT (events @> $2::jsonb) RETURNING id`,
          [dedupeKey(input), JSON.stringify(input.events), JSON.stringify([{ at: now, by, action: "seen-again" }]), by]);
        if (bumped.length) seenAgain++;
      }
      return { added, seenAgain };
    },
    async update(id, base, change, by) {
      await table();
      const current = await one(id);
      if (!current) return { saved: false, entry: null };
      const next = applyChange(current, change);
      const action: MemoryEvent["action"] = change.status && change.status !== current.status
        ? change.status === "approved" ? (current.status === "retired" ? "restored" : "approved") : change.status === "retired" ? "retired" : "edited"
        : "edited";
      const rows = await db.query(
        `UPDATE memory_entries SET status = $3, text = $4, detail = $5, trades = ${asTextArray(6)}, tags = $11, section = $7, dedupe_key = $8,
           history = history || $9::jsonb, version = version + 1, updated_at = now(), updated_by = $10
         WHERE id = $1 AND version = $2 RETURNING ${COLUMNS}`,
        [id, base, next.status, next.text, next.detail, JSON.stringify(next.trades), next.section, dedupeKey(next),
          JSON.stringify([{ at: new Date().toISOString(), by, action }]), by, next.trades.join(" ")]).catch(error => {
        if (/duplicate key|unique/i.test(String(error?.message))) throw new MemoryRuleError("Another entry already says exactly that.");
        throw error;
      });
      return rows[0] ? { saved: true, entry: rowToEntry(rows[0]) } : { saved: false, entry: await one(id) };
    },
  };
}

/** An entry with an estimator's change applied and checked. Throws a MemoryRuleError with a message to show. */
export function applyChange(entry: MemoryEntry, change: MemoryChange): MemoryEntry {
  const status = change.status ?? entry.status;
  if (!(MEMORY_STATUSES as readonly string[]).includes(status)) throw new MemoryRuleError("Choose proposed, approved or retired.");
  const checked = cleanMemoryInput({ kind: entry.kind, projectId: entry.projectId, origin: entry.origin,
    text: change.text ?? entry.text, detail: change.detail ?? entry.detail, trades: change.trades ?? entry.trades, section: change.section === undefined ? entry.section : change.section });
  return { ...entry, status, text: checked.text, detail: checked.detail, trades: checked.trades, section: checked.section };
}

/** The local stand-in: one JSON file, changes one at a time; the same rules, plain word search. Never used in production. */
export function fileMemory(file: string): MemoryStore {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<MemoryEntry[]> => JSON.parse(await fs.readFile(file, "utf8").catch(() => "[]"));
  const write = async (rows: MemoryEntry[]) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(rows)); };
  const serial = <T>(run: () => Promise<T>): Promise<T> => { const next = queue.then(run); queue = next.catch(() => {}); return next; };
  const make = (input: ReturnType<typeof cleanMemoryInput>, by: string, action: MemoryEvent["action"]): MemoryEntry => {
    const now = new Date().toISOString();
    return { id: randomUUID(), kind: input.kind, status: input.status, origin: input.origin, projectId: input.projectId, trades: input.trades, section: input.section,
      text: input.text, detail: input.detail, seen: 1, events: input.events, source: input.source, history: [{ at: now, by, action }], version: 1, createdAt: now, createdBy: by, updatedAt: now, updatedBy: by };
  };
  const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const stem = (w: string) => w.replace(/(ies|es|s)$/, "");
  return {
    async search(query) {
      const terms = words(query.q ?? "").map(stem), tags = (query.trades ?? []).map(t => t.toLowerCase());
      const rank: Record<MemoryStatus, number> = { proposed: 0, approved: 1, retired: 2 };
      return (await read()).filter(e => (!query.status?.length || query.status.includes(e.status)) && (!query.kind?.length || query.kind.includes(e.kind))
        && (!query.forProject || !e.projectId || e.projectId === query.forProject) && (!query.projectOnly || e.projectId === query.projectOnly)
        && (!tags.length || !e.trades.length || e.trades.some(t => tags.includes(t.toLowerCase())))
        && (!terms.length || terms.every(t => words(`${e.text} ${e.detail} ${e.section ?? ""} ${e.trades.join(" ")}`).map(stem).includes(t))))
        .sort((a, b) => rank[a.status] - rank[b.status] || b.seen - a.seen || b.updatedAt.localeCompare(a.updatedAt)).slice(0, Math.min(MAX_RESULTS, query.limit ?? 200));
    },
    async counts() { const rows = await read(); return Object.fromEntries(MEMORY_STATUSES.map(s => [s, rows.filter(e => e.status === s).length])) as MemoryCounts; },
    async get(id) { return (await read()).find(e => e.id === id) ?? null; },
    add(raw, by) {
      return serial(async () => {
        const input = cleanMemoryInput({ ...raw, origin: "estimator", events: [] }), rows = await read();
        const there = rows.find(e => dedupeKey(e) === dedupeKey(input));
        if (there) return { entry: there, created: false };
        const entry = make(input, by, "added");
        await write([...rows, entry]);
        return { entry, created: true };
      });
    },
    learn(raws, by) {
      return serial(async () => {
        const rows = await read();
        let added = 0, seenAgain = 0;
        for (const raw of raws.slice(0, 200)) {
          let input: ReturnType<typeof cleanMemoryInput>;
          try { input = cleanMemoryInput({ ...raw, origin: raw.origin === "import" ? "import" : "correction" }); } catch (error) { if (error instanceof MemoryRuleError) continue; throw error; }
          if (!input.events.length) continue;
          const there = rows.find(e => dedupeKey(e) === dedupeKey(input));
          if (!there) { rows.push(make(input, by, "proposed")); added++; continue; }
          if (input.events.every(e => there.events.includes(e))) continue;
          Object.assign(there, { seen: there.seen + 1, events: [...there.events, ...input.events], history: [...there.history, { at: new Date().toISOString(), by, action: "seen-again" }], version: there.version + 1, updatedAt: new Date().toISOString(), updatedBy: by });
          seenAgain++;
        }
        if (added || seenAgain) await write(rows);
        return { added, seenAgain };
      });
    },
    update(id, base, change, by) {
      return serial(async (): Promise<UpdateResult> => {
        const rows = await read(), i = rows.findIndex(e => e.id === id);
        if (i < 0) return { saved: false, entry: null };
        if (rows[i].version !== base) return { saved: false, entry: rows[i] };
        const next = applyChange(rows[i], change);
        if (rows.some((e, j) => j !== i && dedupeKey(e) === dedupeKey(next))) throw new MemoryRuleError("Another entry already says exactly that.");
        const action: MemoryEvent["action"] = change.status && change.status !== rows[i].status ? (change.status === "approved" ? (rows[i].status === "retired" ? "restored" : "approved") : change.status === "retired" ? "retired" : "edited") : "edited";
        rows[i] = { ...next, history: [...next.history, { at: new Date().toISOString(), by, action }], version: next.version + 1, updatedAt: new Date().toISOString(), updatedBy: by };
        await write(rows);
        return { saved: true, entry: rows[i] };
      });
    },
  };
}

let store: MemoryStore | null | undefined;
/** Neon when the database is connected, a local file in development, or null (then the memory screen says why). */
export function memoryStore(): MemoryStore | null {
  if (store !== undefined) return store;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) { const sql = neon(url); store = postgresMemory({ query: (text, params) => sql.query(text, params ?? []) as Promise<Record<string, unknown>[]> }); }
  else store = process.env.NODE_ENV !== "production" ? fileMemory(path.join(process.cwd(), ".data", "memory.json")) : null;
  return store;
}

export { MEMORY_KINDS, MEMORY_LIMITS };

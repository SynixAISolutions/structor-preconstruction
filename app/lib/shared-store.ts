// Server storage for shared saving (Danial, 3 Nov: Marcel and Danial each saw only what their own browser had saved,
// so a project, its scopes and its bid forms never reached the other). Every screen's saved data is one row per
// project and draft name, kept in Neon Postgres (Danial's choice over Vercel Blob, whose free plan allows about 2,000
// saves a month). A row holds the draft as gzip-compressed JSON in base64, compressed in the browser so a big AI run's
// findings stay under Vercel's 4.5 MB request limit, and a version that goes up by one on every save: a save names
// the version it was based on and is refused when someone else's landed first (lib/shared-sync merges and tries again).
// Locally, without a database, a JSON file under .data/ stands in so the app can be tried end to end. Server only.

import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { ORG_SCOPE } from "./shared-merge";

/** Whose data a row is: a project's id, or ORG_SCOPE for the organization's drafts (the subcontractor directory…). */
export { ORG_SCOPE };
const SCOPE = /^(_org|[A-Za-z0-9][A-Za-z0-9_-]{0,79})$/;
const KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const validScope = (value: unknown): value is string => typeof value === "string" && SCOPE.test(value);
export const validKey = (value: unknown): value is string => typeof value === "string" && KEY.test(value);
/** The largest compressed draft a save may send: Vercel refuses request bodies over 4.5 MB. */
export const MAX_SAVED_BYTES = 4_000_000;

export type SharedRow = { scope: string; key: string; version: number; updatedAt: string; updatedBy: string };
/** A row with its value: base64 of the gzip-compressed JSON. */
export type SharedValue = SharedRow & { value: string };
export type SaveResult = { saved: true; version: number } | { saved: false; version: number };

export interface SharedStore {
  /** The rows of a scope, without their values. */
  list(scope: string): Promise<SharedRow[]>;
  get(scope: string, key: string): Promise<SharedValue | null>;
  /** Every scope's row for one key, with values: the project records ("project"). */
  everyScope(key: string): Promise<SharedValue[]>;
  /** Saves over version `base` (0: a new row); refused, with the current version, when that isn't the stored one. */
  save(scope: string, key: string, value: string, base: number, by: string): Promise<SaveResult>;
}

type Row = { scope: string; key: string; version: number; updated_at: string | Date; updated_by: string; value?: string };
const row = (r: Row): SharedRow => ({ scope: r.scope, key: r.key, version: Number(r.version), updatedAt: new Date(r.updated_at).toISOString(), updatedBy: r.updated_by });

function postgresStore(url: string): SharedStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const table = () => ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS shared_state (scope text NOT NULL, key text NOT NULL, value text NOT NULL, version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL DEFAULT '', PRIMARY KEY (scope, key))`;
    await sql`CREATE INDEX IF NOT EXISTS shared_state_key ON shared_state (key)`;
  })().catch(error => { ready = null; throw error; });
  const current = async (scope: string, key: string) => Number(((await sql`SELECT version FROM shared_state WHERE scope = ${scope} AND key = ${key}`) as Row[])[0]?.version ?? 0);
  return {
    async list(scope) {
      await table();
      return ((await sql`SELECT scope, key, version, updated_at, updated_by FROM shared_state WHERE scope = ${scope} ORDER BY key`) as Row[]).map(row);
    },
    async get(scope, key) {
      await table();
      const found = ((await sql`SELECT scope, key, version, updated_at, updated_by, value FROM shared_state WHERE scope = ${scope} AND key = ${key}`) as Row[])[0];
      return found ? { ...row(found), value: found.value! } : null;
    },
    async everyScope(key) {
      await table();
      return ((await sql`SELECT scope, key, version, updated_at, updated_by, value FROM shared_state WHERE key = ${key} ORDER BY scope`) as Row[]).map(r => ({ ...row(r), value: r.value! }));
    },
    async save(scope, key, value, base, by) {
      await table();
      const done = base === 0
        ? await sql`INSERT INTO shared_state (scope, key, value, version, updated_by) VALUES (${scope}, ${key}, ${value}, 1, ${by}) ON CONFLICT (scope, key) DO NOTHING RETURNING version`
        : await sql`UPDATE shared_state SET value = ${value}, version = version + 1, updated_at = now(), updated_by = ${by} WHERE scope = ${scope} AND key = ${key} AND version = ${base} RETURNING version`;
      const version = Number((done as Row[])[0]?.version ?? 0);
      return version ? { saved: true, version } : { saved: false, version: await current(scope, key) };
    },
  };
}

/** The local stand-in: one JSON file of rows, saves one at a time. Never used in production. */
function fileStore(file: string): SharedStore {
  type Saved = Record<string, SharedValue>;
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Saved> => JSON.parse(await fs.readFile(file, "utf8").catch(() => "{}"));
  const id = (scope: string, key: string) => `${scope}\n${key}`;
  const bare = ({ value: _value, ...r }: SharedValue): SharedRow => r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    async list(scope) { return Object.values(await read()).filter(r => r.scope === scope).map(bare).sort((a, b) => a.key.localeCompare(b.key)); },
    async get(scope, key) { return (await read())[id(scope, key)] ?? null; },
    async everyScope(key) { return Object.values(await read()).filter(r => r.key === key).sort((a, b) => a.scope.localeCompare(b.scope)); },
    save(scope, key, value, base, by) {
      const run = queue.then(async (): Promise<SaveResult> => {
        const rows = await read(), was = rows[id(scope, key)];
        if ((was?.version ?? 0) !== base) return { saved: false, version: was?.version ?? 0 };
        rows[id(scope, key)] = { scope, key, value, version: base + 1, updatedAt: new Date().toISOString(), updatedBy: by };
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(rows));
        return { saved: true, version: base + 1 };
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

let store: SharedStore | null | undefined;
/** The shared store: Neon when the database is connected (Vercel's Neon integration sets DATABASE_URL), the local
 * file in development, or null when neither: then every screen keeps saving in the browser only, as before. */
export function sharedStore(): SharedStore | null {
  if (store !== undefined) return store;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  store = url ? postgresStore(url) : process.env.NODE_ENV !== "production" ? fileStore(path.join(process.cwd(), ".data", "shared-state.json")) : null;
  return store;
}

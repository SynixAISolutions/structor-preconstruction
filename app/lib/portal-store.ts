// The portal's way into shared saving (lib/shared-store). A row is gzip-compressed JSON with a version. A change reads
// the row, makes its change and saves over that version, starting again if someone else's save landed first, so a sub's
// bid can't overwrite what an estimator just saved. Open screens bring it in as they do any shared change. Server only.

import { gunzipSync, gzipSync } from "node:zlib";
import { MAX_SAVED_BYTES, type SharedStore } from "./shared-store";
import { sampleProcurement } from "./data/procurement";
import { sampleSubmissions } from "./data/sample-award";
import type { Procurement } from "./procurement";
import type { Submission } from "./submissions";
import type { BidMessage, PortalInvite } from "./bid-portal";

// The built-in sample project's drafts start from its sample data until someone saves them (lib/project-scope), and a
// first save here must not replace that data with one bid. Other projects' start empty.
const SAMPLE_PROJECT = "jelleff";
const EMPTY_PROCUREMENT: Procurement = { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] };
export const startingProcurement = (projectId: string): Procurement => projectId === SAMPLE_PROJECT ? sampleProcurement : EMPTY_PROCUREMENT;
export const startingSubmissions = (projectId: string): Submission[] => projectId === SAMPLE_PROJECT ? sampleSubmissions : [];
export const NO_MESSAGES: BidMessage[] = [];
export const NO_INVITES: PortalInvite[] = [];

export const packRow = (value: unknown) => gzipSync(JSON.stringify(value)).toString("base64");
const unpackRow = <T>(stored: string): T => JSON.parse(gunzipSync(Buffer.from(stored, "base64")).toString("utf8")) as T;

export async function readRow<T>(store: SharedStore, scope: string, key: string, initial: T): Promise<{ value: T; version: number }> {
  const found = await store.get(scope, key);
  return found ? { value: unpackRow<T>(found.value), version: found.version } : { value: initial, version: 0 };
}

/** Applies `change` to a row. Returning the same value saves nothing. Rule errors from `change` come straight back. */
export async function changeRow<T>(store: SharedStore, scope: string, key: string, initial: T, change: (current: T) => T, by = "Subcontractor portal"): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { value, version } = await readRow(store, scope, key, initial);
    const next = change(value);
    if (next === value) return value;
    const packed = packRow(next);
    if (packed.length > MAX_SAVED_BYTES * 1.4) throw new Error("This project's saved data has grown too large.");
    if ((await store.save(scope, key, packed, version, by)).saved) return next;
  }
  throw new Error("Others keep changing this at the same time. Try again.");
}

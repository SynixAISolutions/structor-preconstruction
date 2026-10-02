// Bringing a returning browser up to the current Jelleff sample without losing its saved work.
//
// Screens keep the Jelleff project's drafts in this browser under "structor-ui-<key>". A browser
// that opened Jelleff before the sample changed keeps its saved copies, so it never sees the new
// sample. Nothing here runs by itself: the person chooses to load the updated sample, and before
// any saved key is removed every one is copied into a backup they can restore or download. If the
// backup can't be written (storage full), nothing is removed.
//
// Untouched by any of this: other projects' drafts ("structor-ui-<projectId>:<key>"), the
// organization-wide directory and portal profile, the project list, the open project, and the
// bid-leveling workspace (IndexedDB).

import { GLOBAL_DRAFT_KEYS } from "./project-scope";

/** Bump when the Jelleff sample changes in a way returning browsers should be offered. */
export const SAMPLE_VERSION = "2026-10-02";
/** What changed, for the offer to load it. */
export const SAMPLE_CHANGES = "Concrete now runs from the published bid form through District Concrete's bid, award, Exhibit A and executed subcontract to its submittals, and the schedule has linked activities.";

export const SAMPLE_VERSION_KEY = "structor-sample-version";
const BACKUP_PREFIX = "structor-sample-backup:";
const PREFIX = "structor-ui-";
/** Keys under the prefix that are not Jelleff drafts. */
const NOT_DRAFTS = new Set(["projects", "active-project", ...GLOBAL_DRAFT_KEYS]);

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export type SampleBackup = { key: string; at: string; version: string | null; keys: string[]; bytes: number };
export type SampleStatus = {
  current: string;
  /** Sample version this browser's saved Jelleff data belongs to; null if it predates versioning. */
  applied: string | null;
  /** Jelleff drafts saved in this browser. */
  savedKeys: string[];
  /** Saved Jelleff data from an older sample: offer the choice. */
  needsChoice: boolean;
};

export class SampleRefreshError extends Error {
  constructor(message: string) { super(message); this.name = "SampleRefreshError"; }
}

const keysOf = (storage: StorageLike): string[] => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null);

const isJelleffDraft = (k: string) => k.startsWith(PREFIX) && k.length > PREFIX.length && !k.slice(PREFIX.length).includes(":") && !NOT_DRAFTS.has(k.slice(PREFIX.length));

/** The Jelleff project's saved drafts in this browser. */
export function jelleffDraftKeys(storage: StorageLike): string[] {
  return keysOf(storage).filter(isJelleffDraft).sort();
}

export function sampleStatus(storage: StorageLike): SampleStatus {
  const savedKeys = jelleffDraftKeys(storage);
  const applied = storage.getItem(SAMPLE_VERSION_KEY);
  return { current: SAMPLE_VERSION, applied, savedKeys, needsChoice: savedKeys.length > 0 && applied !== SAMPLE_VERSION };
}

/** A browser with no saved Jelleff data starts on the current sample: record that, once. */
export function markFreshBrowser(storage: StorageLike): void {
  if (storage.getItem(SAMPLE_VERSION_KEY) === null && !jelleffDraftKeys(storage).length) storage.setItem(SAMPLE_VERSION_KEY, SAMPLE_VERSION);
}

/** "Keep my data": stop offering this sample version; nothing else changes. */
export function keepMyData(storage: StorageLike): void {
  storage.setItem(SAMPLE_VERSION_KEY, SAMPLE_VERSION);
}

/** Copies the Jelleff drafts into a new backup and returns its key. Throws, having changed nothing, when it can't be stored. */
function backup(storage: StorageLike, at: string): string {
  const keys = jelleffDraftKeys(storage);
  const entries = Object.fromEntries(keys.map(k => [k, storage.getItem(k)]));
  let key = `${BACKUP_PREFIX}${at}`;
  for (let n = 2; storage.getItem(key) !== null; n++) key = `${BACKUP_PREFIX}${at}#${n}`;
  try {
    storage.setItem(key, JSON.stringify({ at, version: storage.getItem(SAMPLE_VERSION_KEY), entries }));
  } catch {
    throw new SampleRefreshError("There isn't enough browser storage for a backup, so nothing was changed. Download a backup or delete an old one first.");
  }
  return key;
}

/**
 * Loads the current sample: backs up every Jelleff draft, then removes them so each screen starts
 * from the new sample. Returns the backup's key. Reload the page afterwards.
 */
export function loadUpdatedSample(storage: StorageLike, at = new Date().toISOString()): string {
  const saved = backup(storage, at);
  for (const k of jelleffDraftKeys(storage)) storage.removeItem(k);
  storage.setItem(SAMPLE_VERSION_KEY, SAMPLE_VERSION);
  return saved;
}

function readBackup(storage: StorageLike, key: string): { at: string; version: string | null; entries: Record<string, string> } {
  if (!key.startsWith(BACKUP_PREFIX)) throw new SampleRefreshError("That is not a sample backup.");
  const raw = storage.getItem(key);
  if (raw === null) throw new SampleRefreshError("That backup no longer exists.");
  try {
    const parsed = JSON.parse(raw);
    const entries = parsed?.entries;
    if (!entries || typeof entries !== "object") throw new Error();
    for (const [k, v] of Object.entries(entries)) if (!isJelleffDraft(k) || typeof v !== "string") throw new Error();
    return { at: String(parsed.at ?? ""), version: typeof parsed.version === "string" ? parsed.version : null, entries };
  } catch {
    throw new SampleRefreshError("That backup can't be read.");
  }
}

/** Backups in this browser, newest first. */
export function listSampleBackups(storage: StorageLike): SampleBackup[] {
  return keysOf(storage).filter(k => k.startsWith(BACKUP_PREFIX)).flatMap(key => {
    try {
      const b = readBackup(storage, key);
      return [{ key, at: b.at, version: b.version, keys: Object.keys(b.entries).sort(), bytes: storage.getItem(key)!.length }];
    } catch { return []; }
  }).sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}

/**
 * Puts a backup's Jelleff drafts back. The drafts there now are backed up first, so restoring is
 * itself reversible. Returns the key of that new backup. Reload the page afterwards.
 */
export function restoreSampleBackup(storage: StorageLike, key: string, at = new Date().toISOString()): string {
  const b = readBackup(storage, key);
  const current = jelleffDraftKeys(storage).map(k => [k, storage.getItem(k)!] as const);
  const currentVersion = storage.getItem(SAMPLE_VERSION_KEY);
  const saved = backup(storage, at);
  try {
    for (const k of jelleffDraftKeys(storage)) storage.removeItem(k);
    for (const [k, v] of Object.entries(b.entries)) storage.setItem(k, v);
    if (b.version === null) storage.removeItem(SAMPLE_VERSION_KEY); else storage.setItem(SAMPLE_VERSION_KEY, b.version);
  } catch {
    try {
      for (const k of jelleffDraftKeys(storage)) storage.removeItem(k);
      for (const [k, v] of current) storage.setItem(k, v);
      if (currentVersion === null) storage.removeItem(SAMPLE_VERSION_KEY); else storage.setItem(SAMPLE_VERSION_KEY, currentVersion);
      storage.removeItem(saved);
    } catch {
      throw new SampleRefreshError("Restore stopped. Your previous Jelleff data is in the newest backup; download it before trying again.");
    }
    throw new SampleRefreshError("This backup could not be restored with the available browser storage. Your current Jelleff data was kept.");
  }
  return saved;
}

export function deleteSampleBackup(storage: StorageLike, key: string): void {
  readBackup(storage, key);
  storage.removeItem(key);
}

/** A backup as a JSON file to download. */
export function sampleBackupFile(storage: StorageLike, key: string): { name: string; text: string } {
  const b = readBackup(storage, key);
  return { name: `structor-jelleff-backup-${b.at.slice(0, 19).replace(/[:T]/g, "-")}.json`, text: JSON.stringify(b, null, 2) };
}

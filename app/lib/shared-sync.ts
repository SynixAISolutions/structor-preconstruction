"use client";

// Shared saving, the browser side (Danial, 3 Nov: what Marcel saved never reached Danial's browser, nor the other way
// round). Every screen still saves in this browser first, so it stays instant and works offline; this module then
// copies each change to the shared copy (app/api/shared, lib/shared-store) a couple of seconds later, and brings in
// other people's changes when a project opens, when the tab comes back into view, and every 45 seconds while it is in
// view. When two people changed the same thing, both changes are kept where they can be (lib/shared-merge).
// Projects are shared the same way, one record each. A person's own Ask Structor chat and the portal preview they act
// in stay theirs. Without a database (no DATABASE_URL), nothing changes: every screen keeps saving in the browser only.

import { useEffect, useSyncExternalStore } from "react";
import { GLOBAL_DRAFT_KEYS, draftStorageKey } from "./project-scope";
import { mergeJson, ORG_SCOPE, sameJson } from "./shared-merge";
import { sampleProjectRecords } from "./projects";

/** Fired on window, with the storage key as detail, when a draft is changed outside its screen. */
export const DRAFT_CHANGED = "structor-draft-changed";
export const announceDraftChange = (storageKey: string) => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DRAFT_CHANGED, { detail: storageKey })); };

/** Drafts that belong to one person, not the team. */
const OWN_DRAFTS = new Set(["assistant-chat", "portal-acting-invitation"]);
/** The project list, kept in this browser by lib/projects (its PROJECTS_STORAGE_KEY). */
const PROJECTS_KEY = "structor-ui-projects";
const VERSIONS_KEY = "structor-shared-versions", WAITING_KEY = "structor-shared-waiting";
/** A change is sent this long after the last edit, and never later than SAVE_WITHIN after the first. */
const SAVE_AFTER = 2_000, SAVE_WITHIN = 10_000, LOOK_EVERY = 45_000, RETRY_AFTER = 30_000;

// ── Status, for the top bar and the AI run ──
export type SharedState = "unknown" | "off" | "saved" | "saving" | "offline";
type Status = { state: SharedState; pulled: ReadonlySet<string>; projects: number };
let status: Status = { state: "unknown", pulled: new Set(), projects: 0 };
const listeners = new Set<() => void>();
const set = (change: Partial<Status>) => { status = { ...status, ...change }; listeners.forEach(l => l()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSharedStatus = (): Status => useSyncExternalStore(subscribe, () => status, () => status);
/** Whether this project's shared copy has been brought in (or can't be: no database, or no connection), so a screen
 * can act on the project's saved state without missing what someone else saved. */
export const sharedReady = (scope: string) => status.state === "off" || status.state === "offline" || status.pulled.has(scope);

// ── What this browser last had from the shared copy ──
const id = (scope: string, key: string) => `${scope}\n${key}`;
const readJson = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } };
const writeJson = (key: string, value: unknown, keep?: string) => {
  const text = JSON.stringify(value);
  try { localStorage.setItem(key, text); } catch {
    // Storage full: make room from other projects' copies and try once more; else the shared copy still has it.
    try { if (keep !== undefined && freeStorage(keep)) localStorage.setItem(key, text); } catch { /* still full */ }
  }
};
const versions = () => readJson<Record<string, number>>(VERSIONS_KEY, {});
const setVersion = (slot: string, version: number) => writeJson(VERSIONS_KEY, { ...versions(), [slot]: version });
/** Changes made here and not yet in the shared copy, kept across reloads: [scope, key] pairs. */
const waiting = () => readJson<[string, string][]>(WAITING_KEY, []);
const setWaiting = (scope: string, key: string, on: boolean) => {
  const rest = waiting().filter(([s, k]) => s !== scope || k !== key);
  writeJson(WAITING_KEY, on ? [...rest, [scope, key]] : rest);
};
/** The copy each draft was last in step with, for merging (lost on reload: then this browser's values win). */
const bases = new Map<string, unknown>();

/**
 * Makes room in this browser's storage (about 5 to 10 MB a site) for `keep`'s drafts: other projects' drafts that the
 * shared copy already has are dropped here, and come back from it when their project is opened. A browser that sees
 * every project the team opens would otherwise fill up, and a save that doesn't fit would be lost. Without a shared
 * copy nothing is dropped. Returns whether anything was.
 */
export function freeStorage(keep: string): boolean {
  if (status.state === "off" || status.state === "unknown") return false;
  const pending = new Set(waiting().map(([s, k]) => id(s, k))), had = versions();
  let freed = false;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i), m = key?.match(/^structor-ui-([A-Za-z0-9][A-Za-z0-9_-]{0,79}):([a-z0-9][a-z0-9-]{0,63})$/);
      if (!key || !m || m[1] === keep) continue;
      const slotId = id(m[1], m[2]);
      if (pending.has(slotId) || !(slotId in had)) continue; // only what is safely in the shared copy
      localStorage.removeItem(key);
      delete had[slotId];
      freed = true;
    }
    if (freed) localStorage.setItem(VERSIONS_KEY, JSON.stringify(had));
  } catch { /* no storage */ }
  return freed;
}

// ── Where a shared row lives in this browser ──
type Slot = { scope: string; key: string; read: () => string | null; write: (value: unknown) => void };
const projectList = (): { id: string }[] => readJson<{ id: string }[]>(PROJECTS_KEY, []);
const projectWatchers = new Set<() => void>();
/** Calls `listener` when someone else's project records arrive; lib/projects' loadProjects then has them. */
export const onSharedProjects = (listener: () => void) => { projectWatchers.add(listener); return () => { projectWatchers.delete(listener); }; };
function slot(scope: string, key: string): Slot {
  if (key === "project") return {
    scope, key,
    read: () => { const p = projectList().find(x => x.id === scope); return p ? JSON.stringify(p) : null; },
    write: value => {
      const list = projectList(), record = value as { id: string };
      writeJson(PROJECTS_KEY, list.some(p => p.id === scope) ? list.map(p => p.id === scope ? record : p) : [...list, record]);
      projectWatchers.forEach(l => l());
    },
  };
  const storageKey = scope === ORG_SCOPE ? `structor-ui-${key}` : draftStorageKey(scope, key);
  return {
    scope, key,
    read: () => { try { return localStorage.getItem(storageKey); } catch { return null; } },
    write: value => { writeJson(storageKey, value, scope); announceDraftChange(storageKey); },
  };
}
const scopeOf = (projectId: string, key: string) => GLOBAL_DRAFT_KEYS.has(key) ? ORG_SCOPE : projectId;

// ── Talking to the shared copy ──
const gzip = (text: string) => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
const url = (params: Record<string, string | number>) => `/api/shared?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
class NotSetUp extends Error {}
async function call(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { cache: "no-store", ...init });
  if (response.status === 503) throw new NotSetUp();
  return response;
}
async function fetchValue(scope: string, key: string): Promise<{ value: unknown; version: number } | null> {
  const response = await call(url({ scope, key }));
  if (response.status === 404) return null;
  if (!response.ok || !response.body) throw new Error(`The shared copy answered ${response.status}.`);
  const version = Number(response.headers.get("x-version"));
  return { value: JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text()), version };
}
const offline = (error: unknown) => set({ state: error instanceof NotSetUp ? "off" : "offline" });

// ── Sending changes ──
const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; first: number }>();
const sending = new Set<string>(), sendAgain = new Set<string>();
const settle = () => { if (status.state === "saving" && !timers.size && !sending.size) set({ state: "saved" }); };

/** Called after a screen saves a draft in this browser: the change goes to the shared copy shortly. */
export function noteDraftSaved(projectId: string, key: string) {
  if (OWN_DRAFTS.has(key)) return;
  queue(scopeOf(projectId, key), key);
}
/** The built-in sample projects: sent only once someone edits them. */
const SAMPLE_IDS: ReadonlySet<string> = new Set(sampleProjectRecords.map(p => p.id));
const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
/** Called after the project list is saved in this browser: records that changed go to the shared copy. */
export function noteProjectsSaved(projects: { id: string }[]) {
  if (!status.pulled.has("projects")) return; // the first look sends what only this browser has
  for (const p of projects) {
    const slotId = id(p.id, "project"), was = bases.get(slotId);
    if (was === undefined && SAMPLE_IDS.has(p.id)) { bases.set(slotId, copy(p)); continue; }
    if (was === undefined || !sameJson(was, copy(p))) queue(p.id, "project");
  }
}

function queue(scope: string, key: string) {
  if (status.state === "off") return;
  const slotId = id(scope, key), now = Date.now(), was = timers.get(slotId);
  setWaiting(scope, key, true);
  if (was) clearTimeout(was.timer);
  const first = was?.first ?? now;
  timers.set(slotId, { first, timer: setTimeout(() => { timers.delete(slotId); void send(scope, key); }, Math.max(0, Math.min(SAVE_AFTER, first + SAVE_WITHIN - now))) });
  if (status.state !== "offline") set({ state: "saving" });
}

async function send(scope: string, key: string): Promise<void> {
  const slotId = id(scope, key), place = slot(scope, key);
  if (sending.has(slotId)) { sendAgain.add(slotId); return; }
  sending.add(slotId);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = place.read();
      let ours: unknown;
      try { ours = raw === null ? undefined : JSON.parse(raw); } catch { ours = undefined; }
      if (raw === null || ours === undefined) { setWaiting(scope, key, false); return; }
      const base = versions()[slotId] ?? 0;
      const response = await call(url({ scope, key, base }), { method: "PUT", body: await gzip(raw) });
      if (response.ok) {
        setVersion(slotId, (await response.json()).version);
        bases.set(slotId, ours);
        // Saved again here while this one travelled: that change goes next.
        if (place.read() === raw) setWaiting(scope, key, false); else queue(scope, key);
        if (status.state === "offline") set({ state: "saving" });
        return;
      }
      if (response.status !== 409) throw new Error((await response.json().catch(() => null))?.error ?? `The shared copy answered ${response.status}.`);
      // Someone else's save landed first: keep both changes and try again over theirs.
      const theirs = await fetchValue(scope, key);
      if (!theirs) continue;
      const merged = mergeJson(bases.get(slotId), ours, theirs.value);
      setVersion(slotId, theirs.version);
      bases.set(slotId, theirs.value);
      if (place.read() === raw) place.write(merged);
      if (sameJson(merged, theirs.value) && place.read() === JSON.stringify(theirs.value)) { setWaiting(scope, key, false); return; }
    }
    throw new Error("Others keep changing this at the same time.");
  } catch (error) {
    offline(error);
    if (!(error instanceof NotSetUp)) setTimeout(() => queue(scope, key), RETRY_AFTER);
  } finally {
    sending.delete(slotId);
    if (sendAgain.delete(slotId)) void send(scope, key);
    settle();
  }
}

// ── Bringing in other people's changes ──
async function bringIn(scope: string, key: string, version: number) {
  const slotId = id(scope, key);
  if (timers.has(slotId) || sending.has(slotId)) return; // our own change is on its way; sending merges theirs
  const theirs = await fetchValue(scope, key);
  if (!theirs) return;
  const place = slot(scope, key), raw = place.read();
  const mine = waiting().some(([s, k]) => s === scope && k === key) && raw !== null;
  // A change made here and not sent yet (a reload, no connection) is merged in and sent; otherwise theirs is taken.
  const value = mine ? mergeJson(bases.get(slotId), JSON.parse(raw!), theirs.value) : theirs.value;
  if (raw === null || !sameJson(JSON.parse(raw), value)) place.write(value);
  setVersion(slotId, Math.max(version, theirs.version));
  bases.set(slotId, theirs.value);
  if (mine) queue(scope, key);
}

/** Brings in a project's (or the organization's) saved drafts, and sends this browser's ones the shared copy lacks. */
async function pullScope(scope: string) {
  const response = await call(url({ scope }));
  if (!response.ok) throw new Error(`The shared copy answered ${response.status}.`);
  const rows: { key: string; version: number }[] = (await response.json()).rows;
  const had = versions();
  await Promise.all(rows.filter(r => r.key !== "project" && r.version > (had[id(scope, r.key)] ?? 0)).map(r => bringIn(scope, r.key, r.version)));
  // First time this project meets the shared copy: what this browser saved for it goes up (Danial's AI runs, 3 Nov).
  const stored = new Set(rows.map(r => r.key));
  for (const key of localDrafts(scope)) if (!stored.has(key) && !OWN_DRAFTS.has(key) && !(id(scope, key) in had)) queue(scope, key);
  set({ pulled: new Set([...status.pulled, scope]) });
}

/** Drafts this browser has for a scope: a project's own keys, or the organization's. The built-in sample project's
 * drafts share their keys with other things saved in the browser, so they go up only when edited. */
function localDrafts(scope: string): string[] {
  if (scope === ORG_SCOPE) return [...GLOBAL_DRAFT_KEYS].filter(key => slot(scope, key).read() !== null);
  const prefix = `structor-ui-${scope}:`, out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(prefix)) out.push(k.slice(prefix.length)); } } catch { /* no storage */ }
  return out.filter(key => /^[a-z0-9][a-z0-9-]{0,63}$/.test(key));
}

/** Brings in every project record, and sends the ones only this browser has; returns those projects' ids. */
async function pullProjects(): Promise<string[]> {
  const response = await call(url({ every: "project" }));
  if (!response.ok) throw new Error(`The shared copy answered ${response.status}.`);
  const rows: { scope: string; version: number; value: { id: string } }[] = (await response.json()).rows;
  const had = versions(), byId = new Map(projectList().map(p => [p.id, p]));
  const pending = new Set(waiting().filter(([, k]) => k === "project").map(([s]) => s));
  let changed = false;
  for (const r of rows) {
    const slotId = id(r.scope, "project"), mine = byId.get(r.scope);
    if (mine && r.version <= (had[slotId] ?? 0)) { if (!bases.has(slotId)) bases.set(slotId, r.value); continue; }
    if (timers.has(slotId) || sending.has(slotId)) continue; // our own edit is on its way; sending merges theirs
    // An edit made here and not sent yet is merged into theirs and sent; otherwise theirs is taken.
    const value = mine && pending.has(r.scope) ? mergeJson(bases.get(slotId), mine, r.value) as { id: string } : r.value;
    if (!mine || !sameJson(mine, value)) { byId.set(r.scope, value); changed = true; }
    setVersion(slotId, r.version);
    bases.set(slotId, r.value);
    if (pending.has(r.scope)) queue(r.scope, "project");
  }
  if (changed) { writeJson(PROJECTS_KEY, [...byId.values()]); projectWatchers.forEach(l => l()); }
  // Projects only this browser has go up (Danial's, 3 Nov); the samples get a starting copy to tell an edit by.
  const stored = new Set(rows.map(r => r.scope)), sent: string[] = [];
  for (const p of byId.values()) {
    if (stored.has(p.id)) continue;
    if (SAMPLE_IDS.has(p.id)) { if (!bases.has(id(p.id, "project"))) bases.set(id(p.id, "project"), copy(p)); } else { queue(p.id, "project"); sent.push(p.id); }
  }
  set({ pulled: new Set([...status.pulled, "projects"]), projects: rows.length });
  return sent;
}

let looking: Promise<void> | null = null, lastLook = 0;
/** Brings in the project list, the organization's drafts and the open project's. */
function look(projectId: string, force = false): Promise<void> {
  if (looking && !force) return looking;
  if (!force && Date.now() - lastLook < 10_000) return Promise.resolve();
  lastLook = Date.now();
  looking = (async () => {
    try {
      // Projects only this browser had go up with everything saved for them, not only the open one.
      const sent = await pullProjects();
      await Promise.all([ORG_SCOPE, projectId, ...sent.filter(p => p !== projectId)].map(pullScope));
      for (const [scope, key] of waiting()) if (!timers.has(id(scope, key)) && !sending.has(id(scope, key))) queue(scope, key);
      if (status.state === "unknown" || status.state === "offline") set({ state: timers.size || sending.size ? "saving" : "saved" });
    } catch (error) {
      offline(error);
    } finally {
      looking = null;
    }
  })();
  return looking;
}

/** Brings in the project list, the organization's drafts and this project's, now (useSharedSync does it on its own). */
export const syncProject = (projectId: string): Promise<void> => look(projectId, true);

/** Keeps the open project in step with the shared copy, for the app's top level (app/page.tsx). */
export function useSharedSync(projectId: string) {
  useEffect(() => { void syncProject(projectId); }, [projectId]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void look(projectId); };
    const timer = setInterval(visible, LOOK_EVERY);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [projectId]);
}

"use client";

// Which project is open, and how saved screen data is kept per project.
//
// Marcel (20 Sep): each project owns its documents, scopes, bids and budget. Every screen
// draft is therefore stored under the open project. The Jelleff sample keeps the storage
// keys it always used, so nothing saved before this change is lost. Organization-wide
// drafts (the subcontractor directory, a subcontractor's own portal profile) are shared.

import { useSyncExternalStore } from "react";

/** The project the built-in sample content belongs to. */
export const SAMPLE_PROJECT_ID = "jelleff";

const ACTIVE_PROJECT_KEY = "structor-ui-active-project";
const listeners = new Set<() => void>();
let activeProjectId: string | undefined;

/** The open project's id. Outside the browser this is always the sample project. */
export function getActiveProjectId(): string {
  if (typeof window === "undefined") return SAMPLE_PROJECT_ID;
  if (activeProjectId === undefined) {
    try { activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || SAMPLE_PROJECT_ID; } catch { activeProjectId = SAMPLE_PROJECT_ID; }
  }
  return activeProjectId;
}

/** Opens a project: every screen re-reads its data for that project, and the choice is remembered. */
export function selectProject(id: string): void {
  if (!id || id === getActiveProjectId()) return;
  activeProjectId = id;
  try { localStorage.setItem(ACTIVE_PROJECT_KEY, id); } catch { /* Still switches for this session. */ }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The open project's id, re-rendering when it changes. */
export const useActiveProject = (): string => useSyncExternalStore(subscribe, getActiveProjectId, () => SAMPLE_PROJECT_ID);

/** Drafts that belong to the organization rather than to one project. */
export const GLOBAL_DRAFT_KEYS = new Set(["directory", "portal-profile"]);

/** Browser storage key for a screen draft of a project. */
export const draftStorageKey = (projectId: string, key: string): string =>
  projectId === SAMPLE_PROJECT_ID || GLOBAL_DRAFT_KEYS.has(key) ? `structor-ui-${key}` : `structor-ui-${projectId}:${key}`;

/**
 * Drafts whose starting value is a template every project uses, rather than sample content.
 * Anything not listed starts empty on a new project, so it never shows Jelleff's data.
 */
const NEW_PROJECT_START: Record<string, (initial: unknown) => unknown> = {
  // The preconstruction to-do list: same steps, nothing done yet.
  turnover: initial => Array.isArray(initial) ? initial.map(item => ({ ...item, done: false })) : initial,
  "turnover-recipient": initial => initial,
  // The portal preview's answer sheet is shaped by the portal scope, not by saved project data.
  "portal-bid": initial => initial,
  // Already empty; emptying it again would turn the markup factor 1 into 0.
  "value-engineering": initial => initial,
};

function emptyLike(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (typeof value === "string") return "";
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptyLike(v)]));
  return value;
}

/** What a draft holds before anything is saved for this project. */
export function startingDraft<T>(projectId: string, key: string, initial: T): T {
  if (projectId === SAMPLE_PROJECT_ID || GLOBAL_DRAFT_KEYS.has(key)) return initial;
  return (NEW_PROJECT_START[key] ?? emptyLike)(initial) as T;
}

/** Storage key suffix for records that are not screen drafts (the bid-leveling workspace). */
export const projectScopedKey = (key: string, projectId = getActiveProjectId()): string =>
  projectId === SAMPLE_PROJECT_ID ? key : `${key}:${projectId}`;

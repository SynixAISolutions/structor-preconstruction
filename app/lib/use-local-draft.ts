"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { draftStorageKey, startingDraft, useActiveProject } from "./project-scope";

/** Fired on window, with the storage key as detail, when a draft is changed outside its screen. */
const DRAFT_CHANGED = "structor-draft-changed";

/** A project's saved draft as its screen would load it: the saved copy, else its starting value. */
export function readDraft<T>(projectId: string, key: string, initial: T): T {
  let value = startingDraft(projectId, key, initial);
  try {
    const saved = localStorage.getItem(draftStorageKey(projectId, key));
    if (saved) value = JSON.parse(saved) as T;
  } catch { /* A fresh draft remains usable when storage is unavailable. */ }
  return value;
}

/**
 * Saves a draft from outside its screen (Ask Structor's approved changes) and tells any open screen
 * using it to reload, so neither keeps an older copy. Throws when storage refuses the write.
 */
export function writeDraft<T>(projectId: string, key: string, value: T): void {
  const storageKey = draftStorageKey(projectId, key);
  localStorage.setItem(storageKey, JSON.stringify(value));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DRAFT_CHANGED, { detail: storageKey }));
}

/**
 * Draft state for a preview screen, persisted per browser and per open project
 * (see project-scope.ts). Switching project swaps the draft to that project's copy.
 * Only an edit is saved: a screen that was merely opened keeps following the built-in sample,
 * so sample updates reach it (see sample-refresh.ts for browsers that saved an older copy).
 * A change saved with writeDraft reloads the draft.
 * Storage failures are tolerated: the draft stays editable for the session either way.
 */
export function useLocalDraft<T>(key: string, initial: T) {
  const projectId = useActiveProject();
  const storageKey = draftStorageKey(projectId, key);
  // The value is tagged with the storage key it was loaded for, so a project switch can never
  // write one project's draft into another's key before the new one has loaded.
  const [draft, setDraft] = useState<{ storageKey: string | null; value: T; edited: boolean }>({ storageKey: null, value: initial, edited: false });

  useEffect(() => {
    const load = () => setDraft({ storageKey, value: readDraft(projectId, key, initial), edited: false });
    load();
    const reload = (event: Event) => { if ((event as CustomEvent<string>).detail === storageKey) load(); };
    window.addEventListener(DRAFT_CHANGED, reload);
    return () => window.removeEventListener(DRAFT_CHANGED, reload);
    // `initial` is a starting value, not an input: a new array literal each render must not reload.
  }, [storageKey]);

  useEffect(() => {
    if (draft.storageKey !== storageKey || !draft.edited) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft.value));
    } catch { /* Keep the current session editable when storage is full. */ }
  }, [draft, storageKey]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback(next => setDraft(current => ({
    storageKey: current.storageKey,
    value: typeof next === "function" ? (next as (previous: T) => T)(current.value) : next,
    edited: true,
  })), []);

  const value = draft.storageKey === storageKey ? draft.value : startingDraft(projectId, key, initial);
  return [value, setValue] as const;
}

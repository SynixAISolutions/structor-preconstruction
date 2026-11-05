"use client";

// Reading an RFP or addendum into the requirements list, one file at a time for this tab. The reading belongs to the
// tab rather than the screen: leaving the page doesn't lose what has been paid for, and coming back shows its progress.

import { useSyncExternalStore } from "react";
import type { StoredDocument } from "./project-files";
import { readRfpRequirements } from "./project-files-client";
import { EMPTY_REQUIREMENTS, REQUIREMENTS_KEY, mergeReading, type RequirementsState } from "./rfp-requirements";
import { readDraft, writeDraft } from "./use-local-draft";

export type RequirementProgress = { docId: string; docName: string; done: number; total: number };

const NONE: Record<string, string> = {};
let progress: RequirementProgress | null = null;
let failures = NONE;
const tried = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The file being read, and why any file couldn't be. */
export const useRequirementReading = () => ({
  progress: useSyncExternalStore(subscribe, () => progress, () => null),
  failures: useSyncExternalStore(subscribe, () => failures, () => NONE),
});

/** Whether this tab already tried the file, so a failing file isn't read (and paid for) again on every visit. */
export const triedReading = (docId: string) => tried.has(docId);

/** Reads a file and saves what it found with the project. Null when another file is being read or this one failed. */
export async function readRequirements(projectId: string, doc: StoredDocument): Promise<ReturnType<typeof mergeReading> | null> {
  if (progress) return null;
  tried.add(doc.id);
  progress = { docId: doc.id, docName: doc.name, done: 0, total: 0 };
  failures = Object.fromEntries(Object.entries(failures).filter(([id]) => id !== doc.id));
  emit();
  try {
    const { found, ...reading } = await readRfpRequirements(doc, undefined, (done, total) => { progress = { docId: doc.id, docName: doc.name, done, total }; emit(); });
    const merged = mergeReading(readDraft<RequirementsState>(projectId, REQUIREMENTS_KEY, EMPTY_REQUIREMENTS), doc, found, { ...reading, at: new Date().toISOString() });
    writeDraft(projectId, REQUIREMENTS_KEY, merged.state);
    return merged;
  } catch (error) {
    failures = { ...failures, [doc.id]: error instanceof Error ? error.message : "The file could not be read." };
    return null;
  } finally {
    progress = null;
    emit();
  }
}

"use client";

// Uploads that tell you when they're done (Marcel's feedback log, 7 Nov: "When I uploaded the drawings, it made me wait
// to upload and read them, I would have this work in the background and tell us when it is complete so that I can
// continue to use the software and do other stuff"). An upload runs on its own once started; when it ends, a notice
// says what was stored, what failed and which drawing sets have sheet numbers to review, on whatever screen is open.
// The sheet-number review is offered, never forced open.

import { useSyncExternalStore } from "react";
import { uploadProjectPdf } from "./project-files-client";
import type { StoredDocument } from "./project-files";

export type UploadNotice = {
  id: string; projectId: string;
  /** Names of the files stored. */
  stored: string[];
  failed: { name: string; error: string }[];
  /** Drawing sets whose sheet numbers can be reviewed (Project files' upload check). */
  checkIds: string[];
  at: number;
};

let notices: UploadNotice[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Finished uploads not yet dismissed, oldest first. */
export const useUploadNotices = (): UploadNotice[] => useSyncExternalStore(subscribe, () => notices, () => notices);

/** Says an upload has ended. Nothing is said when nothing was tried. */
export function addUploadNotice(notice: Omit<UploadNotice, "id" | "at">, at = Date.now()): UploadNotice | null {
  if (!notice.stored.length && !notice.failed.length) return null;
  const added = { ...notice, id: Math.random().toString(36).slice(2, 10), at };
  notices = [...notices, added];
  emit();
  return added;
}

export function dismissUploadNotice(id: string): void {
  notices = notices.filter(n => n.id !== id);
  emit();
}

/** One line for a finished upload, as the notice shows it. */
export function uploadNoticeText(n: Pick<UploadNotice, "stored" | "failed" | "checkIds">): string {
  const stored = n.stored.length === 1 ? `${n.stored[0]} is stored` : n.stored.length ? `${n.stored.length} files are stored` : "";
  const failed = n.failed.map(f => `${f.name} wasn't stored: ${f.error}`).join(" ");
  const check = n.checkIds.length ? " Review the sheet numbers when you have a moment." : "";
  return [stored ? `${stored} and read.${check}` : "", failed].filter(Boolean).join(" ");
}

// ── Asking Project files to open its sheet-number review ──
let checkRequest: { projectId: string; ids: string[] } | null = null;
const checkListeners = new Set<() => void>();
const subscribeCheck = (listener: () => void) => { checkListeners.add(listener); return () => { checkListeners.delete(listener); }; };
/** Asks Project files to open the upload check for these drawing sets (it takes the request when it shows). */
export function requestUploadCheck(projectId: string, ids: string[]): void {
  checkRequest = { projectId, ids };
  checkListeners.forEach(listener => listener());
}
/** The waiting request for this project, if any. */
export const useUploadCheckRequest = (projectId: string): string[] | null =>
  useSyncExternalStore(subscribeCheck, () => checkRequest?.projectId === projectId ? checkRequest.ids : null, () => null);
export function clearUploadCheckRequest(): void {
  checkRequest = null;
  checkListeners.forEach(listener => listener());
}

/**
 * Stores files one after another without anyone waiting on them: the upload banner shows their progress meanwhile and a
 * notice says when they're done. Used by the New project form's bid documents. Drawing sets come back as checkIds.
 */
export async function uploadInBackground(projectId: string, items: { file: File; category: string; revisionOf?: StoredDocument }[]): Promise<UploadNotice | null> {
  const stored: string[] = [], failed: UploadNotice["failed"] = [], checkIds: string[] = [];
  for (const { file, category, revisionOf } of items) {
    try {
      const doc = await uploadProjectPdf({ projectId, file, category, revisionOf });
      stored.push(file.name);
      if (doc.kind === "drawings") checkIds.push(doc.id);
    } catch (error) {
      failed.push({ name: file.name, error: error instanceof Error ? error.message : "The upload failed." });
    }
  }
  return addUploadNotice({ projectId, stored, failed, checkIds });
}

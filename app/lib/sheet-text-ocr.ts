"use client";

// Making scanned sheets searchable (Danial, 28 Oct: 43 of Project 1's 205 sheets have no text layer, so the drawing
// references, search and the AI couldn't see them). Each such sheet is read once with OCR (lib/sheet-ocr: the whole
// sheet at 300 dpi) and its text saved in Project files beside the other pages, marked `ocr`, so every screen reads
// it like any sheet, for everyone. The estimator starts it (it works the computer hard, about a minute a sheet); every
// sheet is saved as soon as it is read, so a stopped or closed run picks up where it was.

import { useSyncExternalStore } from "react";
import { drawingRegister, SCANNED_PAGE_TEXT, type RegisterRow, type StoredDocument } from "./project-files";
import { readStoredText, savePageOcrText } from "./project-files-client";
import { readWholeSheet, type OcrProgress } from "./sheet-ocr";
import { ocrText } from "./text-anchor";

/** `version` counts sheets saved, for screens that show sheet text to read it again. */
export type SheetOcrRun = { running: boolean; done: number; total: number; sheet: string; part: OcrProgress | null; saved: number; failed: string[]; version: number };
let snapshot: SheetOcrRun = { running: false, done: 0, total: 0, sheet: "", part: null, saved: 0, failed: [], version: 0 };
const listeners = new Set<() => void>();
const set = (change: Partial<SheetOcrRun>) => { snapshot = { ...snapshot, ...change }; listeners.forEach(l => l()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
let controller: AbortController | null = null;
const holdTab = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };

/** The current sheets with no text layer and no OCR text yet, in register order. */
export async function scannedSheets(documents: StoredDocument[]): Promise<RegisterRow[]> {
  const register = drawingRegister(documents);
  const docs = [...new Map(register.map(r => [r.doc.id, r.doc])).values()];
  const pages = new Map(await Promise.all(docs.map(async d => [d.id, new Map((await readStoredText(d)).map(p => [p.page, p]))] as const)));
  return register.filter(r => { const p = pages.get(r.doc.id)?.get(r.page); return !p?.ocr && (p?.text.trim().length ?? 0) < SCANNED_PAGE_TEXT; });
}

/** Reads and saves every scanned sheet's text, one at a time, until done or stopped. One run per tab. */
export async function ocrScannedSheets(documents: StoredDocument[]): Promise<void> {
  if (snapshot.running) return;
  controller = new AbortController();
  const signal = controller.signal;
  window.addEventListener("beforeunload", holdTab);
  set({ running: true, done: 0, total: 0, sheet: "", part: null, saved: 0, failed: [] });
  try {
    const todo = await scannedSheets(documents);
    set({ total: todo.length });
    for (const [i, row] of todo.entries()) {
      if (signal.aborted) break;
      set({ sheet: row.sheet, done: i, part: null });
      try {
        const { words, wholeSheet } = await readWholeSheet(row.doc, row.page, part => set({ part }), signal);
        if (!wholeSheet) break; // stopped mid-sheet: nothing is saved for it, it is read again next time
        await savePageOcrText(row.doc, row.page, ocrText(words));
        set({ saved: snapshot.saved + 1, done: i + 1, version: snapshot.version + 1 });
      } catch (error) {
        set({ done: i + 1, failed: [...snapshot.failed, `${row.sheet}: ${error instanceof Error ? error.message : "could not be read"}`] });
      }
    }
  } catch (error) {
    set({ failed: [...snapshot.failed, error instanceof Error ? error.message : "The scanned sheets could not be listed."] });
  } finally {
    window.removeEventListener("beforeunload", holdTab);
    controller = null;
    set({ running: false, part: null });
  }
}

/** Stops after the sheet being read (that sheet isn't saved). */
export const stopSheetOcr = () => controller?.abort();

/** The run in this tab, if any, and what it has done. */
export const useSheetOcr = (): SheetOcrRun => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

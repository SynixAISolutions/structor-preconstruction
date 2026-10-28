"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { findDrawingReferences, packageTerms, type DrawingReference, type SheetText } from "./drawing-references";
import { drawingRegister, SCANNED_PAGE_TEXT, specificationSections } from "./project-files";
import { readStoredText, useProjectDocuments } from "./project-files-client";
import type { TradePackage } from "./procurement";
import { sectionsByTrade } from "./project-scopes";
import { useSheetOcr } from "./sheet-text-ocr";

/**
 * Where each bid package is on the open project's drawings, by their printed text (lib/drawing-references). The text
 * of every current sheet is loaded once from Project files; a scanned sheet is searchable once its OCR text is saved
 * (lib/sheet-text-ocr).
 *
 *   const { ready, referencesFor } = useDrawingReferences(packages);
 *   referencesFor(pkg.id)   // sheets in order, each with the lines that place the package there
 */
export function useDrawingReferences(packages: Pick<TradePackage, "id" | "name" | "code" | "division">[]) {
  const { documents, ready: filesReady } = useProjectDocuments();
  const register = useMemo(() => drawingRegister(documents), [documents]);
  const ocr = useSheetOcr();
  // Read again as each scanned sheet's OCR text is saved (lib/sheet-text-ocr).
  const base = register.map(r => `${r.doc.id}:${r.page}`).join("|"), key = `${base}#${ocr.version}`;
  const [sheets, setSheets] = useState<{ key: string; list: SheetText[]; unread: number; error: string }>({ key: "", list: [], unread: 0, error: "" });
  useEffect(() => {
    if (!filesReady || !register.length) return;
    let live = true;
    const docs = [...new Map(register.map(r => [r.doc.id, r.doc])).values()];
    Promise.all(docs.map(doc => readStoredText(doc))).then(texts => {
      const byDoc = new Map(docs.map((doc, i) => [doc.id, new Map(texts[i].map(p => [p.page, p]))]));
      const stored = register.map(r => byDoc.get(r.doc.id)?.get(r.page));
      const list = register.map((r, i) => ({ docId: r.doc.id, page: r.page, sheet: r.sheet, title: r.title, discipline: r.discipline, text: stored[i]?.text ?? "" }));
      // A scanned sheet already read by OCR counts as read, even when it held almost no words.
      const unread = stored.filter(p => !p?.ocr && (p?.text.trim().length ?? 0) < SCANNED_PAGE_TEXT).length;
      if (live) setSheets({ key, list, unread, error: "" });
    }, error => { if (live) setSheets({ key, list: [], unread: 0, error: error instanceof Error ? error.message : "The drawing text could not be read." }); });
    return () => { live = false; };
  }, [key, filesReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = useMemo(() => sectionsByTrade(specificationSections(documents), packages), [documents, packages]);
  const cache = useMemo(() => new Map<string, DrawingReference[]>(), [sheets, sections]);
  const referencesFor = useCallback((packageId: string): DrawingReference[] => {
    if (!cache.has(packageId)) {
      const pkg = packages.find(p => p.id === packageId);
      cache.set(packageId, pkg ? findDrawingReferences(sheets.list, packageTerms(pkg, sections.get(packageId) ?? [])) : []);
    }
    return cache.get(packageId)!;
  }, [cache, packages, sheets.list, sections]);
  // Ready once this set of sheets is loaded; a reload after an OCR save keeps showing the last results meanwhile.
  const ready = filesReady && (!register.length || sheets.key.startsWith(`${base}#`));
  return { ready, error: sheets.error, sheets: sheets.list.length, searchable: sheets.list.length - sheets.unread, referencesFor };
}

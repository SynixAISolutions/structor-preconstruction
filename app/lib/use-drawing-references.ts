"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { findDrawingReferences, packageTerms, type DrawingReference, type SheetText } from "./drawing-references";
import { drawingRegister, specificationSections } from "./project-files";
import { readStoredText, useProjectDocuments } from "./project-files-client";
import type { TradePackage } from "./procurement";
import { sectionsByTrade } from "./project-scopes";

/**
 * Where each bid package is on the open project's drawings, by their printed text (lib/drawing-references). The text
 * of every current sheet is loaded once from Project files; sheets with no text layer (scanned) can't be searched.
 *
 *   const { ready, referencesFor } = useDrawingReferences(packages);
 *   referencesFor(pkg.id)   // sheets in order, each with the lines that place the package there
 */
export function useDrawingReferences(packages: Pick<TradePackage, "id" | "name" | "code" | "division">[]) {
  const { documents, ready: filesReady } = useProjectDocuments();
  const register = useMemo(() => drawingRegister(documents), [documents]);
  const key = register.map(r => `${r.doc.id}:${r.page}`).join("|");
  const [sheets, setSheets] = useState<{ key: string; list: SheetText[]; error: string }>({ key: "", list: [], error: "" });
  useEffect(() => {
    if (!filesReady || !register.length) return;
    let live = true;
    const docs = [...new Map(register.map(r => [r.doc.id, r.doc])).values()];
    Promise.all(docs.map(doc => readStoredText(doc))).then(texts => {
      const byDoc = new Map(docs.map((doc, i) => [doc.id, new Map(texts[i].map(p => [p.page, p.text]))]));
      const list = register.map(r => ({ docId: r.doc.id, page: r.page, sheet: r.sheet, title: r.title, discipline: r.discipline, text: byDoc.get(r.doc.id)?.get(r.page) ?? "" }));
      if (live) setSheets({ key, list, error: "" });
    }, error => { if (live) setSheets({ key, list: [], error: error instanceof Error ? error.message : "The drawing text could not be read." }); });
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
  const searchable = sheets.list.filter(s => s.text.trim().length > 20).length;
  return { ready: filesReady && (!register.length || sheets.key === key), error: sheets.error, sheets: sheets.list.length, searchable, referencesFor };
}

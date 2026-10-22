"use client";

// Browser side of content management (lib/project-content): one shared copy per project, loaded once and
// replaced by what the server stored after each change.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useActiveProject } from "./project-scope";
import { emptyContent, type ContentOp, type Markup, type ProjectContent } from "./project-content";
import { markupsPdf } from "./markup-export";
import { renderStoredRegion } from "./project-files-client";
import type { StoredDocument } from "./project-files";
import { downloadText } from "./format";

const contents = new Map<string, ProjectContent>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const set = (content: ProjectContent) => { contents.set(content.projectId, content); notify(); return content; };

async function api(init?: RequestInit, projectId = ""): Promise<ProjectContent> {
  const response = await fetch(init ? "/api/project-content" : `/api/project-content?project=${encodeURIComponent(projectId)}`, init);
  const body = await response.json().catch(() => ({ error: `Request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body as ProjectContent;
}

const loadContent = (projectId: string) => api(undefined, projectId).then(set);

/**
 * The open project's tags, file details and markups. `change` applies a list of changes as `by` (all or
 * none) and resolves to the stored content, or rejects with a message for the person.
 */
export function useProjectContent(projectId?: string) {
  const active = useActiveProject();
  const id = projectId ?? active;
  const content = useSyncExternalStore(subscribe, () => contents.get(id), () => undefined);
  useEffect(() => { if (!contents.has(id)) loadContent(id).catch(() => set(emptyContent(id))); }, [id]);
  const refresh = useCallback(() => loadContent(id), [id]);
  const change = useCallback((ops: ContentOp[], by: string) => api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: id, ops, by }) }).then(set), [id]);
  return { content: content ?? emptyContent(id), ready: !!content, refresh, change };
}

/**
 * Downloads "<file> markups.pdf": the marked-up pages of `doc` (this revision) with `markups` drawn and
 * numbered in the order given (pass docMarkups' order, as the viewer lists them), then the list of markups.
 * Pages render one at a time, so a large set stays within memory.
 */
export async function exportMarkups(doc: StoredDocument, markups: Markup[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const numbers = [...new Set(markups.map(m => m.page))].sort((a, b) => a - b), pages = [];
  for (const [i, page] of numbers.entries()) {
    onProgress?.(i, numbers.length);
    const image = await renderStoredRegion(doc, page, [0, 0, 1, 1], 2400);
    pages.push({ page, jpeg: Uint8Array.from(atob(image.slice(image.indexOf(",") + 1)), c => c.charCodeAt(0)) });
  }
  onProgress?.(numbers.length, numbers.length);
  const title = `${doc.name.replace(/\.pdf$/i, "")} V${doc.revision}`;
  const bytes = await markupsPdf({ title, exportedAt: new Date().toLocaleString("en-US"), markups, pages });
  downloadText(`${title} markups.pdf`, bytes as Uint8Array<ArrayBuffer>, "application/pdf");
}

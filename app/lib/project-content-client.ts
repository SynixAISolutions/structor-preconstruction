"use client";

// Browser side of content management (lib/project-content): one shared copy per project, loaded once and
// replaced by what the server stored after each change.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useActiveProject } from "./project-scope";
import { emptyContent, type ContentOp, type ProjectContent } from "./project-content";

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

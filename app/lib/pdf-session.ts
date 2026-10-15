"use client";

import { useSyncExternalStore } from "react";
import { getActiveProjectId, useActiveProject } from "./project-scope";

// Original files stay in memory, shared by review/source views; a reload requires choosing them again.
const files = new Map<string, File>(), listeners = new Set<() => void>();
const key = (project: string, document: string) => `${project}:${document}`;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function rememberPdf(file: File, project = getActiveProjectId()) { files.set(key(project, file.name), file); listeners.forEach(listener => listener()); }
export function useSourceFile(document: string) {
  const project = useActiveProject();
  return useSyncExternalStore(subscribe, () => files.get(key(project, document)) ?? null, () => null);
}

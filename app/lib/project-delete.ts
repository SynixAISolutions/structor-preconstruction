"use client";

// Deleting a project (Danial, 19 Nov: "add the option to delete projects ... ask the user to write "delete" to delete";
// "make sure the delete button deletes the project completely"). A marker with only its id and name is sent to the
// team first (lib/projects deletedProject), so every browser that has the project drops it; then its saved pages go,
// here and in the shared copy, and everything it stored: files, page text, subcontractors' bid uploads, clarifications.
// A PDF another project reuses stays for that project. It can't be undone.

import { deletedProject, KEPT_PROJECT_ID, PROJECTS_STORAGE_KEY, type Project } from "./projects";
import { forgetProject, sendProjectNow } from "./shared-sync";
import { removeProjectFiles } from "./project-files-client";

export const canDeleteProject = (project: Pick<Project, "id">): boolean => project.id !== KEPT_PROJECT_ID;

/** Deletes a project for everyone. Resolves when it is gone; throws with a message to show. */
export async function deleteProject(project: Project, by: string): Promise<void> {
  if (!canDeleteProject(project)) throw new Error("The sample project can't be deleted.");
  // 1. The marker, in this browser's list and in the shared copy.
  const marker = deletedProject(project, by);
  let stored: unknown = [];
  try { stored = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "[]"); } catch { /* starts a fresh list */ }
  const list = Array.isArray(stored) ? stored.filter(p => p?.id !== project.id) : [];
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([...list, marker]));
  await sendProjectNow(project.id);
  // 2. Its drafts, here and in the shared copy (refused until the marker is there).
  forgetProject(project.id);
  const removed = await fetch(`/api/shared?scope=${encodeURIComponent(project.id)}`, { method: "DELETE" }).catch(() => null);
  if (removed && !removed.ok && removed.status !== 503) throw new Error((await removed.json().catch(() => null))?.error ?? "The project's saved data couldn't be removed. Try again.");
  // 3. Everything it stored.
  await removeProjectFiles(project.id).catch(() => { throw new Error("The project is deleted, but some of its stored files are still there. Try deleting it again."); });
}

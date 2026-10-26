// Folders in Project files (Marcel, 24 Oct: "like a Google Drive ... right-click, create a new folder"). Four
// folders every project has, as Marcel listed them (project drawings, reports, RFP, budget), and any the team
// makes, nested as deep as they like. A file sits in the folder it was moved to, else in the built-in folder
// for its category. Folders only organize: the AI finds drawings and specifications by their category and
// what was read from their pages, whatever the folder is called. Pure; the folder list and each file's folder
// are stored with the project's content (lib/project-content).

import { latestDocuments, type StoredDocument } from "./project-files";
import type { ProjectContent } from "./project-content";

/** The top of Project files. */
export const ROOT = "root";

export type SystemFolderId = "drawings" | "reports" | "rfp" | "budget";
export type FolderEntry = { id: string; name: string; parent: string; system: boolean; hint: string };

/** Built in, in Marcel's order; each holds its categories' files unless a file was moved. `upload` is the category new files take. */
export const SYSTEM_FOLDERS: (FolderEntry & { id: SystemFolderId; categories: string[]; upload: string })[] = [
  { id: "drawings", name: "Project Drawings", parent: ROOT, system: true, hint: "Upload your drawings and specifications here.", categories: ["Drawings", "Specifications"], upload: "Drawings" },
  { id: "reports", name: "Reports", parent: ROOT, system: true, hint: "Geotechnical, survey, hazardous materials and other project reports.", categories: ["Reports"], upload: "Reports" },
  { id: "rfp", name: "RFP", parent: ROOT, system: true, hint: "The RFP or invitation to bid, its addenda and the owner's contract documents.", categories: ["RFP", "Addenda", "Contracts"], upload: "RFP" },
  { id: "budget", name: "Budget", parent: ROOT, system: true, hint: "The owner's budget and earlier estimates: concept, schematic design, design development.", categories: ["Budget"], upload: "Budget" },
];
export const MAX_FOLDERS = 300;
export const MAX_FOLDER_DEPTH = 12;

export const isSystemFolder = (id: string): id is SystemFolderId => SYSTEM_FOLDERS.some(f => f.id === id);
const customFolders = (content: ProjectContent) => content.folders ?? [];

/** Every folder, built-in first; a made folder whose parent is gone shows at the top. */
export function allFolders(content: ProjectContent): FolderEntry[] {
  const custom = customFolders(content);
  const known = new Set<string>([ROOT, ...SYSTEM_FOLDERS.map(f => f.id), ...custom.map(f => f.id)]);
  return [...SYSTEM_FOLDERS, ...custom.map(f => ({ id: f.id, name: f.name, parent: known.has(f.parent) && f.parent !== f.id ? f.parent : ROOT, system: false, hint: "" }))];
}

export const folderExists = (content: ProjectContent, id: string) => id === ROOT || allFolders(content).some(f => f.id === id);
export const findFolder = (content: ProjectContent, id: string): FolderEntry | null => allFolders(content).find(f => f.id === id) ?? null;

/** The built-in folder a category's files start in: drawings and specifications, reports, the RFP and contracts, the budget. */
export const defaultFolder = (category: string): string => SYSTEM_FOLDERS.find(f => f.categories.includes(category))?.id ?? ROOT;

/** Where a file is: the folder it was moved to while that folder exists, else its category's. */
export function folderOf(content: ProjectContent, doc: Pick<StoredDocument, "series" | "category">): string {
  const moved = content.files[doc.series]?.folder;
  return moved && folderExists(content, moved) ? moved : defaultFolder(doc.category);
}

/** Folders from the top down to `id` (empty for the top itself). */
export function folderPath(content: ProjectContent, id: string): FolderEntry[] {
  const folders = allFolders(content), path: FolderEntry[] = [];
  for (let at = folders.find(f => f.id === id); at && path.length <= MAX_FOLDER_DEPTH + 4; at = folders.find(f => f.id === at!.parent)) path.unshift(at);
  return path;
}

/** `id` and every folder inside it, at any depth. */
export function folderAndInside(content: ProjectContent, id: string): Set<string> {
  const folders = allFolders(content), found = new Set([id]);
  for (let grew = true; grew;) { grew = false; for (const f of folders) if (found.has(f.parent) && !found.has(f.id)) { found.add(f.id); grew = true; } }
  return found;
}

/** The folders directly inside `id`, built-in first, then by name. */
export const subfolders = (content: ProjectContent, id: string): FolderEntry[] =>
  allFolders(content).filter(f => f.parent === id).sort((a, b) => Number(b.system) - Number(a.system) || (a.system ? 0 : a.name.localeCompare(b.name, undefined, { numeric: true })));

/** How many files (latest revisions) a folder holds, counting the folders inside it. */
export function filesIn(content: ProjectContent, docs: StoredDocument[], id: string): number {
  const inside = folderAndInside(content, id);
  return latestDocuments(docs).filter(d => inside.has(folderOf(content, d))).length;
}

/** A folder's name, checked: required, at most 60 characters, and not shared with another folder beside it. */
export function checkFolderName(content: ProjectContent, raw: unknown, parent: string, self?: string): string {
  const name = (typeof raw === "string" ? raw : "").replace(/[\\/\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Give the folder a name.");
  if (name.length > 60) throw new Error("A folder name can be at most 60 characters.");
  if (allFolders(content).some(f => f.parent === parent && f.id !== self && f.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already a folder named ${name} here.`);
  return name;
}

// Content management and the content viewer (22 Oct, Danial: "something like ConCntric's"): one library of
// the project's files with tags, descriptions and the records each file supports, and markups drawn on the
// pages, each with its own title, assignee, comments and links. The files themselves stay in Project files
// (lib/project-files); this is what the team adds around them. Pure; the store applies these operations.
//
// A file's tags, description and links belong to its series, so they carry over to a new revision. A markup
// belongs to the revision it was drawn on (the next revision's pages may differ).

import { latestDocuments, type StoredDocument } from "./project-files";
import { checkFolderName, findFolder, folderAndInside, folderExists, folderPath, MAX_FOLDER_DEPTH, MAX_FOLDERS, ROOT } from "./project-folders";

/** What a file or markup can support: the document check's issues, RFIs, bid packages, clarifications and VE items. */
export type ContentLinkKind = "issue" | "rfi" | "package" | "clarification" | "ve";
export const LINK_KINDS: { kind: ContentLinkKind; label: string }[] = [
  { kind: "issue", label: "Issues" }, { kind: "rfi", label: "RFIs" }, { kind: "package", label: "Bid packages" },
  { kind: "clarification", label: "Clarifications" }, { kind: "ve", label: "VE items" },
];
/** `label` is the record's name when it was linked, shown if the record can't be found any more. */
export type ContentLink = { kind: ContentLinkKind; id: string; label: string };

export const TAG_COLORS = ["blue", "orange", "pink", "purple", "green", "gray"] as const;
export type TagColor = typeof TAG_COLORS[number];
export type ContentTag = { id: string; name: string; color: TagColor };
/** `folder`: where the file was moved in Project files (lib/project-folders); unset, it sits in its category's folder. */
export type FileMeta = { tags: string[]; description: string; links: ContentLink[]; folder?: string };
/** A folder the team made; `parent` is "root", a built-in folder or another made folder. */
export type ContentFolder = { id: string; name: string; parent: string };

export type MarkupComment = { id: string; by: string; at: string; text: string };
/** A rectangle on one page: x, y, width and height as fractions of the page (0-1, from its top-left). */
export type Markup = {
  id: string; docId: string; page: number; rect: [number, number, number, number]; color: TagColor;
  title: string; description: string; assignedTo: string; status: "open" | "resolved";
  createdBy: string; createdAt: string; updatedAt: string; comments: MarkupComment[]; links: ContentLink[];
};
export type ProjectContent = { projectId: string; tags: ContentTag[]; files: Record<string, FileMeta>; markups: Markup[]; folders: ContentFolder[]; updatedAt: string };

export type MarkupInput = { docId: string; page: number; rect: [number, number, number, number]; color?: TagColor; title: string; description?: string; assignedTo?: string };
export type ContentTarget = { series: string } | { markupId: string };
export type ContentOp =
  | { op: "tag-add"; name: string; color: TagColor }
  | { op: "tag-edit"; id: string; name?: string; color?: TagColor }
  | { op: "tag-delete"; id: string }
  | { op: "file-edit"; series: string; tags?: string[]; description?: string }
  | { op: "link"; target: ContentTarget; link: ContentLink }
  | { op: "unlink"; target: ContentTarget; kind: ContentLinkKind; id: string }
  | { op: "markup-add"; markup: MarkupInput }
  | { op: "markup-edit"; id: string; title?: string; description?: string; assignedTo?: string; status?: "open" | "resolved"; color?: TagColor; rect?: [number, number, number, number] }
  | { op: "markup-delete"; id: string }
  | { op: "comment-add"; markupId: string; text: string }
  | { op: "folder-add"; name: string; parent: string }
  | { op: "folder-rename"; id: string; name: string }
  | { op: "folder-move"; id: string; parent: string }
  | { op: "folder-delete"; id: string }
  | { op: "file-move"; series: string; folder: string };

export const emptyContent = (projectId: string): ProjectContent => ({ projectId, tags: [], files: {}, markups: [], folders: [], updatedAt: "" });
/** Stored content in today's shape: content saved before folders existed has none. */
export const normalizeContent = (raw: Partial<ProjectContent>, projectId: string): ProjectContent => ({ ...emptyContent(projectId), ...raw, folders: Array.isArray(raw.folders) ? raw.folders : [] });
const NO_META: FileMeta = { tags: [], description: "", links: [] };
export const fileMeta = (content: ProjectContent, series: string): FileMeta => content.files[series] ?? NO_META;

function fail(message: string): never { throw new Error(message); }
const text = (value: unknown, max: number, what: string, required = false) => {
  if (typeof value !== "string") fail(`${what} must be text.`);
  const t = value.trim();
  if (required && !t) fail(`Give the ${what.toLowerCase()}.`);
  if (t.length > max) fail(`${what} is longer than ${max} characters.`);
  return t;
};
const color = (value: unknown): TagColor => TAG_COLORS.includes(value as TagColor) ? value as TagColor : fail("Choose one of the tag colors.");
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const id = (value: unknown, what: string) => typeof value === "string" && ID.test(value) ? value : fail(`Name the ${what}.`);
const rect = (value: unknown): [number, number, number, number] => {
  const r = Array.isArray(value) ? value : [];
  if (r.length !== 4 || !r.every(n => typeof n === "number" && Number.isFinite(n))) fail("A markup needs a rectangle on the page.");
  const [x, y, w, h] = r as number[];
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) fail("Keep the markup on the page.");
  return [x, y, w, h].map(n => Math.round(n * 1e5) / 1e5) as [number, number, number, number];
};
const link = (value: unknown): ContentLink => {
  const l = (value ?? {}) as Record<string, unknown>;
  if (!LINK_KINDS.some(k => k.kind === l.kind)) fail("Link to an issue, RFI, bid package, clarification or VE item.");
  return { kind: l.kind as ContentLinkKind, id: id(l.id, "linked record"), label: text(l.label ?? "", 160, "Linked record name") };
};
const addLink = (links: ContentLink[], l: ContentLink) => {
  if (links.some(x => x.kind === l.kind && x.id === l.id)) return links;
  if (links.length >= 50) fail("At most 50 links on one file or markup.");
  return [...links, l];
};

/**
 * One operation by `by` at `now`; `newId` makes ids for what it adds. Throws a message for the person when
 * the operation can't apply (a record that is gone, text too long, a markup off the page).
 */
export function applyContentOp(content: ProjectContent, op: ContentOp, by: string, now: string, newId: () => string): ProjectContent {
  const next = { ...content, updatedAt: now };
  const editMeta = (series: string, change: (meta: FileMeta) => FileMeta) => ({ ...next, files: { ...next.files, [id(series, "file")]: change(fileMeta(content, series)) } });
  const editMarkup = (markupId: string, change: (m: Markup) => Markup) => {
    if (!content.markups.some(m => m.id === markupId)) fail("This markup was deleted.");
    return { ...next, markups: content.markups.map(m => m.id === markupId ? { ...change(m), updatedAt: now } : m) };
  };
  switch (op.op) {
    case "tag-add": {
      const name = text(op.name, 40, "Tag name", true);
      if (content.tags.some(t => t.name.toLowerCase() === name.toLowerCase())) fail(`There is already a tag named ${name}.`);
      if (content.tags.length >= 40) fail("At most 40 tags in a project.");
      return { ...next, tags: [...content.tags, { id: newId(), name, color: color(op.color) }] };
    }
    case "tag-edit": {
      const tag = content.tags.find(t => t.id === op.id) ?? fail("This tag was deleted.");
      const name = op.name === undefined ? tag.name : text(op.name, 40, "Tag name", true);
      if (content.tags.some(t => t.id !== tag.id && t.name.toLowerCase() === name.toLowerCase())) fail(`There is already a tag named ${name}.`);
      return { ...next, tags: content.tags.map(t => t.id === tag.id ? { ...t, name, color: op.color === undefined ? t.color : color(op.color) } : t) };
    }
    case "tag-delete":
      // Deleting a tag takes it off every file.
      return { ...next, tags: content.tags.filter(t => t.id !== op.id), files: Object.fromEntries(Object.entries(content.files).map(([s, m]) => [s, { ...m, tags: m.tags.filter(t => t !== op.id) }])) };
    case "file-edit":
      return editMeta(op.series, meta => {
        const tags = op.tags === undefined ? meta.tags : [...new Set(op.tags)];
        if (tags.some(t => !content.tags.some(x => x.id === t))) fail("One of those tags was deleted.");
        if (tags.length > 10) fail("At most 10 tags on one file.");
        return { ...meta, tags, description: op.description === undefined ? meta.description : text(op.description, 1000, "Description") };
      });
    case "link":
    case "unlink": {
      const change = (links: ContentLink[]) => op.op === "link" ? addLink(links, link(op.link)) : links.filter(l => !(l.kind === op.kind && l.id === op.id));
      return "series" in op.target ? editMeta(op.target.series, meta => ({ ...meta, links: change(meta.links) })) : editMarkup(op.target.markupId, m => ({ ...m, links: change(m.links) }));
    }
    case "markup-add": {
      const m = op.markup;
      if (content.markups.length >= 2000) fail("At most 2,000 markups in a project.");
      if (!Number.isInteger(m.page) || m.page < 1 || m.page > 5000) fail("Name the page of the markup.");
      return { ...next, markups: [...content.markups, {
        id: newId(), docId: id(m.docId, "file"), page: m.page, rect: rect(m.rect), color: m.color === undefined ? "orange" : color(m.color),
        title: text(m.title, 120, "Title", true), description: text(m.description ?? "", 2000, "Description"), assignedTo: text(m.assignedTo ?? "", 80, "Assignee"),
        status: "open", createdBy: by, createdAt: now, updatedAt: now, comments: [], links: [],
      }] };
    }
    case "markup-edit":
      return editMarkup(op.id, m => ({
        ...m,
        title: op.title === undefined ? m.title : text(op.title, 120, "Title", true),
        description: op.description === undefined ? m.description : text(op.description, 2000, "Description"),
        assignedTo: op.assignedTo === undefined ? m.assignedTo : text(op.assignedTo, 80, "Assignee"),
        status: op.status === undefined ? m.status : op.status === "resolved" ? "resolved" : "open",
        color: op.color === undefined ? m.color : color(op.color),
        rect: op.rect === undefined ? m.rect : rect(op.rect),
      }));
    case "markup-delete":
      return { ...next, markups: content.markups.filter(m => m.id !== op.id) };
    case "comment-add": {
      const body = text(op.text, 2000, "Comment", true);
      return editMarkup(op.markupId, m => m.comments.length >= 200 ? fail("At most 200 comments on one markup.") : ({ ...m, comments: [...m.comments, { id: newId(), by, at: now, text: body }] }));
    }
    // ── Folders (lib/project-folders): only the team's own folders change; the built-in four stay. ──
    case "folder-add": {
      const folders = content.folders ?? [];
      if (!folderExists(content, op.parent)) fail("That folder was deleted.");
      if (folders.length >= MAX_FOLDERS) fail(`At most ${MAX_FOLDERS} folders in a project.`);
      if (folderPath(content, op.parent).length >= MAX_FOLDER_DEPTH) fail(`Folders go at most ${MAX_FOLDER_DEPTH} deep.`);
      return { ...next, folders: [...folders, { id: newId(), name: checkFolderName(content, op.name, op.parent), parent: op.parent }] };
    }
    case "folder-rename": {
      const folder = ownFolder(content, op.id, "renamed");
      return { ...next, folders: content.folders.map(f => f.id === folder.id ? { ...f, name: checkFolderName(content, op.name, folder.parent, folder.id) } : f) };
    }
    case "folder-move": {
      const folder = ownFolder(content, op.id, "moved");
      if (!folderExists(content, op.parent)) fail("That folder was deleted.");
      if (folderAndInside(content, folder.id).has(op.parent)) fail("A folder can't go inside itself.");
      if (folderPath(content, op.parent).length + depthBelow(content, folder.id) >= MAX_FOLDER_DEPTH) fail(`Folders go at most ${MAX_FOLDER_DEPTH} deep.`);
      return { ...next, folders: content.folders.map(f => f.id === folder.id ? { ...f, name: checkFolderName(content, folder.name, op.parent, folder.id), parent: op.parent } : f) };
    }
    case "folder-delete": {
      // Deleting a folder never deletes files: what was inside moves up to where the folder was.
      const folder = ownFolder(content, op.id, "deleted");
      const parent = findFolder(content, folder.id)!.parent;
      return {
        ...next,
        folders: content.folders.filter(f => f.id !== folder.id).map(f => f.parent === folder.id ? { ...f, parent } : f),
        files: Object.fromEntries(Object.entries(content.files).map(([s, m]) => [s, m.folder === folder.id ? { ...m, folder: parent } : m])),
      };
    }
    case "file-move":
      if (!folderExists(content, op.folder)) fail("That folder was deleted.");
      return editMeta(op.series, meta => ({ ...meta, folder: op.folder }));
    default: return fail("Unknown change.");
  }
}

function ownFolder(content: ProjectContent, folderId: string, what: string): ContentFolder {
  const folder = (content.folders ?? []).find(f => f.id === folderId);
  if (folder) return folder;
  return fail(findFolder(content, folderId) ? `The built-in folders can't be ${what}.` : "That folder was deleted.");
}
/** How many levels of folders sit below `id` (0 when it has none). */
function depthBelow(content: ProjectContent, id: string): number {
  const below = [...folderAndInside(content, id)].filter(f => f !== id);
  return below.reduce((deepest, f) => Math.max(deepest, folderPath(content, f).length - folderPath(content, id).length), 0);
}

/** Everything a file supports: its own links and its markups' (each record once), latest revision's markups and older ones alike. */
export function fileLinks(content: ProjectContent, docs: StoredDocument[], series: string): ContentLink[] {
  const ids = new Set(docs.filter(d => d.series === series).map(d => d.id));
  return [...fileMeta(content, series).links, ...content.markups.filter(m => ids.has(m.docId)).flatMap(m => m.links)]
    .filter((l, i, all) => all.findIndex(x => x.kind === l.kind && x.id === l.id) === i);
}

export type ContentSource = "all" | "unlinked" | ContentLinkKind;
export type ContentRow = { doc: StoredDocument; revisions: number; tags: ContentTag[]; description: string; links: ContentLink[]; markups: number };

/**
 * The library: the latest revision of each file, newest first, with its tags, links and markup count.
 * `source` keeps files supporting one kind of record ("unlinked": none); `tag` files carrying that tag;
 * `search` matches the name, description, tag names and sheet numbers and titles.
 */
export function contentRows(docs: StoredDocument[], content: ProjectContent, filter: { source?: ContentSource; tag?: string; category?: string; search?: string } = {}): ContentRow[] {
  const words = (filter.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return latestDocuments(docs).map(doc => {
    const meta = fileMeta(content, doc.series), ids = new Set(docs.filter(d => d.series === doc.series).map(d => d.id));
    return {
      doc, revisions: ids.size, description: meta.description, links: fileLinks(content, docs, doc.series),
      tags: meta.tags.map(t => content.tags.find(x => x.id === t)).filter((t): t is ContentTag => !!t),
      markups: content.markups.filter(m => ids.has(m.docId)).length,
    };
  }).filter(row => {
    if (filter.source === "unlinked" ? row.links.length : filter.source && filter.source !== "all" && !row.links.some(l => l.kind === filter.source)) return false;
    if (filter.tag && !row.tags.some(t => t.id === filter.tag)) return false;
    if (filter.category && row.doc.category !== filter.category) return false;
    const haystack = [row.doc.name, row.description, ...row.tags.map(t => t.name), ...row.doc.sheets.flatMap(s => [s.sheet, s.title])].join(" ").toLowerCase();
    return words.every(w => haystack.includes(w));
  }).sort((a, b) => b.doc.uploadedAt.localeCompare(a.doc.uploadedAt));
}

/** How many files each source in the library's side list holds. */
export function sourceCounts(docs: StoredDocument[], content: ProjectContent): Record<ContentSource, number> {
  const rows = contentRows(docs, content);
  return Object.fromEntries([["all", rows.length], ["unlinked", rows.filter(r => !r.links.length).length], ...LINK_KINDS.map(k => [k.kind, rows.filter(r => r.links.some(l => l.kind === k.kind)).length])]) as Record<ContentSource, number>;
}

/** The markups of one revision, by page then position, with a search over title, description, assignee and comments. */
export function docMarkups(content: ProjectContent, docId: string, search = ""): Markup[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return content.markups.filter(m => m.docId === docId && words.every(w => [m.title, m.description, m.assignedTo, ...m.comments.map(c => c.text)].join(" ").toLowerCase().includes(w)))
    .sort((a, b) => a.page - b.page || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
}

/** Files and markups linked to one record, for the record's own screen ("Files: 2 · Markups: 3"). */
export function linkedTo(content: ProjectContent, docs: StoredDocument[], kind: ContentLinkKind, recordId: string): { files: StoredDocument[]; markups: Markup[] } {
  const has = (links: ContentLink[]) => links.some(l => l.kind === kind && l.id === recordId);
  return {
    files: latestDocuments(docs).filter(d => has(fileMeta(content, d.series).links)),
    markups: content.markups.filter(m => has(m.links) && docs.some(d => d.id === m.docId)),
  };
}

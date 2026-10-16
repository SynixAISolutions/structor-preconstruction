// Server side of Project files: the per-project index and page text in the private Blob store, and
// byte ranges of the original PDFs. Only reached through /api/project-files, behind the demo password.

import { del, get, put } from "@vercel/blob";
import { emptyIndex, indexPath, MAX_RANGE_BYTES, textPath, upsertDocument, type PageText, type ProjectFileIndex, type StoredDocument } from "./project-files";

async function readJson<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: "private", useCache: false }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  return await new Response(result.stream).json() as T;
}

const writeJson = (pathname: string, value: unknown) =>
  put(pathname, JSON.stringify(value), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });

// ponytail: index cached per server instance for 30 s; range requests read it on every page load.
const cache = new Map<string, { at: number; index: ProjectFileIndex }>();

export async function readIndex(projectId: string, fresh = false): Promise<ProjectFileIndex> {
  const hit = cache.get(projectId);
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.index;
  const index = await readJson<ProjectFileIndex>(indexPath(projectId)) ?? emptyIndex(projectId);
  cache.set(projectId, { at: Date.now(), index });
  return index;
}

async function writeIndex(index: ProjectFileIndex) {
  await writeJson(indexPath(index.projectId), index);
  cache.set(index.projectId, { at: Date.now(), index });
  return index;
}

// ponytail: read-modify-write without a lock; two uploads finishing in the same instant could drop one entry.
export const registerDocument = async (doc: StoredDocument) => writeIndex(upsertDocument(await readIndex(doc.projectId, true), doc));

export async function updateDocument(projectId: string, docId: string, change: (doc: StoredDocument) => StoredDocument) {
  const index = await readIndex(projectId, true);
  const doc = index.documents.find(d => d.id === docId);
  if (!doc) throw new Error("No such document.");
  return writeIndex(upsertDocument(index, change(doc)));
}

export async function removeDocument(projectId: string, docId: string) {
  const index = await readIndex(projectId, true);
  const doc = index.documents.find(d => d.id === docId);
  if (!doc) return index;
  const next = await writeIndex({ ...index, documents: index.documents.filter(d => d.id !== docId), updatedAt: new Date().toISOString() });
  await del([doc.sourceUrl, ...Array.from({ length: doc.textChunks }, (_, n) => textPath(projectId, docId, n))]).catch(() => {});
  return next;
}

export const saveText = (projectId: string, docId: string, chunk: number, pages: PageText[]) => writeJson(textPath(projectId, docId, chunk), pages);
export const readText = (projectId: string, docId: string, chunk: number) => readJson<PageText[]>(textPath(projectId, docId, chunk));

/** A byte range of a stored PDF, straight from the private store. */
export async function sourceRange(doc: StoredDocument, range: string | null): Promise<Response> {
  const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
  if (!match) return new Response("Ask for a byte range, e.g. bytes=0-1048575.", { status: 416 });
  const [start, end] = [Number(match[1]), Number(match[2])];
  if (end < start || end - start + 1 > MAX_RANGE_BYTES || end >= doc.size) return new Response("Range too large or outside the file.", { status: 416 });
  const upstream = await fetch(doc.sourceUrl, { headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`, range: `bytes=${start}-${end}` } });
  if (upstream.status !== 206) { await upstream.body?.cancel(); return new Response("The stored file could not be read.", { status: 502 }); }
  return new Response(upstream.body, {
    status: 206,
    headers: { "content-type": "application/pdf", "content-range": `bytes ${start}-${end}/${doc.size}`, "content-length": String(end - start + 1), "cache-control": "private, max-age=86400, immutable" },
  });
}

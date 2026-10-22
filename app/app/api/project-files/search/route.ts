import { indexPages, searchPages, type PageIndex } from "../../../../lib/file-search";
import { DOCUMENT_CATEGORIES, latestDocuments, validId } from "../../../../lib/project-files";
import { readIndex, readText } from "../../../../lib/project-files-store";

// Ask Structor's file search: the newest revision of every file in the project, searched by its
// stored page text. Page text is written once after upload, so each chunk's word index is kept for
// the life of this server instance (oldest dropped past MAX_CHUNKS).
export const runtime = "nodejs";

const MAX_CHUNKS = 400;
const indexes = new Map<string, PageIndex>();
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function chunkIndex(projectId: string, docId: string, chunk: number): Promise<PageIndex | null> {
  const key = `${projectId}/${docId}/${chunk}`;
  const cached = indexes.get(key);
  if (cached) return cached;
  const pages = await readText(projectId, docId, chunk);
  if (!pages) return null; // Not written yet (an upload in progress): try again next search.
  const index = indexPages(pages);
  indexes.set(key, index);
  if (indexes.size > MAX_CHUNKS) indexes.delete(indexes.keys().next().value!);
  return index;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const projectId = q.get("project");
  const query = (q.get("q") ?? "").trim().slice(0, 200);
  const category = q.get("category") ?? "";
  if (!validId(projectId) || !query) return json({ error: "Name the project and what to search for." }, 400);
  if (category && !(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) return json({ error: "Unknown file category." }, 400);
  const docs = latestDocuments((await readIndex(projectId)).documents).filter(d => !category || d.category === category);
  const entries = (await Promise.all(docs.flatMap(doc => Array.from({ length: doc.textChunks }, async (_, chunk) => {
    const index = await chunkIndex(projectId, doc.id, chunk);
    return index ? { doc, index } : null;
  })))).filter(e => e !== null);
  return json({ results: searchPages(entries, query), files: docs.length, pages: entries.reduce((n, e) => n + e.index.pages.length, 0) });
}

import { renameDemoNamesDeep } from "../../../../lib/demo-names";
import { validId, withOcrPage, type PageText } from "../../../../lib/project-files";
import { readText, saveText } from "../../../../lib/project-files-store";

// Page text of a stored PDF, in chunks of pages: written once after upload, read by the AI jobs. A scanned page can
// later be given the text OCR read off its image (PATCH), once, without touching the rest of its chunk.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const [projectId, docId, chunk] = [q.get("project"), q.get("doc"), Number(q.get("chunk"))];
  if (!validId(projectId) || !validId(docId) || !Number.isInteger(chunk) || chunk < 0) return json({ error: "Name the project, document and chunk." }, 400);
  const pages = await readText(projectId, docId, chunk);
  return pages ? Response.json(renameDemoNamesDeep(pages), { headers: { "cache-control": "private, max-age=3600" } }) : json({ error: "No text stored for those pages." }, 404);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 4_000_000) return json({ error: "Send fewer pages at a time." }, 413);
  let body: { projectId?: unknown; docId?: unknown; chunk?: unknown; pages?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  const { projectId, docId, chunk } = body;
  if (!validId(projectId) || !validId(docId) || !Number.isInteger(chunk) || (chunk as number) < 0) return json({ error: "Name the project, document and chunk." }, 400);
  const pages = (Array.isArray(body.pages) ? body.pages : []).filter((p: any): p is PageText => Number.isInteger(p?.page) && p.page > 0 && typeof p.text === "string").map(p => ({ page: p.page, text: p.text.slice(0, 200_000) }));
  await saveText(projectId, docId, chunk as number, pages);
  return json({ saved: pages.length });
}

/**
 * The text OCR read off one scanned page, saved into its stored chunk on the server, so the chunk's other pages keep
 * their original text (GET hands text out with demo names; a chunk written back from it would lose the originals).
 * Refused for a page that already has a real text layer.
 */
export async function PATCH(request: Request) {
  const raw = await request.text();
  if (raw.length > 400_000) return json({ error: "That page's text is too long." }, 413);
  let body: { projectId?: unknown; docId?: unknown; chunk?: unknown; page?: unknown; text?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  const { projectId, docId, chunk, page, text } = body;
  if (!validId(projectId) || !validId(docId) || !Number.isInteger(chunk) || (chunk as number) < 0 || !Number.isInteger(page) || (page as number) < 1 || typeof text !== "string") return json({ error: "Name the project, document, chunk and page, and send the page's text." }, 400);
  const pages = await readText(projectId, docId, chunk as number);
  if (!pages) return json({ error: "No text stored for those pages." }, 404);
  const merged = withOcrPage(pages, page as number, text);
  if (!merged) return json({ error: "This page has its own text layer; OCR text isn't saved over it." }, 409);
  await saveText(projectId, docId, chunk as number, merged);
  return json({ saved: 1 });
}

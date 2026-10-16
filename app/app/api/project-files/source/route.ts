import { validId } from "../../../../lib/project-files";
import { readIndex, sourceRange } from "../../../../lib/project-files-store";

// Byte ranges of a stored PDF, so the browser renders one drawing sheet or manual page without
// downloading the whole set.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const [projectId, docId] = [q.get("project"), q.get("doc")];
  if (!validId(projectId) || !validId(docId)) return new Response("Name the project and document.", { status: 400 });
  const doc = (await readIndex(projectId)).documents.find(d => d.id === docId) ?? (await readIndex(projectId, true)).documents.find(d => d.id === docId);
  if (!doc) return new Response("No such document.", { status: 404 });
  return sourceRange(doc, request.headers.get("range"));
}

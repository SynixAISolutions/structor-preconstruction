import { parseDocument, validId, type StoredDocument } from "../../../lib/project-files";
import { readIndex, registerDocument, removeDocument, updateDocument } from "../../../lib/project-files-store";

// Project files index: list a project's stored documents, register an upload, update what was read
// from its pages, or remove it. The demo password (proxy.ts) guards this like every route.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project");
  if (!validId(projectId)) return json({ error: "Name the project." }, 400);
  return json(await readIndex(projectId, true));
}

export async function POST(request: Request) {
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  const projectId = body?.projectId;
  if (!validId(projectId)) return json({ error: "Name the project." }, 400);
  try {
    if (body.op === "register") return json(await registerDocument(parseDocument(body.document, projectId)));
    if (body.op === "remove" && validId(body.docId)) return json(await removeDocument(projectId, body.docId));
    if (body.op === "update" && validId(body.docId)) {
      // Only what pages say may change after upload: sheet titles and manual sections.
      const patch = parseDocument({ ...body.document, id: body.docId }, projectId);
      return json(await updateDocument(projectId, body.docId, (doc: StoredDocument) => ({ ...doc, sheets: patch.sheets.length ? patch.sheets : doc.sheets, sections: patch.sections.length ? patch.sections : doc.sections })));
    }
    return json({ error: "Unknown request." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Project files could not be updated." }, 400);
  }
}

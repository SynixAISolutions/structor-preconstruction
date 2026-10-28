import { renameDemoNamesDeep } from "../../../lib/demo-names";
import { parseDocument, validId, type StoredDocument, isHash, parseSheetsAndSections, reuseDocument } from "../../../lib/project-files";
import { readIndex, registerDocument, removeDocument, renameDocument, updateDocument, findCopy } from "../../../lib/project-files-store";

// Project files index: list a project's stored documents, register an upload, update what was read
// from its pages, or remove it. The demo password (proxy.ts) guards this like every route.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(renameDemoNamesDeep(body), { status, headers: { "cache-control": "no-store" } });

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
    // An identical PDF already stored is reused instead of uploaded again: the server, not the browser, points the
    // new entry at the stored copy (lib/project-files reuseDocument).
    if (body.op === "reuse") {
      const d = body.document ?? {};
      if (!isHash(body.hash) || !Number.isInteger(body.size) || !["drawings", "manual", "other"].includes(body.kind) || !validId(d.id) || !validId(d.series)) return json({ error: "Name the file, its fingerprint and size." }, 400);
      const copy = await findCopy(body.hash, body.size, body.kind);
      if (!copy) return json({ reused: false });
      const name = typeof d.name === "string" ? d.name.trim().slice(0, 255) : "";
      const revision = Number.isInteger(d.revision) && d.revision >= 1 && d.revision <= 999 ? d.revision : 1;
      const doc = reuseDocument(copy, { id: d.id, projectId, name: name || copy.name, category: typeof d.category === "string" && d.category.trim() ? d.category.trim().slice(0, 40) : copy.category, series: d.series, revision, uploadedAt: new Date().toISOString() });
      return json({ reused: true, document: doc, index: await registerDocument(doc) });
    }
    if (body.op === "remove" && validId(body.docId)) return json(await removeDocument(projectId, body.docId));
    if (body.op === "rename" && validId(body.series)) return json(await renameDocument(projectId, body.series, body.name));
    if (body.op === "update" && validId(body.docId)) {
      // Only what pages say may change after upload: sheet titles and manual sections.
      const patch = parseSheetsAndSections(body.document ?? {});
      return json(await updateDocument(projectId, body.docId, (doc: StoredDocument) => ({ ...doc, sheets: patch.sheets.length ? patch.sheets : doc.sheets, sections: patch.sections.length ? patch.sections : doc.sections })));
    }
    return json({ error: "Unknown request." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Project files could not be updated." }, 400);
  }
}

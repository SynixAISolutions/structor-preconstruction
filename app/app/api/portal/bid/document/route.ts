import { bidDocuments } from "../../../../../lib/bid-portal";
import { readIndex, sourceRange } from "../../../../../lib/project-files-store";
import { bidSession, json } from "../session";

// Byte ranges of the drawings, specifications and addenda a bid is priced on (the page joins them into a download, as
// a single server response is capped at 4.5 MB). Nothing else in Project files can be named here.
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { session, error } = await bidSession(request);
    if (error) return error;
    const id = new URL(request.url).searchParams.get("doc") ?? "";
    const stored = (await readIndex(session.claim.projectId)).documents;
    const doc = bidDocuments(stored).some(d => d.id === id) ? stored.find(d => d.id === id) : undefined;
    return doc ? await sourceRange(doc, request.headers.get("range")) : json({ error: "That document isn't part of this bid." }, 404);
  } catch { return json({ error: "The document could not be opened. Please try again." }, 503); }
}

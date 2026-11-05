import { findBidFile } from "../../../../../lib/bid-portal";
import { streamBidFile } from "../../../../../lib/bid-files";
import { readRow, startingSubmissions } from "../../../../../lib/portal-store";
import { bidSession, json } from "../session";

// A sub's own proposal file, back to them. Only files on their own bid can be named.
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { session, error } = await bidSession(request);
    if (error) return error;
    const { value } = await readRow(session.store, session.claim.projectId, "submissions", startingSubmissions(session.claim.projectId));
    const file = findBidFile(value, session.invitationId, new URL(request.url).searchParams.get("id") ?? "");
    return file ? await streamBidFile(file) : json({ error: "That file isn't on your bid." }, 404);
  } catch { return json({ error: "The file could not be opened. Please try again." }, 503); }
}

import { findBidFile } from "../../../../lib/bid-portal";
import { streamBidFile } from "../../../../lib/bid-files";
import { readRow, startingSubmissions } from "../../../../lib/portal-store";
import { sharedStore } from "../../../../lib/shared-store";

// A proposal file a sub sent, for the estimator, behind the site's sign-in (proxy.ts).
export const runtime = "nodejs";

export async function GET(request: Request) {
  const store = sharedStore();
  if (!store) return new Response("Shared saving isn't connected.", { status: 503 });
  const q = new URL(request.url).searchParams;
  const projectId = q.get("project") ?? "", invitationId = q.get("invitation") ?? "", id = q.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) return new Response("Name the project.", { status: 400 });
  try {
    const { value } = await readRow(store, projectId, "submissions", startingSubmissions(projectId));
    const file = findBidFile(value, invitationId, id);
    return file ? await streamBidFile(file) : new Response("That file isn't on this bid.", { status: 404 });
  } catch { return new Response("The file could not be opened.", { status: 503 }); }
}

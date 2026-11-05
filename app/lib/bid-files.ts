// A stored proposal file as a download. Server only.

import { get } from "@vercel/blob";
import type { AttachmentMeta } from "./submissions";

export async function streamBidFile(file: AttachmentMeta): Promise<Response> {
  const found = await get(file.storageKey!, { access: "private", useCache: false });
  if (!found || found.statusCode !== 200) return new Response("The file could not be found.", { status: 404 });
  const name = file.name.replace(/[^\w. -]+/g, "_");
  return new Response(found.stream, { headers: { "Content-Type": file.type || "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

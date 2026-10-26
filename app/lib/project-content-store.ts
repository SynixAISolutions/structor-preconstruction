// Server storage for content management (lib/project-content): one JSON per project in the private Blob
// store, next to the files' index. Changes are applied to the stored copy and written only over the version
// read (the Blob ETag); when someone else's change landed first, they are applied again to the new copy, so
// two people marking up at once both keep their work. Server only.
// ponytail: Blob JSON until Danial picks a database; read/apply keep the same shape on Postgres.

import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { blobRoot } from "./project-files";
import { applyContentOp, emptyContent, normalizeContent, type ContentOp, type ProjectContent } from "./project-content";
import { strongEtag } from "./clarification-store";

const pathOf = (projectId: string) => `${blobRoot(projectId)}/content.json`;

export async function readContent(projectId: string): Promise<{ content: ProjectContent; etag: string | null }> {
  const result = await get(pathOf(projectId), { access: "private", useCache: false }).catch(() => null);
  if (!result || result.statusCode !== 200) return { content: emptyContent(projectId), etag: null };
  return { content: normalizeContent(await new Response(result.stream).json(), projectId), etag: strongEtag(result.blob.etag) };
}

/** Applies `ops` in order, all or none, as `by`; returns the stored content. */
export async function changeContent(projectId: string, ops: ContentOp[], by: string): Promise<ProjectContent> {
  for (let attempt = 0; ; attempt++) {
    const { content, etag } = await readContent(projectId);
    const now = new Date().toISOString();
    const next = ops.reduce((c, op) => applyContentOp(c, op, by, now, () => randomUUID()), content);
    try {
      await put(pathOf(projectId), JSON.stringify(next), {
        access: "private", addRandomSuffix: false, contentType: "application/json",
        ...(etag === null ? { allowOverwrite: false } : { allowOverwrite: true, ifMatch: etag }),
      });
      return next;
    } catch (error) {
      const stale = /precondition|412|already exists|ifMatch|etag/i.test(error instanceof Error ? error.message : String(error));
      if (!stale || attempt >= 4) throw stale ? new Error("Others are changing these files right now. Try again.") : error;
    }
  }
}

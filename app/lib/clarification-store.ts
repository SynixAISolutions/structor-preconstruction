// Server storage for clarification requests (Close the gap, 20 Oct): one JSON object per request in the
// project's private Blob store, written only over the version the caller read (the Blob ETag), so two
// people answering or applying at once can't overwrite each other. Server only.
// ponytail: Blob JSON until Danial picks a database; the same four functions move to Postgres unchanged for callers.

import { get, list, put } from "@vercel/blob";
import type { ClarificationRequest } from "./clarifications";

export class StaleWriteError extends Error {
  constructor() { super("This request was changed elsewhere. Reload it and try again."); this.name = "StaleWriteError"; }
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const pathOf = (projectId: string, id: string) => {
  if (!ID.test(projectId) || !ID.test(id)) throw new Error("Unsafe project or request id.");
  return `clarifications/${projectId}/${id}.json`;
};

/** A compressed response can carry the weak form (W/"..."); a conditional write needs the strong one. */
export const strongEtag = (etag: string) => etag.replace(/^W\//, "");

export async function readRequest(projectId: string, id: string): Promise<{ request: ClarificationRequest; etag: string } | null> {
  const result = await get(pathOf(projectId, id), { access: "private", useCache: false }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  return { request: await new Response(result.stream).json() as ClarificationRequest, etag: strongEtag(result.blob.etag) };
}

/** Writes `request`. `etag` null = it must not exist yet; otherwise the stored copy must still carry that ETag. */
export async function writeRequest(request: ClarificationRequest, etag: string | null): Promise<void> {
  const pathname = pathOf(request.projectId, request.id);
  try {
    await put(pathname, JSON.stringify(request), {
      access: "private", addRandomSuffix: false, contentType: "application/json",
      ...(etag === null ? { allowOverwrite: false } : { allowOverwrite: true, ifMatch: etag }),
    });
  } catch (error) {
    // A precondition failure (another write got there first) or an existing blob on create.
    if (/precondition|412|already exists|ifMatch|etag/i.test(error instanceof Error ? error.message : String(error))) throw new StaleWriteError();
    throw error;
  }
}

/** Every request of a project, newest first. */
export async function listRequests(projectId: string): Promise<ClarificationRequest[]> {
  if (!ID.test(projectId)) throw new Error("Unsafe project id.");
  const found: ClarificationRequest[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `clarifications/${projectId}/`, cursor, limit: 200 });
    for (const b of page.blobs) {
      const id = b.pathname.slice(`clarifications/${projectId}/`.length).replace(/\.json$/, "");
      const r = await readRequest(projectId, id);
      if (r) found.push(r.request);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

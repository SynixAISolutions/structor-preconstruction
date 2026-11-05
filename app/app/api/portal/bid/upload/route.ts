import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { BID_FILE_TYPES, validBidFilePath } from "../../../../../lib/bid-portal";
import { MAX_ATTACHMENT_BYTES } from "../../../../../lib/submissions";
import { bidSession, json } from "../session";

// A short-lived token so a sub's browser can send a proposal file straight to the private store (a server request is
// capped at 4.5 MB). Only into their own invitation's folder, only the file types a bid takes.
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { session, error } = await bidSession(request);
    if (error) return error;
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async pathname => {
        if (!validBidFilePath(pathname, session.claim.projectId, session.invitationId)) throw new Error("Files go into your bid's own folder.");
        return { allowedContentTypes: BID_FILE_TYPES, maximumSizeInBytes: MAX_ATTACHMENT_BYTES, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    return Response.json(result);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The upload could not start." }, 400);
  }
}

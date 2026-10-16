import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_SOURCE_BYTES, validId } from "../../../../lib/project-files";

// Issues a short-lived token so the browser can send a large PDF straight to the private Blob store
// (a server request is capped at 4.5 MB). Only PDFs, only into a project's own folder.
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async pathname => {
        const [root, projectId, docId, file] = pathname.split("/");
        if (root !== "project-files" || !validId(projectId) || !validId(docId) || file !== "source.pdf") throw new Error("Files go into a project's folder as source.pdf.");
        return { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX_SOURCE_BYTES, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The upload could not start." }, { status: 400 });
  }
}

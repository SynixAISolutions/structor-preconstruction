import { get } from "@vercel/blob";
import { audioRange, isFeedbackId } from "../../../../../lib/voice-feedback";
import { readFeedback } from "../../../../../lib/voice-feedback-store";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isFeedbackId(id)) return new Response("Message not found.", { status: 404 });
  try {
    const record = await readFeedback(id);
    if (!record) return new Response("Message not found.", { status: 404 });
    const file = await get(record.audioPath, { access: "private" });
    if (!file || file.statusCode !== 200) return new Response("Recording not found.", { status: 404 });
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    let range;
    try { range = audioRange(request.headers.get("range"), bytes.length); }
    catch { return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } }); }
    const headers = new Headers({ "Content-Type": record.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" });
    if (new URL(request.url).searchParams.has("download")) headers.set("Content-Disposition", `attachment; filename="structor-feedback-${id}.${record.extension}"`);
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(bytes.slice(range.start, range.end + 1), { status: 206, headers });
    }
    headers.set("Content-Length", String(bytes.length));
    return new Response(bytes, { headers });
  } catch { return new Response("The recording could not be loaded. Please try again.", { status: 503 }); }
}

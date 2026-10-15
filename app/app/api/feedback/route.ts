import { audioFormat, feedbackRecord, MAX_VOICE_BYTES, parseFeedback } from "../../../lib/voice-feedback";
import { listFeedback, saveFeedback } from "../../../lib/voice-feedback-store";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// The shared demo password in proxy.ts protects the inbox and recordings.
export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > 2000) return json({ error: "Invalid message page." }, 400);
  try { return json(await listFeedback(cursor)); }
  catch { return json({ error: "Messages could not be loaded. Please try again." }, 503); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    // Next may reconstruct request.url with an internal hostname behind its proxy.
    let sameHost = false;
    try { const source = new URL(origin); sameHost = ["http:", "https:"].includes(source.protocol) && source.host === (request.headers.get("host") || new URL(request.url).host); } catch {}
    if (!sameHost) return json({ error: "Send feedback from the Structor page." }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return json({ error: "An audio recording is required." }, 415);
  const maxBody = MAX_VOICE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > maxBody) return json({ error: "This recording is too large. Record a shorter message." }, 413);
  let input, audio: Uint8Array, format;
  try {
    // Bound the stream too: a chunked upload may have no Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "The recording is missing." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBody) { await reader.cancel(); return json({ error: "This recording is too large. Record a shorter message." }, 413); }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const details = form.get("details");
    if (typeof details !== "string" || details.length > 8000) throw new Error("The message details are missing.");
    input = parseFeedback(JSON.parse(details));
    const file = form.get("audio");
    if (!(file instanceof File) || !file.size) throw new Error("Record a message before sending.");
    if (file.size > MAX_VOICE_BYTES) return json({ error: "This recording is too large. Record a shorter message." }, 413);
    audio = new Uint8Array(await file.arrayBuffer());
    format = audioFormat(file.type, audio);
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? "The message details are invalid." : error instanceof Error ? error.message : "The recording could not be read." }, 400);
  }
  try { return json({ message: await saveFeedback(feedbackRecord(input), audio, format) }, 201); }
  catch { return json({ error: "Your recording was not sent. Please try again; you can still listen to or download it." }, 503); }
}

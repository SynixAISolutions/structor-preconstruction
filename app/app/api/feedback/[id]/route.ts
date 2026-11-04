import { cleanTranscript, isFeedbackId } from "../../../../lib/voice-feedback";
import { saveTranscript } from "../../../../lib/voice-feedback-store";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// A voice note's transcript, made in the browser that transcribed it (lib/voice-transcribe). The sign-in (proxy.ts) guards it.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isFeedbackId(id)) return json({ error: "Message not found." }, 404);
  const origin = request.headers.get("origin");
  if (origin) {
    let sameHost = false;
    try { const source = new URL(origin); sameHost = ["http:", "https:"].includes(source.protocol) && source.host === (request.headers.get("host") || new URL(request.url).host); } catch {}
    if (!sameHost) return json({ error: "Send this from the Structor page." }, 403);
  }
  let transcript: string;
  try { transcript = cleanTranscript((await request.json())?.transcript); }
  catch (problem) { return json({ error: problem instanceof Error ? problem.message : "The transcript could not be read." }, 400); }
  try {
    const saved = await saveTranscript(id, transcript);
    return saved ? json(saved) : json({ error: "Message not found." }, 404);
  } catch { return json({ error: "The transcript could not be saved. Please try again." }, 503); }
}

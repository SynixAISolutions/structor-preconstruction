import { del, get, list, put } from "@vercel/blob";
import { feedbackPath, VOICE_RECORDS_PREFIX, type VoiceFeedback } from "./voice-feedback";

type StoredFeedback = VoiceFeedback & { audioPath: string; mimeType: string; extension: string };

export async function readFeedback(id: string): Promise<StoredFeedback | null> {
  const result = await get(feedbackPath(id), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const record = await new Response(result.stream).json() as StoredFeedback;
  if (record.id !== id || !record.audioPath.startsWith(`voice-feedback/audio/${id}-`) || !["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"].includes(record.mimeType)) throw new Error("Invalid saved feedback.");
  return record;
}

export function publicFeedback(record: StoredFeedback): VoiceFeedback {
  const { audioPath: _path, mimeType: _type, extension: _extension, ...feedback } = record;
  return feedback;
}

export async function saveFeedback(record: VoiceFeedback, audio: Uint8Array, format: { type: string; extension: string }): Promise<VoiceFeedback> {
  const existing = await readFeedback(record.id);
  if (existing) return publicFeedback(existing);
  const blob = await put(`voice-feedback/audio/${record.id}.${format.extension}`, Buffer.from(audio), { access: "private", addRandomSuffix: true, contentType: format.type });
  try {
    const saved: StoredFeedback = { ...record, audioPath: blob.pathname, mimeType: format.type, extension: format.extension };
    await put(feedbackPath(record.id), JSON.stringify(saved), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json" });
    return record;
  } catch (error) {
    const saved = await readFeedback(record.id).catch(() => null);
    if (saved) {
      if (saved.audioPath !== blob.pathname) await del(blob.url).catch(() => {});
      return publicFeedback(saved);
    }
    // shortcut: a failed metadata write can leave unused private audio; add cleanup if volume grows.
    throw error;
  }
}

export async function listFeedback(cursor?: string) {
  const result = await list({ prefix: VOICE_RECORDS_PREFIX, limit: 20, cursor });
  const records = await Promise.all(result.blobs.map(async blob => {
    const file = await get(blob.pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200) throw new Error("A message could not be loaded.");
    return publicFeedback(await new Response(file.stream).json() as StoredFeedback);
  }));
  return { messages: records, cursor: result.hasMore ? result.cursor : null };
}

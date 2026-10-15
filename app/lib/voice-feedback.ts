import { isScreen, screenGroup, screenLabel, type Screen } from "./screens";

export const MAX_VOICE_SECONDS = 180;
export const MAX_VOICE_BYTES = 3 * 1024 * 1024;
export const VOICE_RECORDS_PREFIX = "voice-feedback/records/";
export type FeedbackPage = { screen: Screen; projectId: string | null; projectName: string | null };
export type VoiceFeedback = FeedbackPage & {
  id: string; pageLabel: string; author: string; note: string; duration: number; createdAt: string;
};
export type FeedbackInput = FeedbackPage & { id: string; author: string; note: string; duration: number };
export const isFeedbackId = (id: string) => /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);

// Reverse time keeps the newest recordings first in Blob's pathname pagination.
export function feedbackPath(id: string): string {
  if (!isFeedbackId(id)) throw new Error("Invalid feedback ID.");
  return `${VOICE_RECORDS_PREFIX}${String(9_999_999_999_999 - Number(id.slice(0, 13))).padStart(13, "0")}-${id.slice(14)}.json`;
}

export function parseFeedback(value: unknown): FeedbackInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The message details are missing.");
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !isFeedbackId(v.id)) throw new Error("Start a new recording before sending.");
  if (typeof v.screen !== "string" || !isScreen(v.screen)) throw new Error("Choose a valid page for this message.");
  if (typeof v.author !== "string" || !v.author.trim() || v.author.length > 120) throw new Error("Enter your name (up to 120 characters).");
  if (typeof v.note !== "string" || v.note.length > 1000) throw new Error("Keep the optional note under 1,000 characters.");
  if (typeof v.duration !== "number" || !Number.isFinite(v.duration) || v.duration <= 0 || v.duration > MAX_VOICE_SECONDS + 2) throw new Error("Record a message up to 3 minutes long.");
  const projectPage = screenGroup(v.screen)?.scope !== "global" && v.screen !== "settings";
  if (projectPage && (typeof v.projectId !== "string" || !/^[\w-]{1,100}$/.test(v.projectId) || typeof v.projectName !== "string" || !v.projectName.trim() || v.projectName.length > 180)) throw new Error("The project details are missing.");
  return { id: v.id, screen: v.screen, author: v.author.trim(), note: v.note.trim(), duration: v.duration,
    projectId: projectPage ? v.projectId as string : null, projectName: projectPage ? (v.projectName as string).trim() : null };
}

export function feedbackRecord(input: FeedbackInput): VoiceFeedback {
  return { ...input, pageLabel: screenLabel(input.screen), createdAt: new Date().toISOString() };
}

export function audioFormat(type: string, bytes: Uint8Array): { type: string; extension: string } {
  const mime = type.split(";")[0].trim().toLowerCase();
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 16) {
    if (mime === "audio/webm" && [0x1a, 0x45, 0xdf, 0xa3].every((n, i) => bytes[i] === n)) return { type: mime, extension: "webm" };
    if (mime === "audio/mp4" && ascii(4, 8) === "ftyp") return { type: mime, extension: "m4a" };
    if (mime === "audio/ogg" && ascii(0, 4) === "OggS") return { type: mime, extension: "ogg" };
    if ((mime === "audio/wav" || mime === "audio/x-wav") && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { type: "audio/wav", extension: "wav" };
  }
  throw new Error("This file is not a supported audio recording. Please record it again.");
}

export function audioRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new Error("Invalid audio range.");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error("Invalid audio range.");
  return { start, end };
}

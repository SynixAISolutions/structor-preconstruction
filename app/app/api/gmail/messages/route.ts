import { NextRequest, NextResponse } from "next/server";
import { GMAIL_COOKIE, refreshGmailTokens, sealTokens, unsealTokens } from "../../../../lib/gmail";

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string };
  parts?: GmailPart[];
};

function attachments(part?: GmailPart): { id: string; name: string; mimeType: string }[] {
  if (!part) return [];
  const own = part.filename && part.body?.attachmentId
    ? [{ id: part.body.attachmentId, name: part.filename, mimeType: part.mimeType || "application/octet-stream" }]
    : [];
  return own.concat((part.parts || []).flatMap(attachments));
}

export async function GET(request: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.json({ error: "Gmail setup is required before connecting an account. Add the Google OAuth credentials and session secret, then restart the app." }, { status: 503 });
  }
  const stored = unsealTokens(request.cookies.get(GMAIL_COOKIE)?.value);
  if (!stored) return NextResponse.json({ error: "Connect Gmail to view proposal emails." }, { status: 401 });

  try {
    const tokens = await refreshGmailTokens(stored, request.nextUrl.origin);
    const authorization = { Authorization: `Bearer ${tokens.accessToken}` };
    const listResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=has%3Aattachment%20newer_than%3A30d", {
      headers: authorization,
      cache: "no-store",
    });
    if (!listResponse.ok) throw new Error("Gmail messages could not be retrieved.");
    const list = await listResponse.json() as { messages?: { id: string }[] };
    const messages = await Promise.all((list.messages || []).map(async ({ id }) => {
      const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, {
        headers: authorization,
        cache: "no-store",
      });
      if (!detailResponse.ok) return null;
      const detail = await detailResponse.json() as {
        id: string;
        snippet?: string;
        payload?: GmailPart & { headers?: { name: string; value: string }[] };
      };
      const headers = new Map((detail.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]));
      return {
        id: detail.id,
        sender: headers.get("from") || "Unknown sender",
        subject: headers.get("subject") || "(No subject)",
        date: headers.get("date") || "",
        snippet: detail.snippet || "",
        attachments: attachments(detail.payload),
      };
    }));
    const response = NextResponse.json({ messages: messages.filter(Boolean) });
    response.cookies.set(GMAIL_COOKIE, sealTokens(tokens), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail could not be loaded." }, { status: 502 });
  }
}

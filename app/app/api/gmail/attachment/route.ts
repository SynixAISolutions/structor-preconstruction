import { NextRequest, NextResponse } from "next/server";
import { GMAIL_COOKIE, refreshGmailTokens, sealTokens, unsealTokens } from "../../../../lib/gmail";

const gmailId = /^[A-Za-z0-9_-]+$/;

export async function GET(request: NextRequest) {
  const messageId = request.nextUrl.searchParams.get("messageId") || "";
  const attachmentId = request.nextUrl.searchParams.get("attachmentId") || "";
  const filename = (request.nextUrl.searchParams.get("filename") || "attachment").replaceAll(/[\r\n]/g, "");
  const requestedType = request.nextUrl.searchParams.get("mimeType") || "";
  if (!gmailId.test(messageId) || !gmailId.test(attachmentId)) {
    return NextResponse.json({ error: "Invalid Gmail attachment identifier." }, { status: 400 });
  }
  const stored = unsealTokens(request.cookies.get(GMAIL_COOKIE)?.value);
  if (!stored) return NextResponse.json({ error: "Connect Gmail to download attachments." }, { status: 401 });

  try {
    const tokens = await refreshGmailTokens(stored, request.nextUrl.origin);
    const gmailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
    });
    if (!gmailResponse.ok) throw new Error("Attachment could not be retrieved from Gmail.");
    const payload = await gmailResponse.json() as { data?: string };
    if (!payload.data) throw new Error("Gmail returned an empty attachment.");
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(requestedType) ? requestedType : "application/octet-stream";
    const response = new NextResponse(new Uint8Array(Buffer.from(payload.data, "base64url")), {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store",
      },
    });
    response.cookies.set(GMAIL_COOKIE, sealTokens(tokens), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attachment could not be downloaded." }, { status: 502 });
  }
}


import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GMAIL_STATE_COOKIE, gmailSettings } from "../../../../lib/gmail";

export async function GET(request: NextRequest) {
  try {
    const settings = gmailSettings(request.nextUrl.origin);
    const state = randomBytes(24).toString("base64url");
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.search = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    const response = NextResponse.redirect(authorization);
    response.cookies.set(GMAIL_STATE_COOKIE, state, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail connection failed." }, { status: 500 });
  }
}


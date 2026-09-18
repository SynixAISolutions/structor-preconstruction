import { NextRequest, NextResponse } from "next/server";
import { GMAIL_COOKIE, GMAIL_STATE_COOKIE, gmailSettings, sealTokens } from "../../../../lib/gmail";

export async function GET(request: NextRequest) {
  const redirect = new URL("/", request.nextUrl.origin);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GMAIL_STATE_COOKIE)?.value;
  if (!code || !state || state !== expectedState) {
    redirect.searchParams.set("gmail", "failed");
    return NextResponse.redirect(redirect);
  }

  try {
    const settings = gmailSettings(request.nextUrl.origin);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        redirect_uri: settings.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("Google rejected the authorization code.");
    const token = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };
    const response = NextResponse.redirect(redirect);
    response.cookies.set(GMAIL_COOKIE, sealTokens({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    }), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.delete(GMAIL_STATE_COOKIE);
    return response;
  } catch {
    redirect.searchParams.set("gmail", "failed");
    return NextResponse.redirect(redirect);
  }
}


import { NextResponse } from "next/server";
import { passwordMatches, SESSION_COOKIE, SESSION_DAYS, sessionToken } from "../../../lib/demo-password";

// Signing in and out from the Structor sign-in page (lib/demo-password). POST { password } sets the session
// cookie; DELETE clears it.

const cookie = (value: string, maxAge: number, request: Request) => ({
  name: SESSION_COOKIE, value, maxAge, path: "/", httpOnly: true, sameSite: "lax" as const,
  secure: new URL(request.url).protocol === "https:",
});

export async function POST(request: Request) {
  const password = process.env.DEMO_PASSWORD;
  if (!password?.trim()) {
    return process.env.VERCEL
      ? NextResponse.json({ error: "Sign-in isn't set up on this server yet (no DEMO_PASSWORD)." }, { status: 503 })
      : NextResponse.json({ ok: true });
  }
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  if (!passwordMatches(body?.password, password)) {
    // A pause on every wrong password slows down guessing.
    await new Promise(resolve => setTimeout(resolve, 600));
    return NextResponse.json({ error: "That password isn't right. Check it and try again." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie(await sessionToken(password), SESSION_DAYS * 86_400, request));
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie("", 0, request));
  return response;
}

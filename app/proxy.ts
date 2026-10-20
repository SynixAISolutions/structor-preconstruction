import { NextResponse, type NextRequest } from "next/server";
import { PASSWORD_CHALLENGE, passwordAccepted } from "./lib/demo-password";

/** Asks for the demo password (DEMO_PASSWORD in Vercel) before any page, file or API route. */
export function proxy(request: NextRequest) {
  // The subcontractor portal has no password: its page shows nothing without a signed link, and its
  // API checks that link on every call (lib/portal-links). Everything else stays behind the password.
  const path = request.nextUrl.pathname;
  if (path.startsWith("/portal/") || path.startsWith("/api/portal/")) return NextResponse.next();
  if (passwordAccepted(request.headers.get("authorization"), process.env.DEMO_PASSWORD, !!process.env.VERCEL)) return NextResponse.next();
  return new NextResponse("This Structor demo needs a password.", { status: 401, headers: { "WWW-Authenticate": PASSWORD_CHALLENGE } });
}

// Build assets carry no project data; everything else, the API included, is behind the password.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

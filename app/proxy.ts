import { NextResponse, type NextRequest } from "next/server";
import { passwordAccepted, SESSION_COOKIE, sessionValid } from "./lib/demo-password";

/**
 * Asks for the demo password (DEMO_PASSWORD in Vercel) before any page, file or API route: a page goes to
 * the Structor sign-in page, an API call gets a 401 with a message. A signed-in browser carries the session
 * cookie; scripts can still send the password as a Basic header.
 */
export async function proxy(request: NextRequest) {
  // The subcontractor portal has no password: its page shows nothing without a signed link, and its
  // API checks that link on every call (lib/portal-links). The sign-in page and its API are open too.
  const path = request.nextUrl.pathname;
  if (path.startsWith("/portal/") || path.startsWith("/api/portal/") || path === "/login" || path === "/api/login") return NextResponse.next();
  const password = process.env.DEMO_PASSWORD;
  if (passwordAccepted(request.headers.get("authorization"), password, !!process.env.VERCEL)) return NextResponse.next();
  if (await sessionValid(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Your Structor sign-in has ended. Reload the page and sign in again." }, { status: 401 });
  const login = new URL("/login", request.url);
  if (path !== "/") login.searchParams.set("next", `${path}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

// Build assets carry no project data; everything else, the API included, is behind the password.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

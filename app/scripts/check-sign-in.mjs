import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const W = await import("../lib/demo-password.ts");
const { proxy } = await import("../proxy.ts");
const { POST, DELETE } = await import("../app/api/login/route.ts");
const { NextRequest } = await import("next/server");

// The Structor sign-in page instead of the browser's password box (Danial, 27 Oct).
const saved = { password: process.env.DEMO_PASSWORD, vercel: process.env.VERCEL };
try {
  // A session is signed with the password and lasts SESSION_DAYS.
  const now = Date.parse("2026-10-27T12:00:00Z");
  const token = await W.sessionToken("s3cret", now);
  assert.equal(await W.sessionValid(token, "s3cret", now + 1000), true);
  assert.equal(await W.sessionValid(token, "s3cret", now + (W.SESSION_DAYS - 1) * 86_400_000), true, "Still signed in a day before it ends");
  assert.equal(await W.sessionValid(token, "s3cret", now + (W.SESSION_DAYS + 1) * 86_400_000), false, "Ended after SESSION_DAYS");
  assert.equal(await W.sessionValid(token, "new password", now), false, "Changing the password ends every session");
  const [stamp, signature] = token.split(".");
  assert.equal(await W.sessionValid(`${Number(stamp) + 86_400_000 * 365}.${signature}`, "s3cret", now), false, "A longer expiry can't be written in");
  for (const bad of [undefined, "", "abc", `${stamp}.`, `.${signature}`, `${stamp}.${signature}.x`, `12.${signature}`]) assert.equal(await W.sessionValid(bad, "s3cret", now), false, `Not a session: ${bad}`);
  assert.equal(await W.sessionValid(token, undefined, now), false, "No password, no sessions");

  assert.deepEqual([W.passwordMatches("s3cret", "s3cret"), W.passwordMatches("s3cre", "s3cret"), W.passwordMatches("", "s3cret"), W.passwordMatches(123, "s3cret"), W.passwordMatches("x", undefined)], [true, false, false, false, false]);

  // After signing in: back to a page of this site only.
  assert.deepEqual(["/settings?x=1", "/", null, "", "//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/login?next=/x"].map(W.afterSignIn), ["/settings?x=1", "/", "/", "/", "/", "/", "/", "/", "/"]);

  // The gate, hosted with a password.
  process.env.DEMO_PASSWORD = "s3cret"; process.env.VERCEL = "1";
  const ask = (path, headers = {}) => proxy(new NextRequest(`https://structor.example${path}`, { headers }));
  const passes = res => res.headers.get("x-middleware-next") === "1";
  const home = await ask("/");
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "https://structor.example/login", "A page goes to the sign-in page");
  assert.equal(home.headers.get("www-authenticate"), null, "The browser's own password box is never asked for");
  assert.equal((await ask("/settings?tab=team")).headers.get("location"), "https://structor.example/login?next=%2Fsettings%3Ftab%3Dteam", "…and comes back after");
  const api = await ask("/api/project-files?project=jelleff");
  assert.deepEqual([api.status, api.headers.get("www-authenticate"), typeof (await api.json()).error], [401, null, "string"], "An API call gets a 401 with a message");
  for (const open of ["/login", "/api/login", "/portal/abc", "/api/portal/bid"]) assert(passes(await ask(open)), `${open} is open`);
  const live = await W.sessionToken("s3cret");
  assert(passes(await ask("/", { cookie: `${W.SESSION_COOKIE}=${live}` })), "A signed-in browser goes through");
  assert(passes(await ask("/api/ai", { authorization: `Basic ${Buffer.from("x:s3cret").toString("base64")}` })), "Scripts can still send the password");
  assert.equal((await ask("/", { cookie: `${W.SESSION_COOKIE}=${await W.sessionToken("old password")}` })).status, 307, "A session from another password doesn't count");

  // Signing in and out.
  const post = body => POST(new Request("https://structor.example/api/login", { method: "POST", headers: { "content-type": "application/json" }, body }));
  const wrong = await post(JSON.stringify({ password: "nope" }));
  assert.deepEqual([wrong.status, wrong.headers.get("set-cookie")], [401, null]);
  assert.match((await wrong.json()).error, /isn't right/);
  assert.equal((await post("not json")).status, 401);
  const right = await post(JSON.stringify({ password: "s3cret" }));
  const set = right.headers.get("set-cookie");
  assert.equal(right.status, 200);
  assert.match(set, new RegExp(`^${W.SESSION_COOKIE}=\\d{13}\\.`));
  for (const part of [/HttpOnly/i, /Secure/i, /SameSite=lax/i, /Path=\//, new RegExp(`Max-Age=${W.SESSION_DAYS * 86400}`)]) assert.match(set, part);
  assert(passes(await ask("/", { cookie: set.split(";")[0] })), "The cookie it sets lets the browser in");
  assert.match((await DELETE(new Request("https://structor.example/api/login", { method: "DELETE" }))).headers.get("set-cookie"), /Max-Age=0/, "Signing out clears it");

  // Hosted without a password: everything stays shut; locally there is no gate.
  delete process.env.DEMO_PASSWORD;
  assert.equal((await ask("/")).status, 307);
  assert.equal((await post(JSON.stringify({ password: "" }))).status, 503);
  delete process.env.VERCEL;
  assert(passes(await ask("/")), "Local development has no gate");
  assert.equal((await post("{}")).status, 200);
} finally {
  for (const [key, name] of [["password", "DEMO_PASSWORD"], ["vercel", "VERCEL"]]) if (saved[key] === undefined) delete process.env[name]; else process.env[name] = saved[key];
}

console.log("Sign-in checked: signed 30-day sessions, safe return pages, pages to the sign-in page and APIs to a 401 (never the browser's password box), open portal and sign-in routes, scripts' Basic header, sign in and out.");

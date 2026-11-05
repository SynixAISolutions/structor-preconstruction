import assert from "node:assert/strict";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const D = await import("../lib/docusign.ts");
const S = await import("../lib/docusign-server.ts");
const P = await import("../lib/docusign-pdf.ts");
const A = await import("../lib/award.ts");

// DocuSign for subcontract signatures (Marcel, 22 Oct: "the only important thing that we need to focus on is we use DocuSign").

const content = { title: "Subcontract agreement · Drywall", sections: [{ heading: "Parties", lines: ["Contractor: Build Co", "Agreement form: form.pdf — /api/document-assets?id=11111111-2222-4333-8444-555555555555", "A long line ".repeat(40)] }] };
const exhibit = { title: "Exhibit A — Scope of Work", sections: [{ heading: "Scope of work", lines: ["1. Gypsum board → Type X, façade side"] }] };
const signers = { subcontractor: { name: "Sarah Chen", email: "sarah@sub.example" }, contractor: { name: "Marcel Khoury", email: "marcel@gc.example" } };
const asset = { id: "11111111-2222-4333-8444-555555555555", name: "Insurance.pdf", type: "application/pdf", size: 10 };
const request = { subject: "Drywall subcontract · Project 1", contractorName: "Build Co", subcontractorName: "Sub LLC", documents: [content, exhibit], assets: [asset], signers };

// ── A request is checked before anything leaves ──
const parsed = D.parseEnvelopeRequest(request);
assert.equal(parsed.subject, request.subject);
assert.deepEqual(parsed.signers, signers);
assert.equal(D.parseEnvelopeRequest({ ...request, subject: "x".repeat(200) }).subject.length, 100, "DocuSign's subject limit");
assert.throws(() => D.parseEnvelopeRequest({ ...request, signers: { ...signers, subcontractor: { name: "", email: "a@b.co" } } }), /subcontractor's signer name/);
assert.throws(() => D.parseEnvelopeRequest({ ...request, signers: { ...signers, contractor: { name: "M", email: "nope" } } }), /contractor's signer email/);
assert.throws(() => D.parseEnvelopeRequest({ ...request, signers: { subcontractor: signers.subcontractor, contractor: { name: "Same", email: "SARAH@sub.example" } } }), /different signers/);
assert.throws(() => D.parseEnvelopeRequest({ ...request, documents: [] }), /no content/);
assert.throws(() => D.parseEnvelopeRequest({ ...request, assets: [{ id: "../secret", name: "x" }] }), /attachment is invalid/);
assert.throws(() => D.parseEnvelopeRequest({ ...request, contractorName: " " }), /both company names/);

// ── The envelope, in DocuSign's words ──
const body = D.envelopeBody(parsed, "UERG", [{ name: "Insurance.pdf", extension: "pdf", base64: "QQ==" }]);
assert.equal(body.status, "sent");
assert.deepEqual(body.documents.map(d => [d.documentId, d.fileExtension, d.documentBase64]), [["1", "pdf", "UERG"], ["2", "pdf", "QQ=="]], "The contract first, then the originals");
assert.deepEqual(body.recipients.signers.map(s => [s.email, s.recipientId, s.routingOrder, s.tabs.signHereTabs[0].anchorString, s.tabs.dateSignedTabs[0].anchorString]),
  [["sarah@sub.example", "1", "1", "/sn1/", "/ds1/"], ["marcel@gc.example", "2", "2", "/sn2/", "/ds2/"]], "The subcontractor signs first, the contractor countersigns");
const read = D.readEnvelope({ envelopeId: "E", status: "sent", voidedReason: "", recipients: { signers: [
  { routingOrder: "2", name: "M", email: "m@x.co", status: "created" },
  { routingOrder: "1", name: "S", email: "s@x.co", status: "completed", signedDateTime: "2026-11-05T10:00:00Z" },
] } });
assert.deepEqual(read.signers.map(s => [s.name, s.status, s.signedAt]), [["S", "completed", "2026-11-05T10:00:00Z"], ["M", "created", null]], "In signing order");
assert.deepEqual(D.readEnvelope(null), { id: "", status: "", signers: [], completedAt: null, voidedReason: "" }, "Nothing readable isn't a crash");

// ── DocuSign's limit on reading status ──
assert.equal(D.canCheck("2026-11-05T10:00:00.000Z", "2026-11-05T10:14:59.000Z"), false);
assert.equal(D.canCheck("2026-11-05T10:00:00.000Z", "2026-11-05T10:15:00.000Z"), true);
assert.equal(D.nextCheckAt("2026-11-05T10:00:00.000Z"), "2026-11-05T10:15:00.000Z");
assert.deepEqual(["sent", "delivered", "completed", "declined", "voided"].map(D.envelopeLive), [true, true, false, false, false]);
assert.deepEqual(["sent", "completed", "declined", "voided"].map(D.envelopeDead), [false, false, true, true]);
assert.equal(D.isEnvelopeId("11111111-2222-4333-8444-555555555555"), true);
assert.equal(D.isEnvelopeId("../../accounts"), false);

// ── Keys and the signed sign-in ──
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const env = { DOCUSIGN_INTEGRATION_KEY: "ik-1", DOCUSIGN_USER_ID: "user-1", DOCUSIGN_ACCOUNT_ID: "acct-1", DOCUSIGN_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n") };
assert.equal(S.docusignConfig({ ...env, DOCUSIGN_USER_ID: " " }), null, "Any key missing means not connected");
const config = S.docusignConfig(env);
assert.equal(config.privateKey, privateKey, "Line breaks written as \\n in Vercel");
assert.deepEqual([config.oauthUrl, config.audience], ["https://account-d.docusign.com", "account-d.docusign.com"], "The sandbox unless production is chosen");
assert.equal(S.docusignConfig({ ...env, DOCUSIGN_OAUTH_URL: "https://account.docusign.com/" }).audience, "account.docusign.com");
const [header, claims, signature] = S.jwtAssertion(config, 1000).split(".");
const decode = part => JSON.parse(Buffer.from(part, "base64url").toString());
assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
assert.deepEqual(decode(claims), { iss: "ik-1", sub: "user-1", aud: "account-d.docusign.com", iat: 1000, exp: 4600, scope: "signature impersonation" });
assert(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(createPublicKey(publicKey), signature, "base64url"), "Signed with the app's key");
assert.match(S.consentUrl(config, "https://structor.example"), /^https:\/\/account-d\.docusign\.com\/oauth\/auth\?response_type=code&scope=signature%20impersonation&client_id=ik-1&redirect_uri=https%3A%2F%2Fstructor\.example$/);

// ── The contract PDF ──
assert.deepEqual(P.wrapText("one two three four", t => t.length <= 7), ["one two", "three", "four"]);
assert.deepEqual(P.wrapText("unbreakableword x", t => t.length <= 3), ["unbreakableword", "x"], "A word too long still appears");
const pdfBytes = await P.contractPdf(parsed);
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true, verbosity: 0 }).promise;
const pageText = [];
for (let i = 1; i <= doc.numPages; i++) pageText.push((await (await doc.getPage(i)).getTextContent()).items.map(t => t.str).join(" "));
const allText = pageText.join("\n");
assert(doc.numPages >= 3, "Subcontract, Exhibit A and a signature page");
for (const anchor of ["/sn1/", "/ds1/", "/sn2/", "/ds2/"]) assert(pageText.at(-1).includes(anchor), `${anchor} on the signature page`);
assert(!allText.includes("/api/document-assets"), "No link only this app can open");
assert(allText.includes("form.pdf (attached)"));
assert(allText.includes("Sarah Chen") && allText.includes("Marcel Khoury") && allText.includes("Sub LLC") && allText.includes("Build Co"));
assert(allText.includes("Exhibit A") && allText.includes("façade"), "Accents survive; the arrow doesn't break it");

// ── The contract flow ──
const at = "2026-11-05T10:00:00.000Z";
const files = { company: { name: "Build Co", form: asset }, b: { title: "B", sections: [{ heading: "Drawings", lines: ["A1"] }] }, files: Object.fromEntries(["C", "D", "E", "F", "G"].map(c => [c, { ...asset, name: `Exhibit ${c}.pdf` }])) };
const sub = { attachments: files, status: "draft", content, template: { id: "t", name: "T", version: "1", sample: true, notice: "" }, contractorName: "Build Co", exhibitRevision: 1, amount: 1000, createdAt: at, createdBy: "S", sentAt: null, subcontractorSignature: null, contractorSignature: null, executedAt: null, executedCopy: null };
const award = { id: "a1", projectId: "p", packageId: "drywall", invitationId: "i", bidderId: "b", submissionId: "s", revisionNumber: 1, budgetLineId: null, basis: "base", amount: 1000, leveling: {}, cancelled: null, createdAt: at, createdBy: "S", updatedAt: at,
  snapshot: { projectName: "Project 1", packageName: "Drywall", packageCode: "09 29 00", packageOwner: "Sadie", formVersion: 1, scope: [], exclusions: [], alternates: [], clarifications: [], allowances: [], company: { name: "Sub LLC", contact: "Sarah Chen", email: "sarah@sub.example" } },
  exhibit: { status: "agreed", comments: [], agreement: { by: "S", party: "contractor", at, revisionNumber: 1 }, revisions: [{ number: 1, content: exhibit, template: {}, createdAt: at, createdBy: "S", note: "" }] }, subcontract: sub };
const base = Object.freeze({ awards: [award], notifications: [] });
const envelopeOf = (status, first, second, extra = {}) => ({ id: "env-1", status, completedAt: null, voidedReason: "", signers: [{ routingOrder: 1, name: "Sarah Chen", email: "sarah@sub.example", status: first, signedAt: first === "completed" ? "2026-11-06T10:00:00Z" : null, declinedReason: "" }, { routingOrder: 2, name: "Marcel Khoury", email: "marcel@gc.example", status: second, signedAt: second === "completed" ? "2026-11-07T10:00:00Z" : null, declinedReason: "" }], ...extra });
const one = s => s.awards[0].subcontract;

const req = A.envelopeRequest(base, "a1", signers);
assert.equal(req.subject, "Drywall subcontract · Project 1");
assert.deepEqual(req.documents, [content, exhibit], "The agreed Exhibit A");
assert.deepEqual(req.assets.map(a => a.name), ["Insurance.pdf", "Exhibit C.pdf", "Exhibit D.pdf", "Exhibit E.pdf", "Exhibit F.pdf", "Exhibit G.pdf"], "The form, then every exhibit");
assert.doesNotThrow(() => D.parseEnvelopeRequest(req), "What the flow builds passes the route's own check");
const incomplete = { awards: [{ ...award, subcontract: { ...sub, attachments: { ...files, files: {} } } }], notifications: [] };
assert.throws(() => A.envelopeRequest(incomplete, "a1", signers), /Complete the contract package first/, "Nothing goes out with exhibits missing");

let s = A.recordEnvelope(base, "a1", { envelopeId: "env-1", status: "sent" }, signers, "Marcel", at);
assert.deepEqual([one(s).status, one(s).sentAt, one(s).docusign.envelopeId, one(s).docusign.status, one(s).docusign.checkedAt], ["signature-pending", at, "env-1", "sent", at]);
assert.match(s.notifications.at(-1).text, /went to Sarah Chen \(sarah@sub\.example\) for signature in DocuSign/);
assert.throws(() => A.recordEnvelope(s, "a1", { envelopeId: "env-2", status: "sent" }, signers, "M", at), /already sent/, "One live envelope");
assert.throws(() => A.envelopeRequest(s, "a1", signers), /already sent/);
assert.throws(() => A.signSubcontract(s, "a1", "subcontractor", { name: "x", title: "", email: "x@y.co" }, at), /signatures come from there/, "No typed signature on a DocuSign contract");

const later = "2026-11-06T12:00:00.000Z";
let t = A.applyEnvelope(s, "a1", envelopeOf("sent", "sent", "created"), later);
assert.deepEqual([one(t).status, one(t).docusign.checkedAt, t.notifications.length], ["signature-pending", later, s.notifications.length], "Nothing new but the time it was checked");
assert.throws(() => A.applyEnvelope(s, "a1", { ...envelopeOf("sent", "sent", "created"), id: "other" }, later), /isn't this subcontract's/);
t = A.applyEnvelope(s, "a1", envelopeOf("sent", "completed", "sent"), later);
assert.deepEqual([one(t).status, one(t).subcontractorSignature.name, one(t).subcontractorSignature.signedAt, one(t).subcontractorSignature.method], ["subcontractor-signed", "Sarah Chen", "2026-11-06T10:00:00Z", "docusign"]);
assert.equal(A.awardStage(t.awards[0]), "subcontractor-signed", "The buyout tracker follows the same stages");
assert.match(t.notifications.at(-1).text, /Sub LLC signed the Drywall subcontract in DocuSign/);
const notes = t.notifications.length;
assert.equal(A.applyEnvelope(t, "a1", envelopeOf("sent", "completed", "sent"), later).notifications.length, notes, "Checking again doesn't notify again");
t = A.applyEnvelope(t, "a1", envelopeOf("completed", "completed", "completed", { completedAt: "2026-11-07T10:00:00Z" }), later);
assert.deepEqual([one(t).status, one(t).contractorSignature.name, one(t).executedAt], ["executed", "Marcel Khoury", "2026-11-07T10:00:00Z"]);
assert.match(one(t).executedCopy, /Subcontractor: Sarah Chen <sarah@sub\.example>, signed 2026-11-06T10:00:00Z \(DocuSign envelope env-1\)/);
assert.match(one(t).executedCopy, /Exhibit A — Scope of Work/);
assert.equal(A.applyEnvelope(t, "a1", envelopeOf("completed", "completed", "completed"), later), t, "Executed stays as it is");
const both = A.applyEnvelope(s, "a1", envelopeOf("completed", "completed", "completed"), later);
assert.equal(one(both).status, "executed", "Both signed between checks");
assert.throws(() => A.executeSubcontract({ awards: [{ ...s.awards[0], subcontract: { ...one(s), status: "countersigned" } }], notifications: [] }, "a1", later), /when DocuSign completes it/);

// Declined, then out again.
const declined = envelopeOf("declined", "declined", "created");
declined.signers[0].declinedReason = "Wrong amount";
let d = A.applyEnvelope(s, "a1", declined, later);
assert.deepEqual([one(d).status, one(d).docusign.status, one(d).docusign.problem], ["signature-pending", "declined", "Sarah Chen declined to sign: Wrong amount"]);
assert.match(d.notifications.at(-1).text, /Drywall subcontract: Sarah Chen declined to sign: Wrong amount/);
assert.equal(A.applyEnvelope(d, "a1", declined, later).notifications.length, d.notifications.length, "Told once");
assert.doesNotThrow(() => A.envelopeRequest(d, "a1", signers), "A declined envelope can go out again");
const again = A.recordEnvelope(d, "a1", { envelopeId: "env-2", status: "sent" }, signers, "M", later);
assert.deepEqual([one(again).status, one(again).docusign.envelopeId, one(again).docusign.problem], ["signature-pending", "env-2", ""]);
const signedThenVoid = A.applyEnvelope(A.applyEnvelope(s, "a1", envelopeOf("sent", "completed", "sent"), later), "a1", envelopeOf("voided", "completed", "sent", { voidedReason: "Envelope has expired." }), later);
assert.equal(one(signedThenVoid).docusign.problem, "The envelope was voided: Envelope has expired.");
assert.equal(one(A.recordEnvelope(signedThenVoid, "a1", { envelopeId: "env-3", status: "sent" }, signers, "M", later)).subcontractorSignature, null, "A new envelope is signed afresh");

// Without DocuSign, recorded signatures still work as they always have.
const typed = A.signSubcontract(A.sendSubcontract(base, "a1", at), "a1", "subcontractor", { name: "Sarah", title: "", email: "s@x.co" }, at);
assert.equal(one(typed).subcontractorSignature.method, "typed-demo");
const typedDone = A.executeSubcontract(A.signSubcontract(typed, "a1", "contractor", { name: "Marcel", title: "", email: "m@x.co" }, at), "a1", at);
assert.match(one(typedDone).executedCopy, /\(typed demo signature\)/);

// ── The routes, against a fake DocuSign ──
const { GET: setupRoute } = await import("../app/api/docusign/route.ts");
const { POST: sendRoute } = await import("../app/api/docusign/envelopes/route.ts");
const { GET: statusRoute, PATCH: voidRoute } = await import("../app/api/docusign/envelopes/[id]/route.ts");
const { GET: documentRoute } = await import("../app/api/docusign/envelopes/[id]/document/route.ts");
const clear = () => { for (const k of Object.keys(env)) delete process.env[k]; delete process.env.DOCUSIGN_OAUTH_URL; S.forgetDocusignSession(); };
const url = "https://structor.test/api/docusign";
clear();
assert.deepEqual(await (await setupRoute(new Request(url))).json(), { configured: false, ready: false }, "No keys: not connected");
assert.equal((await sendRoute(new Request(`${url}/envelopes`, { method: "POST", body: "{}" }))).status, 503);
assert.equal((await statusRoute(new Request(url), { params: Promise.resolve({ id: asset.id }) })).status, 503);

Object.assign(process.env, env);
const realFetch = globalThis.fetch;
const calls = [];
let token = { access_token: "tok", expires_in: 3600 }, created = { envelopeId: asset.id, status: "sent" };
globalThis.fetch = async (input, init = {}) => {
  const href = String(input);
  calls.push({ href, method: init.method ?? "GET", headers: init.headers, body: init.body });
  if (href.endsWith("/oauth/token")) return Response.json(token, { status: token.error ? 400 : 200 });
  if (href.endsWith("/oauth/userinfo")) return Response.json({ accounts: [{ account_id: "acct-1", base_uri: "https://demo.docusign.net" }] });
  if (href.endsWith("/envelopes") && init.method === "POST") return created.message ? Response.json(created, { status: 400 }) : Response.json(created, { status: 201 });
  if (href.includes("/documents/combined")) return new Response(new Uint8Array([37, 80, 68, 70]));
  if (init.method === "PUT") return Response.json({ envelopeId: asset.id });
  if (href.includes("?include=recipients")) return Response.json({ envelopeId: asset.id, status: "sent", recipients: { signers: [{ routingOrder: "1", name: "S", email: "s@x.co", status: "sent" }] } });
  return new Response("{}", { status: 404 });
};
token = { error: "consent_required" };
const consent = await (await setupRoute(new Request(url))).json();
assert.deepEqual([consent.configured, consent.ready], [true, false]);
assert.match(consent.consentUrl, /oauth\/auth\?.*client_id=ik-1.*redirect_uri=https%3A%2F%2Fstructor\.test/, "Asks for the one-time permission");
assert(!JSON.stringify(consent).includes("PRIVATE KEY"));
token = { access_token: "tok", expires_in: 3600 };
assert.deepEqual(await (await setupRoute(new Request(url))).json(), { configured: true, ready: true });
const send = (body, headers = {}) => sendRoute(new Request(`${url}/envelopes`, { method: "POST", headers, body: JSON.stringify(body) }));
assert.equal((await send({ ...request, assets: [] }, { origin: "https://evil.test", host: "structor.test" })).status, 403, "Only from the Structor page");
assert.equal((await send({ ...request, signers: {} })).status, 400);
assert.equal(calls.filter(c => c.href.endsWith("/envelopes")).length, 0, "Refused requests never reach DocuSign");
const sent = await send({ ...request, assets: [] }, { origin: "https://structor.test", host: "structor.test" });
assert.equal(sent.status, 201);
assert.deepEqual(await sent.json(), { envelopeId: asset.id, status: "sent" });
const post = calls.find(c => c.href.endsWith("/envelopes"));
assert.equal(post.href, "https://demo.docusign.net/restapi/v2.1/accounts/acct-1/envelopes");
assert.equal(post.headers.Authorization, "Bearer tok");
assert.equal(calls.filter(c => c.href.endsWith("/oauth/token")).length, 2, "The token is reused until it nears its end: one failed, one good");
const sentBody = JSON.parse(post.body);
assert.equal(Buffer.from(sentBody.documents[0].documentBase64, "base64").subarray(0, 4).toString(), "%PDF", "A real PDF goes in");
assert.equal(sentBody.recipients.signers[0].email, "sarah@sub.example");
created = { errorCode: "INVALID_EMAIL_ADDRESS_FOR_RECIPIENT", message: "The email address is invalid." };
const refused = await send({ ...request, assets: [] });
assert.equal(refused.status, 502);
assert.equal((await refused.json()).error, "DocuSign: The email address is invalid.", "DocuSign's reason reaches the person");
const params = { params: Promise.resolve({ id: asset.id }) };
assert.deepEqual((await (await statusRoute(new Request(url), params)).json()).signers.map(x => x.status), ["sent"]);
assert.equal((await statusRoute(new Request(url), { params: Promise.resolve({ id: "../secret" }) })).status, 400);
assert.equal((await voidRoute(new Request(url, { method: "PATCH", body: "{}" }), params)).status, 400, "Voiding needs a reason");
assert.equal((await voidRoute(new Request(url, { method: "PATCH", body: JSON.stringify({ reason: "Award cancelled" }) }), params)).status, 200);
assert.deepEqual(JSON.parse(calls.find(c => c.method === "PUT").body), { status: "voided", voidedReason: "Award cancelled" });
const signedFile = await documentRoute(new Request(url), params);
assert.equal(signedFile.headers.get("content-type"), "application/pdf");
assert(calls.some(c => c.href.includes("/documents/combined?certificate=true")), "With the certificate of completion");
globalThis.fetch = realFetch;
clear();

console.log("DocuSign checked: requests refused before anything leaves, envelopes in signing order, the signed sign-in, the contract PDF and its fields, every contract stage, declined and resent, and the routes against a fake DocuSign.");
process.exit(0);

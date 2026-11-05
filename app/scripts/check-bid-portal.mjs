import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

register("./ts-resolver.mjs", import.meta.url);

// The subcontractor portal (Marcel, 24 Oct: "Subs only see their own portal page and submit their proposal and bid form
// there"). The real routes, on the real local store in a temporary folder.
const folder = mkdtempSync(join(tmpdir(), "bid-portal-")), started = process.cwd();
process.chdir(folder);
for (const key of ["DATABASE_URL", "POSTGRES_URL", "BLOB_READ_WRITE_TOKEN"]) delete process.env[key];
process.env.PORTAL_LINK_SECRET = "test-secret";

const P = await import("../lib/procurement.ts");
const B = await import("../lib/bid-portal.ts");
const T = await import("../lib/portal-store.ts");
const { sharedStore } = await import("../lib/shared-store.ts");
const { mergeJson } = await import("../lib/shared-merge.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleSubmissions } = await import("../lib/data/sample-award.ts");
const { proposalBafos } = await import("../lib/buyout.ts");
const { GET: portalGet, POST: portalPost } = await import("../app/api/portal/bid/route.ts");
const { POST: linkPost } = await import("../app/api/bid-portal/link/route.ts");
const { GET: ownFile } = await import("../app/api/portal/bid/file/route.ts");
const { GET: documentRoute } = await import("../app/api/portal/bid/document/route.ts");
const { GET: estimatorFile } = await import("../app/api/bid-portal/file/route.ts");
const { POST: uploadRoute } = await import("../app/api/portal/bid/upload/route.ts");

const by = "Sadie", at = "2026-11-05T10:00:00.000Z", PROJECT = "proj-1";
const store = sharedStore();

// ── A project with one published trade and two invited companies ──
let proc = { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] };
proc = P.addPackage(proc, { name: "Drywall", code: "09 29 00", owner: "Sadie", due: "2026-12-01", id: "drywall" });
proc = P.addPackage(proc, { name: "Paint", code: "09 91 23", owner: "Sadie", id: "paint" });
proc = P.addScope(proc, { packageId: "drywall", title: "Gypsum board" }, by, at);
proc = P.addScope(proc, { packageId: "drywall", title: "Metal studs" }, by, at);
for (const s of proc.scopes) proc = P.approveScope(proc, s.id, by, at);
proc = P.publishPackage(proc, "drywall", by, at);
proc = P.inviteBidder(proc, "drywall", "acme", by, at);
proc = P.inviteBidder(proc, "drywall", "rival", by, at);
proc = P.inviteBidder(proc, "paint", "acme", by, at);
const inviteOf = (pkg, bidder) => proc.invitations.find(i => i.packageId === pkg && i.bidderId === bidder).id;
const ACME = inviteOf("drywall", "acme"), RIVAL = inviteOf("drywall", "rival"), UNPUBLISHED = inviteOf("paint", "acme");
const items = proc.packages.find(p => p.id === "drywall").published.items;

const origin = "https://structor.test";
const makeLink = async (invitationId, company = "Acme Interiors", extra = {}, projectId = PROJECT) => linkPost(new Request(`${origin}/api/bid-portal/link`, { method: "POST", body: JSON.stringify({ projectId, invitationId, projectName: "Project 1", company, contact: "Pat Lee", email: "pat@acme.example", by, ...extra }) }));

// The invitation reaches the shared copy a few seconds after it's made, so the link waits for it.
const early = await makeLink(ACME);
assert.equal(early.status, 409);
assert.equal((await early.json()).saving, true);
await store.save(PROJECT, "procurement", T.packRow(proc), 0, "test");
assert.equal((await linkPost(new Request(`${origin}/api/bid-portal/link`, { method: "POST", headers: { origin: "https://evil.test", host: "structor.test" }, body: "{}" }))).status, 403, "Only from the Structor page");
assert.equal((await makeLink("../secret")).status, 400);
assert.equal((await makeLink(ACME, " ")).status, 400, "It needs the company's name");
const tokenOf = async (...args) => new URL((await (await makeLink(...args)).json()).path, origin).searchParams.get("t");
const acme = await tokenOf(ACME), rival = await tokenOf(RIVAL, "Rival Walls");

const url = (token, path = "/api/portal/bid") => `${origin}${path}?t=${encodeURIComponent(token)}`;
const open = async token => { const r = await portalGet(new Request(url(token))); return { status: r.status, body: await r.json() }; };
const act = async (token, body) => { const r = await portalPost(new Request(url(token), { method: "POST", body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

// ── A link opens its own invitation, and only with a good token ──
assert.equal((await open("nonsense")).status, 401);
assert.equal((await open(`${acme}x`)).status, 401, "A changed link doesn't open");
assert.equal((await act("nonsense", { action: "save" })).status, 401, "Nor can it save");
let { status, body } = await open(acme);
assert.equal(status, 200);
let view = body.view;
assert.deepEqual([view.projectName, view.company.name, view.company.contact, view.package.name, view.package.owner, view.invitation.status, view.form.version], ["Project 1", "Acme Interiors", "Pat Lee", "Drywall", "Sadie", "invited", 1]);
assert.deepEqual(view.form.items.map(i => i.title), ["Gypsum board", "Metal studs"]);
assert.equal(view.submission.bidderId, "acme", "The first look opens their bid");
assert.deepEqual(view.submission.draft.responses.map(r => r.answer), [null, null]);
assert.deepEqual(view.blockers, []);

const rows = async key => (await T.readRow(store, PROJECT, key, null)).value;
const answers = (status = "Y") => items.map(i => ({ scopeItemId: i.id, answer: status, note: "" }));
const expected = () => view.submission.updatedAt;

// ── Saving ──
const stale = await act(acme, { action: "save", draft: { baseBid: 1 }, expectedUpdatedAt: "2020-01-01" });
assert.equal(stale.status, 409, "Another window's older copy doesn't overwrite");
let saved = await act(acme, { action: "save", draft: { baseBid: 500000, responses: [...answers(), { scopeItemId: "not-on-form", answer: "Y", note: "" }], exclusions: ["Permits"], attachments: [{ id: "x", name: "evil.pdf", size: 1, storageKey: "other/secret.pdf" }] }, expectedUpdatedAt: expected() });
assert.equal(saved.status, 200);
assert.equal(saved.body.submission.draft.baseBid, 500000);
assert.deepEqual(saved.body.submission.draft.responses.map(r => r.scopeItemId), items.map(i => i.id), "Answers off the form are dropped");
assert.deepEqual(saved.body.submission.draft.attachments, [], "Files can't be slipped in through a save");
assert.equal((await rows("procurement")).invitations.find(i => i.id === ACME).status, "bidding", "The estimator sees they've started");
assert.equal((await act(acme, { action: "save", draft: { baseBid: -5 }, expectedUpdatedAt: saved.body.submission.updatedAt })).status, 422);
assert.equal((await act(acme, { action: "nonsense" })).status, 400);

// ── Submitting: V1, then V2 ──
await open(rival);
const missing = await act(rival, { action: "submit", submitter: { name: "R", email: "r@rival.example" } });
assert.equal(missing.status, 422);
assert(missing.body.issues.some(i => i.field === "baseBid") && missing.body.issues.some(i => i.field === "responses"), "Every problem comes back, by field");
assert.equal((await act(acme, { action: "submit", submitter: { name: "", email: "bad" } })).status, 422, "Who's submitting is required");
let sent = await act(acme, { action: "submit", submitter: { name: "Pat Lee", email: "pat@acme.example" } });
assert.equal(sent.status, 200);
view = sent.body.view;
assert.deepEqual([view.submission.revisions.length, view.submission.status, view.submission.revisions[0].baseBid, view.invitation.status], [1, "submitted", 500000, "submitted"]);
let stored = await rows("submissions");
assert.equal(stored.find(s => s.invitationId === ACME).revisions.length, 1, "It's in the project's own bids, where leveling reads it");
const tags = (await rows("procurement")).notifications.filter(n => n.kind === "bid-received");
assert.deepEqual(tags.map(n => [n.recipient, n.text]), [["Sadie", "Acme Interiors submitted a bid for Drywall."]]);
assert.equal((await act(acme, { action: "submit", submitter: { name: "Pat Lee", email: "pat@acme.example" } })).status, 422, "Nothing changed, so no new version");
saved = await act(acme, { action: "save", draft: { baseBid: 470000, responses: answers(), exclusions: ["Permits"] }, expectedUpdatedAt: view.submission.updatedAt });
sent = await act(acme, { action: "submit", submitter: { name: "Pat Lee", email: "pat@acme.example" } });
view = sent.body.view;
assert.deepEqual(view.submission.revisions.map(r => [r.number, r.baseBid]), [[1, 500000], [2, 470000]], "Earlier versions are kept");
assert.equal((await rows("procurement")).notifications.at(-1).text, "Acme Interiors submitted a revised bid (V2) for Drywall.");
stored = await rows("submissions");
const bafos = proposalBafos(stored, "drywall", null, [{ id: "acme", company: "Acme Interiors" }]);
assert.deepEqual(bafos.map(b => [b.company, b.amount, b.revision]), [["Acme Interiors", 470000, 2]], "A revised proposal counts as their best and final");

// ── A sub only ever sees their own bid ──
await act(rival, { action: "save", draft: { baseBid: 999111, responses: answers() }, expectedUpdatedAt: (await open(rival)).body.view.submission.updatedAt });
await act(rival, { action: "submit", submitter: { name: "Rob", email: "rob@rival.example" } });
const seen = JSON.stringify((await open(acme)).body);
for (const secret of ["999111", "Rival Walls", "rob@rival.example", "\"rival\""]) assert(!seen.includes(secret), `Acme's page shows nothing of ${secret}`);
for (const hidden of ["notifications", "outreach", "scopes", "budget"]) assert(!(hidden in (await open(acme)).body.view), `${hidden} isn't in the view`);
assert((await open(rival)).body.view.submission.bidderId === "rival");

// ── Messages, both ways, whichever saves first ──
assert.equal((await act(acme, { action: "message", author: "Pat", text: "  " })).status, 422);
assert.equal((await act(acme, { action: "message", author: " ", text: "Hi" })).status, 422);
assert.equal((await act(acme, { action: "message", author: "Pat", text: "x".repeat(4001) })).status, 422);
const mailed = await act(acme, { action: "message", author: "Pat", text: "Is the corridor in scope?" });
assert.deepEqual(mailed.body.view.messages.map(m => [m.from, m.author, m.text]), [["subcontractor", "Pat", "Is the corridor in scope?"]]);
assert.equal((await open(rival)).body.view.messages.length, 0, "Another company doesn't see the thread");
assert.match((await rows("procurement")).notifications.at(-1).text, /Acme Interiors sent a message about Drywall/);
const fromSub = await rows(B.BID_MESSAGES_KEY);
const reply = B.addBidMessage([], proc, ACME, { from: "contractor", author: "Sadie", text: "Yes, level 2 only." }, at);
const merged = mergeJson([], reply, fromSub);
assert.equal(merged.length, 2, "The estimator's reply and the sub's message both stand");
await store.save(PROJECT, B.BID_MESSAGES_KEY, T.packRow(merged), (await T.readRow(store, PROJECT, B.BID_MESSAGES_KEY, [])).version, "Sadie");
assert((await open(acme)).body.view.messages.some(m => m.from === "contractor" && m.text === "Yes, level 2 only."), "The sub sees the reply");
assert.equal(B.unreadMessages(merged, ACME), 1, "The estimator has one new message");
assert.equal(B.unreadMessages(B.markMessagesRead(merged, ACME), ACME), 0);
assert.equal(B.markMessagesRead(B.markMessagesRead(merged, ACME), ACME).length, 2);

// ── Files stay in their own folder ──
const fileId = "11111111-2222-4333-8444-555555555555";
const own = B.bidFilePath(PROJECT, ACME, fileId, "My proposal (final).pdf");
assert.equal(own, `bid-files/${PROJECT}/${ACME}/${fileId}/My-proposal-final-.pdf`);
assert(B.validBidFilePath(own, PROJECT, ACME));
for (const bad of [B.bidFilePath(PROJECT, RIVAL, fileId, "x.pdf"), `bid-files/${PROJECT}/${ACME}/../../secret.pdf`, "project-files/proj-1/doc/source.pdf", `bid-files/${PROJECT}/${ACME}/x.pdf`]) assert(!B.validBidFilePath(bad, PROJECT, ACME), bad);
assert.equal(B.bidFileType("bids.csv", ""), "text/csv");
assert.equal(B.bidFileType("a.PDF", "application/octet-stream"), "application/pdf");
const refused = await act(acme, { action: "attach", file: { name: "x.pdf", size: 10, type: "application/pdf", storageKey: B.bidFilePath(PROJECT, RIVAL, fileId, "x.pdf") } });
assert.equal(refused.status, 422, "Another company's folder is refused");
assert.equal((await act(acme, { action: "attach", file: { name: "virus.exe", size: 10, type: "application/x-msdownload", storageKey: own } })).status, 422, "A file type a bid doesn't take");
const attached = await act(acme, { action: "attach", file: { name: "Proposal.pdf", size: 2048, type: "application/pdf", storageKey: own } });
assert.equal(attached.status, 200);
const meta = attached.body.submission.draft.attachments[0];
assert.deepEqual([meta.name, meta.storageKey], ["Proposal.pdf", null], "Their page doesn't get the storage path");
stored = await rows("submissions");
assert.equal(B.findBidFile(stored, ACME, meta.id).storageKey, own, "The server keeps it");
assert.equal(B.findBidFile(stored, RIVAL, meta.id), null);
assert.equal((await ownFile(new Request(`${url(rival, "/api/portal/bid/file")}&id=${meta.id}`))).status, 404, "Rival can't fetch Acme's file");
assert.equal((await estimatorFile(new Request(`${origin}/api/bid-portal/file?project=${PROJECT}&invitation=${RIVAL}&id=${meta.id}`))).status, 404);
assert.equal((await estimatorFile(new Request(`${origin}/api/bid-portal/file?project=../x&invitation=${ACME}&id=${meta.id}`))).status, 400);
const removed = await act(acme, { action: "remove-file", id: meta.id });
assert.deepEqual(removed.body.submission.draft.attachments, []);
const uploadAsk = async (token, pathname) => uploadRoute(new Request(url(token, "/api/portal/bid/upload"), { method: "POST", body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, callbackUrl: `${origin}/x`, clientPayload: null, multipart: false } }) }));
assert.equal((await uploadAsk("nonsense", own)).status, 401, "No upload without a good link");
assert.equal((await uploadAsk(acme, B.bidFilePath(PROJECT, RIVAL, fileId, "x.pdf"))).status, 400, "No upload into another company's folder");

// ── Documents: what a bid is priced on, and nothing else ──
const doc = (id, category, series = id, revision = 1) => ({ id, name: `${id}.pdf`, category, series, revision, size: 10, pageCount: 1, sourcePath: "secret/path", sourceUrl: "https://secret" });
const shared = B.bidDocuments([doc("a1", "Drawings", "a"), doc("a2", "Drawings", "a", 2), doc("m", "Specifications"), doc("add", "Addenda"), doc("rfp", "RFP"), doc("bud", "Budget"), doc("con", "Contracts"), doc("rep", "Reports")]);
assert.deepEqual(shared.map(d => d.id), ["a2", "m", "add"], "The latest drawings, the manual and addenda; no RFP, budget, contracts or reports");
assert(!JSON.stringify(shared).includes("secret"), "Without where the files are stored");
assert.equal((await documentRoute(new Request(`${url(acme, "/api/portal/bid/document")}&doc=rfp`))).status >= 400, true);

// ── An unpublished form, a declined invitation, a turned-off link ──
const paint = await tokenOf(UNPUBLISHED);
const closed = (await open(paint)).body.view;
assert.deepEqual([closed.form, closed.submission, closed.blockers], [null, null, ["The Paint bid form has not been published yet."]]);
assert.equal((await act(paint, { action: "save", draft: {}, expectedUpdatedAt: null })).status, 422);
const declineMe = P.inviteBidder(await rows("procurement"), "drywall", "third", by, at);
await store.save(PROJECT, "procurement", T.packRow(declineMe), (await T.readRow(store, PROJECT, "procurement", null)).version, "test");
const THIRD = declineMe.invitations.find(i => i.bidderId === "third").id;
const third = await tokenOf(THIRD, "Third Co");
assert.equal((await act(acme, { action: "decline", reason: "Busy" })).status, 422, "A company whose bid is in messages the estimator instead");
const gone = await act(third, { action: "decline", author: "Tess", reason: "Too busy this month" });
assert.deepEqual([gone.body.view.invitation.status, gone.body.view.messages.at(-1).text], ["declined", "Declined to bid: Too busy this month"]);
assert.match((await rows("procurement")).notifications.at(-1).text, /Third Co declined to bid on Drywall/);
assert.equal((await act(third, { action: "save", draft: {}, expectedUpdatedAt: gone.body.view.submission?.updatedAt ?? null })).status, 422, "A declined company can't bid");
assert.equal((await open(third)).body.view.blockers.length, 1);
const off = await linkPost(new Request(`${origin}/api/bid-portal/link`, { method: "POST", body: JSON.stringify({ action: "revoke", projectId: PROJECT, invitationId: RIVAL, by }) }));
assert.equal(off.status, 200);
assert.equal((await open(rival)).status, 401, "A turned-off link stops working at once");
assert.equal((await act(rival, { action: "message", author: "R", text: "Hi" })).status, 401);
const fresh = await tokenOf(RIVAL, "Rival Walls");
assert.equal((await open(fresh)).status, 200, "The estimator can make a new one");

// An invitation moved to another company no longer opens for the first one.
const moved = { ...(await rows("procurement")) };
moved.invitations = moved.invitations.map(i => i.id === ACME ? { ...i, bidderId: "someone-else" } : i);
await store.save(PROJECT, "procurement", T.packRow(moved), (await T.readRow(store, PROJECT, "procurement", null)).version, "test");
assert.equal((await open(acme)).status, 404);

// ── Limits ──
const big = await portalPost(new Request(url(fresh), { method: "POST", headers: { "content-length": "2000000" }, body: "{}" }));
assert.equal(big.status, 413);
assert.equal((await portalPost(new Request(url(fresh), { method: "POST", body: "not json" }))).status, 400);

// ── Removing a company from the trade shuts its link, even one that's still turned on ──
const { removeInvitation } = await import("../lib/remove-company.ts");
const withoutRival = removeInvitation(await rows("procurement"), RIVAL);
await store.save(PROJECT, "procurement", T.packRow(withoutRival), (await T.readRow(store, PROJECT, "procurement", null)).version, "test");
assert.equal((await open(fresh)).status, 404, "The page no longer opens");
assert.equal((await act(fresh, { action: "message", author: "R", text: "Hi" })).status, 404, "And nothing more can be sent through it");

// ── The sample project keeps its sample bids when a real one comes in ──
const invited = sampleProcurement.invitations.find(i => i.status !== "declined" && sampleProcurement.packages.find(p => p.id === i.packageId)?.published);
const sampleLink = await makeLink(invited.id, "Sample Co", {}, "jelleff");
assert.equal(sampleLink.status, 200, "With nothing saved yet, the sample's own invitations count");
const sampleToken = new URL((await sampleLink.json()).path, origin).searchParams.get("t");
const sampleView = (await open(sampleToken)).body.view;
const sampleSave = await act(sampleToken, { action: "save", draft: { baseBid: 123456, responses: sampleView.submission.draft.responses }, expectedUpdatedAt: sampleView.submission.updatedAt });
assert.equal(sampleSave.status, 200);
const kept = (await T.readRow(store, "jelleff", "submissions", null)).value;
assert(sampleSubmissions.length > 0 && sampleSubmissions.every(s => kept.some(k => k.id === s.id)), "The first real save doesn't replace the sample's bids");

// ── Two saves at once: the second tries again on the first's version ──
let lost = 0;
const racing = { ...store, save: async (...args) => { if (lost++ === 0) await store.save(args[0], args[1], T.packRow(["theirs"]), (await T.readRow(store, args[0], args[1], null)).version, "them"); return store.save(...args); } };
const outcome = await T.changeRow(racing, PROJECT, "race-test", [], current => [...current, "mine"]);
assert.deepEqual(outcome, ["theirs", "mine"], "Neither change is lost");
const same = [];
assert.equal(await T.changeRow(store, PROJECT, "untouched", same, current => current), same);
assert.equal((await store.get(PROJECT, "untouched")), null, "No change, no save");

process.chdir(started);
rmSync(folder, { recursive: true, force: true });
console.log("Bid portal checked: signed links, one company's own bid only, drafts and versions, best and final from a revised proposal, messages both ways, files in their own folder, documents, declines, turned-off links and saves that don't overwrite each other.");
process.exit(0);

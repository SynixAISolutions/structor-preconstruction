// Procurement: trade packages, their scope / bid-form items, invitations, outreach and
// notifications for ONE project. Stored as a single project-scoped draft ("procurement").
//
// Marcel's workflow (17 + 20 Sep reviews):
// - AI drafts scope items per trade; an estimator approves each one before anyone outside
//   the company sees it. Scope and bid form are the same checklist.
// - An item in the wrong trade is MOVED to another trade, and that trade's owner is tagged.
//   An item every subcontractor must carry (e.g. temporary dust protection) is APPLIED TO
//   ALL TRADES instead of being duplicated.
// - "Publish to subcontractors" releases a package's bid form and notifies its invited bidders.
// - Outreach keeps a log per invited company: calls, notes, messages.
//
// Every action is a pure function (state in, new state out). Rule violations throw
// ProcurementRuleError with a message fit to show the user. Notifications are RECORDED
// here; nothing is emailed yet.

export type ScopeOrigin = "ai" | "drawing" | "specification" | "estimator";
export type ScopeStatus = "draft" | "approved";

export type ScopeEvent =
  | { kind: "created" | "approved" | "reopened" | "edited"; at: string; by: string }
  | { kind: "moved"; at: string; by: string; from: string; to: string }
  | { kind: "copied"; at: string; by: string; from: string; to: string }
  | { kind: "applied-to-all"; at: string; by: string };

export type ScopeItem = {
  id: string;
  /** The trade package that owns the item (for an all-trades item: where it came from). */
  packageId: string;
  title: string;
  detail: string;
  /** Drawing or specification reference, e.g. "AD-101 · Note 04" or "02 41 19 · §3.2". */
  source: string;
  origin: ScopeOrigin;
  status: ScopeStatus;
  /** Carried in every package's bid form. */
  allTrades: boolean;
  history: ScopeEvent[];
};

/** The bid form exactly as bidders received it. */
export type PublishedForm = { version: number; at: string; by: string; items: { id: string; title: string; detail: string; source: string }[] };

export type TradePackage = {
  id: string;
  /** Trade name. Division 09 splits into several trades (drywall, flooring, …). */
  name: string;
  /** CSI division, "09". */
  division: string;
  /** Main specification section, "09 29 00". */
  code: string;
  /** Estimator responsible for the trade; tagged when items move in. */
  owner: string;
  due: string;
  published?: PublishedForm;
};

export type InvitationStatus = "invited" | "bidding" | "declined" | "submitted";
export type Invitation = { id: string; packageId: string; bidderId: string; status: InvitationStatus; invitedAt: string; by: string };

export type OutreachKind = "call" | "note" | "message";
export type OutreachEntry = { id: string; packageId: string; bidderId: string; kind: OutreachKind; text: string; at: string; by: string };

export type NotificationKind = "scope-moved" | "scope-applied-to-all" | "bid-form-published" | "invited";
/** `recipient` is a team member's name (recipientType "team") or a directory bidder id ("bidder"). */
export type ProcurementNotification = { id: string; kind: NotificationKind; recipientType: "team" | "bidder"; recipient: string; packageId: string; text: string; at: string; read: boolean };

export type Procurement = {
  packages: TradePackage[];
  scopes: ScopeItem[];
  invitations: Invitation[];
  outreach: OutreachEntry[];
  notifications: ProcurementNotification[];
};

/** What the UI shows for a package. Derived, never stored. */
export type PackageStatus = "draft" | "ready" | "published" | "revised";

/** Minimal view of a directory company, so this module does not depend on the directory's full shape. */
export type DirectoryCompany = { id: string; company: string; name: string; trade: string };

export class ProcurementRuleError extends Error {
  constructor(message: string) { super(message); this.name = "ProcurementRuleError"; }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (message: string): never => { throw new ProcurementRuleError(message); };

function findPackage(state: Procurement, id: string): TradePackage {
  return state.packages.find(p => p.id === id) ?? fail("That trade package no longer exists.");
}
function findScope(state: Procurement, id: string): ScopeItem {
  return state.scopes.find(s => s.id === id) ?? fail("That scope item no longer exists.");
}
const replaceScope = (state: Procurement, item: ScopeItem): Procurement => ({ ...state, scopes: state.scopes.map(s => s.id === item.id ? item : s) });
const notify = (n: Omit<ProcurementNotification, "id" | "read">): ProcurementNotification => ({ ...n, id: newId(), read: false });

// ── Reading ─────────────────────────────────────────────────────────────────

/** A package's bid form: its own items plus every all-trades item, all-trades first. */
export function bidForm(state: Procurement, packageId: string): ScopeItem[] {
  return [
    ...state.scopes.filter(s => s.allTrades),
    ...state.scopes.filter(s => !s.allTrades && s.packageId === packageId),
  ];
}

const formContent = (items: ScopeItem[]) => items.map(({ id, title, detail, source }) => ({ id, title, detail, source }));

/** Why a package cannot be published right now; empty when it can. */
export function publishBlockers(state: Procurement, packageId: string): string[] {
  const pkg = findPackage(state, packageId);
  const form = bidForm(state, packageId);
  const reasons: string[] = [];
  if (!form.length) reasons.push(`${pkg.name} has no scope items yet.`);
  const drafts = form.filter(s => s.status !== "approved").length;
  if (drafts) reasons.push(`${drafts} scope item${drafts === 1 ? " is" : "s are"} not approved by an estimator.`);
  if (pkg.published && !isRevised(state, pkg)) reasons.push("This version is already published.");
  return reasons;
}

function isRevised(state: Procurement, pkg: TradePackage): boolean {
  return !!pkg.published && JSON.stringify(formContent(bidForm(state, pkg.id))) !== JSON.stringify(pkg.published.items);
}

export function packageStatus(state: Procurement, packageId: string): PackageStatus {
  const pkg = findPackage(state, packageId);
  if (pkg.published) return isRevised(state, pkg) ? "revised" : "published";
  const form = bidForm(state, packageId);
  return form.length && form.every(s => s.status === "approved") ? "ready" : "draft";
}

/**
 * Companies that can still be invited to a package. With no query, only companies whose
 * trade matches the package; with a query, any company whose name or contact matches.
 */
export function inviteCandidates(state: Procurement, directory: DirectoryCompany[], packageId: string, query = ""): DirectoryCompany[] {
  const pkg = findPackage(state, packageId);
  const invited = new Set(state.invitations.filter(i => i.packageId === packageId).map(i => i.bidderId));
  const q = query.trim().toLowerCase();
  return directory.filter(c => !invited.has(c.id) && (q
    ? `${c.company} ${c.name} ${c.trade}`.toLowerCase().includes(q)
    : c.trade.trim().toLowerCase() === pkg.name.trim().toLowerCase()));
}

export const outreachLog = (state: Procurement, packageId: string, bidderId: string): OutreachEntry[] =>
  state.outreach.filter(e => e.packageId === packageId && e.bidderId === bidderId).sort((a, b) => b.at.localeCompare(a.at));

export const unreadFor = (state: Procurement, person: string): ProcurementNotification[] =>
  state.notifications.filter(n => n.recipientType === "team" && n.recipient === person && !n.read);

// ── Trade packages ──────────────────────────────────────────────────────────
// A new project starts with no packages (15 Oct: "I created a new project and put in the drawings,
// will it write the scopes for me?"). They come from the project manual's divisions, or by hand.

/**
 * The usual subcontract trades: Jelleff's 24 bid packages (MCN's way of buying out, 22 Oct) plus the common
 * other divisions. Which sections and sheets each covers is lib/project-scopes.
 */
export const STANDARD_TRADES: { id: string; name: string; code: string }[] = [
  { id: "demolition", name: "Demolition", code: "02 41 19" },
  { id: "abatement", name: "Hazardous materials abatement", code: "02 82 00" },
  { id: "concrete", name: "Concrete", code: "03 30 00" },
  { id: "masonry", name: "Masonry", code: "04 22 00" },
  { id: "steel", name: "Structural steel", code: "05 12 00" },
  { id: "carpentry", name: "Carpentry", code: "06 10 00" },
  { id: "waterproofing", name: "Waterproofing, air barrier & joint sealants", code: "07 10 00" },
  { id: "metal-panels", name: "Metal panels", code: "07 42 00" },
  { id: "thermal", name: "Roofing", code: "07 54 23" },
  { id: "openings", name: "Doors, frames & hardware", code: "08 11 13" },
  { id: "special-doors", name: "Special doors", code: "08 33 13" },
  { id: "glazing", name: "Aluminum & glazing", code: "08 40 00" },
  { id: "drywall", name: "Drywall", code: "09 29 00" },
  { id: "tile", name: "Tile", code: "09 30 13" },
  { id: "flooring", name: "Flooring", code: "09 65 19" },
  { id: "painting", name: "Painting & wall coverings", code: "09 91 23" },
  { id: "specialties", name: "Specialties", code: "10 00 00" },
  { id: "signage", name: "Signage", code: "10 14 00" },
  { id: "equipment", name: "Equipment", code: "11 00 00" },
  { id: "furnishings", name: "Furnishings", code: "12 00 00" },
  { id: "special-construction", name: "Special construction", code: "13 00 00" },
  { id: "conveying", name: "Elevators", code: "14 20 00" },
  { id: "fire-protection", name: "Fire protection", code: "21 13 13" },
  { id: "plumbing", name: "Plumbing", code: "22 00 00" },
  { id: "mechanical", name: "Mechanical", code: "23 00 00" },
  { id: "electrical", name: "Electrical", code: "26 00 00" },
  { id: "low-voltage", name: "Low voltage", code: "27 00 00" },
  { id: "security", name: "Electronic safety & security", code: "28 00 00" },
  { id: "earthwork", name: "Earthwork", code: "31 00 00" },
  { id: "asphalt", name: "Asphalt paving", code: "32 12 16" },
  { id: "site-concrete", name: "Site concrete", code: "32 13 13" },
  { id: "fencing", name: "Site fencing", code: "32 31 00" },
  { id: "landscaping", name: "Landscaping", code: "32 90 00" },
  { id: "site-improvements", name: "Exterior improvements", code: "32 00 00" },
  { id: "utilities", name: "Site utilities", code: "33 00 00" },
];

/** Adds a trade package. `id` is kept for a standard trade; otherwise one is made from the name. */
export function addPackage(state: Procurement, input: { name: string; code: string; owner?: string; due?: string; id?: string }): Procurement {
  const name = input.name.trim() || fail("Name the trade.");
  const code = input.code.trim();
  if (!/^\d{2} \d{2} \d{2}(?:\.\d{2})?$/.test(code)) fail("Give the trade's main specification section, e.g. 09 29 00.");
  if (state.packages.some(p => p.name.toLowerCase() === name.toLowerCase())) fail(`${name} is already a trade package.`);
  const due = input.due?.trim() ?? "";
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) fail("Use a date for the bid due date.");
  const base = input.id?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trade";
  let id = base;
  for (let n = 2; state.packages.some(p => p.id === id); n++) id = `${base}-${n}`;
  return { ...state, packages: [...state.packages, { id, name, division: code.slice(0, 2), code, owner: input.owner?.trim() ?? "", due }] };
}

/** Renames a trade or changes its main section, owner or due date. A published bid form keeps the name it was published under until republished. */
export function editPackage(state: Procurement, id: string, changes: { name?: string; code?: string; owner?: string; due?: string }): Procurement {
  const pkg = findPackage(state, id);
  const name = changes.name === undefined ? pkg.name : changes.name.trim() || fail("Name the trade.");
  const code = changes.code === undefined ? pkg.code : changes.code.trim();
  if (!/^\d{2} \d{2} \d{2}(?:\.\d{2})?$/.test(code)) fail("Give the trade's main specification section, e.g. 09 29 00.");
  if (state.packages.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) fail(`${name} is already a trade package.`);
  const due = changes.due === undefined ? pkg.due : changes.due.trim();
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) fail("Use a date for the bid due date.");
  const next = { ...pkg, name, code, division: code.slice(0, 2), owner: changes.owner === undefined ? pkg.owner : changes.owner.trim(), due };
  return { ...state, packages: state.packages.map(p => p.id === id ? next : p) };
}

/** Removes a trade with nothing in it yet. To combine trades, move the scope items first (moveScope). */
export function removePackage(state: Procurement, id: string): Procurement {
  const pkg = findPackage(state, id);
  if (pkg.published) fail(`${pkg.name}'s bid form has been published; it can't be removed.`);
  if (state.scopes.some(s => s.packageId === id)) fail(`Move ${pkg.name}'s scope items to another trade first.`);
  if (state.invitations.some(i => i.packageId === id)) fail(`${pkg.name} has invited bidders; it can't be removed.`);
  return { ...state, packages: state.packages.filter(p => p.id !== id) };
}

// ── Scope review ────────────────────────────────────────────────────────────

export function addScope(state: Procurement, input: { packageId: string; title: string; detail?: string; source?: string; origin?: ScopeOrigin }, by: string, at = now()): Procurement {
  findPackage(state, input.packageId);
  const title = input.title.trim() || fail("Describe the scope item.");
  const item: ScopeItem = {
    id: newId(), packageId: input.packageId, title, detail: input.detail?.trim() ?? "", source: input.source?.trim() ?? "",
    origin: input.origin ?? "estimator", status: "draft", allTrades: false, history: [{ kind: "created", at, by }],
  };
  return { ...state, scopes: [...state.scopes, item] };
}

/** Changing the wording, detail or source sends an approved item back to draft for re-review. */
export function editScope(state: Procurement, id: string, changes: Partial<Pick<ScopeItem, "title" | "detail" | "source">>, by: string, at = now()): Procurement {
  const item = findScope(state, id);
  const next = { ...item, ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v ?? "").trim()])) } as ScopeItem;
  if (!next.title) fail("A scope item needs a description.");
  if (next.title === item.title && next.detail === item.detail && next.source === item.source) return state;
  return replaceScope(state, { ...next, status: "draft", history: [...item.history, { kind: "edited", at, by }] });
}

export function approveScope(state: Procurement, id: string, by: string, at = now()): Procurement {
  const item = findScope(state, id);
  if (item.status === "approved") return state;
  return replaceScope(state, { ...item, status: "approved", history: [...item.history, { kind: "approved", at, by }] });
}

export function reopenScope(state: Procurement, id: string, by: string, at = now()): Procurement {
  const item = findScope(state, id);
  if (item.status === "draft") return state;
  return replaceScope(state, { ...item, status: "draft", history: [...item.history, { kind: "reopened", at, by }] });
}

/**
 * Moves an item to another trade — or, for an all-trades item, back to a single trade.
 * It returns to draft so the receiving estimator reviews it, and that estimator is tagged
 * unless they made the move themselves.
 */
export function moveScope(state: Procurement, id: string, toPackageId: string, by: string, at = now()): Procurement {
  const item = findScope(state, id);
  const from = findPackage(state, item.packageId);
  const to = findPackage(state, toPackageId);
  if (to.id === from.id && !item.allTrades) fail(`This item is already in ${to.name}.`);
  const moved: ScopeItem = { ...item, packageId: to.id, allTrades: false, status: "draft", history: [...item.history, { kind: "moved", at, by, from: from.id, to: to.id }] };
  const next = replaceScope(state, moved);
  if (to.owner === by) return next;
  return { ...next, notifications: [...next.notifications, notify({
    kind: "scope-moved", recipientType: "team", recipient: to.owner, packageId: to.id, at,
    text: `${by} moved "${item.title}" from ${from.name} to ${to.name}. It needs your review.`,
  })] };
}

/**
 * Copies an item into another trade's bid form (Danial, 26 Oct: move or copy). The copy is a draft there,
 * remembers where it came from, and the receiving estimator is tagged; the original stays as it was.
 */
export function copyScope(state: Procurement, id: string, toPackageId: string, by: string, at = now()): Procurement {
  const item = findScope(state, id);
  const from = findPackage(state, item.packageId);
  const to = findPackage(state, toPackageId);
  if (to.id === from.id && !item.allTrades) fail(`This item is already in ${to.name}.`);
  const words = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (state.scopes.some(s => s.packageId === to.id && !s.allTrades && words(s.title) === words(item.title))) fail(`${to.name} already has this item.`);
  const copy: ScopeItem = { ...item, id: newId(), packageId: to.id, allTrades: false, status: "draft", history: [{ kind: "copied", at, by, from: from.id, to: to.id }] };
  const next = { ...state, scopes: [...state.scopes, copy] };
  if (!to.owner || to.owner === by) return next;
  return { ...next, notifications: [...next.notifications, notify({
    kind: "scope-moved", recipientType: "team", recipient: to.owner, packageId: to.id, at,
    text: `${by} copied "${item.title}" from ${from.name} to ${to.name}. It needs your review.`,
  })] };
}

/** Puts an item in every trade's bid form. Every other package owner is tagged once. */
export function applyScopeToAllTrades(state: Procurement, id: string, by: string, at = now()): Procurement {
  const item = findScope(state, id);
  if (item.allTrades) return state;
  const next = replaceScope(state, { ...item, allTrades: true, status: "draft", history: [...item.history, { kind: "applied-to-all", at, by }] });
  const owners = [...new Set(state.packages.map(p => p.owner))].filter(owner => owner && owner !== by);
  return { ...next, notifications: [...next.notifications, ...owners.map(owner => notify({
    kind: "scope-applied-to-all", recipientType: "team", recipient: owner, packageId: item.packageId, at,
    text: `${by} added "${item.title}" to every trade's bid form. It needs review before publishing.`,
  }))] };
}

// ── Publishing and outreach ─────────────────────────────────────────────────

/** Releases the package's current bid form to its invited bidders and notifies each of them. */
export function publishPackage(state: Procurement, packageId: string, by: string, at = now()): Procurement {
  const blockers = publishBlockers(state, packageId);
  if (blockers.length) fail(blockers.join(" "));
  const pkg = findPackage(state, packageId);
  const version = (pkg.published?.version ?? 0) + 1;
  const published: PublishedForm = { version, at, by, items: formContent(bidForm(state, packageId)) };
  const invitees = state.invitations.filter(i => i.packageId === packageId && i.status !== "declined");
  return {
    ...state,
    packages: state.packages.map(p => p.id === packageId ? { ...p, published } : p),
    notifications: [...state.notifications, ...invitees.map(i => notify({
      kind: "bid-form-published", recipientType: "bidder", recipient: i.bidderId, packageId, at,
      text: version === 1 ? `The ${pkg.name} bid form is ready for your price.` : `The ${pkg.name} bid form was revised (version ${version}). Please review the changes.`,
    }))],
  };
}

/** Invites a directory company. If the bid form is already out, they are told straight away. */
export function inviteBidder(state: Procurement, packageId: string, bidderId: string, by: string, at = now()): Procurement {
  const pkg = findPackage(state, packageId);
  if (state.invitations.some(i => i.packageId === packageId && i.bidderId === bidderId)) fail("This company is already invited to this package.");
  const invitation: Invitation = { id: newId(), packageId, bidderId, status: "invited", invitedAt: at, by };
  const next = { ...state, invitations: [...state.invitations, invitation] };
  if (!pkg.published) return next;
  return { ...next, notifications: [...next.notifications, notify({
    kind: "invited", recipientType: "bidder", recipient: bidderId, packageId, at,
    text: `You are invited to bid ${pkg.name}. The bid form is ready for your price.`,
  })] };
}

/**
 * Invited, bidding or declined, as the estimator hears it. "Submitted" is not set by hand: it comes
 * from a bid submitted in the portal (markInvitationSubmitted), so proposal counts are real.
 */
export function setInvitationStatus(state: Procurement, invitationId: string, status: InvitationStatus): Procurement {
  const invitation = state.invitations.find(i => i.id === invitationId) ?? fail("That invitation no longer exists.");
  if (status === "submitted") fail("A bid is marked submitted when the company submits it in the portal.");
  if (invitation.status === "submitted") fail("This company has submitted a bid; its status can't be changed by hand.");
  return { ...state, invitations: state.invitations.map(i => i.id === invitationId ? { ...i, status } : i) };
}

/** Records that the invited company submitted a bid in the portal (called with submitBid). */
export function markInvitationSubmitted(state: Procurement, invitationId: string): Procurement {
  const invitation = state.invitations.find(i => i.id === invitationId) ?? fail("That invitation no longer exists.");
  if (invitation.status === "declined") fail("A declined company cannot submit a bid.");
  return { ...state, invitations: state.invitations.map(i => i.id === invitationId ? { ...i, status: "submitted" } : i) };
}

/** Adds a call, note or message to an invited company's outreach log. */
export function logOutreach(state: Procurement, input: { packageId: string; bidderId: string; kind: OutreachKind; text: string }, by: string, at = now()): Procurement {
  if (!state.invitations.some(i => i.packageId === input.packageId && i.bidderId === input.bidderId)) fail("Invite this company to the package before logging outreach.");
  const text = input.text.trim() || fail("Write what happened.");
  return { ...state, outreach: [...state.outreach, { id: newId(), ...input, text, at, by }] };
}

export function markNotificationsRead(state: Procurement, ids: string[]): Procurement {
  const read = new Set(ids);
  return { ...state, notifications: state.notifications.map(n => read.has(n.id) ? { ...n, read: true } : n) };
}

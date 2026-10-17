// Sample procurement record for the Jelleff project: trade packages, scope items,
// invitations and outreach. Illustrative preview content, not read from the documents.
// Bidder ids refer to the organization-wide directory (initialBidders).
//
// Concrete and drywall are carried all the way through the sample: their bid forms are approved
// and published here; the bids, awards, Exhibit A and executed subcontracts are in
// lib/data/sample-award.ts, and their submittals in lib/data/submittals.ts. Drywall (Marcel's pilot
// trade) has three invited companies: two bid, one declined. Its wording is illustrative.

import { approveScope, bidForm, markInvitationSubmitted, publishPackage, type Procurement, type ScopeItem, type ScopeOrigin, type TradePackage } from "../procurement";
import { stableIds } from "./stable-ids";

const packages: TradePackage[] = [
  { id: "demolition", name: "Demolition", division: "02", code: "02 41 19", owner: "Safi", due: "2026-10-02" },
  { id: "concrete", name: "Concrete", division: "03", code: "03 30 00", owner: "Vijay", due: "2026-10-06" },
  { id: "masonry", name: "Masonry", division: "04", code: "04 22 00", owner: "Naija", due: "2026-10-08" },
  { id: "steel", name: "Structural steel", division: "05", code: "05 12 00", owner: "Naija", due: "2026-10-08" },
  { id: "carpentry", name: "Carpentry", division: "06", code: "06 10 00", owner: "Vijay", due: "2026-10-09" },
  { id: "thermal", name: "Roofing & waterproofing", division: "07", code: "07 54 23", owner: "Vijay", due: "2026-10-09" },
  { id: "openings", name: "Doors, frames & hardware", division: "08", code: "08 11 13", owner: "Safi", due: "2026-10-12" },
  { id: "drywall", name: "Drywall", division: "09", code: "09 29 00", owner: "Safi", due: "2026-10-12" },
  { id: "flooring", name: "Flooring", division: "09", code: "09 65 19", owner: "Vijay", due: "2026-10-12" },
  { id: "plumbing", name: "Plumbing", division: "22", code: "22 00 00", owner: "Vijay", due: "2026-10-13" },
  { id: "mechanical", name: "Mechanical", division: "23", code: "23 73 13", owner: "Vijay", due: "2026-10-13" },
  { id: "electrical", name: "Electrical", division: "26", code: "26 51 00", owner: "Naija", due: "2026-10-13" },
];

const created = "2026-09-15T14:00:00.000Z";
const reviewed = "2026-09-16T15:30:00.000Z";
let n = 0;
const item = (packageId: string, title: string, detail: string, source: string, origin: ScopeOrigin, approved: boolean): ScopeItem => ({
  id: `scope-${++n}`, packageId, title, detail, source, origin, status: approved ? "approved" : "draft", allTrades: false,
  history: [{ kind: "created", at: created, by: "Structor AI" }, ...(approved ? [{ kind: "approved" as const, at: reviewed, by: packages.find(p => p.id === packageId)!.owner }] : [])],
});

const scopes: ScopeItem[] = [
  item("demolition", "Demolish the existing one-story recreation center building as indicated on the demolition plan.", "Include foundations, slabs, utilities disconnected by others, and legal disposal. Protect the existing swimming pool and items marked to remain.", "CIV0102 · Keynote 1", "drawing", true),
  item("demolition", "Remove existing asphalt pavement, full depth, within the limits shown.", "Include base course where indicated, sawcutting at limits, and haul-off. Coordinate subgrade protection with the sitework trade.", "CIV0102 · Keynote 6", "drawing", true),
  item("demolition", "Provide temporary protection and dust-control partitions.", "Maintain protected access and separate demolition work from occupied areas. Include daily cleaning and debris removal. Some contractors carry this in every trade.", "02 41 19 · §3.2", "specification", false),
  item("demolition", "Remove existing concrete sidewalks, curbs and gutters indicated to be removed.", "Sawcut to clean lines at limits, protect adjacent public right-of-way, and coordinate with DDOT requirements.", "CIV0102 · Keynotes 2, 8", "drawing", false),
  item("concrete", "Provide cast-in-place concrete foundations, slabs, and housekeeping pads.", "Include formwork, reinforcing, placement, finishing, curing, testing coordination, and construction joints.", "S101 · Detail 3", "drawing", true),
  item("concrete", "Prepare concrete slab surfaces to the specified floor-flatness tolerance.", "Review floor finish requirements and curing-compound compatibility before placement.", "03 30 00 · §3.9", "specification", false),
  item("masonry", "Install reinforced CMU partitions including grout and joint reinforcement.", "Include lintels, ties, control joints, and fire-rated construction where indicated.", "A8.1 · Partition types", "drawing", false),
  item("masonry", "Furnish and install brick anchors at masonry veneer.", "Anchors tie the veneer to the backup framing. On some jobs the framing trade installs them — move this item if so.", "A6.1 · Wall sections", "ai", false),
  item("steel", "Furnish and install miscellaneous steel supports and roof access ladder.", "Include field measurements, connections, coatings, anchors, and coordination with adjacent finishes.", "S501 · Detail 2", "drawing", false),
  item("thermal", "Install continuous air barrier at exterior wall assemblies.", "Include transitions, penetrations, tie-ins to roofing and fenestration, and specified adhesion testing.", "07 27 00 · §2.1", "specification", false),
  item("openings", "Provide hollow metal doors, frames, and scheduled hardware sets.", "Coordinate fire ratings, access control, and electrified hardware requirements.", "A8.2 · Door schedule", "drawing", false),
  item("drywall", "Install gypsum board wall systems and Level 4 finish.", "Include rated assemblies, backing, corner beads, and joints.", "09 29 00 · §3.6", "specification", false),
  item("flooring", "Install luxury vinyl tile flooring and resilient base.", "Include moisture testing, substrate preparation beyond demolition scope, transitions, and attic stock.", "09 65 19 · §3.3", "specification", false),
  item("plumbing", "Install plumbing fixtures and domestic water connections.", "Confirm fixture schedule, accessible mounting heights, and testing requirements.", "P2.1 · Notes", "drawing", false),
  item("mechanical", "Provide supply and return air ductwork, insulation, and air devices.", "Include balancing, vibration isolation, controls coordination, and access panels.", "M101 · Plan", "drawing", false),
  item("electrical", "Furnish and install lighting fixtures and associated controls.", "Include fixture support, branch wiring, occupancy controls, and commissioning.", "E1.1 · Lighting plan", "drawing", false),
  // Drywall's bid form beyond its first item (scope-12); appended so earlier ids stay put.
  item("drywall", "Provide cold-formed metal stud framing for interior partitions to the heights shown.", "Include deflection track, bracing, and in-wall blocking for wall-mounted items.", "A8.1 · Partition types", "drawing", false),
  item("drywall", "Provide sound attenuation blankets where partition types require them.", "Full height, friction fit between studs.", "09 29 00 · §2.5", "specification", false),
  item("drywall", "Provide shaft wall assemblies at the elevator and stair enclosures.", "Include liner panels, C-H studs, and rated joints.", "A1.1 · Elevator / stair", "drawing", false),
  item("drywall", "Provide suspended acoustical panel ceilings where shown on the reflected ceiling plan.", "Include suspension system, edge trim, and hold-down clips.", "A3.1 · Ceiling legend", "drawing", false),
  item("drywall", "Provide gypsum board ceilings and soffits where shown.", "Include framing, control joints, and access panels furnished by others.", "A3.1 · Ceiling legend", "drawing", false),
  item("thermal", "Provide single-ply membrane roofing with insulation and flashings.", "Illustrative bid-form scope for testing portal bids and cost suggestions; verify against the project documents.", "Illustrative roofing bid form", "estimator", false),
  item("openings", "Provide electrified hardware and access-control interface coordination.", "Illustrative bid-form scope; distinguish hardware installation from the security contractor's wiring.", "Illustrative doors and hardware bid form", "estimator", false),
  item("openings", "Salvage and reinstall existing door hardware where scheduled.", "Illustrative applicability check; explain an N/A response.", "Illustrative doors and hardware bid form", "estimator", false),
];

const listed: Procurement = {
  packages,
  scopes,
  invitations: [
    ...[["demo-inv-c2", "concrete", "demo-c2"], ["demo-inv-d1", "openings", "demo-d1"], ["demo-inv-d2", "openings", "demo-d2"], ["demo-inv-r1", "thermal", "demo-r1"], ["demo-inv-r2", "thermal", "demo-r2"]].map(([id, packageId, bidderId]) => ({ id, packageId, bidderId, status: "submitted" as const, invitedAt: "2026-10-12T12:00:00.000Z", by: "Sample estimator" })),
    { id: "inv-1", packageId: "demolition", bidderId: "b1", status: "bidding", invitedAt: "2026-09-16T16:00:00.000Z", by: "Safi" },
    { id: "inv-2", packageId: "concrete", bidderId: "b2", status: "invited", invitedAt: "2026-09-16T16:05:00.000Z", by: "Vijay" },
    { id: "inv-3", packageId: "steel", bidderId: "b3", status: "invited", invitedAt: "2026-09-17T13:00:00.000Z", by: "Naija" },
    { id: "inv-4", packageId: "mechanical", bidderId: "b4", status: "declined", invitedAt: "2026-09-17T13:10:00.000Z", by: "Vijay" },
    { id: "inv-5", packageId: "electrical", bidderId: "b5", status: "invited", invitedAt: "2026-09-17T13:20:00.000Z", by: "Naija" },
    { id: "inv-6", packageId: "drywall", bidderId: "b7", status: "bidding", invitedAt: "2026-10-05T16:00:00.000Z", by: "Safi" },
    { id: "inv-7", packageId: "drywall", bidderId: "b8", status: "bidding", invitedAt: "2026-10-05T16:05:00.000Z", by: "Safi" },
    { id: "inv-8", packageId: "drywall", bidderId: "b9", status: "declined", invitedAt: "2026-10-05T16:10:00.000Z", by: "Safi" },
  ],
  outreach: [
    { id: "out-1", packageId: "demolition", bidderId: "b1", kind: "call", text: "Called Michael — confirmed they will bid. Asked about slab removal.", at: "2026-09-17T14:10:00.000Z", by: "Safi" },
    { id: "out-2", packageId: "concrete", bidderId: "b2", kind: "call", text: "Called District Concrete — no answer, left a voicemail.", at: "2026-09-18T15:00:00.000Z", by: "Vijay" },
    { id: "out-3", packageId: "mechanical", bidderId: "b4", kind: "note", text: "Declined: at capacity until spring.", at: "2026-09-18T16:20:00.000Z", by: "Vijay" },
    { id: "out-4", packageId: "drywall", bidderId: "b7", kind: "call", text: "Called Avery — bidding; asked whether acoustical ceilings are in this package. Yes.", at: "2026-10-06T14:00:00.000Z", by: "Safi" },
    { id: "out-5", packageId: "drywall", bidderId: "b9", kind: "note", text: "Declined: no crew available before March.", at: "2026-10-06T15:30:00.000Z", by: "Safi" },
  ],
  notifications: [],
};

const approveAll = (state: Procurement, packageId: string, by: string, at: string) =>
  bidForm(state, packageId).filter(i => i.status === "draft").reduce((next, i) => approveScope(next, i.id, by, at), state);
const concrete = publishPackage(approveAll(listed, "concrete", "Vijay", "2026-09-17T13:00:00.000Z"), "concrete", "Vijay", "2026-09-17T15:00:00.000Z");
const drywall = publishPackage(approveAll(concrete, "drywall", "Safi", "2026-10-05T13:00:00.000Z"), "drywall", "Safi", "2026-10-05T15:00:00.000Z");
const roofing = publishPackage(approveAll(drywall, "thermal", "Vijay", "2026-10-12T13:00:00.000Z"), "thermal", "Vijay", "2026-10-12T14:00:00.000Z");
const doors = publishPackage(approveAll(roofing, "openings", "Safi", "2026-10-12T13:00:00.000Z"), "openings", "Safi", "2026-10-12T14:00:00.000Z");
const submitted = ["inv-2", "inv-6", "inv-7"].reduce(markInvitationSubmitted, doors);

export const sampleProcurement: Procurement = stableIds(submitted, "pn");

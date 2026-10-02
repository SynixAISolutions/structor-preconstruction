// Sample procurement record for the Jelleff project: trade packages, scope items,
// invitations and outreach. Illustrative preview content, not read from the documents.
// Bidder ids refer to the organization-wide directory (initialBidders).
//
// Concrete is the one trade carried all the way through the sample: its bid form is approved and
// published here, District Concrete's bid is in lib/data/sample-award.ts, and so are the award,
// Exhibit A and executed subcontract its submittals hang off.

import { approveScope, bidForm, markInvitationSubmitted, publishPackage, type Procurement, type ScopeItem, type ScopeOrigin, type TradePackage } from "../procurement";
import { stableIds } from "./stable-ids";

const packages: TradePackage[] = [
  { id: "demolition", name: "Demolition", division: "02", code: "02 41 19", owner: "Safi", due: "2026-10-02" },
  { id: "concrete", name: "Concrete", division: "03", code: "03 30 00", owner: "Vijay", due: "2026-10-06" },
  { id: "masonry", name: "Masonry", division: "04", code: "04 22 00", owner: "Naija", due: "2026-10-08" },
  { id: "steel", name: "Structural steel", division: "05", code: "05 12 00", owner: "Naija", due: "2026-10-08" },
  { id: "carpentry", name: "Carpentry", division: "06", code: "06 10 00", owner: "Vijay", due: "2026-10-09" },
  { id: "thermal", name: "Thermal & moisture", division: "07", code: "07 54 23", owner: "Vijay", due: "2026-10-09" },
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
  item("demolition", "Remove existing interior partitions as indicated on demolition plans.", "Include associated wall finishes, studs, blocking, and disposal. Protect structural elements and all items marked to remain.", "AD-101 · Note 01", "drawing", true),
  item("demolition", "Remove existing resilient flooring and prepare substrate for new finishes.", "Demolish flooring, base, adhesives, and non-structural toppings in designated areas. Confirm substrate preparation with the flooring trade.", "AD-101 · Note 04", "drawing", true),
  item("demolition", "Provide temporary protection and dust-control partitions.", "Maintain protected access and separate demolition work from occupied areas. Include daily cleaning and debris removal. Some contractors carry this in every trade.", "02 41 19 · §3.2", "specification", false),
  item("demolition", "Remove doors, frames, and hardware within demolition limits.", "Salvage items specifically tagged for reuse and coordinate storage with the general contractor.", "AD-101 · Note 07", "drawing", false),
  item("concrete", "Provide cast-in-place concrete foundations, slabs, and housekeeping pads.", "Include formwork, reinforcing, placement, finishing, curing, testing coordination, and construction joints.", "S-101 · Detail 3", "drawing", true),
  item("concrete", "Prepare concrete slab surfaces to the specified floor-flatness tolerance.", "Review floor finish requirements and curing-compound compatibility before placement.", "03 30 00 · §3.9", "specification", false),
  item("masonry", "Install reinforced CMU partitions including grout and joint reinforcement.", "Include lintels, ties, control joints, and fire-rated construction where indicated.", "A-501 · Wall Type 4", "drawing", false),
  item("masonry", "Furnish and install brick anchors at masonry veneer.", "Anchors tie the veneer to the backup framing. On some jobs the framing trade installs them — move this item if so.", "A-501 · Wall sections", "ai", false),
  item("steel", "Furnish and install miscellaneous steel supports and roof access ladder.", "Include field measurements, connections, coatings, anchors, and coordination with adjacent finishes.", "S-501 · Detail 2", "drawing", false),
  item("thermal", "Install continuous air barrier at exterior wall assemblies.", "Include transitions, penetrations, tie-ins to roofing and fenestration, and specified adhesion testing.", "07 27 00 · §2.1", "specification", false),
  item("openings", "Provide hollow metal doors, frames, and scheduled hardware sets.", "Coordinate fire ratings, access control, and electrified hardware requirements.", "A-601 · Door schedule", "drawing", false),
  item("drywall", "Install gypsum board wall systems and Level 4 finish.", "Include rated assemblies, backing, corner beads, and joints.", "09 29 00 · §3.6", "specification", false),
  item("flooring", "Install luxury vinyl tile flooring and resilient base.", "Include moisture testing, substrate preparation beyond demolition scope, transitions, and attic stock.", "09 65 19 · §3.3", "specification", false),
  item("plumbing", "Install plumbing fixtures and domestic water connections.", "Confirm fixture schedule, accessible mounting heights, and testing requirements.", "P-101 · Notes", "drawing", false),
  item("mechanical", "Provide supply and return air ductwork, insulation, and air devices.", "Include balancing, vibration isolation, controls coordination, and access panels.", "M-101 · Plan", "drawing", false),
  item("electrical", "Furnish and install lighting fixtures and associated controls.", "Include fixture support, branch wiring, occupancy controls, and commissioning.", "E-101 · Lighting plan", "drawing", false),
];

const listed: Procurement = {
  packages,
  scopes,
  invitations: [
    { id: "inv-1", packageId: "demolition", bidderId: "b1", status: "bidding", invitedAt: "2026-09-16T16:00:00.000Z", by: "Safi" },
    { id: "inv-2", packageId: "concrete", bidderId: "b2", status: "invited", invitedAt: "2026-09-16T16:05:00.000Z", by: "Vijay" },
    { id: "inv-3", packageId: "steel", bidderId: "b3", status: "invited", invitedAt: "2026-09-17T13:00:00.000Z", by: "Naija" },
    { id: "inv-4", packageId: "mechanical", bidderId: "b4", status: "declined", invitedAt: "2026-09-17T13:10:00.000Z", by: "Vijay" },
    { id: "inv-5", packageId: "electrical", bidderId: "b5", status: "invited", invitedAt: "2026-09-17T13:20:00.000Z", by: "Naija" },
  ],
  outreach: [
    { id: "out-1", packageId: "demolition", bidderId: "b1", kind: "call", text: "Called Michael — confirmed they will bid. Asked about slab removal.", at: "2026-09-17T14:10:00.000Z", by: "Safi" },
    { id: "out-2", packageId: "concrete", bidderId: "b2", kind: "call", text: "Called District Concrete — no answer, left a voicemail.", at: "2026-09-18T15:00:00.000Z", by: "Vijay" },
    { id: "out-3", packageId: "mechanical", bidderId: "b4", kind: "note", text: "Declined: at capacity until spring.", at: "2026-09-18T16:20:00.000Z", by: "Vijay" },
  ],
  notifications: [],
};

const concrete = bidForm(listed, "concrete").filter(i => i.status === "draft").reduce((next, i) => approveScope(next, i.id, "Vijay", "2026-09-17T13:00:00.000Z"), listed);
const published = publishPackage(concrete, "concrete", "Vijay", "2026-09-17T15:00:00.000Z");

export const sampleProcurement: Procurement = stableIds(markInvitationSubmitted(published, "inv-2"), "pn");

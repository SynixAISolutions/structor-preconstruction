// Sample data and record shapes for the preconstruction screens (documents, scopes,
// takeoffs, specs, Structor Check, drawings, revisions).
//
// This is illustrative preview content, not data read from drawings or specifications.

export const trades = ["02 · Existing conditions", "03 · Concrete", "04 · Masonry", "05 · Metals", "07 · Thermal & moisture", "08 · Openings", "09 · Finishes", "22 · Plumbing", "23 · HVAC", "26 · Electrical"];

export type LibraryFile = { id: string; name: string; category: string; type: string; size: string; date: string; sample?: boolean; revision: string };
export const categories = ["All files", "Drawings", "Specifications", "Reports", "RFP", "Contracts", "Bid scopes"];
export const sampleFiles: LibraryFile[] = [
  { id: "d1", name: "Architectural drawing set.pdf", category: "Drawings", type: "PDF", size: "24.8 MB", date: "2026-09-08", sample: true, revision: "Rev 02" },
  { id: "d2", name: "Structural drawing set.pdf", category: "Drawings", type: "PDF", size: "12.4 MB", date: "2026-09-08", sample: true, revision: "Rev 02" },
  { id: "d3", name: "MEP drawing set.pdf", category: "Drawings", type: "PDF", size: "18.6 MB", date: "2026-09-06", sample: true, revision: "Rev 01" },
  { id: "d4", name: "Project manual & specifications.pdf", category: "Specifications", type: "PDF", size: "8.2 MB", date: "2026-09-05", sample: true, revision: "Rev 01" },
  { id: "d5", name: "Geotechnical investigation report.pdf", category: "Reports", type: "PDF", size: "4.1 MB", date: "2026-08-29", sample: true, revision: "Final" },
  { id: "d6", name: "Invitation to bid — Jelleff.pdf", category: "RFP", type: "PDF", size: "1.2 MB", date: "2026-08-28", sample: true, revision: "Original" },
  { id: "d7", name: "Subcontract agreement template.docx", category: "Contracts", type: "DOCX", size: "268 KB", date: "2026-08-28", sample: true, revision: "Template" },
  { id: "d8", name: "02 41 00 — Demolition scope.xlsx", category: "Bid scopes", type: "XLSX", size: "86 KB", date: "2026-09-09", sample: true, revision: "Draft 03" },
];

export type ScopeRow = { id: string; trade: string; title: string; source: string; detail: string; approved: boolean; origin: string };
export const initialScopes: ScopeRow[] = [
  { id: "s1", trade: trades[0], title: "Remove existing interior partitions as indicated on demolition plans.", source: "AD-101 · Note 01", detail: "Include associated wall finishes, studs, blocking, and disposal. Protect structural elements and all items marked to remain.", approved: true, origin: "Drawing" },
  { id: "s2", trade: trades[0], title: "Remove existing resilient flooring and prepare substrate for new finishes.", source: "AD-101 · Note 04", detail: "Demolish flooring, base, adhesives, and non-structural toppings in designated areas. Confirm substrate preparation with flooring trade.", approved: true, origin: "Drawing" },
  { id: "s3", trade: trades[0], title: "Provide temporary protection and dust-control partitions.", source: "02 41 19 · §3.2", detail: "Maintain protected access and separate demolition work from occupied areas. Include daily cleaning and debris removal.", approved: false, origin: "Specification" },
  { id: "s4", trade: trades[0], title: "Remove doors, frames, and hardware within demolition limits.", source: "AD-101 · Note 07", detail: "Salvage items specifically tagged for reuse and coordinate storage with the general contractor.", approved: false, origin: "Drawing" },
  { id: "s5", trade: trades[0], title: "Disconnect and make safe services before selective demolition.", source: "02 41 19 · §3.1", detail: "Coordinate isolation of mechanical, plumbing, and electrical services with the responsible licensed trade.", approved: false, origin: "Specification" },
  { id: "s6", trade: trades[1], title: "Provide cast-in-place concrete foundations, slabs, and housekeeping pads.", source: "S-101 · Detail 3", detail: "Include formwork, reinforcing, placement, finishing, curing, testing coordination, and construction joints.", approved: true, origin: "Drawing" },
  { id: "s7", trade: trades[1], title: "Prepare concrete slab surfaces to the specified floor-flatness tolerance.", source: "03 30 00 · §3.9", detail: "Review floor finish requirements and curing-compound compatibility before placement.", approved: false, origin: "Specification" },
  { id: "s8", trade: trades[2], title: "Install reinforced CMU partitions including grout and joint reinforcement.", source: "A-501 · Wall Type 4", detail: "Include lintels, ties, control joints, and fire-rated construction where indicated.", approved: false, origin: "Drawing" },
  { id: "s9", trade: trades[3], title: "Furnish and install miscellaneous steel supports and roof access ladder.", source: "S-501 · Detail 2", detail: "Include field measurements, connections, coatings, anchors, and coordination with adjacent finishes.", approved: false, origin: "Drawing" },
  { id: "s10", trade: trades[4], title: "Install continuous air barrier at exterior wall assemblies.", source: "07 27 00 · §2.1", detail: "Include transitions, penetrations, tie-ins to roofing and fenestration, and specified adhesion testing.", approved: false, origin: "Specification" },
  { id: "s11", trade: trades[5], title: "Provide hollow metal doors, frames, and scheduled hardware sets.", source: "A-601 · Door schedule", detail: "Coordinate fire ratings, access control, and electrified hardware requirements.", approved: false, origin: "Drawing" },
  { id: "s12", trade: trades[6], title: "Install gypsum board wall systems and Level 4 finish.", source: "09 29 00 · §3.6", detail: "Include rated assemblies, backing, corner beads, and joints.", approved: false, origin: "Specification" },
  { id: "s13", trade: trades[7], title: "Install plumbing fixtures and domestic water connections.", source: "P-101 · Notes", detail: "Confirm fixture schedule, accessible mounting heights, and testing requirements.", approved: false, origin: "Drawing" },
  { id: "s14", trade: trades[8], title: "Provide supply and return air ductwork, insulation, and air devices.", source: "M-101 · Plan", detail: "Include balancing, vibration isolation, controls coordination, and access panels.", approved: false, origin: "Drawing" },
  { id: "s15", trade: trades[9], title: "Furnish and install lighting fixtures and associated controls.", source: "E-101 · Lighting plan", detail: "Include fixture support, branch wiring, occupancy controls, and commissioning.", approved: false, origin: "Drawing" },
];

export type TakeoffRow = { id: string; division: string; item: string; unit: string; quantity: number; rate: number; source: string; reviewed: boolean };
export const initialTakeoffs: TakeoffRow[] = [
  { id: "q1", division: trades[0], item: "Interior partition demolition", unit: "LF", quantity: 1240, rate: 14, source: "AD-101", reviewed: true },
  { id: "q2", division: trades[0], item: "Floor finish removal", unit: "SF", quantity: 18650, rate: 2.75, source: "AD-101", reviewed: true },
  { id: "q3", division: trades[0], item: "Door & frame removal", unit: "EA", quantity: 38, rate: 185, source: "AD-101", reviewed: false },
  { id: "q4", division: trades[1], item: "Cast-in-place concrete slab", unit: "CY", quantity: 286, rate: 265, source: "S-101", reviewed: false },
  { id: "q5", division: trades[2], item: "8-inch reinforced CMU wall", unit: "SF", quantity: 4280, rate: 32, source: "A-101", reviewed: false },
  { id: "q6", division: trades[3], item: "Structural steel framing", unit: "TON", quantity: 46.5, rate: 3800, source: "S-101", reviewed: true },
  { id: "q7", division: trades[4], item: "Single-ply membrane roofing", unit: "SF", quantity: 22500, rate: 12.5, source: "A-102", reviewed: false },
  { id: "q8", division: trades[5], item: "Hollow metal door assemblies", unit: "EA", quantity: 42, rate: 1650, source: "A-601", reviewed: false },
  { id: "q9", division: trades[6], item: "Painted gypsum wall finish", unit: "SF", quantity: 32400, rate: 2.2, source: "A-101", reviewed: false },
];

export type SpecItem = { id: string; section: string; title: string; product: string; manufacturer: string; submittal: string; source: string; reviewed: boolean };
export const initialSpecs: SpecItem[] = [
  { id: "p1", section: "03 30 00", title: "Cast-in-place concrete", product: "4,000 PSI normal-weight concrete", manufacturer: "Approved ready-mix supplier", submittal: "Mix design · Test reports", source: "Project manual · p. 126", reviewed: true },
  { id: "p2", section: "04 22 00", title: "Concrete unit masonry", product: "8-inch normal-weight CMU", manufacturer: "Basis of design: standard ASTM C90", submittal: "Product data · Samples", source: "Project manual · p. 164", reviewed: false },
  { id: "p3", section: "07 54 23", title: "TPO roofing", product: "60-mil reinforced TPO membrane", manufacturer: "Carlisle / Firestone / GAF", submittal: "Shop drawings · Warranty", source: "Project manual · p. 248", reviewed: false },
  { id: "p4", section: "08 11 13", title: "Hollow metal doors & frames", product: "Level 3 · 16-gauge galvanized", manufacturer: "Steelcraft / Ceco / Curries", submittal: "Door schedule · Product data", source: "Project manual · p. 292", reviewed: true },
  { id: "p5", section: "09 29 00", title: "Gypsum board", product: "5/8-inch Type X gypsum board", manufacturer: "USG / National Gypsum / CertainTeed", submittal: "Product data · Assembly ratings", source: "Project manual · p. 346", reviewed: true },
  { id: "p6", section: "09 65 19", title: "Resilient tile flooring", product: "Luxury vinyl tile · Type LVT-1", manufacturer: "To be selected by architect", submittal: "Finish samples · Maintenance", source: "Project manual · p. 368", reviewed: false },
  { id: "p7", section: "23 73 13", title: "Air handling units", product: "Packaged rooftop air handling unit", manufacturer: "Trane / Carrier / Daikin", submittal: "Equipment data · Controls diagram", source: "Project manual · p. 564", reviewed: false },
];

export type CheckIssue = { id: string; title: string; detail: string; type: string; priority: string; trade: string; source: string; crossReference: string; status: string; rfi?: string; question?: string; assignee?: string; due?: string };
export const initialIssues: CheckIssue[] = [
  { id: "SC-001", title: "Roof fall-restraint anchors are not detailed", detail: "The roof access notes require fall protection, but the current roof plan does not identify anchor positions, loading, or attachment details. Confirm responsibility and design criteria before issuing the roofing package.", type: "Missing detail", priority: "High", trade: "07 · Roofing", source: "A-102 · Roof plan", crossReference: "07 72 00 · Roof accessories", status: "Open" },
  { id: "SC-002", title: "Door D-104 fire rating does not match the schedule", detail: "The partition plan indicates a rated corridor wall. The door schedule lists D-104 without a rating. Ask the architect to reconcile the door and wall assembly requirements.", type: "Conflict", priority: "High", trade: "08 · Openings", source: "A-101 · Room 104", crossReference: "A-601 · Door schedule", status: "Open" },
  { id: "SC-003", title: "Floor finish is not defined for storage room 118", detail: "Room 118 is shown on the floor plan, but its finish schedule entry is blank. The flooring allowance and scope require confirmation.", type: "Missing information", priority: "Medium", trade: "09 · Finishes", source: "A-101 · Room 118", crossReference: "A-701 · Finish schedule", status: "Open" },
  { id: "SC-004", title: "Structural opening conflicts with duct routing", detail: "The supply duct route crosses the beam line at grid C without a coordinated penetration detail. Confirm the final route or approved structural opening.", type: "Coordination", priority: "High", trade: "23 · HVAC", source: "M-101 · Grid C", crossReference: "S-101 · Framing plan", status: "Open" },
  { id: "SC-005", title: "Exterior wall air-barrier transition needs confirmation", detail: "The wall section shows an air barrier but does not call out the transition at the storefront head. Confirm the termination and compatible materials.", type: "Missing detail", priority: "Medium", trade: "07 · Envelope", source: "A-501 · Detail 4", crossReference: "07 27 00 · Air barriers", status: "Resolved" },
];

export type Drawing = { id: string; title: string; discipline: string; date: string; received: string; revision: string; status: string };
export const initialDrawings: Drawing[] = [
  { id: "G-001", title: "Cover sheet & drawing index", discipline: "General", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "AD-101", title: "First floor demolition plan", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "A-101", title: "First floor plan", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "A-102", title: "Roof plan", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "A-501", title: "Wall sections & details", discipline: "Architectural", date: "2026-08-21", received: "2026-08-22", revision: "01", status: "Current" },
  { id: "A-601", title: "Door & frame schedules", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "S-101", title: "Foundation & framing plan", discipline: "Structural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "M-101", title: "First floor mechanical plan", discipline: "Mechanical", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current" },
  { id: "P-101", title: "First floor plumbing plan", discipline: "Plumbing", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current" },
  { id: "E-101", title: "Lighting & power plan", discipline: "Electrical", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current" },
];

/**
 * List of specifications: one row per project-manual section, the written counterpart of
 * the drawing list. `id` is the MasterFormat section number (csiDivision(id) gives its
 * division). Submittal packages (initialSpecs) reference these by `section`. Sample rows.
 */
export type SpecSection = { id: string; title: string; date: string; received: string; revision: string; status: string; pages: string };
export const initialSpecSections: SpecSection[] = [
  { id: "01 10 00", title: "Summary", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 12–18" },
  { id: "01 33 00", title: "Submittal procedures", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 41–49" },
  { id: "02 41 19", title: "Selective demolition", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 102–109" },
  { id: "03 30 00", title: "Cast-in-place concrete", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 126–141" },
  { id: "04 22 00", title: "Concrete unit masonry", date: "2026-08-21", received: "2026-08-22", revision: "01", status: "Current", pages: "pp. 164–175" },
  { id: "05 12 00", title: "Structural steel framing", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 188–199" },
  { id: "07 54 23", title: "Thermoplastic-polyolefin (TPO) roofing", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 248–259" },
  { id: "08 11 13", title: "Hollow metal doors and frames", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 292–301" },
  { id: "09 29 00", title: "Gypsum board", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 346–355" },
  { id: "09 65 19", title: "Resilient tile flooring", date: "2026-08-21", received: "2026-08-22", revision: "01", status: "Current", pages: "pp. 368–373" },
  { id: "23 73 13", title: "Modular indoor central-station air-handling units", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current", pages: "pp. 564–577" },
  { id: "26 51 00", title: "Interior lighting", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current", pages: "pp. 702–711" },
];

export type DrawingChange ={ id: string; title: string; detail: string; division: string; impact: string; reviewed: boolean; kind: string };
export const initialChanges: DrawingChange[] = [
  { id: "01", title: "Community room partition added", detail: "A new partition divides the east community room into two smaller spaces. Review wall, finish, and door scope.", division: "09 · Finishes", impact: "+84 SF wall area", reviewed: false, kind: "Added" },
  { id: "02", title: "Lobby opening relocated", detail: "The opening in the south lobby wall moves 4 feet east. Coordinate framing, egress, and adjacent millwork.", division: "08 · Openings", impact: "1 opening affected", reviewed: false, kind: "Modified" },
  { id: "03", title: "Room finish designation updated", detail: "The finish designation in the community room changes from VCT-1 to LVT-1. Revisit pricing and submittals.", division: "09 · Finishes", impact: "640 SF finish affected", reviewed: true, kind: "Modified" },
];

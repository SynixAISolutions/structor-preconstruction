// Jelleff Recreation Center budget, normalized from Marcel's "Jelleff - DD Budget.xlsx"
// (Contractor, DD Budget update 2025-02-14, estimator MK). Values are copied from the workbook,
// not re-estimated: the lines total $33,328,991.40 exactly as its Total Cost does.
//
// How the workbook was read (source-data ambiguities are marked ⚠):
// - Cost centers are the columns that feed its Total Cost: Renovation (pool), New construction,
//   Sitework. ⚠ Two further columns ("Renovation" and "ESA #1", apparently the letter contract and
//   early-site package) are NOT in its total and are left out here too.
// - Trade rows keep Marcel's 5-digit CSI codes; one line per cost center with a non-zero amount.
// - Indirect rows keep his wording. Rows marked "(BY OWNER)" are listed as byOwner lines at $0 and
//   never counted. Indirect categories that are $0 in every cost center are kept as $0 lines under
//   "Project-wide" so the structure matches his sheet.
// - Forecasts are empty: a DD budget has no forecast. They come from bid leveling when applied.
// - Allowances come from the Allowances sheet. ⚠ The sheet does not say which budget line carries
//   each one, so they are "review" (listed, not added on top) and their cost center is an assumption,
//   except Public art, which has its own $100,000 line and is linked to it. Items without an amount
//   (AV and IT equipment "incl above", DAS telephone "Excluded", Telephones "Included") are omitted.
// - Owners come from the matching trade package in the sample procurement record.
// - packageId ties a line to its trade where the CSI-code suggestion would land on the wrong one (several
//   Division 07, 08 and 10 trades would land on one line; Low voltage bids as Division 27 against 28000).
//   ⚠ 32000 Site improvements is one line for the four site trades, so it stays unlinked.

import type { BudgetAllowance, BudgetClass, BudgetLine, BudgetState } from "../budget";

const at = "2025-02-14T12:00:00.000Z";
const line = (id: string, costCenter: string, classification: BudgetClass, csiCode: string | null, description: string, owner: string, budget: number, byOwner = false): BudgetLine => ({
  id, costCenter, classification, csiCode, description, owner, budget, forecast: null, committed: 0, byOwner,
  status: "draft", approval: null, source: { kind: "sample" }, forecastSource: null, updatedAt: at,
});
const allowance = (id: string, name: string, amount: number, costCenter: string, source: string, status: BudgetAllowance["status"], budgetLineId: string | null = null): BudgetAllowance =>
  ({ id, name, amount, costCenter, owner: "", source, status, budgetLineId, updatedAt: at });

export const sampleBudget: BudgetState = {
  costCenters: [
    { name: "Renovation (pool)", squareFeet: 2618 },
    { name: "New construction", squareFeet: 26500 },
    { name: "Sitework", squareFeet: 77978 },
    { name: "Project-wide", squareFeet: null },
  ],
  lines: [
    line("nc-01000", "New construction", "direct", "01000", "General requirements", "", 416160.00),
    line("sw-02000", "Sitework", "direct", "02000", "Existing conditions – demolition", "Sadie", 448800.00),
    line("nc-03000", "New construction", "direct", "03000", "Concrete", "Victor", 1867154.88),
    line("nc-04000", "New construction", "direct", "04000", "Masonry", "Naija", 1578348.00),
    line("nc-05000", "New construction", "direct", "05000", "Structural steel", "Naija", 1407600.00),
    line("sw-05000", "Sitework", "direct", "05000", "Structural steel", "Naija", 322830.00),
    line("nc-05500", "New construction", "direct", "05500", "Miscellaneous metals", "Naija", 489600.00),
    line("sw-05500", "Sitework", "direct", "05500", "Miscellaneous metals", "Naija", 11220.00),
    line("nc-06000", "New construction", "direct", "06000", "Rough carpentry", "Victor", 189210.00),
    line("nc-06400", "New construction", "direct", "06400", "Architectural millwork", "Victor", 173279.64),
    { ...line("nc-07500", "New construction", "direct", "07500", "Roofing & waterproofing", "Victor", 1961479.38), packageId: "thermal" },
    { ...line("nc-07900", "New construction", "direct", "07900", "Joint sealants", "Victor", 65076.00), packageId: "waterproofing" },
    { ...line("nc-08100", "New construction", "direct", "08100", "Doors, frames & hardware", "Sadie", 239021.70), packageId: "openings" },
    { ...line("nc-08800", "New construction", "direct", "08800", "Aluminum & glass", "Sadie", 749516.40), packageId: "glazing" },
    line("nc-09200", "New construction", "direct", "09200", "Gypsum wallboard systems", "Sadie", 1065450.18),
    line("nc-09300", "New construction", "direct", "09300", "Ceramic tile", "Sadie", 107100.00),
    line("nc-09500", "New construction", "direct", "09500", "Acoustical ceilings", "Sadie", 76067.52),
    line("nc-09600", "New construction", "direct", "09600", "Flooring", "Sadie", 680734.74),
    line("nc-09900", "New construction", "direct", "09900", "Painting", "Sadie", 197052.78),
    { ...line("nc-10000", "New construction", "direct", "10000", "Specialties", "Naija", 254229.90), packageId: "specialties" },
    line("nc-11000", "New construction", "direct", "11000", "Equipment", "", 437059.80),
    line("sw-11000", "Sitework", "direct", "11000", "Equipment", "", 453149.28),
    line("nc-12000", "New construction", "direct", "12000", "Furnishings", "", 292369.74),
    line("ren-13000", "Renovation (pool)", "direct", "13000", "Special construction", "", 393851.58),
    line("nc-14000", "New construction", "direct", "14000", "Elevators", "", 183600.00),
    line("nc-21000", "New construction", "direct", "21000", "Fire protection", "Victor", 230112.00),
    line("nc-22000", "New construction", "direct", "22000", "Plumbing", "Victor", 1140105.00),
    line("nc-23000", "New construction", "direct", "23000", "HVAC", "Victor", 2470695.00),
    line("sw-23000", "Sitework", "direct", "23000", "HVAC", "Victor", 1208980.50),
    line("nc-26000", "New construction", "direct", "26000", "Electrical", "Naija", 2801518.74),
    line("sw-26000", "Sitework", "direct", "26000", "Electrical", "Naija", 413100.00),
    { ...line("nc-28000", "New construction", "direct", "28000", "Low voltage", "Naija", 420051.30), packageId: "low-voltage" },
    line("sw-31000", "Sitework", "direct", "31000", "Earthwork", "", 1005720.00),
    line("sw-32000", "Sitework", "direct", "32000", "Site improvements", "", 2168044.68),
    line("sw-33000", "Sitework", "direct", "33000", "Site utilities", "", 1419136.20),
    line("nc-personnel-general-conditions", "New construction", "indirect", null, "Personnel general conditions", "", 760000.00),
    line("sw-personnel-general-conditions", "Sitework", "indirect", null, "Personnel general conditions", "", 510000.00),
    line("pw-general-conditions-non-perso", "Project-wide", "indirect", null, "General conditions – non-personnel", "", 0.00),
    line("nc-preconstruction-fee-base-des", "New construction", "indirect", null, "Preconstruction fee (15% base design-build fee)", "", 70000.00),
    line("sw-preconstruction-fee-base-des", "Sitework", "indirect", null, "Preconstruction fee (15% base design-build fee)", "", 30000.00),
    line("pw-design-fee", "Project-wide", "indirect", null, "Design fee", "", 0.00, true),
    line("pw-permits", "Project-wide", "indirect", null, "Permits", "", 0.00, true),
    line("nc-public-art-owner-allowance", "New construction", "indirect", null, "Public art – owner allowance", "", 100000.00),
    line("pw-utilities-consumption", "Project-wide", "indirect", null, "Utilities consumption", "", 0.00, true),
    line("pw-public-space-improvements", "Project-wide", "indirect", null, "Public space improvements", "", 0.00, true),
    line("ren-owner-directed-construction-", "Renovation (pool)", "indirect", null, "Owner-directed construction contingency", "", 19692.58),
    line("nc-owner-directed-construction-", "New construction", "indirect", null, "Owner-directed construction contingency", "", 1021129.64),
    line("sw-owner-directed-construction-", "Sitework", "indirect", null, "Owner-directed construction contingency", "", 399549.03),
    line("pw-contaminated-soil", "Project-wide", "indirect", null, "Contaminated soil", "", 0.00, true),
    line("pw-testing-and-inspections", "Project-wide", "indirect", null, "Testing and inspections", "", 0.00, true),
    line("ren-insurance-burden", "Renovation (pool)", "indirect", null, "Insurance burden", "", 8270.88),
    line("nc-insurance-burden", "New construction", "indirect", null, "Insurance burden", "", 428874.45),
    line("sw-insurance-burden", "Sitework", "indirect", null, "Insurance burden", "", 167810.59),
    line("pw-builder-s-risk-insurance", "Project-wide", "indirect", null, "Builder's risk insurance", "", 0.00),
    line("pw-design-contingency", "Project-wide", "indirect", null, "Design contingency", "", 0.00),
    line("ren-construction-contingency", "Renovation (pool)", "indirect", null, "Construction contingency", "", 16872.60),
    line("nc-construction-contingency", "New construction", "indirect", null, "Construction contingency", "", 874903.87),
    line("sw-construction-contingency", "Sitework", "indirect", null, "Construction contingency", "", 342333.61),
    line("pw-escalation", "Project-wide", "indirect", null, "Escalation", "", 0.00),
    line("ren-performance-payment-bond", "Renovation (pool)", "indirect", null, "Performance & payment bond", "", 5702.94),
    line("nc-performance-payment-bond", "New construction", "indirect", null, "Performance & payment bond", "", 295717.51),
    line("sw-performance-payment-bond", "Sitework", "indirect", null, "Performance & payment bond", "", 115708.76),
    line("ren-design-build-fee", "Renovation (pool)", "indirect", null, "Design-build fee", "", 25000.00),
    line("nc-design-build-fee", "New construction", "indirect", null, "Design-build fee", "", 600000.00),
    line("sw-design-build-fee", "Sitework", "indirect", null, "Design-build fee", "", 200000.00),
  ],
  allowances: [
    allowance("al-01", "Signage", 52052.45, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-02", "Security", 375837.25, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-03", "DAS first responder", 97750.00, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-04", "Telecom 2W duct bank into building with Verizon", 126500.00, "Sitework", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-05", "Onsite PV canopies", 363975.00, "Sitework", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-06", "Public art", 100000.00, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP)", "included", "nc-public-art-owner-allowance"),
    allowance("al-07", "Fixed furniture", 111275.15, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-08", "Window treatment", 100625.00, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-09", "Walk-off mats", 166750.00, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-10", "Fitness equipment", 117732.40, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-11", "Residential appliances", 6750.50, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-12", "Food service equipment", 144693.00, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-13", "Gym equipment", 341320.00, "New construction", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-14", "Playground equipment", 510903.60, "Sitework", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-15", "Site furnishings", 246515.15, "Sitework", "Project 1 DD Budget · Allowances · Owner allowances (per RFP) · cost center assumed", "review"),
    allowance("al-16", "Salvage and install reclaimed wood (RW-01) on walls", 55000.00, "New construction", "Project 1 DD Budget · Allowances · Contractor allowances · cost center assumed", "review"),
    allowance("al-17", "4\" piping at exterior of foundation (assumed, not shown)", 34892.00, "New construction", "Project 1 DD Budget · Allowances · Contractor allowances · cost center assumed", "review"),
    allowance("al-18", "Washington Gas from main to building including meter and connection to generator", 330000.00, "Sitework", "Project 1 DD Budget · Allowances · Contractor allowances · cost center assumed", "review"),
    allowance("al-19", "Primary 2W duct bank with transformer and Pepco wire pulls", 242000.00, "Sitework", "Project 1 DD Budget · Allowances · Contractor allowances · cost center assumed", "review"),
    allowance("al-20", "Rough-in for onsite PV canopies", 82500.00, "Sitework", "Project 1 DD Budget · Allowances · Contractor allowances · cost center assumed", "review"),
  ],
};

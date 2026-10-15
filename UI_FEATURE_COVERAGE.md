# Structor UI feature coverage

Source: **Danial Khan's Zoom Meeting, September 8, 2026**. Timestamps below are the transcript's own clock times. This checklist maps the requested frontend; meeting statements are product context, not instructions to operate external accounts.

## Scope of this iteration

**15 October 2026 update:** Overview now derives its metrics, activity and trade-package status from saved project records. Approved scope can be queued and priced under Quantity takeoffs → Scope drafts. Budget versions saves and compares stage copies with explanations. Cost suggestions now writes an approved, supported quantity × rate adjustment into the selected active bid cell. Sample inputs are sufficient to demonstrate all four features; these records remain browser-local. The original September checklist below is retained as product context.

Build the complete, connected UI so the team can review the workflow before implementing the remaining backend. Marcel explicitly requested the frontend of every area at **19:21:32–19:22:03**. New AI workflows use clearly identified sample content and local interactions. They do not claim to process drawings, proposals, or schedules automatically.

Preserve the working Excel trade-workbook import/export, bidder editing, inline bid leveling, review progress and exceptions, glossary, browser persistence and backup, and read-only Gmail inbox connector. The supported workbook importer accepts `.xlsx`; PDF scope import and proposal extraction are separate, unfinished capabilities.

## Screen checklist

| Screen / area | Required frontend content | Transcript reference |
| --- | --- | --- |
| Projects and project setup | Project creation; RFP intake; description; bid deadline; pre-bid RFI deadline; start and finish dates; size; architect; internal project value | 19:09:37–19:10:02; 19:22:03–19:22:13; 19:27:57–19:28:26 |
| Project overview and assignments | Trade packages by CSI division; estimator assigned to each trade; manager oversees the whole project | 19:08:34–19:09:08 |
| Document hub | Upload and organize drawings, project manual/specifications, bid scopes, contracts, and additional reports | 19:09:08–19:09:37; 19:23:16–19:23:27 |
| Scopes and bid forms | Draft scopes for every trade; source references into drawings/specs; review and editing; contractor templates and export | 19:05:20–19:06:06; 19:11:37–19:11:47; 19:12:48–19:13:11 |
| Bid packages and bidders | Generic company directory; invite bidders by project/trade; invitation and submission statuses | 19:06:40–19:07:15; 19:10:02–19:10:48 |
| Subcontractor portal | Subcontractor-facing project information and files; enter price; answer scope questions; attach proposal; submit bid | 19:07:15–19:07:53; 19:12:06–19:13:32; 19:22:59–19:23:27 |
| Messages | Conversations and announcements addressed to bidders within a trade/bid package | 19:23:27–19:23:41 |
| Bid leveling | Identical scope rows across bidders; Y/N/P, notes, exclusions, approved adjustments; base versus leveled totals; lowest fully reviewed bid | 19:04:12–19:04:47; 19:13:33–19:14:37 |
| Cost suggestions inside leveling | Missing item, quantity, unit cost, suggested addition, historical/supplier/estimator basis, evidence confidence and draft approval | 19:14:21–19:15:21; 19:16:42–19:16:58; 19:22:26–19:22:41 |
| Quantity takeoffs | Quantities by CSI division, drawing references, measurement and review | 19:16:38–19:16:53; 19:22:13–19:22:22 |
| Structor Check | Missing or conflicting drawing/spec information; cited issues and review states | 19:23:52–19:24:22 |
| Specification matrix | Dedicated specification-matrix area and generate/review interaction; detailed columns remain to be validated | 19:17:08–19:17:14; 19:22:49–19:22:56 |
| Budget summary | Reviewed trade costs rolled into summary and scope-level details by cost center | 19:24:22–19:26:31 |
| Allowances | Required owner allowances from Division 1 specifications or drawings, with values, sources, and budget inclusion | 19:26:44–19:27:55 |
| Schedule | Editable draft schedule with design/preconstruction, drawing iterations, milestones, submittals, material release, and construction | 19:28:30–19:30:41 |
| Drawing register | Drawing number, title, drawing date and received date; title-block source; contract exhibit output | 19:30:44–19:32:43 |
| Revision comparison | Previous and new sets; side-by-side review; list of changes organized by drawing | 19:33:02–19:33:44 |
| Contracts and award | Selected subcontractor; agreement; Exhibit A scope; drawing-list exhibit; award review | 19:16:58–19:17:08; 19:22:41–19:22:48; 19:30:44–19:31:00 |
| Turnover | Handover package area; detailed content left for subsequent domain walkthrough | 19:33:02–19:33:17 |
| Access and roles | GC manager, estimator, subcontractor views; private project access; architect participation mentioned | 19:08:47–19:09:08; 19:37:03–19:37:21; 19:41:05–19:41:27 |
| Instruction manual | Floating question mark on every page opens a built-in help centre: one guide per screen (purpose, what actually works in this version, numbered steps, terms, a worked example, related links), the full workflow, a searchable glossary, and a Markdown download. Verified by `pnpm check`. | Added after the meeting; covers every screen above |

## Exact workflow distinctions

1. **Scopes come before bids.** Drawings and specifications produce draft trade scopes; estimators review them before sharing bid packages. This is automation level one.
2. **Leveling comes after submissions.** Subcontractors enter price, answer scope questions, and upload proposals. Inclusions/exclusions identify missing work; adjustments need review before comparing leveled totals. This is automation level two.
3. **Scope and bid form refer to the same content here.** Avoid unrelated duplicate data models (19:23:21–19:23:27).
4. **Unit-cost plugs belong in bid leveling.** The illustrative steel case is 30 roof/fall-restraint anchors at $3,000 each, totaling a $90,000 addition. This is a meeting example, not a verified Jelleff estimate, and must never silently update the active demolition workbook.
5. **Owner allowances differ from missing-scope adjustments.** The owner's $500,000 art example is a required budget allowance even when the final artwork is unknown. Cost centers demonstrated were modernization, addition, and sitework.
6. **Sources are project drawings/specifications.** Gmail is an intake channel; it is not required for a scope item's source citation (19:05:56–19:06:06).
7. **Portal submission is a new preference.** Email and BuildingConnected are existing channels. An actual BuildingConnected integration was only suggested for investigation.
8. **Drawing register is separate from schedule.** Drawing numbers and dates come from document title blocks, not schedule rows.
9. **Support multiple contractors.** Bidders, templates, and assignments vary across customers; the product should not be hardcoded to Marcel's company (19:19:16–19:20:23).
10. **Outputs are reviewable first drafts.** Generated scopes and schedules must be amendable; completed frontend interactions do not establish AI processing accuracy.

## Current preview boundary

The complete UI demonstrates navigation, sample project information, document organization, draft generation/review states, bidder submission, conversations, costs, budget, planning, document comparison, and award/turnover. New module data and generation examples remain local UI previews. Messages and invitations are not delivered externally, file-selection screens do not imply document parsing, and preview approvals do not authorize a real award.

Cost suggestions selects an actual excluded or partial response in the active comparison. Quantity, rate, unit and a written supporting basis are required; reviewed estimate references can supply the starting values. Editing them resets approval. Applying an approved cost replaces that cell's adjustment and retains its basis in the note. Scope coverage remains unresolved until reviewed separately.

## Evidence gaps

The transcript jumps from **19:33:50 to 19:36:58**. Subsequent comments about matching and architect participation lack their preceding explanation. Do not infer a detailed architectural-matching workflow from that gap. Specification matrix and turnover were named but not fully specified; their frontend contents need domain validation. The separate source document mentioned in the meeting may include further details.

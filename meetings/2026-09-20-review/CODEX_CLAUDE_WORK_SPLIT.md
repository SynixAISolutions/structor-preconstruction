# Structor V1 — Codex and Claude work split

**Source:** Marcel's 20 September 2026 video review  
**Working agreement:** `AGENTS.md`  
**Goal:** Implement Marcel's feedback without Codex and Claude editing the same files.

## The rule

**Codex owns the interface. Claude owns functionality, navigation definitions, data, persistence, APIs, and automated checks.**

This means a feature is usually shared:

- **Claude** defines what the feature knows and does.
- **Codex** defines how the user sees and operates it.

Neither agent should solve a dependency by crossing the file boundary. If Codex needs a new field, status, action, or data shape, Codex asks Claude to expose it from `app/lib/**`. If Claude needs a new screen, Claude adds its ID, label, grouping, and icon-name string in `app/lib/screens.ts`; Codex adds the icon component mapping and builds the screen.

## File ownership

### Codex — UI and visual behavior

- `app/app/page.tsx`
- `app/app/ui/*.tsx`
- `app/app/ui/*.css`
- `app/app/globals.css`
- `app/app/ui/model-studio.tsx`
- `app/public/**`

Codex owns markup, layout, forms, modals, tables, empty/loading/error states, responsive behavior, accessibility, icons, animation, 3D rendering, visual polish, and browser-based UI verification.

### Claude — functionality and data

- `app/lib/**`
- `app/lib/data/**`
- `app/lib/screens.ts`
- `app/app/api/**`
- `app/scripts/check-*.mjs`

Claude owns types, records, business rules, calculations, storage, APIs, authentication/roles, integrations, navigation IDs/groups/labels, AI processing, import/export, notifications, and automated checks.

### Shared discipline

- Anything outside the lists above must be assigned before either agent edits it.
- Keep the re-exports in `app/app/ui/shared.tsx`.
- Do not move data or business logic back into `.tsx` files.
- Use `codex/<topic>` and `claude/<topic>` branches.
- Preserve the repository email `tools@synixsolutions.io`.
- Both sides run the complete gate before merge:

```powershell
pnpm check
node node_modules/typescript/bin/tsc --noEmit
pnpm build
```

## Workstream matrix

| Marcel's request | Codex — interface work | Claude — functionality/data work | Handoff between us |
| --- | --- | --- | --- |
| Navigation organized around the real workflow | Redesign sidebar hierarchy, project/global context, active states, responsive nav, and icons | Finalize screen IDs, labels, groups, routing, search behavior, and project/global availability in `lib/screens.ts` | Claude publishes the navigation contract; Codex renders it and maps every icon |
| All Projects as the starting view | Build the project gallery/list and project-opening experience | Make All Projects the default screen and provide project selection/current-project state | Codex consumes the selected-project state without duplicating it |
| Expanded new-project setup | Build the modal/form, grouped fields, conditional renovation/addition fields, validation messages, and upload presentation | Expand `Project` types, validation, persistence, filters, RFP metadata, square footage, tax/certification fields, and project team data | Claude exposes typed form input and errors; Codex renders them |
| Project-specific documents | Build file browser, categories, upload progress, processing states, previews, and empty/error states | Replace global document behavior with project-scoped records, file persistence, metadata, versioning, upload APIs, and processing jobs | Claude provides document status and actions; Codex visualizes each state |
| AI-generated scopes and bid forms | Build review table, evidence panel, approval controls, Move-to-trade modal, owner selector, publish confirmation, and status visuals | Generate/store scope items, evidence, owner/trade assignment, review state, move behavior, publish rules, and audit history | Claude defines status transitions; Codex must not recreate them locally |
| Subcontractor Outreach | Build BuildingConnected-like package list, package detail, invite modal, outreach log, contact cards, and message UI | Model packages, contacts, invitations, confirmation status, notes, messages, reminders, trade filtering, and notification delivery | Claude exposes package/contact actions; Codex provides the workflow UI |
| External subcontractor portal | Build the invitation, bid form, proposal upload, price entry, RFIs, confirmation, and submission experience | Implement access tokens/authentication, roles, package permissions, proposal storage, scope-response persistence, submission rules, and audit trail | Claude supplies a safe portal session API; Codex renders only authorized data |
| Bid leveling | Improve the comparison grid, exclusion/partial highlighting, suggestion review, source display, responsive navigation, and approval UI | Own all leveling calculations, eligibility, Y/N/P rules, adjustment approval, cost suggestions, history/takeoff inputs, workbook import/export, and persistence | Claude returns calculated results and reasons; Codex never recalculates totals in the UI |
| Quantity takeoffs | Build trade/division drill-down, item table, source inspector, units, review states, and visual summaries | Model quantities, units, source links, trade grouping, calculations, data import/extraction, approval, and downstream budget links | Claude exposes approved takeoff records; Codex makes them inspectable |
| Drawing and specification registers | Build separate polished register screens, filters, row details, revision badges, and previews | Parse/store drawing and specification metadata, dates, disciplines, sections, revisions, and project ownership | Claude supplies normalized register records; Codex builds both views |
| Revision comparison | Improve side-by-side/changes-only UI, overlays, navigation, and mobile presentation | Implement version pairing, detected change records, source references, and affected-scope/quantity links | Claude supplies change geometry/metadata; Codex draws the comparison |
| Structor Check and RFIs | Build filterable issue table, severity/trade filters, contractor-review queue, issue editor, package/send dialogs, response timeline, and provenance badges | Unify AI, contractor, subcontractor, and email RFIs; enforce contractor review before packaging/sending; implement state machine, routing, APIs, notifications, responses, permissions, and audit history | Claude prevents an unreviewed issue from being sent; Codex makes the review, package, send, and response boundaries explicit |
| Budget summary and detailed budget | Build direct/indirect sections, summary cards, detailed tables, import/review UI, variance visuals, and charts | Define budget model, direct/indirect categories, Excel import, links to leveled bids/scopes, forecast/variance calculations, and persistence | Claude supplies authoritative values and mapping errors; Codex presents them |
| Allowances | Build editable allowance list, origin/evidence display, total cards, and review states | Extract/store allowances, amounts, source citations, approvals, and budget roll-up | Claude exposes allowance records and totals; Codex renders editing/review |
| Contracts and Exhibit A | Build trade-based award screen, selected-bidder summary, document preview, comment/redline timeline, signature status, and download UI | Implement template configuration, scope-to-document generation, versions, comments, negotiation states, notifications, signatures/integration, and final storage | Claude generates/version-controls documents; Codex provides review and action screens |
| Submittal packages/log | Convert the current Spec Matrix UI into an Operations workflow with package lists, status filters, submission/review panels, and architect/subcontractor views | Extract submittal requirements, link them to awards/specs, manage routing, versions, approvals, reminders, permissions, and notifications | Claude owns the workflow state; Codex builds role-aware views |
| Project schedule | Keep and polish the Gantt/timeline, filters, progress editing, legends, and responsive controls | Own milestone data, dependencies, progress logic, persistence, and P6/MS Project import/export | Claude supplies schedule records and import errors; Codex renders the timeline |
| Preconstruction to-do/progress | Rename and redesign the current Turnover preview as a useful progress/checklist screen | Replace the old data with derived tasks such as scope approvals, missing bid forms, unresolved RFIs, incomplete leveling, and pending awards | Claude derives tasks; Codex shows progress, grouping, and next actions |
| Drawing Flip | Build a standalone Preconstruction page with the drawing viewer, page navigation, trade-color overlays, scope selection, hover/click interaction, legend, manual reassignment UI, and links back to scopes/bid forms | Produce/store page regions, scope-to-region links, trade classifications, evidence, confidence, and corrected assignments | Claude exposes coordinates and trade IDs; Codex renders the standalone viewer and connected scope navigation |
| Value Engineering | Build target-savings dashboard, idea cards/table, manual-add UI, pricing-request flow, status, and savings visuals | Generate/store ideas, evidence, estimated savings, approval state, subcontractor pricing requests, responses, and budget effects | Claude owns idea lifecycle and math; Codex provides the decision workspace |
| Global subcontractor directory | Build global directory, search/filter UI, company profiles, trade chips, project history, and invitation entry points | Define organization/company/contact records, trade classifications, search, deduplication, project history, permissions, and integrations | Claude supplies the canonical company record; Codex never keeps a second local directory |
| Ratings and prequalification | Build rating summaries/forms, evidence/history presentation, prequalification questionnaire, file checklist, and status UI | Define rating criteria, aggregation, permissions, moderation, disputes, questionnaire schema, document storage, expiry rules, and approval workflow | Requirements must be confirmed before Claude locks the model and Codex finalizes screens |
| Historical estimating and benchmarking | Build comparable-project results, filters, cost-per-area cards, inflation explanations, division charts, and budget-trend dashboards | Implement comparable-project search, permissions, normalization, inflation data/rules, cost metrics, phase history, and estimate calculations | Claude returns comparisons with reasons; Codex makes them understandable and reviewable |
| AI assistant | Build chat/help panel, citations, suggested prompts, tool/progress states, and safe confirmation UI | Implement retrieval, project-data access, tool calling, permissions, citations, refusal/uncertainty handling, and cost-data sources | Claude exposes cited answers/actions; Codex distinguishes answers from executable actions |
| 3D quantities and metadata | Make every supported object selectable and expand the right-side inspector to show area, length, height, thickness, assembly, sources, specifications, and confidence | Extend `lib` model data/types with authoritative geometry-derived quantities and document/spec associations | Codex requests fields; Claude adds them to `lib`; Codex renders consistent object-level detail |
| 3D second floor and richer interiors | Build geometry presentation, floor switching, transitions, doors, furnishings, equipment, labels, materials, show/hide controls, and animations | Supply structured element records and source-linked model data; build any processing pipeline that derives them | Claude owns the data contract; Codex owns `model-studio.tsx` and public visual assets |
| 3D interior, MEP, structural, exterior, and walkthrough views | Build distinct discipline screens/views, filters, cutaways, navigation, first-person controls, visual hierarchy, and performance-friendly rendering | Supply system geometry/metadata, discipline classification, clash/change records, source links, and processing/storage | Treat each discipline view as a separate milestone sharing one model and inspector contract; use BuildingConnected only as terminology reference, not as an exact UI taxonomy |
| Automated regression gate | Perform browser/mobile/accessibility/visual interaction checks and fix UI defects in Codex-owned files | Extend `check-*.mjs` for new screen coverage, data rules, model counts/contracts, imports, and workflows | Both run the whole gate; Claude owns test scripts, Codex owns UI fixes |

## Codex backlog — what I would do

### Immediate UI restructuring

1. Rebuild the sidebar and page shells around the navigation contract Claude supplies.
2. Make All Projects the clear starting experience.
3. Redesign the expanded new-project form.
4. Create the Subcontractor Outreach container and nested package workflow.
5. Split the drawing and specification register presentation.
6. Move the current Spec Matrix presentation into an Operations/Submittals experience.
7. Reframe Project Turnover as a preconstruction to-do/progress view.

### Core procurement UI

8. Add Move-to-trade, owner assignment, estimator review, and Publish-to-subcontractors interfaces.
9. Build the invite-bidder modal and trade-filtered company picker.
10. Build outreach notes, status, and follow-up presentation.
11. Complete the external subcontractor portal UI.
12. Improve bid-leveling exception, suggestion, and evidence review.
13. Build the unified RFI table and response timeline.

### Budget and award UI

14. Redesign the budget into direct costs, indirect costs, detailed lines, forecast, and variance.
15. Build allowance and value-engineering workspaces.
16. Build the trade award, Exhibit A, subcontract preview, negotiation, and signature-status experience.

### Visual intelligence

17. Build Drawing Flip overlays and interactions once Claude supplies page coordinates.
18. Expand the 3D inspector and quantity presentation.
19. Add second-floor and interior element controls.
20. Add distinct interior, MEP, structural, exterior, and walkthrough screens/views on the shared model and inspector foundation.
21. Finish responsive behavior, accessibility, loading/error states, animation, and UI regression checks.

## Claude backlog — what Claude would do

### Foundations

1. Finalize `lib/screens.ts`: global versus project screens, groups, IDs, labels, and routing.
2. Expand project records and persistence with the fields Marcel requested.
3. Make documents, scopes, bidders, budgets, and related records truly project-specific.
4. Define roles and permissions for internal estimators, subcontractors, architects, and organization admins.

### Procurement functionality

5. Implement scope generation records, evidence, review, owner/trade reassignment, approval, publish, and audit states.
6. Implement bid packages, invitations, outreach history, contacts, messages, follow-up, and notifications.
7. Implement portal authentication/access and durable proposal/bid-form submissions.
8. Connect portal responses to the authoritative bid-leveling engine.
9. Implement historical/takeoff-based cost suggestions with estimator approval.
10. Preserve and expand company-specific Excel import/export behavior.

### Documents, issues, and operations

11. Parse and store drawing/specification registers and revisions.
12. Define one RFI model for AI, internal, subcontractor, and email sources.
13. Implement RFI routing, responses, notifications, and audit history.
14. Implement submittal requirements, package routing, architect review, and subcontractor resubmission.
15. Implement schedule persistence plus P6/MS Project import/export.
16. Derive the preconstruction to-do list from actual project state.

### Budget, award, and company data

17. Implement real budget import, direct/indirect splits, detailed lines, leveled-bid roll-up, and variance.
18. Implement allowance extraction and approval.
19. Implement template-driven Exhibit A/subcontract generation and versioned negotiation states.
20. Create the global subcontractor/company model, search, trade classification, ratings, and prequalification workflow.

### Intelligence and 3D data

21. Implement page-region/scope mappings for Drawing Flip.
22. Implement value-engineering records and AI suggestion workflow.
23. Implement comparable-project analytics, inflation adjustment, and budget phase history.
24. Implement the cited AI assistant and its permission model.
25. Extend the 3D/model data types with quantities, source/spec metadata, floors, disciplines, and system records.
26. Extend automated checks for every new business rule and navigation/model contract.

## Work that requires a decision from Danial or Marcel first

Neither Codex nor Claude should invent these answers:

1. The promised real budget and detailed-budget files.
2. Which leveled-bid value becomes the budget forecast.
3. Exact Operations and true turnover/handover scope.
4. Subcontractor rating criteria, visibility, moderation, and dispute handling.
5. The real prequalification questionnaire and required documents.
6. Customer template rules for bid sheets, Exhibit A, and subcontract agreements.
7. The first 3D expansion milestone and the source/accuracy standard for it. The separate interior, MEP, structural, and exterior view structure is already confirmed.
8. Whether historical project data is strictly private to each contractor organization.
9. Confirmation of the reference products Marcel called “Concentric” and “Join.”

The navigation question is resolved: use two project-level groups, **Preconstruction**
and **Operations**. Subcontractor Outreach is nested inside Preconstruction. Global
workspace tools remain outside the project groups.

Other confirmed interpretation from Danial:

- Drawing Flip is a standalone Preconstruction page connected to Scopes & Bid Forms.
- AI-created and subcontractor-created RFIs must be reviewed by the contractor before they can be packaged and recorded as sent to the architect.
- The 3D product has distinct interior, MEP, structural, and exterior screens/views, with a detailed right-side inspector for selectable objects.
- The BuildingConnected CSI list shown in the video is a vocabulary reference, not an exact list or interface to reproduce.

## Recommended parallel sequence

### Wave 1 — Product structure

**Claude:** navigation contract, project data, project-scoped persistence, drawing/spec register data.  
**Codex:** sidebar/project UI, new-project form, register screens, submittal/to-do screen presentation.

Claude should publish the screen IDs and types first. After that, both can work in parallel without touching each other's files.

### Wave 2 — Procurement vertical slice

**Claude:** scope review/publish states, package/invitation data, portal submissions, leveling integration.  
**Codex:** scope review UI, outreach UI, invitation modal, portal UI, leveling review experience.

The acceptance path is one real trade:

```text
Approved scope → publish → invite bidder → bidder responds → level bid → review exceptions
```

### Wave 3 — Budget and award

**Claude:** budget import/model, roll-up, allowance data, template-generated Exhibit A/subcontract.  
**Codex:** budget/detail UI, allowance UI, award and document negotiation UI.

### Wave 4 — Operations

**Claude:** unified RFIs with a mandatory contractor-review gate, submittal routing, schedule import/export, notifications.
**Codex:** RFI review/package/send flow, submittal, role-specific review, and schedule interfaces.

### Wave 5 — Advanced intelligence and 3D

**Claude:** Drawing Flip coordinates, VE/benchmarking/chat functionality, extended model data.
**Codex:** standalone Drawing Flip page, VE/benchmark dashboards, chat interface, and distinct 3D discipline views.

## Definition of done for a shared feature

A workstream is complete only when:

1. Claude's types and data/actions are authoritative and persisted where required.
2. Codex's screen handles loading, empty, success, validation, permission, and failure states.
3. The feature is connected to the selected project and correct user role.
4. No business logic is duplicated in `.tsx` files.
5. No UI component owns a second copy of project data.
6. Claude's automated checks pass.
7. Codex verifies the rendered workflow on desktop and mobile.
8. TypeScript and the production build pass.
9. The final behavior is described honestly as working, conditional, or preview.

import { pageGuides } from "./manual-pages";

export type ManualGuide = {
  id: string;
  group: string;
  title: string;
  purpose: string;
  steps: string[];
  terms: { name: string; meaning: string }[];
  example: string;
  reality: string;
  related: string[];
};

const workspaceGuides: ManualGuide[] = [
  {
    id: "start", group: "Start here", title: "About Structor · start here",
    purpose: "Structor helps a construction team prepare a project before building starts. The team reads drawings and written requirements, lists the work each trade must price, compares subcontractor bids, and prepares a budget and handover. Think of it as a shared checklist and comparison desk—not an automatic decision-maker.",
    steps: [
      "Use the left navigation to choose a page. On a phone, open the menu at the top left. Quick find (Ctrl+K on Windows or Command+K on Mac) searches page names, not document contents.",
      "Start with All projects and Project information to understand which building, deadlines, and estimate you are looking at. Sample project information is illustrative and should be checked against the actual documents.",
      "Follow the Full workflow guide below to understand the order of work. You do not have to fill every preview screen before using Bid leveling.",
      "Click the floating question mark on any page to open that page’s instructions. Search this manual by a word such as bidder, Gmail, floor plan, or allowance. Browse Start here for the big picture, or Glossary for unfamiliar terms.",
      "Close this manual with the X or Escape to return to the same screen without losing your place. Opening a different app page can reset that page’s unsaved preview data; export important work first.",
    ],
    terms: [
      { name: "Owner / client", meaning: "The person or organization paying for the building." },
      { name: "General contractor / project manager", meaning: "Coordinates the whole project and compares specialist companies’ prices." },
      { name: "Estimator", meaning: "Works out the required quantities, costs, and missing scope before a price is agreed." },
      { name: "Subcontractor / bidder", meaning: "A specialist company, such as a steel or electrical contractor, offering to do a portion of the work." },
    ],
    example: "Marcel’s team checks whether each steel bidder included all the required steel work. If one price excludes roof anchors, they record the gap, estimate the missing cost, and review it before comparing prices.",
    reality: "This version combines working local tools with interface previews. Project records, the bid-leveling workspace, and many preview edits save in this browser when storage is available. Actual uploaded file contents and unsaved forms are not permanently stored. Preview invitations and messages are not sent, and the screens are not yet one fully connected live project database.",
    related: ["workflow", "saving", "glossary", "leveling"],
  },
  {
    id: "workflow", group: "Start here", title: "The full workflow, end to end",
    purpose: "The basic chain is documents → scope → bids → comparison → budget → award → turnover. Each stage answers a different question. The intended workflow below explains how the screens fit together; automatic transfer between all of them is not implemented.",
    steps: [
      "Understand the job. In Project information, record the building, dates, and planning value. Documents holds the reference files: drawings show layout; specifications describe materials and quality; an RFP describes what the client is asking for.",
      "Work out what must be included. Use Scopes & bid forms to list each trade’s requirements. Submittal packages (currently the spec matrix) organizes written requirements. Quantity takeoffs records how much work there is. List of drawings, Revision comparison, and Structor Check help organize drawing changes and questions.",
      "Ask companies to price the same job. Scopes & bid forms is where estimators approve each trade’s checklist and publish it. Bid packages lists each trade’s owner, due date, invited companies, and follow-up log. Subcontractor directory is the company contact list shared by every project. The Subcontractor portal shows the trade partner’s response experience; it is still a fixed example and does not yet receive published bid forms.",
      "Collect and review offers. A bid contains a price plus inclusions, exclusions, and qualifications. The configured Gmail Proposal inbox can list emails and attachments. You still read the proposal and enter or verify its answers manually.",
      "Compare like for like in Bid leveling. Start from the supported Excel template or the demo, check each bidder’s Y/N/P answers, add notes and justified adjustments, and resolve exceptions. Only fully eligible reviewed bids appear in the reviewed ranking.",
      "Plan the overall cost. Budget summary shows the intended cost-center rollup and trade breakdown. Allowances reserves money for undefined work. These screens currently use their own preview values rather than automatically reading the live bid-leveling results.",
      "Prepare the award and handover. Contracts & exhibits describes what the selected company will deliver. Project schedule records milestones. Each Bid package keeps its own messages with the invited companies, and Preconstruction to-do checks that the delivery team gets the right records. These are draft/preview tools, not executed contracts or delivered communications.",
      "Keep a copy. Export reviewed mapped work to Excel from Bid leveling, and download a JSON backup before replacing or resetting the active workspace. Other screens provide their own CSV or draft downloads where offered.",
    ],
    terms: [{ name: "Scope vs price", meaning: "Scope is what is included. Price is what it costs. The cheapest price is not necessarily the cheapest complete offer." }, { name: "Human review", meaning: "An estimator checks the source and makes the decision; a generated or prefilled value is not proof." }],
    example: "A steel proposal is $100,000 but misses $10,000 of required work. With a verified $10,000 adjustment and a 2% bond on the subtotal, the comparison total is $112,200. This is an explanation of the calculation, not a project quote.",
    reality: "The order above describes the product workflow. It does not mean uploading one file currently completes all these steps. The live Excel calculation and the prepared 3D viewer work independently of the other preview modules.",
    related: ["documents", "scopes", "packages", "leveling", "budget", "turnover"],
  },
  {
    id: "overview", group: "Preconstruction", title: "Overview",
    purpose: "Your starting page gives an at-a-glance picture of the selected project and shortcuts to the next task. It is a dashboard, not the place where scope answers or bidder prices are entered.",
    steps: [
      "Read the large project card for the selected project name, location, type, and estimated value. Open project takes you to Project information.",
      "Use Add documents to open the document library, or New project to create a local project record.",
      "Read the metric cards: Scope requirements is the count of checklist items; Proposals received is the count of offers; Open document issues is unresolved information; Procurement progress describes progress toward selecting trade partners.",
      "Use the next-step cards and workflow links to jump to scopes, document checks, or bid leveling. Trade and activity links also open the relevant screen.",
      "The bell at the top opens example activity notifications. Quick find searches destinations. The profile initials open Settings.",
    ],
    terms: [{ name: "Estimated value", meaning: "An early planning amount, not a signed contract price." }, { name: "Procurement", meaning: "The process of requesting bids, reviewing them, and selecting companies to do the work." }],
    example: "If you want to check whether the steel quotes cover the same work, follow Compare incoming proposals to Bid leveling. The dashboard’s proposal count is not a mailbox status indicator.",
    reality: "The metric counts, activity, team display, progress, and dashboard bid deadline are sample content, not live calculated project reporting. The small animated building is an illustration. Use 3D model studio for the separate interactive Jelleff reconstruction.",
    related: ["information", "model", "workflow"],
  },
  {
    id: "projects", group: "Workspace", title: "All projects",
    purpose: "This is the list of construction jobs in the workspace. A project is the overall building job; a bid package is only one trade’s portion of that job.",
    steps: [
      "Search by project name, or filter by the All projects, Preconstruction, Design development, and Bidding tabs.",
      "Click a project card to select it and open its Project information page.",
      "Choose New project or Your next project. Enter a name, location, type, internal project value, and brief description, then choose Create project.",
      "Review the new record using Edit information. Size, architect, and dates begin with sample defaults and must be updated for your actual project.",
      "Return to All projects to switch projects. Each project keeps its own files, scopes, takeoffs, budget, bid leveling workbook, and other saved screen data; the subcontractor directory is shared by every project. Keep exports of important work.",
    ],
    terms: [{ name: "Design development", meaning: "A stage where the design is being refined before final construction details are complete." }, { name: "Bidding", meaning: "The stage when companies are being asked to submit prices." }],
    example: "Create a school modernization project to demonstrate its project brief and dates. A new project starts with empty lists and an unchecked to-do list. It does not generate scopes or costs from its documents, and the 3D model remains the Jelleff reconstruction.",
    reality: "Project records are saved in this browser. The optional RFP file input is a selection preview: it does not parse or store the RFP. The Jelleff Recreation Center project holds the sample content; other projects hold only what is entered for them. Bid leveling shows labelled demo data until a workbook is imported for the project.",
    related: ["information", "saving", "documents"],
  },
  {
    id: "information", group: "Preconstruction", title: "Project information",
    purpose: "The project’s cover sheet: what is being built, where it is, the design contact, key dates, and internal planning value. Use it to get oriented before reviewing any trade.",
    steps: [
      "Read the project brief, architect, project size, and dates. Bid deadline is when prices are due; Pre-bid RFI deadline is when clarification questions should be submitted.",
      "Choose Edit information. Update the name, location, architect, size, dates, internal project value, and brief; choose Save project.",
      "Use Budget breakdown to inspect the separate budget preview. It is not calculated from the internal value field.",
      "Open Project files or RFP & bid requirements to go to Documents, and Bid packages to go to trade invitations.",
      "Subcontractor view opens the portal preview. Manage next to Project team opens Settings, where example roles are described.",
    ],
    terms: [{ name: "Project size / SF", meaning: "Building area in square feet. Check the actual source area rather than relying on a sample value." }, { name: "Internal estimate", meaning: "A team planning figure, not the amount a bidder has submitted." }],
    example: "Set the actual bid deadline and RFI deadline in the project record so the project brief is accurate. Other sample schedule and dashboard dates are not automatically synchronized with these edits.",
    reality: "Edits to this record save locally in this browser. The team list is illustrative. TEAM VIEW and role labels are design labels, not enforced security permissions in this prototype; do not treat this as a secure client-sharing boundary.",
    related: ["projects", "schedule", "settings"],
  },
  {
    id: "model", group: "Preconstruction", title: "3D model studio",
    purpose: "Explore a prepared first-floor reconstruction of Jelleff Recreation Center. Rotate the building, select walls or floor zones, and compare the model with the supplied blueprint sheets. This helps explain space and material evidence visually.",
    steps: [
      "In 3D model, drag to rotate, use the mouse wheel or pinch to zoom, and right-drag to pan. The viewer also provides zoom, home/reset, and top-view controls. Focus the canvas and use arrow keys to move the view.",
      "Use Cutaway to lower the displayed walls and see inside. Material colours distinguishes assigned material types; room labels identify spaces. The walls toggle can hide vertical elements so floor zones are easier to see.",
      "Click a visible model element or choose one from the element list. Read the inspector for its material or assembly, evidence, and assumptions. Inspect the gym floor is a quick way to start.",
      "Use Focus to center on a selection, and Isolate to see it alone. Show all restores the rest of the model. Use the home/reset view control if you lose your orientation.",
      "Choose Compare with blueprint or the Compare tab to see model and source together. Blueprint shows the source sheet alone. Select a source reference to inspect the related sheet, use its zoom control, and open the full-size image for detail.",
      "Use Expand model workspace for more room, then Exit expanded view to return. About this model explains the reconstruction limits. The floating question mark remains available while the model is expanded.",
    ],
    terms: [{ name: "Cutaway", meaning: "A viewing aid that shortens walls so you can see inside; it does not mean the real walls have been shortened." }, { name: "Assembly", meaning: "The layers making up an element, such as framing, insulation, and boards in a partition." }, { name: "Documented vs illustrative", meaning: "A material may be described in the drawings, while its assignment to an approximate model element still needs checking." }],
    example: "Select the gym floor, inspect its finish information, then open the relevant finish sheet beside the model. Use that as a visual explanation of the source-to-model workflow, not a certified material quantity.",
    reality: "The geometry is manually approximated from the supplied Jelleff PDFs. Heights and placements are simplified; highlighted source positions are approximate. Upper floor, roof, structure, and detailed services are omitted. Uploading another PDF does not generate a new model yet. This is not survey/BIM accuracy, automatic material recognition, or a construction-ready takeoff.",
    related: ["documents", "drawings", "specs", "takeoffs"],
  },
  {
    id: "leveling", group: "Preconstruction", title: "Bid leveling",
    purpose: "Compare companies against the same checklist of work. Each scope row has a response, note, and adjustment for each bidder. A low price is only comparable after you have checked what it includes.",
    steps: [
      "For real workbook work, choose Import Excel and select a supported .xlsx trade template. Read the import preview and warnings before Import this trade. This replaces the active workspace; download a backup first. Arbitrary Excel layouts and PDFs are not supported imports.",
      "Choose Add bidder, or click a bidder’s name to edit it. Enter company, contact, base bid, bond rate, and workbook level status. Blank price means no quote; an intentional $0 quote needs confirmation. NO — do not level keeps that bidder out of the ranking. The template has a limited number of bidder slots.",
      "Read each requirement and the actual proposal. Choose Y for included, N for excluded, P for partial, or N/A for not applicable. Leave an unclear answer blank instead of guessing. Add a note explaining exclusions, assumptions, or clarification needed.",
      "When a gap has been genuinely dealt with, tick Resolved for N or P. N/A needs both a reason in the note and Resolved. Enter any justified price adjustment and tick Approved for each non-zero adjustment. Merely typing an adjustment does not finish its review.",
      "Use Exceptions only or Next exception to find outstanding checks. Search scope narrows rows by text. Click a row to edit its description, section, estimator note, and Required for complete scope setting in the inspector.",
      "Read the summary and row totals. Low submitted bid is before adjustments. Provisional total includes the current adjustments and bond even while checks remain. Reviewed leveled low and ranks only include eligible bids with all required checks resolved. Variance is reviewed total minus budget; positive means over budget.",
      "Watch the saved status. Export Excel downloads mapped values in a preserved copy of the source workbook; it can export before every bidder is rank-ready. Changed unapproved adjustments are omitted, leaving the source value unchanged. Read export warnings and open/recalculate the file in desktop Excel before relying on formula totals. Backup JSON also keeps new/unmapped rows. Add scope item creates an unmapped row and can block Excel export until verified mapping exists. Load demo replaces the active workspace after confirmation.",
      "Proposal inbox opens Gmail intake; see its separate guide. Cost suggestions is an example quantity × unit-rate calculator: approving its example does not modify the active workbook. Glossary and How it works provide additional local explanations.",
    ],
    terms: [{ name: "Y / N / P / N/A", meaning: "Yes, No, Partial, and Not applicable. There is no L response in this app; leveled describes a reviewed comparison, not a scope answer." }, { name: "Bond rate", meaning: "The percentage applied to base bid plus adjustments in this calculation. Verify the appropriate rate; do not assume the demo’s rate applies to every trade." }, { name: "Rank-ready", meaning: "A bidder has a valid price, valid costs, an allowed workbook level status, and no open required review checks." }],
    example: "A bidder excludes anchors: mark N, describe the omission, enter a supported adjustment, approve that amount, and resolve the scope gap after review. Other unresolved rows still prevent that bidder from appearing as the reviewed low.",
    reality: "This comparison, manual bidder editing, supported Excel import/export, and browser saving work now. It is one locally saved trade workspace per project, separate from the sample Budget summary. Choose a package under Portal submissions and Load bids to fill it from bids submitted in the Subcontractor portal; their N, P, and N/A answers arrive open for review, and a bid priced against an older bid form is shown but never ranked. Emails and PDFs do not fill its rows automatically. Check exports and source documents before using the figures commercially.",
    related: ["gmail", "saving", "bidders", "budget", "glossary"],
  },
  {
    id: "settings", group: "Workspace", title: "Settings",
    purpose: "See the workspace preferences, example team roles, connection options, and animation setting. The initials in the top-right corner and Settings in the sidebar both open this page.",
    steps: [
      "In Workspace, review the workspace name, company, region, currency, measurement system, and default scope template. Save preferences acknowledges the preview form; it does not reconfigure the entire app.",
      "Open People & roles to see the intended roles: project manager, estimator, subcontractor, and architect. Invite teammate collects an email and role and creates a preview invitation draft; no invitation email is sent.",
      "Open Connections, then Gmail → View connection → Open bid workspace. In Bid leveling choose Proposal inbox to use the real read-only connector after setup.",
      "The Outlook, BuildingConnected, and Google Drive / OneDrive cards are planned integrations. Their buttons explain the preview; they do not authorize or synchronize those services.",
      "In Appearance, turn on Reduce animation if movement is distracting. The interface also respects the device’s reduced-motion preference.",
    ],
    terms: [{ name: "Role", meaning: "A person’s intended responsibilities and access in a future shared workspace." }, { name: "Connection", meaning: "An authorized link to another service. Seeing a service logo does not mean it is connected." }],
    example: "For a calmer walkthrough, enable Reduce animation. To inspect incoming proposals, use the Gmail connection route, not a Bid package's Messages tab, which is a separate draft conversation.",
    reality: "Workspace preferences and roles are UI previews, not durable organization settings or enforced account permissions. Reduce animation lasts for the current app session. Gmail needs server configuration and account authorization; the other connection cards are not live integrations.",
    related: ["gmail", "saving", "packages"],
  },
  {
    id: "gmail", group: "Reference", title: "Gmail & proposal emails",
    purpose: "The read-only inbox helps you find proposal correspondence and download its attachments. It is an intake aid—not an automatic reader, sender, or bidder classifier.",
    steps: [
      "Open Bid leveling and choose Proposal inbox. If account authorization is needed, choose Connect Gmail. The workspace is saved before you leave for the connection flow; resolve any save error first.",
      "If setup is missing, ask the app administrator to configure the Gmail connection and matching callback address. A configuration error cannot be fixed by repeatedly pressing Connect. Never paste account passwords or secret keys into project notes.",
      "Authorize the intended Google account. Once you return, open Proposal inbox again and use Refresh Gmail to fetch current results.",
      "Read the sender, subject, date, and snippet. The inbox retrieves up to 20 messages with attachments from the last 30 days, with no next-page control. It is not a complete history of every bidder discussion.",
      "Click an attachment to download it. Read it and verify which project, trade, company, revision, and price it belongs to. A familiar sender or subject alone is not enough evidence.",
      "Return to the grid, add/edit the bidder, and manually record the base bid, Y/N/P answers, notes, and adjustments. Keep unclear answers blank and request clarification through your usual communication channel.",
    ],
    terms: [{ name: "Read-only", meaning: "The connector retrieves messages and attachments; it does not send email or change your mailbox." }, { name: "Automatic extraction", meaning: "Software reading a proposal and proposing structured fields. This is not enabled in the current inbox." }],
    example: "Download a steel proposal, confirm it is for the right Jelleff package, and enter its price and exclusions in Bid leveling. Opening the email does not create a bidder or mark rows automatically.",
    reality: "Connection availability depends on local server configuration and the account’s authorization. No automatic project matching, email-to-scope creation, bidder creation, PDF price extraction, or Y/N/P population is enabled. Outlook is planned, not another live inbox option.",
    related: ["leveling", "settings", "bidders", "saving"],
  },
  {
    id: "saving", group: "Reference", title: "Saving, exports & common questions",
    purpose: "Know what stays, what resets, and what to download. This is a local prototype, not yet a shared cloud record system. A toast saying a preview was saved is not the same as a permanent server backup.",
    steps: [
      "Project records save to this browser’s local storage. Bid leveling saves its current workspace and imported source workbook in browser storage. Keep the same browser profile and site address; localhost and 127.0.0.1 are different storage locations.",
      "Most document-register, scope, takeoff, and commercial preview edits also save locally when browser storage is available. They are stored separately for each project; the subcontractor directory is shared across projects. They do not synchronize across computers, users, or modules. Unsaved forms and actual uploaded-file previews can be lost on navigation; save entered fields and retain the original files.",
      "In Bid leveling, wait for a successful saved status, then use Export Excel for supported mapped workbook work. No Excel export is available without a supported source workbook; new unmapped scope rows also prevent a safe export. Read export warnings: unapproved changed adjustments are omitted, and formulas need recalculation in desktop Excel. A successful export does not mean every bid has finished review.",
      "Use Backup JSON before importing another workbook, loading demo data, or clearing browser storage. JSON is a data backup, not an Excel sheet; there is no JSON restore button in this interface. Keep the original workbook and downloaded exports as well.",
      "CSV exports elsewhere are simple tables for spreadsheet software. Contract and turnover downloads are text drafts or checklists. They are not a signed agreement, a delivered message, or a complete copy of all uploaded source files.",
      "If rows seem missing, clear search and exception filters. If no reviewed low appears, check missing price, intentional $0 confirmation, NO level status, unknown responses, unresolved N/P/N/A, and unapproved adjustments.",
      "If a page appears not to update another page, it may be an independent preview. The Subcontractor directory does not automatically create bidder columns in Bid leveling, and Budget summary does not automatically receive its live winning price.",
      "Use Download manual here for a portable Markdown text copy. It contains the instructions, not your project’s private data. You can read it in any text editor and share it as a usage guide.",
    ],
    terms: [{ name: "Local storage", meaning: "Information kept in this browser on this device. Clearing site data or using another profile can make it unavailable." }, { name: "XLSX / CSV / JSON", meaning: "XLSX is an Excel workbook; CSV is a plain table; JSON is structured data. These formats serve different purposes." }, { name: "PDF upload", meaning: "Currently a document preview/registration action, not automatic creation of a scope sheet or 3D model." }],
    example: "Before importing the next trade’s Excel sheet, export the current reviewed sheet and download its JSON backup. Importing replaces the active workspace rather than adding a second saved trade tab.",
    reality: "Do not rely on browser storage as the only copy of business-critical work. Preview security labels are not access controls. Review generated-looking sample content, source citations, downloaded quantities, and costs before relying on them.",
    related: ["leveling", "documents", "projects", "gmail"],
  },
];

export const manualGuides: ManualGuide[] = [...workspaceGuides, ...pageGuides];
export const manualGroups = ["Start here", "Workspace", "Preconstruction", "Operations", "Reference"];
export const glossary = [
  { name: "Addendum", meaning: "An official clarification or revision to the bid documents. Confirm which version each bidder priced." },
  { name: "Alternate", meaning: "A separately priced option that can be accepted or rejected. Do not silently add it to the base scope." },
  { name: "Allowance", meaning: "Money reserved for work or a selection that is not fully defined yet." },
  { name: "Base bid", meaning: "The original price offered by a subcontractor before leveling adjustments." },
  { name: "Bid form / scope sheet", meaning: "The checklist a trade is asked to price and answer so companies can be compared fairly." },
  { name: "Bid leveling", meaning: "Reviewing scope differences and justified price adjustments to compare equivalent offers." },
  { name: "Bid package", meaning: "One trade’s scope, documents, deadline, and invitation details." },
  { name: "Bidder", meaning: "A company submitting an offer to carry out part of the construction work." },
  { name: "BIM", meaning: "Building Information Modeling: coordinated model geometry and information. This prepared 3D preview is not a complete BIM model." },
  { name: "Bond", meaning: "Financial security for performance or payment; its premium is a cost that may need to be included in a bid." },
  { name: "Cost center", meaning: "A budget grouping such as modernization, addition, or site work." },
  { name: "Cost plug / adjustment", meaning: "A reviewed amount added or deducted to account for a scope difference. It needs a reason and a reliable cost basis." },
  { name: "CSI division", meaning: "A standard work category, for example 03 Concrete, 05 Metals, or 26 Electrical." },
  { name: "Drawing register", meaning: "The list of drawing numbers, titles, dates, disciplines, and revisions." },
  { name: "EA / LF / SF / CY", meaning: "Each (count), linear feet (length), square feet (area), and cubic yards (volume). Quantities and unit prices must use matching units." },
  { name: "Elevation / section / floor plan", meaning: "A side view, a cut-through view, and a top-down layout. A floor plan alone does not prove all heights or hidden construction." },
  { name: "Exception", meaning: "An answer or cost that still needs attention before a bid is ready for comparison." },
  { name: "Exclusion", meaning: "Work the bidder has explicitly left out of its price." },
  { name: "Exhibit A", meaning: "The scope-of-work attachment to a subcontract. Other exhibits can list drawings or supporting requirements." },
  { name: "GMP", meaning: "Guaranteed Maximum Price: a contractual pricing arrangement. A filename containing GMP is not evidence that a current app estimate is guaranteed." },
  { name: "Inclusion / qualification", meaning: "An inclusion says work is covered. A qualification limits or conditions what the offer covers." },
  { name: "Leveled low", meaning: "The lowest eligible reviewed comparison total, not simply the smallest submitted price." },
  { name: "MEP", meaning: "Mechanical, electrical, and plumbing systems." },
  { name: "N/A", meaning: "Not applicable. In Bid leveling, record a reason and resolve the response. It does not mean unknown." },
  { name: "Procurement / award", meaning: "Procuring means selecting and arranging a trade partner. Award is the decision to give that company the work." },
  { name: "Provisional total", meaning: "The current calculated amount before all eligibility and review checks are necessarily complete." },
  { name: "RFI", meaning: "Request for Information: a question to clarify a missing, conflicting, or unclear project requirement." },
  { name: "RFP", meaning: "Request for Proposal: the client’s invitation and requirements for an offer." },
  { name: "Revision", meaning: "A newer issue of a document or drawing. Check its date and effect on scope and price." },
  { name: "Source / evidence", meaning: "The actual drawing, specification, proposal, or quote supporting a decision. A sample reference is not verified evidence." },
  { name: "Specification / spec matrix", meaning: "Specifications are written requirements for products and installation. A spec matrix organizes those requirements into a review table." },
  { name: "Takeoff", meaning: "A measurement or count of work from drawings, such as wall length or floor area—not necessarily its price." },
  { name: "Trade", meaning: "A specialist work area, such as demolition, concrete, steel, or electrical." },
  { name: "Turnover", meaning: "Handing the estimate, scope decisions, risks, and documents to the team that will deliver the project." },
  { name: "Unit cost", meaning: "Price per unit. Quantity × unit cost gives a line amount; check what the rate includes." },
  { name: "Variance", meaning: "The difference between two amounts. Bid leveling uses reviewed low minus budget: positive means over budget. Budget summary uses budget minus forecast: negative means over budget. Check the page's convention." },
  { name: "Y / N / P", meaning: "Yes—included; No—excluded; Partial—only some included. Blank means unknown. L is not a response option in this app." },
].sort((a, b) => a.name.localeCompare(b.name));

export function searchManual(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return manualGuides.filter(guide => {
    const text = [guide.title, guide.purpose, ...guide.steps, ...guide.terms.flatMap(t => [t.name, t.meaning]), guide.example, guide.reality].join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function manualMarkdown() {
  const articles = manualGroups.flatMap(group => manualGuides.filter(guide => guide.group === group));
  return ["# Structor — website instruction manual", "A plain-language guide to the current local app. Working features and preview limitations are explained per page.",
    ...articles.map(g => `## ${g.title}\n\n${g.purpose}\n\n### How to use it\n\n${g.steps.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}\n\n### What the words mean\n\n${g.terms.map(t => `- **${t.name}:** ${t.meaning}`).join("\n")}\n\n### Example\n\n${g.example}\n\n### What works in this version\n\n${g.reality}`),
    `## Glossary\n\n${glossary.map(t => `- **${t.name}:** ${t.meaning}`).join("\n\n")}`,
  ].join("\n\n");
}

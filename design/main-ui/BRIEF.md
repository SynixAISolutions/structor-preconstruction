# Main UI rebuild — brief

Source: Danial's `references/MAIN-UI-brief.docx` (2026-11-26), condensed. The images are in `references/`.

## What Danial asked for (his words, tidied)

**Whole site:** a dark, clean look.

**Screen 1: All projects (main landing, `#projects`).** Where we pick a project, plus small menus. Look like the reference, except
the sidebar and the background picture. For the background use a render of one of our 3D models (see below).

**Screen 2: each project's landing page.** "Copy the UI exactly" (Ref 1). Elements are translucent and let the image show through. Cards
are parallax: they scroll over the background image. The background is an AI "imagined 3D image" made from the project's
drawings and floor plans. At the top, "Hey, Need help?" stays, and "Just ask me anything" is a real text box that starts a conversation
with Structor. Where Ref 1 says "Fitness", show the **project name**, with its **type** (e.g. Preconstruction) under it. Replace the current
sidebar with something like Ref 1's, as a clean dropdown for everything else in the sidebar. Copy the **profile** (top-right avatar) from Ref 1 too.
This fits the plan of one agent controlling the whole website.

## References

**CONFIRMED by Danial (2026-11-26): Ref 1 is the MAIN PAGE (All projects). Refs 2–4 are EACH PROJECT'S LANDING PAGE.** It matches the
doc's layout: image 1 sits under section 1, and images 2–4 sit under section 2. (An earlier reading got this backwards. Don't repeat it.)

| Ref | File | Screen | Use |
| --- | --- | --- | --- |
| 1 | `ref1-fitness-dashboard.png` | **Screen 1: All projects (main page)** → mockup `projects/index.html` (built from variation A) | Take: the icon rail, the centred "Hey, need help?" with the Ask box, the full-bleed image, the translucent cards in a 3 + 2 + tall grid, the pill action row, and the profile at top right. Skip: the fitness content and the athlete photo. |
| 2 | `ref2-zoya-home.png` | **Screen 2: project landing** → mockup `project-landing/b2.html` | Take: the image behind the **whole** page with every element translucent over it (Danial's round-2 note), the top pill nav with dropdowns, the serif title, the stacked card column, and the table. |
| 3 | `ref3-zoya-bedroom.png` | Screen 2 | Same family as Ref 2: the big title over the image and the right-hand frosted cards. |
| 4 | `ref4-nestiq.png` | Screen 2 (variation C, now dropped) | Top pill nav, image panel, right column of cards. |

## Card list for screen 2 (data the app already has)

| Spot in Ref 1 | Becomes | Data source today |
| --- | --- | --- |
| "Fitness / Dashboard" | Project name + "Preconstruction · Community & recreation" | `Project.name`, `status`, `type` |
| "Hey, Need help? / Just ask me anything" | The same text; typing opens Ask Structor with this screen's starter questions | `ask-structor.tsx`, `ask-starters.ts` |
| + button and avatar | New (project / bid package) and the profile menu (avatar, name, role → Settings, Reduce animation, Sign out) | Today the user is the stand-in "Marcel Khoury, Estimator" |
| Pill row | Search screens · bid-deadline date chip · Invite bidders · Export report | `searchScreens`, `Project.due` |
| Activity | **Bid deadline**: days left, bid date, RFI deadline | `Project.due`, `Project.rfi` |
| Sleep | **Bids received**: submitted out of invited, with a bar per trade | `project-overview.tsx` "Bids / invited", "Submitted bids" |
| Heart | **Scope & bid forms**: published bid forms out of scope requirements | `project-overview.tsx` "Published bid forms", "Scope requirements" |
| Wellness | **Budget vs planning value**: total and over/under, with a trend line | budget totals (`lib/budget.ts`), `Project.value` |
| Focus | **Trade package pulse**: status per trade package | `project-overview.tsx` "Trade package pulse" |
| Tall gauge | **Project completion %**: open tasks by area, waiting on others | `project-health.tsx` "Project completion" |
| (extra, swappable) | Open document issues & RFIs; Bought out | `project-overview.tsx` |

Sample project for the mockups: **Project 1** (id `jelleff`), Washington, DC · Community & recreation · Preconstruction ·
planning value $33,328,991 · 26,500 sq ft · bids due 2026-02-02 · RFIs due 2026-01-20 · CM at-risk · team Marcel Khoury (Estimator), Chris Taylor (Project executive).

## Screen 1 card list (All projects)

- Top: "Hey, need help?" + "Just ask me anything" (Ask Structor, across all projects).
- Pills: search · All / Preconstruction / Design development / Bidding (`PROJECT_TABS`) · New project.
- Frosted project tiles: render thumbnail, name, type · work type, location, status badge, planning value, sq ft, next bid deadline.

## Navigation (sidebar replacement)

**Rule from Danial (2026-11-26): no project menus on the main page.** On the main page and the other workspace screens, the rail
shows only the workspace tools (All projects, Subcontractor directory, ratings, aggregate limits, Estimator workload, Unit cost
database, AI memory) plus Settings, as bare icons with labels on hover. Project menus (Preconstruction, Contracts & procurement,
Operations) appear only inside a project, as B2's pill bar. The text below is the original plan; the main page part is superseded.


37 screens: WORKSPACE (7), PRECONSTRUCTION (~21, with sub-sections Subcontractor outreach / Preconstruction budget / 3D model studio),
CONTRACTS & PROCUREMENT (5), OPERATIONS (2), plus Settings and the subcontractor/architect preview views. The rail has one icon per group, and
clicking one opens a frosted dropdown listing that group's screens under their section headings. Labels, groups and order come from
`lib/screens.ts` unchanged.

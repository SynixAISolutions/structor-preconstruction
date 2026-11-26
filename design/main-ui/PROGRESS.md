# Main UI rebuild — progress log (read this first)

**Any Claude account picking this up: read this whole file, then `BRIEF.md`, then continue from "Next step".**
Update the "Status" and "Log" sections after every step, so the next account can always resume.

## Where everything is

| What | Where |
| --- | --- |
| Branch | `ui/dark-main-ui` (from `main` @ `3bb8652`) |
| Worktree (work here, not in the main checkout) | `C:\structor-preconstruction\.claude\worktrees\ui-dark-main-ui` |
| This log + brief | `design/main-ui/PROGRESS.md`, `design/main-ui/BRIEF.md` |
| Danial's reference images + original brief (.docx) | `design/main-ui/references/` |
| Design mockups (static HTML, no build step) | `design/main-ui/project-landing/` (screen 2), later `design/main-ui/projects/` (screen 1) |
| Preview | `.claude/launch.json` in the worktree → config `main-ui-mockups` (python static server on port 4321). Open `http://127.0.0.1:4321/design/main-ui/project-landing/` |

The main checkout (`C:\structor-preconstruction`) is on Core dev's branch `core/one-reader`. **Do not switch it or edit it.**
Several other Core and Codex worktrees are active. Stay in this worktree.

## Rules (from AGENTS.md — they bite)

- We are **UI dev**. We own `app/app/page.tsx`, `app/app/ui/*.tsx`, `app/app/ui/*.css`, `app/app/globals.css`, and `app/public/**`.
  We **do not edit** `app/lib/**`, `app/app/api/**`, `lib/screens.ts` (nav labels and groups), or the check scripts.
  If a screen needs new data, write the request under "Requests for Core dev" below rather than adding it.
- Drawings-to-3D is Core dev's end to end. Never hand-draw model geometry. AI-generated per-project background renders are a **Core dev feature** (see Requests).
- Commit author email must be `tools@synixsolutions.io`. Check `git config user.email` in this worktree before the first commit; it currently shows a GitHub noreply address.
- Never push or merge to `main` (it auto-deploys the review link). Push the branch only when Danial asks.
- Before merging, the gate is: from `app/`, `pnpm check`, `node node_modules/typescript/bin/tsc --noEmit`, `pnpm build`.

## Workflow Danial asked for (from a video he shared, 2026-11-26)

1. One screen at a time.
2. References with TAKE/SKIP notes (see `BRIEF.md`).
3. **Three variations, one direction per reference**, with the same content and data in each. Only layout and treatment differ.
4. Danial art-directs. Iterate on the option he picks (A2, A3…), and apply his small tweaks without redesigning the rest.
5. Motion last, only as he describes it. Keep it subtle in an app.
6. **No app code until he says "lock in <option>".** Then build it in the real app (Next.js 16 / React 19 / lucide-react / plain CSS) and compare the result against the approved mockup until it matches.

## Status

- [x] Step 0: read the brief (`MAIN UI.docx`), mapped the app (37 screens in 4 nav groups), drafted the card list (`BRIEF.md`)
- [x] Step 1: branch and worktree created, references copied in, this log written
- [x] Step 2: **Screen 2 (project landing)**: variations A / B / C as static mockups (`project-landing/index.html` compares them)
- [x] Step 3: Danial picked **both**: **A's design is the MAIN PAGE (All projects)** and **B2 is EACH PROJECT'S LANDING PAGE**. C is dropped.
- [x] Step 4: Main page mockup `design/main-ui/projects/index.html` (A's layout with All-projects content), linked to B2
- [x] Step 4b: **Danial locked in both (2026-11-26)**, with an instruction: "build all of the website first on a shareable link I can share with Marcel and Rawad, then we move it to our actual live web app".
- [ ] **Step 5: build it in the real app on `ui/dark-main-ui`, then push the branch for a Vercel preview link. Never merge to main until Danial says so.** ← in progress (see Build plan)

## Build plan (Step 5)

Approach: build in the real app (not more mockups). Pushing the branch gives a Vercel preview URL that is separate from live; "moving it to the live app" later is just the merge.
**Vercel previews sit behind Vercel Authentication** (a 302 to vercel.com/sso-api). Marcel and Rawad aren't necessarily on the team, so Danial uses **Share** on the deployment in Vercel (or adds them). Don't change Vercel protection settings.

Local dev: from `app/` in this worktree, run `pnpm exec next dev -p 3011 -H 127.0.0.1` (deps installed). The login gate is open locally because `DEMO_PASSWORD` isn't set. Don't copy `.env.local` unless a screen needs server data.

Key facts found:
- A dark theme already exists: 122 rules in `app/app/ui/new-look.css` under `[data-structor-theme="dark"]`, toggled by `app/app/ui/theme-toggle.tsx` (localStorage `structor-color-theme`). Its tokens are the `--nl-*` set (canvas, surface, surface-quiet, line, ink, muted, action, accent-text, accent-wash, positive, caution, danger…). It's cool navy with cobalt buttons.
- The shell is `app/app/page.tsx` (`product-app new-look` root, sidebar, top bar with quick find / theme toggle / notifications / avatar). The All projects screen is the `Projects()` function in page.tsx.

Tasks (tick as done):
- [x] 5.1 `app/app/ui/structor-dark.css` (imported after new-look.css in page.tsx): retuned the dark `--nl-*` tokens to the mockup palette (warm near-black, Structor orange as the action colour, translucent glass surfaces with blur), plus a fixed page background image. **Gotcha:** new-look's dark token block is `html.new-look[data-structor-theme="dark"] .new-look`, so ours uses the same selector, or it loses on specificity.
- [x] 5.2 Background stand-in image: `app/public/backgrounds/project-standin.jpg` (2000×1123, 190 KB): the floor-plan band of Jelleff sheet A2.1, inverted and colorized with Pillow (black #0b0a09 → white #c46a3e). Replace it once real renders exist (Core dev request #1).
- [x] 5.3 Dark by default: `theme-toggle.tsx` treats no saved choice as dark (`savedTheme()` and the initial state). Light is still one click away. (A first-paint flash would need `layout.tsx`, which isn't in our ownership list, so ask first.)
  Verified on `#projects` at 1440×900: warm glass cards, orange buttons, drawing behind.
- [x] 5.4–5.7 **Done 2026-11-26** (details below). New UI file `app/app/ui/main-ui.tsx` (+ `main-ui.css`) exports `GroupNav`, `MainHome`, `ProjectHome`, `AskHero`, `Gauge`, `compactUsd`. page.tsx changes:
  - The root gets `nav-v2 on-global|on-project`.
  - On global screens, A's icon rail renders in `.mu-rail-slot`. On project screens, B2's pill nav renders in the top bar, with the logo moved into the top bar. The sidebar is hidden at ≥901 px and stays as the mobile slide-in menu.
  - `#projects` renders `MainHome`; the old `Projects()` function was removed.
  - **Opening a project now lands on `turnover` (its home), not `information`.** This is a behaviour change, so confirm it with Danial and Marcel.
  - `turnover` renders `ProjectHome` (B2) above the existing `TurnoverView` to-do.
  - The Ask boxes call `openAsk()` (`ui/open-ask.ts`), which opens Ask Structor with the question typed in.
  - ProjectHome reuses the same hooks as the (unused) `project-overview.tsx`: `projectOverview()`, `useBudget`/`useCommitments`/`budgetTotals`, and `useTodoSummary().progress`. The package table shows the 6 most active packages plus "View all N packages".
  - Gate passed: `pnpm check`, tsc, `pnpm build`. Browser checks: 1440×900 and 390×844, with no overflow, no console errors, dropdowns above the glass (the top bar needed `position: relative; z-index: 60`), and a working main page → Project 1 → back.
- [ ] (original plan text, kept for reference) 5.4 Main page = design A in `Projects()`: centred "Hey, need help?" plus an Ask box that opens Ask Structor with the typed question, the pill row (search, status tabs, New project), project cards, portfolio cards, and a "Continue where you left off" tall card.
- [ ] 5.5 Project screens: B2's top pill nav (one pill per SCREEN_GROUPS group, each with a frosted dropdown) replaces the sidebar; the main page uses A's icon rail.
- [ ] 5.6 Project landing = B2, the screen a project opens on (currently "Preconstruction to-do"/overview). Build it with the data `project-overview.tsx` and `project-health.tsx` already use.
- [ ] 5.7 Gate (`pnpm check`, tsc, `pnpm build`), plus desktop and 390px checks in the browser.
- [x] 5.8 Committed `e6b1b81` with `git -c user.email=tools@synixsolutions.io commit …` (AGENTS.md requires that author; the repo config was **not** changed and still shows a GitHub noreply address). Pushed `ui/dark-main-ui` to origin, which triggers a Vercel **preview** only, never production. The preview URL is under "Preview link" below.

## Preview link

- **Latest** branch preview (commit `40331f0`, polish round, built OK 2026-11-26): https://structor-preconstruction-enu7960x3-tools-3633s-projects.vercel.app
- Earlier preview (commit `e6b1b81`, first build): https://structor-preconstruction-cag10198d-tools-3633s-projects.vercel.app
  Each new push makes a new deployment URL. Find the latest with `gh api "repos/SynixAISolutions/structor-preconstruction/deployments?sha=$(git rev-parse HEAD)"` and then its `/statuses`.
- It sits behind Vercel Authentication. To share it with Marcel and Rawad, Danial opens the deployment in Vercel and uses **Share** (or adds them to the team). The app's own workspace password still applies after that.

## Not done yet / next

- ~~Polish the remaining screens~~ **Done 2026-11-26 (round "polish the rest, nothing overlapping")**: see the Log. Re-run the audit after any UI change (how-to in the Log).
- **Real background renders** (Core dev request #1). Today every project shows the Project 1 stand-in.
- **Confirm with Danial:** opening a project now lands on its home rather than Project information.
- **Light theme:** still works, but the new screens were designed dark-first. Check it if anyone uses light.
- **Going live = merging `ui/dark-main-ui` into main**, only when Danial says so, and after the gate passes again on a fresh merge with main.
- [ ] Step 5: lock in, then implement in `app/` (dark theme for these two screens, rail + dropdown nav, profile menu, Ask box wired to Ask Structor)
- [ ] Step 6: roll the dark theme out to the remaining screens (separate decision)

## Next step

**Waiting on Danial to review the two chosen screens and say "lock in"** (or to give more notes, which become new rounds):
- Main page: `design/main-ui/projects/index.html`
- Project landing: `design/main-ui/project-landing/b2.html`

After lock-in:
1. Make round-2 variations of the pick (`a2.html`, `a3.html`…), copying the file so the original stays for comparison, and apply his notes.
2. Log each round under "Log" with what he asked for and what changed.
3. When he says "lock in <option>", go to Step 4 (screen 1, All projects) using the same workflow, then Step 5 (implementation).

Also open with Danial: which reference image is meant for which screen (BRIEF.md has our reading), and a real background render to replace the stand-in drawing.

## Decisions log

- 2026-11-26: Work happens in the worktree on `ui/dark-main-ui` so Core dev's checkout stays untouched.
- 2026-11-26: ~~Ref 1 is for screen 2~~. **CORRECTED by Danial: Ref 1 / design A = MAIN PAGE (All projects). Refs 2–3 / design B2 = each project's landing page.** In his doc, image 1 sits under the main-page section and images 2–4 under the project-landing section.
- 2026-11-26: Stand-in background is project 1's own drawing sheet `app/public/models/jelleff/a1-1.png`, colour-inverted and darkened. Swap it for a real render when Danial sends one.
- 2026-11-26: Sidebar plan: an icon rail with one icon per nav group (Home, Workspace, Preconstruction, Contracts & procurement, Operations, Settings). Clicking a group opens a frosted dropdown of its screens. This is presentation only; `lib/screens.ts` is unchanged.

## Requests for Core dev (do not build these ourselves)

1. A per-project hero/background image field and its storage, plus the AI "imagined 3D render from the floor plans" generation route. Until then the UI falls back to a darkened drawing sheet.
2. If the All projects cards should show per-project completion % and bids received, those need exposing per project (today they are computed only for the active project).

## Log (newest last)

- 2026-11-26: Read the brief, the AGENTS.md ownership rules, `lib/screens.ts`, `lib/projects.ts`, `project-overview.tsx`, `project-health.tsx` and `ask-structor.tsx`. Created the worktree. Wrote BRIEF.md and this file.
- 2026-11-26: Built `project-landing/shared.css` (tokens, glass cards, pills, menus) and `mock.js` (nav copied from screens.ts, SVG charts, dropdown and profile menus, Ask box toast, background parallax). **Variation A (`a.html`) done** and checked at 1440×900 in the browser pane: 3 + 2 + tall grid, rail dropdown working, extra row (next moves / issues / team) below the fold so the parallax shows. Known nits for iteration: the rail scrolls away (make it sticky?), and the Preconstruction dropdown is long (two columns?).
- 2026-11-26: **Variations B (`b.html`, Refs 2/3) and C (`c.html`, Ref 4) done**, plus `index.html` (each option next to its reference). Same data in all three. Checked at 1440×900 and 390×844: no horizontal overflow on any page, all lucide icon names valid, dropdown and profile menus working. Fixes made: the gauge SVG was too short (tick overflow), and B's table widened the mobile page (`.b-grid > * { min-width: 0 }`). Nothing committed yet.
- 2026-11-26: **Danial likes A and B; C is out.** His note on B: "look at how the bg is in the example: it extends across the whole bg, and all the elements on the page are translucent so the bg seeps through them." → Made **`b2.html`** (B is kept for comparison). Changes: the image is now the fixed full-page `.bg` with parallax, zoomed to 230% on the plan area so the sheet notes are out of frame; the render panel lost its own box and is an open window onto the page background; the glass is more translucent (`--glass` .40, blur 16px), as are the Ask pill and the nav pills; and the shading is lighter so linework shows behind the left cards and the table. Added B2 to `index.html`. Checked at 1440×900: no horizontal overflow.
- 2026-11-26: Danial confirmed **A = main page, B2 = each project's landing page** (an earlier misreading swapped them, and he was rightly annoyed; BRIEF.md is now corrected). Built **`projects/index.html`** from A:
  - Brand "Structor / Preconstruction workspace"; the centred Ask box works across all projects.
  - Pill row: search (expands), the PROJECT_TABS filters (working), and New project.
  - Row 1 is the 3 sample projects as cards (planning value, stand-in thumbnail, location, sq ft, bid date). Project 1 links to `b2.html`.
  - Row 2: Portfolio planning value ($72.4M, split bar) and Bid days (a 2026 timeline).
  - Tall card: "Continue where you left off", with Project 1's readiness and an Open project button.
  - Below: Subcontractor directory, Estimator workload, AI memory.
  - The rail's project-group dropdowns apply to the last-opened project (header "· PROJECT 1").
  - `mock.js`: added `split` and `year` charts; `<body data-current>` marks the open screen; menu links to existing mockups; `#` links show a toast instead of jumping.
  - `b2.html`: the wordmark now links to the main page.
  - Checked at 1440×900 and 390×844: no overflow, icons valid, filters and search working, main → Project 1 → back working.
- 2026-11-26: **Polish round** (Danial: "polish the rest, make sure everything is clean and not overlapping anything").
  - Built **`design/main-ui/tools/audit.js`**, a browser audit. It walks every screen by hash and flags light leftovers, unreadable dark text, overlapping text, text spilling out of its box, and sideways page scroll. It skips what isn't painted: screen-reader-only text, closed `<details>` groups, and anything clipped by a scrolling or folded container.
  - How to run it: serve the worktree (`python -m http.server 4321 --bind 127.0.0.1 --directory <worktree>`), then on the app run `const s=document.createElement('script');s.src='http://127.0.0.1:4321/design/main-ui/tools/audit.js?v='+Date.now();document.head.append(s)`, then `await __audit(["projects","turnover",…], 1300, {ignore:null})`. Keep batches to ~10 screens, because the browser tool times out at 45s.
  - Found and fixed:
    - (1) **Ask Structor and Record feedback floated over content** on 12 screens. They now dock as two round buttons in `.mu-launcher-slot` at the end of the top bar. The Ask launcher is portaled to `<body>`, so its rules target `html.new-look > body > .ask-launcher`, and its offsets mirror product.css's top-bar padding (32px, then 24px at ≤1200px, then 14px at ≤700px; height 66 or 59).
    - (2) **The hidden sidebar still held its 238px grid column** on a direct page load. The grid is now one column when nav-v2 is on.
    - (3) **The project top bar wrapped to two rows at 1440px.** Fixes: the "Saved for your team" text is now dot-only, Quick find is icon-only below 1400px, pill icons are hidden below 1300px, the pills don't wrap, and **below 1100px the original sidebar takes over** (the rail/pill nav and topbar logo only show at ≥1101px).
    - (4) Drawing Flip's sheet controls are now dark glass (the sheet itself stays white).
    - (5) Schedule phase notes were dark on dark.
    - (6) Quantity takeoffs rows were white cards at ≤700px.
    - (7) The Project information value was dark green on dark.
  - Final result, all 38 screens: **clean at 1440×900 and 390×844**, and the key screens are clean at 1024×768 (original sidebar). The only light items are intentional: the active rail button (white, as in design A), the CSS 3D building roof on Project information, and the contract preview paper on Contracts. Top bar checked at 1920, 1440, 1360, 1300, 1200, 1101, 1024, 800, 700 and 390: always one row, launchers in the slot, no sideways scroll. Gate passed.
- 2026-11-26: **Danial's review of the polished preview**:
  - (a) "What are the project buttons and navs doing here on the main screen?" The rail had the last-opened project's Preconstruction, Contracts and Operations dropdowns. **Fixed:** `GroupNav` now dispatches to `WorkspaceRail` (global screens: the 7 workspace tools as bare icons plus Settings, with a `data-tip` hover/focus label, and workload/unit-costs given distinct icons via `RAIL_ICON`) or `ProjectPills` (project screens, unchanged). This is a rule in BRIEF.md now.
  - (b) "Why isn't this transparent?" (the tall "Continue where you left off" card): its `::before` painted its own zoomed copy of the image, which read as an opaque panel. **Removed**, so it's plain glass now.
  - Both landing pages (`.mu-main`, `.mu-home`) now use the lighter glass from mockup B2 (`--sd-glass-landing: rgba(26,23,20,.42)`, blur 16px, dark theme only). Working screens keep the denser glass for readable tables.
  - The round button on the right edge in his screenshot isn't ours (no app element sits there). It's Vercel's preview toolbar, shown on preview links to people signed in to Vercel.
  - Re-audited the main page, the workspace screens and the project home at 1440, 1101×768 and 390 (clean apart from the intended white active rail button). Gate passed.
  - Note for audits: the rail's active fill fades in over 0.18s, and in a hidden browser pane the fade sits at frame 0, so read colours with `transition: none` if one looks wrong.
- Preview tip: the browser pane's `preview_start` may read the wrong folder. Run `python -m http.server 4321 --bind 127.0.0.1 --directory <worktree>` in the background and navigate to `http://127.0.0.1:4321/design/main-ui/project-landing/a.html`.

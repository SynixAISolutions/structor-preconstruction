# New look demo (`demo/new-look`)

A separate demo of Structor with a calmer card layout, purposeful motion and a small character for
Ask Structor. It is for showing Marcel's boss. It is **not** the live site: it lives on the branch
`demo/new-look`, with its own Vercel preview link and its own copy of the database (section 7).
**It keeps Structor's brand.** The inspiration is a short screen-recording reel; its frames are in
`references/new-look-video/`.

> **For Claude:** read this file and look at the frames in `references/new-look-video/` before any UI
> work on this branch. The frames show **feel and motion only**. Colours, logo and type come from
> Structor (section 2), never from the video. Stills can't show movement, so section 4 spells it out.
> Read `AGENTS.md` too: its file ownership and commit rules apply here.

---

## 1. What we take from the reference, and what we don't

| Take | Leave |
|---|---|
| Calm "bento" cards, generous spacing, few borders | Their greige/sage palette and blue-violet orb |
| Content that settles in: placeholder cards first, then blurred → sharp | Their white floating pill sidebar (Structor keeps its navy rail) |
| Numbers counting up, chart lines drawing, rings filling (home screens only) | Their pages (wallet, properties) and copy |
| A character that guides loading, greets once, then docks into the assistant button | Their assistant's name ("Sage") |
| Assistant panel that slides in from the right while the page makes room | Motion on every screen |

---

## 2. Brand (unchanged)

From `app/app/globals.css`:

| Token | Value | Use |
|---|---|---|
| `--nav` / `--nav-2` | `#102235` / `#172d42` | Sidebar (note: `.product-sidebar` in `product.css` still hard-codes `#15282f`) |
| `--canvas` | `#f4f6f8` | Page background |
| `--paper` | `#ffffff` | Cards and panels |
| `--ink` / `--muted` | `#142233` / `#667384` | Text / secondary text |
| `--line` / `--line-soft` | `#d8dee6` / `#e8ecf1` | Hairlines |
| `--accent` / `--accent-dark` | `#f05a22` / `#d94710` | Main action, and the orb |
| `--green` / `--amber` / `--red` | `#16864b` / `#a76100` / `#b92e2e` | Status, always with words too |
| `--selected` | `#eaf3fb` | Selected rows |

Logo stays: the three-bar logomark, "structor" with the orange dot, and the AI badge. Type stays Inter or the system sans.

**Within the brand, for the new feel:** card corners 18–20px (from 12–14px); softer, wider shadows
instead of borders on the home screens; more padding and air on home screens; orange kept for the one main
action per screen and the orb, so it stays special.

---

## 3. The orb: Ask Structor's face

Ask Structor already exists (`app/app/ui/ask-structor.tsx`, classes `.ask-launcher` / `.ask-panel`), with
starter questions, proposed changes you can apply or undo, and saved tasks. The orb is a new face for it, not
a new feature.

**Look:** a glossy sphere (about 40px on the page, 56px in the panel), radial gradient
`#ff8a4c → #f05a22 → #d94710`, a soft white highlight at the top left, and a faint warm glow. The face is two
small white pill-shaped eyes, nothing else. (Alternative if orange feels loud: a navy `#172d42` sphere with an
orange glow and orange eyes.)

**Expressions** (only the eyes change): idle with a blink every 3–5 s · happy `^ ^` when it speaks or a job
finishes · thinking (eyes glance aside) while it works · looking (eyes follow the cursor a few px).

**Where it shows up in Structor:**
1. **First visit of the day, Preconstruction to-do:** it floats in, drifts once across the page while the
   cards settle, says one line ("I'm Structor. Ask me anything about this project."), then shrinks into the
   Ask Structor launcher. Once per person per day, never on every load.
2. **AI runs** ("Read every trade", the scope run after an upload): this is its main job. It sits in the
   run's progress area with thinking eyes and a status line, e.g. "Reading Waterproofing · 14 of 36". Happy
   eyes when the run ends. The longest wait in the app becomes the most alive moment.
3. **Contextual entry points:** "Ask Structor about this trade" on trade cards in Scopes & bid forms.
4. **Suggested questions per screen** in the panel, instead of one fixed list. Examples: to-do: "What's left
   before bids go out?" · Scopes: "Which trades have the fewest scope items?" · Leveling: "Who is the
   apparent low bidder on each trade?"
5. **Opening the panel:** the launcher grows into the panel from the right; on desktop the page makes room
   instead of being covered.

---

## 4. Motion: where, and where not

**Yes:** page changes, the home screens (All projects, Preconstruction to-do), loading and AI-run states,
Ask Structor.
**No:** Bid leveling, Budget summary, Scope matrix, the drawing viewer, the 3D screens, tables and forms. Those stay instant and still: estimators scan numbers there.

**Home-screen entrance** (about 1.2 s in all, never blocks a click):

| t | What happens |
|---|---|
| 0.00 s | Sidebar and header stay put. Old content fades out (150–200 ms). |
| 0.10 s | New title and subtitle come into focus (blur 6px → 0, opacity 0 → 1). |
| 0.15 s | Placeholder cards appear in their final places, 60 ms apart, left to right, top to bottom. |
| 0.40 s | Real content replaces each placeholder, slightly blurred, sharpening over about 350 ms in the same order. |
| 0.50 s+ | Headline numbers count up (about 1 s, ease-out); chart lines draw left to right; progress rings fill. |

Default easing `cubic-bezier(.22,1,.36,1)`. Hover: cards lift 3–4px. Press: buttons scale to 0.97.

**Performance rules:** animate only `transform` and `opacity`; blur only on small elements (titles, cards),
never on big tables, drawing canvases or the 3D view. Structor has already hit Chrome's memory limit on large
drawing sets.

**Reduced motion:** the existing Settings → Appearance "Reduce animation" toggle and the system setting turn
off blur, drift, float and count-up; numbers show their final values, and changes are simple fades.

**Tools:** CSS transitions and small hooks first (count-up, an in-view trigger). Adding the `motion`
library (the reel uses it) means editing `package.json`, which `AGENTS.md` doesn't assign to either agent,
so it needs Danial's yes first.

---

## 5. Demo screens

1. **Shell:** navy sidebar (kept), header with a search pill "Search or ask Structor…", and the new card style.
2. **All projects.**
3. **Preconstruction to-do** (a project's home): the orb's greeting.
4. **Project files → Read every trade:** the orb during the AI run.
5. **Scopes & bid forms:** light touch, plus "Ask Structor about this trade".
6. **Ask Structor panel.**

The other screens only pick up the token-level changes (corners, shadows), with no layout changes.

---

## 6. How it's built, so `main` keeps merging in cleanly

- New-look styles go in **new files**: `app/app/ui/new-look.css`, loaded last and scoped under a `.new-look`
  class on the shell, and `app/app/ui/structor-orb.tsx` (plus its CSS) for the orb. Existing files change as
  little as possible, so work landing on `main` merges into the demo without conflicts.
- Ownership per `AGENTS.md`: the UI files belong to UI dev; the read-only switch (`app/lib/**`,
  `app/app/api/**`) belongs to Core dev. Danial decides which agent does which part.
- Commit author email `tools@synixsolutions.io`. The gate (`pnpm check`, `tsc --noEmit`, `pnpm build`)
  passes before every push. **The demo is never merged into `main`** without Danial's explicit OK.

---

## 7. Demo environment

Checked on 20 Nov 2026. Today every Vercel preview shares the live database (`DATABASE_URL` is set for
"Production and Preview"), the live file store (`BLOB_READ_WRITE_TOKEN`, all environments) and the same
Claude key. So the demo needs its own setup:

| Piece | Demo setup |
|---|---|
| Link | Branch `demo/new-look` gets its own Vercel preview link. Previews need a Vercel login, so Marcel's boss gets a **Shareable Link** from the deployment page, then the app's demo password. |
| Database | A Neon branch `demo`, copied from live (Neon project `rapid-scene-95240098`, free plan). In Vercel, a Preview `DATABASE_URL` **scoped to the git branch `demo/new-look`** points at it. The code reads `DATABASE_URL` before `POSTGRES_URL`, so that one variable is enough. |
| Files | Same Blob store (`structor-page-feedback`), but **read-only on the demo**: a switch such as `STRUCTOR_DEMO_READONLY=1`, scoped to the branch, makes every route that writes or deletes in Blob answer "This is the demo; files aren't changed here". That covers uploads, renaming or deleting files, Delete project, markups, page text and OCR saves, subcontractor bid uploads, clarifications, voice feedback and document assets. Without it, Delete project in the demo would delete the live project's drawings (`removeProject` in `app/lib/project-files-store.ts`). |
| AI | The same `ANTHROPIC_API_KEY`, unless `ANTHROPIC_API_KEY_staging` (set in Vercel, not read by the code) is a separate key with its own limit; then scope it to the demo branch as `ANTHROPIC_API_KEY`. The copied projects already hold their AI results, so only Ask Structor spends credits. |
| Outbound | Nothing to switch off: no DocuSign or Google keys are set, and the app sends no email. |
| Before each showing | Reset the Neon `demo` branch from its parent, so the demo has the latest live data. |
| Staying current | Merge `main` into `demo/new-look` regularly. |

---

## 8. Reference frames (`references/new-look-video/`)

| File | Shows |
|---|---|
| `01-loading-skeleton-with-mascot.png` | Placeholder cards with the orb drifting over them |
| `02-dashboard-loaded.png` | Settled dashboard, orb with its one-line greeting |
| `03-mascot-introduces-itself.png` | Page cleared during a page change, orb and greeting |
| `04-page-transition-blur.png` | New page title coming into focus over placeholders |
| `05-wallet-page.png` | A settled second page, assistant docked bottom right |
| `06-properties-loading.png` | Cards coming in blurred, in a stagger |
| `07-properties-page.png` | Settled card grid |
| `08-ai-chat-panel.png` | Assistant panel open, the grid reflowed to make room |
| `motion-*.png` | Frame strips a quarter second apart (read left to right, top to bottom) |

The source is a low-resolution social video: match the feel, not exact pixels.

---

## 9. Open questions

1. Orb colour: orange (proposed) or navy with an orange glow?
2. Add the `motion` library, or stay with CSS?
3. Which agent builds which part (UI dev / Core dev)?
4. Should PR previews also get their own database copy, so testing a preview stops touching live data?

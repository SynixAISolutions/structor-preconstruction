# Handoff to ChatGPT: build out Structor's new look

You are taking over the UI of the **new-look demo** of Structor. The first build is done and live. Your job is to
finish it, screen by screen, in the same style. Read this file, then `NEW_LOOK_DEMO.md` (the design brief), then
`AGENTS.md` (repo rules).

## Message to paste into ChatGPT / Codex

> Work in `C:\structor-preconstruction` on the branch `demo/new-look` (never `main`). Read `NEW_LOOK_GPT_HANDOFF.md`,
> `NEW_LOOK_DEMO.md` and `AGENTS.md` first, and look at the images in `references/new-look-video/` (the
> inspiration) and `references/new-look-build/` (what is built). Do Milestone 1 of the handoff. Put new styles in
> `app/app/ui/new-look.css` and new components in new files; touch existing files only with small hooks. Run the
> gate from `app/` (`pnpm check`, `node node_modules/typescript/bin/tsc --noEmit`, `pnpm build`), check the screens
> at 1440 px and 390 px wide, then commit with author email `tools@synixsolutions.io` and push `demo/new-look`.
> Don't touch `app/lib/**`, `app/app/api/**`, Vercel or Neon settings.

---

## 1. Where everything is

| What | Where |
|---|---|
| Repo | `C:\structor-preconstruction` (Next.js 16 + React 19, plain CSS, lucide icons; the app is in `app/`) |
| Branch | **`demo/new-look`**. `main` is the live site Marcel uses: never commit or merge there. |
| Demo link | `https://structor-preconstruction-git-demo-new-look-tools-3633s-projects.vercel.app` (Vercel login, then the app password). Every push to the branch redeploys it in about a minute. |
| Run locally | from the repo root: `pnpm --dir app dev`, open `http://127.0.0.1:3010`. Open "Project 1" on All projects, then `#turnover`. |
| Design brief | `NEW_LOOK_DEMO.md` (brand, orb, motion rules, screens, progress) |
| Inspiration frames | `references/new-look-video/` (from a social-media reel; feel only, never its colours) |
| Current build | `references/new-look-build/` (screenshots, a recording and a frame strip; list in section 4) |

## 2. How the new look is built (keep to this)

It is a **layer**, so the live app's files stay nearly untouched and `main` keeps merging into the demo.

| File | Role |
|---|---|
| `app/app/ui/new-look.css` | **All** new-look styles. Every rule starts with `.new-look`. Add yours here. |
| `app/app/ui/structor-orb.tsx` + `.css` | The orb: `<StructorOrb size={40} mood="idle" \| "happy" \| "thinking" float look/>` |
| `app/app/ui/orb-greeting.tsx` | Once-a-day greeting on the to-do; also puts `new-look` on `<html>` |
| `app/app/ui/count-up.tsx` | `<CountUp value={n}/>` for headline numbers |
| `app/app/ui/ask-starters.ts` | Suggested Ask Structor questions per screen |
| Hooks in existing files | `page.tsx` (class `new-look`, `data-screen={screen}` on `.page-enter`, `<OrbGreeting/>`), `ask-structor.tsx` (orb, hello, per-screen questions, `html.ask-open`), `ai-run-card.tsx` (orb), `todo-ui.tsx` + `project-health.tsx` (CountUp) |

Things to know:
- **Ask Structor is drawn straight into `<body>`**, outside the shell. That is why `.new-look` is also on `<html>`, and
  why colours there use `--nl-canvas`, not the shell's `--ui-canvas`.
- **Target one screen** with `.new-look [data-screen="scopes"] …`. Screen ids are in `app/lib/screens.ts`.
- **Brand stays:** navy sidebar `#15282f`/`#102235`, orange `#f05a22` for the one main action and the orb, canvas
  `#f5f6f4`, Inter. Card radius 20px (`--nl-radius`), soft shadow (`--nl-shadow`), easing `--nl-ease`.
- **No new libraries.** CSS animations and small hooks only (decided by Danial).
- **Motion only** on home screens, page changes, loading/AI states and Ask Structor. **Never** animate tables, Bid
  leveling, Budget, Scope matrix, the drawing viewer or 3D. Animate `transform`/`opacity`; `filter: blur` only on
  small elements.
- **Reduced motion must work:** Settings → Appearance "Reduce animation" puts `.motion-off` on the shell (it already
  kills all animations), and `@media (prefers-reduced-motion: reduce)`. Anything that is hidden until an animation
  shows it (like the tile placeholder sheen) needs an explicit off rule, or it stays hidden.
- **Drive sequences with timers**, not `animation.finished`: browsers can stop drawing frames when nothing changes,
  and `finished` then never fires (that froze the greeting once).

## 3. Animation spec (what exists, copy its timing)

| Moment | What happens | Timing |
|---|---|---|
| Home entrance (to-do, All projects) | header, banner, tiles, cards go `opacity 0, blur 8px, translateY 10px, scale .985` → sharp, one after another; tiles show a grey sheen first | 0.5–0.55 s each, 60 ms apart, all done by ~1 s |
| Headline numbers | count up from 0 (ease-out cubic) | 1 s |
| Progress ring | arc draws in (existing) | 0.9 s |
| Greeting (once a day, to-do) | orb fades in small, arcs to a spot above the banner, says its line with happy eyes, then flies into the Ask Structor button, which pops | 1.5 s arrive · 2.6 s line · 0.8 s dock |
| Orb idle | blinks every ~4.8 s, eyes follow the pointer a few px | |
| Orb thinking | eyes glance up-right, orb breathes (scale 1 → 1.05) | 1.6 s loop |
| Ask Structor panel | full height on ≥ 900 px, slides in from the right; the page gets `margin-right: 408px` | 0.38 s |
| Cards hover | lift 3–4 px, bigger shadow | 0.25 s |

## 4. Reference images

`references/new-look-video/` (the inspiration):
- `02-dashboard-loaded.png`, `05-wallet-page.png`, `07-properties-page.png`: the card style and calm
- `01-…`, `04-…`, `06-…`: content coming into focus over placeholders
- `08-ai-chat-panel.png`: the panel making room
- `motion-a/b/c-*.png`: frame-by-frame strips, 0.25 s apart

`references/new-look-build/` (what is built now, local sample data "Project 1"):
- `desktop-00-before-without-layer.png`: the same screen with the layer switched off (the "before")
- `desktop-01-all-projects.png`, `desktop-02-todo-settled.png`: the two home screens, settled
- `anim-all-projects-entrance.mp4` / `.gif` / `-strip.png`: the entrance in real time and as a numbered strip
- `desktop-05-orb-moods.png`: idle, mid-blink, happy, thinking
- `desktop-06-ai-run-card.png`: the AI run card with the thinking orb (sample text)
- `desktop-07-reduced-motion.png`: everything shown at once, no greeting
- `phone-01-todo.png`: 390 px

## 5. Milestones (one at a time; stop and show Danial after each)

**Milestone 1: finish the first build**
1. Scopes & bid forms: an "Ask Structor about this trade" button on each trade (opens Ask Structor with that
   question; add a small `openAsk(question)` event the panel listens to, in a new file).
2. AI run card: when a run finishes, the orb turns happy for 2 s and the card says "Done: N scope items added".
3. Search pill: in the Quick find box, a typed question offers "Ask Structor: <question>" as the first result.
4. Phone: check the greeting position and the panel at 390 px.

Done when: the gate is green, nothing animates on the screens listed as "never", reduced motion shows everything
at once, and screenshots at 1440 and 390 px look like `references/new-look-build/`.

**Milestone 2: the other project screens get the card style.** Project files, RFP requirements, Bid packages,
Scope review & buyout: rounder cards and spacing only through `new-look.css`, no motion, no layout rewrites.

**Milestone 3: polish for the pitch.** A short guided path: All projects → to-do (greeting) → Project files
("Read every trade" with the thinking orb) → Scopes (ask about a trade) → Ask Structor. Fix whatever looks off.

## 6. Rules that bite

- Commit author email **must** be `tools@synixsolutions.io` (Vercel refuses other authors). If
  `git config user.email` shows something else, commit with `git -c user.email=tools@synixsolutions.io commit …`.
- Only push `demo/new-look`. Never push or merge `main`, never "Promote to Production".
- Don't touch `app/lib/**`, `app/app/api/**`, the gate scripts, Vercel or Neon. The demo's data safety depends on
  them (own database copy, file store read-only: `NEW_LOOK_DEMO.md` §7). If you need data or an action that
  doesn't exist, ask Danial.
- The demo's file store is read-only on purpose: uploads and deletes there show "This is the Structor demo…".
  That's correct, not a bug.
- Ask Structor answers spend real AI credits; don't run "Read every trade" on the demo without Danial's OK.

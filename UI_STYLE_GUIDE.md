# Structor UI style guide

## Direction

An architectural workspace: calm, precise, and dimensional. A dark navigation rail anchors the interface, while warm white working surfaces make drawings, numbers, and decisions easy to scan. The overview uses an illustrated 3D building, creating a connection to the physical project.

This iteration is a complete frontend preview. New modules use representative content and local UI interactions. The existing Excel bid-leveling workspace remains available. No automated drawing interpretation, proposal extraction, account provisioning, message delivery, or contract execution is added.

## Visual foundations

| Element | Specification |
| --- | --- |
| Main canvas | Warm off-white `#f5f6f4` |
| Navigation | Deep blue-green `#15282f` |
| Primary action | Terracotta orange `#e9703e` |
| Text | Ink `#192a36`; secondary labels in muted blue-gray |
| Success / reviewed | Sage green, with a written status |
| Review / draft | Warm amber, with a written status |
| Working panels | White, a 1px soft border, 12–14px corners, restrained shadows |
| Type | Inter when available; Segoe UI / system sans-serif fallback; no font download required |
| Headings | 26–32px page titles, 14–19px panel/dialog headings |
| Body and data | 11–13px interface text; smaller labels only for secondary metadata |
| Spacing | 4px base rhythm; 16–24px panel padding; 18–24px gaps |
| Icons | Existing Lucide line icons; 16–20px, consistent stroke weight |

## Layout rules

1. Use the persistent sidebar for the product structure, grouped into Workspace, Preconstruction, Bid & Award, and Coordination.
2. Each screen begins with an eyebrow, a clear title, one short description, and its main action.
3. Put summaries above the working area. Use tables for repeated project data and split views for source review.
4. Keep source references close to scope requirements, takeoffs, allowances, and document issues.
5. Represent draft, reviewed, approved, and submitted states with text as well as color.
6. Preserve Excel leveling in its own contained workspace. Wide comparison tables scroll horizontally while scope columns stay visible.
7. Use a slide-in navigation menu on small screens. Stack columns and allow data tables to scroll inside their panels.

## 3D treatment

The project model is native CSS, with an isometric ground plane, separate roof/wall faces, glazing, landscaping, and cast shadows. It is an illustrative model rather than a rendering of an uploaded drawing.

- Perspective: 900px, with a 55° X rotation and −35° Z rotation.
- Layered surfaces: white and sage building forms, one warm orange wing, and soft ground shadows.
- Frosted information card: translucent white, subtle blur, and a small floating movement.
- Portfolio cards lift slightly on hover; contract previews resemble layered sheets.
- Reserve depth for overview/preview surfaces. Editable fields and cost tables stay visually flat and readable.

## Motion

| Interaction | Behavior |
| --- | --- |
| Screen change | 420ms fade with a 12px upward arrival |
| Dialog | 250ms fade, 12px translation, slight scale |
| Buttons | 180ms color/shadow transition; 1px hover lift |
| Project cards | 250ms lift/shadow transition |
| Building model | Slow 10-second drift, a few degrees of rotation |
| Model label | Gentle 7-second vertical float |
| Progress | Short bar/timeline entrance transition |

Honor `prefers-reduced-motion`. Settings → Appearance also includes a Reduce animation toggle. Animations should support orientation and hierarchy; they should never delay an action or block content.

## UI interaction conventions

- Use the shared components in `app/ui/shared.tsx` for panels, buttons, badges, tabs, search, dialogs, and exports.
- Primary actions are orange; secondary actions are outlined white; tertiary actions are text/icon buttons.
- Each icon-only action needs an accessible label. Dialogs support Escape, focus containment, and returning focus to the originating control.
- Search, filters, tabs, forms, drawing selectors, sample approvals, and navigation are interactive previews.
- Label sample datasets and generation examples clearly. Do not describe local drafts as delivered emails, executed contracts, or completed AI analysis.
- Keep presentation-specific or internal development instructions out of the product interface.
- Show the user useful project terminology; explanations belong in the glossary, reachable from every screen.

## File map

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Product shell, overview, projects, information, settings, navigation, glossary |
| `app/ui/product.css` | Shared visual system, 3D model, responsive layout, transitions |
| `app/ui/shared.tsx` | Reusable frontend primitives |
| `app/ui/intelligence.tsx` / `.css` | Documents, scopes, takeoffs, specs, issues, drawings, revisions |
| `app/ui/commercial.tsx` / `.css` | Packages, bidders, portal, budget, allowances, contracts, schedule, messages, turnover |
| `app/leveling-workspace.tsx` | Existing Excel leveling workspace with cost-suggestion preview |
| `UI_FEATURE_COVERAGE.md` | Transcript-to-screen mapping and product boundaries |

## Extending the interface

Add a screen to the typed navigation list and compose it with shared primitives. Keep forms and source evidence within the current workflow. Validate the desktop layout, narrow-screen navigation, keyboard focus, and reduced-motion behavior before adding another visual effect. Backend implementation can then replace each sample workflow independently.

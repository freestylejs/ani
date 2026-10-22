# Documentation Layout Showcase — Verification Result

**Route:** `/en/docs/showcase/layout`  
**Component:** `packages/web/src/components/layout_showcase.tsx`  
**Verification script:** `tests/browser/docs_showcase.mjs`  
**Screenshot:** `.trace/ani_layout_cpc_v1/layout_documentation_showcase.png`

## Surfaces

The documentation page is a separate live fixture, not the landing page:

- E1 Layout Anchor — parent box + anchored child, spring timing, real resize.
- E2 Create Button — shared `layoutId` handoff, compact → expanded.
- E3 iOS Folder — reduced 2D folder expansion and six-app matrix.
- E4 App Store — reduced 2D card → product detail.
- E5 Notifications — `AnimatePresence mode="popLayout"` with `usePresence` and a
  layout group for sibling settling.
- Gallery — grid/list pose with one layout group, no 3D/drag/scroll observer.

## Runtime verification

The page was built with `pnpm --filter @freestylejs/ani-web build`, served with
Next production start, and exercised with Playwright.

```text
BROWSER=chromium node tests/browser/docs_showcase.mjs
BROWSER=firefox  node tests/browser/docs_showcase.mjs
```

Chromium result:

```json
{
  "title": "Layout Showcase",
  "sections": 6,
  "anchor": [190, 280],
  "anchorChild": [70, 98],
  "create": [164, 280],
  "toasts": 2,
  "animations": { "anchor": 3, "create": 5, "folder": 5, "store": 5, "gallery": 10 },
  "gridY": [658.140625, 658.140625],
  "listY": [620.140625, 734.140625]
}
```

Firefox result: the same six sections, 190→280px anchor (child 70→98px),
164→280px create, 2 toasts, the same animation counts, and grid (same row) →
list (stacked). Folder apps are asserted to fit inside the folder surface.

The documentation navbar `/blog` link was corrected to an external route; the
Chromium and Firefox runs now report no console errors and no page errors.

A paused-animation diagnostic (`tests/browser/diagnose_layout_showcase.mjs`)
confirms real intermediate frames: E1 parent 190→283.8→280 with child
70→99.2→98; E2 164→284.9→280; E3 190→296.3→292; E4 detail starts at the
old 117px card and settles at 360px; Gallery tiles 276→776→846px. Spring
overshoot is intentional and settles to the exact CSS final box.

## Scope note

This is a production-styled **bounded B′ showcase**: E1–E5 are reduced 2D fixtures over the public
React layout surface, not full 3D/drag/scroll-observer Motion parity. E3/E4
exercise reduced 2D folder/store composition, not the excluded depth-2 Gallery
engine. WebKit was not available for this Next server host; core WebKit P0–P11
evidence is recorded separately.

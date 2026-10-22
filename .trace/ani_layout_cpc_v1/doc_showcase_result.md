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
  "anchor": [190, 300],
  "create": [156, 260],
  "toasts": 2,
  "animations": { "anchor": 2, "create": 1, "folder": 1, "store": 1, "gallery": 6 },
  "gridY": [658.140625, 658.140625],
  "listY": [620.140625, 734.140625]
}
```

Firefox result: the same six sections, 190→300px anchor, 156→260px create,
2 toasts, the same animation counts, and grid (same row) → list (stacked).

The only console error is the pre-existing docs nav prefetch of `/en/blog`
(actual route is `/blog`); the showcase itself is error-free.

## Scope note

This is a **bounded B′ showcase**: E1–E5 are reduced 2D fixtures over the public
React layout surface, not full 3D/drag/scroll-observer Motion parity. E3/E4
exercise reduced 2D folder/store composition, not the excluded depth-2 Gallery
engine. WebKit was not available for this Next server host; core WebKit P0–P11
evidence is recorded separately.

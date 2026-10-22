# CPC Plan — Final Goal

**Goal:** Implement Ani's Compiled Projection Core in `ani-layout`, pass Motion.dev showcase rows E1–E5 plus the reduced 2D Gallery, and prove it through unit/integration/e2e evidence without changing Core V2.

**Authority:** `packages/layout/ARCHITECTURE_CPC.md` and `.trace/ani_layout_v1/FINAL_LAYOUT_DIRECTION.md`.

**Gate:** no phase advances without its Valid and Checkpoint; no architecture pass is declared before all selected matrix rows and P0–P9 pass.

| Order | Phase | Depends |
| --- | --- | --- |
| 01 | Authority, frame oracle and guards | none |
| 02 | Plan retention, group clock and interrupt recompile | 01 baseline |
| 03 | Layout modes, dependency, LayoutConfig and wait | 02 planner |
| 04 | Depth-1 compiled projection and layoutAnchor | 03 API |
| 05 | Crossfade, depth-2 shared elements and retained layoutId | 04 projection |
| 06 | Radius/caps/perf, E1–E5 and reduced 2D Gallery proof | 05 nested |

# Scope correction — remove board product, prove iOS Native Grade directly

## Authority

This record is created from the **top-level owner's explicit instruction on 2026-10-28**. It
supersedes the earlier orchestration interpretation that turned the phrases "FigJam, draw.io,
tldraw etc" into a requirement to build a separate board/diagram product.

The owner's corrected intent is authoritative:

> ani itself must be completed and objectively proven at iOS Native Grade. A whiteboard/canvas
> framework is not a deliverable and must not be used as substitute proof.

## Drift finding

| ID | Severity | Drift | Evidence | Ruling |
|---|---|---|---|---|
| SCOPE-001 | S1 | `00_plan.md` added a production whiteboard as FINAL GOAL 4 and P6–P8 | Board authority `3bae50a`; H10 brief `3ca6e8c`; no board implementation landed | Remove the deliverable and phases entirely |
| SCOPE-002 | S1 | Product complexity was being used as a proxy for native-grade proof | P1–P4 establish the engine semantics; §11.5/§11.6 define the final frame/performance instrument | Make the complete P1–P5 evidence body mandatory, with P5 as final certification |
| SCOPE-003 | S2 | Release work was numbered P9 only because three unrelated board phases were inserted | No P6–P9 checkpoint artifacts exist yet | Renumber release to P6 and update P9 references |

## Removed current-tree artifacts

- `app/board/ARCHITECTURE.md`
- `.trace/ani_ios_production/briefs/h10.md`
- `00_plan.md` FINAL GOAL 4 whiteboard requirement
- former `p6_board_core`, `p7_board_motion`, `p8_board_product` phases

Their historical commits remain in Git history for auditability; they have no current authority.

## Correct proof boundary

The iOS Native Grade claim must be earned directly by ani:

1. P0–P2 establish the authority, physics and measured-presentation correctness.
2. P3 proves failure transactions, diagnostics, caps, accessibility and hostile lifecycle safety.
3. P4 proves the layout-side direct-manipulation drive seam and hand-off from externally supplied
   gesture offsets/release velocity; it does not claim to implement an entire pointer subsystem.
4. P5 runs the §11.6 native interaction scenes under the independent §11.5 Playwright harness in
   Chromium and WebKit, scores every required frame/metric, and iterates without weakening gates
   until all required rows are green.
5. P6 releases only after the native-grade proof and all carried tribunal findings are closed.

No generic document model, drawing canvas, connector system, persistence stack, minimap, export
pipeline or editor product is required for this proof.

## Non-regression rule

Future agents must not reintroduce a board/canvas product into this program merely because FigJam,
draw.io, tldraw or another production tool is named as a quality reference. Such an application is
out of scope unless a later **explicit top-level owner directive** adds it back.

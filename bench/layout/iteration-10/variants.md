# H19 variant summary (2026-10-29T17:01:57.679Z)

sourceRevision 77cc8f97371d47c2b25412a7242b8ebb6818b116 (H19 working tree on the H17d base); command `pnpm bench:layout --check --runs 5 --out bench/layout/iteration-10/report.json`; load 10.24169921875; cost advisory

## Certification

certified: false
- block: cost fingerprint is advisory
- block: blocked chromium variant s-card@rm-jump: RUN 5.000; G6 3.000
- block: blocked chromium variant s-card@rm-max: RUN 5.000; G1 226.734; G4 196.630
- block: blocked webkit variant s-card@rm-jump: RUN 5.000; G6 3.000
- block: blocked webkit variant s-card@rm-max: RUN 5.000; G1 226.734; G4 196.630
- block: blocked webkit variant s-reorder@rm-jump: G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- block: chromium variant s-card@rm-jump fail (failed G6 3.000, shape.opacity 1.000, shape.radius 20.000, shape.inert 6.000, RUN G6 3 (sheet); manual final tracks 0, holds 0, clock pending 0, clock size 0)
- block: chromium variant s-card@rm-max fail (failed G1 226.734, G4 196.630, RUN G1 226.73435974121094 (sheet-content frame 19); G4 196.63026308247265 (card-title frame 7); manual final tracks 0, holds 0, clock pending 0, clock size 0)
- block: chromium S-BULK cost fail
- block: chromium S-BULK G11 2.131 failed
- block: webkit variant s-card@rm-jump fail (failed G6 3.000, shape.opacity 1.000, shape.radius 20.000, shape.inert 6.000, RUN G6 3 (sheet); manual final tracks 0, holds 0, clock pending 0, clock size 0)
- block: webkit variant s-card@rm-max fail (failed G1 226.734, G4 196.630, RUN G1 226.7344207763672 (sheet-content frame 19); G4 196.6302020473164 (card-title frame 7); manual final tracks 0, holds 0, clock pending 0, clock size 0)
- block: webkit variant s-reorder@rm-jump fail (failed RUN BLOCK G12; G8 3; G8 p95 3 ms, 0 long frames; manual final tracks 0, holds 0, clock pending 0, clock size 0) (blocked G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms))
- advisory: webkit variant s-reorder@rm-max G12 cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit variant s-reorder@rm-ignore G12 cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit variant s-sheet@rm-jump G12 cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit variant s-sheet@rm-max G12 cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit variant s-sheet@rm-ignore G12 cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit scene s-reorder cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit scene s-sheet cost BLOCK (D12 advisory): G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- advisory: webkit S-BULK cost blocked (D12 advisory)
- advisory: webkit S-BULK cost is not valid (D12 advisory)

## chromium variants (140.0.7339.16)

| variant | status | G1 worst | G4 worst | G13 | failed deciding rows | RUN detail | blocked rows |
|---|---|---|---|---|---|---|---|
| s-card@dpr1 (dpr1) | pass | 0.0013 r1 f102 card-title left | 0.0013 r1 f102 card-title left | 0 pass; reverse: 14/14 rects, 14/14 pairs, 9/9 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-card@dpr3 (dpr3) | pass | 0.0013 r1 f102 card-title left | 0.0013 r1 f102 card-title left | 0 pass; reverse: 14/14 rects, 14/14 pairs, 9/9 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-card@rm-jump (rm-jump) | fail | 0.0000 r1 | 0.0000 r1 | 0 pass; close: 11/11 rects, 11/11 pairs, 8/8 computed reads (1 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | G6 3.000; shape.opacity 1.000; shape.radius 20.000; shape.inert 6.000 | G6 3 (sheet); manual final tracks 0, holds 0, clock pending 0, clock size 0 | — |
| s-card@rm-max (rm-max) | fail | 226.7344 r1 f19 sheet-content bottom | 196.6303 r1 f7 card-title bottom | 0 pass; reverse: 14/14 rects, 14/14 pairs, 9/9 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | G1 226.734; G4 196.630 | G1 226.73435974121094 (sheet-content frame 19); G4 196.63026308247265 (card-title frame 7); manual final tracks 0, holds 0, clock pending 0, clock size 0 | — |
| s-card@rm-ignore (rm-ignore) | pass | 0.0013 r1 f102 card-title left | 0.0013 r1 f102 card-title left | 0 pass; reverse: 14/14 rects, 14/14 pairs, 9/9 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-seg@dpr1 (dpr1) | pass | 0.0001 r1 f17 pill right | 0.0001 r1 f17 pill right | 0 pass; tap-4: 2/2 rects, 2/2 pairs, 2/2 computed reads (1 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-seg@dpr3 (dpr3) | pass | 0.0001 r1 f17 pill right | 0.0001 r1 f17 pill right | 0 pass; tap-4: 2/2 rects, 2/2 pairs, 2/2 computed reads (1 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@dpr1 (dpr1) | pass | 0.0002 r1 f44 detail-image left | 0.0002 r1 f44 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 2/2 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@dpr3 (dpr3) | pass | 0.0002 r1 f44 detail-image left | 0.0002 r1 f44 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 2/2 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@rm-jump (rm-jump) | pass | 0.0000 r1 | 0.0000 r1 | 0 pass; back: 602/602 rects, 602/602 pairs, 2/2 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@rm-max (rm-max) | pass | 0.0002 r1 f45 cell-37-image right | 0.0002 r1 f45 cell-37-image right | 0 pass; back: 602/602 rects, 602/602 pairs, 2/2 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@rm-ignore (rm-ignore) | pass | 0.0002 r1 f44 detail-image left | 0.0002 r1 f44 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 2/2 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@dpr1 (dpr1) | pass | 0.0002 r1 f15 body-6 bottom | 0.0002 r1 f15 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 47/47 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@dpr3 (dpr3) | pass | 0.0002 r1 f15 body-6 bottom | 0.0002 r1 f15 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 47/47 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@rm-jump (rm-jump) | pass | 0.0000 r1 | 0.0000 r1 | 0 pass; c3: 86/86 rects, 86/86 pairs, 47/47 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0; §9.4 jump has no planned tracks, so the §4.3 computed set is policy-dependent: c2 35/47 reported as evidence (rect/pair and frame counts are exact) | — | pass | — |
| s-acc@rm-max (rm-max) | pass | 0.0002 r1 f0 body-2 bottom | 0.0002 r1 f12 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 47/47 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@rm-ignore (rm-ignore) | pass | 0.0002 r1 f15 body-6 bottom | 0.0002 r1 f15 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 47/47 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-reorder@rm-jump (rm-jump) | pass | 0.0000 r1 | 0.0000 r1 | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 4/8 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0; §9.4 jump has no planned tracks, so the §4.3 computed set is policy-dependent: reorder-5 4/6, reorder-9 4/8 reported as evidence (rect/pair and frame counts are exact) | — | pass | — |
| s-reorder@rm-max (rm-max) | pass | 0.0000 r1 f18 row-1 top | 0.0000 r1 f18 row-1 top | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 8/8 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |
| s-reorder@rm-ignore (rm-ignore) | pass | 0.0000 r1 f23 row-2 bottom | 0.0000 r1 f23 row-2 bottom | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 8/8 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |
| s-sheet@rm-jump (rm-jump) | pass | 0.0000 r1 | 0.0000 r1 | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 1/1 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |
| s-sheet@rm-max (rm-max) | pass | 0.0001 r1 f91 sheet bottom | 0.0001 r1 f91 sheet bottom | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 1/1 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |
| s-sheet@rm-ignore (rm-ignore) | pass | 0.0001 r1 f92 sheet bottom | 0.0001 r1 f92 sheet bottom | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 1/1 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |

## chromium primary DPR-2 scenes

| scene | status | G1 worst | G13 | failed deciding rows | RUN detail | blocked rows |
|---|---|---|---|---|---|---|
| s-card | pass | 0.0013 r1 f102 card-title left | 0 pass; reverse: 14/14 rects, 14/14 pairs, 9/9 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-seg | pass | 0.0001 r1 f17 pill right | 0 pass; tap-4: 2/2 rects, 2/2 pairs, 2/2 computed reads (1 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo | pass | 0.0002 r1 f44 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 2/2 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-stack | pass | 0.0003 r1 f73 badge-1 top | 0 pass; collapse: 24/24 rects, 24/24 pairs, 12/12 computed reads (12 radius capture + 12 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-island | pass | 0.0006 r1 f17 card-content right | 0 pass; reverse: 8/8 rects, 8/8 pairs, 6/6 computed reads (2 radius capture + 4 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc | pass | 0.0002 r1 f15 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 47/47 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-insert | pass | 0.0001 r1 f14 row-10 bottom | 0 pass; insert: 29/29 rects, 29/29 pairs, 16/16 computed reads (0 radius capture + 16 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-delete | pass | 0.0095 r1 f18 row-5 top | 0 pass; delete-2: 18/18 rects, 18/18 pairs, 3/3 computed reads (0 radius capture + 3 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0; audited non-layout presence reads excluded: 2 rects, 2 styles | — | pass | — |
| s-reorder | pass | 0.0000 r1 f23 row-2 bottom | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 8/8 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |
| s-sheet | pass | 0.0001 r1 f92 sheet bottom | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 1/1 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | — |
| s-bulk | pass | 0.0001 r1 f6 tile-25 right | 0 pass; shuffle: 2000/2000 rects, 2000/2000 pairs, 300/300 computed reads (0 radius capture + 300 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 1, parents 0 | — | pass | — |

## chromium cost

- ok G9-unscrolled: 1.7538071534934818 (median of 5 per-run ratios <= 2)
- ok G9-scrolled: 1.7255410821833577 (median of 5 per-run ratios <= 2)
- ok G9.floor-unscrolled: 0 (exact required counts; no extra read)
- ok G9.floor-scrolled: 0 (exact required counts; no extra read)
- ok G10: 1.1800000667572021 (p95 <= 2 ms)
- FAIL G11: 2.1306375794530803 (p95(engine commits) / p95(floor commits) <= 2)
- ok G11.floor: 0 (exact required counts; no extra read)
- ok G13: 0 (<= 2N rects and 2N layout-size pairs, exactly the computed reads; steady frames read zero)
- ok G12-1: -0.22500014305114746 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- ok G12-10: -0.009999990463256836 ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- ok G13-held: 0 (one rect per live hold per frame, zero offset/style reads, 600 frames)

## webkit variants (26.0)

| variant | status | G1 worst | G4 worst | G13 | failed deciding rows | RUN detail | blocked rows |
|---|---|---|---|---|---|---|---|
| s-card@dpr1 (dpr1) | pass | 0.0004 r1 f73 sheet-content bottom | 0.0003 r1 f14 sheet-image top | 0 pass; reverse: 14/14 rects, 14/14 pairs, 16/16 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-card@dpr3 (dpr3) | pass | 0.0004 r1 f73 sheet-content bottom | 0.0003 r1 f14 sheet-image top | 0 pass; reverse: 14/14 rects, 14/14 pairs, 16/16 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-card@rm-jump (rm-jump) | fail | 0.0000 r1 | 0.0000 r1 | 0 pass; close: 11/11 rects, 11/11 pairs, 15/15 computed reads (1 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | G6 3.000; shape.opacity 1.000; shape.radius 20.000; shape.inert 6.000 | G6 3 (sheet); manual final tracks 0, holds 0, clock pending 0, clock size 0 | — |
| s-card@rm-max (rm-max) | fail | 226.7344 r1 f19 sheet-content bottom | 196.6302 r1 f7 card-title bottom | 0 pass; reverse: 14/14 rects, 14/14 pairs, 16/16 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | G1 226.734; G4 196.630 | G1 226.7344207763672 (sheet-content frame 19); G4 196.6302020473164 (card-title frame 7); manual final tracks 0, holds 0, clock pending 0, clock size 0 | — |
| s-card@rm-ignore (rm-ignore) | pass | 0.0004 r1 f73 sheet-content bottom | 0.0003 r1 f14 sheet-image top | 0 pass; reverse: 14/14 rects, 14/14 pairs, 16/16 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-seg@dpr1 (dpr1) | pass | 0.0000 r1 f10 pill left | 0.0000 r1 f10 pill left | 0 pass; tap-4: 2/2 rects, 2/2 pairs, 3/3 computed reads (1 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-seg@dpr3 (dpr3) | pass | 0.0000 r1 f10 pill left | 0.0000 r1 f10 pill left | 0 pass; tap-4: 2/2 rects, 2/2 pairs, 3/3 computed reads (1 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@dpr1 (dpr1) | pass | 0.0002 r1 f38 detail-image left | 0.0002 r1 f38 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 4/4 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@dpr3 (dpr3) | pass | 0.0002 r1 f38 detail-image left | 0.0002 r1 f38 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 4/4 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@rm-jump (rm-jump) | pass | 0.0000 r1 | 0.0000 r1 | 0 pass; back: 602/602 rects, 602/602 pairs, 4/4 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@rm-max (rm-max) | pass | 0.0001 r1 f5 detail-image left | 0.0001 r1 f5 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 4/4 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo@rm-ignore (rm-ignore) | pass | 0.0002 r1 f38 detail-image left | 0.0002 r1 f38 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 4/4 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@dpr1 (dpr1) | pass | 0.0002 r1 f12 body-6 bottom | 0.0002 r1 f12 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 82/82 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@dpr3 (dpr3) | pass | 0.0002 r1 f12 body-6 bottom | 0.0002 r1 f12 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 82/82 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@rm-jump (rm-jump) | pass | 0.0000 r1 | 0.0000 r1 | 0 pass; c3: 86/86 rects, 86/86 pairs, 82/82 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0; §9.4 jump has no planned tracks, so the §4.3 computed set is policy-dependent: c2 54/82 reported as evidence (rect/pair and frame counts are exact) | — | pass | — |
| s-acc@rm-max (rm-max) | pass | 0.0002 r1 f12 body-6 bottom | 0.0002 r1 f12 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 82/82 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc@rm-ignore (rm-ignore) | pass | 0.0002 r1 f12 body-6 bottom | 0.0002 r1 f12 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 82/82 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-reorder@rm-jump (rm-jump) | fail | 0.0000 r1 | 0.0000 r1 | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 8/16 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0; §9.4 jump has no planned tracks, so the §4.3 computed set is policy-dependent: reorder-5 8/12, reorder-9 8/16 reported as evidence (rect/pair and frame counts are exact) | — | BLOCK G12; G8 3; G8 p95 3 ms, 0 long frames; manual final tracks 0, holds 0, clock pending 0, clock size 0 | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-reorder@rm-max (rm-max) | blocked | 0.0000 r1 f18 row-1 top | 0.0000 r1 f18 row-1 top | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 16/16 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-reorder@rm-ignore (rm-ignore) | blocked | 0.0000 r1 f23 row-2 bottom | 0.0000 r1 f23 row-2 bottom | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 16/16 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-sheet@rm-jump (rm-jump) | blocked | 0.0000 r1 | 0.0000 r1 | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 2/2 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-sheet@rm-max (rm-max) | blocked | 0.0001 r1 f94 sheet bottom | 0.0001 r1 f94 sheet bottom | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 2/2 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-sheet@rm-ignore (rm-ignore) | blocked | 0.0001 r1 f117 sheet bottom | 0.0001 r1 f117 sheet bottom | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 2/2 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |

## webkit primary DPR-2 scenes

| scene | status | G1 worst | G13 | failed deciding rows | RUN detail | blocked rows |
|---|---|---|---|---|---|---|
| s-card | pass | 0.0004 r1 f73 sheet-content bottom | 0 pass; reverse: 14/14 rects, 14/14 pairs, 16/16 computed reads (2 radius capture + 7 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-seg | pass | 0.0000 r1 f10 pill left | 0 pass; tap-4: 2/2 rects, 2/2 pairs, 3/3 computed reads (1 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-photo | pass | 0.0002 r1 f38 detail-image left | 0 pass; back: 602/602 rects, 602/602 pairs, 4/4 computed reads (0 radius capture + 301 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-stack | pass | 0.0002 r1 f73 card-1 bottom | 0 pass; collapse: 24/24 rects, 24/24 pairs, 24/24 computed reads (12 radius capture + 12 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-island | pass | 0.0003 r1 f4 card-content bottom | 0 pass; reverse: 8/8 rects, 8/8 pairs, 10/10 computed reads (2 radius capture + 4 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-acc | pass | 0.0002 r1 f12 body-6 bottom | 0 pass; c3: 86/86 rects, 86/86 pairs, 82/82 computed reads (0 radius capture + 43 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-insert | pass | 0.0001 r1 f14 row-21 bottom | 0 pass; insert: 29/29 rects, 29/29 pairs, 29/29 computed reads (0 radius capture + 16 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0 | — | pass | — |
| s-delete | pass | 0.0095 r1 f18 row-5 top | 0 pass; delete-2: 18/18 rects, 18/18 pairs, 8/8 computed reads (0 radius capture + 3 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 0, parents 0; audited non-layout presence reads excluded: 2 rects, 2 styles | — | pass | — |
| s-reorder | blocked | 0.0000 r1 f23 row-2 bottom | 0 pass; reorder-9: 28/28 rects, 28/28 pairs, 16/16 computed reads (0 radius capture + 8 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-sheet | blocked | 0.0001 r1 f117 sheet bottom | 0 pass; detent-2: 2/2 rects, 2/2 pairs, 2/2 computed reads (0 radius capture + 1 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 2; probes 0, parents 0 | — | pass | G12 ((p95(held) - p95(no-hold)) / held <= 0.1 ms) |
| s-bulk | pass | 0.0001 r1 f6 tile-25 right | 0 pass; shuffle: 2000/2000 rects, 2000/2000 pairs, 600/600 computed reads (0 radius capture + 300 active flush, plus the engine's Typed OM reads), 0 frame reads; layout offsets 0; probes 1, parents 0 | — | pass | — |

## webkit cost

- BLOCK G9-unscrolled: null (median of 5 per-run ratios <= 2)
- BLOCK G9-scrolled: null (median of 5 per-run ratios <= 2)
- ok G9.floor-unscrolled: 0 (exact required counts; no extra read)
- ok G9.floor-scrolled: 0 (exact required counts; no extra read)
- ok G10: 0.25 (p95 <= 2 ms)
- BLOCK G11: null (p95(engine commits) / p95(floor commits) <= 2)
- ok G11.floor: 0 (exact required counts; no extra read)
- ok G13: 0 (<= 2N rects and 2N layout-size pairs, exactly the computed reads; steady frames read zero)
- BLOCK G12-1: null ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- BLOCK G12-10: null ((p95(held) - p95(no-hold)) / held <= 0.1 ms)
- ok G13-held: 0 (one rect per live hold per frame, zero offset/style reads, 600 frames)

## Controls

94 browser controls; 94 conclusive and ok.
- ok card-no-image-id -> G1: fail (G1 = 176.00003051757812 at frame 68)
- ok card-no-inert -> shape.inert: fail (shape.inert = 36 at frame 0)
- ok card-image-offset -> G1: fail (G1 = 19.668289184570312 at frame 0)
- ok card-focus-follower -> shape.focus: fail (shape.focus = 36 at frame 0)
- ok seg-rest-retarget -> G1: fail (G1 = 75.5505621997111 at frame 6)
- ok seg-jump-from-A -> G2: fail (G2 = 146.98617553710938 at frame 5)
- ok seg-leftover-pose -> G6: fail (G6 = 2)
- ok photo-no-counter-scale -> G1: fail (G1 = 306.2501220703125 at frame 82)
- ok acc-separator-1px -> G1: fail (G1 = 5.000395300123955 at frame 57)
- ok stack-badge-nonparticipant -> G1: fail (G1 = 2.49078369140625 at frame 60)
- ok island-snap-reverse -> G2: fail (G2 = 72.3535385131836 at frame 16)
- ok insert-no-presence -> shape.presence-opacity: fail (shape.presence-opacity = 1 at frame 0)
- ok delete-no-lift -> G1: fail (G1 = 40.131011962890625 at frame 60)
- ok photo-leftover-pose -> G6: fail (G6 = 2)
- ok photo-extra-read -> G13: fail (G13 = 602)
- ok acc-leftover-pose -> G6: fail (G6 = 2)
- ok acc-extra-read -> G13: fail (G13 = 1)
- ok insert-leftover-pose -> G6: fail (G6 = 2)
- ok insert-extra-read -> G13: fail (G13 = 1)
- ok stack-extra-read -> G13: fail (G13 = 24)
- ok stack-leftover-pose -> G6: fail (G6 = 2)
- ok stack-no-badge-scale -> shape.badge-scale: fail (shape.badge-scale = 0.19999999999999996 at frame 16)
- ok island-extra-read -> G13: fail (G13 = 10)
- ok delete-extra-read -> G13: fail (G13 = 1)
- ok reorder-kill-switch-skip -> shape.kill-switch: fail (shape.kill-switch = 1)
- ok reorder-extra-read -> G13: fail (G13 = 28; isolated delta 28 > primary 0)
- ok reorder-no-rebase -> G1: fail (G1 = 60 at frame 3)
- ok reorder-cancel-instead -> shape.hold: fail (shape.hold = 2 at frame 10)
- ok sheet-medium-detent -> G5: fail (G5 = 298 at frame 54)
- ok sheet-release-jump -> G2: fail (G2 = 118 at frame 12)
- ok sheet-extra-read -> G13: fail (G13 = 2)
- ok sheet-cancel-instead -> shape.hold: fail (shape.hold = 1 at frame 85)
- ok bulk-target-offset -> G1: fail (G1 = 1.001008505782437 at frame 27)
- ok bulk-extra-read -> G13: fail (G13 = 2000)
- ok bulk-leftover-pose -> G6: fail (G6 = 2)
- ok dpr1-card-no-image-id -> G1: fail (G1 = 176.00003051757812 at frame 68)
- ok dpr3-photo-no-counter-scale -> G1: fail (G1 = 306.2501220703125 at frame 82)
- ok dpr1-acc-separator-1px -> G1: fail (G1 = 5.000395300123955 at frame 57)
- ok dpr3-seg-leftover-pose -> G6: fail (G6 = 2)
- ok rm-jump-card-policy-ignored -> G1: fail (G1 = 228 at frame 0)
- ok rm-jump-photo-policy-ignored -> G1: fail (G1 = 306.25006103515625 at frame 0)
- ok rm-max-acc-unclamped -> G1: fail (G1 = 105.88273600549235 at frame 16)
- ok rm-jump-reorder-policy-ignored -> G1: fail (G1 = 60 at frame 2)
- ok rm-max-sheet-unclamped -> G1: fail (G1 = 258.35812567267624 at frame 90)
- ok rm-ignore-photo-jump -> G1: fail (G1 = 306.25 at frame 0)
- ok held-extra-read -> G13-held: fail (11 rects / 10 holds at one audited frame; 0 pairs, 0 styles)
- ok floor-extra-read -> G9.floor: fail (extra reads 1)
- ok card-no-image-id -> G1: fail (G1 = 176.0000113780343 at frame 0)
- ok card-no-inert -> shape.inert: fail (shape.inert = 36 at frame 0)
- ok card-image-offset -> G1: fail (G1 = 19.668289184570312 at frame 0)
- ok card-focus-follower -> shape.focus: fail (shape.focus = 36 at frame 0)
- ok seg-rest-retarget -> G1: fail (G1 = 75.55059271728922 at frame 6)
- ok seg-jump-from-A -> G2: fail (G2 = 146.98617553710938 at frame 5)
- ok seg-leftover-pose -> G6: fail (G6 = 2)
- ok photo-no-counter-scale -> G1: fail (G1 = 306.25006103515625 at frame 82)
- ok acc-separator-1px -> G1: fail (G1 = 5.00039531339246 at frame 57)
- ok stack-badge-nonparticipant -> G1: fail (G1 = 2.49078369140625 at frame 60)
- ok island-snap-reverse -> G2: fail (G2 = 72.3535385131836 at frame 16)
- ok insert-no-presence -> shape.presence-opacity: fail (shape.presence-opacity = 1 at frame 0)
- ok delete-no-lift -> G1: fail (G1 = 40.115386962890625 at frame 60)
- ok photo-leftover-pose -> G6: fail (G6 = 2)
- ok photo-extra-read -> G13: fail (G13 = 602)
- ok acc-leftover-pose -> G6: fail (G6 = 2)
- ok acc-extra-read -> G13: fail (G13 = 1)
- ok insert-leftover-pose -> G6: fail (G6 = 2)
- ok insert-extra-read -> G13: fail (G13 = 1)
- ok stack-extra-read -> G13: fail (G13 = 24)
- ok stack-leftover-pose -> G6: fail (G6 = 2)
- ok stack-no-badge-scale -> shape.badge-scale: fail (shape.badge-scale = 0.19999999999999996 at frame 16)
- ok island-extra-read -> G13: fail (G13 = 10)
- ok delete-extra-read -> G13: fail (G13 = 1)
- ok reorder-kill-switch-skip -> shape.kill-switch: fail (shape.kill-switch = 1)
- ok reorder-extra-read -> G13: fail (G13 = 28; isolated delta 28 > primary 0)
- ok reorder-no-rebase -> G1: fail (G1 = 60 at frame 3)
- ok reorder-cancel-instead -> shape.hold: fail (shape.hold = 2 at frame 10)
- ok sheet-medium-detent -> G5: fail (G5 = 298 at frame 54)
- ok sheet-release-jump -> G2: fail (G2 = 118 at frame 12)
- ok sheet-extra-read -> G13: fail (G13 = 2)
- ok sheet-cancel-instead -> shape.hold: fail (shape.hold = 1 at frame 85)
- ok bulk-target-offset -> G1: fail (G1 = 1.001008505782437 at frame 27)
- ok bulk-extra-read -> G13: fail (G13 = 2000)
- ok bulk-leftover-pose -> G6: fail (G6 = 2)
- ok dpr1-card-no-image-id -> G1: fail (G1 = 176.0000113780343 at frame 0)
- ok dpr3-photo-no-counter-scale -> G1: fail (G1 = 306.25006103515625 at frame 82)
- ok dpr1-acc-separator-1px -> G1: fail (G1 = 5.00039531339246 at frame 57)
- ok dpr3-seg-leftover-pose -> G6: fail (G6 = 2)
- ok rm-jump-card-policy-ignored -> G1: fail (G1 = 228.0000820703135 at frame 53)
- ok rm-jump-photo-policy-ignored -> G1: fail (G1 = 306.25006103515625 at frame 0)
- ok rm-max-acc-unclamped -> G1: fail (G1 = 105.88273600549235 at frame 16)
- ok rm-jump-reorder-policy-ignored -> G1: fail (G1 = 60 at frame 2)
- ok rm-max-sheet-unclamped -> G1: fail (G1 = 258.35812567267624 at frame 90)
- ok rm-ignore-photo-jump -> G1: fail (G1 = 306.25 at frame 0)
- ok held-extra-read -> G13-held: fail (11 rects / 10 holds at one audited frame; 0 pairs, 0 styles)
- ok floor-extra-read -> G9.floor: fail (extra reads 1)

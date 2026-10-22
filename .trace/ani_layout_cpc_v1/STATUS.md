# CPC Execution Status

## Passed checkpoints

- 01 authority/oracle/guards/E5 baseline: TRIBUNAL PASS
- 02 plans/retention/retarget: TRIBUNAL PASS
- 03 modes/dependency/config/wait: TRIBUNAL PASS
- 04 depth-1 projection/anchor/velocity: TRIBUNAL PASS (fixed-48/60-offset gate amendment)

## In progress

- 05 duplicate-layoutId crossfade: core animations and P12 are implemented; depth-2 projection, retained layoutId crossfade composition, and E2–E4 fixtures are not complete. No checkpoint PASS is claimed.
- 06 E1–E5/Gallery, jank/bundle, final hardening: not complete.

## Open residuals

- runtime adaptive projection error estimator remains deferred by amendment;
- depth >1 is currently snapped/skipped rather than compiled;
- unchanged nested children still consume box reads before no-change in large trees;
- E2–E4 and the reduced 2D Gallery are not built;
- no final push/publish has occurred.

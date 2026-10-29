# Gate amendment — WebKit cost evidence (D12), 2026-10-29

Status: **owner-approved**. WebKit cost is reported BLOCK/advisory; **Chromium decides the cost
gates**, while WebKit remains a required engine for frame/scoring/shape/status gates.

## Problem

Playwright WebKit on the D9 macOS instrument has a 1 ms `performance.now` tick. H17c proved that
G9/G11 p95 cannot be resolved below that tick without changing the measured from-rest/60 Hz work or
cadence; a 20-commit batch loses single-commit outliers. Raw quantized ratios (1.333/1.5) are not
evidence. G10 can use the real-clock 20-frame script batch and is reported as a diagnostic.

## Ruling

- **Chromium** decides G9 (commit/floor), G11 (sustained commit/floor) and G12 (baseline-subtracted
  held cost), with the exact floor/read audits.
- **WebKit** remains required for every §11.6 frame-scoring/shape/status/restoration/focus gate.
  WebKit cost rows are **BLOCK/advisory**, reported with raw quantized samples and no gate value.
- P5 certification may pass only when every required WebKit frame/scoring row is green, every
  required Chromium frame/scoring row is green, and the Chromium cost gates pass. A WebKit cost
  BLOCK is recorded, not treated as a pass or a failure.
- This is an explicit D5/D9 amendment, not a silent waiver. No frame tolerance changes.

## Evidence

- H17c: WebKit G10 0.250 ms real-clock batch; G9/G11/G12 BLOCK at g=1 ms; no fabricated ratio.
- Chromium: G9 1.969/2.079 (advisory), G10 0.975, G11 2.424, G12 incremental pass.
- Owner ruling 2026-10-29: Chromium decides cost; WebKit frames/scoring decide.

## Non-regression

WebKit frame/scoring rows remain deciding. A WebKit frame failure still blocks P5. A Chromium cost
failure still blocks P5. The WebKit cost BLOCK is visibly reported in the certification reasons.

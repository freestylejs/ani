# Gate amendment — WebKit cost evidence (D12), 2026-10-29

Status: **owner-approved**. WebKit cost rows (G8–G12) are reported BLOCK/advisory; **Chromium
decides the cost gates**, while WebKit remains a required engine for frame/scoring/shape/status
gates.

## Problem

Playwright WebKit on the D9 macOS instrument has a 1 ms `performance.now` tick. H17c proved that
G9/G11 p95 cannot be resolved below that tick without changing the measured from-rest/60 Hz work or
cadence; a 20-commit batch loses single-commit outliers. Raw quantized ratios (1.333/1.5) are not
evidence. G10 can use the real-clock 20-frame script batch and is reported as a diagnostic. G8 is
also a real-clock frame-cost row; its p95 is cost evidence, not a movement-fidelity gate.

## Ruling

- **Chromium** decides G8 (steady-frame p95), G9 (commit/floor), G10 (steady frame), G11 (sustained
  commit/floor) and G12 (baseline-subtracted held cost), with the exact floor/read audits.
- **WebKit** remains required for every §11.6 frame-scoring/shape/status/restoration/focus gate.
  WebKit cost rows G8–G12 are **BLOCK/advisory**, reported with raw quantized samples and no gate
  value.
- P5 certification may pass only when every required WebKit frame/scoring row is green, every
  required Chromium frame/scoring row is green, and the Chromium cost gates pass. A WebKit cost-row
  failure or BLOCK is recorded, not treated as a pass or a failure. Any G1–G7/G13/shape/status
  failure still blocks.
- This is an explicit D5/D9 amendment, not a silent waiver. No frame tolerance changes.

## Evidence

- H17c: WebKit G10 0.250 ms real-clock batch; G9/G11/G12 BLOCK at g=1 ms; no fabricated ratio.
- Chromium: G9 1.969/2.079 (advisory), G10 0.975, G11 2.424, G12 incremental pass.
- Owner ruling 2026-10-29: Chromium decides cost; WebKit frames/scoring decide. D12 classification
  now names G8 explicitly: a WebKit scene/variant whose only deciding failures/BLOCKs are G8–G12 is
  advisory.

## Non-regression

WebKit frame/scoring rows remain deciding. A WebKit G1–G7/G13/shape/status failure still blocks
P5. A Chromium cost failure still blocks P5. The WebKit cost rows are visibly reported in the
certification advisories.

# Gate amendment — controlled-load cost evidence (D13), 2026-10-30

Status: **owner-approved**. The owner chose the controlled-load paired-floor ruling for P5
certification on the shared D9 host.

## Retired reading

`ARCHITECTURE.md` §11.5/D9 pinned a 1-minute load average below **1.0** at the start of a cost run.
The D9 Mac is shared with the owner's other agent/browser workloads; the 1-minute load is 6–11 even
when this bench is idle, and a literal `<1.0` run would require stopping unrelated owner work. The
load pin was a precaution, not a cost gate: it does not measure the engine.

## Replacement evidence rule

- Cost gates remain the same ratios and tolerances: G9/G11 ≤ 2× the **same-run, same-DOM** audited
  required-work floor, G10 p95 ≤ 2 ms, G12 baseline-subtracted per-held ≤ 0.1 ms, exact reads.
- The report records the exact fingerprint and 1-minute load. A load above 1.0 is a
  **controlled-load** record, not by itself an advisory/failure reason.
- A **true fingerprint mismatch** (host, OS, CPU, cores, memory, Node, pnpm, Playwright, Chromium
  or WebKit build) still makes the cost gates advisory and cannot certify. Load alone does not.
- P5 certification on the final SHA requires **two independent five-run Chromium cost
  invocations** (a full combined five-run report plus a cost-only five-run repeat, or two full
  combined reports), each with G11 median ≤ 2× and G9/G10/G12 green. The frame/scoring/shape/
  status gates must be green in both Chromium and WebKit. WebKit cost remains BLOCK/advisory under
  D12.
- No ratio is fabricated and no frame tolerance changes. The tribunal must see both five-run
  reports, the exact SHA, the fingerprint, and the load.

## Why

The paired-floor design already cancels host speed and load because the engine and floor run the
same required work in the same process. The profile on the shared host showed stable paired ratios
2.175 / 2.036 / 2.188 at load 6.65–7.24; the floor p95 varied only ~2.5%. The remaining gap to 2.0
is engine work, not load noise. Requiring a quiet host did not change the measured ratio and made
the gate impossible to run on this machine.

## Evidence

- D9 host: load 6–11 from owner workloads, 35 webridge Chrome tabs; bench-only load is not <1.0.
- H17g paired profile: engine/floor p95 6.895/3.170, 6.555/3.220, 6.750/3.085 → 2.175, 2.036, 2.188.
- G11 cost-only five-run at load 7.99: median 2.368; G9 1.876/1.876, G10 0.460 ms, G12 −0.120/−0.007,
  G13 exact. The gap is structural engine work; H17h is reducing it.
- Owner ruling 2026-10-30: accept controlled-load paired-floor evidence; no fabricated quiet
  fingerprint.

## Non-regression

G11 remains ≤ 2×; G9/G10/G12 and exact reads remain; WebKit frame/scoring decides; D12 is
unchanged. A true fingerprint mismatch cannot certify. The P5 artifact must name the controlled
load and both five-run reports.

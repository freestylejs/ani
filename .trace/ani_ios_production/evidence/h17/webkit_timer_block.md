# H17 — WebKit coarse timer remains BLOCK

Status: evidence for the P5 helper run; not a gate decision.

## Exact limitation

Playwright's WebKit build `webkit-2203` exposes `performance.now()` at a 1 ms
tick on this instrument. The harness measures `g = 1 ms` (tick-fallback) and
marks the cost report `valid: false`, `status: blocked`; G9, G10 and G11 are
non-deciding (`BLOCK`) and no ratio is reported as a measured failure.

The raw WebKit commit distribution is quantized by 1 ms: a 12 ms commit and an
11.2 ms commit can both read 12 ms. A 30-sample median has ±0.5 ms quantisation
and a ratio formed from two such medians carries at least ±0.35 ratio error at
the 2–3× region. That cannot decide a 2× gate.

## Why a 20-commit interval was not claimed as a pass

One `performance.now()` pair around 20 commits gives a batch **mean** with a
±0.05 ms bound per commit. It does not give the G11 statistic:

- G11 is the p95 of 300 per-commit intervals. Fifteen batch means cannot
  resolve a p95: one slow commit is averaged with nineteen normal commits and
  disappears. A batch that ends at 39.95 ms for 20 commits is compatible with
  19 commits at 1.9 ms and one at 3.9 ms, and with 20 commits at 2.0 ms.
- A maximum batch mean bound does not bound the maximum commit: 20 commits
  could be 0.05 ms … 39.0 ms and still fit a plausible batch mean.
- The harness already has raw samples with an explicit ±g/2 quantisation bound
  (H14-12). Re-labelling a batch mean as a 20-frame interval would be the
  fabricated 60 Hz figure the authority forbids.

The existing `cost_validity` rules (g ≤ 0.05, exactly 300 commits, 58.5–61.5 Hz)
therefore keep WebKit **BLOCK**. On the H17 report
(`bench/layout/iteration-3/webkit-cost.json`) the diagnostic raw values are
G9 1.200× unscrolled / 1.200× scrolled, G10 2.000 ms and G11 8.000 ms; the
report marks each `blocked: true`, `valid: false`, `status: blocked`, and all
five WebKit runs have `g = 1.0000 ms`. No diagnostic value is presented as a
pass or failure. The floor audits and G13 are exact behind the same 1 ms timer:
they count reads, not time, so they still decide.

A defensible WebKit decision needs either a finer timer on the pinned WebKit
build (not available in Playwright 1.55.0) or an owner-approved coarse-timer
protocol that changes the statistic and its error bound; this helper did not
invent one.

Chromium is isolated, `g ≈ 0.005 ms`, and decides the Chromium cost gates.

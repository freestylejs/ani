# P4 checkpoint — self-judgment (`p4_drive`)

Skill: `judging-checkpoint-completion` (self-judgment, before the Chief Justice). Authority:
`packages/layout/ARCHITECTURE.md` §5.10, §3.2/§3.3, §5.3, §5.7, §5.8, §7.2/§7.3, §8, §9.1–§9.4,
§11.2 L-DRIVE-1..6; `p4_authority_clarifications.md` C1–C11; `00_plan.md` P4.

This is the implementer's verdict. It is not the tribunal's PASS.

## Deliverables

- Public `LayoutDrive`/`LayoutDriveHandle`, `LayoutGroup.take`, `stats.holds`.
- Held state machine, preconditions, invalidation, re-take, follower rejection.
- Held read and pose through current parent maps; one rect per held element per frame.
- Descendant residuals + one common `h(t)`; release velocity once; flush while held/landing.
- Reduced motion at release; kill switch mid-drive-hold; mover cap with holds.
- React `useLayoutDrive`, explicit/implicit routing, StrictMode hold.
- L-DRIVE-1..6, `L_DRIVE_EDGES`, `RL_DRIVE`, `RL_DRIVE_STRICT`.
- Docs.

## Gate evidence (merged P4 head)

| Gate | Evidence | Result |
|---|---|---|
| Unit | **153 files, 1,892 tests** | PASS |
| Types | **11/11 turbo tasks** | PASS |
| Biome | **0 errors**, 10 pre-existing warnings | PASS |
| Chromium full + coverage | **223 passed, 0 failed, 0 known, 0 skipped** | PASS |
| WebKit full | **221 passed, 0 failed, 0 known, 2 Chromium-only skips** | PASS |
| Coverage | statements 92.30, branches 80.35, functions 95.47, lines 94.77; floors 90/80/95/92 | PASS |
| `knownFailures` | empty | PASS |
| Firefox | macOS 27 launch timeout; advisory exception (D5/D9) | EXCEPTION |

## L-DRIVE rows

| Row | Evidence | Result |
|---|---|---|
| L-DRIVE-1 | held origin 0.0000 px; reorder offset 0; release oracle 0.0000 px for 600/−200 and 1000/0; first update B at dt=0; snap-back/cancel restore | PASS |
| L-DRIVE-2 | caught moving card v 566.7 px/s; size track preserved while held/release; release origin oracle multiple frames; take velocity not added | PASS |
| L-DRIVE-3 | scroll, ancestor scale 1→2, sticky ancestor, driven child under live scale; H error ≤0.0000 px | PASS |
| L-DRIVE-4 | non-finite/stale calls, two scopes, ancestor/descendant, unmount, dispose, layoutKey, support failure, finish, kill switch (explicit/implicit, static and moving holds) | PASS |
| L-DRIVE-5 | jump/maxDuration/ignore; hold survives policy change; zero-offset release; no-fit released+reduced | PASS |
| L-DRIVE-6 | residual + h 0.0000 px held, 0.0001 px landing; size child, moving child, kept residual, cancel descendants, anchored child, follower/posed no double h | PASS |
| L_DRIVE_EDGES | take errors, supported scale, held size 0.4/0.5/1.5/6 px, landing+size flush, moving parent, static child, retake failure, held faults, cap, cross-scope | PASS |

## Corrective history

- Initial H13 review: S1 cancel descendants, size tolerance wedge, landing clock replay, vacuous
  StrictMode; plus S2 contract/evidence gaps.
- Corrective 1 fixed those; re-review found H13-05R retake ordering S1 and S2 evidence gaps.
- Corrective 2 fixed H13-05R (validate all preconditions/support before settling old landing),
  H13-05R2 same-task B, H13-02R A/release target, H13-08R anchor evidence, H13-15R caught-card
  release oracle, H13-10R jump/reduced.
- Final micro-fix H13-12S: true trackless static child carries the nearest animating ancestor's
  drawn origin velocity (oracle −250 px/s); reflowing child relabelled.
- H11b/H12/P3/N1–N3 rows preserved; no tolerance/row weakened.

## Authority decisions

`p4_authority_clarifications.md` C1–C11: landing re-take, follower rejection, `stats.holds`,
mover cap, WAAPI+snap, cross-scope limitation, animated-owned held read, reduced no-fit, take before
flush, ancestor-carried take velocity, L-DRIVE-3 sticky scope.

## Residual S3

- Held size read adopts geometry on a presented size/offset change; parent/ancestor position moves
  that do not change the held offset are still treated as camera shift.
- Ancestor-carried velocity is the nearest animating ancestor's drawn origin velocity, not a full
  composed derivative through every scale layer.
- Landing re-take restores/settles synchronously; an interleaved paint could briefly show the
  restored box.
- Cross-scope nested holds are allowed but scope-local; a driven child in another scope does not
  ride the outer h.
- Branch coverage margin is 0.35 above the floor.
- Box-preserving 180° rotations/zooms are conservatively invalidated.
- `useLayoutDrive` routes through the adapter owner map; an unregistered element throws.
- Firefox advisory evidence unavailable on the current instrument.

## Self verdict

**P4 implementation and gates: PASS.** The drive seam is 1:1 while held, velocity-continuous on
release, descendant-safe, reduced-motion-compliant, transaction-safe and capped in Chromium and
WebKit. The Chief Justice must independently re-judge; no `TRIBUNAL PASS` is claimed. P5 native-grade
certification remains future work.

## J-001 remediation (after the P4 tribunal FAIL)

The tribunal found one S1: kill-switch/abort cleared a live `released`/`cancelled` landing without
changing its public handle to `invalidated`. Fixed at `fa95fdc`:

- `invalidateHold()` now transitions any live hold (`held`/`released`/`cancelled`) to `invalidated`
  before clearing it; `finishHold()` normal completion still preserves terminal `released`/
  `cancelled`.
- New rows cover released and cancelled landings under kill switch and abort: handle `invalidated`,
  `stats.holds = 0`, byte-identical styles, clock/marker/listener cleanup, `runtime-disabled` /
  `internal-error`; normal-completion controls preserve terminal state.
- `RuntimeScope.resume()` re-arms scroll listeners after `setMode('animate')`; `finishAll('disabled')`
  disarms them, and the fuzz handoff-scroll row passes.

Evidence: `logs/j001/` (unit 1892, Chromium 223/223, WebKit 221/221, coverage 92.27/80.35/95.48/
94.76). No row or tolerance was weakened. Self verdict remains PASS for P4 pending re-judgment.

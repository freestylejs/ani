# Tribunal Report: CP5 — React adapter and CP4 re-judgment

## Verdict

TRIBUNAL FAIL

- Target: CP5 T5.1–T5.3/V5, plus carried J-016–J-025.
- Frozen HEAD: 8211c7c; reviewed diff 5c9f57c..8211c7c and current source.
- Date: 2026-10-23.
- Findings: **7 S0 defects and 2 S1 defects**. Required commands pass after building prerequisite artifacts; independent counterexamples fail in all three browsers.
- Only this report was written. No implementation edits, commits or pushes.

## Authority Coverage

| File | Role / coverage |
| --- | --- |
| packages/layout/ARCHITECTURE.md | Highest authority; inspected model, commit/frame, solver, ownership, React, failure and acceptance contracts, especially §4.1–4.3, §5.5–5.6, §6, §7.2, §9, §11–12. |
| .trace/ani_layout_final/plan.md:111 | CP4 dependency and CP5 T5.1–T5.3/V5; prescribed E5 parameters at :160. All in-scope rows mapped below. |
| .trace/ani_layout_final/00_documentation_drift.md:78 | K1–K17, including hand-off K14 and clarifications K16/K17. |
| .trace/ani_layout_final/source_decision.md | Approved source record and closed default-layout/stateful-timing questions; later architecture clarifications take precedence. |
| .trace/ani_layout_final/cp4_engine_trial_result.md:69 | Original numeric counterexamples, dispositions and re-entry criteria at :141. |
| .trace/ani_layout_final/cp4_engine.md:143; cp5_react.md | Fix proof and checkpoint claims independently checked against source and execution. |

E1–E4, Gallery, product documentation/web, spike deletion and WAAPI remain outside this trial.

## Judgment Matrix Summary

Counts use one row per carried defect, one per T5.1/T5.2/T5.3/V5, and nine executable gate groups.

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| CP4 J-016–J-025, including required regression proof | 10 | 4 | 6 | 0 |
| CP5 T5.1–T5.3/V5 | 4 | 1 | 3 | 0 |
| Requested executable gate groups | 9 | 9 | 0 | 0 |
| **Total** | **23** | **14** | **9** | **0** |

| Authority row | Evidence and independent result | Result |
| --- | --- | --- |
| J-016 | Original unchanged set(e,{}) now preserves x=48 after .2 s + two .02 s frames. Equivalent inherited/default motion and reordered spring parameters still interrupt; defect below. | FAIL |
| J-017 | Independently repeated the original **.5 s** retarget: lead/follower .5/.5; .22 s later .72/.28, lead x=152.6152, width=296.61568. Subsequent frames match the independent equation; maximum rect error C/F/W .000211/.008288/.000187 px. Lead opacity restored, follower held at 0, release completed. Existing J17 passes ×3. | PASS |
| J-018 | J18 ×3: **3 reads before 3 writes**, **14 frame writes all in commit**, including two settle removals. Inspected queued restoration and realize/raf.ts:25. | PASS |
| J-019 | Original .2 s toggle with unchanged A now ends at x=200, status ended, zero subscribers within the clamp. Active/delayed regression passes, but its required frame oracle is absent (layout.ts:1474). | FAIL, proof J-030 |
| J-020 | Original x40/v200→x400 gives x(.02)=44.126709 C/W, 44.133331 F, versus 44.12672. Pure shrinking-step derivative test passes (plan.test.ts:610). Changed-layer retention still hands off a stale box. | FAIL |
| J-021 | Original radius acquisition at .2 s restores 8px, normal priority. Existing settle/finish/dispose variants pass; intermediate rect/radius proof is absent. | FAIL, proof J-030 |
| J-022 | Original 4px→20px case restores 20px and x=220. Existing translate/scale settle/finish/dispose variants pass; intermediate frozen-composition proof is absent. | FAIL, proof J-030 |
| J-023 | Original sole removal resolves disposed, immediately zero subscribers/tracks. Existing partial-removal trajectory and disconnected-node cases pass ×3. | PASS |
| J-024 | Both former exact Biome command and expanded CP5 command exit 0, warnings/information only. | PASS |
| J-025 | Original ancestor .8→1 case now preserves **x140/w40 at replacement t=0**, settles at x400 with identity style; trajectory error C/F/W .000018/.007840/.000018 px. Own-layer change under a moving parent corrupts velocity. | FAIL |
| T5.1 | Source, jsdom and RL1–RL8 support render capture/task reuse, K14 hand-off, one flush after effects, nesting/namespace/motion merge, ordinary root isolation/disposal and update ordering. Scope comparison, option equality, foreign-document presence touching and warning coverage fail below. | FAIL, J-016/J-026/J-029/J-031 |
| T5.2 | Package-internal opacity ownership/hold survives crossfade re-check. popLayout CSS-box calculation and presence replay/lifetime fail below. | FAIL, J-027/J-028 |
| T5.3 | Named suites execute, but required cases/expectations omit failures and mandatory CP4/E5 proof described in J-030. | FAIL |
| V5 | Required browser selections green ×3; source/export/grep inspection finds no surviving old adapter facade/config/deps/types outside deferred spikes. Core timeline play calls and invalid-box rejection tests are legitimate. | PASS |

SSR guards and SSR unit cases were inspected; no SSR defect established. Separate Suspense hide/reveal/reorder probes preserve registration and the t=0 pose under React 19 and the pinned React 18.3 alias in all three browsers.

## Defects

All numeric reproductions use source bundled in memory, the real Core manual clock and real DOM; no diagnostic files were created. Unless stated otherwise: linear timing, duration 1 s, origin 0 0; frame(0); frame(200) establishes elapsed .2 s. C/F/W means Chromium/Firefox/WebKit.

| ID | Severity | Authority | Finding |
| --- | --- | --- | --- |
| **J-016** | S0 | §3.3 invariant 5, §5.5, §7.2; prior J-016 disposition | Equality remains syntactic. packages/layout/src/motion.ts:288 and packages/react/src/layout/context.ts:64 compare JSON property order; motion.ts:305 compares unresolved optional motion fields. With group duration 1/linear, changing {} to {motion:{duration:1}} or {motion:{delay:0}} at .2 s interrupts. Two .02 s frames give **43.968323 / 43.966660 / 43.968323**, versus unchanged **48**. Springs {m:1,k:200,c:20} and {c:20,k:200,m:1} also interrupt: C updated/control x=**155.384705/165.415909**; all browsers reproduce. |
| **J-020** | S0 | §5.6; carried handoff/retention mandate | Removal retains cached solver coordinates, not the current drawn box: packages/layout/src/scope.ts:1354 and :1474. Original parent x100/scale .8, child left0→200/width40; at .2 s change parent scale to 1, then unregister/remove child and add its id at x400. Departing actual box **x140/w40**; new lead starts **x132/w32**, all browsers. |
| **J-025** | S0 | §5.5, §3.3 continuity; carried own/ancestor-layer re-check | packages/layout/src/scope.ts:805 multiplies full visual velocity by the size ratio. A child's own scale change does not scale its parent's translation. Parent left0→200, child left0/width40/scale .8; at .2 s change child scale to 1 and target left to100 (page A=300). B is correctly x40/w40; incoming vx remains **200**. Code seeds **250**: x(.02)=**45.007919 / 45.000000 / 45.007919**, versus **44.04752**; peak trajectory error ≈**7.4052 px**. The new presence matrix is fixed, so this is not the acknowledged omission of an animating presence layer's time derivative. |
| **J-026** | S0 | §7.2 scope options by value; T5.1 | packages/react/src/layout/layout_group.tsx:54 and :96 compare {maxDuration} by identity. Clock reduced motion false; move x0→200 with stable {maxDuration:.1}. At .2 s rerender unchanged geometry with a fresh {maxDuration:.1}: position **40→200**, subscription **1→0**, all browsers. |
| **J-027** | S0 | §6 CSS box in exiting render, §7.2 popLayout; T5.2 | packages/react/src/layout/presence.tsx:309 and :350 remove containing-block scale but retain the element's own transform in offsets/dimensions. Positioned block; CSS box left50/top80/100×50, origin0, current presence translateY(14px) scale(.8): visual **(50,94,80,40)**. A popLayout exit retaining this transform produces **(50,108,64,32)** in all browsers, applying it twice. Expected CSS pop box remains left50/top80/100×50. |
| **J-028** | S0 | §7.2 StrictMode/presence lifetime, K17; T5.2/T5.3 | Layout registration survives moved-fiber replay, presence does not. packages/react/src/layout/presence.tsx:385 and :412 dispose/recreate the handle; replayed enter restarts from initial (:445). React 19 StrictMode, two layout+presence items entering for 1 s from opacity0/scaleX.8/y14: reorder at .2 s without advancing time. Opacity resets **.2→0**, scaleX **.84→.8**, width **84→80**, all browsers. |
| **J-029** | S0 | §4.1–4.2, §7.2 document roots/AnimatePresence toucher; T5.1 | Without a group, packages/react/src/layout/presence.tsx:80 calls existingScope(layout) without ownerDocument; context.ts:334 chooses global document. In an iframe root, a sync presence child (height50) exits above a memoized layout sibling. Freeze the default layout clock, drive presence's .1 s exit separately, drain the settle commit. Sibling jumps **y50→0**, empty translate. Main-document control remains **y50**, translate 0px 50px. All browsers reproduce after awaiting iframe load. |
| **J-030** | S1 | CP4 re-entry :144; T5.3, plan E5 :160, architecture §11 | tests/browser/cases/layout.ts:1474 uses noCheck for J19's clamped trajectory; J21/J22 natural settle uses endRun's noCheck (:1575). J20 has no size momentum; J25 omits own-layer/moving-parent and removed-lead cases. E5 in tests/browser/cases/react_layout.ts:709 uses enter y−20/scaleX.9, exit y0/scaleX.5 and linear timing, rather than prescribed y14/.8, exit y10/.9, spring and centre-bottom origin. Add-phase frames only check finiteness (:823). Passing cases do not supply required frame proof. |
| **J-031** | S1 | §7.2 warning; T5.1/T5.3 | packages/react/src/layout/context.ts:152 observes participant class and parent childList, missing parent class/style. Inside a stable group, state changes a flex parent's class column→row above memoized participants. Second item moves **(0,50)→(40,0)** with **zero warnings**, all browsers. The jump is permitted by the trigger contract; the missing development warning is the defect. |

## Defect Disposition

| ID | Essential defect / completion impact | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- |
| J-016 | Equivalent options replace a track. | Compare effective motion after defaults/inheritance and timing parameters independent of key order, in engine and adapter. | Equivalent controls retain their run and match every frame; genuine changes still retarget. |
| J-020 | Departed history is stale after supported presence changes. | Retain current visual box/velocity through current own/ancestor layers. | x140/w40 handoff, correct position/size momentum and expiry ×3. |
| J-025 | Velocity reconciliation approximates the full map by a size ratio. | Preserve parent translation and other channel contributions through actual map composition. | vx200, x(.02)=44.04752, frame continuity and identity settle ×3. |
| J-026 | Equal policy objects destroy a live scope. | Compare policy values; retain recreation for actual changes and latest onSnap. | Equal-object render preserves x40/control trajectory; changed policy recreates correctly. |
| J-027 | Visual rect is used as an untransformed CSS box. | Recover CSS box through permitted own transforms/poses and containing block during exiting render. | Pop preserves (50,94,80,40), also during active enter/layout motion ×3. |
| J-028 | Replay is mistaken for real presence teardown. | Preserve progress/registrations/holds across same-element replay; stale promises must not clear a replacement enter's initial-style lifetime. | Mid-enter/mid-exit reorder preserves transform/opacity/release; actual unmount cleans up. |
| J-029 | Presence touches the wrong implicit scope. | Resolve the scopes containing its participants by ownerDocument, including settle commits rendering no participant. | Main/iframe preserve y50 at t=0, animate/settle and dispose independently. |
| J-030 | Required fixtures/expectations are missing or altered. | Extend existing tests with independent frame/opacity/radius expectations and prescribed E5 parameters. | Every affected frame verified ×3; proof identifies actual assertions. |
| J-031 | Ordinary React layout mutations escape warning coverage. | Observe relevant class/style/subtree changes without false warnings for engine/presence writes. | Memoized class/style cases warn once; captured/update controls do not warn. |

Do not weaken the authority/oracle, suppress supported motion, require a group where implicit roots are promised, or restart equivalent tracks to satisfy a surface check.

## Independent Re-checks

All execution used only ~/ani-v2/lay-judge-cp5_react on june-wsl:

~~~sh
ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl \
  'source ~/ani-v2/env.sh; cd ~/ani-v2/lay-judge-cp5_react && <command>'
~~~

WebKit additionally sourced ~/ani-v2/sysroot/webkit-env.sh after env.sh.

| Check | Command / method | Result |
| --- | --- | --- |
| Mirror integrity | SHA-256 over ordered path/content pairs, all **561** tracked files, before/after checks | Local/remote: **5c0e5b87e715a393304a29b027894a4de733416f5b44008b7f369d8e83b476c1**. Remote lacks .git; content identity verified. |
| Target units | pnpm vitest run react/src/layout layout/src/__tests__ | Exit 0: **10 files, 145 passed**. |
| Full units | pnpm vitest run | Exit 0 after prerequisite Core build: **135 files, 1,577 passed**. Initial missing-Core-dist failures resolved by that build. |
| Chromium | pnpm test:browser --browser chromium --case 'react_layout:*' --case 'layout:*' | Exit 0: **33 passed, 0 failed**. |
| Firefox | Same selection, --browser firefox | Exit 0: **33 passed, 0 failed**. |
| WebKit | Same selection, --browser webkit, sysroot environment | Exit 0: **33 passed, 0 failed**. |
| Layout build/types | pnpm --filter @freestylejs/ani-core build; pnpm --filter @freestylejs/ani-layout build; pnpm --filter @freestylejs/ani-layout ts:typecheck | Exit 0. Initial layout DTS attempt lacked Core declarations; prerequisite build resolved it. |
| Browser types | npx tsc -p tests/browser --noEmit | Exit 0. |
| React types | cd packages/react && npx tsc --noEmit --skipLibCheck | Exit 0. |
| Biome | npx biome check packages/layout packages/react tests/browser vitest.config.ts; former exact npx biome check packages/layout tests/browser | Both exit 0. Expanded: **82 files, 8 warnings, 894 infos**; former: **55 files, 8 warnings, 709 infos**; no errors. |
| Established COST | Existing layout:COST | C/F/W: 1,000-participant/300-mover reads **2.60/3.00/3.00 ms**; 300 nested movers p95 **.745/.950/1.050 ms**. Both gates pass. Extra all-1,000-mover configuration is not the established gate. |
| Migration | Source/export/diff inspection; V5 symbol grep in layout/react sources/tests and browser tests, deferred spikes excluded | No old layout bridge/API. Core play calls and rejection literals are legitimate. |
| Numeric re-trial and controls | Remote stdin node --input-type=module, esbuild write:false/source aliases, Playwright C/F/W; scalar equation independently implemented | Exact outputs in matrix/defects. No implementation or diagnostic files changed. |

## Remediation Order

1. Repair effective-option equality (J-016), current-layer retention and full-map velocity (J-020/J-025); retain original CP3/CP4 numeric regressions.
2. Repair policy-value lifecycle and foreign-document presence routing (J-026/J-029).
3. Repair popLayout CSS-box measurement and presence replay/lifetime (J-027/J-028).
4. Restore warning coverage (J-031).
5. Complete existing regression/E5 expectations (J-030), update existing proof sections, rerun required commands.

## Fix Proof Report Requirements

Submit proof in existing .trace/ani_layout_final/cp4_engine.md and cp5_react.md, or the conversation: changed files, rationale per defect, exact commands/results, before/after numeric values, authority/T5/V5 and CP4-entry mapping, and residual risks. Identify independent per-frame assertions. No new harness, evidence directory or report system is required.

## Re-Judgment Entry Criteria

- Frozen fixes and inspectable proof for all listed defects.
- Existing unit/browser tests reproduce default/inherited/key-order equality, changed-layer retention, own-layer velocity under parent motion, equal policy objects, transformed popLayout, StrictMode presence replay, iframe settle and class/style warnings.
- Independent expectations every affected frame in Chromium, Firefox and WebKit; prescribed E5 fixture and CP4 J19/J21/J22 proof complete.
- Required units, browsers, types and Biome pass; established COST stays within bounds.
- Any reproduced jump, velocity/opacity reset, equivalent-options interruption, wrong root, lost hold or missing mandatory warning remains FAIL. Missing required outputs/proof/access prevents acceptance and may produce BLOCK.

## Final Ruling

CP5 and the carried CP4 repair set are rejected. Original counterexamples substantially improve and required executable gates reproduce green. Seven independently reproduced correctness defects remain, with two incomplete coverage/warning obligations. Corrective work and re-judgment are required.

## Fix directive for the implementer

- **J-016:** Correct effective-motion and order-independent timing equality in packages/layout/src/motion.ts, its use in packages/layout/src/scope.ts, and packages/react/src/layout/context.ts. Extend packages/layout/src/__tests__/motion.test.ts, packages/react/src/layout/__tests__/layout.test.tsx and tests/browser/cases/layout.ts J16 with the exact default/inherited/key-order controls.
- **J-020:** Correct current visual retention in packages/layout/src/scope.ts (currentMotion/removal/history). Extend tests/browser/cases/layout.ts J20 with scale .8→1 before removal; prove x140/w40, retained position/size velocity and expiry.
- **J-025:** Correct map-derived velocity in packages/layout/src/scope.ts reconcileLayers. Extend tests/browser/cases/layout.ts J25 with moving-parent/own-scale; prove vx200, x(.02)=44.04752, every-frame rects and identity settle.
- **J-026:** Compare policy values in packages/react/src/layout/layout_group.tsx. Extend packages/react/src/layout/__tests__/layout.test.tsx and tests/browser/cases/react_layout.ts with equal/new maxDuration objects mid-run and a genuinely changed value.
- **J-027:** Correct own-transform/pose removal from popBox in packages/react/src/layout/presence.tsx. Extend packages/react/src/layout/__tests__/presence.test.tsx and tests/browser/cases/react_layout.ts with the exact CSS/visual boxes and an interrupted-enter exit.
- **J-028:** Preserve presence state and guard completion lifetime across replay in packages/react/src/layout/presence.tsx. Extend packages/react/src/layout/__tests__/presence.test.tsx and tests/browser/cases/react_layout.ts RL2/E5 with mid-enter/mid-exit moved-fiber replay and cleanup/hold assertions.
- **J-029:** Correct AnimatePresence implicit-scope routing in packages/react/src/layout/presence.tsx and scope-resolution support in packages/react/src/layout/context.ts. Extend packages/react/src/layout/__tests__/layout.test.tsx and tests/browser/cases/react_layout.ts with main-document/iframe sync-settle and independent disposal.
- **J-030:** Complete frame/size/radius/ownership expectations in tests/browser/cases/layout.ts J19–J22/J25 and retained-size momentum in packages/layout/src/__tests__/plan.test.ts. In tests/browser/cases/react_layout.ts use prescribed E5 enter y14/scaleX.8, exit y10/scaleX.9/.2 s, spring and centre-bottom origin; verify add/enter/layout trajectories every frame. Correct proof claims in .trace/ani_layout_final/cp4_engine.md and cp5_react.md after verification.
- **J-031:** Correct observer coverage in packages/react/src/layout/context.ts. Extend packages/react/src/layout/__tests__/layout.test.tsx and tests/browser/cases/react_layout.ts RL6 with memoized parent class/style changes, exactly-once warning and captured/update controls.


# Chief Justice route supersession — 2026-10-30

Status: **owner-approved**. The unavailable historical route is superseded for final adjudication.

## Situation

The 2026-10-29 substitution ruling reserved final P4 ratification (and the eventual P0–P6 final
tribunal) for the assigned route `openai/gpt-5.6-sol#high`. That route is not available on this
account; the available Sol-family model is `openai/gpt-6.1-sol#high` (the model that independently
judged P5 and accepted its technical evidence). P4 remains ACTING PASS in
`p4_drive_rejudgment_result.md`; P5's tribunal correctly returned BLOCK on J-P5-001 because the
reserved final ratification was absent.

## Ruling

- The owner authorizes `openai/gpt-6.1-sol#high` as the **superseding final Chief Justice route**
  for the P4 J-001 ratification and the final P0–P6 program tribunal.
- The ratification must be independent and read-only: inspect the original P4 FAIL, the J-001
  repair commit, `logs/j001/`, the P4 authority/C1–C11 and the focused L-DRIVE/L_DRIVE_EDGES rows;
  re-run focused checks where feasible. No source, test, authority, gate or tolerance change is
  permitted by the ratification.
- If the ratification finds PASS, P4 becomes **final TRIBUNAL PASS** and P5 J-P5-001 may be
  re-judged. If it finds FAIL, normal remediation continues; P5 stays blocked.
- This supersedes only the judge route, not the evidence standard. The P5 tribunal's acceptance of
  the f552728→ea1475c bridge remains its own verdict; the P4 ratification does not silently promote
  any other finding.

## Evidence

- `.trace/ani_ios_production/p4_drive_trial_result.md` — original FAIL (J-001).
- `.trace/ani_ios_production/p4_drive_rejudgment_result.md` — acting PASS.
- `.trace/ani_ios_production/reviews/chief_justice_substitution_20261029.md` — reserved route.
- `logs/j001/` — repair evidence.
- `.trace/ani_ios_production/p5_bench_trial_result.md` — P5 BLOCK J-P5-001.
- Owner ruling 2026-10-30: authorize gpt-6.1-sol#high as the superseding final route.

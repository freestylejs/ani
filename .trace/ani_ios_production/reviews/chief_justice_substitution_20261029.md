# Chief Justice route substitution — 2026-10-29

The assigned Chief Justice route (`openai/gpt-5.6-sol#high`, ChatGPT subscription) returned
`subscription_sharing_usage_limit_exceeded` on the P4 J-001 re-judgment. The program must continue
without treating an unavailable judge as PASS.

## Ruling

- P4 J-001 re-judgment is being performed by an **acting Chief Justice**:
  `opencode-go/gpt-5.6-luna#high`, read-only, same authority/evidence and the
  `judging-checkpoint-completion` standard.
- The acting verdict is recorded as `p4_drive_rejudgment_result.md` with an explicit
  “acting” qualifier.
- A final gpt-5.6-sol ratification of P4 (and the eventual P0–P6 final tribunal) is required when
  the assigned route is available. Until then, P4 is **acting PASS**, not a final Chief Justice
  PASS.
- No source, test, authority or gate is changed by this substitution. The evidence is unchanged;
  only the judge route changes.
- If the acting judge finds FAIL, normal remediation continues and the gpt-5.6-sol ratification is
  still required after the fix.

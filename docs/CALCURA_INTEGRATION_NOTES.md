# Calcura integration notes

These are read-only observations from the existing local Calcura checkout. No Calcura source was modified.

## Shared authentication

- `services/auth/authConfig.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `services/auth/supabaseClient.ts` persists sessions, refreshes tokens, and disables URL session detection.
- `services/auth/authService.ts` uses email OTP with `shouldCreateUser: true`, lowercases email, verifies with `type: 'email'`, and exposes friendly error mapping.
- `docs/SUPABASE_AUTH_SETUP.md` documents the same Supabase Auth project and shared email configuration.
- Classroom mirrors these external contracts; its implementation remains independently owned and tested.

## Performance semantics

- `services/performanceSummary.ts` aggregates problem episodes into overall metrics, per-technique and per-skill evidence, comparison periods, focus areas, recent activity, and weekly/trend buckets. It distinguishes episode count from answer attempts and tracks first-attempt and independent completion rates.
- `services/performanceTrends.ts` builds bounded day/week/month buckets using the device's local calendar.
- `services/performanceRecommendations.ts` ranks skill evidence and returns focus suggestions.
- `services/performanceExport.ts` exports aggregate skill evidence locally as CSV.
- `components/performance/` presents learning progress, performance evidence, recent activity, recommendations, trends, and export.

Potential future analytics concepts are summary rates/counts, skill and technique evidence, time-bounded trends, first-attempt outcomes, focus recommendations, and privacy-aware exports. Classroom must not copy the implementation or depend on Calcura's internal source paths. A versioned event contract and reviewed aggregation semantics sit between the student application and cloud analytics.

## Student result integration (Phase 5)

Calcura consumes published assignments through the stable activity-key contract, continues to generate/solve/check math through its own guided runtime, and records ordinary personal attempts independently. Phase 5 additionally sends one minimal terminal assignment-slot result through `record_assignment_problem_result`. That RPC derives the user from `auth.uid()` and validates current active enrollment and published assignment state. A dedicated account-scoped local outbox supports idempotent retry; assignment progress is recovered from persisted result slots plus pending local results. No generated math, answer, problem object, or guided-event stream is uploaded. Teacher email/progress is returned only by the membership-authorized `get_assignment_student_progress` RPC; emails are not copied into enrollment rows or made generally readable.

Terminal outcomes are `correct` and `surrendered`; `abandoned` remains only a personal Calcura attempt and does not complete a slot. Performance/taxonomy values are client-reported context, not cryptographically verified academic truth. Phase 6 adds teacher-only summaries using the existing result contract: accuracy, attempts/time, surrender counts, activity-block and assignment-position aggregates, plus enrolled-student metrics. “Started” means one or more terminal results exist; unsubmitted and abandoned work is not observable. No new Calcura event, telemetry field, generated mathematics, or student-app change is part of Phase 6. Production remains gated because the hosted shared schema has not been deployed.

## Assignment activity V1 capability mapping

The Phase 3 product-owned contract keys in `docs/ASSIGNMENT_ACTIVITY_CONTRACT.md` were checked against these current Calcura exports (read-only inspection; this repository was not modified):

| Classroom activity key              | Current Calcura capability | Source                                                  |
| ----------------------------------- | -------------------------- | ------------------------------------------------------- |
| `integration.basic_trig.v1`         | `generateBasicTrig`        | `services/math/domains/integration/basicTrig.ts`        |
| `integration.u_substitution.v1`     | `generateUSub`             | `services/math/domains/integration/substitution.ts`     |
| `integration.log_u_substitution.v1` | `generateLogUSub`          | `services/math/domains/integration/substitution.ts`     |
| `integration.by_parts.v1`           | `generateByParts`          | `services/math/domains/integration/byParts.ts`          |
| `integration.inverse_trig.v1`       | `generateInverseTrig`      | `services/math/domains/integration/inverseTrig.ts`      |
| `integration.partial_fractions.v1`  | `generatePartialFractions` | `services/math/domains/integration/partialFractions.ts` |

These function names are a current implementation mapping only, not durable Classroom IDs. Classroom assignments persist their contract key/version and requested problem count. Calcura remains the single math engine and may assign a finer generated skill taxonomy after it creates a problem.

## Future change and risk

Calcura continues to keep generic personal practice progress separate from classroom assignment results. The Phase 5 result contract establishes offline retry, duplicate handling, student authorization, and teacher progress for terminal assignment slots only. Phase 6 aggregates these existing rows in Classroom; it does not expand the contract into step-level uploads, a rich pedagogical event stream, or student-app telemetry. Further analytics require separate privacy, retention, and product review.

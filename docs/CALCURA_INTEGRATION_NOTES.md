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

## Future student integration

Calcura will eventually add class join, assigned-work discovery, assignment launch, and versioned learning-event submission to its student experience. It will continue to generate problems, run solving interactions, and decide correctness. Contract design and student-side changes belong to the later student integration phase. Staff will also eventually need a privacy-reviewed student display identity; do not copy Auth emails into enrollment rows as a shortcut.

## Future change and risk

Calcura currently stores most practice performance locally. Cloud classroom analytics will require an intentional synchronization and consent/privacy design. Do not retrofit cloud upload or alter student auth/performance behavior during this database foundation phase. The integration phase must define event minimization, offline retry, duplicate handling, deletion/export, and classroom authorization before any upload path is enabled.

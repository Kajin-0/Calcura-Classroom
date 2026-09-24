# Roadmap

The phases deliberately keep database tenancy and policy design ahead of product breadth.

Phases 0–5 are complete locally. Phase 5 adds a terminal result contract and teacher-visible assignment progress on top of the certified Phase 1–3 schema, integrated with the Phase 4 Calcura student consumer. Production remains untouched and the shared hosted schema still needs to be baselined/deployed; Calcura's Classroom feature remains disabled by default. The next planned work is Phase 6.

| Phase | Scope                                                    |
| ----- | -------------------------------------------------------- |
| 0     | Engineering foundation — complete                        |
| 1     | Workspace + Classroom schema + RLS — complete            |
| 2     | Teacher class management — complete                      |
| 3     | Assignment model + teacher assignment builder — complete |
| 4     | Student Calcura integration — complete                   |
| 5     | End-to-end classroom vertical slice — complete           |
| 6     | Basic analytics                                          |
| 7     | Teacher vs Pro entitlement split                         |
| 8     | Stripe Pro billing                                       |
| 9     | Pilot feedback + diagnostic analytics                    |
| 10    | Team                                                     |
| 11    | School                                                   |
| 12    | Institution                                              |

Classroom stores practice-family intent and minimal terminal assignment-slot outcomes; Calcura remains the only math engine and does not write generated problems to Classroom. Phase 5 completion rows are client-reported evidence validated for identity, enrollment, assignment/item relationship, state, ordinal, and idempotency—not cryptographically verified academic truth. Phase 6 may add basic analytics over this boundary; detailed LearningEvent telemetry, billing, and institutional features remain separate later work. Stripe will not be introduced before Phase 8.

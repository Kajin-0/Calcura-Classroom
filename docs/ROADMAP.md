# Roadmap

The phases deliberately keep database tenancy and policy design ahead of product breadth.

Phases 0–7 are landed. Phase 5 adds a terminal result contract and teacher-visible assignment progress on top of the certified Phase 1–3 schema, integrated with the Phase 4 Calcura student consumer. Phase 6 adds compact teacher-only aggregates over existing result rows, without adding telemetry. Phase 7 adds safe assignment editing, duplication, and result-history-protected deletion. Phase 8 establishes workspace-scoped plan entitlements and server-resolved capabilities; it does not add billing or paywall current Free functionality. Production remains untouched and the shared hosted schema still needs to be baselined/deployed; Calcura's Classroom feature remains disabled by default. No later phase is included in this implementation.

| Phase | Scope                                                                  |
| ----- | ---------------------------------------------------------------------- |
| 0     | Engineering foundation — complete                                      |
| 1     | Workspace + Classroom schema + RLS — complete                          |
| 2     | Teacher class management — complete                                    |
| 3     | Assignment model + teacher assignment builder — complete               |
| 4     | Student Calcura integration — complete                                 |
| 5     | End-to-end classroom vertical slice — complete                         |
| 6     | Basic analytics — complete locally                                     |
| 7     | Assignment lifecycle management — complete locally                     |
| 8     | Workspace entitlements + capability architecture — implemented locally |
| 9     | Stripe Pro billing                                                     |
| 10    | Pilot feedback + diagnostic analytics                                  |
| 11    | Team                                                                   |
| 12    | School                                                                 |
| 13    | Institution                                                            |

Classroom stores practice-family intent and minimal terminal assignment-slot outcomes; Calcura remains the only math engine and does not write generated problems to Classroom. Phase 5 completion rows are client-reported evidence validated for identity, enrollment, assignment/item relationship, state, ordinal, and idempotency—not cryptographically verified academic truth. Phase 6 aggregates only these existing rows; rich LearningEvent telemetry and institutional features remain later work. Next: Phase 9 — Stripe Pro billing. That phase is not included here.

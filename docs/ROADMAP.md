# Roadmap

The phases deliberately keep database tenancy and policy design ahead of product breadth.

Phases 0–10.5b are landed. Phase 5 adds a terminal result contract and teacher-visible assignment progress on top of the certified Phase 1–3 schema, integrated with the Phase 4 Calcura student consumer. Phase 6 adds compact teacher-only aggregates over existing result rows, without adding telemetry. Phase 7 adds safe assignment editing, duplication, and result-history-protected deletion. Phase 8 establishes workspace-scoped plan entitlements and server-resolved capabilities without paywalling current Free functionality. Phase 8.5 improves the teacher dashboard with one workspace-scoped read-only aggregate of existing results. Phase 9 adds workspace-scoped Stripe Pro billing; Phase 10 adds a deterministic Calcura-owned problem-slot overlay for Pro teachers. Production Supabase, Stripe live objects, Auth, DNS, and the teacher-app host remain separate deployment gates, and Calcura's Classroom student feature remains disabled by default.

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
| 8.5   | Premium teacher dashboard — implemented locally                        |
| 9     | Stripe Pro billing — source landed; production configuration pending   |
| 10    | Pro problem-slot editing — landed                                      |
| 10.5b | Classroom brand alignment — landed                                     |
| 10.6  | Production-readiness remediation — in progress                         |
| 11    | Team                                                                   |
| 12    | School                                                                 |
| 13    | Institution                                                            |

Classroom stores practice-family intent, generation specifications, problem-slot controls, and minimal terminal assignment-slot outcomes; Calcura remains the only math engine and generated mathematics is not stored in Classroom. Phase 5 completion rows are client-reported evidence validated for identity, enrollment, assignment/item relationship, state, ordinal, and idempotency—not cryptographically verified academic truth. Phases 6 and 8.5 aggregate only these existing rows; rich LearningEvent telemetry and institutional features remain later work. Implemented source is not equivalent to production deployment.

# Roadmap

The phases deliberately keep database tenancy and policy design ahead of product breadth.

Phases 0–3 are complete. Phase 1 implements and tests the local workspace/classroom schema and RLS boundary; Phase 2 provides teacher class management; Phase 3 adds the local assignment model and teacher builder. Production remains untouched and its existing schema still needs to be baselined. The next planned work is Phase 4.

| Phase | Scope                                                    |
| ----- | -------------------------------------------------------- |
| 0     | Engineering foundation — complete                        |
| 1     | Workspace + Classroom schema + RLS — complete            |
| 2     | Teacher class management — complete                      |
| 3     | Assignment model + teacher assignment builder — complete |
| 4     | Student Calcura integration                              |
| 5     | End-to-end classroom vertical slice                      |
| 6     | Basic analytics                                          |
| 7     | Teacher vs Pro entitlement split                         |
| 8     | Stripe Pro billing                                       |
| 9     | Pilot feedback + diagnostic analytics                    |
| 10    | Team                                                     |
| 11    | School                                                   |
| 12    | Institution                                              |

Phase 3 stores practice-family intent only; it does not include student assignment consumption or generated problems. The next phase integrates the assignment contract with Calcura while preserving Calcura as the only mathematics engine. Billing, institutional features, and advanced analytics depend on the earlier access model and student data contract. Stripe will not be introduced before Phase 8.

# Assignment activity contract

**Version 1 is the Classroom-to-Calcura practice-family contract.** A contract identity is the pair `(activity_contract_version, activity_key)`. These keys describe teacher intent and are durable product identifiers; generator function names and Calcura analytics taxonomy values are not persisted as assignment identity.

| V1 key                              | Teacher label                   | Current Calcura capability |
| ----------------------------------- | ------------------------------- | -------------------------- |
| `integration.basic_trig.v1`         | Basic trigonometric integration | `generateBasicTrig`        |
| `integration.u_substitution.v1`     | U-substitution                  | `generateUSub`             |
| `integration.log_u_substitution.v1` | Logarithmic U-substitution      | `generateLogUSub`          |
| `integration.by_parts.v1`           | Integration by parts            | `generateByParts`          |
| `integration.inverse_trig.v1`       | Inverse-trigonometric forms     | `generateInverseTrig`      |
| `integration.partial_fractions.v1`  | Partial fractions               | `generatePartialFractions` |

The current mappings were verified against the read-only Calcura source in `services/math/index.ts` and the corresponding integration domain modules. Generator names in the table are implementation notes only. Classroom never imports Calcura source.

An assignment item represents a practice block: an activity key/version plus a requested problem count. It does not represent a specific mathematical problem. Classroom stores no generated integral, problem object, answer, worked solution, guided step, equivalence logic, or seed. Calcura remains responsible for generation, interaction, grading, and correctness.

The selected activity is intentionally separate from Calcura's eventual generated-problem analytics taxonomy. For example, a teacher may select `integration.partial_fractions.v1`, while Calcura later determines the generated problem's finer skill variant. The family choice is the assignment request; Calcura decides the generated taxonomy.

V1 key semantics must not be silently changed. Incompatible changes require a new key/version and a reviewed cross-repository mapping. Student consumption is not implemented in Phase 3; Phase 4 will add the student-side launch and contract mapping.

# Assignment generation intent

Classroom stores what a teacher wants practiced; Calcura remains the only owner of problem generation, Guided steps, answer policies, checking, and mathematical content. Classroom persists no expressions or generated problem objects.

## Version 1

New practice blocks carry a bounded `generation_spec_version = 1`, a difficulty profile, a variant policy, and a database-generated UUID seed. The database validates the finite activity/profile combinations supported by Calcura. `auto` is the default and maps to the existing V1 activity generator. Explicit Basic Trig Beginner/Intermediate profiles and the U-substitution Beginner profile select existing Guided generator capabilities; other explicit profiles are exposed only where the current mapped generator has that profile. The UI and Calcura integration each keep the same reviewed compatibility matrix.

Variant policies are:

- `individualized`: a deterministic slot seed includes the authenticated student's stable identity.
- `same_for_all`: the student's identity is omitted, so a given block and position produce the same Calcura-generated problem for every student.

Calcura derives a seed from the spec version, immutable block ID, server-created item seed, assignment position, policy, and—when individualized—the authenticated user ID. The seeded request runs in a dedicated, serialized browser worker using Calcura's existing Guided generators. Session-global recent-repeat rerolls are bypassed only for versioned deterministic slots: they would make a slot depend on unrelated prior activity. Ordinary Guided/Free Play and legacy Classroom rows retain the existing generator path and recent-repeat behavior. This deterministic identity is not a cryptographic integrity guarantee.

Rows that predate this contract keep all four new fields `NULL` and continue using the pre-8.6 Auto mapping. New rows default to Auto/individualized with a fresh database-generated seed. An edit may explicitly upgrade a legacy row to V1. Published assignment content remains database-immutable, including its generation intent; use the existing duplicate flow to author a changed version. Duplication copies validated intent but creates fresh block IDs and fresh generation seeds, and never copies student results.

Exact teacher-side problem preview is deferred: it must call Calcura's actual engine through a shared Calcura-owned path rather than reproducing generators in Classroom. A future per-position lock/replace/reorder editor can extend the intent contract with versioned slot metadata or a dedicated slot record; generated LaTeX remains derived output, never the source of truth.

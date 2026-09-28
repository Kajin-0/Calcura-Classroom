# Assignment generation intent

Classroom stores what a teacher wants practiced; Calcura remains the only owner of problem generation, Guided steps, answer policies, checking, and mathematical content. Classroom persists no expressions or generated problem objects.

## Version 1

New practice blocks carry a bounded `generation_spec_version = 1`, a difficulty profile, a variant policy, and a database-generated UUID seed. The database validates the finite activity/profile combinations supported by Calcura. `auto` is the default and maps to the existing V1 activity generator. Explicit Basic Trig Beginner/Intermediate profiles and the U-substitution Beginner profile select existing Guided generator capabilities; other explicit profiles are exposed only where the current mapped generator has that profile. The UI and Calcura integration each keep the same reviewed compatibility matrix.

Variant policies are:

- `individualized`: a deterministic slot seed includes the authenticated student's stable identity.
- `same_for_all`: the student's identity is omitted, so a given block and position produce the same Calcura-generated problem for every student.

Calcura derives a seed from the spec version, immutable block ID, server-created item seed, assignment position, policy, and—when individualized—the authenticated user ID. The seeded request runs in a dedicated, serialized browser worker using Calcura's existing Guided generators. Session-global recent-repeat rerolls are bypassed only for versioned deterministic slots: they would make a slot depend on unrelated prior activity. Ordinary Guided/Free Play and legacy Classroom rows retain the existing generator path and recent-repeat behavior. This deterministic identity is not a cryptographic integrity guarantee.

Rows that predate this contract keep all four new fields `NULL` and continue using the pre-8.6 Auto mapping. New rows default to Auto/individualized with a fresh database-generated seed. An edit may explicitly upgrade a legacy row to V1. Published assignment content remains database-immutable, including its generation intent; use the existing duplicate flow to author a changed version. Duplication copies validated intent but creates fresh block IDs and fresh generation seeds, and never copies student results.

## Optional problem-slot overlay (Phase 10)

Pro teachers may lazily materialize `assignment_problem_slots` for a draft item. The slot table stores only stable slot identity, current display position, original `source_ordinal`, optional server-generated `regeneration_seed`, lock state, and a bounded slot-spec version. It never stores an expression, answer, rendered LaTeX, or generated problem object. No slot rows means the existing V1 path is unchanged.

An unregenerated slot (`regeneration_seed IS NULL`) calls the exact V1 seed derivation with its stable `source_ordinal`, not its current position. This makes first-time materialization mathematically transparent. A regenerated slot uses Calcura's separate `calcura-assignment-problem-slot` seed domain, binding generation/slot spec versions, item ID and base generation seed, slot ID and regeneration seed, variant policy, and either the shared identity or stable student identity. Display position is deliberately excluded. Reordering therefore changes presentation only; regeneration changes only the selected slot's seed family.

Preparation is one atomic, idempotent RPC call and is Pro-capability-gated on the server. Every mutation locks the assignment row and is draft-only, serializing against publication. Direct authenticated writes to the slot table are denied. Editing an item's activity, count, difficulty, or variant policy intentionally clears its optional overlay; this preserves basic Teacher Free authoring after a downgrade. A pre-8.6 draft item with all generation fields NULL is explicitly upgraded to V1 Auto/individualized with a server-generated seed only when its owner enters the Pro slot editor; ordinary reads do not change it.

Duplication copies customized display order and lock state as structural authoring intent, but allocates fresh assignment/item/slot identities and fresh item generation seeds. It clears every copied `regeneration_seed`, so the duplicate does not inherit a concrete regenerated problem family and has no copied student results.

Calcura owns the preview bridge and invokes its normal assignment generator. Classroom sends only the validated, versioned generation contract in a same-origin-checked `postMessage`; the generated preview stays in Calcura and is never written back. Individualized previews are explicitly representative, using a fixed deterministic preview identity; same-for-all previews are exact. Future slot editing can add derived preview/regenerate/lock/reorder operations without storing rendered mathematics.

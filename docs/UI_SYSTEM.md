# Classroom UI and motion

Phase 10.5 refines presentation on top of the unlanded Phase 10 implementation.
It changes no schema, RPC, generation, entitlement, billing, or lifecycle contract.

## Shared language

- `src/styles/global.css` owns neutral color, spacing, radius, and motion tokens.
  Page titles are 28–32 px, section titles 18 px, body/control text 14–15 px,
  secondary text 12–13 px, and small labels 11–12 px.
- Spacing uses a 4/8/12/16/20/24/32/40/48 px scale. Use larger gaps between
  sections and smaller gaps within a group. Data rows use separators rather than
  individual raised cards. The dashboard's four metrics share one surface.
- Primary actions use dark fill; secondary actions use a neutral border; quiet
  actions are text-led. Actions remain visible on keyboard and touch—not hover-only.
  Destructive actions stay neutral until focus/hover or their existing confirmation.
- Plan and lifecycle labels are neutral. Billing is a settings surface, not a
  marketing page. No new tier presentation or gating is introduced.

## Motion and accessibility

- Fast/base/slow durations are 120/180/240 ms. Entrances use at most 5 px travel;
  buttons use a 1 px press. No looping animation, skeleton pulse, or JS frame loop.
- Native generation disclosures progressively enhance height transitions where
  `interpolate-size` is supported; other browsers retain working native disclosure.
- `useReorderMotion` animates only the persisted slot order with stable row IDs.
  It batches geometry reads, skips stale coordinates after width changes, and
  never calls a domain service or changes selection, generation, seeds, or order.
- Reduced motion disables CSS transitions/entrances and prevents/cancels row
  animations. Selection, feedback, focus, and persisted order remain visible.
- A skip link reaches the teacher main region. Shared static loading placeholders
  announce one status; decorative bars are hidden from assistive technology.
  Slot successes use a polite status; failures use an alert.
- Existing confirmations stay inline (not modal). Native selects retain their
  platform behavior. No new menu, focus trap, or animation dependency is added.

## Browser review

`UI_REVIEW_DIR=/tmp/calcura-phase10-5-review npm run test:e2e` optionally captures
uncommitted review screenshots at 1440, 1280, 900, 768, 390, and 430 px.
The suite checks overflow, keyboard access, Free/Pro controls, reduced motion,
and unchanged seeds during reorder. Screenshots use deterministic local API and
preview-bridge fixtures; they are not a new database or math certification.

Tables keep their accessible structure and contained horizontal scrolling on
small screens. Authoring controls and the selected preview stack on narrow widths.

## Phase 10.5 verification

Base: `feat/classroom-phase10-problem-editing` at
`94f2dd061d9822d20bd64510dabc3ff66e2cd1b7`. The UI branch preserves that history.

Sequential local checks:

- `npm run format:check`, `npm run lint`, `npm run typecheck`: pass.
- `npm test`: 20 files, 132 tests pass.
- `UI_REVIEW_DIR=/tmp/calcura-phase10-5-review npm run test:e2e`: 12 tests pass,
  one Chromium worker. No horizontal page overflow at the six review widths.
- `npm run build`: pass; JavaScript 590.27 kB (163.39 kB gzip), CSS 43.61 kB
  (8.31 kB gzip). The existing >500 kB chunk advisory remains; no dependency added.
- `git diff --check`: pass.

Screens inspected include sign-in, populated/loading/empty/error dashboard,
class list/detail, assignment list/create/edit, generation disclosure, analytics,
problem editor/bulk confirmation, publish/delete confirmations, and Free/Pro billing.
Local screenshots are intentionally not committed. No screenshot assertion was
removed or loosened. The browser API/preview fixtures do not contact Stripe or
mutate the active preview database.

Database and Calcura math certification were not rerun: no data contract, query,
schema, generator, preview message contract, or student source changed in this pass.
Product-owner visual review remains the next step at `http://127.0.0.1:5174`.

# Classroom UI and motion

Phase 10.5 refines presentation on top of the unlanded Phase 10 implementation.
It changes no schema, RPC, generation, entitlement, billing, or lifecycle contract.

> **Phase 11 supersedes the palette, shell, and dashboard descriptions below.**
> Neutral-only color, dark primary buttons, the top header, and the single-surface
> metric strip no longer apply. Accessibility, motion, and data-contract rules in
> this file still do. See "Phase 11 UI overhaul" at the end.

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

## Phase 10.5b brand alignment

Continues from Phase 10.5 at `1617670c621222eee61a8321a9a93cece876a485`
on `feat/classroom-phase10-5b-brand-alignment`. No Phase 10 history is replaced.

The public [Classroom page](https://calcura.study/classroom/) was inspected in
Chromium at 1440 × 1000 and 390 × 844, including computed styles of its portal
preview. Its navy ink/primary buttons (`#0b1730`), cool canvas (`#f5f8fc`),
white surfaces, quiet blue-gray (`#edf3fa`), borders (`#dfe7f1`, `#ccd8e7`),
blue accent (`#1769e0`, `#0f54ba`), and chart blue (`#2b6fce`) define the app
palette. Body metadata uses the site's darker slate `#53647b` for contrast.

- The app deliberately uses the site's navy as a compact header surface, not
  its marketing layout. The integral mark/lowercase wordmark identifies Calcura;
  the link keeps its accessible name and route. Light header text/focus colors
  are adapted to the dark surface. Active navigation retains `aria-current` and
  gains a blue underline and tinted background.
- Warm canvas `#f7f7f5`, gray-green quiet/selected surfaces, olive charts, and the
  tan outcome track are removed. Primary actions remain navy, as on the public
  page; blue marks focus, selection, links, progress, and the completion metric.
- Classes and assignments use shared white list surfaces with dividers, not
  raised cards per row. The problem editor uses a cool inset workspace, a blue
  selected row, and a navy-edged white preview. Billing stays a settings page.
- Plan labels (including Pro), locks, and lifecycle badges remain neutral.
  No colored upsell treatment, gradient, new widget, shadow system, or motion is
  added. The Phase 10.5 typography, loading states, motion, accessibility, and
  responsive behavior remain in place.

`UI_REVIEW_DIR=/tmp/calcura-phase10-5b-review npm run test:e2e` captures final
screens beside the earlier Phase 10.5 screenshots in `/tmp/calcura-phase10-5-review`.
Public-page reference captures are in `/tmp/calcura-phase10-5b-public`.
These are disposable, untracked review artifacts, not golden-image assertions.
The additional shell regression checks keyboard navigation, accessible branding,
active-page semantics, text contrast ≥4.5:1, and focus contrast ≥3:1 at desktop
and mobile widths. It does not assert arbitrary color literals or pixel spacing.

### Phase 10.5b verification

Sequential checks (no database, Stripe, or Calcura math jobs):

- `npm run format:check`, `npm run lint`, `npm run typecheck`: pass.
- `npm test`: 20 files / 132 tests pass.
- `UI_REVIEW_DIR=/tmp/calcura-phase10-5b-review npm run test:e2e -- tests/e2e/dashboard.spec.ts`:
  5 focused tests pass.
- `UI_REVIEW_DIR=/tmp/calcura-phase10-5b-review npm run test:e2e`: 13 tests pass,
  one Chromium worker; six review widths without horizontal page overflow.
- `npm run build`: pass; JS 590.52 kB (163.45 kB gzip), CSS 46.24 kB
  (8.72 kB gzip). Compared with Phase 10.5: +0.25 kB JS / +2.63 kB CSS;
  no dependency change. The existing >500 kB bundle advisory remains.
- `git diff --check`: pass.

Inspected final dashboard desktop/mobile against both the public preview and
the Phase 10.5 captures, plus class list, draft builder, published analytics,
problem editor desktop/mobile, and Free/Pro billing. Browser fixtures retain the
existing API/preview contracts; no real billing or data mutation was performed.
The existing port-5174 preview serves the new palette without restarting it.
Product-owner visual acceptance is still pending.

## Phase 11 UI overhaul

Presentation only, on `feat/classroom-ui-overhaul`. It aligns the teacher app with
the redesigned public site. No schema, RPC, entitlement, billing, lifecycle, or
dashboard-aggregate contract changed, and no data field or telemetry was added.

### Tokens and type

- `src/styles/tokens.css` owns color, spacing, radius, shadow, and motion tokens.
  Components use tokens, not color literals. `global.css` and each feature
  stylesheet consume them.
- Typography is Inter Variable, self-hosted through `@fontsource-variable/inter`
  (no external font request). Numbers in metrics use tabular figures.
- Semantic color is fixed: **blue = progress/completion**, **green = correct and
  accuracy**, **amber = surrendered**, **red = destructive or failed**. Plan and
  lifecycle labels stay neutral; Free is never presented as lesser.

### Shell

- At 900 px and wider the shell is a fixed navy left rail (brand, navigation, and
  an account card with the plan label and Sign out). Below 900 px it becomes a
  compact top bar with a fixed bottom tab bar; content reserves room for it and
  for the safe-area inset. The skip link, `aria-current`, and the brand-to-Dashboard
  tab order are unchanged. Icons are inline, decorative (`aria-hidden`) SVGs in
  `src/components/icons.tsx`; no icon dependency was added.

### Dashboard

- Layout responds to its own width with container queries, not only the viewport,
  so it stays correct beside the rail. Rows keep real table/definition semantics;
  the ratio columns collapse into labelled stacked rows on narrow containers.
- Completion is the featured KPI. Outcome quality is a navy panel with a ring chart
  (correct vs. surrendered arcs) whose legend and figures stay readable as text.
  Null denominators still show "—"; nothing is rounded into a false value.
- The ring figure is its own size container: the centre value and label scale in
  `cqw` units so they always clear the inner circle (checked at 100%, 81%, and 0%;
  at least 20 px of clearance). The group sits a few px low to balance the heavy
  number against its lighter label. Classes and technique performance stack full
  width, with technique meters in two columns from 720 px, so no card is stretched
  beside a taller neighbour. Long unbroken class names wrap inside their rows.
- Entrance and meter-reveal motion runs once, only when motion is allowed, and
  never replays when the class filter changes. Reduced motion renders final state.

### Accessibility and touch

- Touch targets are 44 px on coarse pointers, including form controls, summaries,
  and row action links. Actions are never hover-only. Tables keep contained
  horizontal scrolling. No horizontal page overflow from 320 to 1920 px.
- Text contrast is at least 4.5:1 on the rail and navy panels; focus outlines and
  chart arcs are at least 3:1 against their surface.

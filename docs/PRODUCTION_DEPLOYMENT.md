# Classroom production deployment preparation

This document is a preparation checklist, not authorization to deploy. Phase
10.6 does not apply migrations, deploy Edge Functions, configure Stripe, set DNS,
change Supabase Auth, or enable Classroom in production.

## Intended public topology

| Surface                                         | Intended URL                       | Owner                                       |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| Student Calcura                                 | `https://calcura.study`            | Calcura / Calcura-Site                      |
| Classroom marketing page                        | `https://calcura.study/classroom/` | Calcura-Site                                |
| Teacher application                             | `https://classroom.calcura.study`  | Calcura-Classroom frontend                  |
| Calcura embedded application / preview provider | `https://calcura.study/app/`       | Calcura web artifact served by Calcura-Site |

The marketing page and teacher application are separate deployments. The
repository contains no verified production hosting or DNS configuration for
`classroom.calcura.study`; the host must be established and tested separately.

## Deployment variables

Values below are names and example forms only. Obtain public values from the
intended Supabase project. Never copy a service-role/secret key or Stripe secret
into a browser variable, tracked file, build log, or issue.

### Public Classroom frontend

| Variable                        | Browser-safe | Required                    | Purpose / expected form                                                                                       |
| ------------------------------- | ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Yes          | Yes                         | Shared project URL, e.g. `https://<project-ref>.supabase.co`                                                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes          | Yes                         | Supabase publishable key (legacy anon key only if the project still uses it); never a secret/service-role key |
| `VITE_CALCURA_APP_URL`          | Yes          | Yes for Pro problem preview | Full Calcura app URL including mount path: `https://calcura.study/app/`                                       |

The Vite production output directory is `dist/`. The root-hosted teacher SPA
needs its host configured to serve `index.html` for application routes such as
`/signin`, `/app`, and `/app/billing`. Do not replace
`https://calcura.study/classroom/`, which remains the marketing page.

### Supabase Edge Function server configuration

| Variable                                             | Browser-safe | Required                             | Purpose / expected form                                                                            |
| ---------------------------------------------------- | ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                                       | No           | Yes                                  | Supabase project URL injected into the Edge Function runtime                                       |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | No           | Yes                                  | Trusted server key used only by Edge Functions; use the platform-provided supported value          |
| `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`    | No           | Yes for authenticated function calls | Public key used server-side with the caller's bearer token to validate the user                    |
| `APP_ORIGIN`                                         | No           | Yes                                  | Exact trusted teacher-app origin, `https://classroom.calcura.study`; not a request `Origin` header |

The current source reads the aliases shown above directly. Confirm which default
names the target Edge Function runtime injects before deployment. Never put any
server key under a `VITE_` name.

`APP_ORIGIN` is also the exact Edge Function CORS allow-origin. The Stripe
Checkout success URL is constructed as
`https://classroom.calcura.study/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
the cancel URL is
`https://classroom.calcura.study/app/billing?checkout=cancelled`; the Portal
returns to `https://classroom.calcura.study/app/billing`. These targets come
from trusted `APP_ORIGIN` plus fixed server paths, never from the request's
`Origin` header or a browser-supplied redirect.

### Stripe server configuration

| Variable                      | Browser-safe | Required                   | Purpose / expected form                                                              |
| ----------------------------- | ------------ | -------------------------- | ------------------------------------------------------------------------------------ |
| `STRIPE_MODE`                 | No           | Yes                        | Exactly `test` or `live`; must match every Stripe object/key used by this deployment |
| `STRIPE_SECRET_KEY`           | No           | Yes                        | `sk_test_…` for test or `sk_live_…` for live                                         |
| `STRIPE_WEBHOOK_SECRET`       | No           | Yes for webhook processing | `whsec_…` signing secret for this exact endpoint and mode                            |
| `STRIPE_PRO_PRODUCT_ID`       | No           | Yes                        | Mode-matched Pro Product ID (`prod_…`)                                               |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | No           | Yes                        | Mode-matched active USD $19/month recurring Price (`price_…`)                        |
| `STRIPE_PRO_ANNUAL_PRICE_ID`  | No           | Yes                        | Mode-matched active USD $149/year recurring Price (`price_…`)                        |

The server accepts only the bounded browser intervals `monthly` and `annual` and
maps each to its configured server-side Price ID. It retrieves and checks the
Price and Product (active state, mode, Product identity, amount, currency, and
cadence) before offering Checkout. Do not reuse test IDs in a live deployment.
The Phase 9 SQL migration contains test-session validation; the Phase 10.6
follow-up broadens the service-role-only persistence RPC to accept both session
ID forms. Both are required before live Checkout can be enabled.

## Stripe mode and failure policy

Run a deployment in one mode at a time. The secret-key prefix, canonical
Customer/Checkout Session/Subscription `livemode`, webhook event mode, Product,
and Price objects must agree with `STRIPE_MODE`. Mismatches fail closed. A
supported Price must also match the configured Pro Product and the exact $19
monthly or $149 annual USD contract. No Stripe ID supplied by the browser is
trusted for plan selection.

Stripe remains a billing state source. Verified webhook/recovery reconciliation
updates workspace billing and the existing workspace entitlement; the
Phase-8 capability resolver remains authoritative. A Checkout return only
displays a pending status and never grants Pro. Duplicate events are
durably-deduplicated; relevant events retrieve canonical subscription state, so
delivery order is not authority. Scheduled cancellation retains Pro through
the paid period. `past_due` has the existing non-renewing seven-day grace.
Unsupported prices and `incomplete`, `incomplete_expired`, `unpaid`, `trialing`,
or `paused` states resolve to Teacher Free. Ended paid periods resolve to Free.
Stripe/API outages fail closed for new grants; Stripe should retry unprocessed
webhook requests.

The intended live webhook destination is:

```text
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe only to the event set handled by the implementation:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

The webhook function has `verify_jwt = false` because Stripe authenticates via
the raw-body `Stripe-Signature`; all other billing functions require JWT. Do not
disable signature verification or transform the request body before verifying.

## Calcura preview origin contract

Classroom embeds the actual Calcura app from `VITE_CALCURA_APP_URL` and sends
only the bounded versioned generation intent used by the existing Phase 10
preview protocol. Classroom pins `postMessage` to the Calcura origin and checks
both the iframe source and reply origin. Calcura checks `event.source`, the
configured exact origin allowlist, and the versioned message schema; preview
does not mutate the database or receive privileged data.

The currently landed Calcura source already supports this allowlist through its
build-time variable. The existing public Calcura artifact must be rebuilt with
the production-only entry below before production previews can work:

```text
VITE_CLASSROOM_PREVIEW_ORIGINS=https://classroom.calcura.study
```

Use the appropriate existing Calcura web release process and refresh the Site
artifact from that exact certified build in a separately authorized checkpoint.
Do not add unrelated origins to the production allowlist. Local development
origins remain separate development configuration. No Calcura source change is
identified as necessary. Also verify the Calcura hosting response headers permit
the intended Classroom parent to embed `/app/` (no conflicting
`X-Frame-Options` or `frame-ancestors` policy); this host-level setting was not
inspected or changed.

## Supabase Auth configuration to prepare

Remote Auth configuration was not inspected or changed. Before activation,
confirm the shared project has email OTP delivery configured and configure:

```text
Site URL: https://classroom.calcura.study
Redirect URL allowlist:
  https://classroom.calcura.study
  https://classroom.calcura.study/signin
```

The current application sends a typed email OTP and verifies it in the app; it
does not pass an explicit `redirectTo`, use OAuth, or implement password-reset
links. Verification then navigates client-side to `/app`; `/app` is not an Auth
callback. Keep the allowlist exact to this teacher origin. If the Auth email
template or sign-in method is changed to use callback links later, separately
test that flow and add only its required callback. Sign-out calls Supabase
sign-out and returns to the signed-out application route; it does not need
another host.

## Read-only predeployment audit

Do not link or repair remote migration history as part of this preparation.
Before a separately approved deployment, independently verify the project ref
through the Supabase dashboard/CLI, then run the read-only migration listing
against the already-linked intended project:

```bash
npx supabase migration list --linked
```

Compare both sides against every checked-in migration in timestamp order.
Investigate every remote-only version and every missing local version before
any write. Do not use `db push`, `migration repair`, `db pull`, or `db reset` as
an audit shortcut.

After confirming the actual schema/table/column prerequisites, use the SQL
Editor in read-only mode (or a read-only database role) for metadata and
aggregate-only checks. Do not select user records or print PII. For the
Phase-8.6 check constraint, first verify the table and all four generation
columns exist; then aggregate rows whose generation fields are partly NULL or
whose non-NULL tuple is outside the supported contract:

```sql
select count(*) as incompatible_assignment_items
from public.assignment_items
where not (
  (generation_spec_version is null
    and difficulty_profile is null
    and variant_policy is null
    and generation_seed is null)
  or
  (generation_spec_version = 1
    and difficulty_profile is not null
    and variant_policy in ('individualized', 'same_for_all')
    and generation_seed is not null)
);
```

This aggregate is only a preliminary shape check; also verify every activity /
difficulty pair against the checked-in
`classroom_private.is_supported_assignment_generation_profile` contract. Do
not run the query before checking that the relation and columns exist.

## Migration lock review: migration 8

Migration 8 in the checked-in sequence is
`20260927022954_assignment_generation_spec.sql`. It adds four nullable columns
to `public.assignment_items`, sets defaults only after adding them (so legacy
rows remain NULL), adds a CHECK constraint over the existing rows, and adds a
trigger plus an updated duplication function. There is no DROP, type rewrite,
backfill, or `NOT NULL` conversion. The new columns have no table-rewriting
default at ADD time. The CHECK requires a table scan; `ALTER TABLE` takes an
`ACCESS EXCLUSIVE` lock by default, which blocks concurrent reads and writes
while the DDL transaction holds it. Exact duration depends on relation size,
storage/load, and lock acquisition; production size and timing are unknown.

For a clean all-at-once first deployment, preceding Classroom migrations create
this table and the later check sees no assignment rows. Do not assume this if
the production project has a partial/manual Classroom schema. Immediately
before deployment, confirm migration history and whether this table already
exists, count rows, verify the four columns/constraint state, and run the
compatibility aggregate above. If it is populated, schedule a low-traffic
window, set an operator-approved lock timeout for the deployment session, and
measure the check on a production-like restored/staging clone first. Do not
rewrite this certified migration without evidence; do not continue when the
check reports incompatible rows or the lock window is not acceptable.

## Backup and rollback gate

Backup/PITR availability and restore readiness were not remotely verified.
Immediately before any future migration, the operator must verify in the
project dashboard that a recent backup exists, establish the latest restorable
point and retention, confirm whether PITR is included for the current plan, and
identify who can perform and validate a restore. Verify the recovery procedure
on a non-production target when possible. No known-good restore point or
unclear restore ownership is a no-go. Do not start a backup or restore as part
of this source-preparation phase.

If a migration fails before commit, stop and inspect the exact failed statement
and transaction state; do not mark versions repaired or continue blindly. If
migrations succeed but the UI remains disabled, leave it disabled and diagnose
forward. If Edge Function deployment fails, keep the frontend disabled and
redeploy/fix the server contract. For webhook misconfiguration, disable
production Checkout exposure and correct the endpoint secret/event config;
reconcile missed subscriptions from canonical Stripe state. For a frontend
defect, roll back the static frontend while preserving additive DB state. Once
real billing/workspace data exists, prefer reviewed forward migrations and
canonical entitlement reconciliation over destructive down-migrations or
restoring over newer customer data.

## Ordered deployment gates

1. Verify backup/PITR, restore owner, and approved maintenance window.
2. Recheck the exact production project ref and remote/local migration history;
   resolve all divergence and inspect the current schema/data aggregates.
3. Apply the reviewed migrations in order, then smoke-test RLS, entitlement
   resolution, billing RPC denial boundaries, and problem-slot draft rules.
4. Configure server-only Supabase and Stripe variables; never place them in the
   Vite build environment.
5. Create/verify separate live Pro Product and $19 monthly / $149 annual Prices
   in Stripe, then deploy Edge Functions with `STRIPE_MODE=live` and matching
   live IDs/keys.
6. Configure the live webhook URL/events and signing secret. Verify a signed
   controlled event, durable receipt, canonical reconciliation, and failure
   behavior before enabling Checkout.
7. Build/deploy the teacher SPA to `https://classroom.calcura.study` with only
   public frontend values and `VITE_CALCURA_APP_URL=https://calcura.study/app/`.
   Rebuild Calcura with the exact Classroom preview-origin allowlist and refresh
   the Site artifact separately.
8. Configure/verify Supabase Auth Site URL and redirect allowlist. Smoke sign-in,
   sign-out, CORS, preview `postMessage`, Free functionality, and Pro billing
   using an explicitly controlled account. Verify Checkout return remains
   pending until the signed webhook/reconciliation updates entitlement.
9. Enable only the intended Classroom student/client feature flag in its own
   separately approved Calcura release after backend and teacher host checks.
   Monitor function errors, webhook retries, entitlement summaries, and
   subscription reconciliation; have the frontend rollback and forward-fix
   owners available.

All production migration, Stripe, DNS, Auth, and feature-activation steps above
remain unexecuted and require a separate explicit deployment authorization.

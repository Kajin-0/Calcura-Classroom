# Backup and restore — launch operations

Reviewed: 2026-10-04. Project `qsuacjqcrpswognhhikv` was observed **ACTIVE_HEALTHY**,
Postgres 17.6, us-west-2. Available management tools do not expose plan, managed
backup snapshots/retention or PITR configuration. **OWNER DASHBOARD VERIFICATION
REQUIRED**; managed backups/PITR must not be described as verified or enabled.

## Verify before paid launch

Supabase Dashboard → project → **Database → Backups → Scheduled backups**:
record plan, latest successful backup UTC time, recovery points/retention and
available restore controls in restricted operator notes. Inspect the **Point in
Time** backup tab and **Settings → Add-ons** for PITR; do not activate a paid add-on
without owner approval. A healthy database is not evidence of a restorable backup.

**RPO target: <=24 hours. Status: NOT VERIFIED / not yet claimed met.** Restore
duration/RTO has not been measured. Current Supabase docs describe daily managed
backups for Pro/Team/Enterprise, with plan-dependent retention; free projects should
maintain their own regular exports. Record the actual project configuration rather
than assuming these entitlements. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Logical fallback (local private output only)

If managed coverage is absent or unverified, arrange a daily operator backup and
verify completion/freshness. An unscheduled one-off dump does not meet the RPO.
Use the supported CLI or matching Postgres 17+ `pg_dump`; Supabase's CLI container
applies platform-specific exclusions. Review its current `db dump --help` and
[backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
before use. A public-only dump is not a complete Auth/database backup.

For a local PostgreSQL dump, securely provision an operator `PGSERVICE` and
`PGPASSFILE` (file 0600) without credentials in arguments/logs. Use an approved
connection with sufficient read privileges; verify project identity first:

```sh
umask 077
CALCURA_BACKUP_DIR=/tmp/calcura-backups
mkdir -p "$CALCURA_BACKUP_DIR"
chmod 700 "$CALCURA_BACKUP_DIR"
CALCURA_BACKUP_FILE="$CALCURA_BACKUP_DIR/database-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl --file="$CALCURA_BACKUP_FILE"
pg_restore --list "$CALCURA_BACKUP_FILE"
sha256sum "$CALCURA_BACKUP_FILE"
```

`PGSERVICE`/`PGPASSFILE` must already select the verified source. Check exit status
and archive contents (required `auth`, public and private schemas, migrations,
policies/functions); fail closed if inaccessible. Record role/grant definitions
separately with approved Supabase tooling; do not export role passwords. A dump
contains personal data and potentially Auth-sensitive material. Never commit it,
attach it to GitHub/CI artifacts, log its contents or upload automatically. Keep
protected/encrypted off-host copies under an owner-approved destination/retention
process; `/tmp` alone is ephemeral and is NOT disaster recovery. No automatic
backup/upload helper or production dump is run by this implementation pass.

## Restore decision flow

1. Confirm incident scope, owner authorization, known-good recovery point and
   expected data-loss window. Prefer a forward-fix migration for schema bugs.
   Do not reset production or repair migration history casually.
2. Preserve evidence and a fresh protected snapshot before an approved restore.
   Freeze conflicting writes as part of an approved maintenance window; communicate
   expected downtime. Never disable triggers/RLS to bypass an error.
3. Restore first to an isolated Supabase project/local disposable database with
   outbound email/webhooks/billing disabled. Do not replay production payments or
   create synthetic users in production. Follow Supabase's platform exclusions;
   do not blindly feed a full dump into an already initialized hosted database.
4. Verify table counts, expected FK relationships, grants/RLS, migrations, narrow
   SECURITY DEFINER functions, progress sync sequence/state consistency, assignment
   immutability, result uniqueness and cross-account isolation with synthetic tests.
   Run the repository DB suite. Treat recovered Auth sessions/users as sensitive.
5. Separate recovery domains: database/Auth data; Auth provider/redirect/SMTP settings;
   Storage **objects** (not restored merely by database metadata); Edge Function
   source/secrets/deployed versions; Pages artifacts; Android signing identity;
   external Stripe state. Keep source/config inventories and secret recovery in
   secure owner-controlled storage, not this repo.
6. Reconcile billing against canonical Stripe **after** a restored database: Stripe
   is not rolled back by a DB restore. Process genuine missing events through
   trusted reconciliation/idempotent paths; no synthetic charges/events, direct
   entitlement promotion or deletion of deduplication receipts.
7. Only after successful isolated recovery obtain separate owner approval for
   production restore. Revalidate production identity, backup point and blast
   radius immediately before confirmation. Managed restore can cause downtime.
8. Post-restore: run read-only production health/RLS/RPC/provenance smoke, verify
   Auth sign-in using an approved account, monitor billing reconciliation and
   record actual RPO/RTO/results. Review deletion requests so restored data does
   not resurrect a previously completed deletion unnoticed.

Periodically test isolated restore. A checksum and `pg_restore --list` verify an
archive's presence/readability, not successful recovery. No restore/PITR/plan
change is authorized or performed by this documentation pass.

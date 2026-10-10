# Independent pass deployment

This permanent requirement applies from Worlds Pass 2A onward. Each completed pass must be usable and deployable by itself, with all earlier functionality intact. Future passes may add capabilities, but may not be prerequisites for current routes, navigation, persistence or controls. Split work into smaller complete increments when necessary.

Before declaring completion:

- Deliver working interfaces and server behavior, including empty states, validation, authorization, failed saves and concurrent edits.
- Commit complete ordered migrations and their snapshots/journal. Rehearse both fresh installs and upgrades over existing data in disposable PostgreSQL. Preserve older data representations and document any compatibility limits.
- Execute production build, TypeScript, lint, relevant unit/database/browser regressions and actual desktop/phone verification. Record actual results and unresolved failures honestly.
- Preserve all systems outside the authorized pass and unrelated checkout changes.
- Create a clean local commit, or explicitly identify a commit-ready checkpoint, and stop at the authorized pass boundary.

The completion report must state the release commit, completed features, build/tests, migration ordering, configuration changes, controlled deployment steps, rollback/recovery considerations, remaining blockers and readiness for GitHub push/server deployment.

Deployment itself requires explicit authorization. A pass completion does not authorize a remote push, server deployment or Production database write.

## Controlled release and recovery

Follow the existing operator-managed deployment process. Verify the exact release commit, target database identity and applied migration ledger before selecting pending migrations. Protect a verified database backup and the currently running release. Use committed migrations in journal order with `npx drizzle-kit migrate`; do not use schema push, edit applied migrations, or assume the target ledger matches a local checkout. Stage and verify the application build before activating the release, then perform authenticated and role-specific smoke checks.

Every pass must describe its own rollback compatibility. Additive schema often allows an older reader, but older writers can discard metadata introduced by a newer release. Keep those writes paused or retain the newer compatible code until recovery is complete. A Git revert leaves database schema/data and the migration ledger unchanged. Prefer a reviewed forward fix; when restoring a backup is necessary, stop writers, preserve post-backup changes for reconciliation, restore into a verified target, and reconcile both application and migration versions. Never remove live columns or migration ledger entries merely to make an old checkout appear current.

# Pre-Earth infrastructure delivery

Starting publication: `0c42d1eceaece99125574bae250f5b01932dbfbe`. Implementation/testing is in progress on the bounded infrastructure pass; this report is updated with final review-branch and main receipts before delivery. No shared environment operation is authorized by this report.

## Delivered scope

One `npm run environment -- …` operator surface provides inspect, coordinated frozen backup, independent verification, authenticated encrypted transfer, new isolated restore/resume, signed database/storage binding, exact restored checks, target-only DEV token isolation, explicit additive migration, matched-build startup and signed cutover preparation. It reuses existing immutable readers/raster validators and the existing restore helper's CHECK search-path correction. A new opt-in streaming/single-transaction branch leaves that helper's original default replay body exact.

The inventory and operator/platform guides document every audited persistent authority, protected permissions, separately retained keys, off-server backups, freeze/failure recovery, DEV integration policy, matching release/data mounts, promotion and post-opening-write rollback. The deny-by-default Docker context contains code only. Runtime defaults to maintenance; no source data or secret is embedded in the image. Isolated Ubuntu24.04/Node22/PG18 recovery CI builds a real release and runs without external runtime networking.

## Validation receipt

Final task-specific CI/DR results and exact commit links are pending the ongoing rehearsals. Completed baseline checks:

| Check | Evidence/result |
| --- | --- |
| Inherited units | `infrastructure-units-1.log`: 2,862 passed, 364 feature files; no failures/skips. |
| Full lint | `infrastructure-full-lint-1.log`: zero errors; one existing `LoreFamily` warning in `worlds-stories-checks.ts`. |
| TypeScript | `infrastructure-types-8.log`: passed; final source recheck follows. |
| Initial operator/raster regression | `infrastructure-integrity-2.log`:14 passed, one POSIX-only permission test skipped on Windows. Expanded final operator suite follows. |
| Source preservation | `infrastructure-preservation.json`: 2,407 protected src/data/public/drizzle paths unchanged, including114 original public assets,322 SQL/snapshot files and161 journal entries through0160; original restore default body exact. No application, auth, Atlas, schema or migration change. |

Large private evidence remains ignored under `artifacts/infrastructure-*`; archives, keys, databases, generated assets and logs are not committed or uploaded as CI artifacts. Prior failed/partial receipts are retained. They include the sandbox's inability to create a PostgreSQL restricted token, a synthetic seed missing its required creator, initial physical-catalog schema comparisons, a test variable scope error and incomplete HTTP endpoint parameters. None was represented as a successful full recovery receipt. Authorized elevated test execution starts only newly owned loopback clusters and stops those same clusters.

## Decisions and limits

- No new migration or application storage authority was needed. PG18 is the validated transfer major; exact known journal prefixes can be recovered and then explicitly upgraded. Shared DEV/Production ledger status remains unverified.
- Logical schema verification preserves meaningful live column/enum order, constraints, indexes, functions and other definitions. PG logical reconstruction may compact dropped physical slots/enum weights; one exact retained attribute CHECK expression has two narrowly normalized equivalent deparser forms. Other constraint changes still fail. Large-object hashing preserves original OIDs and logical bytes, including sparse contents.
- Frozen capture requires explicit operator confirmation, no other DB clients, table write locks, exported dump snapshot and independently observed before/after DB/file agreement. Operators must fence alternative filesystem writers, DDL, jobs and direct SQL paths; the CLI does not claim a universal filesystem snapshot or stop live services itself.
- DEV security changes apply only to the newly restored target. User/password/content preservation is asserted, cloned session/verification/recovery/OAuth tokens are invalidated, startup uses a new secret and minimal environment. Private ingress/egress and schedules outside this repo still require operator controls.
- Existing owner Docker configuration, server mounts/permissions, real credentials, source locale/extensions, private original data and shared databases were not inspected. Real Ubuntu host and Render service acceptance require separately authorized rehearsals. Public provider documentation was reviewed; no Render account/paid resource was touched.
- Local Windows technical verification and isolated Ubuntu Docker smoke are separate evidence. The local host has no Docker/WSL installation; no installation or owner-container operation was attempted. Real physical devices, owner/Ember operational acceptance and a paid Render deployment are not certified by CI.
- Boundaries include250,000 files/64 MiB manifest and conservative space estimates; large-data performance remains dependent on actual disk/database size. Full verification hashes retained content and can take time. Source-level external resource links and browser-unsaved drafts are documented outside server snapshot coverage.
- No shared database read/write, deployment, owner-service restart, private-storage modification, old-worktree cleanup, destructive GC, Project Earth or Tabletop work occurred. Stop after verified publication for owner/Ember review.

## Entry points

- [Operator checklist and commands](environment-portability.md)
- [Persistent-data inventory and exclusions](environment-portability-inventory.md)
- [Ubuntu/Docker procedure](environment-ubuntu.md)
- [Future Render plan and unverified provider requirements](environment-render.md)

Next action after acceptance is a separately owner-authorized, step-by-step Production freeze/backup/DEV-clone session. This implementation does not perform it.

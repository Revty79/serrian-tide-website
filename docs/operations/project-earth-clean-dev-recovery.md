# Project Earth clean DEV recovery — 2026-11-09

Owner authorization: attachment `6b2f0026-3b48-46a3-b75a-995dd5607b0f`, updating `c8b596c4-4980-45eb-b778-aae614bd0882`. Recovery preserves the latest Atlas software and unrelated game data while taking the previous Earth out of active DEV. No Earth rebuilding or later feature implementation belongs to this operation.

**PASS — technical clean DEV recovery.** The clean database has actually restored, the normal local website runs against its configuration, and final original database/storage preservation checks pass. Owner sign-in remains a separate normal authentication step. This is recovery acceptance, not owner usability/visual acceptance or licensing clearance for the previous Earth.

## Recovery points

| Recovery point | Snapshot ID | Verified contents and result |
| --- | --- | --- |
| Restricted current DEV, before reset | `514e9334-d7a9-4b4d-b20a-a34bbe8a4f01` | 401 tables, 161 migrations, 93,317 files. Complete signed capture with source before/after equality; encrypted archive authenticated and opened independently; restored into a new password-protected disposable PostgreSQL 18 cluster and checked exactly. |
| Original pre-Earth DEV | `cd875f88-4dda-4ef4-9d0e-60f1e1dbda95` | Fresh signature, archive, encryption and all 67,106 file checks; 401 tables and all 161 exact migrations through `0160`. Independently restored into the new durable clean DEV database and matching storage, with exact tables, constraints, sequences, large objects, references and internal hardlinks. |

The restricted current archive is `artifacts/project-earth-clean-dev-recovery-1/restricted-current-dev.stenv` (1,342,009,484 bytes). Its independent restore retains the Earth World, 753 geographic source records and versions, and the protected historical state. No part of that Earth was transferred into clean DEV. Original pre-Earth snapshot/archive remain in `artifacts/project-earth-readiness-1/`. Signing/encryption material remains separately protected in the existing operator directory; do not copy it into a snapshot, report or Git.

Recovery archives, opened verification copies, diagnostics and previous Earth remain private and ignored. Their preservation is not permission to use, distribute or commercially publish held geographic material. Both recovery points are on this machine: **no off-device copy exists or is claimed**, and no previously approved no-cost off-device destination was identified. No paid service or new upload destination was introduced.

## Exact new active environment

| Authority | Clean DEV |
| --- | --- |
| Website | `http://127.0.0.1:3000`, normal `next dev`, explicitly bound to `127.0.0.1` |
| PostgreSQL | Separate durable PostgreSQL 18 instance at `127.0.0.1:5433` |
| Database / application role | `serrian_tide_dev_clean` / `serrian_tide_app` |
| Terrain | `storage/project-earth-dev-clean-1/active/terrain` |
| Artwork | `storage/project-earth-dev-clean-1/active/artwork` |
| Raster | `storage/project-earth-dev-clean-1/active/raster` |
| Durable server files | `storage/project-earth-dev-clean-1/postgres/data` |

The original server's application role has no database-creation authority. Rather than elevate it or change the original server, recovery provisioned this separately owned local cluster. Its application role is non-superuser, cannot create roles, and had temporary database-creation permission revoked after restoration. Its server credentials are newly generated; original server credentials and website password hashes were not changed. Secrets are outside the three Atlas roots and protected from other ordinary Windows accounts.

Current-user logon task `SerrianTide-CleanDev-PG18-20261109` starts only this owned cluster through `storage/project-earth-dev-clean-1/start-postgres.cjs`. Registration and actual execution passed. It has no password in its arguments and does not depend on the disposable verification cluster. **A Windows reboot was not performed or tested.** The original PostgreSQL service on port 5432 was never stopped or reconfigured.

All 67,106 restored files and internal hardlinks match the original signed snapshot. The clean storage ACL audit covers 67,709 entries with zero violations. The restored database matches the current application's 161 migration files exactly; no migration or application-code rollback was needed.

## Accounts, game data and reconciliation

The clean database retains eight users, eight account records, five campaigns and 1,421 skills. Existing Revty79 identity, password credentials and `admin`, `god`, `player` roles are preserved. Direct read-only execution of current application services passes creator authorization, empty World registry, 17 classification choices and three eligible campaign choices. These internal checks do not impersonate a login or establish owner browser acceptance.

Comparing both verified snapshots found 363 completely unchanged unrelated tables. The differences are 37 previously empty Earth-related tables plus transient sign-in sessions (158 to 161). Actual foreign-key paths prove every changed geographic row belongs to the sole Earth World. All original files remain exact; the 26,211 additional terrain files belong to Earth native saves, including 2,309 staging manifests whose World/terrain/request identities and tile hashes were verified. No unrelated account, campaign, character, skill or game change required reconciliation. Those Earth rows/files remain in the preserved original and restricted recovery point, not the new clean environment.

The new candidate passed exact restoration before documented DEV authentication isolation. Isolation invalidated cloned sessions, verification/recovery tokens and retained OAuth tokens in the **new database only**, and generated a separate application authentication secret. It explicitly verified user identities, password account identities and unrelated data remain unchanged. Sign in normally with the existing account and password; no password reset, fabricated session or account replacement occurred. Previously cloned recovery codes are intentionally not active in the new environment.

Clean DEV contains zero Worlds, geographic sources and source versions. This removes the previous Earth from active DEV. It does not retroactively clear the old Earth's licensing or certify every pre-existing private asset for commercial publication. The licensing inventory and holds remain authoritative until the required product safeguards and rights reviews pass.

## Local switch and website checks

The exact former `.env.local` is retained privately as `artifacts/project-earth-clean-dev-recovery-1/active-env-original.backup`. The switch preserves unrelated settings and changes only the new database, matching roots, isolated authentication secret, local origins and local-host flag. Active configuration now permits only the operator, SYSTEM and administrators; original permission metadata is retained privately. Signed switch metadata contains hashes and target identities without credentials.

The successful normal startup returns HTTP 200 for `/` and `/login`. Anonymous `/worlds` redirects to `/access`, then `/login`; the existing authentication gate logs its expected signed-out refusal. `/api/auth/get-session` returns HTTP 200 and `null`, proving the anonymous check inherited no cloned account. Visible Playwright Chrome opened the actual sign-in page and verified its username/password controls. **Owner sign-in and authenticated interactive Worlds/Atlas acceptance remain pending.** No new World or test geography was created in clean DEV to manufacture that acceptance.

One website is intended to remain running. Do not start a second `npm run dev` while this instance occupies port 3000. When deliberately restarting later, use the existing normal workflow with `npm run dev -- --hostname 127.0.0.1 --port 3000`; confirm the active private environment and stop only the identified DEV website first. The clean database startup task remains separate from website startup.

A failed switch must stop only its verified website, restore the protected former configuration and preserve both databases/storage sets. Retained evidence includes a real first-start interruption when the owner started a second DEV instance from VS Code; the first attempt restored former configuration. The competing website alone was positively identified and stopped. A retry then refused an unnecessary repeated ACL assignment because Windows denied a security privilege. The final attempt verified the already-private ACL rather than requiring elevation or weakening checks, and passed normal startup. Existing files and failure receipts were retained.

## Original preservation and software validation

The original `serrian_tide_dev` on port 5432 and `storage/project-earth-dev-overnight-1/{terrain,artwork,raster}` remain retained. Final read-only database comparison after clean website startup matches all 401 tables, credentials, sessions, roles, constraints, schema, sequences, large objects and 161 migrations to the current recovery snapshot. Final original storage verification passes all 93,317 file paths, sizes, SHA-256 hashes and internal hardlink aliases. The before/after original storage ACL audits also match exactly: 96,229 entries, 93,317 files, zero violations, fingerprint `03099dea5def11a20be25e80cd4cbc52a7411fed0bff1d2b904acb90f0a89130`. Only the newly owned disposable verification cluster on port 62409 was stopped after its checks; its files remain retained, and neither original 5432 nor active clean 5433 was stopped.

All application, Atlas, SQL, migration and existing test files remain unchanged from `1a3ef0869e18f7539282644cff2bbf5e0f55df77`. Main history retains the terrain, polygon, water, region, boundary, rendering, export, permission, history and performance improvements, along with the licensing audit and development reports. This recovery changes privacy exclusions and operating documentation only. The 15 unchanged portable-environment integrity tests pass locally. The publishing commit uses `[skip render]`; its exact GitHub Actions result and final clean local/origin/official-main equality are required delivery checks and are retained in the private publication receipt and delivery message. No deployment is part of this operation.

Private receipts are under `artifacts/project-earth-clean-dev-recovery-1/`: current capture/encrypted verification/independent restore, pre-Earth verification, `reconciliation.json`, `clean-restore-exact-check.json`, `clean-authentication-isolation.json`, `clean-dev-verified.json`, `clean-application-service-check.json`, storage ACLs, durable startup, `attempt3-local-dev-switch.json` and original preservation checks. Early FK-reconciliation helper diagnostics remain retained: PostgreSQL `name[]` needed explicit text casts; a PowerShell string-count helper refused before modifying its target. Neither correction changed an acceptance assertion or source database.

## Next boundary

Recovery stops here for owner review. Do not restart Earth authoring, activate Canon, modify Production, deploy or touch the live Ubuntu server. Required subsequent milestones are [keyboard sculpting and human tool usability, sustainable CPU graphics, enforceable source licensing, and actual home-server deployment repair on host port 3003](project-earth-recovery-next-milestones.md). They are recorded requirements, not completed implementations. Normal owner sign-in, usability/visual review, a real reboot test and off-device retention remain explicit limits.

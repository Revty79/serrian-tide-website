# Complete environment operations

Status: infrastructure for owner/Ember review. These instructions do not authorize live operations. No shared database, home-server service or Render resource was accessed during implementation. See [inventory](environment-portability-inventory.md), [Ubuntu](environment-ubuntu.md), [Render](environment-render.md) and [delivery evidence](pre-earth-infrastructure-delivery.md).

## Operator checklist

1. Review the release commit, intended source and NEW destination identities, paths, free space, PG18 version/locale/extensions, trust key and integration policy. Keep the former environment intact.
2. Arrange a maintenance window. Ask users to save/export browser-only work. Restrict public access, stop the old website, jobs, importers, scheduled tasks and direct database writers, and prevent their automatic restart. The tool does not stop services or configure firewalls.
3. Inspect, back up and verify the frozen source. Encrypt the snapshot; retain an independently verified off-server copy and separate recovery keys.
4. Restore into a newly named database and new private directory. Check complete restored data before starting the application.
5. For DEV, explicitly invalidate cloned tokens and generate a new environment secret. Keep access on loopback/VPN and block unintended external delivery. Never run DEV with Production integrations.
6. If an upgrade is needed, take a verified pre-migration snapshot of the stopped candidate, then run the explicit migration command. Validate again.
7. Start the matching validated build on loopback, authenticate and review accounts, Worlds, permissions, historical geography, connected maps, images and raster content. Stop the validation process afterward.
8. Prepare a signed cutover plan with both the promoted snapshot and former Production recovery point. Owner explicitly approves the exact plan hash, public startup and proxy/DNS change. Preserve the former environment and recovery material.
9. After reopening, monitor errors, capacity and backups. Rollback now requires preserving and reconciling new writes; reverting a code image alone does not reverse user data.

## One command surface

Run `npm run environment -- help` (Windows: `npm.cmd`). Commands use explicit `--name value` pairs. They do not load dotenv files or silently choose `DATABASE_URL`. PostgreSQL tools use a minimal child environment, explicit connection identity and no password in arguments. Operator errors omit raw SQL/tool output because those can contain private data. Check profile/space/permissions/client versions before retrying; retain partial directories for private diagnosis.

Use Node22, the locked dependencies and PG18 `pg_dump`, `pg_restore`, `psql`. `pgBin` is optional if tools are on PATH. Default reserve is 1 GiB, in addition to conservative archive/data/SQL estimates. Profiles and private parent directories must be protected (POSIX 0600 files/0700 directories; Windows ACL allowing only operator, SYSTEM and administrators). The tool never changes existing source permissions. A parent protected for a different service account requires a deliberate operator ownership decision before use.

Snapshots/keys must be outside Git, public web roots and build output. Ignored `artifacts/infrastructure-*` is only for synthetic rehearsals. Production snapshots belong on protected operator storage, not in the repository. Do not echo secrets or paste connection URLs into shell commands, reports or chat. Set the profile's named environment variable through your protected secret manager/session. No `--env-file` or Production dotenv import is part of this workflow.

Create a protected parent first. Example on a NEW Linux operator directory, after reviewing its absolute path:

```sh
umask 077
mkdir /srv/serrian/operator-new
npm run environment -- keygen --key-file /srv/serrian/operator-new/recovery.key --trust-file /srv/serrian/operator-new/trust.json
```

Windows: create a new private directory and set its ACL for the operator before running `keygen`. Do not recursively change permissions on existing storage. Keep the key bundle (Ed25519 private signing key and independent random AES256 transfer key) separate from snapshots. Retain the public trust file independently; a public key received alongside an untrusted snapshot is not proof of authenticity. Loss of the encryption key makes encrypted copies unrecoverable. Restrict key access and store an offline recovery copy separately.

## Reviewed profile

Save this template outside Git with protected permissions, replacing every placeholder. It contains identities and secret-file locations, never a password/URL value. Do not copy the source profile blindly into the destination.

```json
{
  "version": 1,
  "environmentId": "reviewed-source",
  "purpose": "source",
  "database": {
    "urlEnv": "SERRIAN_INFRA_SOURCE",
    "expectedName": "reviewed_source_database",
    "expectedHost": "127.0.0.1",
    "expectedPort": 5432,
    "expectedRole": "reviewed_role",
    "adminUrlEnv": "SERRIAN_INFRA_ADMIN"
  },
  "roots": {
    "terrain": "/srv/serrian/source/terrain",
    "artwork": "/srv/serrian/source/artwork",
    "raster": "/srv/serrian/source/raster"
  },
  "application": {
    "directory": "/app",
    "commit": "REPLACE_WITH_40_HEX_RELEASE_COMMIT",
    "origin": "https://reviewed.example.invalid",
    "trustFile": "/operator/trust.json",
    "hosting": "ubuntu"
  },
  "reserveBytes": 1073741824
}
```

The connection must match host/port/name/role exactly. Remote URLs require explicit TLS (`sslmode=verify-full` preferred with reviewed CA; `require`/`verify-ca` require operator review). Connection parameters cannot override host/user/database. Source sessions and authentication secrets are not supplied to the operator CLI. The manifest records no database URL/password, auth secret or absolute source root. It does record confidential table hashes/counts, file paths, source environment/database name and migration identities; protect it with the archive.

For Windows use absolute drive paths and, for example, `"pgBin":"C:/Program Files/PostgreSQL/18/bin"`. Paths must be real directories, not symlinks/junctions. Portable names reject traversal, reserved Windows devices, case collisions and trailing dots/spaces. Three roots must not overlap.

For a destination change `purpose` to `dev` or `production-candidate`, use a new environment ID/database/connection variable, and add:

```json
"environmentDirectory": "/srv/serrian/candidates/earth-dev-new",
"roots": {
  "terrain": "/srv/serrian/candidates/earth-dev-new/terrain",
  "artwork": "/srv/serrian/candidates/earth-dev-new/artwork",
  "raster": "/srv/serrian/candidates/earth-dev-new/raster"
}
```

The destination directory must be absent. Its existing parent must be private and writable. `adminUrlEnv` names a separate explicit maintenance connection to the same reviewed server/role but a different maintenance database. Restore checks that the new target database does not exist, then creates it from template0. If the hosting provider already provisioned a NEW empty database, omit the admin connection and explicitly use `--precreated-empty true`. That option still refuses data, objects, existing ownership markers or other connected clients. Never use it against an old database.

## Inspect, frozen backup, verify and encrypted transfer

```sh
npm run environment -- inspect --profile /operator/source.json
npm run environment -- backup --profile /operator/source.json --destination /backup/snapshot-new --key-file /operator/recovery.key --operator OWNER_NAME --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
npm run environment -- verify --profile /operator/source.json --snapshot /backup/snapshot-new
npm run environment -- seal --snapshot /backup/snapshot-new --key-file /operator/recovery.key --out /backup/snapshot-new.stenv
```

Inspect reports the explicit database name/version, ledger/table/file counts, physical/logical sizes, client versions and available bytes at each root. It reads the full source and verifies immutable references; run it in the agreed quiet window. Backups demand operator freeze attestation, reject any other database client, acquire table SHARE/NOWAIT locks, export one repeatable-read snapshot for `pg_dump -Fc`, copy the entire roots, and compare independently observed before/after database and filesystem states. Locks protect table writes; the operator must also fence file writers, jobs, DDL, sequences and all alternative paths. A maintenance webpage alone is insufficient. No filesystem-wide atomic snapshot is implied. The full-root copy preserves unreferenced/partial diagnostics too, without cleanup.

Manifest format v1 records a unique ID/date, release commit if supplied, PG version/encoding/locale/extensions, complete ledger hash/timestamps, table row counts/hashes, schema definitions, sequence and large-object state, archive hash and each file's size/hash/internal hardlink identity. It is Ed25519 signed. Completion is a separate signed receipt bound to the exact manifest after archive listing, object and file verification. Database IDs, retained histories and original files are not remapped or regenerated. Archive logical restore excludes cluster SQL ownership/ACL/tablespace commands; provision the destination role and least-privilege grants separately. Application permissions remain database records. Never restore an untrusted SQL archive merely because its filenames look familiar. [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

`verify` is repeatable, offline with respect to databases, and checks signatures, completion pairing, full archive SHA and structural `pg_restore --list`, exact file set/hashes/hardlinks, retained terrain/artwork metadata and original raster bundle validators. It needs the public trust key and PG18 tools, not source credentials. Capture the source `inspect` result separately for operator review. Bounds: 250,000 files, 64 MiB manifest, existing raster/object format limits; larger environments fail explicitly and require a reviewed capacity change.

Transfer only the encrypted `.stenv` file via a supported SSH/SFTP or equivalent protected channel. AES256-GCM authenticates the complete bounded framed stream before paths are extracted. Decrypted staging stays private in `.transfer`; it may contain the full plaintext archive and requires disk capacity. It is not publicly exposed or automatically deleted. Internal hardlinks are recreated only within the new snapshot, never back to the source. Keep an independent off-server copy and exercise recovery with independently retained keys/trust, not merely checksum the same failing disk.

```sh
npm run environment -- open --archive /backup/snapshot-new.stenv --key-file /operator/recovery.key --destination /backup/opened-new
npm run environment -- verify --profile /operator/candidate.json --snapshot /backup/opened-new
npm run environment -- restore --profile /operator/candidate.json --snapshot /backup/opened-new --key-file /operator/recovery.key --confirm NEW_ENV/NEW_DATABASE
npm run environment -- check --profile /operator/candidate.json
```

Restore preflights private/absent paths, free space, versions and target identity, then preserves locale/collation and extensions. Free-space checks measure the destination file volume; the operator must separately confirm free capacity/quota on a remote PostgreSQL service. SQL expansion, index rebuilding and concurrent disk use can exceed planning estimates, so retain additional headroom and treat any space error as an incomplete restore. A different locale/provider/version is refused, including a pre-created provider database that differs; matching a PG major alone is insufficient. Windows/Linux transfer is a logical archive, not a copied physical cluster. Locale `C` is the portable rehearsal case; real source locales/extensions/provider privileges must be rehearsed separately. This release supports PG18 only and a known exact prefix of the immutable migration journal. Unknown/newer/changed history is refused. Roles/passwords, extension binaries, operating-system locale support and infrastructure configuration are separate operator responsibilities.

Restoration reuses the existing constrained CHECK-validator replay path, with the retained session search path and a single transaction. It never disables constraints/triggers. The logical schema fingerprint preserves live column and enum order rather than dropped-column slots or fractional enum catalog weights. Large objects are hashed through bounded logical reads, preserving sparse-byte content and original OIDs without requiring direct access to the private large-object page catalog. One exact retained attribute CHECK expression has two equivalent PG18 deparser forms, normalized only for that named constraint; other changes remain exact. Every table/sequence/large object/schema fingerprint, historical reference and private file must match before `environment.json` is signed. A database comment binds the target restore ID/snapshot/environment to its exact storage roots. Signed append-only state receipts record explicit DEV isolation and migration. Mixing directories, database identity or snapshots fails closed.

`check` compares to the latest accepted restore/isolation/migration baseline. It intentionally fails after legitimate later content/session writes; that is a review signal, not permission to overwrite. `inspect` and a new frozen backup establish the current state. Normal runtime startup checks identity, ledger, roots, release and integration policy, not every row/file on every request; native readers retain their integrity checks.

## Failure and safe recovery

An incomplete snapshot has no valid signed completion receipt. Keep writers fenced; retain its private diagnostics and retry backup into a NEW absent directory. Do not combine partial files from different capture times. Ctrl+C/SIGTERM during backup/restore prevents completion at the next controlled checkpoint; a killed database replay rolls back its single transaction.

For interrupted encrypted transport, resume the same ciphertext using SFTP `reget`/`reput`, then authenticate with `open` into a new absent directory. A failed open retains protected staging; start another absent open directory. Do not treat a partial ciphertext as a snapshot.

For interrupted restore, keep the exact source snapshot, profile and signed restore intent:

```sh
npm run environment -- restore --profile /operator/candidate.json --snapshot /backup/opened-new --key-file /operator/recovery.key --confirm NEW_ENV/NEW_DATABASE --resume true
```

Resume validates the same signature, intent, database marker and roots. Existing immutable files must match; they are reused, never replaced. An empty target replays the archive; a fully committed exact target skips SQL and completes verification. Unexpected target data refuses resumption. A corrupted existing immutable object is not silently repaired. Retain that failed candidate and restore into another NEW environment after diagnosing capacity/permissions/hardware. No automatic deletion, rollback-overwrite, old-environment cleanup or GC exists.

## DEV isolation and explicit migrations

Generate a NEW environment-bound random authentication secret; set `application.authSecretFile` in its private profile. Do not transfer the Production auth secret or SQL role credentials. A source snapshot necessarily contains account rows and sessions; clear cloned credentials only in the new DEV target:

```sh
npm run environment -- secretgen --environment earth-dev-new --out /operator/earth-dev-new.auth.json
npm run environment -- isolate-dev --profile /operator/dev.json --key-file /operator/recovery.key --confirm earth-dev-new/NEW_DEV_DATABASE
npm run environment -- check --profile /operator/dev.json
```

Isolation deletes cloned sessions, verification tokens and password recovery codes and clears OAuth access/refresh/ID tokens. It preserves users, passwords, account identities and every other table. Existing Production remains untouched. Cloned users need newly generated DEV recovery material if appropriate. DEV startup requires this signed isolation receipt, a loopback origin and a separate secret; copied sessions cannot authenticate with the new secret. Use approved tester accounts and a private tunnel/VPN to loopback, not public DNS.

Startup builds a minimal allowlist of environment variables: explicit NEW database URL, new auth secret, exact origin/trusted origin, three roots and verified hosting context. It refuses dotenv filenames in the clean release. No email/payment/webhook/job credentials or arbitrary parent variables are forwarded. Source audit found no active mail/payment/webhook vendor integration or scheduled external worker in current runtime. Chat/Tabletop heartbeat timers are local application behavior. This is not a universal network firewall: operator must isolate DEV egress, disable external service schedules outside this repo, review future integrations and prevent public tester access. Linked external avatar/content URLs remain external references, not mirrored bytes.

The tool does not migrate at startup. With all candidate writers stopped:

```sh
npm run environment -- backup --profile /operator/candidate.json --destination /backup/pre-upgrade-new --key-file /operator/recovery.key --operator OWNER_NAME --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
npm run environment -- migrate --profile /operator/candidate.json --snapshot /backup/pre-upgrade-new --key-file /operator/recovery.key --confirm NEW_ENV/NEW_DATABASE --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
npm run environment -- check --profile /operator/candidate.json
```

Only existing additive release SQL runs via the established Drizzle migrator. All history through0160 stays byte-exact. Test ledger is161 entries; shared DEV/Production migration status is unverified. A migration failure leaves the recovery snapshot intact; restore it into another new environment, never rewrite the ledger. Review a failure between database commit and signed-state publication before proceeding; the tool refuses to invent a new baseline.

## Matching build, promotion and rollback

Build the exact reviewed commit in a clean release without dotenv. Docker does this with an inert build-only connection and stamps `.serrian-build.json` (commit, BUILD_ID and application/data/public/package/config fingerprint). Runtime verifies the stamp before launch. Never reuse an unrelated `.next` directory. The image excludes private data/config/secrets; mount the candidate's signed environment root and protected operator configuration at the exact profile paths. See platform guides.

```sh
npm run environment -- start --profile /operator/candidate.json --port 3100
```

Default is loopback. For private validation set the profile origin to the exact browser/forwarded loopback URL including its port. After stopping validation, select the reviewed canonical origin before preparing the cutover plan; origin changes do not rebind the database/files, but the signed plan pins the approved origin. Validate authenticated accounts, owner/admin/player permissions, Canon and personal copies, current/historical World/Region/Town/interior/underground/craft maps, source images and numerical raster originals. Preserve exact source data before validation; login creates candidate session records. Stop the validation app before `prepare-cutover`, which permits session/verification differences only and requires other content to match the accepted baseline (or a newly reviewed frozen snapshot of this current environment for later releases).

```sh
npm run environment -- prepare-cutover --profile /operator/candidate.json --snapshot /backup/promoted-new --rollback-snapshot /backup/former-production --key-file /operator/recovery.key --out /operator/cutover-new.json --operator OWNER_NAME
```

This produces a signed plan with `approved:false`, `trafficSwitched:false`, build/origin/environment/root identities, promoted and distinct rollback snapshot IDs, accepted state and plan SHA. It changes no proxy, DNS, service or traffic. Owner reviews the plan and explicitly approves its exact SHA. Public startup additionally requires:

```sh
npm run environment -- start --profile /operator/candidate.json --port 3000 --listen 0.0.0.0 --plan /operator/cutover-new.json --approve-plan REVIEWED_EXACT_SHA256
```

The separate proxy/DNS change is an owner operation. Keep old Production frozen, its database/storage/secrets/build retained and the rollback backup independently verified. Before opening writes, rollback can route back to the unchanged old environment after explicit approval. After opening writes, first freeze the candidate, capture/verify a full new snapshot and identify all new user progress. Choose a forward fix or reviewed data reconciliation into a new candidate; never discard new writes by simply switching to old data. A DEV-promoted world set and prior Production may intentionally differ: owner must review that policy before approving promotion.

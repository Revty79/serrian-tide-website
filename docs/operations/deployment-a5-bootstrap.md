# First-time Ubuntu storage bootstrap

**PASS for implementation and isolated technical verification** at `95ffc0bf256a33886912164f2ea55ad575de58ce`, starting from `3e97191957cf78ed100fa146f7c1a8706b9be323`. Exact normal, original disaster-recovery and complete Ubuntu deployment/bootstrap workflows pass. No live-server execution or success is claimed.

The actual owner-supplied read-only reports show a working host-network `serriantide` website on 3003, no mounts or three-root settings, absent `/app/storage/{world-terrain,atlas-assets,world-raster}`, and zero Worlds/checked Atlas reference rows in `serrian_tide_prod`. Its observed 161 migrations through 0160 preceded an owner-reported IDE migration. A pgAdmin backup was reported; an independent restore was not evidenced. Neither report substitutes for current server verification.

`ops/ubuntu_bootstrap.py` handles this specific first-time transition. It preserves the normal A5 updater's existing mount/configuration requirements. It does not migrate a database, treat an IDE migration as Production evidence, restore over Production, delete the old container/image, activate Canon, create Worlds or touch the tunnel/other services.

## Preconditions and behavior

- Run as the normal Ubuntu operator, with the existing local Docker access, Git/Python/Buildx and native `/usr/lib/postgresql/18/bin/{initdb,pg_ctl,postgres}`. The tool does not install packages on the owner's server. The native PG18 tools create only a new password-protected loopback restore cluster, so the restore uses Ubuntu's locale/collation implementation rather than assuming a Debian container has identical collation versions.
- Prepared host `/apps/serrian-tide-data/{terrain,artwork,raster}` directories must be real, separate, empty, mode 0700, UID/GID 1000. Their real common parent may be owned by root or UID1000 and must not be writable by group/others; a root-owned 0755 parent is supported. No automatic chmod/chown, creation over existing paths, source-file movement or cleanup occurs. Existing/unexpected Atlas data, old storage, settings or mounts stop the bootstrap for review.
- `.env.production` must be protected and match every declared value in the working container. The tool retains its exact bytes and permissions, adds only the three storage variables to a new candidate file, and does not edit the active file while building or verifying recovery.
- The fresh database probe binds the explicitly selected `serrian_tide_prod` / `serrian_tide_app` / loopback 5432, PG18, all 162 ordered migration hashes/timestamps and zero Worlds/Atlas reference tables. The ledger is checked again when frozen. LF and CRLF encodings of the exact published SQL are accepted; SQL changes and timestamp changes are refused. No migration files or ledger rows are rewritten.
- The existing 4 GiB/one-CPU build, source/output checks, real isolated Next.js smoke, 2 GiB runtime profile and resource reserves remain in force. Only the reviewed Git source enters the build. A failed prerequisite/build leaves the old website running.

After these checks, the operator stops only the named website. Other jobs, imports, direct database clients (including pgAdmin) and file writers must be stopped by their owner. The normal frozen-state check refuses other database clients instead of killing them.

Before starting a replacement, bootstrap creates a **fresh** signed complete PostgreSQL/three-root snapshot with the existing environment tools, seals it, independently opens/verifies it, and restores it into a new owned database/storage environment on the newly created native PG18 cluster. Exact original tables, rows, constraints, sequences, large objects, migrations and files must pass the original restoration checks. A second independent restored-state check must pass, the owned restore cluster must stop, and the source state must still match before cutover continues. The empty new roots are used only after proving the old defaults and all Atlas references are absent. This does not certify or modify the owner's prior pgAdmin backup.

The restore helper receives only new disposable-cluster credentials. Because existing artwork readers import the application database module, it uses an unreachable local sentinel solely for that module's initialization; all restore SQL uses the separately named target profile. The new native cluster uses 64 MiB shared buffers, 12 connections, no parallel workers and `max_locks_per_transaction=1024` to accommodate the complete constrained single-transaction restore. These are settings for the new cluster only; no existing PostgreSQL configuration is edited.

The old container is retained under its unique rollback name, with restart disabled while the new writer is running. The new website uses the original authentication/tunnel environment, explicit port 3003/listen address, and the three permanent bind mounts. Only after real Next.js readiness and database/storage checks does the operator atomically activate the candidate `.env.production`. The full original configuration remains private in the run directory. Ordinary A5 `preflight`/`deploy` can then operate on the existing mounts and active file.

Startup, health or configuration activation failure rolls back only if the complete frozen database/file witness is unchanged. A post-rename configuration failure restores the original bytes even if directory sync failed after the atomic rename. Accepted writes or an unavailable equality proof prevent automatic rollback; both containers and candidate/original configuration remain retained. Recovery failure before starting a replacement restarts the exact old writer and leaves the active configuration unchanged. SIGINT/SIGTERM stop positively identified helper containers and the new restore cluster; SIGKILL/host loss still requires the retained private recovery/cutover receipts to be reviewed.

## One-block operation

The block pins the validated implementation. The final owner delivery may pin its following documentation-only receipt after proving identical release inputs. Use the supplied reviewed SHA; do not substitute an unreviewed future main revision or run `git pull` first.

```bash
(
  set -euo pipefail
  umask 077
  cd /apps/serrian-tide-next
  RELEASE='95ffc0bf256a33886912164f2ea55ad575de58ce'
  git fetch --no-tags origin main
  git merge-base --is-ancestor "$RELEASE" origin/main
  LAUNCHER_DIR=$(mktemp -d /tmp/serrian-bootstrap.XXXXXX)
  trap 'rm -f -- "$LAUNCHER_DIR/ubuntu_bootstrap.py" "$LAUNCHER_DIR/ubuntu_deploy.py"; rmdir -- "$LAUNCHER_DIR"' EXIT
  for FILE in ubuntu_bootstrap.py ubuntu_deploy.py; do
    git show "$RELEASE:ops/$FILE" > "$LAUNCHER_DIR/$FILE"
  done
  PYTHONDONTWRITEBYTECODE=1 python3 "$LAUNCHER_DIR/ubuntu_bootstrap.py" \
    --repo "$PWD" --commit "$RELEASE" \
    --storage-root /apps/serrian-tide-data \
    --database-name serrian_tide_prod \
    --database-role serrian_tide_app --database-port 5432 \
    --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
)
```

This block is a deliberate maintenance operation after prerequisite verification. Keep browser-only edits safe and fence other writers before running it. Do not run the old `docker rm serriantide` update block. The bootstrap may refuse if the IDE migration did not reach Production; it never repairs that by migrating automatically.

## Retained evidence and limits

Private operational/configuration receipts live under `.git/serrian-deployment/RUN`. New signed/encrypted backup, separate key/trust files, opened snapshot, restored database/storage and stopped cluster are retained under `~/.serrian-bootstrap-recovery/RUN`. They are outside Git; no off-server copy is claimed. Retain an independent protected off-server copy of the encrypted snapshot and keep its key separately. No owner backup, root, container, image or unrelated cache is pruned.

The existing frozen snapshot/restore limits, PG18 extension/locale matching and disk reserves apply. A mismatched locale, unavailable extension, insufficient permissions/capacity or unclassifiable DB client is a refusal, not permission to overwrite or relax data checks. Resource evidence from hosted tests does not certify the owner's hardware or future 4096 terrain workloads.

The hosted source is a real Next.js process configured with the owner's legacy no-mount shape and synthetic existing account/session data. It is not the owner's retained `0c42d1e...` image or database. Live host execution, actual Production migration status, the owner's existing pgAdmin backup, external Cloudflare reachability and owner login acceptance remain unverified until the owner runs the procedure and checks the result. The script performs its own fresh Production probes and recovery proof at that time.

Testing passes with a real no-mount legacy Next.js process, actual 161/162 and changed-hash probes, nonempty roots, backup/restore and new-startup faults, configuration activation faults, complete signed recovery, existing authenticated-session continuity, normal updater repeat and refusal after accepted writes. The normal A5 and original environment recovery suites also pass unchanged.

For CI only, native PostgreSQL 18 is provisioned using the [official PostgreSQL Ubuntu repository instructions](https://www.postgresql.org/download/linux/ubuntu/) and verified repository-key fingerprint. No equivalent package installation is executed on the owner's host by bootstrap.

## Retained failures and corrections

- Initial local full validation ran several heavy suites together. Two unchanged authentication subprocess cases reached their original 30-second limit; a full unchanged 2,942-test rerun passed. No timeout or assertion was relaxed. The first configuration unit also used a Windows path for a Linux environment value; its fixture now uses `PurePosixPath`.
- Deployment runs [42937822079](https://github.com/Revty79/serrian-tide-website/actions/runs/42937822079) and [42939509871](https://github.com/Revty79/serrian-tide-website/actions/runs/42939509871) preserved the original writer but failed to produce the independent restore receipt. Local reproduction proved the eager shared-reader import required `DATABASE_URL`. Delayed imports and an unreachable sentinel fixed the restore helper without passing Production credentials to it. A new regression and stricter injected-failure assertions prevent a rollback from being counted as a completed restore.
- Runs [42940323512](https://github.com/Revty79/serrian-tide-website/actions/runs/42940323512) and [42941698106](https://github.com/Revty79/serrian-tide-website/actions/runs/42941698106) got past imports and recorded an actual Ubuntu native PostgreSQL `out of shared memory` failure during restoration. The small disposable connection budget also constrained its lock allocation. Only that new cluster's lock capacity was increased. The complete original restore transaction, constraints and equality requirements remain intact; protected helper and native failure receipts now retain the underlying cause. The final complete Ubuntu rerun passes.
- The separate Windows PG18.0 investigation restored the full 162-migration schema with both 64 and 1024 lock settings, so it did **not** reproduce the Ubuntu PG18.6 failure. Its deliberately asserted Linux-failure expectation remained a failed diagnostic, not a cross-platform PASS. An initial Windows `pg_ctl` pipe wait was stopped only after verifying that newly owned path/port; the test launcher was corrected to use non-inherited output handles. Both newly owned local clusters were subsequently verified stopped. The Ubuntu rerun is the authoritative correction test.

## Final verification receipt

| Evidence | Result |
| --- | --- |
| [Exact normal CI 42942883613](https://github.com/Revty79/serrian-tide-website/actions/runs/42942883613) | PASS: full TypeScript, full ESLint with one inherited `LoreFamily` warning, all 2,942 feature tests, three raster tests, 15 integrity tests and 30 deployment unit cases (22 Python, six existing Node, two new TypeScript). |
| [Exact original recovery CI 42942883665](https://github.com/Revty79/serrian-tide-website/actions/runs/42942883665) | PASS: all 15 original actual PostgreSQL/storage recovery groups and 15 integrity tests. Original recovery assertions and implementation remain unchanged except exact LF/CRLF migration-hash recognition in the shared reader. |
| [Exact Ubuntu deployment CI 42942883616](https://github.com/Revty79/serrian-tide-website/actions/runs/42942883616) | PASS: bounded real website build, all 11 existing deployment/authentication/rollback groups and all 11 new bootstrap groups. |
| Complete bootstrap | PASS: actual signed snapshot, authenticated encrypted open, independent native Ubuntu PG18 database/storage restore, independent restored-state check, stopped new cluster and unchanged original source witness before starting the new website. |
| Runtime and rollback | PASS: actual Next.js on 3003, existing account/session identity, three writable bind mounts, exact original config prefix, retained old image/container, normal A5 repeat, injected failed restore/startup/after-rename config failures, and refusal after an actual accepted database write. |
| Refusals and preservation | PASS: actual 161-entry ledger, altered hash, nonempty new root, existing World and old-container file all refuse safely; original file and unrelated container remain intact. Root-owned 0755 common parent plus private UID/GID1000 children is tested. Migration0161 is applied with CRLF bytes only to the synthetic fixture. |
| Owner launcher | PASS: extracted two-file Git launcher loads independently; complete Bash block passes `bash -n`. The owner server itself was not contacted. |

The verified build ID is `_4hH5Ff2v3Mq9OT0rXLST`; source fingerprint is `dbbea0bfc5e2c3d7deaaddc1e2af8bfd319184b7aa6b667172b065777bf1e928`. Compile/typegen/strict production checking took 174.650 seconds on the hosted runner. The enclosing BuildKit limit and observed peak are 4,294,967,296 bytes, with reclaim pressure but zero OOM/kill events. The inner build-phase peak is 3,713,253,376 bytes. Original CPU, heap, runtime and reserve limits were not raised. These measurements do not certify available memory on the owner's server.

Fresh Git comparison against the starting main verifies unchanged `src`, `data`, `public`, `drizzle`, Dockerfile, original updater/integration test and original snapshot/restore/transfer implementations. No published migration, existing owner data, shared account or shared environment was edited. Local Windows checks and separate hosted checks are recorded under ignored `artifacts/deployment-a5-bootstrap/`; no backup, key, private reference or generated output is published. The following documentation-only publication must preserve all tested release inputs and pass normal CI/clean main parity before final delivery. Stop after this A5 bootstrap delivery; A3 and other milestones remain held.

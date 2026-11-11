# First-time Ubuntu storage bootstrap

Owner-authorized follow-up to A5, starting at `3e97191957cf78ed100fa146f7c1a8706b9be323`. Implementation is undergoing validation; no live-server success is claimed by this document.

The actual owner-supplied read-only reports show a working host-network `serriantide` website on 3003, no mounts or three-root settings, absent `/app/storage/{world-terrain,atlas-assets,world-raster}`, and zero Worlds/checked Atlas reference rows in `serrian_tide_prod`. Its observed 161 migrations through 0160 preceded an owner-reported IDE migration. A pgAdmin backup was reported; an independent restore was not evidenced. Neither report substitutes for current server verification.

`ops/ubuntu_bootstrap.py` handles this specific first-time transition. It preserves the normal A5 updater's existing mount/configuration requirements. It does not migrate a database, treat an IDE migration as Production evidence, restore over Production, delete the old container/image, activate Canon, create Worlds or touch the tunnel/other services.

## Preconditions and behavior

- Run as the normal Ubuntu operator, with the existing local Docker access, Git/Python/Buildx and native `/usr/lib/postgresql/18/bin/{initdb,pg_ctl,postgres}`. The tool does not install packages on the owner's server. The native PG18 tools create only a new password-protected loopback restore cluster, so the restore uses Ubuntu's locale/collation implementation rather than assuming a Debian container has identical collation versions.
- Prepared host `/apps/serrian-tide-data/{terrain,artwork,raster}` directories must be real, separate, empty, mode 0700, UID/GID 1000. No automatic chmod/chown, creation over existing paths, source-file movement or cleanup occurs. Existing/unexpected Atlas data, old storage, settings or mounts stop the bootstrap for review.
- `.env.production` must be protected and match every declared value in the working container. The tool retains its exact bytes and permissions, adds only the three storage variables to a new candidate file, and does not edit the active file while building or verifying recovery.
- The fresh database probe binds the explicitly selected `serrian_tide_prod` / `serrian_tide_app` / loopback 5432, PG18, all 162 ordered migration hashes/timestamps and zero Worlds/Atlas reference tables. The ledger is checked again when frozen. LF and CRLF encodings of the exact published SQL are accepted; SQL changes and timestamp changes are refused. No migration files or ledger rows are rewritten.
- The existing 4 GiB/one-CPU build, source/output checks, real isolated Next.js smoke, 2 GiB runtime profile and resource reserves remain in force. Only the reviewed Git source enters the build. A failed prerequisite/build leaves the old website running.

After these checks, the operator stops only the named website. Other jobs, imports, direct database clients (including pgAdmin) and file writers must be stopped by their owner. The normal frozen-state check refuses other database clients instead of killing them.

Before starting a replacement, bootstrap creates a **fresh** signed complete PostgreSQL/three-root snapshot with the existing environment tools, seals it, independently opens/verifies it, and restores it into a new owned database/storage environment on the newly created native PG18 cluster. Exact original tables, rows, constraints, sequences, large objects, migrations and files must pass the original restoration checks. A second independent restored-state check must pass, the owned restore cluster must stop, and the source state must still match before cutover continues. The empty new roots are used only after proving the old defaults and all Atlas references are absent. This does not certify or modify the owner's prior pgAdmin backup.

The old container is retained under its unique rollback name, with restart disabled while the new writer is running. The new website uses the original authentication/tunnel environment, explicit port 3003/listen address, and the three permanent bind mounts. Only after real Next.js readiness and database/storage checks does the operator atomically activate the candidate `.env.production`. The full original configuration remains private in the run directory. Ordinary A5 `preflight`/`deploy` can then operate on the existing mounts and active file.

Startup, health or configuration activation failure rolls back only if the complete frozen database/file witness is unchanged. A post-rename configuration failure restores the original bytes even if directory sync failed after the atomic rename. Accepted writes or an unavailable equality proof prevent automatic rollback; both containers and candidate/original configuration remain retained. Recovery failure before starting a replacement restarts the exact old writer and leaves the active configuration unchanged. SIGINT/SIGTERM stop positively identified helper containers and the new restore cluster; SIGKILL/host loss still requires the retained private recovery/cutover receipts to be reviewed.

## One-block operation

The final delivery will pin the validated implementation SHA here. Do not use an unreviewed branch or infer a successful release from this draft.

```bash
(
  set -euo pipefail
  umask 077
  cd /apps/serrian-tide-next
  RELEASE='REPLACE_WITH_VALIDATED_BOOTSTRAP_COMMIT'
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

Testing includes a real no-mount legacy Next.js process, actual 161/162 and changed-hash probes, nonempty roots, backup/restore and new-startup faults, configuration activation faults, complete signed recovery, existing authenticated-session continuity, normal updater repeat and refusal after accepted writes. Exact results and remaining limitations will be recorded after CI. The unchanged standard A5 and original environment recovery suites remain required.

For CI only, native PostgreSQL 18 is provisioned using the [official PostgreSQL Ubuntu repository instructions](https://www.postgresql.org/download/linux/ubuntu/) and verified repository-key fingerprint. No equivalent package installation is executed on the owner's host by bootstrap.

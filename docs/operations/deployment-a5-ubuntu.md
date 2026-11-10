# Ubuntu website updates: Stage A5

Implementation and isolated verification are in progress. This document does not authorize a live rollout. A3 remains held. The existing `serriantide` container, working `serriantide:0c42d1eceaece99125574bae250f5b01932dbfbe` image and earlier rollback container must remain intact until a separately approved operation.

## Established causes

At starting main `35e47982afb694b6918f24f00fbc16408084dcb9`:

| Finding | Evidence and effect |
| --- | --- |
| Exact commit became mandatory | The Docker build invokes `ops/stamp-build.mjs`; its assertion requires a full 40-character lowercase SHA. The old build block omitted `SERRIAN_BUILD_COMMIT`, so the build cannot complete. |
| Runtime starts maintenance | The original `runtime` target's CMD invokes `environment maintenance`. Its `/health` HTTP 200 explicitly means `applicationRunning:false`, not a running website. |
| Default final target is recovery | The original Dockerfile ends with `recovery-test`; an untargeted build selects that stage, including its test CMD and test working directory. Calling it opt-in in a comment did not make it opt-in. |
| Local Docker conflicts are plausible, not remotely inspected | Neither Dockerfile exists in the Git tree of the owner's last working image's named source commit `0c42d1e...`; later infrastructure publishes tracked Docker files. Git refuses to overwrite a same-named untracked local file during update. The actual server copies are uninspected. Disposable Git reproduction verifies the transition. |
| Fingerprint omitted operational authorities | Receipt v1 hashes `src`, `data`, `public`, package files and Next config, but not deployment/startup scripts, migrations or compiled output. New v2 receipts bind those additional authorities; v1 readers remain supported for retained releases. |
| Resource budget was unspecified | Original `npm run build` has no explicit Node heap, Next worker count or enclosing BuildKit budget. This establishes an absence of limits, not the cause of an unobserved historical OOM. Actual host resource shortages remain unverified. |
| Mount/origin/schema correctness is not established by HTTP 200 | The old image/container and private roots have not been inspected here. A4 requires exact 162-entry migration history through 0161. Normal deployment must refuse an older target rather than applying it automatically. |

The repair keeps normal website startup and environment operations separate. The final/default `website` target and `runtime` CMD launch the actual Next.js application after read-only preflight. `--target maintenance` remains deliberate maintenance; `--target recovery-test` remains the offline disposable recovery test. `environment start` retains its signed-profile/cutover requirements; this assignment does not weaken that path.

## Read-only owner host preflight

After reviewing the published A5 implementation, replace `REVIEWED_A5_SHA` below with its full implementation SHA. Run this from the Ubuntu terminal only when the owner elects to gather the report. The agent has not SSHed into or changed that host.

```bash
(
  set -euo pipefail
  umask 077
  cd /apps/serrian-tide-next
  RELEASE='REVIEWED_A5_SHA'
  git fetch --no-tags origin main
  git merge-base --is-ancestor "$RELEASE" origin/main
  LAUNCHER=$(mktemp /tmp/serrian-a5-preflight.XXXXXX.py)
  trap 'rm -f -- "$LAUNCHER"' EXIT
  git show "$RELEASE:ops/ubuntu_deploy.py" > "$LAUNCHER"
  python3 "$LAUNCHER" preflight --repo "$PWD" --commit "$RELEASE"
)
```

This fetches source objects without changing checkout files. The probe inspects the local Docker daemon and the existing named container, reads the protected production env file without printing its values, and runs a secret-redacted Node probe in a separate 512 MiB container from the exact old image, with its entrypoint overridden and all retained mounts read-only. PostgreSQL statements run inside an explicit read-only transaction. It reports actual DB name/host/port/role/PG18 version/ledger, resolved roots/device/inodes/modes, persistent mount identities, declared authentication origins, the observed port-3003 listen address, resources and an exact `hostApproval` hash. It removes only that newly owned probe container on exit; it does not restart/modify the existing website, change accounts, write private data, migrate or restore. At least 1 GiB available memory is required before the probe, leaving a 512 MiB reserve beyond its hard cap.

Keep the report private: paths, identities and configuration hashes are operational metadata. No passwords, authentication secret, account rows or full environment are printed. Its approval hash excludes fluctuating free-memory/disk values but binds container/image, daemon, DB ledger, environment hash, roots, mounts, origins and listen address. Re-run and review after an authorized migration or configuration/container change.

The host needs Git, Python 3, Docker with the Buildx container driver, a local Unix Docker endpoint and read access to the private config and Docker storage capacity metadata. The old image must contain Node and its existing `pg` dependency. The protected file must use explicit unique Docker `KEY=value` entries (0600, regular, readable); shell interpolation, `export`, duplicated keys and implicit host-variable substitution are refused. Credentials and roots in that file must match the running container. No existing config is rewritten.

Each of the three roots must be explicitly configured, private, accessible to the application user, non-overlapping, non-symlinked and covered by an existing writable bind/named-volume mount. Container-layer-only storage is a blocker. Existing read-only certificate/config mounts are retained; unknown extra writable authorities require review. No recursive chown, directory creation or data extraction is performed against live roots. The probe does not consume memory inside the running website container. The new application runs as image UID/GID 1000; its read-only candidate checks must actually be able to access the roots. The real host's corresponding identities remain an acceptance gate.

## One-block approved website update

This is the reviewed procedure for a later **separately authorized live update**, not an instruction to execute it during A5 development. Supply the reviewed release and the reviewed preflight's exact `hostApproval`. Fence other jobs, importers, direct writers and file writers; the tool stops the one named website itself during cutover. Notify users to save browser-only work. The existing Quick Tunnel remains unchanged.

```bash
(
  set -euo pipefail
  umask 077
  cd /apps/serrian-tide-next
  RELEASE='REVIEWED_A5_SHA'
  HOST_APPROVAL='REVIEWED_HOST_APPROVAL_SHA256'
  git fetch --no-tags origin main
  git merge-base --is-ancestor "$RELEASE" origin/main
  LAUNCHER=$(mktemp /tmp/serrian-a5-deploy.XXXXXX.py)
  trap 'rm -f -- "$LAUNCHER"' EXIT
  git show "$RELEASE:ops/ubuntu_deploy.py" > "$LAUNCHER"
  python3 "$LAUNCHER" deploy --repo "$PWD" --commit "$RELEASE" \
    --approve-host "$HOST_APPROVAL" \
    --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED
)
```

The bootstrap works before the new scripts exist in the old checkout. It uses reviewed Git objects rather than asking the owner to edit conflicting Docker files. The operator requires `main`, the official origin, a fast-forward relationship and no tracked/staged edits. It moves only positively identified untracked `Dockerfile`/`.dockerignore` conflicts into a new private `.git/serrian-deployment/RUN/preserved-*`, verifies their hashes and fast-forwards. Unrelated untracked drafts remain. Other Git conflicts stop safely; there is no reset, clean, stash, review branch or worktree.

Use the same block for subsequent reviewed updates, changing only the release and current host approval. Once A5 is installed, the shorter equivalent is `python3 ops/ubuntu_deploy.py deploy --commit FULL_SHA --approve-host HASH --frozen ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED`; prefer the bootstrap whenever the deployment code itself has changed, so the exact newly reviewed launcher is used. A repeat of an already verified running release is a health-checked no-op.

## Build and startup behavior

The tool checks capacity before building, creates a public-code-only tar context from the exact commit's allowlisted Git paths and never sends `.env.production`, untracked files, storage or private diagnostics. It builds `serriantide:FULL_SHA`, never overwriting an occupied immutable tag. The required commit is passed explicitly. It verifies image label, website CMD, complete source hash against Git, build ID and compiled-output hash before any cutover.

The bounded profile uses one CPU quota, one Next build worker, a 2560 MiB Node heap and a 4096 MiB enclosing BuildKit memory/swap limit. At least another 2048 MiB of currently available host memory and 12 GiB free on both checkout and Docker storage are required. An existing verified image skips rebuilding but still requires the 2048 MiB application allowance plus host reserve. These are conservative admission rules, not a guarantee that every server can build the release. If insufficient or a build fails, the old website stays running. Actual bounded-build peak/time evidence is recorded in the delivery receipt.

Only a new uniquely named task Buildx builder/cache is removed after the build. Working images, old containers, volumes, unrelated caches and services are never pruned. Source tar context is held transiently; useful build/resource/cutover/failure diagnostics are retained privately under `.git/serrian-deployment/RUN`. Completed release images and rollback containers remain useful recovery material. Monitor their disk use; any later image retirement requires its own reviewed selection. Capacity failure stops rather than deleting a working image to make room.

Candidate verification is deliberately split:

1. A normal Node preflight container uses the real selected configuration, host networking for the separately hosted PostgreSQL connection, and **read-only storage mounts/SQL transactions**. It checks exact release/schema, A4 constraints, roots, identities and origin configuration. It does not start application writers or authenticate against Production.
2. A real Next.js process starts in a different `--network none` container, with an inert database URL and synthetic auth values. An internal anonymous `/login` request must return actual Next.js HTML/header, not maintenance JSON. It has no Production credentials or mounted private roots.
3. Actual authenticated functionality is exercised only in isolated synthetic PG18 tests. Real owner authenticated acceptance remains an explicitly authorized post-rollout task.

After successful candidate checks and fresh host-identity/resource checks, only the `serriantide` application is stopped. Its original restart policy is retained in the private plan and changed to `no` while kept as rollback, preventing an accidental second writer after daemon restart. The replacement preserves its verified storage mounts, env values, observed listen address and host port 3003; it runs a read-only image with writable mounted roots and bounded temporary/cache filesystems. HTTP readiness requires actual `/login` HTML and a Next.js header, followed by DB/schema/storage/auth checks. Original restart policy is applied to the new container only on success.

The 2048 MiB runtime cap is a bounded deployment profile, not certification of every advanced Atlas workload. A4's original numerical/resource refusal rules remain unchanged. Validate actual host headroom and advanced usage separately; do not equate a login smoke with a high-resolution capacity benchmark.

## Safe rollback and interruption

Before starting the replacement, with the old app stopped and other writers fenced, the tool captures a read-only witness of complete logical rows/schema/constraints/sequences/large objects/migrations and all three roots' file hashes/internal links through the original portability readers. It rejects other DB clients, including sessions with restricted metadata. This witness is **not a backup**.

On failure it first stops and verifies the new writer is stopped, retains it under a unique failure name, and recomputes the same complete witness. Only exact equality permits restarting the exact previous container/image with its original policy. Different data, files or schema—or inability to prove equality—refuses automatic rollback and leaves both retained for operator recovery. No database or private file is rolled back automatically. A code-only rollback never reverses accepted writes or migration.

Cooperative interruption follows the same failure path during cutover. SIGKILL, host loss or interruption during rollback cannot promise automatic repair. The private cutover plan, frozen witness, new-container identity and success/failure receipts identify the retained state. Keep all application/job/file writers fenced; inspect actual running containers and DB/schema/root identity before any manual restart. Do not start both containers. If writes occurred, preserve a new complete paired snapshot and reconcile them or use a reviewed forward fix. Never restore an old backup over the source to make a code rollback look safe.

## Separate migration 0161 procedure

Normal deployment never invokes migrate, restore, isolate-dev, secret generation or signed environment cutover. An older/mismatched ledger stops before the existing application is touched. See [A5 migration plan](deployment-a5-migration.md) for the separately approved freeze/backup/independent restore/migrate/check sequence. Original environment-management commands and their signed candidate boundaries remain in [environment portability](environment-portability.md).

Authentication credentials and sessions are retained. Existing base URL/trusted origins must include the intended local origin and exact current tester origin where used. The probe does not hardcode a temporary tunnel hostname or grant wildcard trust. Changing a Quick Tunnel URL requires an explicit protected-config review; this tool does not change Cloudflare, DNS, Porkbun, Caddy, Render or subscriptions. Existing application CSRF/session/permission/client-IP logic is unchanged.

## Delivery and acceptance

Pending full local tests, exact hosted normal/DR/deployment workflows, reviewed inventory and final publication receipt. The actual owner Ubuntu image/container, memory, mounts, PostgreSQL ledger/TLS/privileges, existing env format and tester tunnel remain uninspected. Synthetic success will not be represented as live rollout success. Stop after technical delivery for Ember/owner review; no A3, Earth, Tabletop or live migration follows automatically.

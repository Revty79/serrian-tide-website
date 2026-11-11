# A5 permanent one-command updates

**Technical PASS** at implementation `cc9179a9ab9813a71a1736850671c67463cb2034`: all three required exact-commit CI workflows and a separate complete installed-command run against live GitHub pass. Ready for owner/Ember review. The owner reports first-time bootstrap succeeded; this delivery does not claim a new live owner-server deployment.

## Everyday operation

After one installation, run `serrian-update` as the normal website owner (without sudo). It fetches main, chooses the newest eligible forward release, displays its full commit and subject, obtains the original read-only A5 host approval, and asks `Update now? [y/N]:`. Close pgAdmin and other import/job/direct database or file writers before confirming; leave the website and tunnel running. No commit selection, Docker administration or environment editing is required for ordinary updates.

All three exact push/main workflows must have successful latest attempts and successful jobs: `validate.yml` / `validate`, `environment-recovery.yml` / `recovery`, and `deployment-a5.yml` / `website`. Runs from another repository, branch, event, workflow path or SHA cannot authorize deployment. Missing, pending, skipped, cancelled, neutral and failed results are refused. A newer failed rerun invalidates an earlier success. Selection considers the newest 100 first-parent main commits and 100 recent runs per workflow. The selected release must fast-forward the existing checkout and running release; nothing is reset. Newer ineligible commits are disclosed. Documentation-only commits without all three workflows are not releases, even when their application files match a tested ancestor.

CI is checked during selection, exactly before host inspection, again after confirmation, and immediately before A5 stops the old writer. Fixed HTTPS GitHub endpoints reject redirects and proxy overrides. Public repository reads need no new account or token; API outages, access errors and rate limits stop safely. Existing optional `GH_TOKEN` / `GITHUB_TOKEN` credentials stay in memory and are never written to receipts or terminal output. GitHub's unauthenticated rate limit may require waiting after repeated attempts. References: [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs), [workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs), [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

## Existing safeguards and explicit stops

The selected, CI-verified Git version of `ops/ubuntu_deploy.py` performs deployment unchanged. It keeps its 4GiB/one-CPU builder, 3328MiB Node heap, strict production checks, source/image identity, real Next.js smoke/health checks, local Docker restriction, private mounts, resource reserves, deployment/daemon locks, exact host-approval recheck, port3003 and frozen-state rollback witness. The prior container/image is retained. Accepted writes or unavailable equality proof still prevent automatic rollback. A normal update does not create a fresh backup or independently restore one; it preserves the established recovery system and rollback boundary.

The wrapper checks the actual database's complete migration ledger against the selected Git SQL hashes and timestamps, including only known LF/CRLF representations of identical SQL. A mismatch stops before build/confirmation with `MIGRATION_APPROVAL_REQUIRED`; no migration command exists in the updater. Separately reviewed backup/restore rehearsal and migration remain operator work.

Every env-file value must match the running website. The updater never rewrites protected configuration. `ops/update-requirements.json` contains the separately reviewed configuration epoch. Maintainers **must increment this epoch whenever a release needs new or changed deployment configuration** and review the original A5 migration/configuration procedure. Different running/candidate epochs stop with `CONFIGURATION_APPROVAL_REQUIRED`; ordinary updates resume after a separately reviewed deployment establishes the new epoch. The already-bootstrapped A5 predecessor through `1d9fe69d0c2073ea5acd23408585540028928c22` is the bounded legacy epoch1 baseline. Unrecognized contracts fail closed. This explicit maintainer declaration cannot infer undocumented application configuration requirements.

A matching version exits successfully only after managed-runtime, source/image, exact ledger/configuration and actual HTTP health checks. It does not rebuild, restart or ask for confirmation. Decline/EOF cannot consent. Noninteractive input cannot deploy. An owner lock supplements the original A5 locks. Tracked edits, unsupported origins, divergent history, unbootstrapped containers and unhealthy matching releases require review; no reset/clean/prune operation exists.

## Installation and private receipts

Run this once as `brannan` in the Ubuntu terminal after review. No values need editing. It extracts only the installer and runtime from the immutable tested official main commit into a new private temporary directory. The installer verifies those bytes and all three exact CI results before installation. It never accesses Docker, the database, `.env.production`, private storage or the tunnel.

```bash
(
  set -eu
  umask 077
  cd /apps/serrian-tide-next
  RELEASE='cc9179a9ab9813a71a1736850671c67463cb2034'
  git fetch --no-tags origin main
  git merge-base --is-ancestor "$RELEASE" origin/main
  INSTALLER_DIR=$(mktemp -d /tmp/serrian-update-install.XXXXXX)
  trap 'rm -f -- "$INSTALLER_DIR/install_serrian_update.py" "$INSTALLER_DIR/serrian_update.py"; rmdir -- "$INSTALLER_DIR"' EXIT
  git show "$RELEASE:ops/install_serrian_update.py" > "$INSTALLER_DIR/install_serrian_update.py"
  git show "$RELEASE:ops/serrian_update.py" > "$INSTALLER_DIR/serrian_update.py"
  python3 -I -B "$INSTALLER_DIR/install_serrian_update.py" --repo "$PWD" --commit "$RELEASE"
)
```

For future ordinary updates, from any directory:

```bash
serrian-update
```

Review the displayed update and answer `y` to deploy, or press Enter to cancel. If already current and healthy, the command exits successfully without rebuilding or prompting.

Sudo may ask for the Ubuntu password once to install only a fixed root-owned0755 `/usr/local/bin/serrian-update` launcher. Git and website deployment remain under the normal owner. The private0700 package is `~/.local/share/serrian-update/<installer-commit>/`; its runtime and installation record are private0600. The launcher invokes absolute `/usr/bin/python3 -I -B` paths. An existing different command is never overwritten; identical installation is idempotent. A complete package retained after a cancelled sudo step can resume after re-verification; differing/incomplete installations remain available for review. Updater-tool upgrades are separately reviewed installer maintenance, not required for each website release.

Wrapper result receipts remain in the private package; original A5 evidence remains in `.git/serrian-deployment/`. No credentials, raw Docker commands, private data or backup material is published. Installation does not deploy; the subsequent `serrian-update` command still asks for confirmation.

## Validation and publication

Implementation `cc9179a9ab9813a71a1736850671c67463cb2034` is published on main with `[skip render]`.

| Exact implementation check | Result |
| --- | --- |
| [Normal CI43064307926](https://github.com/Revty79/serrian-tide-website/actions/runs/43064307926) | PASS: types, lint, 2,942 features, 3 raster, 15 integrity and all 61 deployment unit cases. |
| [Recovery CI43064307918](https://github.com/Revty79/serrian-tide-website/actions/runs/43064307918) | PASS: all 15 actual recovery groups and 15 integrity tests. |
| [Ubuntu CI43064307945](https://github.com/Revty79/serrian-tide-website/actions/runs/43064307945) | PASS: bounded exact-source build, 2 root-launcher groups, 6 complete installer/updater groups, and all unchanged 11 deployment, 17 legacy/TLS and 13 standard bootstrap groups. |
| [Installed command with live GitHub43070758791](https://github.com/Revty79/serrian-tide-website/actions/runs/43070758791) | PASS: all installer/updater cases repeated on a fresh Ubuntu host; successful installation, reinstall, update and no-op use the actual CLI and live GitHub, including literal `serrian-update`. |

The production GitHub verifier independently refused this exact commit while deployment CI was unfinished, then accepted only after all three exact workflow/job results passed. Both receipts are retained. No cached or synthetic result authorized the live-CI acceptance run.

Fourteen new policy tests cover exact workflow/job identity, latest attempts, every non-success outcome, API/access failure, no-forward release, SQL byte variants, configuration-epoch refusal, cancellation/EOF, original host/freeze handoff, no-op and quoted launcher paths. Four CI dependency tests cover authenticated-index parsing, tampering, wrong distribution/package and path escape. Original deployment/security/recovery tests remain intact. Local TypeScript/full lint pass (one inherited LoreFamily warning), all 2,942 feature tests pass, and 61 deployment cases have 59 Windows passes/two inherited POSIX-only skips. Combined local integrity/raster checks have 17 passes/one inherited POSIX-only skip; hosted Linux runs the permission cases.

The full hosted regression uses Ubuntu 24.04, an actual earlier immutable A5 image, a current bounded build, populated new PostgreSQL 18 and all three native storage roots. Coverage includes:

- Root-launcher permission refusal, altered-byte rejection, exact root-owned publication, no overwrite, unrelated-command preservation and idempotent complete installation.
- Failed CI/API outage, terminal confirmation/cancellation, CI withdrawal after consent and immediately before cutover.
- Actual migration-hash drift and protected configuration drift, refused without automatic repair.
- Actual replacement startup failure and rollback, successful old-to-new cutover, retained original container/image, full database/file equality, existing account/session/World continuity, healthy no-op and an unaffected bystander.
- All unchanged original 11 deployment groups, 17 legacy/TLS bootstrap groups, 13 standard bootstrap groups, 15 actual disaster-recovery groups and 15 integrity tests.

Fault tests replace only GitHub transport or inject a deliberately failing new-container environment inside a separately guarded CI harness. The production command has no test or CI-bypass switch. A separate manual `Installed updater live-CI acceptance` workflow runs on a new hosted Ubuntu machine after all three required push workflows pass. Successful installation, repeat installation, update and no-op use the actual CLI, including literal `/usr/local/bin/serrian-update`, real GitHub HTTPS and original A5/Docker. Failure scenarios remain deterministic. Live Cloudflare/owner browser acceptance is not claimed; original verified-TLS/authentication regressions remain mandatory.

## Source preservation

At the tested implementation, relative to starting main `1d9fe69d0c2073ea5acd23408585540028928c22`, 10,664 of 10,668 original tracked paths are identical. Only two workflow trigger files, `.gitignore` and this task's AGENTS entry change among existing paths at that implementation; eleven files are new. The final documentation publication additionally redirects the existing Ubuntu runbook to the permanent command, leaving 10,663 of 10,668 original paths unchanged while preserving every release input. Every original `src`, `data`, `public`, `drizzle`, `ops` and `scripts` file remains exact, including 324 SQL/snapshots, 162 migration entries and 114 public assets. The 3,363 canonical LF release inputs at `cc9179a9` have fingerprint `53b2c56e9c086690ecce1b0d47b68728b54a125b7662870a46e81be68ea2c708`.

This source audit is separate from data-preservation tests in owned fixtures. No owner server, Production/shared DEV database, original recovery point, private storage, environment/account configuration or tunnel was accessed or changed. The owner's report that bootstrap succeeded is context, not an agent-certified current-host audit. Private local evidence is ignored under `artifacts/deployment-a5-update/`; hosted private fixtures are never uploaded as public artifacts.

## Retained failures and CI preparation

Failures remain evidence, not passing acceptance:

| Attempt | Result and correction |
| --- | --- |
| Initial local launcher test | A Windows Path was used for a Linux shell path. Corrected the fixture to PurePosixPath without relaxing quoting assertions. |
| `0d6b2a22`, deployment43046078291 attempts 1 and 2 | Both passed bounded builds and 11 original deployment groups, then APT could not resolve azure.archive.ubuntu.com for liburing2. Normal43046078401 and recovery43046078235 passed. |
| `e1b30eee`, deployment43052362783 | Direct canonical Ubuntu archive/security DNS also failed. The ineffective source rewrite was removed. |
| `9b91267a`, deployment43054584567 | Cached signed-metadata layout assumption failed closed before downloading/installing a dependency. Replaced the assumption with fresh authenticated metadata. |
| `0473d466`, deployment43055734745 | Canonical Ubuntu DNS failed through Python HTTPS as well. Changed only the CI download mirror, retaining the existing Ubuntu trust chain. |
| `c4a25148`, deployment43056612648 | Authenticated provisioning, bounded build and all 41 original deployment/bootstrap groups passed. New launcher installation refused the hosted runner's world-writable `/usr/local/bin`. Normal43056612694 and recovery43056612676 passed. |

The final CI-only dependency helper downloads noble InRelease and Packages.xz from the [Linux Kernel Archives Ubuntu mirror](https://mirrors.kernel.org/). The preinstalled Ubuntu archive keyring verifies InRelease with gpgv; authenticated compressed/uncompressed index hashes, bounded decompression and the exact package SHA256/size verify liburing2 before normal APT installation. The original PGDG fingerprint check remains mandatory. Ubuntu sources and cached indexes remain intact; the PGDG-only refresh retains other indexes with `APT::Get::List-Cleanup=false`. No DNS/hosts override, TLS bypass, unsigned package, new Ubuntu trust key or owner-machine package change occurs. References: [APT trust chain](https://manpages.ubuntu.com/manpages/noble/man8/apt-secure.8.html), [index retention](https://manpages.ubuntu.com/manpages/noble/man8/apt-get.8.html).

GitHub's [runner-image Node installer](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/install-nodejs.sh) deliberately sets `/usr/local/bin` to 0777. The production installer still refuses this configuration and now reports `INSTALL_ROOT_PERMISSIONS`. An early owned-runner smoke first proves refusal without mutation, then hardens only that ephemeral directory nonrecursively for realistic installation tests. It preserves the smoke launcher under a unique fixture path. The production installer never changes existing directory permissions. Stopped test containers and storage are retained until the hosted machine is discarded.

## Limits and acceptance boundary

Ordinary updates need only `serrian-update` and a yes/no confirmation. Separate migration/configuration approvals, GitHub outages/rate limits, insufficient host resources, unsafe launcher-parent permissions or unsupported/unbootstrapped hosts still stop explicitly. No automated cleanup, downgrade, migration, configuration rewrite or fresh ordinary-update backup is introduced. The configuration epoch relies on maintainers declaring new requirements; it cannot discover undocumented application semantics. Updater-tool replacement is separate reviewed maintenance.

The pinned installer and the first actual owner-server update remain owner actions. Successful hosted testing does not authorize this agent to install or deploy on that server. Stop for owner/Ember review after exact final CI, source parity and documentation publication; no Earth, Atlas milestone, Canon, Tabletop or Production work follows from this delivery.

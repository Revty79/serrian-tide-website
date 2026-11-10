# Stage A5 deployment repair: delivery receipt

Status: local validation passes; hosted Ubuntu/Docker acceptance and final publication remain pending. No live host deployment is claimed.

Starting main: `35e47982afb694b6918f24f00fbc16408084dcb9`. Owner brief: `ed700403-0b7d-43d6-8f24-aea9fd9b182f`. A1/A2/A4 have technical acceptance; A3 remains held. The assignment authorizes implementation and isolated testing, not SSH, live file/service changes, Production migration or a port-3003 restart on the owner's server.

## Operator delivery

The [Ubuntu procedure](deployment-a5-ubuntu.md) supplies the read-only host preflight, complete initial-transition copy/paste block and repeat-update command. The separate [migration plan](deployment-a5-migration.md) preserves the existing signed backup/restore/candidate migration gates. Final publication replaces the release placeholder with the reviewed implementation SHA; host approval is necessarily supplied from the owner's actual, currently uninspected preflight.

The procedure preserves the working image/container, resolves only the two known untracked Docker conflicts into checksum-verified private copies, refuses tracked/staged edits, builds canonical reviewed Git source, and does not reset, clean, stash or operate on other services. It uses a repository lock plus a never-started Docker name reservation across checkouts. New Buildx builder/cache and anonymous smoke containers alone are cleaned up; retained release images and rollback containers remain.

## Root causes

The starting Docker build requires an exact `SERRIAN_BUILD_COMMIT`; omission fails. The runtime target starts maintenance; `/health`200 is explicitly not a website. The last/default stage is the recovery test, so an untargeted build selects its test CMD. The Docker files are absent from the tree named by the owner's last working image; the later introduction of tracked files reproduces Git's untracked-file refusal in disposable repositories. Build concurrency/heap/cgroup limits were previously unspecified. Receipt v1 omitted operational/migration/compiled authorities.

These are source-established facts. The actual server's local file contents, historical OOM cause, resources, mounts, auth configuration and live schema remain uninspected. The working image is not rebuilt, removed or relabeled here.

## Implemented safeguards

- Default/final `website` and runtime start the actual Next.js application after release, DB, ledger, critical A4 schema, storage and origin checks. Explicit maintenance and recovery targets remain. Existing signed environment CLI/guards remain unchanged.
- Public-only Git archive context, deny-by-default Docker exclusions and explicit nonsecret build arguments keep production credentials/data out of the image. Receipt v2 binds source including ops/scripts/migrations and compiled output; retained v1 receipts remain readable.
- Build profile: 4096 MiB BuildKit memory/swap cap, one CPU, one Next worker and 3328 MiB Node heap. Admission requires another 2048 MiB host reserve and 12 GiB free on checkout/Docker storage. This is a tested profile only after actual hosted evidence is recorded, not a universal sufficient limit.
- Read-only host probe uses the old exact image in a separate 512 MiB container, overridden entrypoint and read-only mounts. It never runs another Node process inside the working website container. Real target checks use explicit read-only SQL and read-only file mounts. Real Next.js candidate smoke has no network or Production credentials.
- Cutover preserves exact DB/env/root/origin/listen identity and retains the old container with automatic restart disabled. The new site uses port3003, original trusted origins/secret, private mounted roots, read-only image and writable temporary/cache filesystems. Its 2048 MiB runtime limit is a bounded rollout profile, not a benchmark certification of every advanced Atlas workload.
- Failed replacement is stopped before full logical database/file witness comparison. Only exact equality permits automatic return of the former container. Accepted writes, schema/files changes or an unavailable witness fence automatic rollback. No database restoration/migration or account/session reset occurs in normal deployment.

## Validation

| Gate | Current evidence |
| --- | --- |
| Full TypeScript | PASS, `artifacts/deployment-a5/types-4.log` |
| Full ESLint | PASS, zero errors/one inherited `LoreFamily` warning, `lint-2.log` |
| Existing unit runner | 2,942/2,942, 380 files, `units-1.log` |
| Existing environment integrity | 15/15, `environment-1.log` |
| Raster portability | 3/3, `raster-1.log` |
| Deployment local regressions | Fourteen Python cases plus five Node cases, covering actual disposable Git transition/dirty preservation, private config, build/identity/origins, resource refusal, exclusive lock and safe/unsafe modeled rollback; `deployment-10.log` |
| Bounded real Docker build | Pending exact hosted evidence |
| Real Next/PG18 rollout | Pending hosted deployment workflow: old ledger refusal, explicit synthetic upgrade, real website vs maintenance, missing roots/auth drift, full successful preservation, existing synthetic login/session/permissions, successful/repeated rollout, safe startup/HTTP rollback, unsafe rollback after actual DB write and unrelated-service preservation |
| Original offline Linux/Docker DR | Pending exact implementation run; original assertions retained |
| Exact final CI/clean parity | Pending publication receipt |

The initial local deployment-test failure was a Windows permission-model assumption in the synthetic helper. Windows now models that specific permission read only inside its cutover fixture; Linux exercises actual POSIX file modes. The original failure log remains retained. Compilation/patch launcher attempts, all failed build/CI attempts and exact causes remain visible in the final receipt rather than being replaced by later PASS counts.

## Preservation and outstanding acceptance

No application feature, authentication implementation, Atlas engine, geography, public asset, database migration/journal/snapshot, accepted native map or existing environment-management command is intentionally changed. `next.config.ts` adds only an explicit build-resource conditional. The final reviewed file inventory and preservation hashes are recorded below after review. Private diagnostics, synthetic databases/files, credentials, images and backups remain out of Git.

Outstanding real-host work requires separate owner authorization: run/review the redacted host preflight; establish actual env, PG18/TLS/ledger, UID/modes, roots/mounts and resources; obtain an actual paired backup/independent restore and separately approve any migration; authorize the live rollout window; verify actual local/tunnel sign-in, sessions, permissions and retained native content afterward. An isolated Docker PASS does not mean the owner host has been updated. The existing working/rollback images and containers must remain intact pending that review.

Stop after A5 technical delivery for Ember/owner review. Do not resume A3, build Earth, activate Canon, start Tabletop, change networks/services or execute a live Production migration.

## Exact reviewed inventory

The following 26 paths are the bounded A5 source/test/documentation set. All 324 published SQL/snapshots, 162 journal entries and 114 public assets remain unchanged; all original application/data/Atlas/authentication and environment-management implementation/assertion paths have no Git diff. The older 322 migration/snapshot files also match their retained pre-A4 raw-byte hashes. No new migration is introduced.

```text
.dockerignore
.github/workflows/deployment-a5.yml
.github/workflows/validate.yml
.gitignore
AGENTS.md
Dockerfile
docs/operations/deployment-a5-delivery.md
docs/operations/deployment-a5-migration.md
docs/operations/deployment-a5-ubuntu.md
docs/operations/environment-render.md
docs/operations/environment-ubuntu.md
next.config.ts
ops/build-website.mjs
ops/compose.candidate.example.yml
ops/deployment.test.mjs
ops/host-probe.mjs
ops/integration_deployment_a5.py
ops/stamp-build.mjs
ops/test_ubuntu_deploy.py
ops/ubuntu_deploy.py
ops/website-check.ts
ops/website-start.mjs
package.json
scripts/deployment-a5-fixture.ts
scripts/run-deployment-tests.mjs
tsconfig.website.json
```

The container resource mechanism follows the documented [Docker container-driver limits](https://docs.docker.com/build/builders/drivers/docker-container/). Heap alone is not a total memory budget; the enclosing container cap and measured peak are recorded separately. The [Next.js memory guide](https://nextjs.org/docs/app/guides/memory-usage) likewise distinguishes build memory from source validity; TypeScript checks remain enabled.

## Retained first hosted build failure

Implementation candidate `135c4dceec808357e72305f5c56c2a0b214330d9`, DR run `42885484931`, compiles successfully but its integrated Next TypeScript worker exhausts the proposed 2560 MiB heap. This is an actual measured failure, retained in `github-dr-135c4dce-failed.log`, not an inferred host OOM. The correction runs compilation, explicit Next type generation and a mandatory full non-incremental `tsc --noEmit` in separate terminated processes, with a 3328 MiB per-process heap inside the original 4096 MiB enclosing cap. Only this controlled Docker path skips Next's duplicate integrated checker; no image receipt can be produced until the full standalone checker passes. Ordinary builds and normal full TypeScript CI remain unchanged. An injected typecheck failure proves the completion stamp is refused. The larger heap and sequential profile remain pending real bounded-build validation.

## Runtime type-program boundary

Candidate `1e9a7dcf030dd01607d34b3d1cfcd2aa43060313`, DR run `42887173340`, proves that process separation alone is insufficient: the full program still exhausts a 3328 MiB heap after compilation and type generation pass. Its exact failure log remains retained. The build now uses `tsconfig.website.json`, which extends every original compiler option unchanged and checks all application/worker sources, generated route types, website preflight and environment/raster runtime entry points plus their transitive imports. Only non-runtime test/fixture roots are excluded from this duplicate server-build program. The original full-project TypeScript, lint and all unit tests remain required unchanged in normal CI. No TypeScript diagnostic is ignored in the production checker and any failure prevents stamping.

The local fresh non-incremental production check passes under the 3328 MiB heap in 55.09 seconds, reporting 3,012,325 KiB of TypeScript memory; this is a compiler observation on the development machine, not Docker/host peak certification. Real generated-route and total container memory acceptance remain mandatory hosted gates.

## Native output-link correction

Candidate `d867514dab5f5fe09c972f4e3590a9fbb68738e9`, DR run `42889221365`, passes compilation, type generation and strict production checking (84.743 seconds total; 53.359 seconds in production tsc). Its build-step cgroup reports a 3,803,029,504-byte peak and no OOM events; that recovery build is not the enclosing 4 GiB acceptance gate. The receipt then rejects Next's legitimate pg/sharp native dependency symlinks. The correction keeps source symlink rejection, validates compiled link targets remain within the release's immutable node_modules, hashes their target identity without traversal, and distinguishes link/file domains. A real filesystem regression accepts an internal native link and rejects one escaping that boundary. Both failed image workflows remain retained; no completed image was advertised from this candidate.

## First bounded image and fixture launcher finding

Candidate `254de51d5564435615440d55b1b5b73b08f9e3bc` passes normal CI `42890511330` and original recovery CI `42890511469`. Deployment run `42890511326` completes the hard-capped 4 GiB/one-CPU build and verifies exact Git/source identity. Receipt: build `29gB3Kgen2xAGGGW2cSg6`, source `86c733da7f9c78427d41fe33962fe9dcc6811796bdffa202d99772cf82366eb1`, artifact `e8e490df098929642da5079f2eb9ad1e4c63b6e2eac3a851e7accef0b1a7bffc`. Numerical build phases total 216.230 seconds (113.388 compile, 0.745 typegen, 102.096 production checking). The enclosing builder reaches its 4,294,967,296-byte cap; reclaim pressure is present, with no OOM kill. This supports the bounded profile, not universal headroom.

The deployment workflow then stops because the disposable PG fixture exits before readiness. That generic exit alone does not retrospectively prove its exact low-level cause. Source audit finds the website image intentionally lacks the recovery target's PG server socket-directory/JIT setup. The fixture is corrected to use its own private socket directory, disable test-server JIT and configure its synthetic auth context; redacted stage/code diagnostics are added. No deployment/rollback PASS is carried from this failed integration attempt.

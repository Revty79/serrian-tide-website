# A5 prebuilt image updates

Status: **technical PASS, ready for Ember/owner review** at `2feeb1fdb4fd4b79cb4a19d0d2420bf346385c32`. All four exact release CI workflows and independent fresh-runner acceptance passed. **Owner installation remains pending review.** This assignment made no live-server changes. The preceding [trusted-origin command is ready](deployment-a5-trusted-origin.md#ready-one-time-owner-command), pinned to `973d4f57`; its actual host application and public account login remain pending. Let the owner's current update finish before that operation.

## Release and deployment contract

The ordinary command remains `serrian-update`. The new private version 2 package requires exact successful latest-attempt push/main validation, environment recovery, Ubuntu deployment and prebuilt publication workflows. Tags only discover a digest. GitHub CLI 2.103.3 independently validates Sigstore signatures, trusted roots, transparency evidence, exact source/signer commit, main ref and fixed signer workflow. Additional policy binds the repository ID 1345519067, owner ID 132003666, hosted push event, publication run/attempt and exact image subject/digest. A tag/label/filename alone never authorizes deployment.

The existing bounded A5 build happens in GitHub Actions. After all existing deployment tests, an immutable one-day Actions artifact transports only that pristine image and its hash/build receipt to a separate publisher. All three source workflows/jobs must pass first. The publisher verifies archive SHA256, image ID, Git source fingerprint, compiled output/build identity, forbidden private paths and actual Next.js startup, then publishes `ghcr.io/revty79/serrian-tide-website:sha-<commit>` and signs its immutable digest. It refuses replacement of an occupied commit tag with a different image. Publication success additionally requires actual registry/provenance and isolated installation/deployment/fault/timing tests. A pushed but failed/incomplete candidate is not deployable.

The server downloads by digest, checks RepoDigests/linux-amd64/source labels and the original A5 build/output receipt. No automatic local build, mutable `latest`, migrations, configuration rewriting, secret rotation, session reset or DB restore exists in this path. Explicit registry failure stops while the original website remains available. Downloaded layers may remain in Docker's cache for retry; no broad prune/cleanup runs.

All original A5 host/daemon locks, exact migration/configuration checks, runtime/source verification, read-only mounted checks, real website smoke, private frozen DB/file witnesses, port 3003/listen address, existing persistent mounts/restart policy, data-aware rollback and preserved previous image/container remain. Confirmation follows image and application preflight. CI and host identity are rechecked afterward. The core's only behavioral extension is an overridable image-reference method whose default remains the original local-build tag. The prebuilt adapter refuses build() and implicit Docker pulls. The original updater/installer remain available as **separately reviewed recovery**, never automatic fallback.

The installer verifies its exact source/CI, downloads a fixed official GitHub CLI Linux-amd64 archive with a pinned SHA256 and executable hash, retains its MIT license, and installs it privately rather than changing global packages/accounts. A small fixed root helper preserves the original managed root launcher before atomic replacement. Unrecognized commands, modified old packages, active old update locks and incomplete differing installs stop. Existing credentials and Docker login settings are not changed by installation. Registry credentials, if needed, belong in the owner's normal Docker credential store, never `.env.production` or the image.

## Resource and cost assessment (checked 2026-11-11)

This repository is public. Standard hosted public-repository runners are free; larger runners are billed. GitHub currently states that GHCR container storage and bandwidth are free and promises at least a month's notice before changing that policy. This is a current policy, not a perpetual guarantee. See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) and [Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages).

The tested-image transport artifact is distinct from GHCR. Artifact storage accrues hourly against the account allowance; retention is one day, compression level 1. The measured archives are about 0.726 GiB. At $0.25/GiB-month excess storage, one retained for 24 hours costs about $0.006 if entirely outside the allowance. Actions artifact allowances are 500 MB on Free, 1 GB on Pro, 2 GB on Team and 50 GB on Enterprise; other account usage affects availability. Cache has a separate 10 GB/repository allowance. No larger runners, paid plan, spending increase or account changes are configured. Owner billing and home ISP usage are unmeasured; zero total charges are not claimed.

Public repositories can use artifact attestations on Free/Pro/Team; private repositories require Enterprise Cloud. See [GitHub attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations). The verifier uses a downloaded bundle with fixed repository IDs, so it does not require a new GitHub CLI account login; [offline verification guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline) explains why names alone are insufficient. Actual anonymous GHCR manifest and GitHub attestation reads return HTTP 200 for release `2feeb1fd`. No visibility/account setting changed. The [public attestation API](https://docs.github.com/en/rest/repos/attestations#list-attestations) permits these public reads without extra token permissions. Owner-network reachability remains a live-host acceptance item.

Server operation retains A5's 2 GiB runtime/check limit plus 2 GiB free host reserve and 12 GiB disk floor. It launches no 4 GiB builder or 3328 MiB Node compiler. Download duration depends on changed compressed layers and the actual connection. The Ryzen 2400G owner's CPU/WAN/SSD have not been benchmarked or changed. Hosted Ubuntu timings below exclude human waiting. Old deployment images/containers remain retained; any later capacity/retention cleanup requires separate review.

GitHub's [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) also apply: anonymous reads normally allow 60 requests/hour per public IP; authenticated user requests normally allow 5,000/hour. Exact CI verification remains fresh at selection and cutover. Rate limiting stops safely with a retry-later explanation, never cached approval or a local build. Existing optional read credentials remain supported; this task creates none.

## Validation and delivery

The signed image, original source suites, real registry/deployment/failure tests, measured comparison and independent literal installed-command acceptance passed. Documentation publication uses `[skip render]`; the final handoff additionally verifies its normal CI and clean local/origin/official-remote parity. Earlier failed attempts remain recorded below. Owner installation and live-host acceptance are separate.

At release `2feeb1fd`, [normal CI 43114586066](https://github.com/Revty79/serrian-tide-website/actions/runs/43114586066) passes TypeScript, full lint (one inherited warning), 2,942 feature tests, 3 raster tests, 15 integrity tests and 81 deployment cases (64 Python, 15 JavaScript, 2 TypeScript). [Recovery CI 43114586095](https://github.com/Revty79/serrian-tide-website/actions/runs/43114586095) passes 15 actual signed PostgreSQL/storage backup, independent restore, interruption, preservation and portability groups plus 15 integrity tests. Image/deployment acceptance is independently evidenced below.

[Ubuntu CI 43114586051](https://github.com/Revty79/serrian-tide-website/actions/runs/43114586051) passes the bounded real production build, root-launcher checks, actual deployment, original one-command updater, same-image trusted origins, legacy TLS authentication transition and standard bootstrap/independent restore. The pristine image is `sha256:5a8387106d1fd4076f1b09010f673e87358fb927b85c19141afa271ef7c1fdaf`, Next.js build ID `H6d6M0P37xtvf7u5GtU1p`, output hash `f6ade860dc2a8704cd5265306b744936abd5a40dbfd8e5a71f662a7b261378d5`. Its one-day transport artifact 13900691166 is 779,193,173 bytes, with 1,941,657,600 bytes of image tar. The original builder remains capped at 4 GiB/one CPU/3328 MiB Node heap; its observed peak reaches 4 GiB without OOM/kill. The new updater never launches this builder.

The real GHCR image manifest is `sha256:dd9c82efa54748887a5556dad8245341990b860b5ecd11950cdd0a7b0ab1357b`. An independent anonymous manifest read verifies the response bytes against that SHA256 and confirms the tested image configuration digest above. Its 12 compressed layers total 723,864,551 bytes (about 690 MiB); reused layers reduce a subsequent transfer. The attestation bundle is also readable anonymously. Metadata reads alone never authorize release: the pinned CLI independently verifies its cryptographic signature and exact workflow provenance.

[Publisher CI 43114586226](https://github.com/Revty79/serrian-tide-website/actions/runs/43114586226) passes all six new integration groups: actual signed source/run identity, original-to-prebuilt launcher installation and repeat, unavailable registry/mismatched digest/corrupted signature/real interrupted download, full cold-candidate update and repeat, cancellation and actual failed-health rollback, and the same-source performance comparison. Existing account/session/World, full frozen database/file equality, protected configuration, three mounts and old image/container preservation pass. At 23:56 UTC on November 11, the actual `GitHub().verify()` policy independently accepts all four completed latest-attempt runs/jobs for this exact source; local and remote main match.

Independent fresh-runner [acceptance 43123593327](https://github.com/Revty79/serrian-tide-website/actions/runs/43123593327) also passes all six groups, completing on November 12 UTC. Successful installation and the literal `/usr/local/bin/serrian-update` use the real completed GitHub checks and GHCR verification, without substituted publication status. It repeats actual fault handling, preservation, health rollback, no-op and performance checks in a new Ubuntu environment. The exact four-file owner bundle imports under isolated Python; the copy-and-paste block below passes Bash syntax checking without being run on the owner host.

## Measured update performance

The publisher's owned Ubuntu 24.04 runner measured a complete update with the previous version installed and the candidate absent from a separate Docker daemon. Interrupted-download layers were kept in a third daemon, preventing them from warming this measurement. Human confirmation wait is excluded from the updater's internal total; the external command timer includes the effectively immediate automated answer.

| Measurement | Publisher run | Independent acceptance |
| --- | ---: | ---: |
| Complete prebuilt command | 69.79 s | 67.06 s |
| Registry discovery and cryptographic provenance | 4.80 s | 4.43 s |
| Actual image download/extraction | 30.43 s | 28.85 s |
| A5 application checks and cutover | 25.68 s | 23.19 s |
| Cutover and health checks, included in the preceding row | 14.43 s | 12.11 s |
| Repeat command, no download/build/restart | 16.26 s | 16.09 s |
| Original same-source bounded build | 445.34 s | 393.84 s |
| Original updater deployment after that build | 34.24 s | 31.41 s |
| Total local build and deployment | 479.58 s | 425.25 s |
| Complete-update speed ratio | 6.87 times faster | 6.34 times faster |

The remaining prebuilt time covers source/CI selection, host checks and command overhead. The original builder reached its unchanged 4 GiB cap without OOM/kill; the new path invokes no build or Buildx operation. Existing A5 runtime/check containers remain capped at 2 GiB. These are hosted-runner results, not measurements of the owner's Ryzen 2400G, WAN, disk or real data volume. Network speed and retained database/file checks still affect actual duration. A separate warm-cache version upgrade was not timed; cached cancellation/failed-start rollback and healthy repeats were exercised.

Local implementation check: the original 52 Python cases plus 12 prebuilt cases pass where applicable (three existing POSIX-only skips on Windows), 15 JavaScript and 2 TypeScript deployment tests pass. TypeScript and full ESLint pass with the existing unused `LoreFamily` warning. Existing application/authentication/schema/terrain/storage data and migrations are unchanged. These checks do not replace Ubuntu or owner acceptance.

Retained preliminary attempts: 1cbca381's four workflows were intentionally cancelled after identifying the hosted runner's writable launcher directory; the owned fixture now exercises the original refusal and hardens only its disposable runner directory.29a6f236's four workflows were superseded for the already-current local-image no-op and actual download-interruption coverage. Neither candidate is a released image. This is fixture/implementation development, not evidence of a successful host deployment.

Installer registry access is checked before replacing the existing command. A missing/private package without read access stops safely and preserves the old updater. No new GitHub account, access token or owner configuration is created automatically. An already-running managed local build of the exact selected source is verified with A5 and retained without downloading/rebuilding; the receipt explicitly distinguishes it from a registry-attested running image. The next new version uses the full digest/provenance path.

Retained 491808fa failure: all three original CI suites passed, and publisher43106374756 proved actual signed provenance, launcher upgrade, transfer failures, real cold candidate deployment, unchanged database/files/session/World, repeat, decline and failed-health rollback. Its subsequent local-build comparison failed at Buildx bootstrap; its signed image remains ineligible. The corrected fixture measures the original bounded build before creating additional Docker daemons, keeps the real deployment comparison afterward, and retains public build-setup diagnostics. The failure's underlying Docker diagnostic was not available in that original receipt, so a specific cause is not asserted. e078d636 additionally separates the interrupted pull into a third owned daemon, preventing partial layers from warming the later cold-candidate measurement. The corrupted/truncated transport test verifies failure before any Docker load.

The dd545459 publisher43107352095 and e078d636 publisher43107944335 reproduced the same final comparison failure after all preceding integration groups passed. The latter also passed the separately isolated actual download interruption. The 241a529b timing-fixture candidate was superseded by 2feeb1fd, which adds the archive-corruption regression; its pending workflows were cancelled rather than promoted. These are retained failed/superseded attempts, not successful release receipts.

## Source preservation and review boundary

Compared with starting main `cafb67648769816b548a8010777c59a67eabeb58`, 10,678 of 10,683 existing tracked files are unchanged. The five changed existing files are this task's `AGENTS.md` guidance, ignored artifact paths, the original Ubuntu workflow's public-image export step, the Docker source-repository label, and the six-line overridable image-reference hook in `ubuntu_deploy.py`. Ten new workflow/operator/test/report files implement the registry path. No original application, authentication, environment, PostgreSQL recovery, schema, migration, storage or original updater/installer implementation is replaced.

The protected 2,476-file application/data/public/migration/package/original-updater set is byte-identical. Candidate `2feeb1fdb4fd4b79cb4a19d0d2420bf346385c32` has 3,373 release inputs and Linux/Docker source SHA256 `67ab6b1b44298eb3c66d1026bf5a9f449dbb986fc4ab2e58e0b9f72e5a6fc061`, independently reproduced locally using process-only Git LF settings. The Windows checkout's existing `core.autocrlf=true` produces archive hash `e64213ab43b07cc22018a19ccd23b8b1df083218b7e0bda8eb0aff4c6c2b152b`; that is a different line-ending representation, not the Linux image fingerprint. No Git configuration or tracked bytes were changed for this comparison. Strict A5 source matching remains in force: an incompatible source conversion stops rather than accepting a different image. Evidence remains ignored under `artifacts/deployment-a5-prebuilt/`; no owner configuration, storage, database, recovery archive or account is read or published by this assignment.

The publisher's integration fixture cannot wait for its own final success. Its external test driver supplies only that still-running publication status, while the three completed source CI suites, registry, cryptographic verifier, PostgreSQL, images and application are real. Final acceptance repeats successful installation and the literal command on a fresh hosted Ubuntu runner against all four genuinely completed CI checks, without that status substitution. Fault injection stays external to the installed runtime; no production bypass flag exists.

Stop for Ember/owner review before changing the installed command. This assignment has not changed or benchmarked the actual Ryzen 2400G server, its network, Cloudflare tunnel or live authenticated session. The owner's current update was not interrupted. Existing TLS/bootstrap regressions cover proxy/authentication behavior in owned fixtures; this is not a claim of new actual-host acceptance. The prior domain-origin operation and owner login remain separately pending. The original local-build implementation/private package and root launcher are retained for separately reviewed recovery, never invoked as an automatic fallback.

## One-time installation, after acceptance and owner review

Wait for any current server update to finish. After the independent acceptance gate and Ember/owner review pass, run this once in the Ubuntu server terminal as `brannan`, without prefixing it with sudo. The installer may request the normal Ubuntu sudo password to publish the root-owned launcher. Leave the website and Cloudflare tunnel running. This block installs the command; it does not deploy or change protected configuration.

```bash
(
  set -eu
  umask 077
  cd /apps/serrian-tide-next

  RELEASE='2feeb1fdb4fd4b79cb4a19d0d2420bf346385c32'
  git fetch --no-tags origin main
  git merge-base --is-ancestor "$RELEASE" origin/main

  INSTALL_DIR=$(mktemp -d /tmp/serrian-prebuilt-install.XXXXXX)
  trap 'rm -f -- "$INSTALL_DIR/install_serrian_prebuilt_update.py" "$INSTALL_DIR/serrian_prebuilt_update.py" "$INSTALL_DIR/prebuilt_release.py" "$INSTALL_DIR/serrian_update.py"; rmdir -- "$INSTALL_DIR"' EXIT

  for MODULE in install_serrian_prebuilt_update.py serrian_prebuilt_update.py prebuilt_release.py serrian_update.py
  do
    git show "$RELEASE:ops/$MODULE" > "$INSTALL_DIR/$MODULE"
  done

  python3 -I -B "$INSTALL_DIR/install_serrian_prebuilt_update.py" \
    --repo "$PWD" --commit "$RELEASE"
)
```

Future ordinary updates require only:

```bash
serrian-update
```

The command selects and verifies the newest eligible release, downloads its image, runs A5 preflight, and asks once before replacement. Close pgAdmin and other direct database/file writers before confirming. Migration/configuration differences, unavailable verification, or insufficient resources stop safely with an explanation. An already-deployed healthy version exits without rebuilding or restarting. The existing local-build recovery files remain preserved; invoking or restoring that path is a separate reviewed operation.

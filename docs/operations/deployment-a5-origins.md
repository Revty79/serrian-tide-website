# A5 bootstrap LAN-origin correction

This receipt is historical. The subsequently confirmed legacy public-HTTP base requires the separate [final authentication transition correction](deployment-a5-auth-transition.md); the LAN-only validation below did not cover that source configuration.

Starting checkpoint: `376faf85baf5c45365a33711e5c1959df7bd1dea`. Owner brief: `225d757c-3ff4-4189-a006-19eaa4c89224`. This is a source correction and isolated verification assignment. The owner's reported migration/storage readiness and live LAN/tunnel configuration are not independently certified by this report.

**Technical PASS** at implementation `bad60d02e826cfefc553284f586a8e3f5f3c151a`. Exact normal validation, original disaster recovery and complete Ubuntu deployment/bootstrap CI all pass. Live server execution and owner/Ember acceptance remain separate.

## Root cause and correction

The A5 `origins()` validator required a configured `http://localhost:3003` or `http://127.0.0.1:3003`, even when the working website explicitly used its actual LAN address. A LAN origin plus an exact HTTPS tunnel therefore failed `AUTH_LOCAL_ORIGIN`. The existing tests covered only loopback configuration and missed this valid host-network arrangement. This was a deployment validation defect, not evidence that the owner's working authentication settings needed changing.

`ops/host-probe.mjs` now validates each explicit origin. Local HTTP3003 origins may use `localhost`, `127.0.0.1`, or an RFC1918 IPv4 address actually assigned to a non-internal IPv4 interface in the process's network namespace. Merely being a private address is insufficient. The local port must be exactly 3003; wildcard, credentials, paths, queries, fragments, noncanonical URL spellings, wrong addresses and wrong ports are refused. External origins must be explicit canonical HTTPS DNS names with valid labels. No wildcard tunnel, insecure external HTTP origin or arbitrary IP origin is accepted alongside an otherwise valid local origin.

The server must still have at least one explicitly configured local origin, either as the base URL or among trusted origins. Both LAN-base/tunnel-trusted and tunnel-base/LAN-trusted arrangements are covered. Values retain their existing roles and order. No environment setting, application trust list, cookie policy, CSRF check, authentication code, account or session is rewritten. Recognizing localhost as a possible configuration does not add localhost to a LAN-only application's trusted origins.

The network evidence comes from the operating system, not DNS, an environment override or a hardcoded owner address. [Node's interface inventory](https://nodejs.org/api/os.html#osnetworkinterfaces) supplies assigned addresses, family and internal status. On Linux, [Docker host networking](https://docs.docker.com/engine/network/drivers/host/) shares the host network namespace. All A5 origin checks and the deployed website already use this networking mode. The pure function's interface argument exists for deterministic unit tests; executable probes always read the real interfaces.

## Complete-path audit

| Location | Result |
| --- | --- |
| `ops/host-probe.mjs` | One shared origin validator, plus a built-in-only `--auth-probe` entrypoint. Failures print fixed redacted codes. No database or storage access in auth-only mode. |
| `ops/bootstrap-probe.mjs` | Unchanged. Its specialized old-storage, prepared-root and database/ledger checks do not decide authentication trust. |
| `ops/ubuntu_bootstrap.py` | Initial legacy preflight now pipes the reviewed shared validator into a bounded, read-only, host-network helper using the existing image and unchanged protected env. Invalid auth refuses before build, database probes or stopping the website. Candidate auth must equal the initial report. |
| `ops/ubuntu_deploy.py` | Unchanged. Normal host probes use the same reviewed validator in host networking; candidate/frozen/post-start checks call `website-check.ts`. Existing environment/configuration and auth-report equality remain mandatory. |
| `ops/website-check.ts` | Unchanged. Imports `probe()` from the corrected shared module and retains all schema, roots, reference, frozen-writer and state-equality checks. |
| `ops/website-start.mjs` | Unchanged. Normal startup invokes the same website preflight before Next.js. The pre-existing isolated, network-none smoke fixture remains synthetic and is not an authentication approval path. |
| `src/lib/auth.ts` | Unchanged. Better Auth retains the explicitly configured base and trusted origins, session/cookie behavior and CSRF enforcement. |
| Health probes | Unchanged anonymous `/login` requests to loopback verify the local Next.js listener; health access does not require adding loopback to authentication trust. |
| Backup/restore and rollback | Unchanged original signed snapshot, independent native PostgreSQL restore, restored-state verification and full frozen source-equality requirements. No migrations, source restores or old-container deletion are introduced. |

## Validation and preservation

The exact changed-file inventory is two implementation files (`ops/host-probe.mjs`, `ops/ubuntu_bootstrap.py`), two regression files (`ops/deployment.test.mjs`, `ops/integration_bootstrap_a5.py`), this report and the two existing A5 operation guides, plus the bounded instruction receipt in `AGENTS.md` and the private-test-output exclusion in `.gitignore`. No application, authentication, schema, migration, Dockerfile, workflow, normal updater, original deployment integration or original environment-recovery implementation is changed.

Four additional Node test groups exercise actual-address matching, all three RFC1918 ranges and boundaries, localhost/127, both base/trusted roles, exact HTTPS tunnel handling, unavailable/internal/wrong-family interfaces, wrong ports and addresses (including beside a valid localhost), malformed/wildcard/credential-bearing origins, unchanged frozen env input and standalone old-image stdin execution. The new regressions were run against the starting implementation first; the retained failures reproduced the missing LAN support and insufficient per-origin rejection.

The existing real bootstrap fixture now discovers its hosted Ubuntu runner's actual assigned LAN address and uses it for authentication on port3003, with an exact synthetic HTTPS tunnel and no configured loopback origins. It never injects interface identities into the application. Real legacy Next.js containers with wrong LAN/port/wildcard configuration must remain running and retain their exact env on initial preflight refusal. All previous migration, storage, restore, cutover, configuration-failure, accepted-write and bystander preservation assertions remain in place.

Before and after deployment, real sign-in requests must accept the explicit LAN and exact tunnel Origin headers and reject attacker, different tunnel, wrong LAN/port and unconfigured loopback origins with 403. The original cookie must retain its exact user/session identity after replacement and after additional login/origin checks. Authenticated World reads, protected original env prefix, old image/container, mounts and the normal updater's idempotent repeat are verified. The original separate localhost/127 deployment integration suite remains byte-for-byte unchanged.

Local Windows validation passes full TypeScript, full ESLint (one inherited `LoreFamily` warning), all 2,942 feature tests, all ten Node/two TypeScript deployment cases and 22 Python cases with the Linux-only atomic-directory-sync case skipped. The 18 original integrity/raster cases have 17 passes and the original POSIX-permissions case skipped on Windows. Both platform-specific cases pass on Ubuntu. Python syntax and protected-source comparisons pass.

Retained hosted failures: [run 42950944921](https://github.com/Revty79/serrian-tide-website/actions/runs/42950944921) and [preceding-source run 42950826894](https://github.com/Revty79/serrian-tide-website/actions/runs/42950826894) passed the bounded build, original deployment suite and new initial LAN/port/wildcard preservation checks, then failed the new authentication test with HTTP429. Better Auth's unchanged sign-in limiter resets after ten quiet seconds since its last accepted attempt; spacing attempts four seconds apart did not reset its count. The fixture now leaves eleven quiet seconds between each sign-in assertion. It still requires HTTP200 for configured origins and HTTP403 for every denied origin; no retry, assertion, limiter or authentication setting was relaxed. Normal CI42950944959 and original recovery CI42950944910 passed, but do not substitute for the corrected full rerun below.

## Final verification receipt

| Exact implementation evidence | Result |
| --- | --- |
| [Normal CI42952379530](https://github.com/Revty79/serrian-tide-website/actions/runs/42952379530) | PASS: full TypeScript, full lint with the one inherited warning, all 2,942 feature tests, three raster tests, 15 integrity tests and all 34 deployment unit cases (22 Python, ten Node, two TypeScript); no Linux skips. |
| [Original recovery CI42952379372](https://github.com/Revty79/serrian-tide-website/actions/runs/42952379372) | PASS: all 15 original actual PostgreSQL/storage recovery groups and all 15 integrity cases. |
| [Full Ubuntu CI42952379378](https://github.com/Revty79/serrian-tide-website/actions/runs/42952379378) | PASS: bounded exact-source website build, all 11 original deployment/authentication/rollback groups and all 13 LAN bootstrap groups. |
| Authentication | PASS: actual assigned LAN base on3003 plus exact HTTPS tunnel trusted origin; valid sign-ins before/after deployment; original cookie retains exact account/session identity. Attacker, different tunnel, wrong LAN/port and unconfigured loopback origins return403. Both base/trusted origin roles also pass deterministic unit tests. |
| Recovery and preservation | PASS: fresh signed/encrypted snapshot, independently authenticated open, new native Ubuntu PG18 restore and restored-state verification, stopped disposable cluster, unchanged original witness, retained original config/image/container, new mounts and normal updater idempotent repeat. |
| Failure boundaries | PASS: initial wrong LAN/port/wildcard refusals retain the working legacy container and exact env; old161/altered162 ledger, nonempty roots, old storage and existing World refuse. Restore/startup/configuration-activation failures recover safely; an actual accepted DB write prevents automatic rollback. Bystander remains running. |
| Owner launcher | PASS: the two Git-extracted launcher files load independently, and the complete Bash block passes syntax checking. No live server command is executed here. |

Verified build ID: `m-v00t5Y6f-iGS34MuMih`; source fingerprint: `2fb1e4f2712f7e4a7aa34de15d6ad8b45a17875b1f063972a5cd285574c768b6`. Required compile/typegen/production-TypeScript phases took274.070 seconds. The unchanged enclosing4GiB/one-CPU builder reached its4,294,967,296-byte cap with reclaim pressure and zero OOM/kill events; inner phase peak was3,693,535,232 bytes. This is hosted evidence, not certification of available owner-server memory. No resource or acceptance threshold was raised.

Fresh Git comparison against the starting checkpoint verifies the protected application/authentication, data, assets, all published migrations, Dockerfile, original updater/integration suite and original environment recovery implementations remain exact. Only the nine listed files differ. Private logs and retained failed-before/final receipts are ignored under `artifacts/deployment-a5-origins/`. The following documentation-only publication must preserve the complete tested release inputs and pass exact normal CI/clean main parity before final delivery. Its final owner block may pin that documentation receipt after source equality is verified. Stop for owner/Ember review before any live deployment.

## Limits and owner operation

This bounded A5 host profile supports explicit IPv4 LAN literals and HTTP3003. It does not infer LAN identity from DNS aliases, NAT public addresses, IPv6 or every private address. A DHCP/address change requires a matching explicit configuration and current interface; the tool refuses stale origins instead of silently adding trust. Exact external HTTPS DNS origins remain explicitly owner-configured. Hosted tests exercise tunnel Origin handling, not a live Cloudflare tunnel or external TLS/reachability.

No live Ubuntu host, Production/DEV database, owner environment file, recovery point, container, image, account or private storage is accessed during this correction. The owner's successful live bootstrap, external tunnel reachability and normal browser login still require owner execution/review. All earlier resource, locale, extension, writer-freeze, backup/restore and rollback refusal conditions continue to apply. No later Atlas/Earth/A3/Tabletop assignment begins here.

Use the corrected, pinned single-block command delivered with this report and the operational requirements in [the bootstrap procedure](deployment-a5-bootstrap.md). Leave the existing website running for its own preservation checks; stop other writers, jobs, imports and pgAdmin first. The command rechecks the actual migration ledger and creates and independently restores a fresh signed backup before a replacement can start. It does not assume the earlier pgAdmin backup was restored or run a migration.

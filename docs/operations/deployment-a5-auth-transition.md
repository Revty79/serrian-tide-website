# A5 final legacy authentication bootstrap correction

Starting checkpoint: `3c1a05a6d48c686c6b3cd93b58a213bd250e05b7`. Owner authorization: `30d697b2-62ee-4891-b724-3d5ecd025441`. Scope is the existing Ubuntu bootstrap; no live owner-server access or deployment is performed by the agent. Implementation and hosted verification are in progress; this is not yet a PASS receipt.

## Confirmed cause and bounded transition

The owner's actual running environment has a public HTTP IPv4 base URL, an explicitly configured assigned LAN origin on 3003, and two individually configured HTTPS tunnel origins. The first correction correctly rejects the public HTTP base as a new deployment configuration. It did not provide a transition from the older running configuration. The previous LAN-only fixture did not reproduce that legacy base URL.

The normal `ops/host-probe.mjs` validator remains byte-for-byte unchanged and continues rejecting public HTTP IP origins. A separate `bootstrap-auth-source.mjs` planner is used only after bootstrap has positively identified the running host-network legacy container, its old image, absence of mounts/root settings, and exact protected configuration values (including both directions for auth/DB keys). It recognizes a canonical nonlocal HTTP IPv4 base on 3003 only as an original being preserved. It never authorizes a new deployment with that base.

The planner selects the first already explicitly trusted HTTP on port 3003 LAN IPv4 origin that is assigned to a non-internal interface. It does not guess a public NAT address, add localhost or discover/assume an active tunnel. The complete candidate must pass the original strict validator. All existing trusted entries must independently remain valid; malformed, wildcard, insecure public, wrong-port or unassigned-LAN entries refuse the transition.

The candidate file retains all original bytes except the one `BETTER_AUTH_URL` value and the three already authorized appended storage settings. Comments, line endings, secret, trusted-origin list, DB URL and unrelated settings stay exact. The original remains protected in the run directory. Active `.env.production` is not edited during preflight, build or restoration. After the new real website passes checks, activation uses the existing guarded atomic replacement. A state-verified safe rollback restores every original configuration byte, including the public base; accepted writes or unavailable equality proof still forbid automatic rollback.

## Canonical base, actual Better Auth behavior and cookies

The application client uses same-origin authentication requests; email and username/password login do not require redirecting the browser to the canonical base. The server retains the explicitly configured origin allowlist. An assigned LAN base is stable when a temporary tunnel expires, while either explicitly configured HTTPS tunnel can still proxy same-origin authentication. Choosing either of two tunnel URLs as canonical without knowing which remains active would introduce an unjustified availability dependency.

The installed Better Auth 1.7.1 implementation derives its cookie naming/security mode from the static base URL. Changing public HTTP to LAN HTTP preserves that mode and the existing authentication secret. No application authentication code, library dependency, CSRF rule, rate limiter, cookie prefix, cookie domain, session record or credential is changed by this correction. [Better Auth's cookie documentation](https://better-auth.com/docs/concepts/cookies) and [base-URL options](https://better-auth.com/docs/reference/options) describe the relevant mechanisms; the actual installed implementation and real application tests are authoritative for this pinned release.

Important explicit limit: in the existing mixed HTTP/HTTPS configuration, cookies are host-only, HttpOnly and SameSite=Lax, but their `Secure` attribute is false because the canonical base is HTTP. TLS protects their transport through the HTTPS proxy; this is **not** a claim that they are Secure-flag cookies. This correction preserves the existing policy instead of globally forcing Secure cookies and breaking required HTTP LAN access. HTTPS-only cookie hardening or a per-origin cookie policy would be a separate reviewed application change. No CSRF or cookie setting is disabled or weakened here.

Existing cookies on the same LAN or tunnel hostname can survive the base transition when the secret, cookie name and database session stay unchanged. A cookie held for the former public-IP hostname cannot be transferred to a LAN address or another tunnel hostname. Those users must visit a currently permitted origin and sign in again. Sessions are neither revoked nor copied between hosts. Removing the former base's trusted-Origin status does not change firewall/listener exposure or erase existing database sessions; this is not a network-hardening operation.

## Real authentication check before activation

`bootstrap-auth-health.mjs` checks the actual new Next.js auth routes through loopback before activating configuration. It checks anonymous get-session, every explicit allowed origin, an unconfigured origin, absent Origin, an invalid callback and the retired public Origin when applicable. The sign-out probes send only an unrelated fixed canary cookie, never a real session cookie, token, password or account. That forces normal CSRF validation without identifying or deleting a session. A unit test runs the actual Better Auth handler with all DB calls fenced and proves this canary performs zero account/database operations.

The canary does not contact external tunnel services or declare old tunnel URLs active. Real end-to-end TLS behavior is tested in the owned Ubuntu fixture; live Cloudflare availability and owner browser acceptance remain separate checks. An actual new website with missing tunnel trust must fail the auth probe, remain unactivated, stop, and permit rollback only after the unchanged complete DB/file witness passes.

## Regression fixture and required evidence

The existing full bootstrap fixture remains available in its original LAN configuration. An additional `--legacy-auth` run reproduces the newly confirmed shape: a synthetic nonlocal documentation IPv4 HTTP base, real assigned LAN trusted origin, two exact HTTPS trusted origins, no old storage mounts, three empty private roots, a populated PG18 source with verified 162 migrations, and existing account/session data. No actual owner IP or tunnel hostname is embedded in the new fixture.

The TLS fixture uses an actual TLS listener, a newly generated certificate with both exact test names, certificate-chain and hostname verification, and an HTTP reverse proxy to the real Next.js application. Clients map only the owned fixture names to the owned loopback listener; no DNS, system trust store, Cloudflare resource or owner network is changed. Cookie jars enforce real host boundaries. The fixture checks both old HTTPS sessions after cutover, fresh username login, authenticated World reads, HttpOnly/host-only/SameSite behavior, denied CSRF and the public-host reauthentication boundary. A separate transport unit verifies the TLS proxy and cookie host isolation.

All existing ledger/storage/restore/startup/configuration-activation/accepted-write/bystander assertions remain. The legacy run adds a real backup-engine refusal and a real healthy Next.js authentication-misconfiguration failure. It requires retained original configuration/image/container, successful independent signed restore, equality of new active env and container env, and ordinary A5 repeat deployment. Failed attempts remain recorded; no failure is reclassified as success.

Exact results, final source identity, CI links and the owner launcher pin will be added after the complete validation gates pass. The previous reports remain historical evidence, not proof of this newly required legacy transition.

## Changed-file scope and owner boundary

Implementation is confined to the bootstrap, a separate read-only auth-source planner and an anonymous auth-health probe. New/extended regression helpers, tests and the existing deployment workflow cover the real legacy/TLS scenario. The strict origin validator, actual application/authentication code, normal updater, migration history, original recovery implementation and all Atlas functionality remain unchanged.

The final owner block will extract the two reviewed Python launchers from its pinned Git commit and use the existing bootstrap options. No manual auth edit, DEV env copy, account change or migration is requested. The operator rechecks the real source ledger/storage, creates a fresh signed backup and independently restores it before cutover. Close other writers/pgAdmin and leave the working website/tunnel running for the initial checks. Stop for owner/Ember review before running the block on the real server.

## Local pre-publication validation

Full TypeScript, full ESLint (the inherited unused `LoreFamily` warning), and all 2,942 feature tests pass. Deployment validation runs 25 Python, 15 Node and two TypeScript cases; the Windows-only directory-fsync case is skipped on Windows and must run on Ubuntu. The new TLS transport case passes locally with certificate and hostname validation enabled. All changed Python sources parse, and the Git whitespace check passes.

The first local TLS unit attempt failed because Git for Windows OpenSSL could not use its machine-default configuration. The helper now creates an owned minimal certificate configuration explicitly; the transport test and complete deployment unit rerun pass. That failed log remains in ignored `artifacts/deployment-a5-auth-transition/`; no test or security assertion was relaxed.

A fresh comparison against the starting checkpoint confirms unchanged application/authentication sources, data/assets, migration history, dependency versions, Dockerfile, normal origin validator/updater, original deployment integration and environment recovery implementation. Hosted real PostgreSQL/Next.js/rollback verification is still required before delivery.

## Review inventory

| Files | Purpose |
| --- | --- |
| `ops/ubuntu_bootstrap.py` | Verify the legacy source, stage the approved base-only change, require real anonymous authentication checks before activation. |
| `ops/bootstrap-auth-source.mjs`, `ops/bootstrap-auth-health.mjs` | Built-in-only source planner and account-free live Next.js canary. |
| `ops/bootstrap-auth.test.mjs`, `ops/test_ubuntu_bootstrap.py` | Strict-validator separation, exact environment preservation, old-image composition and real Better Auth zero-DB-call checks. |
| `ops/bootstrap_tls_fixture.py`, `ops/test_bootstrap_tls_fixture.py` | Owned verified TLS reverse proxy, cookie jars, existing/fresh logins and transport isolation. |
| `ops/integration_bootstrap_a5.py`, `scripts/deployment-bootstrap-fixture.ts` | Preserve the original fixture and add the full legacy source, two TLS hosts and authentication/backup failure recovery. |
| `scripts/run-deployment-tests.mjs`, `.github/workflows/deployment-a5.yml` | Run the additional units and the additional real legacy integration scenario. |
| `.gitignore` | Keep local diagnostics and generated certificates private. |
| `AGENTS.md`, this report, `deployment-a5-bootstrap.md`, `deployment-a5-origins.md` | Bounded authorization, exact delivery evidence and distinction from earlier historical coverage. |

No imported geography, database, credential, generated certificate, private configuration or backup is included in Git. The local launcher is syntax-checked and the two Git-extracted Python files load independently without requiring a repository-wide checkout change first.

## Retained first hosted attempt

First attempted implementation: `1cd2d9c23c6b1be281b1ae84689158a30351cf06`.

| Evidence | Result |
| --- | --- |
| [Normal CI 42966280455](https://github.com/Revty79/serrian-tide-website/actions/runs/42966280455) | PASS: full TypeScript and ESLint (one inherited warning), 2,942 feature tests, three raster tests, 15 integrity tests, and all 42 deployment unit cases with zero Ubuntu skips. |
| [Original recovery CI 42966280349](https://github.com/Revty79/serrian-tide-website/actions/runs/42966280349) | PASS: all 15 original real PG18/storage recovery groups and all 15 signature/transfer/permission/corruption tests. |
| [Ubuntu deployment CI 42966280523](https://github.com/Revty79/serrian-tide-website/actions/runs/42966280523) | Retained failure: bounded build, all 11 original deployment groups and all 13 original bootstrap groups pass. The second scenario refused before creating its source because the first scenario correctly retained its stopped container under the shared name. This does not establish legacy/TLS success. |

The first attempted canonical LF Git release-input fingerprint was `69afc6582b281e836a7220580e404fd8f0b4a4e808c80f49ef25173ad9cd2160`, across 3,354 files. The subsequent fixture corrections change the final release-input fingerprint; they do not change application or operator behavior. The owner host and its existing database remain untouched and uncertified by the agent.

The first hosted aggregate run stopped with `CI_SOURCE_NAME_OCCUPIED` before the additional legacy scenario could start. The existing bootstrap fixture retained its stopped source as `serriantide`; invoking it twice exposed that test-lifecycle collision. Only the owned CI fixture's finalization changes: after proving exact owned ID and stopped state, it renames that retained container to a unique fixture name. The container, image, data, diagnostics and all production bootstrap code remain preserved. The full workflow must rerun; earlier partial passes are not the final acceptance receipt.

Review before the rerun also found that the older email-only synthetic fixture stored a mixed-case `username`, whereas the unchanged Better Auth username plugin normalizes sign-in lookup to lowercase. The owned fixture now stores a lowercase username and retains its display name, matching ordinary account creation. The real proxy fixture uses username login before as well as after the transition, so a malformed synthetic account cannot survive to a late post-cutover assertion. No real account, app authentication behavior or normalization rule changes. The intermediate rerun is cancelled in favor of the complete corrected-fixture run; cancellation is not a PASS.

The intermediate source `7b74aa56c89d7688f91bff607b392c155034f564` had [deployment run 42968344696](https://github.com/Revty79/serrian-tide-website/actions/runs/42968344696), normal run42968344802 and recovery run42968344688 cancelled deliberately for the normalized fixture correction. These are retained incomplete attempts.

## Corrected complete verification (in progress)

Corrected source: `47c01dc50363cc5c6f4027d86f7875492bab307f`; canonical LF release fingerprint `6dd065445564be6f63a5fe9458b59cd227cd4d0a7adde54fa170f0d502210471`, 3,354 files. The unchanged application/operator source is accompanied by the corrected independent CI fixture lifecycle and normalized synthetic username.

| Evidence | Result |
| --- | --- |
| [Normal CI 42968506328](https://github.com/Revty79/serrian-tide-website/actions/runs/42968506328) | PASS: full TypeScript/ESLint, 2,942 feature tests, three raster tests, 15 integrity tests and all 42 deployment unit cases, zero Ubuntu skips. |
| [Recovery CI 42968506312](https://github.com/Revty79/serrian-tide-website/actions/runs/42968506312) | PASS: all 15 original PG18/storage recovery groups and 15 integrity tests. |
| [Ubuntu CI 42968506528](https://github.com/Revty79/serrian-tide-website/actions/runs/42968506528) | Retained failure: build, original deployment and original 13 bootstrap groups pass. The second fixture stopped before source creation with a lingering-TCP port-probe failure; legacy/TLS coverage is still incomplete. |

Run42968506528 resolved the retained-container name collision and again passed the original deployment and bootstrap. Its second fixture then reproduced `OSError: [Errno 98] Address already in use` in the old plain-bind availability probe after the prior owned listener was stopped. The fixture now uses the same address-reuse behavior as a TCP server and actually binds/listens before releasing its probe. An active listener still refuses. A Linux-only regression creates a real connection, proves active-listener refusal, reproduces the old probe's TIME_WAIT failure after shutdown, and proves successful new-listener availability. No production operator, port requirement, readiness timeout, rollback witness or permission changes. The new legacy scenario now runs before the original bootstrap so it is tested earlier; all original scenarios remain required. Final counts include 26 Python cases (43 deployment units total); Windows skips the Linux TCP and POSIX directory-fsync cases, while Ubuntu must pass all cases.

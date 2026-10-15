# Geo D1-B thumbnail performance correction — 2026-10-14

Starting commit: `27318be409b599114f457a3ce587fbe3a8c81061`. The exact correction commit is supplied in the handoff. One focused local correction; no push, Production access, deployment, shared-service restart, database import, migration, asset provisioning, Docker change or later phase.

## Root cause and correction

`VisibleThumbnail` placed its 30-second/focus retry counter in both its source identity and the geographic child's React key. Every refresh replaced the child, discarded its raster state and restarted the initial 21-request load. The baseline production build reproduced this twice during a real 70-second idle observation.

Refresh counters now trigger reauthorization independently of mounted viewing identity. Unchanged authorized artwork retains its object and scene; artwork revisions redraw without remounting geographic resources. A changed reader/context discards previous content, and failed artwork authorization removes the whole preview rather than retaining old pixels.

Geographic refresh uses private `preview=1&check=1` metadata. It executes the same World/timeline/Realm/layer access and source-eligibility SQL as the full viewport, then hashes eligible current source identities/names. It reads no source geometry or `world_geo_part`, builds no paths, projects no worldwide geometry and returns no feature collection. Changed eligibility clears old paths before the bounded vector reload. Surface/frame changes and access denial invalidate affected content. No cross-user/context result cache exists.

Raster refresh continues through the existing private metadata services. A complete preview can retain its pixels only after a fresh authorized response identifies the same reader, immutable source/version, grid, coarse level, tile plan and style. The newly authorized metadata replaces the old metadata, including visibility/opacity and access stamp. Missing/archived/denied sources remove imagery. Manual retry reloads incomplete content and checks healthy sources without downloading their unchanged tiles. Normal editor/explorer refresh, persistence, save boundaries and export code remain unchanged.

Lazy loading, the 240-pixel margin, offscreen unmount, request cancellation, two-job scheduling and incomplete-preview reporting/retry remain in place.

## Measured before and after

Real production Chrome sessions used the same retained Earth and private assets, Node 22 and owned loopback PostgreSQL. The baseline and corrected build fingerprints, response-body bytes, timings and acceptance results are retained in [the evidence receipt](worlds-geo-d1b-performance-correction-acceptance.json).

| Observation | Starting build | Corrected build |
| --- | ---: | ---: |
| Initial Earth preview | 21 requests / 148,814 bytes | 21 requests / 149,018 bytes |
| Subsequent idle observation | 70.081 seconds | 70.145 seconds |
| Idle requests / decoded body bytes | 42 / 297,628 | 8 / 20,338 |
| Idle complete vector responses | 2 / 112,790 bytes | 0 / 0 bytes |
| Idle raster tiles | 34 / 165,620 bytes | 0 / 0 bytes |
| Geographic scene node retained | No | Yes |

Idle transfer fell **93.2%**. The remaining two refresh cycles each fetch one artwork authorization response, one 407-byte geographic status and two raster metadata responses. Initial payload increases by 204 bytes for explicit authenticated-reader identities. These are decoded response bodies, excluding headers, transport compression and application scripts.

Focus refresh used four requests / 10,169 bytes with zero vectors/tiles. A changed artwork revision used four / 10,170 with zero vectors/tiles. Changed geographic eligibility fetched one replacement vector response and no tiles. Classification revocation removed its image while retaining relief; recovery fetched only its fifteen classification tiles. A failed classification preview retried those fifteen tiles without reloading vectors or healthy relief.

Seven visible local-map previews remained open for another 35.009 seconds: ten requests / 12,087 bytes, with zero vectors/tiles. Seven were artwork reauthorization; three were small no-attached-geography checks. The existing queue regression also verifies the two-job maximum, cancellation and failure draining.

Twenty direct Earth status-service samples ranged **35.7–46.5 ms**, median **38.2 ms**. The largest observed idle status HTTP response duration was 349.1 ms, including the concurrent application/authentication workload. These local measurements are not hosting latency guarantees. Eligibility checks still scan eligible source headers, and artwork reauthorization still uses the established Atlas service; idle work is reduced, not eliminated. Every visible geographic preview intentionally retains four authorization/metadata requests per 30-second cycle. Offscreen previews stop this work.

## Executed validation

| Check | Result |
| --- | --- |
| Node v22.23.3 isolated production build | Pass; fingerprint checked before browser execution |
| TypeScript | Pass |
| Full ESLint and final affected-script lint | Zero errors; one existing unused `LoreFamily` warning in unchanged `worlds-stories-checks.ts` |
| Feature unit regressions | 2,174/2,174 pass across 262 files, including four new retention/invalidation cases |
| Service/privacy/migration checks | 8/8 pass, including matching full-view/status eligibility for owner, ordinary and Admin plus denied users |
| Focused preview browser checks | 9/9 pass, zero page errors, including the actual 70-second idle period |
| Established D1-B browser regressions | 12/12 pass, zero page errors; historical/unknown years, both ordinary aliases, protected imagery, Admin/anonymous access, Glass Sea, local editors, native-touch phone, keyboard, failure/retry and both PNG actions |
| Actual PNG compatibility | All six regenerated test downloads exactly match the prior committed PNG SHA-256 values, including worldwide, regional Mercator, authored-only, historical/unknown and Glass Sea |
| Fresh/existing migration rehearsal | Pass through 132 entries ending at 0131; no new migration |
| Preservation | All 118 World tables and migration ledger exactly match the retained baseline; all 16 raster versions and six frozen bundles verify |
| Whitespace | `git diff --check` passes |

Revision, source-change, revocation and failed-resource browser transitions use controlled HTTP response injection after real authorized reads. Real persisted protected-source ordinary filtering and role denial are also checked through the services and established browser suite. No World/source/history fixture is rewritten; only disposable authentication sessions are added. The owned test application and PostgreSQL cluster are stopped at completion. Physical-device acceptance is not claimed; the phone regression uses native touch in a mobile Chrome context.

Changed runtime paths: `atlas-thumbnail.tsx`, `geographic-thumbnail.tsx`, new `thumbnail-refresh.ts`, the two raster hooks, geographic service/status route, Atlas/state preview routes, the two raster services, their response parser and optional preview-reader DTO fields. Validation adds `thumbnail-refresh.test.ts` and `worlds-geo-d1b-preview-browser.ts`; it extends the existing D1-B services and allows existing browser evidence to remain in ignored correction artifacts. AGENTS and the D1-B architecture record the focused boundary. The evidence receipt lists every changed file. Original screenshots/PNG examples remain unchanged.

## Deployment and recovery

No configuration, dependencies, SQL, original C1–C3 assets, source identities, coordinates/registration, Glass Sea data, Living History records, migration history or save semantics change. There are zero additional provisioned asset bytes. The owned clone's full row comparison is exact; shared DEV and Production were never contacted.

Reproduce using the established owned environment without running setup/restore again. Measure the starting production build with `scripts/worlds-geo-d1b-preview-browser.ts --baseline`; build the candidate with `scripts/worlds-geo-d1a-harness.ts build`; run `scripts/worlds-geo-d1b-checks.ts`, the focused preview browser, the established D1-B browser with `SERRIAN_TEST_D1B_EVIDENCE` pointing inside ignored artifacts, then `scripts/worlds-geo-d1b-checks.ts --after`. Use Node 22 with `--conditions=react-server --import tsx` for these TypeScript scripts. Feature tests use `scripts/run-feature-tests.mjs`.

After independent review and separate push/deployment authorization, require Linux Node 22 CI, stage the reviewed build using the existing private asset configuration, retain the paired backups/current release and follow the [deployment standard](../operations/pass-deployment-standard.md). No correction SQL needs applying. Reverting this correction is stored-format compatible and restores the previous thumbnail refresh behavior without a database restore; code rollback does not undo user edits or migrations.

Independent technical approval, owner acceptance, authorized remote CI and deployment remain pending. Local build warnings remain the existing isolated-checkout lockfile inference and unchanged `raster-storage.ts` dynamic-filesystem tracing warning. Linux CI has not run for this local correction.

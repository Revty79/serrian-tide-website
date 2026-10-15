# Geo D1-B deployment-readiness report — 2026-10-14

Starting approval: `2683a72d3c41d4c6fce0515d307f6a844536cfe1`. The exact local review commit is supplied in the handoff. This increment is complete for independent technical inspection and owner visual acceptance. No push, Production contact, deployment, database import, Docker modification, shared-service restart or later phase occurred.

## Delivered behavior

Previously, Atlas library thumbnails and PNG downloads contained authored cartography only. Geographic thumbnails now show a representative rectangular Earth background with authorized C1 vectors, existing coarse C2 relief, C3 classifications and registered artwork. Loading remains lazy with the existing 240-pixel margin; offscreen work unmounts, a two-job queue limits concurrent work, and no preview results are cached across viewing contexts. Failures retain an honest unavailable/incomplete preview with retry.

**Download visible map PNG** includes the current extent, projection, visible vectors/labels, available relief/classifications and artwork. It includes geographic provider/license credits and ESA credit/observation period when classifications are present. **Export authored PNG** remains separate. Both create derivative files without saving, flattening source records, changing the viewport or clearing either draft. Failed/loading resources block complete export and expose retry. Export feedback occupies reserved space beside the controls.

Map artwork, selected historical appearances, geographic eligibility and included immutable raster versions are reauthorized before the download. Changed access, artwork, viewing context, draft or unmounted editor cancels it. Owner-to-ordinary thumbnail transitions discard old pixels. Existing ordinary aliases, current-head protection, explicit read-only Administrator review, Realm context and private authenticated tile routes remain authoritative. No public image endpoint or publishing system was added.

Selected historical years use their actual authorized artwork and suppress modern references. Unknown coverage is explicitly identified as a shared-baseline artwork reference. Glass Sea and settlement/interior/dungeon paths remain available. Save-state separation, independent raster preference saves and navigation guards remain intact.

## Changed files

- Preview flow: `atlas-thumbnail.tsx`, new `geographic-thumbnail.tsx`, `atlas-preview.ts`, `thumbnail-load.ts`, `raster-preview.ts`, and updates to `atlas-workspace.tsx` and `atlas.module.css`.
- Existing private GET routes: Atlas, historical map states, geography, elevation and land cover. Preview responses are trimmed after the existing authorization services execute. Existing raster/geographic services add bounded preview modes; `geographic-display.ts` accepts a smaller display budget without changing its normal defaults.
- Export flow: `atlas-map-editor.tsx`, `historical-map-workspace.tsx`, `cartography-export.ts`, new `atlas-geographic-export.ts` and `map-export-layout.ts`. Existing elevation/land-cover hooks expose readiness and support small preview canvases.
- Validation: four new regression files with seven tests and `scripts/worlds-geo-d1b-{checks,browser}.ts`.
- Handoff: AGENTS authorization, architecture/decision links, this report, [machine-readable evidence](worlds-geo-d1b-acceptance.json), seven genuine application screenshots and six actual PNG downloads. The evidence lists every changed path and image checksum.

No dependency, lockfile, Next configuration, schema, migration, data manifest, provisioned raster asset, geographic source record or coordinate registration changed. Original `atlas-geographic-frame.ts` and source renderer are reused unchanged.

## Executed checks

| Check | Result |
| --- | --- |
| Node 22 production build | Pass; isolated checkout, runtime fingerprint checked before browser execution |
| TypeScript | Pass |
| Full ESLint | Zero errors; one existing unused `LoreFamily` warning in unchanged `scripts/worlds-stories-checks.ts` |
| Feature unit regressions | 2,170/2,170 pass across 261 files, no skips |
| Portable raster provisioning | 2 pass; 1 POSIX-only permission assertion skipped on Windows |
| D1-B service/authorization/migration checks | 7/7 pass |
| Production-browser acceptance | 12/12 groups pass, zero page errors |
| Migrations | Fresh empty database and existing-data no-op upgrade pass through 132 entries, ending at 0131; zero new migrations |
| Preservation | All 118 World tables exactly match their pre-pass row counts/digests; ledger exact; 16 raster versions and all six frozen bundles verify |
| Whitespace | `git diff --check` passes |

The browser journey covers lazy bounded previews, global/regional exports, authored-only export, hidden classifications, preference draft protection, failed tiles/retry, fresh geographic/raster denial, context switching during composition, historical/unknown years, both ordinary aliases, protected-raster thumbnail redaction, read-only Admin, anonymous denial, Glass Sea, settlement/interior/dungeon entry, native-touch phone download and keyboard Enter download. It asserts that export leaves the page scroll and map extent unchanged. Browser operations perform no World-table writes; only disposable authentication sessions are added.

Runtime: Node v22.23.3, Windows, PostgreSQL 18.0 and headless Chrome against the production server. Phone checks use a 390 × 844 mobile context with native touch enabled. Physical-device and human visual acceptance are not claimed. Linux Node 22 CI has not run for this local-only checkpoint; the POSIX storage guard and negative assertion remain unchanged.

The successful isolated build retains the existing multiple-lockfile root-inference notice and dynamic-filesystem tracing warning in unchanged `raster-storage.ts`. Its generated TypeScript include additions occur only in the disposable build checkout; repository configuration is unchanged.

Validation resumes the retained, positively identified owned D1-A loopback cluster without restoring or importing a database. With that owned cluster available, run Node 22 with `--conditions=react-server --import tsx`: `scripts/worlds-geo-d1b-checks.ts`, `scripts/worlds-geo-d1a-harness.ts build`, `scripts/worlds-geo-d1b-browser.ts`, then `scripts/worlds-geo-d1b-checks.ts --after`. Do not run the mutating D1-A browser fixture between the D1-B before/after comparisons. Existing private asset bundles are borrowed read-only. The owned browser server and cluster are stopped after validation; shared services are untouched.

## Review images

| Application evidence | Actual PNG download |
| --- | --- |
| [Earth library](../screenshots/worlds-geo-d1b/earth-library-desktop.png) / [editor](../screenshots/worlds-geo-d1b/earth-editor-desktop.png) | [Worldwide combined](../exports/worlds-geo-d1b/earth-worldwide.png) / [authored only](../exports/worlds-geo-d1b/earth-authored.png) |
| [Regional Mercator editor](../screenshots/worlds-geo-d1b/earth-regional-desktop.png) | [Focused regional Mercator](../exports/worlds-geo-d1b/earth-regional-mercator.png) |
| [Year 1900 library](../screenshots/worlds-geo-d1b/historical-library-1900.png) | [Actual 1900 artwork](../exports/worlds-geo-d1b/earth-history-1900.png) |
| [Unknown 1901 library](../screenshots/worlds-geo-d1b/historical-library-1901.png) | [Explicit unknown-coverage reference](../exports/worlds-geo-d1b/earth-history-1901.png) |
| [Glass Sea editor](../screenshots/worlds-geo-d1b/glass-sea-editor.png) | [Glass Sea](../exports/worlds-geo-d1b/glass-sea.png) |
| [Phone export controls and success](../screenshots/worlds-geo-d1b/earth-phone.png) | Native-touch download exercised with the complete geographic image |

## Measurements and limits

The initial Earth thumbnail made 21 requests: four metadata responses and 17 existing coarse tiles (two elevation, fifteen classification). Chrome measured **148,814 response-body bytes (145.3 KiB)**: 1,543 artwork, 56,395 vector, 42,202 elevation including tiles and 48,674 classification including tiles. These are decoded response bodies, excluding scripts, HTTP headers, transport compression and later authorization refreshes. Preview geometry has at most 96 parts, 64,000 total path characters and 8,000 per part. Each raster uses only its coarsest existing level, at most 16 tiles, and a 320 × 192 composition. Two raster jobs can each issue four tile requests, so the queue does not imply only two simultaneous network requests.

| Actual download | Dimensions | PNG bytes | Serialized SVG bytes |
| --- | --- | ---: | ---: |
| Worldwide combined | 2000 × 1596 | 2,383,556 | 3,676,127 |
| Regional Mercator | 2000 × 1596 | 252,330 | 103,593 |
| Authored only | 2000 × 1284 | 108,767 | 19,484 |
| Historical 1900 | 2000 × 1284 | 101,128 | 16,515 |
| Unknown 1901 | 2000 × 1284 | 116,771 | 19,943 |
| Glass Sea | 2000 × 1362 | 123,146 | 18,600 |

The worldwide output canvas requires **12,768,000 raw RGBA bytes**, and the decoded 2000 × 1200 SVG image requires another **9,600,000 bytes**. Existing current-view C2/C3 images add 4,800,000 raw bytes when both are present. Export permits at most a 12,000,000-byte SVG and 24 credit lines: maximum output height 1856, or 14,848,000 output pixel bytes. SVG strings, cloned DOM, embedded-image copies, PNG encoding and browser graphics overhead consume additional memory. These explicit allocations are memory requirements, not a measured total/peak browser-memory guarantee. Export releases its canvas, image and Blob URLs.

Review artifacts total 5,982,184 bytes: 2,896,486 screenshot bytes and 3,085,698 PNG example bytes. Additional provisioned raster bytes: **0**. Original worldwide assets were not regenerated. The image uses the currently provisioned source resolution; zoom and a 2000-pixel export do not create finer geographic evidence. Coarse thumbnails deliberately omit labels and smaller parts. Oversize composition/credit lists fail with a clear smaller-view instruction; they never silently drop required credit. Native 10-metre regional acquisition, new source editing, advanced projections, dated room/layout authoring and later scale improvements retain their separately approved future boundaries.

## Deployment compatibility and recovery

No new migration, persistent configuration, private asset provisioning or service dependency is required. Migrations 0130/0131 remain immutable. All C1–C3 data/identities, DEV identities, stored coordinates/registration, Glass Sea, Living History, original artwork, privacy rules, backup protections and source manifests are retained. The retained clone's complete before/after comparison is exact; shared DEV and Production were never contacted.

After independent review and separate owner authorization, push the exact review commit and require Linux Node 22 CI. Follow the existing [deployment standard](../operations/pass-deployment-standard.md) and [paired raster recovery runbook](../operations/worlds-raster-deployment.md): verify the target and ledger, retain a verified paired database/private-asset backup and current release, stage the production build with the existing private `SERRIAN_RASTER_ROOT`, and smoke-test owner/ordinary/Admin, Earth/history/fictional maps and failure/retry before controlled activation. This increment has no D1-B SQL to apply.

Application rollback to the approved starting commit restores the prior authored-only preview/export behavior with compatible stored formats. No database restore is required merely to revert this presentation increment. Retain source assets and owner edits; a code rollback does not reverse migration history or user changes. Independent technical review, owner visual acceptance, authorized remote CI and deployment remain pending. No later development phase is required for these preview/export actions to function.

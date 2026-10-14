# Geo D1-A deployment-readiness report — 2026-10-14

Starting approval: `fcf911d24641436424c7acf766baba7cebe5b10c`. The exact local review commit is supplied in the handoff. Independent Ember review and owner visual acceptance remain pending. No push, Production contact, deployment, shared-service restart or D1-B implementation occurred.

## Delivered behavior

Normal generic Atlas editing and exploration compose imported geographic vectors, C2 elevation/bathymetry, C3 dated classifications and original editable artwork. Worldwide Earth opens as a visually verified flat rectangle; Mercator remains selectable. Independent source/artwork visibility, source search/read/focus, progressively selected existing detail, desktop/keyboard pan/zoom and native touch drag/pinch work. This reuses existing services/projectors and a shared geographic scene; imported records are never bulk-copied into Atlas polygons.

Stored positions, identities, revisions, original source precision and old formats remain intact. The reversible full-surface registration and planar x/y compatibility are documented in [the architecture](../architecture/worlds-geo-d1a.md). Artifact display drafts never enter saving/undo history. Offscreen geography labels stay out of regional views; decorative text remains readable at deep zoom.

Historical selections retain their authored source and timeline with modern reference imagery hidden, including unknown coverage. Original source workshops, generators, Realm links, settlements, floors, dungeons, ordinary previews and explicit read-only Administrator review remain available. Reader and raster failures clear affected data safely. Current protection changes revalidate open readers; visible error/retry feedback and raster attribution stay outside folded controls. Automatic source/workshop scrolling is removed; explicit place navigation remains.

## Changed files

- Editor/explorer/lifecycle: `atlas-map-editor.tsx`, `atlas-explorer.tsx`, `atlas-workspace.tsx`, `historical-map-workspace.tsx`.
- Shared rendering/coordinates: new `atlas-geographic-frame.ts`, `atlas-geographic-workspace.tsx`, `atlas-geographic-gestures.ts`, `geographic-scene.tsx`, `geographic-credits.tsx`; updates to `cartography-scene.tsx`, `cartography-controls.tsx`, `geographic-workspace.tsx`, `elevation-workspace.tsx`, `land-cover-workspace.tsx` and the Atlas/geographic CSS modules.
- Validation: new six-case frame regression file and `scripts/worlds-geo-d1a-{harness,checks,browser}.ts`.
- Handoff: architecture, Map Maker decision link, AGENTS authorization, this report, machine-readable evidence and seven application screenshots. The [acceptance receipt](worlds-geo-d1a-acceptance.json) lists every modified path and screenshot checksum.

Geographic/raster/Atlas/history persistence services, source projector, dependency lockfile, original data manifests and every migration remain unchanged.

## Executed checks

| Check | Result |
| --- | --- |
| Node 22 production build | Pass in an isolated checkout; exact runtime fingerprint checked before browser execution |
| TypeScript | Pass |
| ESLint | Pass; one pre-existing unused `LoreFamily` warning in an unchanged script |
| Feature regressions | 2,163/2,163 pass across 257 files, including six coordinate/precision/polar/planar cases |
| Portable raster provisioning | 2 pass, 1 POSIX-only skip on Windows; enforcement/test fixture unchanged |
| Existing Living History services | 18/18 pass |
| Existing geography/privacy services | 12/12 pass |
| Actual production-browser journey | 14/14 groups pass, zero page errors; includes editing, save/reload, undo/redo, alignment, offscreen labels, both ordinary aliases, read-only Admin, private raster/cache redaction, live reader protection/recovery, missing-tile feedback/retry, historical suppression and all local map scales |
| Migrations | Fresh install and existing-data upgrade pass through all 132 ledger entries (0131); zero new migrations |
| Preservation | Every original clone row retained except the explicitly edited disposable Earth map/World rows; all original geographic/raster table rows and associations exact |
| Whitespace | `git diff --check` passes |

The local-map test initially used an unsupported interior `editMap` URL. It now follows the established Explorer → Edit map path; the complete corrected suite passes. The failure-state check also caught folded alerts, and visual QA caught an offscreen label; both repairs are included and checked in the final candidate.

Local runtime: v22.23.3, Windows, PostgreSQL 18.0, headless Chrome. Phone checks use a 390 × 844 mobile browser with native CDP touch/pointer dispatch, rather than synthetic pointer-only events. Physical-device and human visual acceptance are not claimed. Linux CI was not run for this local-only pass.

Reproduction in this workspace uses Node 22 with `--conditions=react-server --import tsx`: run `scripts/worlds-geo-d1a-harness.ts setup`, `scripts/worlds-geo-d1a-checks.ts`, `scripts/worlds-geo-d1a-harness.ts build`, `scripts/worlds-geo-d1a-browser.ts`, then `scripts/worlds-geo-d1a-checks.ts --preservation`. The guarded harness requires the retained verified repair backup/private assets and uses only its owned loopback cluster. Source assets are borrowed read-only; sessions/artwork/test Worlds exist only in the disposable database. It never loads `.env.local` or contacts shared DEV/Production.

## Screenshots

- [earth-editor-desktop.png](../screenshots/worlds-geo-d1a/earth-editor-desktop.png)
- [earth-editor-phone.png](../screenshots/worlds-geo-d1a/earth-editor-phone.png)
- [earth-mercator-desktop.png](../screenshots/worlds-geo-d1a/earth-mercator-desktop.png)
- [earth-regional-desktop.png](../screenshots/worlds-geo-d1a/earth-regional-desktop.png)
- [earth-worldwide-phone.png](../screenshots/worlds-geo-d1a/earth-worldwide-phone.png)
- [glass-sea-editor-desktop.png](../screenshots/worlds-geo-d1a/glass-sea-editor-desktop.png)
- [historical-editor-desktop.png](../screenshots/worlds-geo-d1a/historical-editor-desktop.png)

## Measurements and limits

- Observed bounded geographic page maximum: 62,687 bytes (61.2 KiB). Requests retain the existing 64-component/500,000-path-character page limits; exact source reading stays separate. The global overview displayed 2,661 components.
- Final-page Chrome encoded script resources: 536,999 bytes; cache-dependent Resource Timing, not a cold-download or bundle-size guarantee. Post-journey JS heap: 32.5 MiB; not peak memory.
- The small reusable geography fixture's 20 query/render samples ranged 10.1–28.6 ms (median 12.6 ms). These are fixture measurements, not worldwide query latency.
- Additional durable raster bytes: 0. No worldwide raster regeneration or native 10-metre WorldCover download. C2 and the approximately 594-metre C3 overview retain their existing originals. Seven review screenshots total 2.9 MiB.
- Hosting continues to use bounded PostgreSQL/source requests and CPU-rendered existing assets. No new dependencies, server GPU, storage format or subscription/accounting system is required.
- Existing Atlas authoring precision remains 0.01 canvas unit. A saved annotation may differ from a full-precision source by that existing quantization; tests check the source and saved artwork against their own exact projected anchors. The whole-surface registration is explicit; no automatic artwork fitting or inferred per-map regional calibration is added.
- PNG export retains the established authored Atlas artwork format; combined geographic-reference export is not added. Geographic mode labels the action Export authored PNG. Regional source acquisition, high-precision geographic vector authoring and advanced projections remain later authorized work.

## Migration, deployment and recovery

No new migration or persistent configuration is required. Existing ordered migrations through 0130/0131 are immutable and were rehearsed in fresh and restored disposable databases. The retained repair backup SHA-256 was verified before restoration; originals and all six private bundle identities verified without provisioning changes. Shared DEV was never contacted or changed.

After independent review and separate owner authorization: push the exact review commit, require Linux Node 22 CI, and stage its production build using the existing private `SERRIAN_RASTER_ROOT` and [raster runbook](../operations/worlds-raster-deployment.md). Verify the target ledger and paired database/private-asset backup before any controlled activation. This increment has no D1 SQL to apply. Smoke-test owner/ordinary/Admin, Earth/fictional/history and resource failure/recovery before authorizing the shared-service activation.

Rollback to the preceding application release is format-compatible: new edits use existing Atlas/history/raster-preference formats. Retain owner edits and source assets; no database restore is needed merely to revert this presentation increment. Code rollback does not reverse migrations or owner-authored data. Use the established guarded recovery process only if an actual data recovery is necessary.

The checkpoint is ready for independent technical inspection and owner visual review. Human acceptance, authorized remote CI and controlled deployment remain separate gates; no later development increment is needed for the implemented foundation to function.

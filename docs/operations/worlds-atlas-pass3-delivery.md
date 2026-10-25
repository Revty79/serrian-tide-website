# Atlas Pass 3 delivery and migration

Implementation: **6869225c1a8136043bb952794f1d9d729330f755**, with numerical foundation 7003ad57b6b2572d110fa307d1f9824e4a7f5fce. Both descend from published Heavens-retirement commit 9ec36e2ed78b518dd67ce6f9cf628cddf9039cb3. Final publication includes the evidence/receipt commit following this implementation.

This delivers the supplied Pass 3 increment of the original Stage 2 roadmap. It does not complete Stage 2 or the entire World Mapmaker. Owner hands-on usability and artistic acceptance remain pending.

## Delivered

- Four starting options in the established full creator workshop: blank ocean, blank land, procedural geography and numerical heightmap import. The large preview uses the actual terrain renderer with pan, zoom and elevation inspection. Preview/Regenerate/Cancel produce no permanent map or accepted revision; acceptance saves numerical tiles through the existing guarded API.
- Six versioned deterministic presets: Single Continent, Multiple Continents, Archipelago, Large Island, Land-Dominant World and Randomized World. Seed and parameters control land fraction, major masses, mountains, ruggedness, coasts, elevation variation and island size/spacing/distribution. Warped coherent land fields, gradient noise and mountain ridges produce actual signed numerical heights. Periodic horizontal fields support wrapping; north/south stay fixed. No geological simulation or Earth dataset is claimed.
- Genuine non-interlaced grayscale 16-bit and 8-bit PNG decoding, including all five PNG filters and chunk checksums. No image/Canvas conversion reduces source samples to eight bits. Interpretation explicitly records height mapping, nearest/bilinear resampling, full-source fitting or centred crop, NoData handling, source digest/dimensions/depth/transparency and missing-sample counts. Accepted numerical data is independent of the original PNG file.
- Cancellable browser-worker processing. Grid and physical extents retain the existing independent settings and limits. Ordinary painting remains incremental and never runs the generator.
- Explicit rectangular regeneration preview and acceptance. Outside samples remain exact; manual heights are protected by default, with deliberate optional replacement inside the rectangle. Interior feathering never alters outside heights. Acceptance is one undoable operation. Immutable previous revisions remain retained.
- Exact acceptance-request recovery in IndexedDB; lost responses reuse the original request. A recovered regeneration followed by a newer edit reloads the current head rather than presenting the old receipt as the new head. Optimistic saves reject stale edits.
- Reopened maps show their retained origin and accepted recipe. Opening never reruns a recipe. Generated, imported and blank terrain all use the same existing sculpting, autosave, undo/redo, browser recovery, private storage and renderer.

## Migration and DEV status

**NEW MIGRATION: 0136_world_terrain_sources.sql. APPLIED TO DEV. PRODUCTION UNTOUCHED.**

The additive migration adds source metadata to world_terrain_version and a per-sample manual-protection mask to world_terrain_tile. Unknown historical provenance is explicit legacy data; previously painted tiles are conservatively protected in full. No Town/Shop/Campaign schema changes are introduced.

Migration SHA-256: 4ef0c01a4c1484fec257bd1c1ad53fe5f173e483022157c02245b685c201867f. Verified DEV target: loopback port 5432, serrian_tide_dev; ledger now contains 137 entries through 0136. Historical migration bytes and prior ledger entries are unchanged. The established 0132 Windows line-ending-only ledger difference remains documented, not rewritten.

The fresh private database backup restored exactly into an owned PostgreSQL target. Its upgraded old-column rows matched all **337 pre-existing tables**. The paired private terrain backup matched **450 files**. Live DEV was rechecked before and after application. The first preflight stopped before writes over historical checkout line endings; exact owner-checkout bytes were restored before the successful run.

Backup: artifacts/worlds-atlas-pass3/dev-backups/2026-10-25T05-49-39-875Z/before-0136.dump, accompanied by the terrain directory and verification manifest. Database backup SHA-256: 2a7457ce6d98ab10fc201262eda742ae88878715ced4eda42b5c3286f6bfac0c. Backups remain private ignored artifacts, not Git assets.

An additional actual DEV HTTP/browser journey exercised numerical generation/import, real sculpting, own-app restarts, exact retries and selected-area protection. Existing Worlds and 91 legacy Town/Shop/Campaign tables remained unchanged. Engineering World cf0ce951-f676-45a8-8a04-e3e411d44ad0 is archived; its accepted fixture terrain is retained. The temporary session was removed. The owner's app process was not restarted.

Receipts: [DEV migration](../screenshots/worlds-atlas-pass3/dev-0136-migration-results.json), [DEV browser](../screenshots/worlds-atlas-pass3/dev/dev-browser-results.json), [populated upgrade](../screenshots/worlds-atlas-pass3/upgrade-results.json).

## Validation and preservation

- **2,287 feature tests pass across 286 files**, including nine numerical generation/PNG cases and the unchanged Campaign/Tabletop/commerce coverage. Full root TypeScript passes. Full lint reports zero errors and one pre-existing unused-import warning in worlds-stories-checks.ts; changed-file lint passes without warnings. Drizzle snapshot/journal check passes.
- Fresh owned PostgreSQL replay covers all 137 migrations. A populated 0135-to-0136 fixture includes an actual old painted private tile: original values, identities and old rows remain exact; its legacy protection blocks automatic replacement.
- Database tests cover numerical creation/reopen/provenance, complete tiles, exact retries, immutable revisions, bounds, protected manual samples, rejected proposals leaving the head unchanged, stale requests and owner/privacy guards.
- Isolated production builds pass. Complete desktop/touch browser regression covers blank ocean/land, Town/Shop/Individual workshops, related drafts/saves, baseline merchandise/prices/stock/staff, Heavens retirement and preserved Tabletop entry routes, autosave, recovery, concurrent edits, markers, all other creator families, World lifecycle, historical relationships and role/CSRF/privacy checks.
- Pass 3 browser journeys cover all six presets, temporary cancellation, worker cancellation, changed-preview invalidation, largest-grid acceptance/reopen, generated and imported sculpt/restart, selected-area outside equality, manual protection, undo/redo, malformed PNG, lost acceptance across reload, and a lost regeneration response followed by a newer concurrent edit. Desktop 1440px, tablet 820px and touch-emulated phone 390px are checked. Physical-phone testing is not claimed.
- Personally inspected the six actual preset previews, import, selected-area and phone/tablet screenshots. Refined the generator after the initial inspection exposed rectangular ridge artifacts.
- Existing original builders, Town/Shop data/services, Tabletop and Campaign implementation remain preserved. Of 539 protected existing files, 537 are unchanged; only the authorized terrain schema and migration journal change. New 0136 files are additive. See [source preservation](../screenshots/worlds-atlas-pass3/preserved-source.json).

Evidence: [build/browser/security](../screenshots/worlds-atlas-pass3/results.json), [Pass 3 journeys and timings](../screenshots/worlds-atlas-pass3/pass3-results.json), [feature validation](../screenshots/worlds-atlas-pass3/validation-results.json).

## Performance and practical limits

The existing maximum remains **1024 by 1024** numerical samples. A 1024-square preview took approximately 5.0 seconds in the recorded full browser journey, including worker processing and rendering. The deliberately lost acceptance/reload/retry journey took about 9.1 seconds. Actual DEV measured about 5.5 and 9.1 seconds respectively. These are observations on this Windows test machine, not cross-device guarantees. The highest grid is accepted, reopened, painted, regenerated and imported through the actual HTTP/private-file path.

A separate maximum-source decode retained all 4,194,304 16-bit samples; fixture encoding plus decoding measured about 227 ms. Source limits: 16 MiB compressed, 4096 per axis, 4,194,304 pixels and 16,384 chunks. Output limits and the existing 8,000,000-byte HTTP body bound remain unchanged.

PNG subset limitations are explicit: no GeoTIFF, RGB/palette/alpha, animated or interlaced PNG, or geographic reprojection. Raw source values ignore photographic gamma. The saved format remains signed integer metres: at most 0.5 m rounding error, with only 256 original levels for an 8-bit input. Resampling cannot invent missing source precision. Unsupported, corrupt, excessive and out-of-range inputs fail visibly; heights are never silently clamped.

The complete Pass 3 journey also passes in headless Chrome with GPU acceleration disabled. That run measured a largest-grid preview of 5,017 ms; import preview of 292 ms; and nine real high-resolution brush batches averaging 0.61 ms, maximum 1.50 ms. Acceptance with forced response loss/recovery measured 8,693 ms. These measurements include the actual renderer, HTTP acceptance and private storage, not just a pure generator benchmark.

## Owner review

1. Open Worlds, choose a World, then Atlas -> Create flat world.
2. Choose Procedurally generated geography. Set preset, seed and World size/edges; Prepare preview. Pan, zoom and inspect elevations; Regenerate preview or Cancel. Accept preview when satisfied.
3. Raise/lower/smooth terrain and let autosave finish. Reopen the map and inspect the retained origin/recipe.
4. Save current work, choose Regenerate selected area, then drag a deliberate rectangle. Keep manual protection enabled or explicitly permit replacement inside it. Prepare, inspect and accept; check Undo/Redo.
5. For import, choose Imported numerical heightmap, select a grayscale PNG and confirm height interpretation, proportions, resampling and missing samples. Inspect before acceptance, then sculpt and reopen normally.

Town Maps, interiors, dungeons, vehicles, standalone Studio integration and Earth reconstruction remain outside this pass. Existing town buildings/places continue through Worlds -> Towns.

## Controlled deployment and recovery

No server deployment, Production access or Production migration occurred. Before any future deployment, independently identify that target, inspect its ledger, protect its database and private numerical root, then apply committed migrations in journal order through 0136 using the established migrator. Run only pending migrations; do not use schema push or edit historical SQL. Build the exact release and verify authenticated owner/Admin/unauthorized workflows before activating it.

No new environment variable is required. Preserve DATABASE_URL, existing auth configuration and SERRIAN_TERRAIN_ROOT or its existing storage/world-terrain default. Private files remain outside public serving and outside Git. Worker files are included in the normal production build; import needs a modern browser with Compression Streams support.

Code rollback leaves schema, ledger, numerical revisions and private objects intact. Old numerical readers remain format-compatible, while older writers use conservative legacy provenance/protection defaults. Keep newer writers while resolving uncertain requests. Prefer a reviewed forward correction. Any database restore must deliberately reconcile post-backup content with the paired private files; do not delete accepted rows, objects, columns or ledger entries as a shortcut.

Technical implementation and DEV acceptance pass. Final Git publication/parity is recorded in the delivery handoff; no Production activation is authorized.

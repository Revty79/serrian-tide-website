# Atlas Pass 7 delivery record

Status: final recovery-readiness correction and repeated production validation are in progress. Earlier unfiltered regression evidence is retained; this record does not yet declare the corrected runtime complete.

## Delivered behavior

Atlas retains one World/map identity and one physical viewport. Creators can explicitly preview and accept sparse, finer numerical coverage, select it as the editing source and use the existing sculpting, ridge, valley, selected-area and regeneration tools. Preview dialogs retain the original World coordinate frame. Numerical samples, independent optimistic revisions, immutable versions and derived numerical overview tiles persist in PostgreSQL and checksum-verified private terrain objects.

The expanded editor has a compact toolbar, independently scrolling settings and a collapsible inspector. Phone/tablet settings use a dismissible overlay. The same canvas, pose, measurements, active tool and source survive settings changes. Touch Controls is an explicit remembered preference; fingers begin with navigation, authoring requires deliberate arming, and disabling/re-enabling the preference requires fresh arming. Actual pen input remains independent.

Fine work uses the existing autosave, undo/redo, exact-request retry, conflict protection and scoped IndexedDB recovery. Source changes wait for an accepted save or deliberate recovery resolution. Parent samples supporting finer terrain and a four-sample inherited boundary collar are protected; unrelated parent edits remain available. World sea level stays shared. Adjacent and nested coverage use the same permanent physical frame; wrapped coverage can span the root seam. Existing Towns, Shops, places, buildings and map links retain their identities and full workshops.

## Technical evidence

Evidence is under [the Pass 7 screenshot and receipt directory](../screenshots/worlds-atlas-pass7/). The production-browser harness is `scripts/worlds-atlas-pass7-disposable.test.ts`; it creates its own loopback PostgreSQL cluster and validation copy and does not load `.env.local`.

- Fresh 139-entry migration replay, populated upgrade and paired backup restoration preserve 337 existing tables and 235 original private numerical objects. See `migration-rehearsal.json`.
- The million-km World journey creates a real 20 km / 1024-square refinement with 19.53125 m sample spacing, sculpts an approximately 1 km island, saves numerical samples, verifies the root is unchanged, zooms out/returns and restarts/reopens. See `integrated-browser-progress.json` and the `fine-island-*` images.
- Fine ridge/valley/area/regeneration, lost accepted responses, reload recovery, undo/redo, competing revisions and retained downloadable drafts are recorded in `pass7-tools-results.json` and `pass7-recovery-results.json`.
- Extreme typed distances of 1, 2, 10 and 100 m, a 2 m/100 px scale bar, a quarter-metre logical grid, units and resizing pass. Phone/tablet Chromium protocol tests exercise actual touch/pen event paths. These are emulated input surfaces, not physical-device certification. See `pass7-input-results.json`.
- With GPU acceleration disabled, 32 navigation cycles leave the base raster unchanged. The final core run used at most two viewport requests, a 6.5 ms maximum detail painting batch and approximately 0.6 MB additional retained heap after collection. Cache budgets are 2048 raw tiles and 2048 textures. Wrapped painting and a 2 km shortest-path ruler remain aligned through navigation. See `pass7-performance-results.json`. Timings describe this run, not a hardware guarantee.

The optimized production build, TypeScript and Drizzle metadata checks pass. All 2344 unit tests across 295 feature files pass, with no failures or skips. Full lint has zero errors and one pre-existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts`; the changed regression helpers also lint cleanly. The production device sweep verifies a 256-point path, 64-point area, snapping, pen endpoint edits, phone/tablet navigation/measurement, two-finger rollback, physical touch painting with exact undo, marker/business identity preservation and read-only Administrator measurement. The phone settings drawer has a definite bounded height so its body can scroll beneath the heading/tabs.

The earlier complete unfiltered production-browser chain passes, including retained Pass 2-6, full Town/Shop/Individual workshops, all thirteen information creator families, World lifecycle, History/calendars/timelines/Campaign associations, bookmark normalization, desktop/phone navigation and authorization/privacy/CSRF boundaries. No browser page errors or legacy map-only requests were recorded. The retained historical map records, Realm map versions and 133 Campaign/runtime tables remain unchanged. See `results.json`, `pass2-results.json` through `pass6-results.json`, `pass6-devices.json` and `pass6-desktop-performance.json`.

Validation uses a matching isolated production application. The production build was repeated after both the phone drawer and recovery-readiness corrections. The corrected complete browser chain is in progress. Shared DEV and Production were not used as test targets. Raw local logs remain in ignored `artifacts/worlds-atlas-pass7/logs`; failed intermediate screenshots were preserved there separately from the successful delivery evidence.

## Required migration and controlled deployment

**MIGRATIONS REQUIRED, IN ORDER: `0137_world_terrain_refinements.sql`, THEN `0138_world_terrain_wrapped_refinement.sql`. Neither was applied by this pass to shared DEV or Production.**

0137 adds refinement identities, immutable versions, tile references and parent/writer safeguards. The forward 0138 correction allows seam-crossing coverage beneath a full-width wrapped parent. Both published migrations remain immutable; their file bytes match the published Git objects, and `.gitattributes` pins LF line endings for portable checksums. Exact SHA-256 values are recorded in `results.json`. Existing coarse terrain still opens without refinement tables; new refinement creation requires the complete sequence.

No additional configuration is required beyond the existing database, authentication and private terrain-storage configuration. Keep private terrain objects out of public static assets. A database backup and the corresponding private terrain objects (including the existing `SERRIAN_TERRAIN_ROOT` location when configured) form one recovery set.

Before a separately authorized shared DEV or Production application:

1. Independently verify the target identity, current migration ledger and backup locations; Production was not contacted by this work.
2. Back up the target database and paired private objects, and verify restoration in a newly owned disposable environment.
3. Pause authoring/old terrain writers for the migration and compatible-code transition. Apply the normal ordered migration runner through 0138; do not manually mark ledger entries or use schema push.
4. Publish the compatible application only under separate deployment authorization. Verify owner authoring, read-only Administrator review, ordinary/private filtering, old-map reopen and a disposable fine-area save/reopen.
5. Retain the backup and published Git checkpoints until the owner accepts the result.

Reverting Git does not reverse these database changes. Older writers intentionally fail safely when finer terrain exists. Prefer a compatible forward repair. If restoration is required, stop authoring and restore the paired database/private-object backup together; do not delete refinement tables or private files as a code rollback shortcut.

## Deliberate bounds and acceptance

Coverage is explicit and sparse: at most 128 refinements per map, eight nested levels and power-of-two dimensions from 32 to 1024 per axis. A new child must genuinely improve both axes. Siblings can touch but cannot overlap; nested children take precedence. Frames cannot be silently moved after acceptance. Boundary samples retain inherited context. Elevations remain whole metres; fractional measurement precision does not invent sub-metre terrain samples. Clean source histories have a bounded in-memory working set, while saved immutable versions remain authoritative.

No Stage 3/4 work, standalone Studio changes, new gameplay records, deployment or shared service restart is included. Publication is authorized to `origin/main`. Owner hands-on acceptance and any independent review are separate from these technical checks.

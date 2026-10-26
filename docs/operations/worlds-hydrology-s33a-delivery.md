# Stage 3 Pass 3A - Hydrology delivery

## Status and review boundary

Baseline: `789e755295d2aba263b093212dcb3239f86b53b8`. The updated owner brief authorizes this implementation, unattended validation and normal publication to origin/main. It does not authorize deployment, shared DEV/Production writes or Pass 3B. Implementation checkpoint: `fffa0ffe928de3e46e036edefa6ac9318728477b`. Additional browser-check checkpoint: `0293ac759832e7f5bb9912ae950fd8874dc44f69`. The final evidence commit changes documentation/screenshots only. Both passing final runs use production build `6qXuSAFzFWXJPzmuiFf23` with runtime source SHA-256 `cf3bf033ff5ac27389d9dd1f711872de0149e564ca0fb32338b3659471830cb1` (1,575 byte-verified files). This exact application implementation passed; owner/Ember review remains separate.

**MIGRATION 0141 REQUIRED:** [0141_world_hydrology.sql](../../drizzle/0141_world_hydrology.sql) adds independent water heads and immutable water versions. It has only been applied in newly owned disposable databases. It has NOT been applied to shared DEV or Production by this pass. The application preserves existing terrain functionality before that migration, permits temporary suggestions, and displays a prominent prerequisite before water can be saved.

The owner's technical permission to proceed is distinct from visual acceptance. **Current terrain artistic quality remains rejected and deferred.** This pass does not claim to resolve it. No independent Ember acceptance or physical owner-device acceptance is recorded.

## What creators can do

Open a World map, expand the existing editor, and choose Water in Map settings. Suggest rivers from the selected terrain source, current view or whole World. Sources in that geography are followed downstream through the connected coverage to their actual computed outlet. Temporary suggestions never save themselves. Accept a selected course and its downstream connections, accept all, reject a course, or discard the preview.

Add a source by choosing saved land. Inspect a waterway, name it, move a source/path point/shared junction, preserve an authored course, describe an explicit fictional exception, or remove it. Point movement preserves water identities and moves shared endpoints together; it is marked creator-authored and protected rather than certified as natural flow. Franchise, settlement, lore and gameplay records are unaffected.

Use Waterways as the active tool for separate Undo/Redo. Save waterways explicitly, reopen the map, recover an interrupted draft, retry its original accepted request, export a conflict before loading newer authoring, or restore an immutable water revision as a new draft/revision. Suggestions have no autosave. Water authoring never changes numerical terrain or surface materials. All five map appearances share the same water graph.

Terrain changes retain saved rivers and flag older analyses for deliberate review. Whole-World recalculation offers replacement of unprotected derived routes while preserving manual, exceptional and protected routes. A conflicting creator-adjusted junction produces an actionable rejection; it is not silently moved to fit a new suggestion. Small manual position edits retain the original analysis as provenance; that analysis does not certify the new path.

## Numerical method and continuity

The implementation uses steepest physical descent among neighboring analysis cells, deterministic flat routing toward established lower exits, and closed sinks where no lower exit is established. This is a D8-style single-receiver adaptation to a clipped adaptive mesh, **not** an implementation of every GIS conditioning algorithm. The general steepest-descent basis is described in [Esri's Flow Direction documentation](https://developers.arcgis.com/rest/services-reference/enterprise/flow-direction/); upstream accumulation is described in [RichDEM's flow accumulation documentation](https://richdem.readthedocs.io/en/latest/flow_accumulation.html). No external library, terrain service or copied implementation is required at runtime.

Each accepted root/refinement source contributes nonoverlapping rectangles in existing World metre coordinates. Parent rectangles are clipped at child coverage; adjacent, nested and wrapped interfaces have bidirectional neighbor connections. Routing uses metre distances, including unequal axes and short longitude seam distances. Accumulation weights actual contributing land area, not an equal cell count across different resolutions. Numerical tests check descending receivers, directed connectivity, conservation of contributing area and unchanged source arrays. Acceptance retains shared confluence/outlet identities; overlay zoom and imagery LOD cannot generate a new network.

Closed depressions retain a potential spill elevation computed from the lowest adjacent watershed saddle or fixed-edge escape. This is a diagnostic of the sampled coverage, not a filled lake, lake extent, guaranteed ocean connection or erosion. Fixed-edge exits and sea outlets are distinguished. Outlet positions are analysis-cell centers; subcell coastline intersections are not claimed.

Runoff is provisionally uniform. Accumulation is upstream land area, not rainfall, discharge, water volume or river width. Straight/parallel channels on a simple ramp and eight-direction bias on regular cells are expected first-method limitations, visible in the controlled fixtures. Rendering line weight communicates relative drainage area. No image pixels are used as height data and no ridge is carved to force a route.

Analysis is bounded to 524,288 planned cells and 655,360 clipped mesh cells, using deterministic accepted numerical overview levels where required. The camera never controls this plan. Every accepted source is included in a single connected coverage; it is not blindly expanded to its finest grid. Every analysis retains source IDs, revisions, content hashes, physical spacings, method, focus, area threshold and uniform-runoff assumption. Current heads are rechecked during loading and new derived saves. Finer-than-analysis geography remains provisional. The full accepted originals remain unchanged.

The graph supports at most 8,192 nodes, 4,096 channels, 65,536 points, 512 points per channel and 32 retained analyses. Limits fail explicitly and retain current authoring. A source snapped to a terminal sink may produce no channel; it does not invent an outlet.

## Processing and persistence

A background worker owns one cached numerical flow calculation. Accepted editor arrays are never transferred: fresh read-only API buffers are loaded and verified. Overview loading has two concurrent jobs and bounded batches. Cancel aborts loading and terminates the worker, including cancellation during the first metadata request. A 120-second watchdog bounds stalled work. There is no large synchronous fallback. Main-thread navigation remains available while work runs; prior suggestions and accepted authoring survive cancellation.

The additive migration introduces two tables, foreign keys to existing World/map identities and authors, revision/parent/restoration lineage, unique request IDs and an immutable-history trigger. Existing tables and historical migrations remain unchanged. Server saves enforce strict bounded payloads, physical coordinates, graph references/DAG structure, provenance, CSRF, owner authorization, atomic writes and revision conflicts. Request retries return the original immutable result before checking a newer head. Exact historical restoration creates a new revision.

Read-only Admin access requires explicit review. Other owners, ordinary knowledge requests, Players and anonymous callers cannot read these water records. Admin cannot save. Authorship FKs are classified as lifecycle blockers; deleting an account does not silently remove water history. Browser recovery has a separate map-specific key and retains the original pending command. Water history retains up to 20 undo states within a 262,144-point budget; the server history is immutable and the UI lists its latest 60 revisions.

## Migration and controlled deployment

Apply historical migrations in ledger order through 0140, then 0141 using the established migration command. Never rewrite already applied SQL or manufacture ledger rows. This pass rehearses a populated 0140 upgrade preserving 343 earlier public tables, a real service read before 0141, full database backup/restore, repeated migration and immutable history after restoration. It also retains the earlier terrain/material migration rehearsals.

Before any future deployment, independently verify the intended database identity and ledger, back up the database and private numerical/raster storage, and retain the deployed code checkpoint. Publication is not permission to deploy or mutate a shared database. No new external service, paid API or GPU is needed. Existing terrain object storage/configuration remains required; no new private asset location is introduced.

Rollback code to the retained baseline if needed; **code rollback does not reverse 0141**. Leave the additive tables/history in place. Do not drop them or erase new authoring. An actual data recovery requires a verified backup/restoration plan appropriate to that target, separately authorized. The historical 0132 ledger mismatch found in a previous read-only owner diagnosis is outside this pass; it was not rewritten or repaired here.

## Validation and evidence

Completed validation: **2,407/2,407 unit tests across 301 files**, root TypeScript, production build, Drizzle check, complete database/browser regression chain and final focused water run. Repository lint: **zero errors**, one existing unused `LoreFamily` type warning in `scripts/worlds-stories-checks.ts`; final added-script lint has no warnings. There are no skipped unit tests, browser errors or test authoring against shared databases. Existing immutable map/Realm relationships and 133 gameplay/runtime tables remain exact in the full run. All 141 historical migrations, prior schema definitions/snapshots, 14 original artwork assets, numerical services and generators are preserved.

In the final CPU/GPU-disabled run, the 24,720-cell adjacent/nested valley took 109.5 ms in the worker, with 3.7 MiB of retained/working typed arrays. The million-km World plus accepted 20 km refinement used 327,684 connected cells, 870.6 ms worker time, 1,208 ms end-to-end, 48.8 MiB of typed arrays and a 36.8 ms navigation response during work. Native refinement spacing was 19.53125 m, analysis spacing 39.0625 m, with original revision/hash pins retained. These are measured technical samples, not universal timing or whole-process memory guarantees. Browser/JavaScript overhead is additional.

See [the evidence index](../screenshots/worlds-atlas-s33/README.md) for completed commands, source/build bindings, test results, measured performance, actual screenshots, earlier failed attempts and corrections. No owner content is used in these published fixtures. Owner-specific diagnosis remains private and is excluded from Git.

## Deliberate limits and recommended Pass 3B

This is the first functional geographic water foundation. It does not simulate precipitation/climate, erosion, river volume, deltas/braids, full lakes/wetlands/waterfalls or artistic river banks. The single-receiver model, overview sampling and straight grid routing need to remain explicit when assessing appearance. Graph bounds can reject extremely dense networks; increase contributing area or narrow the source geography before accepting them.

Recommended later scope, requiring a separate prompt: lake/basin authoring and deliberate spill connections; stronger locally refined routing/conditioning with preserved provenance; better river bank/surface artwork and scale-aware cartographic generalization; continuing owner-directed terrain visual-quality correction. None is silently enabled in this pass. Installed-Chrome tests with GPU disabled and emulated touch/pen are technical evidence, not physical-device or artistic acceptance.

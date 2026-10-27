# Stage 3 Pass 3B - connected hydrology delivery

## Checkpoints and acceptance

Published Pass 3A starting point: `7a875e49411eceaab29e5876f9a3c2a462ca4032`. The checkout began clean on main, and that checkpoint remains in history. Initial Pass 3B implementation: `b8ef5dae0ebf3cd151642370d14e04d0b3a26771`. Final application and editing corrections: `2d42efb7bf1235ed9ad65c4ed8d65d2a2f7c209c`. Later delivery commits contain evidence/documentation only. The owner explicitly authorized unattended implementation and normal publication to origin/main. No deployment, shared database change, owner-server restart or Pass 3C is authorized or performed.

Final focused and unfiltered production runs pass against build `huJ0EDERHHEssVoMsY6tb` and runtime source SHA-256 `6bb12b790094f3e0c5d6e9492931e1f9725f5cfecfa56883902b761b87d93835` (1,583 byte-verified runtime files). [The validation receipt](../screenshots/worlds-atlas-s33b/validation.json) and [final file manifest](../screenshots/worlds-atlas-s33b/final-run-files.json) bind checks, logs and screenshots to the final implementation. The application is technically complete for publication and review; deployment still requires target verification, backups and owner authorization.

**NO NEW SQL MIGRATION FOR PASS 3B. Existing migration 0141 remains required to save waterways.** This pass uses its existing JSONB water head and immutable history. All 142 existing migrations, schema definitions, journal and historical snapshots remain unchanged. Migration application and backup restoration were exercised only in newly owned disposable targets. Shared DEV/Production application status was not inspected or changed; an owner may have applied 0141 independently.

Technical delivery does not record owner or Ember acceptance. **Terrain artistic quality remains owner-rejected and deferred.** Disposable screenshots do not establish parity with the owner's running localhost website. Installed Chrome with GPU disabled and emulated touch/pen is technical evidence, not physical-device acceptance.

## Delivered behavior

Creators can suggest rivers and potential lakes from accepted numerical terrain, accept or reject individual candidates, inspect a connected network, review a sampled spill/outlet alternative, retain a closed basin, or deliberately join lakes through a river. Lake identities, shoreline rings, one surface elevation, condition, inflows/outlet, source pins, creator exceptions and protection share the existing independent water document. Accepted water surfaces render above land materials without editing terrain. All appearances use the same geographic water geometry.

The optional Water inspector remains inside the map-first Atlas editor. It supports drawing lakes, naming and changing their condition/level, moving/inserting/removing shoreline points, moving river sources and control points, inserting/removing river points, splitting another channel at an explicit confluence, disconnecting an endpoint, connecting an inflow or outlet, closing an outlet, setting physical width, describing fictional exceptions and deleting water features. Automatic symbolic river weight remains separate from physical width overrides. Network inspection exposes connectivity and stream hierarchy. Round geographic joins improve continuity without moving saved junction endpoints.

Lake deletion retains river records as explicit detached endpoints needing review. Closing an outlet retains its downstream course. Port movement preserves identity and flags shoreline review. Accepting a lake over old unprotected derived channels reconciles submerged segments and retains entering courses. Protected and manual routes remain intact and cause review flags where necessary. A directed-cycle check includes virtual inlet-to-outlet lake arcs, preventing false loops across lakes or the World seam. Existing single-receiver routing remains the foundation.

Watershed inspection traces actual upstream receivers toward a river pour point or lake, records coastal/inland/fixed-edge/tributary classification and parent drainage destination, and sums contributing physical land area. Boundaries and shading are switchable, with retained watersheds saved independently of terrain and imagery. Area labels use the existing metric/imperial preferences. Wrapped watersheds covering the full circumference use a canonical meridian cut; the artificial cut is hidden from geographic boundary ink.

Completed edits share the original water undo/redo, explicit saves, revision conflicts, immutable history, exact historical restore, draft recovery and idempotent pending-request recovery. Terrain saves remain independent. Source-head changes conservatively flag affected water interpretations; creators can review a selected lake/network with current numerical pins. Review proposals never silently replace protected geometry. Numerical terrain, material strokes and World identities remain authoritative and separate.

## Numerical interpretation

The 3A physical adaptive mesh and numerical D8-style flow body are preserved. A separate deterministic priority-flood calculation provides filled-level/escape-parent diagnostics and candidate depressions; it does not replace the original receivers or alter accepted heights. Local marching-square contours use accepted numerical sampling, including island holes and unequal-resolution coverage. Suggestions remain potential impoundments, ordinarily closed below their sampled spill. Creators explicitly choose standing, intermittent or dry interpretations; no climate-dependent permanence is asserted.

Runoff is provisionally uniform and accumulation measures contributing land area. Stream hierarchy and automatic line weight are relative geographic estimates, not rainfall, measured discharge, depth or volume. Watershed areas derive from analysis membership; displayed boundaries are approximate contours of that sampled coverage. Saved recipes/pins record method, focus, source revision/hash, overview level and physical spacing. Manual source-head pins record authoring context, not certified bathymetry.

Local analysis retains coarse accepted far-field context rather than loading unrelated high-resolution grids. Finer nearby sources improve the requested geography without pretending that distant drainage received the same precision. Geometry and identities do not change with camera zoom or material LOD. Accepted refinement changes offer deliberate review, not automatic regeneration.

## Persistence, privacy and rollback

The version-1 envelope gains an explicit optional `systemVersion: 2` extension. Old documents parse unchanged, without injected defaults. Old accepted request IDs still return their original immutable result even after a newer v2 head. A fresh old-format writer cannot silently downgrade that head. Exact deliberate restoration of old history remains supported as a new revision. No legacy conversion wizard, second water store, SQL rewrite or data backfill is introduced.

Server validation enforces World/map ownership, physical bounds, ring geometry, port references, source provenance, bounded payloads and an acyclic graph. The existing atomic transaction, optimistic revision, idempotency, CSRF and immutable-history protections cover lakes and rivers together. Creator writes, explicit Admin read-only review, foreign-owner denial, Player/anonymous denial and ordinary/privacy filtering remain enforced. Authorship history remains a lifecycle dependency.

Before any future deployment, independently verify the intended database identity and ledger, retain code plus a database/private numerical-storage backup, and apply any outstanding historical migrations in order through 0141. No new configuration, paid service, private material asset or GPU is required. Existing numerical storage configuration remains required. Never manufacture ledger entries or rewrite historical SQL.

Code rollback does not erase accepted water. Old 3A strict decoding cannot read a v2 head, so prefer a forward correction or temporarily disable water authoring while retaining all JSONB/history. If an older exact revision is deliberately restored with the new service, retain intervening history. Never strip extension fields or drop tables to accommodate older code. Target-specific data recovery requires a separately authorized, verified backup/restoration plan.

## Validation and measured performance

Completed checks: **2,420/2,420 unit tests across 302 files, zero skipped**, root TypeScript, whole-repository lint (1,988 files; zero errors, one pre-existing unused `LoreFamily` warning), additional final browser-script lint with no warnings, offline Drizzle check, production build and the full unfiltered disposable database/browser chain. The final correction-focused run also passes against the same application build. No final test failures, browser errors or unexpected legacy map requests remain.

The full chain covers original 3A behavior, extended lake editing/ports/watersheds, old pending retries and history, downgrade rejection, recovery after accepted-but-lost responses, concurrency, deliberate terrain reconciliation, protected geometry, native touch/pen and large-World performance. Inherited terrain generation/import, sculpting, physical scale, measurements, refinements/recovery, description, cartographic styles, imagery/materials, Town/Shop workshops, all thirteen World creator families, History/calendars/Campaign associations, lifecycle and privacy checks pass. Existing map/Realm records and all **133 gameplay/runtime tables remain exact**. All **142 historical migrations**, schema/snapshot files, original numerical/rendering services and **14 material assets** are preserved. Populated 0140→0141 upgrade retains 343 prior public tables; full database dump/restoration preserves both document formats and immutable history, with real restored-service reads and repeated migration.

Measured GPU-disabled installed-Chrome sample: a million-km World with four accepted 20 km, 1,024² refinements, using the same 5 km² major-channel threshold:

| Path | Cells | Worker calculation | End-to-end browser action | Retained/working typed arrays |
| --- | ---: | ---: | ---: | ---: |
| Original 3A river-only review | 524,301 | 1,576.4 ms | 1,959.4 ms | 78.0 MiB |
| Connected local lake review | 330,765 | 1,462.3 ms | 1,902.4 ms | 59.4 MiB |

Navigation responded in **18.3 ms** during lake analysis. The target refinement retains 19.53125 m native spacing, uses a 39.0625 m accepted overview for analysis, and leaves three distant refinements at 625 m accepted overview spacing. Their full grids were not fetched for the local calculation. Numerical source fingerprints and accepted water geometry remain exact through zoom. This comparison includes the improved local/far-field allocation, so it is not a pure priority-flood algorithm speedup or a claim of equal fine precision everywhere. Typed-array totals include contour workspaces, exclude JavaScript/browser overhead, and are not peak process RSS. Timing varies with hardware and load.

The [evidence index](../screenshots/worlds-atlas-s33b/README.md) binds actual screenshots and machine-readable results to source/build checks, preserves earlier failed attempts and explains their corrections. All published terrain is disposable test geography. Private owner diagnosis, credentials, numerical object storage and environment receipts remain excluded from Git.

## Explicit limitations and next review

- The single-receiver model retains directional bias. Synthetic linear slopes expose regular parallel/diagonal channels; these fixtures establish topology and repeatability, not finished artistic quality. Lake contours and watershed boundaries retain their recorded analysis uncertainty.
- Climate, precipitation, hydraulic discharge, depth/volume simulation, erosion, waterfalls, wetlands, vegetation, roads, settlements and later Art Studio work remain deferred.
- Spill review refuses an automatic escape through another unreviewed impoundment. Deliberate creator connections between lakes work. Full-circumference lakes are explicitly refused; full-circumference watersheds are supported through the canonical cut.
- The existing analysis limits remain 524,288 planned cells and 655,360 mesh cells, with 8,192 nodes, 4,096 channels, 65,536 channel points, 512 points per channel and 32 analyses. New geometry permits 256 lakes, 64 retained catchments and 32,768 combined surface points, with 8,192 per ring. Automatic proposals are capped at 64 lakes; local contour grids at 512 by 512. Excessive geometry/escape paths fail explicitly and retain accepted work.
- Worker cancellation and the 120-second watchdog remain. Typed-array accounting includes numerical and contour workspaces but excludes JavaScript/browser overhead; measurements are not process RSS or hardware guarantees.
- Source-head invalidation is conservative; changing one source can flag several dependent objects. Manual/protected water remains available for deliberate reconciliation. Finished water operations recover; unfinished shoreline taps warn before leaving but must be completed to become a recoverable object.

Recommended follow-up is owner/Ember review of this exact published pass, then only separately authorized Pass 3C scope. Carry forward the unresolved terrain artistic-quality and owner-runtime parity concerns. Continue improving geographic presentation and routing under explicit provenance/protection rather than treating technical checks as visual approval. **Pass 3C has not begun.**

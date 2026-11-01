# Atlas Stage 5A — Town and City Maps

Status: Stage 5A usability and creative-quality correction technically verified on 2026-10-31; current receipt follows the retained original delivery below. The owner rejected the original experience as too complicated. Owner usability/artistic acceptance remains pending. Starting checkpoint: `88cfa27c682b5b339e7f672d8c98b1f0289b2191`; correction starts at `f373dbcfbbc5a96ad3cf74517c842b25728e5ac3`. Stage 5B is not authorized.

## What changed

Town markers and the existing Worlds Town Builder now expose **Create Town Map** and existing alternate maps. Creation offers **Start Blank**, three small starting layouts, and **Generate Town**, followed by a real canvas preview and **Save & Open Town Map**. Roads, districts, rectangular or irregular footprints, walls, public spaces, water areas, landmarks and labels remain editable geometry. The header keeps Current Map, Switch Map, Save Changes, Undo/Redo and source navigation visible. Independently collapsible tools and contextual settings preserve the canvas; phone drawers open separately.

The final production application snapshot is `0c7b08ada7adb8c2e8a4c5b26dea33500e726f895e07f2c41c34e0fe378e1214`, build `-lttx1cqfWVp2qA5P6BCV`, runtime manifest `6ae420d43bfd4518904de93901036d526bf9fc358a965ffdff1200bbe027cc43`. Application commit: `2f183ecd321a9e8774679e75524b8c211b312941`.

## Existing-code audit and reuse

- `worldSettlementProfile`, `worldMapPlace`, `worldGeography` and `world-town-service.ts` continue to own permanent Towns and their physical placements. The existing Town Builder creates and places new Towns; this pass adds no second identity creator.
- `worldTownPlace`, `worldShopLocation`, `world-business-service.ts` and `TownShopCreator` remain the permanent building/place and Shop entrance workflows. Footprints link to those original records explicitly. Duplicate footprints start unlinked; removing map geometry preserves the permanent place and business.
- `settlement.ts`, `settlement-service.ts`, `worldAtlasSettlementShape` and their scene/transformation code were audited. Their fixed 2,000 × 1,200 drawing frame and mandatory permanent-place-per-shape model are unsuitable for procedural footprints in physical metres. Their layer categories and existing semantic map inks informed the new surface editor; their saved data and retired HTTP boundary remain intact.
- `worldAtlasMap`, `world_map_canvas`, original World source resolution, refinement sampling, accepted hydrology geometry, hierarchy, semantic themes and Pending Work were retained. Town Maps use separate tables instead of consuming regional terrain slots. No terrain, coordinate, painter, artwork asset, numerical generator or gameplay engine was replaced.

## Identity, coordinates and persistence

`world_town_map` stores a permanent Town ID, same-World original World-map/terrain identities, optional saved placement ID/revision, exact source anchor, immutable local extent/orientation, original regional return context, current design and revision. Local coordinates are centimetre-rounded metres, east and south from the map's local north-west corner. The saved rotation/translation projects them into original World metres, including east/west wrapping. Zoom changes presentation only.

The backdrop reads the original accepted World and finest applicable numerical refinements through the existing sampler. A bounded 17 × 17 elevation/water sample field provides terrain context; projected accepted river segments and lake outlines retain narrow water features between samples. Sampling rechecks source fingerprints. Town editing never writes World heights, refinements or waterways. Moving/removing a Town marker later retains the map's original anchor and displays an explanation; another location uses an explicit alternate map.

`world_town_map_version` retains immutable accepted geometry, name/archive state, author, request hash and sequential revision. Creation and version acceptance are atomic inside the existing owner-locked World transaction. Database guards preserve source identities, exact head/receipt agreement and immutable history. Same-World/source/placement checks, optimistic conflicts and stable request IDs prevent forged links and duplicate retries. Accepted historical retries return their original result without reverting a newer head. The new User authorship FK is classified as a deletion blocker; the complete closure is now **137 FKs**.

**Migration `0151_world_town_maps.sql` is required**, after the normal forward sequence through 0150. SHA-256: `ca00c2f30182032c677028938bef4626c748aca630084a3b357f3306988ca7e8`. All 302 prior SQL/snapshot files and 151 prior journal entries remain frozen. Historical working-tree line endings were compared with the retained byte-hash registry, including unchanged CRLF history; published source blobs were checked independently. No historical migration was canonicalized or reapplied to shared targets.

Only newly owned disposable databases/storage were migrated. Fresh 152-entry replay, populated forward upgrade, missing-0151 refusal and paired SQL/private-storage restore pass. A fresh service process reads restored Town geometry, permanent links, original numerical sources and exact original retries. Shared DEV/Production ledgers were not inspected or changed.

## Generation and editing

The version-one deterministic generator uses settlement scale, approximate population, density, architectural influence, era, terrain character, road pattern, fortification and seed. Village, planned-town and fortified starting layouts remain lightweight. Terrain sampling omits unsuitable steep/wet sites; accepted narrow river crossings are marked as bridges. The preview explains sampling limits and omitted sites. It is an approximate settlement layout, not precise urban planning or hydrological simulation.

Generation creates visual geometry only: no permanent buildings, Shops, residents, population changes or lore. Existing shapes, names and permanent associations are protected by default. Further generation proposes infill around occupied areas and respects locked layers. Cancelling preserves accepted geometry. Deliberate manual removal archives a retained representation; no bulk replacement or selective-area regeneration is claimed.

Roads have main/street/lane/trail/bridge categories, physical widths and snapping to grid or existing segments. Districts and buildings support rectangle or point-by-point outlines. Selection exposes direct vertex/body dragging, resize and rotation handles, category/name changes, duplicate and removal. Grid spacing, scale bars and two-point measurements use metres. Waterways, roads, districts, buildings, walls, landmarks and labels have saved visibility/lock states; the geographic backdrop is read-only and can be hidden.

Undo/Redo retains up to 30 edit-session states within a 12 MiB serialized estimate. Undo across a save archives missing accepted representations; Redo restores their exact geometry and identities. Browser drafts retain unfinished drawings and original save requests. Creation settings and original creation attempts can be recovered. Failed/lost acknowledgments remain retryable; a conflicting draft can be exported before explicitly loading saved work. Pending Work names the leaving map and destination and requires explicit Continue after resolution.

## Navigation and permanent records

World/region/Town maps share the existing Switch Map dialog. Town inventory is searched and paginated separately. Breadcrumbs include the regional context and Town. Opening the same Town Map from a sibling region retains that entry context for return, without changing the map's immutable geographic source or duplicating it. Returning focuses the original local location. Direct bookmarks and the Worlds Town Builder reopen the same map identity.

Linking an existing building/place or Shop entrance uses established Worlds records and validates the same Town. Explicit creation opens the existing full creator. World Shop balance, definitions, entrances and permanent-place data remain exact through footprint linking/removal, including a nonzero-balance fixture. Campaign commerce/runtime sources remain unchanged. A shared Shop may retain multiple original entrances; a footprint never manufactures a franchise or business identity.

## Validation and receipts

Large receipts, captures, profiles and dumps remain ignored under `artifacts/towns-s5a-*`.

| Coverage | Evidence |
| --- | --- |
| 2,600 units in 320 feature files; production build; TypeScript; ESLint with zero errors and one pre-existing LoreFamily warning; Drizzle check | `towns-s5a-workbench/*publication.log`, `drizzle-final.log`; build/browser receipt below |
| Full headed Chrome production Town journey, nested context and sibling return, drawing, direct handles, measurements, permanent links, protected generation, exact lost-ack retry, desktop/tablet/phone and expanded layouts | `towns-s5a-browser-22/browser-results.json`, `town-browser.json` |
| Native DPR-2 touch, explicit arming, two-finger exact rollback, Undo/Save/Redo/Save identity preservation | `towns-s5a-browser-22/town-native-inputs.json` |
| Actual HTTP CSRF, preview aliases, chunked oversized input rejection before staging, malformed geometry, concurrent 200/409 saves, role/privacy boundaries and exact retries; authentication throttling retained | `towns-s5a-browser-22/town-http-security.json` |
| Fresh/populated upgrade, 68 Town Maps beyond the terrain-slot limit, original private-file hashes, wrapped anchors, actual cross-World IDs, archived Towns, immutable receipts and paired restored-service reads | `towns-s5a-database-21/*.json` |
| Existing regional layers/authorities, contained numerical editing, all 21 tool/precision histories, generation/import/regeneration, crossing water protections, multi-tab/lost-ack/restart recovery, roles/CSRF, six appearances and native phone input | `towns-s5a-inherited-17/browser-results.json`, database and device receipts; this earlier runtime predates only Town-specific validation/generation/guidance corrections |
| All four unchanged nine-limit World CPU suites, budgets and regional switching | `towns-s5a-cpu-3/results.json`, four comparison receipts; final search-only delta above |
| Portable raster provisioning | `towns-s5a-workbench/raster-final.log` — 2 pass, Windows POSIX-only case skipped; Linux CI runs all cases |
| Full owned account-lifecycle database suite | `towns-s5a-workbench/lifecycle-final.log` — 5/5 |
| Original sources/assets/migrations and numerical editing functions | `towns-s5a-workbench/preservation.json` — 9,986 protected blobs, 108 original public assets, 302 frozen SQL/snapshots |

These are separate receipts, not a single uninterrupted aggregate. Earlier failed, interrupted or invalid runs remain retained: initial sandbox/junction/build/test-harness problems, canvas loading/grid placement, phone drawer/layout corrections, throttled test login and the overlapping CPU climate-preview failure. The initial raw-Git migration comparison was invalid for pre-existing CRLF files; the retained byte registry and independent Git-blob verification resolve that distinction. Three stopped fixtures from this pass were relocated from a full C: drive to D:, with every file hash verified and old/new paths retained in `fixture-relocation.json`; their data was not deleted.

Computer-use initialization failed and exposed no usable browser surface. Acceptance instead used installed **headed Chrome 134.0.6998.166**, public roles/labels, native pointer/touch/keyboard input and personally inspected captures through the existing isolated harness. This is technical browser/device evidence, not owner artistic/usability acceptance or physical-device certification.

## Capacity, performance and storage

- **10,000 retained Town Maps per World, 32 per Town**, independently of the unchanged 64 retained terrain-map limit. Inventory pages contain 50 summaries without full designs. Archived maps count toward retention limits.
- **4,000 retained features, 64,000 total points, 256 points per feature**; extents are 100–20,000 m per axis and must fit the original World. Input streaming uses the accepted **8,000,000-byte** ceiling.
- Canvas2D backing allocation is capped at 2.5 million pixels; the spatial index bounds large shapes separately. No external GIS, GPU or WebGL path is required. Generation is bounded and preview requests are cancellable.

Final production CPU-disabled Town measurements (`towns-s5a-browser-22/town-performance.json`):

| Case | Features / footprints | Generation HTTP | Open | Render | Ten navigation keys |
| --- | ---: | ---: | ---: | ---: | ---: |
| Village | 90 / 61 | 54 ms | 612 ms | 0.9 ms | 64 ms |
| Town | 909 / 684 | 80 ms | 1,064 ms | 3.4 ms | 138 ms |
| Dense city | 3,692 / 2,387 | 132 ms | 606 ms | 8.2 ms | 326 ms |

Each measured backing surface used 3,510,968 RGBA bytes. These are explicit surface/serialized-history estimates, not process RSS or physical-device guarantees. All **36 unchanged CPU limits pass** against exact accepted `88cfa27` in `towns-s5a-cpu-3`, together with artwork/cache budgets, exact source/pixel checks and regional switching/reuse. The initial overlapping run exceeded climate preview by 30.3% against the unchanged 25% limit and remains retained in `cpu-2`; the serial run passes. The only subsequent application delta disambiguates empty World/regional search results and trims surrounding Town-search spaces. `final-search-delta.json` proves those two reviewed edits reverse exactly to the CPU-tested application snapshot; every other application file is byte-identical. The full headed Town/HTTP/native/performance journey was then repeated successfully in browser-22, including whitespace search. These receipts are explicitly separate.

The 68-map fixture retained 70 versions: head/version logical JSON payloads were 179,889 / 181,342 bytes; PostgreSQL relation allocation was 237,568 / 188,416 bytes. All 125 original private files (265,748 bytes) retained exact hashes. Town Maps created no private terrain objects or grids. Immutable versions still grow; no cleanup/GC or storage redesign occurred.

## Owner acceptance and controlled release

1. Open a World/region, choose its Town marker, select Create Town Map, preview Blank or Generate, then Save & Open.
2. Draw roads, a district and footprints. Drag their points, resize/rotate, name them, Undo/Redo, save and reopen.
3. Link a permanent place and existing Shop entrance. Remove the footprint and confirm the original records remain in Town Details.
4. Preview more generation around manual work, cancel it, and return to the source region. Open the same map from another region and verify return context.
5. Try the phone drawers, expanded canvas, drawing arming, visible Save Changes and Switch Map.

No new configuration or assets are required. For a separately authorized release, take a verified paired database/private-storage backup and rehearse the exact target's forward sequence through 0151 before starting the compatible application. This pass does **not** apply shared migrations, deploy or restart owner services. Reverting application code does not reverse 0151 or erase Town Map history; preserve the tables/data and use the verified paired restore only under a separate recovery decision. No Stage 5B/5C work, interiors, floors, dungeons, publishing/VTT or commerce redesign was started.

## Publication receipt

Application commit [`2f183ecd321a9e8774679e75524b8c211b312941`](https://github.com/Revty79/serrian-tide-website/commit/2f183ecd321a9e8774679e75524b8c211b312941) is published to `origin/main`. [GitHub validation](https://github.com/Revty79/serrian-tide-website/actions/runs/41267138135) passed TypeScript, ESLint, all 2,600 units and portable raster regressions on Linux. The existing LoreFamily lint warning and GitHub action/runtime-image notices remain separate from application failures.

`towns-s5a-workbench/source-publication.json` verifies the 1,799-file application snapshot and runtime manifest against the tested production checkout. Application and asset bytes are exact; the isolated Next build added only its two generated-type include paths to its own TypeScript configuration. New migration bytes match the rehearsed SHA-256 in the committed Git object. Captures, databases, private objects and large diagnostics are absent from the publication. A following documentation-only receipt commit records this result without changing the tested application. Stop at Stage 5A; owner usability/artistic acceptance, physical-device certification, shared migration and deployment remain separate.

## Stage 5A owner correction: approachable creation and original town artwork

This corrects the existing Stage 5A, following the owner's usability and creative-quality supplement. The original delivery and its receipts above remain historical. The current application snapshot is `23d6380c6c8121c7d4b548a3a1f0876c71219afa685c30e0d5664af4eb92f232`, runtime manifest `59fcaf86de30f8abbc0105a27e8aa4eff8ac7608862a12f856f1b44665b70219`, production build `aZsYPSkROE6ygP2ZLzj9k`.

**Creation and guidance.** A visible **Town Maps** action on World/regional maps opens the actual Town inventory and **Create Town Map**. Creation reuses the Town's sole placement and presents **Generate a Town** or **Draw My Own**. Blank creation saves and opens directly. Generated layouts have a retained preview and prominent **Save & Open Town Map**; changing settings offers **Update Preview**. Alternate names are unique. Missing placement/schema, invalid input, read-only access and retained work have specific explanations or recovery actions.

The compact tools use Roads, Buildings, Public Spaces and Trees. The active tool, a short instruction and its immediate choices sit beside the canvas. After a road, **Add Buildings Along It** is an optional next action. Drawing remains free-order; advanced controls and additional drawing tools stay accessible. **Save Changes** can finish a valid unfinished road/outline before saving; incomplete input stays recoverable. Save, map switching and return navigation remain visible. Phone users see **Start Drawing/Start Editing** in the active-tool instructions, preserving explicit touch arming and two-finger rollback. The final 390 x 844 DPR-2 building workflow retains a 423.3-pixel visible canvas and 44-pixel header targets; the inherited 400-pixel minimum was not reduced.

**Recognizable pieces and direct editing.** Thirteen original illustrated choices cover Cottage, House, Large Home, Courtyard Home, Shop, Tavern/Inn, Workshop, Barn/Warehouse, Stables, Town Hall, Temple, Tower and Castle/Keep. Select a piece and place it repeatedly, with immediate size, building look and turn controls. Optional street-facing placement aligns near a road while keeping buildings off its centreline. Custom outlines remain available. Body dragging moves the selected object; **Reshape Corners** reveals direct corner handles. Resize and rotation handles remain on the map. Point symbols resize, new gates use editable line geometry, and legacy gate symbols remain readable. Locked pieces explain their state and offer Unlock.

**Art and settlement generation.** The original Canvas2D painter adds roof planes/eaves, bounded shingles/thatch/slate, awnings, inn signs, workshop chimneys, distinct temple/tower/keep treatment, walls/gates, clustered trees, gardens, market stalls/fountain, fields, road edging and water marks. There are no downloaded images, fonts or dependencies. This is a cohesive starter kit for plan-view fantasy settlements; a comprehensive historical/industrial asset library and interiors are outside this pass.

Organic generation now uses bounded connected irregular streets around a market, short non-crossing extra links, varied street-facing parcels, open areas, fields and tree groups. Planned, radial and fortified patterns retain distinct layouts. Terrain checks omit unsuitable wet/steep/crowded sites; manual shapes, names, links and locked layers remain protected. Timber/stone choices affect appearance without creating permanent buildings or businesses. While generation is pending or a proposal is open, shape editing is frozen and Cancel is visible on the map; cancellation retains the exact manual draft. Accepting a proposal remains explicit.

### Current correction evidence

All large evidence is ignored under `artifacts/towns-s5a-*`. These are separate Town, root and World CPU receipts, not a single uninterrupted all-World aggregate.

| Coverage | Current evidence |
| --- | --- |
| 2,606/2,606 units in 321 files; production build/type check; ESLint zero errors and the one pre-existing LoreFamily warning; credential-free Drizzle check | `towns-s5a-usability-workbench/units-release.log`, `lint-release.log`, `drizzle-release.log`; production build in browser-8 |
| Complete headed production manual village, contextual road-to-building choices, repeated cottages, tavern/rotation/resize/direct movement, shop, market, trees, save/reopen; generated preindustrial timber village plus Temple; delayed-generation cancellation | `towns-s5a-usability-browser-8/browser-results.json`, `town-creative.json` |
| Original Town regression journey: direct vertices, exact Undo/Save/Redo/Save, permanent place/Shop links, lost accepted acknowledgment/reload/exact retry, named Pending Work, protected regeneration, regional/sibling return and switching | Same receipt, `town-browser.json` |
| Standard/expanded desktop/tablet/phone layouts and native DPR-2 touch with explicit arming and exact two-finger rollback | Same receipt, `town-browser.json`, `town-native-inputs.json` |
| Actual CSRF/preview aliases/chunked oversized requests/malformed geometry/concurrent saves/role and foreign-World boundaries; 68-map inventory; fresh/populated migration and paired SQL/private-storage restored-service reads | Same receipt, `town-http-security.json`, database receipts, `town-restored.json` |
| Same actual canonical geometry through old/new Town painters, and old/new generators using identical World/frame/recipe | Same receipt, `creative-comparison.json` and ignored before/after captures |
| All four unchanged nine-limit World CPU suites, geographic/source comparisons, artwork/cache budgets and regional switching/reuse | `towns-s5a-usability-cpu-1/results.json`, four comparison receipts; all 36 limits pass against accepted `88cfa27` on the current runtime |
| Original assets, frozen migrations, original Town service/HTTP/schema, numerical/render/climate/water/geographic/gameplay sources and original World editing functions | `towns-s5a-usability-workbench/preservation.json`, `source-publication.json` |

The normal-browser workflow uses public roles/labels and visible canvas input, without hidden selectors or implementation data for ordinary actions. Installed headed Chrome 134.0.6998.166 runs with GPU disabled. Computer-use initialization remained unavailable; the existing isolated browser harness supplied native input and personally inspected captures. Final manual, generated-neighbourhood, palette and phone captures were inspected, including same-geometry old/new artwork. Technical comparison calibration uses public wheel/drag at similar geographic scale, reports actual canvas dimensions separately, and claims neither pixel equality nor owner approval. The new image is not credited merely for canvas size: its comparison canvas is smaller.

Current GPU-disabled Town measurements (`browser-8/town-performance.json`):

| Case | Features / buildings | Generation | Open | Render | Ten navigation keys |
| --- | ---: | ---: | ---: | ---: | ---: |
| Organic village | 130 / 44 | 64 ms | 473 ms | 1.7 ms | 193 ms |
| Organic town | 507 / 271 | 117 ms | 540 ms | 4.3 ms | 291 ms |
| Dense planned-city stress case | 3,686 / 2,381 | 157 ms | 822 ms | 23.4 ms | 608 ms |

All retain the original 15-second open, 100-ms render and 1,500-ms ten-key budgets. Each measured backing surface uses 2,971,200 RGBA bytes. Extra decorative work is capped at 9,000 marks per frame, clipped to the visible area and simplified at city scale; the measured city adds zero decorative marks. Existing limits remain 4,000 features, 64,000 points, 2.5 million backing pixels, 30 history states and a 12-MiB serialized-history estimate. Richer rendering costs more CPU than the original simple painter; original/new Town timing rows also have different designs and do not constitute an identical-workload speed comparison. Surface estimates are not process RSS or physical-device certification.

The current 68-map storage fixture retains 70 versions: logical head/version JSON payloads are 186,779/188,232 bytes and PostgreSQL allocations are 253,952/204,800 bytes. All 125 original private files (265,748 bytes) retain their exact hashes. Town Maps create no terrain grids/private terrain objects; immutable versions still grow. No storage cleanup or redesign occurred.

All 10,010 protected baseline Git blobs and 108 original public assets remain exact. All 304 SQL/snapshots and 152 journal entries through 0151 are frozen; **this correction adds no migration**. Existing 0151 remains required for the initial Town Map feature, with the unchanged SHA-256 above. Only newly owned disposable targets were exercised; shared DEV/Production were not accessed or migrated.

Earlier failed or rejected correction attempts remain retained: interrupted development HTTP inspection, personally rejected initial generated layout and crowded phone views, a small-building drag that selected a corner before direct movement was separated from Reshape Corners, a stale browser-helper build reference, raw CSS art colours rejected by the semantic-token unit guard, and browser-7's actual 388.3-pixel phone failure against the unchanged 400-pixel gate. Browser-8 passes the corrected complete journey. Historical World/six-appearance/full-lifecycle receipts above remain historical; unchanged engine/source proof and fresh CPU checks do not convert them into a new uninterrupted aggregate.

No shared database operation, deployment, owner-service restart, cleanup/GC, commerce redesign, new hierarchy, interiors or Stage 5B/5C occurred. This correction stops for owner review. Technical readiness, owner usability/artistic acceptance and physical-device certification remain distinct.

### Correction publication

Application commit [`076a5bc47f24ebf4e5e4892b2d429f26eebbfda2`](https://github.com/Revty79/serrian-tide-website/commit/076a5bc47f24ebf4e5e4892b2d429f26eebbfda2) is published to `origin/main`. [GitHub validation](https://github.com/Revty79/serrian-tide-website/actions/runs/41277657996) passed TypeScript, ESLint, unit tests and portable raster regressions on Linux. The pre-existing LoreFamily warning and action/runner-image notices remain separate. `towns-s5a-usability-workbench/source-publication.json` proves all 1,804 application/asset files match the accepted production checkout; its only isolated TypeScript configuration delta is the two Next-generated type include paths. A following documentation-only commit records this receipt without changing application code. Final local/main/live-remote parity, a clean tree and both GitHub runs are retained in ignored `towns-s5a-usability-workbench/publication.json`. No release deployment or shared migration accompanies publication. Stop at Stage 5A for owner review.

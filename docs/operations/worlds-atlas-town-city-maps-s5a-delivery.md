# Atlas Stage 5A — Town and City Maps

Status: technically verified on 2026-10-31; publication receipt is recorded below. Starting checkpoint: `88cfa27c682b5b339e7f672d8c98b1f0289b2191`. Stage 5B is not authorized.

## What changed

Town markers and the existing Worlds Town Builder now expose **Create Town Map** and existing alternate maps. Creation offers **Start Blank**, three small starting layouts, and **Generate Town**, followed by a real canvas preview and **Save & Open Town Map**. Roads, districts, rectangular or irregular footprints, walls, public spaces, water areas, landmarks and labels remain editable geometry. The header keeps Current Map, Switch Map, Save Changes, Undo/Redo and source navigation visible. Independently collapsible tools and contextual settings preserve the canvas; phone drawers open separately.

The final production application snapshot is `0c7b08ada7adb8c2e8a4c5b26dea33500e726f895e07f2c41c34e0fe378e1214`, build `-lttx1cqfWVp2qA5P6BCV`, runtime manifest `6ae420d43bfd4518904de93901036d526bf9fc358a965ffdff1200bbe027cc43`. Publication identifiers are recorded below after the checks finish.

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

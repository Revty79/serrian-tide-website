# Atlas Stage 4 Pass 5 — nested regions and map switching

Technically verified on 2026-10-31. Starting application: `526dcda299d9e3a83d4aa6e8e93cc47a666bede5`. Main publication is authorized under the owner's requested workflow.

Final application snapshot: `ff8ab56e4d93a288b1caef5166b85e6f76c329a63d72398a8c68c29fd0440a96`; production build `w1kfSkbqYQzKhaRcLQNYS`. The numerical/rendering runtime manifest is `5a7bfcaa76aef03f556840517d13307b9f3a6872fffa36142577354fe4f946e9`.

## Behavior and model

The workspace identifies the **Current Map**, opens **Switch Map** directly from every tool, and shows clickable breadcrumbs. The compact browser searches and expands independent World maps and their regional branches, highlights the current map, and provides Create World Map, Create Region and Create Subregion. Its list scrolls independently. The map retains the accepted canvas minimum, camera behavior, independent panels and expanded workspace. Painting choices, brush settings and expanded mode survive document switches; temporary placement/boundary operations remain guarded.

Create Subregion retains the viewed region as its organizing parent, then draws on its original, unclipped World. Rectangle, Freehand and Point-by-Point appear first. Draw Elsewhere on World fits the original World while retaining the parent and its reference outline. A boundary outside its organizing parent is explicitly allowed. Review & Save Region leads to the existing Save & Open Region confirmation; direct handles, per-area repair, exact boundary history and recovery remain available.

`world_region_hierarchy` stores one optional organizing parent, source identities, revision and attribution. `world_region_hierarchy_change` stores immutable, uniquely identified creation/move receipts. **Migration 0150 is required**. Its SQL SHA-256 is `de9415db3bb9caea2febcb3273712c5d598ee97ad45d924991cc86fd45c9c201`.

The immutable `world_map_region.parent_map_id` still identifies the original independent World map. `world_atlas_map.source_map_id`, terrain identities, geographic collections, accepted footprints and geographic permissions are unchanged. Organization neither copies grids/collections nor grants editing outside the child's own boundary. Alaska can belong to United States without fitting its outline; both retain the same original World source.

Legacy regions without a hierarchy head remain root regions at organizational revision zero. Existing rectangle/freeform creation commands and hashes retain their original retry contract. New child creation and its hierarchy receipt commit atomically. Missing 0150 explicitly rejects child creation instead of substituting a root region; legacy root creation remains compatible. An unavailable hierarchy shows a clearly labeled flat availability list rather than an invented tree.

Reparenting uses optimistic revisions and immutable request hashes. Original accepted retries remain valid after later moves and never revert them. Service writes and SQL guards serialize on the World row; recursive checks reject self/descendant cycles and moves that push any descendant beyond **16 regional levels**. The existing **64-map limit**, including archived maps, is unchanged. The SQL validators use fresh snapshots after acquiring that lock, following PostgreSQL's [VOLATILE function semantics](https://www.postgresql.org/docs/18/xfunc-volatility.html).

Archived organizing parents remain visible grouping placeholders with retained children. Active children still open through their original source World and can be explicitly moved to another available parent or the World root. Archived/unavailable parents are excluded from new choices. Cross-World, different independent-source, different-terrain and unauthorized moves are rejected.

Pending Work identifies the departing map, intended destination and individual blockers, then requires Continue to the named destination. Parent choices support explicit recovery, original retry, export and load-saved actions. A successful move followed by an interrupted list refresh retains its exact accepted request for safe retry. A retained outline on the source World also retains the new child intent across reload. Choosing Save & Open for that older outline releases the superseded child intent; returning to the World cannot unexpectedly start it. Cancellation releases that intent deliberately.

## Validation receipts

Large captures, logs, dumps and private numerical copies remain ignored under `artifacts/regions-s45-*`. Receipts are separate; this report does not claim one uninterrupted combined aggregate.

| Check | Evidence and result |
| --- | --- |
| Database upgrade/replay | `regions-s45-database-5/migration-results.json`: fresh 151-entry replay, populated forward upgrade, exact existing columns and exact 0149/0150 ledger hashes. |
| Paired backup/restore | `regions-s45-database-5/database-results.json` and `hierarchy-restored.json`: SQL plus private objects restored; fresh service processes read hierarchy, numerical data and original accepted retries. |
| Hierarchy/security | `regions-s45-database-5/hierarchy-database.json`: distant territories, multiple levels, legacy retries, actual foreign-World IDs, different sources, roles, stale edits, duplicate identities, concurrent service/raw-SQL cycles, immutable audit/head consistency, subtree depth, archived parents and missing schema. |
| Inherited geographic authority | Same owned run executes the complete freeform/regional database checks while Region A is organized under a distant region. Polygon bays, radii/endcaps, disconnected areas, wrapped/extreme coordinates and all geographic layers retain their original restrictions and identities. |
| Visible browser journeys | `regions-s45-browser-15/browser-results.json` and `hierarchy-browser.json`: complete passing combined hierarchy/workspace sequence in installed headed Chrome 134, GPU disabled, zero collected page errors. Native country/state/county/local/Alaska creation; inside paint; direct World/sibling/branch/search/breadcrumb navigation; parent reorganization and reopened saved levels. |
| Workspace/recovery/devices | Same combined receipt plus `hierarchy-recovery-security.json`, `region-save-repair.json`, `workspace-journeys.json`, `workspace-native-inputs.json` and `workspace-keyboard.json`: owner unfinished-area regression, exact removal/drag undo and reload, three simultaneous recovered layers, stale/acknowledged retries, archived/missing schema, retained/superseded destinations, canvas/camera gates, closed panels, expanded mode, desktop/tablet/phone, native touch and keyboard. |
| Actual closed-panel navigation | `regions-s45-navigation-18/closed-panel-map-navigation.json`: actual World/region/sibling switches with both panels closed in standard and expanded desktop/tablet/phone layouts; keyboard remains in the editor after switching. Same final application snapshot. |
| Inherited authoring/appearances | `regions-s45-inherited-17/browser-results.json`, `pass3-results.json`, `six-appearances.json` and `devices-results.json`: all geographic layers, generation/import/late-ack recovery, all 21 tool/precision histories with exact undo/redo, pointer cancellation, stale/conflicting work, role/CSRF checks, actual Chrome restart recovery, native touch, CPU fallback and all six appearances. Zero collected page errors. |
| Root checks | All 2,589 units, production build, standalone TypeScript, Drizzle check and lint without errors pass. One existing unused `LoreFamily` warning remains. Portable raster checks pass two tests; the POSIX-only permission test is correctly skipped on Windows. Logs: `regions-s45-workbench/{units-publication,typescript-final-scripts,lint-final-scripts,drizzle-delivery,raster-delivery}.log`. |
| Matched CPU | All **36 unchanged limits** pass: artwork/labels/engraved in `regions-s45-cpu-2`, regional comparison and complete switching/cache scope in `regions-s45-cpu-3`. Fixed matched 1,200 × 600 Canvas dimensions, same geographic/style/document inputs, installed Chrome 134 and GPU-disabled flags. No threshold increase. |

The read-only baseline has 1,781 independently verified source/assets/configuration files, build `tOUZ718PQhR4XTBOFHRx_`, canonical source SHA-256 `37af0046b8f92206bb9c20eea5cfb3eef0d03c890e9c8e8b97ca9bc1d24f1075`. Each comparison launches that exact accepted application against the same owned data. The following cold application times are examples from the complete nine-limit receipts; they are not a rendering-quality claim.

| Suite | Baseline → candidate cold readiness | Candidate input during climate / unchanged cap | Gates |
| --- | --- | --- | --- |
| Artwork | 2,955.4 → 2,838.1 ms | 17.3 / 100 ms | 9/9 |
| Labels | 2,666.8 → 2,466.0 ms | 17.5 / 100 ms | 9/9 |
| Engraved | 2,737.8 → 2,492.1 ms | 20.3 / 100 ms | 9/9 |
| Regional | 2,665.4 → 3,026.5 ms | 18.6 / 100 ms | 9/9 |

The regional cold increase remains inside the original 3,500 ms gate. Parent World pixels remain exact where asserted. The unchanged artwork/label stress budgets also pass; bitmap/cache byte counts are estimates, not process RSS. Additional regional switching passes at 1,850 ms first open, 3,583 ms maximum World/region round trip, 206 ms for ten keyboard pans and 2,166 ms reopen, with accepted numerical-grid reuse and exact geographic documents. `regions-s45-workbench/cpu-summary.json` indexes these separate receipts.

Earlier failed/interrupted development receipts remain retained, including database harness startup/restore-format corrections, the initial theme/FK-count assertions and browser iterations. The touch continuation initially stalled on inherited Windows subprocess pipes; its successful functional continuation still exposed React hydration errors and was not accepted as a passing aggregate. The loading browser now uses the loaded document rather than a server/client-dependent URL selection, correcting the [server/client markup mismatch](https://react.dev/errors/418). Complete later combined browser runs include a clean error audit. Inherited attempt 16 omitted its required database seed phase; attempt 17 uses its original database-plus-browser driver and passes. CPU attempt 1 lacked retained empty PostgreSQL runtime directories; attempt 2 passed all comparison gates but its later switching check still expected the old map-name heading. The affected regional scope passes in attempt 3 using the visible Current Map control. No gate or failed receipt was hidden or relaxed, and no uninterrupted combined aggregate is claimed.

Source verification preserves 9,961 original Git blobs, all 108 original public assets, all 300 historical SQL/snapshot files and all 150 old journal entries through 0149. Numerical stroke, snapshot, save, undo/redo and recovery functions retain their accepted bodies. Original renderers, numeric/geographic engines, assets, the accepted build-memory correction and gameplay sources remain preserved. The additive schema's two User-attribution foreign keys are classified as account-deletion blockers; the exact closure is now 136 FKs.

## Boundaries and owner review

This is a single organizing parent within one original World source, bounded to 16 levels and 64 maps. Multiple simultaneous parents, cross-World/source transfers and later Town/City/interior hierarchy are outside this pass. Geographic containment still governs the child's editing boundary, rather than organizational ancestry. Original histories and immutable storage continue to grow; no cleanup or GC was introduced.

Technical browser evidence is separate from owner usability/artistic acceptance and physical-device certification. The computer-use bridge could not initialize in this session; installed headed Chrome journeys and directly inspected captures provide the technical walkthrough.

Owner review: open a World, paint Sand then Rock and Woodland; create a country, Utah, county and local region; create Alaska with Draw Elsewhere on World; save/open it, paint inside and return; switch directly between branches with panels closed and in expanded mode; resolve a retained draft and continue to its named destination. Repeat on the owner's physical phone/tablet.

No shared DEV/Production access or migration, deployment, owner-service restart, destructive cleanup, renderer/geographic-engine replacement or Stage 5A work occurred. Migration 0150 has only been exercised in owned disposable targets. Shared targets need their normal forward migration sequence through 0150 under separate target authorization; their current ledgers were not inspected by this pass. Stop after Pass 5.

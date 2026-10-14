# Geo C1: worldwide physical vectors and city sources

Approved parent: `1a3793877094eed31d0fdf53004ad5fdbc608b3a`. Release: the local commit containing this report; its full SHA is supplied in the completion handoff. The owner approved the [C1/C2/C3 division](../architecture/worlds-geo-c-scope-proposal.md) and authorized C1 first. This is the complete C1 increment, ready for Ember's independent technical review and the owner's visual acceptance. Full Geo C remains incomplete: C2 elevation/relief and C3 classified land cover are outstanding. No push, deployment, Production change, shared-service restart or Geo D work was performed.

## Delivered behavior

The existing DEV Earth now has real worldwide rivers, lake centerlines, canals, lakes/reservoirs, named mountain and landscape regions, peak/spot-height locations, marine names and populated places. Independent thematic controls and readable ranked labels add information to the preserved coastline foundation. Source readers retain original coordinates, classifications, available aliases, provider context, file hashes and immutable revisions. The original Earth map name/artwork and all prior identities remain unchanged.

Nine generic themes work with existing semantics and coordinate surfaces, including authored planar and angular fictional Worlds. Cities/capitals use existing settlement geography context; stations and historic sites remain places. These imports create no gameplay Towns, Shops, NPCs, founding dates, political allegiances or historical control events. Source country codes/names remain explicit provider context; uncertain country parents remain unassigned. Verified river-number/name groups deliberately share a place while retaining every separate source row and geometry.

Theme filtering occurs on the server after established protection/context checks. Both ordinary URL conventions retain filtered geometry, labels and readers, with mutations rejected and authoring controls absent. Administrator review stays read-only. Request-associated results prevent protected information from a previous mode appearing during delayed requests, failed requests or retry. Existing Atlas editing, year context, history, Realm links, exact readers, source archive/revision and unsaved-draft protection remain functional.

Source validation now handles valid tiny distant-coordinate triangles and wrapped holes without rewriting native arrays. Water components within holes may touch hole boundaries without falsely overlapping filled land. The lake source explicitly retains consecutive coincident vertices in its originals while validating a normalized copy. Default author validation still rejects them; crossings, retraced edges, zero-area rings and overlapping components remain rejected. Every approved Geo B original still validates.

## Sources and coverage

Provider: [Natural Earth](https://www.naturalearthdata.com/downloads/), [public domain](https://www.naturalearthdata.com/about/terms-of-use/), EPSG:4326 horizontal coordinates. The [pinned manifest](../../data/geography/natural-earth-physical-sources.json) gives all seven exact URLs, downloaded VERSION editions, ZIP byte sizes and full SHA-256 checksums. Total archive transfer was **10,546,989 bytes**. Existing dependencies and the original cartography renderer are preserved; no paid API, permanent remote tiles or GPU is required.

| Source, all 1:10m | Edition | Native rows | Saved rows | Parts | Coordinates |
| --- | --- | ---: | ---: | ---: | ---: |
| Rivers and lake centerlines | 5.0.0 | 1,473 | 1,473 | 2,269 | 257,645 |
| Lakes and reservoirs | 5.0.0 | 1,355 | 1,355 | 1,366 | 162,852 |
| Landscape region polygons | 5.0.0 | 1,047 | 1,046 | 2,435 | 192,265 |
| Named physical locations | 5.0.0 | 235 | 235 | 235 | 235 |
| Peaks and elevation points | 5.0.0 | 711 | 711 | 711 | 711 |
| Marine regions | 5.1.0 | 306 | 306 | 346 | 58,666 |
| Populated places | 5.1.2 | 7,342 | 7,342 | 7,342 | 7,342 |
| Total | | 12,469 | 12,468 | 14,704 | 679,716 |

The [committed coverage receipt](../reports/worlds-geo-c1-coverage.json) compares every retained source row, coordinate, complete component, geometry hash and decoded attribute hash. Missing/duplicate identities are empty. One **Null Island**, provider ID `1159104605`, native row `1041`, classified `Dragons-be-here`, is deliberately omitted as fictional Earth content. Its five coordinates, original archive and omission hash/reason are retained in preparation evidence. The omission's provider-ID audit field was corrected before DEV application; every one of the 455 batch files remained byte-identical, and the corrected plan passed a full no-op replay.

DEV gained **12,468 source features and 12,217 stable World places**. There are 1,135 positively identified river groups; 251 additional native river/centerline rows share their group's place. Unnamed/unidentified rows keep separate identities. Native city coordinates, names and aliases remain authoritative. The Himalayas, Ganges, Everest, Delhi, lakes, polar marine holes and antimeridian cases were checked against original sources. The complete prior Geo B inventory remains exact, including its 258 country/territory identities and original samples. All seven new sources belong to the existing Earth rather than separate thematic Worlds.

## Preservation, backup and import

Verified target: loopback `serrian_tide_dev:5432`. Earth remains World `981b883d-17a1-4603-b003-1053968e4f6c`, map `dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c`, WGS 84 surface `964f24cd-7a7b-45dd-9d0e-c37fce26149a` and Primary timeline `f364f134-8f75-423b-be5c-bdd9a5da3a41`. Glass Sea remains unchanged. All pre-existing rows across **316 public tables** were preserved, including maps, source manifests, versions, heads, historical records and users. No new DEV World or gameplay record was created.

All **130** ledger entries still match committed migrations through **0129**. No migration, schema, root dependency or configuration change was required. The 132 approved migration/snapshot/original-sample file hashes remain unchanged, along with previous geographic manifests and committed Geo B evidence. The existing User dependency plan remains **114 foreign keys: 107 block and seven cleanup**; no new User FK was introduced. A read-only comparison against every actual DEV User FK also matched, accounting for PostgreSQL identifier-name truncation.

Final pre-import full backup: ignored `artifacts/guidance/geo-c/dev-before-c1-with-auth-session-1791944960854.dump`, **51,909,266 bytes**, SHA-256 **`45a64cd7389f97e85961fc7d247573980c8a7c3076fa9596b625020299d4d0fc`**. It was restored exactly, including all tables and the ledger. Owner sign-ins added authentication sessions during validation; strict gates stopped before writing, all non-authentication content was proven unchanged, and fresh backups/restores incorporated those additions without discarding completed rehearsal data. The original backups/receipts remain retained.

The checksum-frozen final plan is **`31bd77d3c901ab3848dd5914c262018c669dcc1ebe73db80cfb3a4786add3764`**. Preparation is deterministic and database-free. Imports use 455 bounded atomic batches, exact target/owner/surface checks and saved coordinate/attribute comparison. An interruption after five committed batches resumed successfully. Staged conflicting records rolled back atomically. Full replay created zero records and preserved authored heads. The populated disposable import also passed a full exact backup/restore: **81,707,987 bytes**, SHA-256 **`252ffdac726ed74c56f27b183dc5596fa76b29b3fd873c558f22ad99f195cc6e`**.

DEV application was gated on matching build/test fingerprints, full backup/rehearsal, exact coverage and recovery proof. Its complete second replay made no changes. Read-only post-validation confirmed all new and prior source inventories, preserved rows, no new Worlds and author Atlas editing availability. Disposable fixtures, sessions and authored test changes remained in owned test databases. Original Geo A/Phase 6 evidence was cloned, and its original database/receipts were unchanged.

## Newly executed checks

| Check | Result |
| --- | --- |
| Full Node 22 unit validation | 2,134 tests passed, 251 feature files; zero failures/skips |
| Focused geographic/theme unit tests | 38 passed, including strict retention safety and multipart label placement |
| TypeScript | Passed, including production-build type validation |
| Changed-file ESLint | Passed with zero warnings/errors |
| Complete ESLint | Passed; one pre-existing unused `LoreFamily` warning in `worlds-stories-checks.ts` |
| C1/Geo B source and privacy services | 12 groups passed |
| C1 production desktop/touch browser | 12 groups passed; no application/React/hydration errors |
| Affected Geo A/Phase 6 services | 12 groups passed |
| Legacy Atlas/Geo A browser | 15 groups passed |
| Every approved Geo B source geometry | 2,863 retain valid decisions |
| Fully populated Earth Atlas editor | Opens on desktop and touch phone; saved map unchanged |
| Drizzle consistency and unchanged DEV ledger | Passed |
| Isolated optimized production build | Passed, normal Turbopack, locked private dependency checkout |
| Interrupted import, atomic failures, full no-op retries and full restores | Passed |
| DEV preservation and exact source post-check | Passed |

Relevant legacy groups cover four-period settlements, territories, connections, linked-map/Realm/year context, ordinary lore/History/place readers, exact original sources, acknowledged/failed saves, archive/recovery, source drafts and existing Atlas edits. Fictional fixtures cover rivers, water, ranges, authored peaks and settlements on planar and authored-angular surfaces. No comprehensive Phase 9 suite was run.

Visual inspection found and fixed a C1 application issue: multipart labels could prefer a remote small component; largest projected area/line length now wins equal-ranked component ties, with conservative text bounds. This changed derived presentation only. Affected label/privacy/touch/screenshot checks were refreshed. Harness issues were handled separately: ambiguous retained fixture names were scoped by source ID, collision suppression was handled with a focused visible-label precondition, an `about:blank` resume path was corrected, and changed test-tool fingerprints required refreshed build evidence. None was counted as an application failure or bypassed assertion. Read-only validation now tolerates only added concurrent authentication sessions, with every prior session retained and all content/users exact; DEV apply and full-retry gates keep their stricter full-snapshot comparisons.

## Runtime measurements and limits

Geographic tables plus shared places occupy **232,349,696 bytes**, approximately **221.6 MiB**, including indexes/TOAST. C1 adds **103,415,808 bytes**, approximately **98.6 MiB**, within the approved 256 MiB target. Total DEV database size at the post-check was **275,625,663 bytes**. Raw archives and preparation files are recovery inputs, outside hosted map payloads.

The ordinary global view uses 42 progressive bounded pages, 2,661 components and 1,000 source identities: **3,313,943 JSON bytes / 4,472 ms** in the read-only DEV post-check. Every page stays within 64 components and 500,000 path characters. The final disposable production browser loaded the complete progressive view in **5,679 ms desktop / 6,830 ms touch phone at 6× CPU throttling**. JavaScript heaps were approximately **21.7 / 16.9 MiB**. Each recorded 44 geographic requests and **3,327,278 transfer bytes**. Full measurements are in the coverage receipt and ignored artifacts. Transfer is approximately 3.3 MB (about 3.2 MiB), slightly above the proposed 3 MiB combined-view target; coverage and operating storage budgets were preserved. Local emulation is not an Internet-hosting or physical-device acceptance claim.

The existing Earth Atlas author bundle contains 14,661 places and **4,117,308 JSON bytes**, delivered in **235 ms** at the read-only post-check. Its editor opened in approximately **2.76 seconds desktop / 2.18 seconds touch phone**, with no horizontal overflow or map mutation. This larger source/place inventory is a documented cost; more granular country/region/city browsing remains Geo D rather than an unrelated Atlas redesign.

Natural Earth remains generalized geography. [Physical-region extents](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-physical-labels/) are roughly 1:50m, although their feature density is 1:10m. Marine naming regions retain older source interpretations. [Populated places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) favor regional significance and include provider estimates, not a current census or every settlement. Labels are ranked/collision-bounded; detail mode retains all imported rows. Search covers visible loaded sources, while exact readers preserve their full coordinates/attributes.

## Review and controlled release

Two actual screenshots are committed: [global physical vectors](../screenshots/worlds-geo-c/global-physical-vectors.png) and [Himalayas/Ganges/cities](../screenshots/worlds-geo-c/himalayas-ganges-cities.png). [Capture metadata](../screenshots/worlds-geo-c/README.md) gives exact extents, projection, detail, editions and layers for independent source comparison. Technical automated/visual checks passed; Ember's independent review and owner visual acceptance remain pending.

Changed files comprise the geographic model, geometry/projection/theme helpers, service, workspace/CSS and API; focused theme tests; pinned source manifest; deterministic preparation and guarded import/rehearsal/regression tooling; architecture/scope/operational reports, coverage receipt, AGENTS handoff and screenshots. No unrelated Worlds creator, lore, History, historical-map, cartography renderer, migration, schema or account policy file was changed.

No new migration or configuration is pending. An authorized release should verify this exact commit and the target's existing ledger, protect the target backup, stage the normal production build and run owner/ordinary/review smoke checks before activation. This pass supplies a complete CPU-hostable application increment; geographic content transfer to Production requires separate authorization and target-specific preservation/rehearsal. No command here deploys or transfers DEV content to Production.

Prefer a reviewed forward correction. An older application may not understand C1 theme/style descriptors or preserve new metadata through its writers; keep compatible readers/writers during recovery. Reverting Git does not remove imported rows or reverse the ledger. If database restoration is needed, pause writers, retain intervening work, restore the protected full backup into the verified target and reconcile later changes. Do not delete source rows or historical records to imitate rollback. C1 stops here at a local review commit; C2/C3 and Geo D require subsequent direction.

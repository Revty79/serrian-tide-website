# Stage 3 Pass 4 evidence

The [delivery report](../../operations/worlds-environment-s34-delivery.md) explains the model, controls, migration, performance and limitations. All shown Worlds are owned disposable fixtures. These captures do not prove parity with the owner's server, physical-device certification or owner artistic approval.

Starting application: `9fe55788c16a80c72ff9f2e159fc2d6e17527d87`. Final application and executable tests: `f68c72013ff5c1c1c4dbe8889ec89f1c58b22df6`. Later commits contain documentation/evidence only. The final [validation receipt](validation.json), source verification and file manifest bind exact production builds, source bytes, scripts, checks and rendered evidence.

Directory-local Git attributes preserve the evidence bytes across platform line-ending conversion. The [file manifest](files.json) excludes itself.

## Final run

`full-3/` is the fresh unfiltered production/database/browser run. It includes all inherited numerical, material, hydrology and Worlds journeys, plus environmental authoring, cooperation with terrain/water, recovery, conflicts, history, devices, security, missing migration, performance and completed visual coverage. Application source and executable scripts remain frozen during this run. Read its results rather than inferring success from intermediate folders.

| Evidence | Purpose |
| --- | --- |
| [run-build.json](full-3/run-build.json), [source-verification.json](full-3/source-verification.json) | Exact build, compiled-source fingerprint, original implementation/assets, all historical migrations and byte-exact scripts |
| [results.json](full-3/results.json) | Full inherited chain, Worlds and exact existing gameplay preservation |
| [environment-database.json](full-3/environment-database.json), [environment-migration.json](full-3/environment-migration.json) | Independent environment history/retries/concurrency, 0142 upgrade, all-version backup restore and real restored-service reads |
| [environment-browser.json](full-3/environment-browser.json), [environment-workflows.json](full-3/environment-workflows.json) | Actual preview/accept/save/reopen, paint, polygon controls, local downscaling, erase, interrupted save, conflicts and exact history |
| [environment-cooperation.json](full-3/environment-cooperation.json) | Actual terrain autosave/undo and water editing retain the pending environment and protected geometry |
| [environment-devices.json](full-3/environment-devices.json) | CDP native 390 px touch / 820 px pen, safe two-finger navigation, paint, polygons and cleanup |
| [environment-security.json](full-3/environment-security.json), [environment-prerequisite.json](full-3/environment-prerequisite.json) | HTTP/privacy/CSRF/body limit, explicit read-only Admin GUI and actual pre-0142 production app |
| [environment-performance.json](full-3/environment-performance.json) | GPU-disabled World/regional/close readiness, input, worker/cache estimates and main-thread fallback |
| [environment-visuals.json](full-3/environment-visuals.json) | Completed captures, settings, camera, pending-layer state and explicit authored-gallery provenance |
| [completed-visual-review.json](full-3/completed-visual-review.json) | Personally inspected final views and byte-identical comparisons with the reviewed canopy/desert/tundra/conifer correction images |

## Actual artwork

Capture readiness requires a new sequence of eight consecutive ready frames, including the environmental layer. Gallery camera changes wait for their requested scale; performance wheel input is explicitly returned onto the canvas after cursor-free screenshots. Captures are actual application views, not mockups.

| View | Screenshots |
| --- | --- |
| Published original 3C build, unchanged 754 channels / two lakes | [Realistic](before-3c/reviewed-matched-realistic-terrain.png), [Illustrated](before-3c/reviewed-matched-illustrated-fantasy.png) |
| Pass 4, same original terrain/water/camera | [Realistic](full-3/matched-after-realistic-terrain.png), [Illustrated](full-3/matched-after-illustrated-fantasy.png), [Topographic](full-3/matched-after-topographic.png), [Relief](full-3/matched-after-physical-relief.png), [Elevation](full-3/matched-after-classic-elevation.png) |
| Broad environmental models | [Mixed](full-3/climate-mixed-world.png), [Humid tropical](full-3/climate-tropical-world.png), [Temperate](full-3/climate-temperate-world.png), [Arid](full-3/climate-arid-world.png), [Polar](full-3/climate-polar-world.png), [Exotic](full-3/climate-exotic-world.png) |
| Windward/leeward mountains, same terrain | [Temperate realistic](full-3/climate-temperate-windward-mountains-regional.png), [Illustrated](full-3/climate-temperate-windward-mountains-illustrated.png) |
| Creator rainforest | [Regional](full-3/authored-rainforest-regional.png), [Close canopy](full-3/authored-rainforest-close.png), [Close illustrated](full-3/authored-rainforest-close-illustrated.png) |
| Creator temperate and boreal forest | [Deciduous](full-3/authored-deciduous-close.png), [Boreal](full-3/authored-boreal-close.png), [Conifer illustration](full-3/authored-boreal-close-illustrated.png) |
| Creator open cover | [Meadow/woodland transition](full-3/authored-meadow-woodland-transition.png), [Savanna](full-3/authored-savanna-regional.png), [Scrub](full-3/authored-scrub-regional.png), [Steppe](full-3/authored-steppe-regional.png) |
| Creator arid and cold cover | [Hot desert](full-3/authored-hotDesert-close.png), [Cold desert](full-3/authored-coldDesert-regional.png), [Tundra](full-3/authored-tundra-close.png), [Alpine](full-3/authored-alpine-regional.png), [Ice](full-3/authored-ice-regional.png) |
| Actual accepted water/wetland fixture | [Realistic](full-3/accepted-water-and-wetland-environment.png), [Illustrated](full-3/accepted-water-and-wetland-illustrated.png) |
| Confirmed marsh, closer geographic view | [Regional marsh and environment](full-3/accepted-marsh-environment-regional.png) |
| Creator edits and historical recovery | [Selected-region refinement](full-3/creator-selected-region-downscale.png), [Restored accepted environment](full-3/creator-history-restored.png) |
| Devices / prerequisite | [390 px touch](full-3/environment-390-native.png), [820 px pen](full-3/environment-820-native.png), [Migration notice](full-3/environment-migration-required.png) |

Matched numerical grid SHA-256: `a26a70236bfe8a6991dfb8f42c7e1416f6da58a14e4e81e10a14e5e9e8e4ab77`; historical water geometry SHA-256: `c5ef135f7d15400e04308bda34a7af8da5c9db047ceed007478cc6d67f9a9930`. Matched Pass 4 uses explicit predominantly temperate settings recorded in the receipt. The original water revision is loaded only as an unsaved display draft; the accepted water head remains unchanged. No more favorable numerical terrain is substituted.

The larger 2,000 by 1,400 km environmental fixture is separate coverage evidence. The 15 `authored-*` biome examples are deliberately creator-painted classifications on the same terrain; they are not presented as 15 independent atmospheric predictions. They demonstrate supported authoring/artwork. Modeled preset examples and the accepted water/wetland fixture are recorded separately. Repeated horizontal geography is a wrapped World copy.

## Iterations and limitations

`before-3c/` is the preserved published 3C build and independent baseline sample. `database-1/` and `focused-1/` are early validation. `focused-2/` retains a test copier's timestamp failure. `focused-3/` is explicitly invalid as current source/build evidence: after that failure, a prototype resume helper reused the older focused-1 build against newer copied files. Its raw results remain diagnostic only. The final runner checks a compiled-source fingerprint and forces a fresh build.

`focused-4/` is a rebuilt earlier artwork iteration. Its close/zoom performance numbers are invalid because the old readiness helper could read a previous camera frame; they are not final benchmarks. `focused-5/` retains the stronger test correctly timing out when cursor-free capture left wheel input outside the map. The driver correction moves input back and waits for each changed camera. Timestamp transfer, lifecycle FK count, early type/lint/test corrections and artwork iterations are recorded in the validation receipt. No failed assertion was waived.

`full-1/` preserves the frozen `0276320` implementation and byte-exact source verification. Its aggregate run failed at gallery cleanup: after the deliberate terrain-edit cooperation case, cleanup submitted an older field as a new proposal and received the correct stale-source 409. The corrected gallery uses explicit exact historical restoration. That run also exposed downward-pointing illustrated conifers and weak desert contrast during personal inspection. Layered upright conifers, varied sand/dune and cold-ground treatment were corrected, with two visual regression tests. `focused-6/` is explicitly a five-family/two-preset correction subset, plus matched original views, confirmed wetlands and corrected performance; its inherited console message does not make it full 15-family coverage. The final `full-3/` retains the complete unfiltered canonical gallery and regression chain.

Technical delivery and artistic acceptance remain separate. Artwork illustrates broad coverage and improves detail without creating measured trees or new terrain. The heuristic climate, coarse sampling, procedural appearance, finite budgets and memory estimates retain explicit limits in the delivery report. Owner artistic quality remains unaccepted; Stage 3 Pass 5 is not started.

The complete `full-2/` run passes at `7febafa`; its original source verification is retained. A subsequent resource probe found unbounded repeated display entries at extreme zoom-out. `full-2/far-zoom-planning-probe.json` records that allocation without rendering or data changes; [planning-after.json](planning-after.json) records the bounded correction at the final checkpoint. `focused-7/` verifies the corrected real production canvas, fallback, far zoom and fit restoration. The final `full-3/` reruns the entire unfiltered chain with the bound in place.

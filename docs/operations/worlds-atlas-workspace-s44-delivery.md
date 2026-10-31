# Atlas Stage 4 Pass 4 — map-centered workspace

Technically verified on 2026-10-31. Starting application: `ec33f121e9275e3b900fe941eb753f89da6ffaa9`. This pass continues the accepted freeform-region correction; it does not replace its geographic engines.

## Result and workflow

The map has a stable header, independently collapsible tool and options panels, and a compact status area. Long controls scroll within their panel. Changing a tool does not move the map below the controls or recreate its camera/history. Standard and expanded views use the same controls. Tablet panels overlay the canvas and collapse independently; phone drawers open one at a time, with explicit touch authoring and a visual-viewport keyboard dock.

**Create New Region** stays in the header, separate from Maps / Choose Existing Region. Creation immediately presents Rectangle, Freehand, and Point-by-Point. From an existing region it returns to the parent World with the creation intent retained. Unsaved work is resolved first. Regions remain linked to their original World; opening one does not create additional elevation samples.

Boundary handles can be clicked or tapped and dragged directly. They use CSS-pixel hit targets, canonical fractional World coordinates, and the existing wrapped/multipart geometry. A completed drag is one boundary-history entry. Boundary Undo/Redo operates on the outline, preserving numerical terrain history. Escape, pointer cancellation, navigation interruptions, and a second touch restore the exact pre-drag proposal. The advanced point selector, insertion, removal, deliberate simplification, and multipart Add Area controls remain available.

**Save Region** is a high-contrast header action. It closes eligible unfinished outlines and prepares their existing validated preview. A prominent **Save & Open Region** card names the region and explains the result. The same card retains the original request for retry. Invalid geometry remains editable with its actual error; accepting still uses the existing immutable server-authorized polygon path. Ordinary contextual saves are in the header too; ground painting and terrain retain their established autosave behavior.

| Tool family | Direct tools and contextual controls |
| --- | --- |
| Sculpt | Raise mountains, Lower / carve valleys, Smooth, Flatten, Sample height, Extend land, Carve a bay, Smooth shoreline; existing brush precision, size, strength, coastal options and landforms |
| Paint | Ground Materials, Vegetation, Biomes; immediate registry-backed material/type choices, brush size/strength and plant coverage; selected paint and its effect explained above the controls |
| Water | River, lake, connected-network and special-feature authoring; existing proposals, drawing, saves and history |
| Regions | Create Region, Choose Existing Region; three boundary methods, Finish Area, Undo Point, Move Points on Map, Add Area, Cancel and save review |
| Places | Towns & settlements, Artwork, Labels & map layout; existing permanent identities, libraries and independent layout persistence |
| Inspect / Navigate | Pan, Inspect, Measure, units/grid and numerical refinement tools |

The current tool and brush controls appear beside the map. Short explanations distinguish ground appearance, vegetation, broader biomes, height sculpting, linked regions, numerical refinement and map appearance. Optional Mapmaking ideas explains a possible creative sequence without imposing a wizard. Advanced histories and configuration remain under All map options, rather than being required to change a paint material.

## Pending work and navigation

Previously, a region change could report multiple drafts without taking the creator to the corresponding recovery actions. The new Pending Work panel lists each real blocker separately, with its reason and applicable review, recover, save, retry, export, load-saved or cancel actions. Review opens the actual layer controls and focuses the recovery action. Destructive discard/load-saved paths explicitly describe the unsaved work that would be lost and require confirmation.

The requested map or creation destination stays visible while each blocker is resolved. Completing a recovery does not unexpectedly navigate away: Continue is explicit. A region's own outline does not block its save review, while other unsaved layers do. The canvas remains visible during resolution.

## Verification and evidence

All large evidence is ignored under `artifacts/regions-s44-*`. These are separate receipts, not one uninterrupted aggregate. Browser checks use installed Chrome 134 with GPU disabled; the usability journeys use a visible browser, public control labels and native pointer/touch input. State attributes and API comparisons verify results after interaction, rather than locating hidden tools.

| Scope | Result / local receipt |
| --- | --- |
| Exact starting production baseline | `regions-s44-baseline-3`: eight standard/expanded captures before implementation, original source/build verified |
| Required A–E usability journey | `regions-s44-release-24`: ten viewport/mode combinations; Sand → Rock, woodland save, grassland choice, direct sculpt tools, exact numerical undo/redo, irregular freehand region, direct handle drag/undo/reload recovery, Save Region → Save & Open Region, inside paint and return |
| Three simultaneous recovered drafts | Same release: valid Environment, Artwork and Labels drafts; individual review/recovery/save; exact accepted layers; retained Region A destination and explicit Continue; map visible throughout |
| Native phone inputs | Same release: DPR 2 touch ground painting, freehand drawing, handle dragging, exact undo and second-touch rollback, save/open/return; focused brush controls above an emulated keyboard |
| Keyboard and existing-region creation | Same final release: close-panel focus return, Enter reopening, expanded focus wrap, canvas arrow navigation, Escape closing options then expanded view; Create New Region returns from Region A to the World and immediately exposes Freehand and Point-by-Point |
| Inherited native suite | `regions-s44-native-25`: all 21 sculpt tool/precision combinations, exact numerical undo/redo and cancellation; ground/vegetation/artwork/labels/water/Town authoring; multi-tab 409 and lost-response recovery; owner/Admin-review/Player/foreign-owner/CSRF boundaries; actual Chrome restart; 24 six-appearance World/region fit/extreme captures; phone DPR 2 touch/fallback safeguards |
| Geometry, authorization and recovery | `regions-s44-database-12`: full freeform/regional database checks, fresh 150-migration replay, populated upgrade, backup and paired restored-service reads; immutable footprints, false bounding-box attacks in all geographic layers, wrapped/multipart/million-km fractional cases, exact retries, stale requests, roles and permanent Town identity |
| Generation/import continuation | `regions-s44-native-18/pass3-results.json`: all six numerical presets, 1024² preview/cancellation, exact save/reopen, lost acknowledgement recovery, protected selected-area regeneration, exact undo/redo, real 16-bit import and disposable service restart, phone/tablet workflow |
| Units | 2,584 / 2,584 across 318 feature files, `regions-s44-workbench/units-acceptance.log` |
| Build and TypeScript | Production build and root typecheck pass; final build identity recorded with the browser receipts |
| Lint | Zero errors across 2,187 files; one pre-existing unused LoreFamily warning at `scripts/worlds-stories-checks.ts:6`. Subsequent changed-file checks also pass |
| Storage deployment and ledger | Portable raster checks: two pass, POSIX-only permission check skipped on Windows. Drizzle check passes with a credential-free local config; no shared database was contacted |

All four matched CPU suites pass in `regions-s44-cpu-29`: 36 unchanged timing limits, exact worker/fallback pixels, exact accepted World pixels, bounded caches and regional switching/reopening. Paired timing journeys use the same 1200×600 canvas on both builds; the artwork/label stress checks exercise the actual workspace. Final production build: `E55vEcteC-8B-huB4Vozg`; full application snapshot SHA-256: `6fb35d92b6202ebe742bebdb85b17d7eaff16ef86e1e8a5e582152a3d0482a51`. The inherited runner separately verifies runtime-subset SHA-256 `ed1e19d7f0e4ed6f3c28582ae04cb9056e11ae43bde751bb5a2f6399d73f0596`; these hashes have different manifests. Accepted baseline build `4Rp65H4Xs4itAS7qe2g3R` remains read-only, with 1,778 normalized Git runtime blobs verified against ec33.

| CPU suite | Unchanged limits | Cold readiness, baseline → current (ms) | Close readiness, baseline → current (ms) | Input during climate (ms) |
| --- | --- | --- | --- | --- |
| Artwork | 9 / 9 | 2662 → 2627 | 3232 → 3230 | 17.6 / 100 |
| Labels | 9 / 9 | 2928 → 2537 | 3176 → 3186 | 18.1 / 100 |
| Engraved | 9 / 9 | 2694 → 2465 | 1987 → 2064 | 18.9 / 100 |
| Regions | 9 / 9 | 2609 → 2496 | 2121 → 2053 | 22.1 / 100 |

The 1,024-placement artwork stress uses 1.87 MB of bitmap estimates, reuses preparations, and completes 20 navigation keys in 941 ms (limit 1,500); its maximum draw batch is 66.6 ms (limit 100). The 512-label collision stress completes 20 keys in 592 ms, with maximum plan/draw times 50.5/54.2 ms. An earlier unchanged-source run (`regions-s44-cpu-28`) passed all nine artwork timing limits but failed the separate draw-batch cap at 106.3 ms. Its failed receipt remains retained. The identical repeat passes without code or threshold changes; timing variation is not hidden. Startup attempts 26/27 also remain retained: the old owned fixture lacked empty PostgreSQL runtime directories, recreated from a fresh PostgreSQL 18 layout without copying database files.

The generation/import receipt uses the preceding UI snapshot `7a87ef41dd4a172dc13e9b54ac7c2107f650a67c0350a38587e51fc6947b38c5`; the final corrections add the chooser accessible label and region-creation handoff. Generator, numerical operation, save/recovery and server code remain exact. Final usability/native/CPU coverage uses the frozen final application above.

The original 500 CSS-pixel desktop canvas minimum and half-viewport phone minimum are preserved. At 1440×1000, the original standard canvas began at y=951 and extended below the screen; the workspace correction begins at y=222 with both panels open, with approximately 742×730 drawing space. At 1366×768, the original began at y=835; the corrected canvas begins at y=222 and retains 500 pixels of height. Collapsing panels increases drawing width, retaining the geographic view center and scale exactly. Expanded mode uses the full viewport. These are layout improvements, not claims of increased geographic resolution or artistic detail.

Preservation checks verify 9,924 protected Git blobs against the starting checkpoint. All 300 historical SQL/snapshot files and all 150 journal entries through 0149 remain frozen. Database/server code, original assets, numerical algorithms, six appearance painters and gameplay are unchanged. Exact AST comparisons retain the editor's numerical stroke, save, history, sea-level, recovery, source-selection and operation functions. Canvas changes are boundary handles, hit testing and gesture routing.

Failed and invalid intermediate runs remain retained: baseline startup/dependency setup failures; an early missing test-helper copy; old public-control selectors; invalid recovery fixture seeds; the caught stale outline-preview candidate; strict page-scroll failures corrected by sizing from the visible workspace top; a test-run TypeScript error; an incomplete native run without the crossing-river database prerequisite; the map chooser's missing explicit accessible label; and a real creation handoff bug that opened the parent World without selecting its boundary tools. The latter now explicitly selects the region controls. Native run 19 was invalidated by a concurrent rebuild of its checkout; serialized fresh run 25 supersedes it. Run 23 caught an assertion racing the post-save React render; the final test waits for the actual blocker row to disappear and retains the exact zero-blocker assertion. None is silently counted as a complete passing aggregate.

## Boundaries and owner review

**No new migration is required for Pass 4.** Existing `0149_world_region_footprints` remains required for freeform regions. Its canonical LF SHA-256 remains `3189137162e96c0827da7b51da652909706af13a23c2ee578c4fb09885ecf3e2`. Shared DEV/Production application status was not inspected or changed. No deployment, shared writes/migrations, owner-service restart, cleanup/GC, new renderer, Studio, Town Map Builder, export/printing or Stage 5A occurred.

Technical browser evidence is separate from owner usability/artistic acceptance and physical-device certification. Phone keyboard behavior is visual-viewport emulation, not an actual operating-system keyboard test. Tablet drawers can cover part of the map; Tools and Options collapse independently. Advanced configuration remains substantial because the underlying accepted capabilities are retained.

Owner acceptance steps:

1. Open a World, select Paint, choose Sand, paint, change to Rock, then choose Vegetation and Woodland. Confirm the active paint and brush controls explain what will happen.
2. Click Create New Region, choose Freehand, draw an irregular boundary and drag several handles on the map. Use Undo/Redo and verify only the outline changes.
3. Click Save Region, review the highlighted outline and named Save & Open Region card, then save. Paint inside the new region and use Back to World.
4. From inside any region, find Create New Region again. Verify the return to its parent World is understandable and preserves any work requiring attention.
5. Try the same work in standard/expanded mode and on the owner's tablet/phone. Resolve multiple recovered layers individually and explicitly continue to the retained destination.

Stop after Stage 4 Pass 4. Stage 5A is not authorized by this delivery.

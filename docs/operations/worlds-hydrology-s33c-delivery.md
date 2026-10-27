# Stage 3 Pass 3C - natural waterways and special water features

## Checkpoints and review status

Published starting point: `001efbf0e22c920ba34b206e53db4ea62e00ac22` (Pass 3B). The checkout began clean on main. Implementation checkpoints remain at `f6be5e5`, `b9136b8` and `6170317`; final application and browser checks are frozen at **`23ca9cd4d13e9a4b8fbd56cd43754867a2801f6b`**. Later delivery commits contain evidence and documentation only. The owner's 3C brief authorizes unattended implementation and normal publication to origin/main. It does not authorize deployment, shared database access/application, owner-server restart or Stage 3 Pass 4.

The final unfiltered production/database/browser run passes against build **`kt50pg5mQ9dYRwDecTwbH`**, runtime SHA-256 **`2bdda67bfe2c4e207b9c292e64e677fa0054f399a35f3d102a8fb362fdd67894`** (1,592 byte-exact runtime files) and validation-script SHA-256 `1a24f9f71d61e17960b6de74de663cda23111276c618ea673c3da87cafb47ae8` (549 byte-exact scripts, plus the separately executed verifier). The [evidence index](../screenshots/worlds-atlas-s33c/README.md), [validation receipt](../screenshots/worlds-atlas-s33c/validation.json) and final file manifest bind actual builds, exact source checks, results and earlier failed iterations. No technical blocker remains for this pass's authorized publication; target verification/backups and deployment authorization remain separate.

**NO NEW SQL MIGRATION FOR PASS 3C. Existing migration 0141 is required for saved water.** All 142 historical migrations, SQL schemas, journal and historical snapshots remain unchanged. Version-3 water features use the existing JSONB head and immutable history. Shared DEV and Production were not inspected, migrated or changed; their current migration status remains unverified.

Technical delivery is separate from owner/Ember acceptance. **Terrain artistic quality remains owner-rejected and deferred.** Actual disposable screenshots were inspected, including a correction found through inspection; they do not establish parity with the owner's running localhost app. GPU-disabled installed Chrome and emulated native touch/pen provide technical evidence, not physical-device certification.

## Delivered creator experience

The existing map-first Atlas has a primary **Suggest natural waterways** action and optional sparse/balanced/fine network detail. Original river, lake, outlet, watershed and network tools remain available. Water presentation separately controls major/balanced/all channel display, banks and symbols. Channels can be classified as automatic, river, tributary, stream, creator-defined intermittent, artificial or fictional; physical width overrides remain separate from relative drainage-based symbolic weight. Lakes retain existing condition/level/shoreline/port controls and gain simple tone and soft/crisp shoreline choices.

An optional **Springs, waterfalls & wetlands** section creates and edits named, described, protected geographic features. Springs can link to a deliberate headwater channel; moving a linked spring moves its river source while preserving identity. Removing the spring retains the river. Waterfalls and rapids can be placed/snapped on saved courses, moved, reattached and explicitly described as fictional. Parent edits retain features with review flags; deleting a parent preserves a detached interpretation for review.

Wetlands support manual boundary drawing, corner movement/insertion/removal, classification, river/lake associations, protection, intentional fictional explanations, deletion and undo/redo. Review suggests provisional steep reaches and local potential wet areas using accepted terrain and existing water. Creators accept/reject candidates; suggestions do not autosave or establish climate, groundwater, seasonality or measured discharge. Advanced sampling diagnostics stay collapsed.

Finished operations share the original independent water draft, undo/redo, explicit atomic save, exact retries, stale-write protection, export, browser recovery and immutable history. Original v1/v2 and new v3 histories can be deliberately restored. Terrain autosaves independently while water edits remain pending. Numerical heights, terrain recipes, material strokes, appearances, World identities, Towns/Shops and Campaign/gameplay records remain separate.

## What changed in river selection and artwork

The old solver was mathematically consistent but exposed D8 direction bias on simple slopes. Extraction split channels at global incoming branches even when those branches were below the selected threshold. Many short segments then received similar outlined weight at every zoom. This produced comb-like clutter and dark segment beads.

The new deterministic `terrain-natural-v3` recipe uses the original receivers and contributing physical land areas. It ranks meaningful headwaters through upstream hierarchy, branch length, receiving-channel significance and confluence spacing, then traces retained paths downstream. Only selected incoming branches form new natural-extraction junctions. Sparse/balanced/fine selection is explicit. The original numerical flow body and 3B adaptive mesh are preserved; no accepted height is carved or moved. A uniform artificial slope remains honest and may retain straight courses.

Normal acceptance reuses compatible old courses and identities rather than adding overlapping competing routes. Protected conflicts, partial overlaps and ambiguous interior junctions fail visibly; existing deliberate Join tools or **Replace unprotected derived network** resolve them. Replacement is a creator action. Presentation hiding never deletes accepted records.

Canvas2D now prepares geographic paths with local origins, joins compatible degree-two derived segments for display, rounds only within recorded sampling uncertainty, differentiates relative hierarchy/width and paints restrained banks before water. Authored, protected, feature-anchored and explicitly width-authored geometry remains exact. Simple lake gradients/shoreline treatment, sparse wetland artwork and concise point symbols share one geographic source across all five appearances. Dry/intermittent/potential conditions remain distinct. There are no invented deltas, bathymetry, vegetation or shader dependencies.

Ordinary pan/zoom/appearance changes reuse stable preparations. Exceptionally long geometry uses bounded camera-local reanchoring when required for precision. Wrapped copies paint before point symbols, preventing a later crossing course from covering its endpoint symbol.

## Matched visual evidence

The before/after fixture is the same 64 km winding valley/ridge terrain with two basins: grid SHA-256 `a26a70236bfe8a6991dfb8f42c7e1416f6da58a14e4e81e10a14e5e9e8e4ab77`, accepted v2 geography SHA-256 `c5ef135f7d15400e04308bda34a7af8da5c9db047ceed007478cc6d67f9a9930`. Both matched views retain **754 accepted segments and two lakes**, identical camera, thresholds and appearance settings. Their changes demonstrate rendering/generalization alone. The baseline uses the preserved published 3B production build, not reconstructed old artwork.

Separately, explicit natural replacement on the same terrain retains **26 selected segments and two lakes**. This comparison demonstrates selection changes; the display-only comparison must not be represented as deleting 728 records. Simple synthetic ramps remain in inherited tests for correctness. The fine 4 km cascade/floodplain fixture uses actual 31.25 m samples for feature evidence. Repeated horizontal geography in wrapped World views is the same World copy, not multiple independently generated networks.

Actual completed screenshots cover mountainous/winding networks, main/minor channels, regional and close views, spring continuation, waterfall/rapids, creator wetlands, lake inflows/outlet, all five styles and desktop/390 px touch/820 px pen layouts. Inspection found the wrapped endpoint-symbol occlusion after the earlier focused suite passed; a stronger actual-pixel assertion reproduced it and the final run passes it with 13 dark symbol pixels and 18/18 sampled channel positions at a 32.208 m viewport. Earlier style-switch captures could catch terrain tiles still drawing; supplementary completed captures wait for eight consecutive ready frames and retain the same accepted water without World writes. Overall terrain imagery and D8 angularity still have artistic limits; these images do not claim final visual acceptance.

## Persistence, safety and deployment

The version-1 envelope gains optional `systemVersion: 3`, special features, course classification and presentation/lake artwork. Old v1/v2 reads inject no defaults or historical mutation. Exact old pending request retries return their accepted immutable results even after a v3 head. Fresh lower-format writers are rejected, while exact deliberate historical restoration remains available. Server validation retains geometry/bounds, acyclic graph/ports, source provenance, payload limits, World ownership, explicit read-only Admin review, foreign/Player/anonymous denial and CSRF protections.

Disposable verification includes complete fresh replay, populated 0140-to-0141 upgrade, all three water formats, concurrency, invalid references, restored-service reads after full database backup/restoration, repeated migrations and immutable history. Manual feature provenance covers its whole geographic extent, including interior refinements. Source changes conservatively request review; protected/manual geometry is retained.

Before any separately authorized deployment, verify the intended target and its actual ledger independently, preserve code/config plus database/private numerical-storage backups, and apply only missing historical migrations in order through 0141. No new configuration, SQL, paid service, mandatory server computation, asset provisioning or GPU is introduced. Existing private numerical storage remains required. Do not manufacture ledger rows or rewrite historical SQL.

Older strict applications cannot read v3 water heads. Prefer forward correction or temporary authoring disablement while retaining all JSON/history. A deliberate restoration of an older exact revision through the new service creates a new revision and retains intervening history. Never strip fields, drop tables or delete accepted features to make old code read them. Code rollback alone does not reverse accepted data; target restoration requires a separate verified backup plan and authorization.

## Validation and measured limits

Final checks pass **2,438/2,438 unit tests across 303 files, zero skipped**, root TypeScript, offline Drizzle metadata, production build, the full unfiltered disposable database/browser chain and whole-repository lint (2,005 files; zero errors, one pre-existing unused `LoreFamily` warning). The existing Turbopack dynamic-filesystem warning in unchanged `raster-storage.ts` remains visible. No final browser errors or unexpected legacy map requests remain. Earlier failed checks and their corrections remain recorded rather than overwritten.

The unfiltered suite includes terrain generation/import/sculpting, physical dimensions/measurements, multiresolution/refinement recovery, description, all cartographic styles and Realistic Terrain material authoring, 3A rivers, 3B lakes/outlets/watersheds, new special features, all Worlds creator families, History/calendars/Campaign relationships, lifecycle/privacy, Town/Shop workshops and exact preservation of 133 gameplay/runtime tables. Resource samples use installed Chrome with GPU disabled. Water-paint timings are distinct from full application/terrain readiness. Cache estimates exclude browser/native overhead and are not process RSS; measurements are samples, not hardware guarantees.

GPU-disabled Chrome 134, final-run sample:

| Workload | Numerical cells/samples | Worker calculation | Complete request | Browser action | Retained/working typed arrays |
| --- | ---: | ---: | ---: | ---: | ---: |
| Natural winding-valley selection | 65,536 cells | 250.1 ms | 438.0 ms | 950.1 ms | 15.6 MiB |
| Inherited 3A local river review | 524,301 cells | 1,451.5 ms | 1,761.3 ms | 1,822.8 ms | 78.0 MiB |
| Inherited 3B connected lake review | 330,765 cells | 1,028.6 ms | 1,328.2 ms | 1,392.7 ms | 59.4 MiB |
| Fine special-feature review | 127 route samples | 8.9 ms | Included in browser action | 235.9 ms | Small additional collections; existing drainage separate |

The inherited connected fixture uses the same million-km World/four 20 km 1,024-square refinement pattern and 5 km-squared threshold as the prior 3B benchmark (about 1.9 s). Timing variation does not establish an algorithm speedup. The natural-selection workload is much smaller and must not be compared as a percentage improvement over that benchmark. Fine feature-review preparation retains a separate 16,384-cell drainage result (2.4 MiB); its additional collection readout rounds to 0.0 MiB and does not mean zero total memory.

World/regional/close **water paint** samples are 0.4/0.1/less than 0.1 ms, with a 2.3 ms observed maximum. The two cached preparations retain an estimated **119,072 bytes**, unchanged through ordinary pan/zoom; no new preparation occurs. Whole-application/map cold readiness is 939.7 ms; ten warm navigation keys take 126.9 ms. Regional/close readiness including terrain artwork is 1,074.4/3,907.9 ms. Repeated pan/zoom takes 3,731.3 ms including those broader layers. These are not water-only timings.

Navigation responds in 9.2 ms during natural-network analysis, 12.0 ms during the inherited lake calculation and 16.5 ms during special-feature review. With the fine accepted source available, cold/warm special-feature actions take 294.3/87.1 ms; the warm review makes no new numerical-tile requests. Actual high-coordinate wrapped inspection uses a 19.53125 m accepted refinement, a creator-defined 0.2 m channel width, two camera-local path anchors and unchanged saved geometry/numerical fingerprints. This is scoped precision evidence, not a claim of added measured terrain detail.

### Explicit limits

- D8 single-receiver routing retains directional bias. Channel hierarchy is provisional contributing-area geography, not rainfall or measured discharge. Zoom does not create finer measured terrain. Intermittence, groundwater sources and final wetland classifications remain creator decisions.
- Natural selection considers at most 16,384 headwaters and retains up to 24/72/160 for sparse/balanced/fine detail. Acceptance overlap inspection caps one million segment probes; ambiguous manual junctions require deliberate Join/replacement.
- Special review caps 65,536 samples, 128 per segment, 64 point candidates and 12 bounded local wet-area patches of roughly 2,048 cells. It does not detect whole wetland ecosystems. Potential waterfalls require sufficiently fine spacing, distance, drop and grade; coarse steps remain uncertain steep-reach/rapids evidence. Excessive/unsupported contours are omitted with visible diagnostics.
- Up to 512 special features share the existing geometry limits: 32,768 combined lake/catchment/wetland surface points; 8,192 nodes; 4,096 channels; 65,536 channel points; 512 points per channel; 32 analyses; 524,288 planned and 655,360 mesh cells. Existing 120-second watchdog/cancellation remains.
- Artwork keeps up to four main preparations and one transient watershed within its 32 MiB conservative estimate, with at most two extra anchors per long path. Browser/native overhead is additional. CPU performance varies with workload/hardware.
- Full-circumference lakes remain explicitly unsupported. Full-circumference watershed boundaries retain the established canonical cut; unsupported wet-area contours are reported and omitted.
- Parent/source invalidation is conservative. Finished operations recover; unfinished shoreline/wetland taps warn before leaving but must be completed to become a recoverable object.

## Owner review

After independently verifying the running version and prerequisites, open a saved World in **Worlds -> Atlas**, select its accepted terrain map and expand the editor. Open Water, suggest natural waterways, inspect the temporary proposal and accept selected routes or deliberately replace unprotected derived routes. Save waterways, then reopen. Compare balanced/all visibility, physical widths, banks and each map appearance without changing geometry.

Open the special-feature section to add a spring, link it to a headwater, move it, place/reattach a waterfall or rapids, and draw/classify a wetland. Review sampled candidates only where terrain supports them. Exercise undo, protection, save/reopen and a terrain edit with a pending water draft. Use lake controls for tone, shoreline, inflows/outlet and condition. Assess the actual visuals and workflow; report any unacceptable quality separately from technical parity.

Climate, Biomes, Vegetation, erosion, hydraulic/depth simulation, Art Studio libraries, roads, settlements, interiors, 3D/GPU water and standalone Studio remain outside this pass. **Stage 3 Pass 4 has not begun.**

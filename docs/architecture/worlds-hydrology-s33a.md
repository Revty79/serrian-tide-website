# Stage 3 Pass 3A: hydrology foundation and first water system

The updated owner brief authorizes unattended implementation, testing and publication from `789e755295d2aba263b093212dcb3239f86b53b8`. The owner closed the technical gate for proceeding and explicitly **rejected the current artistic quality**. That visual assessment remains open work; it is not artistic acceptance. Missing owner-tab diagnostics do not block this pass. No shared database write, deployment, server restart, Production troubleshooting or subsequent pass is authorized.

## Shared foundations

Reuse the accepted numerical terrain and refinement APIs, immutable tile objects, physical metre coordinates, wrapping, owner authorization and read-only Admin review. Water is an independent logical graph owned by the same World/map, not a painted material or terrain edit. Saved graph positions and identities remain constant across zoom, imagery LOD and numerical editing-source switches.

Drainage uses a deterministic bounded mesh built from accepted root and refinement sources. Parent cells are clipped at child coverage; adjacent/nested coverage shares bidirectional neighboring-cell connections. A deterministic analysis plan may use accepted numerical overviews to fit a fixed cell/memory budget. Analysis resolution and source pins are explicit, independent of the camera and photographic pixels. All source heads are checked while loading and again before accepting new derived authoring. Never describe unavailable fine geometry as analysed detail.

The first routing method is steepest descending neighbor with physical distances, deterministic flat routing to a lower outlet, and retained closed sinks. Flat routing changes computational receivers only, not heights. Closed basins retain potential spill elevations as diagnostics; the first pass does not fill lakes or carve ridges to force ocean drainage. Accumulation is contributing **land area** under provisional uniform runoff, not climate-informed discharge. Fixed-edge exits are distinguished from sea discharge and closed sinks. East/west wrapping uses short physical distances and continuous paths.

## Authoring and preservation

Suggestions live in a separate preview until a creator accepts a watercourse and its downstream connections. Existing authored/protected waterways survive new analyses. Creators can place a source, inspect connections and drainage, accept/reject suggestions, edit names/positions, mark fictional exceptions, remove a course, undo/redo and explicitly save. Manual positions are marked as creator-authored rather than automatically validated natural flow.

Use a map-first Water section within the existing editor controls and a scale-aware vector overlay across all five appearances. The canvas stays the dominant workspace. Processing runs in a cancellable worker; there is no synchronous large-world fallback. Resource limits produce actionable messages and retain accepted authoring.

Persistence uses a new additive migration after 0140, independent heads and immutable versions, stable request UUIDs, atomic owner-authorized transactions and repeatable-read history. Missing migration support leaves existing terrain functional and reports the save prerequisite clearly. Conflicts retain drafts; interrupted accepted saves retry the original request. Historical restoration creates a new revision. Terrain changes flag affected analysis for deliberate review without moving or deleting saved rivers. Schema changes are rehearsed only in owned disposable databases.

## Validation and boundaries

Test slopes, valleys, flat plateaus, depressions, basins, outlets, confluences, wrapping, unequal axes, clipped adjacent/nested refinements and exact conservation/connectivity. Verify numerical checksums stay unchanged through authoring and regeneration previews. Exercise actual suggestions, source placement/adjustment, selection, acceptance/rejection, save/reopen/history, recovery/conflicts, roles and desktop/native touch/pen. Measure worker time, memory and main-thread response with GPU disabled; inspect actual World/regional/close-up captures with imagery both visible and hidden. Preserve failed evidence and exact implementation/source bindings.

No climate, precipitation simulation, biomes, forests, erosion, complete lakes/wetlands/waterfall artwork, new standalone geometry, gameplay integration or Pass 3B. The completed slice must build and operate independently, with migration order, recovery and known limits reported for owner/Ember review.

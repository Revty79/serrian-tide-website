# Map Studio basic and advanced toolbar contract

Owner direction recorded by [Ember on PR #6](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6228051193), 2026-10-17. This refines the currently authorized UX-0A/N0 correction. It does not open another development phase or establish owner acceptance.

The [owner's later priority reset](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6228289503) narrows the immediate goal to a **Minimum Usable Mapmaker**: ordinary desktop drawing/editing, existing art and clear saves. No new art count, professional polish, specialist engine or phone rewrite should delay that goal. Keep honest stress results separate; any release exception requires an explicit narrow owner decision after concrete evidence and independent review. The sculpt proposal below is deferred planning, not an immediate release prerequisite for the safe point-editing route.

The [main-first clarification](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6228442057) makes `origin/main` the owner's normal IDE/deployment branch after acceptance. This feature branch is a short-lived review checkpoint, not the user's long-term workspace. Sequence: exact-SHA independent review, a narrow owner stress decision if required, uncoached normal-DEV signoff with local work preserved/verified target and no0132 reapplication, then explicit integration authority and the normal reviewed PR #7 merge. Cloud does not access owner DEV/Production; local signoff is coordinated separately without manual branch juggling. PR #6 never merges, and no deployment/Production migration is performed by this correction.

The beginner toolbar stays near the canvas and covers both creating and editing saved maps:

| Basic entry | Actual supported work |
| --- | --- |
| Select & Edit | Select retained land, drawings, labels, paths and painted groups; contextual editing, move, remove and restore; Items fallback |
| Move Map | Pan/zoom while retaining the editing tool and unfinished work; Space, middle mouse and touch navigation |
| Land & Coast | Draw/generate initial geographic land, or edit the selected saved coast through the correct existing editor |
| Water & Roads | Draw river, stream, road or trail; complete and edit the retained path; no implied lake tool |
| Paint Terrain | Select original illustrated brushes and paint an editable stroke group |
| Place Objects | Place original stamps, settlements and landmarks; retain linked place identities |
| Text & Labels | Enter printed text, place it, then select to change words, size or position |

Items, Undo, Redo, contextual removal/restore, zoom, Fit, Save and Export stay nearby. Compact layouts must keep a usable canvas and touch targets; optional settings must not cover their own last menu row with the footer. Empty maps offer an obvious Generate/Draw choice. Saved geographic maps must not be treated as empty just because they have no decorative drawings.

Selecting a continent or visible shoreline exposes **Edit coastline**. Ordinary retained polygon artwork reuses its existing point/add/smooth/sculpt operations, map undo and Save map. Existing geographic polygons reuse their complete original boundary editor, permissions, source undo and additive immutable geographic save; their actual mask follows the same draft/save. Beginner controls use Save coastline and Done, with visible unsaved state. Unsupported smoothing or brush shaping is stated plainly and omitted from those source controls. No decorative substitute changes authoritative land/water.

More tools preserves low-level coordinates, multipart/interior boundaries, source/revision/provenance details, projection, specialist brush/style controls, layers/protection/order, territory/history editions, rasters/scientific data, relationships and complex generation. It remains an optional power-user route. Existing independent saves, exact IDs/version pins, privacy, recovery and rollback remain mandatory.

Acceptance requires natural visible-UI create → select coast → edit → undo/redo → save → close/reopen → edit again on artwork, manually drawn geographic and generated geographic land, on desktop and 390px touch emulation. Paint/place/river/label/remove/undo/export journeys remain required. Automated technical passes do not establish uncoached human, physical-device or artistic acceptance. The owner pauses trial-and-error until Cody has checked the work and Ember independently reviews the next exact SHA. No new owner test invitation or main integration before those gates.

## Separate decision: authoritative brush shaping

**Planning only; not implemented or approved by this correction.** Existing point editing is the safe usable route now. The artwork sculpt algorithm assumes one bounded map-space ring; reusing it directly for authoritative Polygon/MultiPolygon sources would mishandle coordinate reference, projection, holes, part boundaries, imported sources and validation limits.

The smallest source-safe proposal is a focused follow-up limited to the selected authored planar exterior ring: transform the brush through the existing coordinate adapter; insert a bounded local sample using the current vertex budget; displace only nearby retained boundary coordinates; reject self-intersections, invalid holes or topology, exceeded 256-point budget and unsupported spherical/imported/multipart contexts with explicit reasons. Preview must replace only the selected source in the existing mask; commit through existing source undo, revision-conflict/idempotency checks and additive source version save. No schema change, raster replacement, regeneration or new service. Original versions, other rings/sources and place/history links remain exact. Spherical, imported and more complex topology would require a later separately scoped design.

Estimated bounded work: 2–3 implementation days plus 1–2 validation/review days for geometry, privacy/history/conflict regressions, mouse/touch previews and performance evidence; revise the estimate after independent design review. This is a proposed engineering estimate, not a promise or authorization. Owner approval of the concrete contract is required before any new authoritative sculpt algorithm is coded. Full professional 2D materials/cities/dungeons and numerical heightmaps remain deferred.

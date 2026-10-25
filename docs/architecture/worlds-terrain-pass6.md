# Atlas Pass 6: measurement and physical editing

Authorized starting checkpoint: `ca19ee19de2dbf3fef97d6a3bdb00044384a7b0d`. Complete the owner's supplied Pass 6, retaining every Pass 1–5 tool, numerical save/recovery contract, v1/v2 generator, palette/relief, expanded workspace, immutable history, stable World/map/place identities and gameplay/business code. No local refinement, Town Maps/interiors/dungeons, environmental simulation, alternate renderer, Studio or Pass 7.

## View and measurement

Reuse the existing metre World extents, TerrainView and terrainPoint transforms. Grid, scale bar, ruler/path/area and cursor overlays are drawn after the existing texture, never into tiles. Panning/zooming, preference changes and overlay edits redraw the view without enqueueing full tile shading. Keep a permanent viewport-derived scale bar even with grid disabled.

Use bounded 1/2/5 intervals with zoom hysteresis. Manual spacing remains an explicit physical request; if too dense, thin visible lines with an honest readout instead of iterating millions of lines. Major/minor lines and labels remain aligned to World origin, clipped to physical edges, contrast-aware and bounded. Optional snapping defaults off and applies to ruler/landform points rather than freehand sculpting or Town markers.

Browser-local preferences provide automatic metric/imperial display and explicit km, m, mi, yd or ft. Height m/ft is independent. International conversions are exact constants (1 ft = 0.3048 m, 1 yd = 0.9144 m, 1 mi = 1609.344 m). Preferences never mutate canonical coordinates/heights, recipes or revisions. Inputs use a stable explicit edit unit when automatic display is selected; display switching does not round-trip values through saved state.

Temporary point-to-point, multi-point and closed-area measurements provide Finish/Edit/Clear, vertex dragging, point removal and compact coordinate editing. Measurements are bounded (up to 256 vertices), informational and do not mark terrain dirty, place Towns or start strokes. Wrap segments choose the shortest X connection by default, with a deliberate direct-route option and waypoint control. Seam polygons unwrap consistently; reject ambiguous winding/self-crossing/degenerate areas instead of reporting a giant false area. Translate before area products and use stable summation for large coordinates.

## Physical numerical tools

Keep existing sample-radius calculations exact when physical mode is absent. Explicit physical brush radius uses independent metre spacing for X/Y influence, bounds, cursor footprint and stroke dab spacing. Preserve strength/hardness, stable smoothing halo, bounded batches, one patch per gesture, exact undo and autosave protection. Anisotropic sample grids must still yield physical circles.

Keep requested physical dimensions separately from any deliberately selected practical adjustment. Explain under-resolution and excessive interactive footprints, show actual sample spacing and actual applied footprint, and provide explicit minimum/maximum choices. Do not silently clamp an unsupported requested circle into a different ellipse. Retain the current practical sample-work envelope and make limits derive from the active grid so future refined grids can reuse the controls.

Ridge/valley physical mode adds only temporary worker intent. Use metre-space segment distance and separate X/Y sample corridors for genuine physical widths; retain original sample mode exactly. Report physical path length. Results remain existing manual numerical patches, not a new permanent landform representation. Creation workshop dimension/height displays honor preferences while canonical recipe/settings units stay unchanged.

## Workspace

Add compact measurement/unit/grid controls to the established normal and expanded editor. Tool switching and settings never remount the canvas or reset its viewport. Ordinary measurement uses no new large modal. Context panels scroll internally with a useful map viewport and reachable Save/history actions on desktop, tablet and phone. Preserve mouse/pen, keyboard, navigation-first touch and second-finger cancellation behavior. Avoid React state updates for every raw pointer event.

## Verification and release

No database migration is expected: preferences are local and only existing numerical samples are saved. Applied migrations through 0136 stay immutable. Verify the DEV ledger read-only; no shared DEV writes, Production/server contact or owner-service restart. Use owned disposable production/database/browser fixtures with GPU disabled.

Verify known 100 km distances/areas, large-coordinate stability, all supported units, seam paths/areas, grid alignment/hysteresis/manual density bounds, unchanged view-only data/revisions, retained zoom, physical brush/path influence on unequal axes, wrapping, resolution honesty at million-km/1024², every legacy mode, undo/recovery/conflicts and all earlier creator/security regressions. Measure overlay/brush/path performance and retained memory. Run root feature tests, TypeScript, lint and production build, inspect actual screenshots and return exact commits/evidence/limitations and owner review instructions. Publish under the owner's existing Git workflow and stop before Pass 7; owner artistic/usability acceptance remains separate.

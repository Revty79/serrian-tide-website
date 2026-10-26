# Stage 3 Pass 1: numerical cartographic presentation

The owner accepted Stage 2 and authorized S3-1A through S3-1E from published `78534362e6c3d9c93b0e7ddd9db0148bba9085e8`. Work remains in main and publishes to origin/main after validation. No deployment, shared database writes, standalone Studio or next pass.

A read-only identity/ledger check independently confirmed localhost `serrian_tide_dev`, role `serrian_tide_app`, 139 entries through 0138, with exact published 0136-0138 hashes. Production was not contacted. Migration 0139 adds a separate map appearance record; it does not change the constrained legacy `world_map_canvas.rendering` field, terrain rows, tiles, samples or immutable revisions.

## Layers and performance

1. The existing World/refinement numerical samples, protected masks and overview/viewport caches remain authoritative.
2. Classic and physical relief retain their exact existing palette and illumination paths.
3. A versioned, strictly validated appearance spec selects cartographic materials, illumination, coastline, contours and pen interpretation independently of terrain commands.
4. The cartographic painter schedules only visible root/detail tiles. Numerical overviews use the same recursive rounded averages. Halos provide consistent field values at tile edges. A fixed per-cell contour ceiling and per-tile pen-stroke ceiling bound work independently of World dimensions.
5. Root and fine presentation use a common viewport contour interval, physical elevations, palette and World-anchored pen lattice. Original frames and horizontal period are retained.
6. Markers, selections, cursors, grid and rulers compose afterward, retaining shared semantic contrast and exact coordinates.

The CPU Canvas2D cache is limited to 2,304 textures and 64 MiB of texture pixels. Pixel dimensions adapt to visible sample size, within 64-256 pixels per tile. Raster work is sliced between numerical-halo rows and tile jobs with a small frame budget. Style/sea/zoom-interval/source versions key the cache. Painting invalidates touched tiles and their halo at each overview; it does not regenerate geography or rescan all World tiles. Views retain pose/canvas during switching. The original coarse relief remains a safe loading fallback while visible cartography is prepared.

## Cartographic interpretation

Topographic uses original restrained hypsometric colors, optional depth coloring, physical illumination, actual sea-level outlines, minor contours and heavier fifth contours. Automatic vertical intervals use the visible physical extent; dense contours generalize on steep/coarse cells rather than invent new elevations. Legend reports the vertical interval and numerical overview spacing.

Illustrated Fantasy uses original coordinated ivory/parchment, land and ocean materials; ink coastlines; optional elevation/depth linework; and curved downhill pen strokes sampled from actual relief. It adds no mountain icons, sprites, arbitrary noise texture, forests, rivers or simulation. Seeded generation recipes and source heights are untouched. Interpolation smooths presentation only; it adds no numerical detail.

Map art is independent of arbitrary website brand colors, as allowed by the shared theme's cartographic material exception. Interface chrome and controls retain shared theme variables. These original procedural palettes and linework use no third-party artwork, external renderer, paid service or new dependency. The owner's [Azgaar usability reference](https://github.com/Azgaar/Fantasy-Map-Generator) informed separation of world data/editors/renderers; its source artwork/code was not imported.

## Persistence and compatibility

`world_map_appearance` associates one current default with the existing World/map identity, separate optimistic revision, validated spec and exact retry identity. The schema can later support multiple representations without making appearance authoritative geography. Existing maps have no new row and retain legacy/browser views. A missing migration leaves terrain and style previews working, with an explicit 0139 requirement for map-default saves.

Changing styles immediately previews in this browser. **Save map appearance** separately persists a map default; a new browser can load it. Browser preferences can intentionally differ from the shared default. Explicit load resolves a conflicting appearance draft. An uncertain save retains its original request locally for retry, including after reload. Owner-only writes use the existing World transaction and CSRF boundary; read-only Admin review permits view changes but no persistence. Appearance save cannot create a terrain revision or modify private numerical objects.

## Acceptance

Validate numerical contour geometry, saddle decisions, bounded extreme gradients, deterministic sampled pen artwork, exact rounded overviews, style parsing and legacy compatibility. Use the application's accepted three-continent World, detailed 20 km/1 km island and wrapped million-km World for comparisons, edited/reopened sources, nested/adjacent coverage, painting/undo/recovery and numerical checksums. Rehearse fresh/populated/backup/restore PostgreSQL including 0139. Complete production/type/lint/unit and all retained Pass 2-8 browser/security/Worlds tests, plus GPU-disabled desktop/tablet/phone visual and performance evidence. Technical completion does not record owner artistic acceptance.

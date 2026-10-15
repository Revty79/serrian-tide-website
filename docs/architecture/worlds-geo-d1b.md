# Geo D1-B: unified Atlas previews and map export

Authorized from approved `2683a72d3c41d4c6fce0515d307f6a844536cfe1`. This is an independently deployable presentation increment, stopping at local review. It does not authorize imports, new source editing, sharing/publishing, Docker changes, shared-service activation, Production contact or later phases.

## Previews

Preserve the IntersectionObserver's 240-pixel lazy margin and unmount work outside it. Thumbnail work uses a two-job page queue with abortable waiting, rather than a cross-user or cross-context result cache. Viewing identities include the authenticated reader, World, map, timeline, ordinary/review mode and selected historical year; revisions are checked separately.

The focused correction from `27318be409b599114f457a3ce587fbe3a8c81061` separates refresh counters from mounted preview identity. Thirty-second and focus checks reauthorize artwork, geographic eligibility and both raster metadata responses. Unchanged results retain their existing scenes and pixels. Artwork revisions update artwork independently; changed geographic eligibility clears old paths before fetching a replacement; denied/failed authorization clears affected content. A private geography `preview=1&check=1` response reuses the full viewer's eligibility SQL without loading source geometry, map parts or computing projected paths.

Preview responses identify their authenticated reader. Complete raster images can survive a fresh authorization stamp only for the same reader/context, immutable source/version, grid, coarse level, tile plan and style. Fresh visibility/opacity preferences update independently. Manual retry checks healthy content without fetching its unchanged tiles, while incomplete sources reload. Changing reader, World, map, timeline, ordinary/review mode or historical selection discards the prior context. No export/editor persistence behavior changes.

Generic geographic previews use the existing authenticated private geographic endpoint in explicit preview mode: full-domain rectangular Earth or retained planar projection, overview land/authored representations only, at most 96 parts and 64,000 total path characters, at most 8,000 per part. Larger footprint parts are preferred. This is deliberately a representative coarse preview, not the complete editable source. The existing clipping/projector and screen-space simplifier perform every transformation.

Raster preview mode selects only the coarsest already provisioned level, at most 16 tiles per source, and composes 320 × 192 browser images. It never falls back to finer tiles. Normal viewer requests retain their existing behavior. No new raster assets, geometry caches, migrations or source identities are written. The same owner/ordinary/review, Realm, archived/current/pinned source and authenticated tile checks execute before returning preview content. No preview image is published or durably cached.

Artwork remains the existing CartographyScene registered through the D1-A coordinate adapter. Settlement/interior/dungeon rendering remains intact. A selected year requests its authorized Map State artwork and suppresses modern references; unknown dated coverage is identified as a baseline artwork reference. Source/tile failures identify the incomplete preview and offer retry. Required classification credit remains visible and full source credits remain available beside the preview.

## Image downloads

Download visible map PNG composes the same GeographicScene, current raster images, geographic labels and CartographyScene in the current extent/projection. Interaction handles are omitted. Export authored PNG remains separate and retains original source coordinates and artwork composition. Neither action saves or flattens editable records, changes the viewport, or clears an unsaved draft.

PNG composition occurs only in the browser, with embedded raster pixels and computed SVG styles. No external image URLs, public asset routes, server GPU, paid service or publishing system is introduced. Failed or still-loading visible resources block a complete export and offer retry. There is no silently partial image choice.

Immediately before download, the original map/appearance is reauthorized and compared with the loaded source; geographic eligibility and each included immutable raster version are rechecked through existing private endpoints. Ordinary access checks both the current head and selected original. The export is rejected if access or its source/view/draft context changed. A fresh access stamp alone does not invalidate an otherwise authorized exact original when an unrelated map preference was saved. No authorization response or exported image is reused across contexts.

Credits are part of the PNG, including provider/license links, required ESA WorldCover credit and observation period when classifications are present, plus current projection/extent or explicit historical/unknown context. Credits are never silently truncated. Composition has a 12-MB serialized SVG limit, a 2000 × 1200 map image and at most 24 footer lines; failures retain editable drafts. Measurements must distinguish explicit pixel buffers from total browser memory.

## Compatibility and recovery

No new migration, persistent configuration or private asset provisioning is required. Migrations through 0130/0131 and original sources remain immutable. Reverting the application restores authored-only previews/export without changing any saved map or preference format. Code rollback does not reverse owner edits or migration history.

Acceptance uses the production build against the previously retained owned disposable cluster, without database/source import, plus fresh-schema migration rehearsal, read-only preservation comparisons, browser screenshots and genuine PNG examples. Independent technical inspection and owner visual acceptance remain separate from automated evidence. Follow the existing [deployment standard](../operations/pass-deployment-standard.md) and [paired raster recovery runbook](../operations/worlds-raster-deployment.md) after separate deployment authorization.

Executed checks, actual resource measurements, screenshots, PNG examples and remaining acceptance are recorded in the [D1-B report](../reports/worlds-geo-d1b-2026-10-14.md).

The [focused performance correction report](../reports/worlds-geo-d1b-performance-correction-2026-10-14.md) records baseline versus corrected idle transfers and refresh/privacy regressions.

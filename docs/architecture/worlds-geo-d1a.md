# Geo D1-A: unified Geographic Atlas foundation

Authorized from independently approved `fcf911d24641436424c7acf766baba7cebe5b10c` on 2026-10-14. This implements the first complete D1 increment under the [Map Maker decisions](worlds-map-maker-decisions.md). Stop at a local review commit; D1-B, remote push, deployment, shared-service restart and Production contact are not authorized.

## One Atlas, retained sources

The normal generic Atlas Map Maker and its Explorer now compose existing geographic sources with editable Atlas artwork. They reuse the geographic viewport/source endpoints, server authorization, bounded cursor pages, progressive source bands, existing projector and C2/C3 hooks. `GeographicScene` is shared with Geographic Sources; no second geographic database, source engine or mass conversion to Atlas polygons is introduced. The original source workshop remains available for exact source reading and deliberate revisions.

The stack is numerical elevation/bathymetry, dated classifications, ordered geographic vectors and geographic labels, followed by creator artwork and its editing handles. Geographic themes, source labels, relief and classifications have independent visibility. Existing Atlas artwork visibility/locking and separate raster preference saves remain intact. Raster copyright, source use links and classification observation period remain visible beside the canvas even when source controls are folded. Missing imagery leaves vectors and artwork available, with visible errors and retries outside the folded source controls. Automatic artwork labels are omitted when their geography anchors are outside the viewing region; they are never clamped onto a misleading regional edge.

## Reversible display coordinates

`atlas-geographic-frame.ts` defines the version-1 adapter. Stored Atlas artwork remains at its original 2000 × 1200 positions. No source coordinate, feature/place identity, original drawing, recipe, revision or history snapshot is migrated or rewritten.

For a spherical surface, source longitude is `west + x / 2000 × fullDomainWidth`; latitude is `north - y / 1200 × fullDomainHeight`. The full spherical domain is −180…180 and −90…90. This is a drawing registration, not an assertion of physical distances or a new planar World. The existing projector maps those source coordinates into the selected viewing extent; its 1000 × 600 display is scaled by two for Atlas. Input takes the inverse projection and inverse registration before entering the established bounded-point, validation, undo/redo and save flows. Unreferenced outer display padding refuses drawing input. Changing the view never commits a draft.

Original planar imports use direct Atlas x/y coordinates (including the retained Glass Sea example). Normalize against the declared planar domain while retaining the original positive-y canvas orientation. Mirror the existing north-up geographic display and raster imagery for this Atlas presentation; keep source labels upright. The separate source workshop retains its original orientation. Neither source data nor old artwork is flipped in storage. Non-Earth units and references remain explicit.

Source geometry retains its established spherical clipping/LOD behavior. Atlas artwork retains its planar drawing interiors and curves, including artwork wider than a hemisphere. Only derived paths repeat at the spherical longitude seam and are clipped by the canvas. Decorative marks retain their original seeds and source positions; symbols remain upright at projected anchors. Projection never feeds an ephemeral render draft back into persistence. Existing Atlas precision remains 0.01 authoring unit; an annotation placed over a precise source may therefore have a quantized anchor. Zoom does not increase authoring or geographic source accuracy.

Worldwide spherical maps initially use the visibly rectangular equirectangular display, with both poles and transparent fit padding. Mercator remains selectable and its polar limit is enforced when changing or moving the view. Spherical references remain authoritative. Advanced interrupted/unfolded projections remain deferred.

## Navigation, loading and history

Pan, zoom buttons, keyboard navigation, native touch drag and two-finger zoom operate on source extents. Bounded requests automatically select existing overview/regional/detail bands. Source search is limited to the loaded extent; explicit Focus this source selects a closer view. A bounded tab entry and searchable source choices avoid thousands of sequential canvas tab stops. Source selection reads the original without moving the page. User-triggered pan/focus changes the map view deliberately.

Both source/page and raster responses retain context keys and cancellation. Cursor pages enforce consistent map/surface/access/source context; authorization failures clear the affected presentation. Source readers revalidate with the view refresh, including live current-protection changes, and provide an explicit retry without discarding artwork. No private metadata is returned by a new server route: there is no new rendering route. Owner authoring, ordinary aliases, selected timeline/Realm checks and explicit read-only Administrator review reuse existing services.

Any selected historical appearance or World year, including unknown coverage, uses the established historical renderer without modern geographic/2021 classification overlays. Original artwork, exact timeline pins, territories, destinations and requested years remain intact. This pass adds no dated interior/dungeon authoring. Settlement, interior, dungeon, Realm and generated-map systems remain independent of the optional generic geographic registration.

Remove the source-reader response scroll and workshop MutationObserver scroll. Retain only explicit place-link navigation, once per requested place. Tool changes, loading and source selection never request a page scroll. Map and geographic/raster drafts retain their separate save boundaries and established navigation guards.

## Deployment and recovery

There are no new dependencies, migrations, persistent configuration or DEV imports. Existing migrations remain ordered through 0131; never edit 0130/0131. Existing private assets, manifests, checksums, provisioning and recovery remain governed by the [raster deployment runbook](../operations/worlds-raster-deployment.md).

Build and test the reviewed application against its configured private asset root before controlled activation. Retain database/private-asset backups and the current application release. Reverting to the preceding application commit restores its prior separate presentations; this increment writes only established Atlas/raster preference formats, which older readers still understand. Reverting code does not undo owner-authored changes or database migrations. No deployment or shared-service restart is performed by this pass.

Acceptance evidence and measured limits are recorded in the [D1-A report](../reports/worlds-geo-d1a-2026-10-14.md). Independent technical inspection and owner visual acceptance remain separate from automated evidence.

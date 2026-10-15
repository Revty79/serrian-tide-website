# Geo D2-B completion and Glass Sea acceptance - 2026-10-15

Approved base: `fab810a295b342d5a11239aad21080c38630d2be`. This report belongs to the single local D2-B review commit; obtain its exact SHA with `git log -1 --format=%H -- docs/reports/worlds-geo-d2b-2026-10-15.md`. Ember's independent technical review and owner visual acceptance remain pending. No remote push or deployment was performed.

## Delivered authoring workflow

The existing Atlas source editor now retains complete Polygon/MultiPolygon geometry: all islands, exteriors and holes share the original source/place identity. Creators can select a boundary from the canvas or named selectors, focus it, draw another island or enclosed opening, reshape/insert/remove vertices, remove a hole or whole component, undo/redo, save an immutable revision and reopen the same feature. Every other component remains retained. Polygon promotion adds components without creating unrelated identities; MultiPolygon retains its type when only one component remains.

The complete source stays visible while only the chosen boundary exposes vertex handles. Saves retain that selection. Drawing taps add points even near old handles; completed outlines allow dragging. A preview-only artwork checkbox defaults to enabled and can hide retained decorative paint that otherwise covers a geographic opening. It changes no saved artwork or draft state. Visible PNG follows the current view choice; authored-only PNG retains artwork, with export context cancellation preserved.

New/changed rings receive role-appropriate winding; untouched rings retain exact coordinates, precision and order, including legacy imported orientation. The server uses immutable previous geometry to canonicalize retries consistently. Creation uses the existing creator provenance, source/version/part writer and shared place model. Imported edits retain provenance, properties, license, privacy and original versions, and require deliberate acknowledgement.

Geographic, Atlas artwork and raster-preference saves remain separate. Combined draft guards, failed-save retention, idempotent retry, optimistic conflicts, full-source comparison, explicit reload/rebase and draft download remain available. Replacement recovery names both complete component/ring counts. No automatic merge or cross-session draft import is claimed.

## Geometry boundaries

| Boundary | Supported result |
|---|---|
| Interactive size | 256 total vertices excluding ring closure, eight components, 24 total rings, eight holes per component |
| Planar | Valid Polygon/MultiPolygon exteriors and strictly contained, separate holes; disconnected islands or isolated exterior point contacts; an island inside another component's hole |
| Invalid topology | Reject outside/nested/touching holes, crossings, shared edges, filled-area overlaps, retracing and degenerate/repeated vertices, including overlaps concealed by vertex-only contacts |
| Basic spherical sources | Preserve D2-A local single-ring/open-line support: vertices within 85 degrees latitude, longitude span below 180 degrees |
| Complex spherical sources | Local components/holes, vertices within 75 degrees latitude, longitude span below 120 degrees; great-circle topology checked together in a common gnomonic plane and by the retained source validator |
| Unsupported originals | Wider, polar, antimeridian, oversized, point or multipart-line sources remain intact and read-only; no flattening, simplification or coordinate rewrite |

The original generic import validator is unchanged apart from exporting its existing point-in-ring helper. Stricter interactive checks apply on both client and server. No parallel engine, migration or mass conversion to decorative features was added.

## Glass Sea: verified now and retained roadmap

The primary application acceptance case was an additional owned disposable database copy of the existing canonical Glass Sea, with the same World, planar surface, maps, sources and original version identities. Persistent DEV and Production were never contacted. The original Glass Sea in the main disposable clone was also left unchanged.

Verified through actual creator controls:

- Glass Island exterior mouse edit retained its enclosed opening; opening focus, keyboard edit, vertex insertion/removal and undo/redo retained its exterior. Each save created an immutable revision; the exact original remained readable.
- Either Copper Isle could be selected and reshaped with desktop or native browser touch without changing the other component. Source/place identity, provenance and original version remained retained.
- Revised geometry appeared in library previews and PNG exports. The source-only preview exposed the actual opening; authored-only export still included retained artwork.
- Every original Glass Sea row remained exact in the shadow copy except the two deliberately advanced source-head rows. All original versions/parts, Atlas artwork, map associations, Glass Channel and its planar surface relationship remained exact.

The permanent [Map Maker decisions](../architecture/worlds-map-maker-decisions.md#glass-sea-completion-across-geo-de) now require substantial Glass Sea development across D3 geography/terrain/waterways/regions, D4 connected regions/settlements/buildings/interiors/dungeons, D5 artistic presentation/assets and E coherent fictional-world acceptance alongside separate real-Earth accuracy acceptance. D5 settlement/interior/dungeon assets and the D4/E review of historical interior/dungeon layout changes remain explicit. New geography, settlements and lore must be proposed for owner approval before becoming established content. None of those later phases, persistent writes or the postponed interface/navigation/language overhaul were implemented here.

## Validation

Node 22.23.3, PostgreSQL 18 and Chrome used the receipt-verified owned disposable environment. The isolated production build was fingerprinted against runtime source files. App/Chrome/PG processes belonged to this test environment; shared services were not restarted. Existing private raster bundles were borrowed read-only.

| Check | Result |
|---|---|
| Node 22 production build and TypeScript | Pass; runtime fingerprint `502fece34dcb26e6960112d337a71e86fc3d131e1d47ed29c9fbc1e0946fe3dc` |
| Full feature suite | 2,194/2,194 across 264 files, including 20 focused D2-A/D2-B authoring tests |
| ESLint | Zero errors; one existing Stories warning. Changed source/test files pass without warnings. |
| D2-B authoring services | 7/7: identity/idempotence, complete revisions, atomic invalid saves, promotion/type retention, privacy, roles and bounded measurements |
| D2-B production browser | 11/11 journeys; zero page errors |
| Canonical Glass Sea copy browser | 4/4 journeys; zero page errors, including retained revision 1 through the UI |
| D2-A compatibility browser | 13/13; polygons, rivers, mouse/keyboard/touch, saves, failures, conflicts and HTTP/role restrictions |
| Existing map/export compatibility browser | 12/12; Earth/raster/projection, both PNGs, failed/unauthorized exports, context cancellation, history, ordinary/Admin, Glass Sea and local editors |
| Existing preview performance browser | 9/9; idle, focus, revisions, redaction, permission loss, retry, offscreen and multiple visible previews |
| Geographic services/migration compatibility | 8/8; fresh 132-entry schema and populated no-op upgrade |
| Preservation | 160,509 original rows across 118 World tables retained; ledger exact; 16 raster versions/six bundles verify |
| Repository scope | No migration/data/dependency/configuration diff; `git diff --check` passes |

Desktop mouse/keyboard and native browser touch were exercised; phone evidence uses Chrome mobile emulation and CDP touch dispatch, not a physical device. Windows Node 22 production verification does not substitute for Linux CI or owner acceptance. The existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts:6` remains unchanged.

## Actual screenshots and functional findings

- [Five islands before save](../screenshots/worlds-geo-d2b/authoring/archipelago-before-save.png), [complete feature with a hole](../screenshots/worlds-geo-d2b/authoring/archipelago-with-hole.png), [invalid overlap](../screenshots/worlds-geo-d2b/authoring/invalid-overlap.png), [point-connected components](../screenshots/worlds-geo-d2b/authoring/connected-point-components.png).
- [Spherical opening](../screenshots/worlds-geo-d2b/authoring/spherical-hole.png), [phone opening](../screenshots/worlds-geo-d2b/authoring/phone-hole.png), [phone controls](../screenshots/worlds-geo-d2b/authoring/phone-controls.png), [saved library preview](../screenshots/worlds-geo-d2b/authoring/multipart-preview.png).
- [Original Glass Island exterior/opening](../screenshots/worlds-geo-d2b/glass-sea/glass-island-before.png), [revised opening with retained exterior](../screenshots/worlds-geo-d2b/glass-sea/glass-island-after.png), [Copper Isles desktop](../screenshots/worlds-geo-d2b/glass-sea/copper-isles-desktop.png), [Copper Isle native touch](../screenshots/worlds-geo-d2b/glass-sea/copper-isles-touch.png), [Glass Sea preview](../screenshots/worlds-geo-d2b/glass-sea/glass-sea-preview.png).

Inspected actual final captures. Browser work exposed and corrected a small-outline input problem: tapping near a previous handle could drag it instead of adding a point. Drawing now consistently appends, while completed shapes retain vertex dragging. Save completion now keeps the selected component/ring. Retained decorative paint covered Glass Island's source opening, addressed with the explicit transient preview control. Test-coordinate placement was also corrected to keep pointer targets below the existing fixed page header, and the legacy fill-path assertion now identifies the fill rather than all newly selectable ring outlines. No main Worlds layout redesign was made.

## Performance, storage and preservation

The eight-component, 256-vertex benchmark used 100 validation plus draft round-trip samples: **2.98 ms minimum / 3.17 ms median / 6.73 ms p95 / 10.61 ms maximum**. Geometry JSON was 9,151 bytes; the complete request was 9,469 bytes, below the retained 64,000-byte endpoint cap. These are local CPU measurements, not server concurrency or physical-phone latency claims.

The sampled multipart vertex drag generated **zero geographic application requests**. Across the complete multipart browser run, 17 successful authoring commands (including surface setup) used **315-1,358 request bytes**, with **11.497 ms minimum / 17.084 ms median / 25.631 ms maximum** local response timing. The four Glass Sea revision requests used **506-573 bytes**, with **20.757 / 24.560 / 42.284 ms** minimum/median/maximum timing. Successful browser geographic GET responses totaled **126,932 decoded bytes / 53 responses** for multipart journeys and **39,374 bytes / 22 responses** for Glass Sea. These totals include reloads, reads, previews and focus changes, not just initial loading; direct harness verification queries and aborted responses are excluded.

Earth preview initial loading used **21 requests / 149,018 decoded bytes**. Over **70.1 seconds idle**, it used **eight lightweight check/metadata requests / 20,338 decoded bytes**, with **zero vector or raster-tile reloads** and the same mounted scene. Focus reauthorized without vector/tile downloads. Seven visible local previews stayed bounded over 35.0 seconds with ten lightweight requests / 12,087 bytes and no expensive reloads. Authorization loss removed pixels; recovery/retry loaded only the affected content. Full category/timing measurements are in the receipt.

Representative PostgreSQL logical storage for the two-component, three-ring service archipelago was **1,002 version-row bytes + 2,184 display-part bytes** originally; its next immutable revision added **1,018 + 2,184 = 3,202 bytes**. The real Glass Sea copy added four deliberate immutable revisions totaling **10,020 logical version/part-row bytes**. Glass Island already had retained revisions 1 and 2: this test added 3/4 and explicitly read revision 1 through the UI. Copper Isles added revisions 2/3. These are `pg_column_size` measurements excluding other identity rows, indexes/page allocation and WAL; they are not whole-database growth estimates. No raster was generated or copied.

Before/after row hashes retain all **160,509 original World rows across 118 tables**, including C1-C3 sources, coordinates, original identities/heads/provenance, Atlas, Glass Sea, Living History, historical records and raster preferences/metadata. All 132 migration rows remain exact, including 0130/0131; SQL/data files have no diff. Six private bundles and all 16 retained raster versions verify. New primary rows belong only to disposable test fixtures. In the separate Glass Sea copy, only its two source heads deliberately advanced; every other original row, including all original versions/parts, artwork, Glass Channel and the planar surface association, remained exact. Persistent DEV and Production were never contacted.

The committed [evidence receipt](worlds-geo-d2b-evidence.json) records check results, performance/storage summaries, preservation proof, runtime fingerprint and screenshot hashes. Raw request records, downloads/PNG/SVG composition proofs, logs and large snapshots remain in ignored `artifacts/guidance/geo-d2b` and the established isolated D1-A/D1-B/D2-A evidence directories. These are local technical results, not independent approval.

## Files and release/recovery

Source changes are limited to the existing geographic draft/workspace, interactive topology helper, authoring service, semantic-theme styles, and Atlas preview/export visibility wiring. New regression tests and guarded isolated harnesses record behavior. The existing D2-A browser harness was adjusted for intentional multipart eligibility and new ring outlines. AGENTS, architecture/creator coverage, the permanent Glass Sea roadmap, screenshots and this report record scope and handoff.

No new migration, schema, dependency, environment setting, provisioned asset or Docker change. All existing migrations remain in order through 0131. Ready for independent review; push and controlled deployment require separate owner authorization. Before any authorized release, verify the exact approved commit, target identity/ledger, database/private-asset backup and running release, then build and perform owner/ordinary/Admin, source-save and export smoke checks using the established operator-managed release process. No Production action was performed.

Code rollback does not undo saved revisions. D2-A compatible readers can retain newly multipart sources read-only; preserve the creator-provenance reader introduced there. Never flatten geometry, delete immutable versions, rewrite the migration ledger or restore a live backup merely to fit older code. Prefer a reviewed forward fix or compatible reader release, preserving post-backup work.

The requested D2-B operations are complete within these published bounds. More general spherical/seam/polar and topology adapters, broad sculpting/Boolean tools and automatic draft restoration remain later scope. No D3/D4/D5/E, Advanced Map Studio or UX-1 work was begun.

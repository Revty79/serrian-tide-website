# Geo D2-A review checkpoint - 2026-10-14

Authorized baseline: `19c22170288e1a7f533df57584db09c3acd9e6bf`. This is a local review increment. Ember's independent technical review and the owner's visual acceptance remain pending. No push, deployment, Production/live database access, shared-service restart, Docker change, private asset provisioning or later Geo phase was performed.

## Delivered behavior

The existing unified Atlas now has an explicit **Edit authoritative geography** mode, separate from decorative drawing. Creators can set up an empty generic map with a declared fictional plane or angular sphere, or associate a readable existing World surface. Surface identity, optional Realm and ordinary privacy remain explicit; no Earth reference is assumed.

Simple island/landmass polygons and river/open lines can be drawn with mouse, keyboard or native browser touch. Source selection reads the complete original. Creators can drag, insert between vertices, remove, undo/redo, preview, save an immutable revision, reopen the same source and read its retained original. Keyboard arrows move focused vertices; while drawing, arrows position a cursor and Enter adds a point. Navigate switches to the existing pan/pinch behavior. View changes retain full-precision source coordinates.

Geographic, Atlas artwork and raster preference drafts retain separate save boundaries and combined navigation protection. Geographic failure and lost acknowledgements retain the draft/request identity. Stale heads reject writes; comparison shows the latest outline dashed alongside the draft and offers explicit reload or deliberate rebase. Draft JSON can be downloaded for recovery. A successful save names geographic changes and refreshes the existing renderer. Complete visible PNG requires saving/discarding the geographic draft first; authored-only export remains separate.

## Architecture and data

No schema migration, dependency or configuration change is needed. The existing dataset JSON provenance column gains a creator-authored variant containing the actual creator, title, account, original reference and display recipe. It asserts no external provider, URL or license. Import schemas remain unchanged. Compatible readers and credits handle both variants.

The private same-origin authoring route is capped at 64,000 request bytes. Existing World ownership/transaction locking, selected timeline, map, surface and Realm checks apply. New place/feature/dataset/version identities are server-generated. Existing immutable versions, spatial parts and heads are reused; only a successfully committed new revision advances its head. Imported modifications require acknowledgement and retain original geometry, provenance, properties, protection, semantics and place/source identity. The geography writer does not save artwork or create a dated History event.

The core limit is 256 original vertices, one polygon ring or one open line. Client/server checks cover closure, normalized winding, bounds, duplicates, retracing and crossings. Spherical intersection checks use a common-hemisphere projection so great-circle crossings are caught. Existing broader source validation also applies. Points, holes, multipart and larger sources remain visibly read-only. Spherical editing excludes poles beyond 85 degrees and longitude spans of 180 degrees or more; no seam wrapping or exotic topology is claimed. Historical appearances, political overlays, ordinary readers and Administrator review do not expose shared geographic authoring.

## Changed files

- `geographic-authoring.ts`, its unit tests, `geographic-authoring-service.ts`, the private authoring route, `geographic-authoring-workspace.tsx` and its CSS provide the bounded editor and writer.
- `atlas-map-editor.tsx` connects the existing canvas, gestures, combined draft guards and separate saves.
- `geographic.ts` and the type annotation in `world-geographic-schema.ts` add stored creator provenance; `geographic-service.ts` shares the existing parts writer and renders compatible credits.
- `geographic-geometry.ts` uses browser-compatible UTF-8 byte counting while retaining its existing storage limit.
- `atlas-geographic-workspace.tsx`, `geographic-workspace.tsx` and `geographic-thumbnail.tsx` read both provenance variants without invented source links.
- `worlds-geo-d2a-checks.ts` and `worlds-geo-d2a-browser.ts` provide guarded isolated service/preservation/browser evidence. AGENTS, the architecture decision, creator field coverage, this report, the evidence receipt and actual screenshots record scope and acceptance.

## Validation

Node **22.23.3**, PostgreSQL 18 and Chrome were used in the retained owned disposable environment. Application runtime files are fingerprinted against the production build; the isolated build does not touch the shared development server. All authoring writes use newly created disposable Worlds/maps. Original Earth/Glass Sea/Living History fixtures are only read. Borrowed private raster assets are read-only.

| Check | Result |
|---|---|
| Node 22 production build and TypeScript | Pass; runtime fingerprint `5ce6fa976896da85d0b3eb11e1f9af506526cbd94a4cb9332e709b2d90b7bd05` |
| Full feature suite | 2,181/2,181, 263 files; includes 7 focused authoring geometry/provenance tests |
| ESLint | Zero errors; one pre-existing Stories warning. New authoring files pass without warnings. |
| Authoring services | 7/7 groups: stable creation/retries, originals/revisions, atomic invalid saves, roles, open lines, privacy and imported acknowledgement |
| D2-A production browser | 13/13 journeys; zero page errors; mouse, keyboard and native browser touch |
| Existing compatibility browser | 12/12: Earth and Mercator/raster alignment, artwork, both PNGs, failed/unauthorized exports, history, ordinary aliases/Admin, Glass Sea and local editors |
| Existing preview performance browser | 9/9: idle/focus, revisions, permissions/redaction, retries, offscreen cancellation and multiple visible previews |
| Existing geographic services and migration compatibility | 8/8; fresh 132-entry schema and populated no-op migration pass |
| Preservation | Every original row retained unchanged across 118 World tables; 132-entry ledger exact; 16 raster versions/six bundles verified |
| Repository scope | No migration/data/dependency/configuration diff; `git diff --check` passes |


Native touch means Chrome mobile emulation with actual browser touch events and CDP touch dispatch, not a physical-phone acceptance claim. Local Windows production verification does not substitute for Linux CI or owner acceptance. No Linux/WSL runtime was available. The unrelated existing ESLint warning in `scripts/worlds-stories-checks.ts:6` remains unchanged.

## Screenshots

Actual final production-browser captures, not mockups:

- [Island before](../screenshots/worlds-geo-d2a/plane-island-before.png) and [same island after revision](../screenshots/worlds-geo-d2a/plane-island-after.png).
- [Desktop editor](../screenshots/worlds-geo-d2a/desktop-editor.png), [conflict comparison](../screenshots/worlds-geo-d2a/conflict-controls.png), [spherical Mercator view](../screenshots/worlds-geo-d2a/sphere-mercator.png).
- [Native-touch phone line](../screenshots/worlds-geo-d2a/phone-line.png), [phone editor](../screenshots/worlds-geo-d2a/phone-controls.png), [unsupported source retained read-only](../screenshots/worlds-geo-d2a/unsupported-retained-source.png).

## Performance, storage and preservation

The sampled vertex drag and observation interval took 462.9 ms (including a 200 ms observation wait) and generated **zero geographic application requests**. Across the complete D2-A run, 16 successful authoring responses used **315-539 request bytes**; local response timing was **11.469 ms minimum / 18.492 ms median / 33.277 ms maximum**. These include setup and source commands. The route enforces 64,000 bytes. Browser geographic GET responses totaled 85744 decoded bytes over 56 responses across all journeys, errors, reloads and projection changes; this is not an initial-load benchmark. Harness-side coordinate/verification queries and aborted responses are excluded.

Earth preview initial loading used **21 requests / 149018 decoded bytes**. Over **70.1 seconds idle**, it used **8 lightweight check/metadata requests / 20338 decoded bytes**, with **zero vector and zero tile reloads**; the scene node stayed mounted. Focus also reauthorized without vector/tile downloads. 7 visible local previews stayed bounded over 35.0 seconds with 10 lightweight requests and no expensive reloads. Full category/timing measurements are in the receipt.

Representative PostgreSQL logical storage: the three-vertex line original used 562 bytes for its version row and 636 bytes for its display-part row. The four-vertex island original used 626 + 840 bytes; its next immutable revision added **642 + 840 = 1,482 bytes**, retaining the original. These are `pg_column_size` row measurements, excluding dataset/place/feature/head rows, index/page allocation and WAL; they are not whole-database growth estimates. No raster asset was generated or copied.

Before/after comparison retained all **160,118 original World rows across 118 tables**, including original C1-C3 sources, coordinate registrations, identities, heads, provenance, histories, Glass Sea, Living History and raster metadata. All 132 migration rows remained exact, including 0130/0131; existing SQL/data files have no diff. Six private bundles and 16 retained raster versions verify. Added rows belong only to isolated authoring test fixtures; canonical DEV and Production were never contacted. Repeated validation fixture counts in the receipt are test history, not a Production storage prediction.


The committed [evidence receipt](worlds-geo-d2a-evidence.json) retains measured summaries, preservation results, runtime fingerprint, command results and screenshot hashes. Full logs, raw browser request records, downloaded PNG/SVG proofs and the large before/after snapshots remain in ignored `artifacts/guidance/geo-d2a` and the established D1-A/D1-B validation directories. These are local evidence, not independent review results.

## Controlled release and recovery

Ready for independent review; remote synchronization and deployment still require owner authorization. No new migration or environment setting is introduced. Existing migrations remain in journal order through 0131; apply only genuinely pending migrations under the existing operator-managed deployment process. Existing C2/C3 private asset provisioning/recovery requirements remain mandatory; this increment generates no raster assets.

Before any authorized release, verify the target identity/ledger, protect a verified database/private-asset backup and running release, build the exact approved commit, then perform authenticated owner/ordinary/Admin, source-revision and export smoke checks. No such Production actions were performed here.

A code revert does not undo newly authored source versions. Once creator-authored provenance records exist, retain the compatible reader/credit changes when disabling authoring or rolling back. An older imported-only reader is not a complete compatible rollback. Prefer a reviewed forward fix or a compatible reader release; preserve all originals, heads, authored versions and post-backup work. Do not delete records, rewrite the migration ledger or restore a live backup merely to match older application code.

Advanced multipart/hole sculpting, seam/polar/topology adapters, broad editing refinements and persistent draft re-import/automatic cross-session draft restoration are deferred. The current recovery download is a retained human-readable draft, not an advertised import feature. Geo D3 generation, D4 connected scales, D5 artwork, Geo E and Advanced Map Studio remain unauthorized future work.

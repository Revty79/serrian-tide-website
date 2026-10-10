# Worlds Atlas Pass 3B deployment readiness

Starting release: `eafaf373d4037c52a5cd80e8c249b59d44b6a353`. The clean local commit containing this report is the 3B release; the completion response supplies its exact identifier. Both internal checkpoints are complete and independently deployable together, without Pass 3C or the future city/dungeon tools. No push, deployment or existing server-database writes were performed.

## Completed functionality

Existing 3A polygons remain the editable land source. Smooth coastline alters actual coordinates; Add coastal detail inserts real vertices; Sculpt coast reshapes local sections into bays, coves and peninsulas. Freehand mouse/touch outlines become manually editable polygons. Validation protects against invalid topology while preserving original feature, geography and retained vertex IDs.

Nine terrain brushes cover mountains, hills, valleys, forest, grassland, desert, wetland, snow and lakes. Original illustrated SVG marks and coverage derive from saved source paths, seeds, brush sizes, spacing and density. Terrain remains movable, reshapeable, restyleable and undoable; decorative strokes create no geography records. Memoization and separate bounded drawing/mark limits preserve the 3A geometry limits.

Editable curved rivers, streams, roads and trails retain source-point identities. Original mountain/tree, settlement and landmark symbols support position, scale, rotation and appearance. Real settlements/landmarks link to stable World locations; labels retain independent text, position, size, rotation and style. Land, terrain, waterways, paths, symbols and labels have editing visibility/locks. Saved drawing order and backward/forward controls preserve overlaps within layers. Parchment, Illuminated and Night use the shared semantic appearance system.

Full-map PNG downloads render at 2000 x 1200, independent of editor viewport, zoom and selection. Saved working source is unchanged. All artwork is original SVG code; supplied public references informed visual direction and interaction only. No external artwork, graphics package, asset license, upload storage or service is required. See [cartography architecture and reference study](../architecture/worlds-atlas-cartography.md).

Private ownership, explicit read-only Administrator review, revision conflicts, failed-draft retention, explicit saves, unapplied-field/navigation guards, saved-art comparison, draft downloads, archive/restore and session undo/redo remain functional. Land titles use area centroids, and phone labels keep a readable minimum screen size without rewriting saved text sizes. The earlier World History, Chronology and Calendar representations remain unchanged.

## Verification

- Worlds units: **41/41 passed**, including eight new cartography tests for real coastline edits, topology/limits, deterministic editable terrain, invalid representations, saved-creation undo/redo and centroid invariance.
- Navigation, Campaign workflow/membership, appearance, catalog visibility, lifecycle and authorization: **148/148 passed** (42 navigation/Campaign, 12 appearance, 13 catalog visibility, 81 lifecycle/authorization).
- Catalog disposable database: **52/52 passed across seven suites**. Fresh full-chain installation through 0105 and legacy catalog upgrades preserve existing records, provenance, archives, timestamps and private visibility.
- Worlds disposable upgrade/service/browser suite: **passed**. The upgrade contains existing 0102 geometry, data saved through 0103, and painted source saved under 0104 before applying 0105. Reapplication leaves the ledger/data unchanged. Existing calendar evolution, source snapshots, all five historical precisions, catalog, Campaign and active-session data remain unchanged.
- Atlas service checks: stable identities, source/order readback, all nine terrain kinds, strict direct-SQL JSON/coordinate/presentation constraints, same-World FKs, atomic rejection, incomplete older drafts, CAS races, two G.O.D. users, Administrator review and Player denial passed.
- Mandatory 3B browser workflow: existing saved 3A continent -> sculpt bay -> add coastal detail/smooth -> mountain range, forest, editable river, settlement and linked label -> save/reload -> reshape the original coast, move the range, change/reorder forest, reshape river, move/resize settlement and edit label -> save/reload. Original relevant identities and source-point IDs remain stable.
- Further production-browser checks: all terrain brushes, closed freehand island/save/reload, drawing archive/restore, real mouse/touch edits, undo/redo, forced failed saves, actual two-tab conflicts and saved-art comparison, layer locks/visibility, styles and source-preserving PNG export passed. Desktop and phone full-map PNGs are **byte-for-byte identical**. Phone river movement persists with its original source-point ID. No page overflow or browser runtime errors occurred.
- Earlier Worlds production-browser regressions: measured era-label/band positions through zoom/pan and phone/desktop; chronology, calendars and historical reform source retention; existing 3A geometry, navigation/unapplied-field guards and acknowledged-save recovery; classification retention/privacy for both G.O.D. users/Admin; direct-route/API permissions, no-store and CSRF protections passed.
- Password recovery production-build/browser suite: **passed**, including keyboard show/hide controls, all-role recovery setup, hashed codes/downloads/replacement, concurrent consumption/expiry, anonymous phone recovery, session/token invalidation, rate limiting and cross-origin rejection.
- Production builds, route type generation, standalone TypeScript, full repository lint and final focused lint: **passed**. Drizzle metadata check passed; schema generation reported **no schema changes**. `git diff --check` passed.

The homepage change in `86be939` remains an ancestor of this release and its file is untouched. Authentication, Heavens catalog logic, Campaign, Character, Combat, inventory, Form and Evolution implementations are untouched. Existing runtime snapshots, authorization/navigation checks and the recovery regression substantiate preservation; no unrelated full runtime suite is claimed.

## Screenshot review

Actual production-browser captures were inspected and are committed with this release: [desktop canvas](../screenshots/worlds-atlas-pass-3b/desktop.png), [phone canvas](../screenshots/worlds-atlas-pass-3b/phone.png), [full phone page](../screenshots/worlds-atlas-pass-3b/phone-page.png) and [exported map](../screenshots/worlds-atlas-pass-3b/export.png). They show the edited bay/continent, original illustrated terrain, curved river, settlement, linked label and traced island, with readable phone text and usable controls. The exported PNG excludes editing handles and uses the full map. The phone capture includes subsequent touch-painted woodland and coast/river edits. These are synthetic disposable-test Worlds, with no real-user private data. See the [capture details](../screenshots/worlds-atlas-pass-3b/README.md).

## Migrations, release and recovery

Required order: existing migrations through **0103**, then **0104_worlds_atlas_cartography.sql**, then **0105_worlds_atlas_drawing_order.sql**. Apply only pending migrations after verifying the actual target ledger and checksums. Published 0102/0103 SQL and snapshots are unchanged. 0104 was frozen before the ordering correction; that correction uses new migration 0105.

0104 adds strict versioned drawing source, restrictive same-World map/geography links and defaulted map presentation. 0105 adds bounded `sort_order` with default zero, preserving existing 0104 source JSON and archive metadata. Existing equal-order drawings retain their earlier ID order until explicitly saved/reordered. Existing geometry, geography IDs, revisions and timestamps are preserved by the rehearsed upgrade.

These recorded checksums describe the current Windows working-tree bytes. Verify actual deployed migration files against the server ledger; Git line-ending conversion can produce different byte hashes across operating systems.

| Migration SQL | SHA-256 |
| --- | --- |
| 0102 | `19d10e3baed100949cae92c6a275e90af187078fad0beb251e1c1655e8a3d995` |
| 0103 | `4354d2fe2238d47bf518adada15d0c4e129f8ff9ee0d4ecd56141c55962425f7` |
| 0104 | `dcd447d317d3c4e8394d0c0d79cf6e9e10d3dcd304c7c89a64c0124fe2e4c2d4` |
| 0105 | `e52715b2c34613d8360a5a536ec8c07ac4ccb7f8ac67fac48bbbb6be4440de8a` |

No package, environment/configuration, storage, seed or data import changes are required. After separate authorization:

1. Verify the exact release, server/database identity, applied ledger/checksums and a restorable backup; preserve the running release.
2. Pause conflicting writers and prepare the application through the established release process.
3. Apply pending committed migrations in order through 0105 using `npx drizzle-kit migrate`. Never use schema push or rewrite a published/finalized migration.
4. Activate the release and smoke-test owner Atlas editing/save/reopen/export, foreign/Player/anonymous denial, explicit read-only Administrator review, earlier History/Calendars and authentication.

Reverting application code does not reverse either migration. A 3A reader cannot show new artwork and older writers do not understand the full 3B safeguards. Pause Atlas writers during rollback, retain all drawing/geography IDs, source, ordering, constraints and migration ledger, and prefer a forward fix. Backup restoration requires stopped writers, verified target/backup, reconciliation of post-backup edits and matching application/ledger versions. Do not drop new rows/columns or rewind the ledger as a code rollback.

No known blockers remain. Pass 3B is ready for an authorized GitHub push and controlled server deployment. Secure raster backgrounds, generation, connected-scale navigation, city, building-interior and dungeon authoring remain dedicated future increments; no unfinished controls or database dependencies are exposed. The permanent future requirements are recorded in [the Atlas roadmap](../architecture/worlds-atlas-roadmap.md) and AGENTS.md. Development stops at 3B.

## Exact changed files

- `AGENTS.md`
- `docs/architecture/worlds-atlas-cartography.md`
- `docs/architecture/worlds-atlas-roadmap.md`
- `docs/reports/worlds-atlas-pass-3b-2026-10-09.md`
- `docs/screenshots/worlds-atlas-pass-3b/README.md`
- `docs/screenshots/worlds-atlas-pass-3b/desktop.png`
- `docs/screenshots/worlds-atlas-pass-3b/phone.png`
- `docs/screenshots/worlds-atlas-pass-3b/phone-page.png`
- `docs/screenshots/worlds-atlas-pass-3b/export.png`
- `drizzle/0104_worlds_atlas_cartography.sql`
- `drizzle/0105_worlds_atlas_drawing_order.sql`
- `drizzle/meta/0104_snapshot.json`
- `drizzle/meta/0105_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/worlds-atlas-checks.ts`
- `scripts/worlds-cartography-checks.ts`
- `scripts/worlds-pass-one-disposable.test.ts`
- `src/app/globals.css`
- `src/db/world-atlas-schema.ts`
- `src/features/guidance/page-help.ts`
- `src/features/worlds/atlas-coordinates.ts`
- `src/features/worlds/atlas-map-editor.tsx`
- `src/features/worlds/atlas-service.ts`
- `src/features/worlds/atlas-workspace.tsx`
- `src/features/worlds/atlas.module.css`
- `src/features/worlds/atlas.ts`
- `src/features/worlds/cartography-controls.tsx`
- `src/features/worlds/cartography-export.ts`
- `src/features/worlds/cartography-scene.tsx`
- `src/features/worlds/cartography.module.css`
- `src/features/worlds/cartography.test.ts`
- `src/features/worlds/cartography.ts`
- `src/features/worlds/coastline.ts`

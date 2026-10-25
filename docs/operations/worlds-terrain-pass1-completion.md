# Atlas rebuild Pass 1: local completion receipt

October 24, 2026. Scope: the integrated lightweight numerical heightmap editor in this website's Worlds workspace, including the supplemental PostgreSQL/persistence directive. The implementation checkpoint is the local commit containing this receipt; its exact SHA is supplied in the final handoff. Starting parent: `ce60eb7f79a2926e27a777738aa05d8973b879ae` on `main`, initially clean and equal to GitHub's live `main`. No remote push or deployment is included.

## Delivered behavior

Worlds has a functional Atlas destination with multiple creator-owned flat-world maps, named ocean/land starts, custom physical extents and grid proportions, fixed or east/west wrapped edges, independent elevation bounds, a responsive Canvas2D viewport, adjustable Raise/Lower/Smooth brushes, elevation inspection, sea-level preview, pan/zoom/fit, undo/redo, explicit accepted saves and browser recovery. Leave, reopen and continue sculpting the same numerical geography. Administrator review remains read-only, ordinary previews exclude creator terrain, and foreign owners/Players/anonymous visitors cannot access it.

Only the new guarded terrain API is active. The former Atlas/geography/raster HTTP boundary remains disabled. All prior maps, source records, private imported assets, historical appearances, connections, Realm links and non-Atlas Worlds authoring are retained. No gameplay Town, Shop, NPC or Tabletop record is created.

## Architecture and changed files

The [foundation design and audit](../architecture/worlds-terrain-pass1.md) explains reuse and extension decisions. Existing `world` ownership and `world_atlas_map` identities remain; the latter's legacy drawing dimensions are not the new editor's coordinate model. Four new tables separate representations, numerical geography, accepted revisions and private tile references: `world_map_canvas`, `world_terrain`, `world_terrain_version`, `world_terrain_tile`.

Numerical objects reside in private `storage/world-terrain` by default, or `SERRIAN_TERRAIN_ROOT`. PostgreSQL references immutable SHA-256 keys, 2048-byte lengths and the `i16le-v1` encoding. Files contain 32×32 little-endian signed integer elevations. Empty space uses a persisted base elevation. Maps carry their own planar metre frame and sample dimensions. Rendering pixels are derived, never authoritative.

* `src/features/worlds/terrain.ts`, `terrain-canvas.tsx`, `terrain-renderer.ts`, `terrain-editor.tsx`, `terrain-recovery.ts`, `terrain.module.css`: numerical editing, viewport, presentation, controls, undo and browser recovery.
* `terrain-service.ts`, `terrain-storage.ts`, `src/app/api/worlds/[worldId]/terrain/route.ts`, `src/db/world-terrain-schema.ts`: owner guards, validation, staged private writes, atomic accepted revisions and integrity-checked reads.
* `world-workspace.tsx`, `atlas-availability.ts` and its tests, shared page guidance and `AGENTS.md`: integrated navigation, unsaved-work safeguards, continued legacy protection and current development direction.
* `drizzle/0133_worlds_editable_terrain.sql`, its generated snapshot/journal, `drizzle.config.ts`, `.gitattributes`, `.gitignore`: additive schema, immutable history/head/grid guards and private storage exclusions. Authorship is added to the account-deletion retention inventory and its tests.
* `scripts/worlds-terrain-*`, `scripts/terrain-storage-audit.ts`, `scripts/terrain-backup-restore.ts`, and `terrain.test.ts`: focused numerical, database, upgrade, restore, production-browser and real DEV checks.

The [complete file inventory](../reports/worlds-terrain-pass1-files.txt) accompanies the commit.

## Saving and recovery

Brushes modify a local numerical preview. Recovery automatically records local changed tiles and pending save identities in IndexedDB, separately from accepted server data. Save stages/fsyncs/validates private binary objects before committing the revision, tile references and head in one PostgreSQL transaction. Eight bounded I/O tasks avoid serial file latency; repeated identical tile content reuses its immutable object. History and accepted bytes are retained.

An interrupted save cannot commit a head referencing an incompletely staged file. Failed transactions can leave unreferenced objects and request manifests; the read-only storage audit identifies them without deleting anything. Lost-response retries reuse the same operation identity. Conflicts preserve the draft and reject stale replacement. Undo after a lost response remains a local change after retry and can be explicitly accepted; pending tile coverage also stays in browser recovery. Reopen checks every referenced checksum and byte count, and fails rather than substituting blank data when a file is missing or corrupt.

## Validation

| Check | Result |
| --- | --- |
| Normal production build | Passed with Next 16.3.2 Turbopack and genuine Google font downloads in an owned full-source checkout. Final runtime source was rebuilt and exercised. |
| TypeScript | Passed standalone and in the production build. |
| Full lint | No errors; the existing unused `LoreFamily` warning in unchanged `scripts/worlds-stories-checks.ts` remains. Changed-file lint has no warnings. |
| Feature regressions | **2,271 passed, zero failed**, using the CSS loader and four concurrent test processes. The direct older `validate:worlds` command lacks that CSS loader; use the full feature runner or the command below. |
| Fresh database | All 134 migrations replayed in a newly owned loopback PostgreSQL cluster. |
| Populated upgrade | 0132-to-0133 rehearsed over retained vector-map identity and historical appearance; rows across all 322 prior tables remained exact. |
| File/transaction recovery | Injected failure after staging left the accepted head unchanged; abandoned objects/stages were identified; a paired dump/private-file restore was exact; deliberately damaged bytes failed checksum validation. |
| Persistence and large edits | Full 640×384 numerical grid saved/reopened exactly; malformed/duplicate/out-of-range edits rejected atomically; unrelated cells and maps retained. Accepted history update/delete/truncate and invalid head/grid writes rejected. |
| Desktop journey | Create ocean map, sculpt mountains/valleys, smooth, undo/redo, change sea level, save, leave/reopen, restart app, continue, recover after reload, retry a lost response, preserve undo after retry, reject competing saves, create a second land map and switch back. |
| Phone | 390×844 touch-emulated Chrome: sculpt/save, readable controls and no page overflow. This is not physical-phone evidence or owner acceptance. |
| Authorization and preservation | Owner G.O.D./Admin, explicit read-only Admin review, foreign owner, Player, anonymous, ordinary privacy and CSRF checked. Forty legacy map/source/history tables and 133 gameplay/runtime tables unchanged. All twelve information destinations and thirteen creator families still function. |

Measured on this DEV PC: 84 desktop brush batches averaged **0.51 ms**, maximum **2.70 ms**. The 240-tile / 245,760-sample / 997,213-byte full-grid service save took **936 ms** in the final run. The phone-emulated single-dab measurement was 1.40 ms; it is a small responsiveness sample, not a broad mobile performance claim. Rendering updates affected tiles and neighbors in progressive animation-frame batches with a 6 ms work target. Terrain calculations use CPU code and Canvas2D, without a WebGL terrain engine.

Receipts and personally inspected images:

* [Desktop editor](../screenshots/worlds-terrain-pass1/terrain-desktop.png), [phone editor](../screenshots/worlds-terrain-pass1/terrain-phone.png), [conflict protection](../screenshots/worlds-terrain-pass1/terrain-conflict.png).
* [Production/database/Worlds results](../screenshots/worlds-terrain-pass1/results.json), [terrain browser results](../screenshots/worlds-terrain-pass1/terrain-results.json), [upgrade/restore results](../screenshots/worlds-terrain-pass1/upgrade-results.json).
* [Real DEV editor](../screenshots/worlds-terrain-pass1/terrain-real-dev.png), [DEV migration receipt](../screenshots/worlds-terrain-pass1/dev-migration-results.json), [DEV HTTP/restart receipt](../screenshots/worlds-terrain-pass1/dev-browser-results.json).

## Actual DEV changes

Confirmed target: `localhost:5432/serrian_tide_dev`, user `serrian_tide_app`; the pre-migration database contained one World and no maps. Its ledger contained migrations 0000–0132. Migration 0132's stored digest matched the exact LF version of the unchanged repository SQL; Windows checkout CRLF accounted for the difference. Its file and existing ledger entry were not rewritten.

A PostgreSQL exported-snapshot backup was made at `artifacts/worlds-terrain-pass1/dev-backup/before-0133.dump`, SHA-256 `dbf9cd6abb4c16dba55aea827045573e106910b70297a87f53d709a66c860982`. There were no authored terrain files before this migration. That dump was actually restored into a new isolated cluster and rehearsed through 0133 before DEV application; all existing rows remained unchanged. Row comparisons explicitly use C collation so restore-cluster locale does not change the comparison order.

Legacy nested CHECK validators require a public lookup path during dump replay. The reviewed restore helper sets only the trusted restore session's lookup path; it does not alter validator functions, historical migrations or stored rows. Preserve this helper/runbook when restoring a populated backup.

Applied to actual DEV: **0133 only**, ledger now 134 entries. Normal authenticated website HTTP routes created a clearly labelled verification World and terrain, saved them, closed the editor, restarted a separately owned full-website **development** process, reopened exactly identical numerical data, then undid/redid and saved continued edits through revision 3. Twenty-six private tile references were checked against their actual saved bytes. The owner's existing development server was not restarted. The verification World is retained **archived**; all pre-existing World rows remained exact. The temporary owner test session was deleted and its remaining count independently checked as zero. No role grant or existing login/session alteration was needed.

## Limits and future compatibility

This is the first terrain slice: 32–1024 samples per axis in multiples of 32, signed integer metres within independently chosen bounds of −30000 to 30000, at most 64 maps per World, one derived elevation style, and stable dimensions after creation. Very small grids cap brush radius to half their width. Undo retains up to 60 session steps and one million changed samples; accepted revisions remain durable. Recovery belongs to this browser and is not a cross-device backup. Conflicting drafts can be downloaded; automatic merging is not implemented.

Regional refinement, authored layers, generation, rivers/erosion, map resizing, terrain revision browsing, canon publication, invited editors, location placement queues and Town/Shop Builder relocation remain later work. The foundation separates terrain from representations and semantic places; exact revision references and shared coordinate frames allow those extensions without making legacy vector coordinates authoritative. Current owner-only permissions stay in force.

Independent exact-commit review and owner usability/artistic acceptance are not recorded by these technical checks.

## Controlled release and rollback

There is no runtime blocker for this bounded slice in the validated environments. This is a local review checkpoint; remote publication and server deployment still require explicit owner authorization.

For a separately authorized release: verify the target and ledger, protect a paired database/private-terrain backup and restore it in isolation, apply committed migrations in journal order (0133 after 0132), provision durable private terrain storage outside public files, install locked dependencies, build the exact reviewed commit, then activate and run authenticated/role-specific checks. Prefer an explicit absolute `SERRIAN_TERRAIN_ROOT` with application read/write access and enough space for retained versions. Keep existing imported raster storage separately intact. `.gitattributes` preserves 0133's applied LF bytes. No `.env.local` secret change was made.

Back up PostgreSQL and the complete private terrain root together while writers are stopped or under a coordinated snapshot procedure. Include immutable objects referenced by historical revisions, not only current heads. Run the integrity/staging audit against the intended database/root pair; unreferenced/in-flight status alone does not authorize deletion.

A code revert does not remove 0133 or its data. The prior removal release ignores the additive tables and keeps legacy map routes disabled. Preserve all new terrain objects and versions; older Atlas editors must not write these new identities. Prefer a forward fix. If restoring the pre-0133 backup, stop writers, preserve/reconcile every later change (including the archived verification fixture), and restore a matching database/storage/code state rather than deleting ledger entries or tables.

Useful commands:

```powershell
node --conditions=react-server --import tsx scripts/worlds-terrain-disposable.test.ts
node --conditions=react-server --import tsx scripts/worlds-terrain-upgrade.test.ts
node --env-file=.env.local --conditions=react-server --import tsx scripts/terrain-storage-audit.ts
$tests = @(rg --files src/features -g '*.test.ts' -g '*.test.tsx')
node --import ./scripts/register-test-css.mjs --import tsx --test --test-concurrency=4 @tests
```

The migration and real-DEV browser scripts require explicit flags and validate the local DEV target. Do not rerun them as ordinary regression commands against shared or Production targets. Detailed logs, restored clusters and private backups remain ignored under `artifacts/worlds-terrain-pass1` or owned temporary directories; they are not part of the Git checkpoint.

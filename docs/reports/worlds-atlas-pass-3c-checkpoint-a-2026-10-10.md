# Atlas Pass 3C — independently usable Checkpoint A

Starting release: `444ebf0de75637d5c62a1ede4d4ac83e2d25bdc1`. This checkpoint delivers the original seeded native generator, bounded settings/presets/placement, unsaved preview, safe acceptance into the ordinary editor, duplication, new-map variation and private immutable creation provenance. Description interpretation is reserved for Checkpoint B; no unfinished description control is exposed here.

## Verification

- Worlds unit suite: 45/45 passed, including 25 generated preset/seed combinations and deterministic arrangements, real separated polygons, exact requested land/water groups and sampled rendered rivers staying on land to the coast.
- Disposable Worlds migration/service/browser regression: passed. Existing 0102–0105 maps/drawings, chronology/calendar/history, catalogs and Campaign/active-state fixtures survive 0106 unchanged. Ledger reapply, invalid SQL metadata, same-World sources, atomic failures and idempotent concurrent creation passed.
- Isolated full production build and TypeScript verification: passed; standalone `npm run typecheck`: passed.
- Existing production-browser regressions: private roles/review, tags for two G.O.D. users/Admin, CSRF/no-store, historical dates and measured era positions, real two-tab conflicts, manual 3A/3B tools, PNG export and phone workflows passed.
- Mandatory generated-map sequence passed: save/reload; sculpt a bay; move an island; change range points, forest density and river points; add a linked named settlement; save/reload with stable original source IDs; duplicate and generate a different new design while originals remain unchanged.
- Drizzle check passed; generation reports no schema drift. Lint passed after correcting two test-fixture declarations.
- Actual full maps, desktop controls and edited/phone captures were inspected. Visual corrections replaced gridlike island distribution, strengthened coastline detail and added bounded land-safe river meanders. Screenshots are committed under [Pass 3C evidence](../screenshots/worlds-atlas-pass-3c/README.md).

## Deployment readiness

Architecture, technology/licensing review, settings, source contracts and recovery are documented in [native generation](../architecture/worlds-atlas-generation.md). No new packages or environment configuration are required. Apply pending migrations in journal order, ending with **0106 after 0105**, only after target/ledger/backup verification and authorization. Keep Atlas writers paused during release activation/recovery. Earlier migration SQL and snapshots remain untouched.

Checkpoint A is usable independently; later description interpretation is not a runtime dependency. Returning to 3B code leaves 0106 and native generated source in place; it removes generation/provenance interfaces, not persisted content. A Git revert does not reverse database changes. Retain the schema/ledger and prefer a forward fix; restore only a verified backup with post-backup edits reconciled.

No remote push, deployment or existing server database writes were performed. No Pass 3D, canon, city/dungeon, homepage, authentication or mechanical Campaign changes are included. Usage balance is not exposed by this session.

# Atlas Pass 3D

Starting checkpoint: `7eeb29e5c1da3dc4ac46c72bc27e7e4701b93e65`. Release checkpoint is the local commit containing this report; the exact commit identifier and clean worktree are reported on completion. No remote push, server deployment or Production database operation is part of this pass.

## Delivered architecture and experience

Maps now explicitly represent the whole World or a stable existing geography. Many charts may represent one place. User-authored preferred connections identify the source map, place and destination by ID, with same-World foreign keys. Other associated charts remain explicit choices. Authored destinations can open another geographic level or a World overview, and changing a map's represented place retains its incoming links. Connections use the source map revision and locked World transaction, retaining conflict protection alongside geometry edits.

Explore is separate from the existing editor. Select visible artwork or named place buttons, read authored descriptions/type/parent/related places, choose detail maps and return through geographic ancestors, World map choices, Previous map or browser Back/Forward. Geographic ancestry and the bounded visit trail are separate. Deep URLs retain the selected World and explicit Administrator review. Per-map views are remembered within a session. Failed reads retain the displayed map and viewport with Retry. Archived destinations retain their references, become unavailable and reconnect on restoration. Names, coordinates and reshaped or archived features never replace geographic identities.

Location contexts add region, local area, settlement, building site and interior classification to the existing location model. Physical continents/islands retain their kinds and closed outlines. Regions remain location markers and may appear on overlapping map contexts; no political-border simulation, extra region landmasses or duplicate Heavens Towns are introduced. Future city/building/dungeon charts can use these relationships with today's generic local drawing tools. Dedicated construction remains Pass 3E.

The new authorized map read returns only one map's full artwork with lightweight destination headers, World geographies and connections. It mounts one viewer, retaining existing SVG source, terrain caches, lazy library thumbnails and background generation. Generator v1/v2 semantics, creation provenance and published migrations remain unchanged. The viewer measures its own SVG layout before paint to keep label sizing correct as the interface opens.

See [relationship design](../architecture/worlds-atlas-navigation.md) and [screenshot evidence](../screenshots/worlds-atlas-pass-3d/README.md).

## Verification

Executed successfully:

- Worlds units: 58/58, including multiple charts, archived preference retention and independent ancestry/visit history.
- Existing navigation, authorization, privacy, appearance, lifecycle and Campaign membership/workflow units: 148/148.
- Catalog/Race/Creature/Skill/Derived Ability regressions: 298/298.
- Forms, Evolution, Combat screen and focused Character/firearm regressions: 99/99. The existing migration-list assertion ended at 0096 and failed with the already-published 0097–0107 chain. It now retains the exact old prefix and checks all SQL against the complete ordered journal instead of rejecting every subsequent migration. No firearm runtime code changed.
- Catalog disposable database suite: 52/52 tests in seven existing suites pass over the complete new migration chain, including canon/privacy, retained references, account deletion and Derived Ability runtime.
- Production builds and TypeScript; full repository lint; Drizzle check and generate-with-no-drift.
- Disposable 0108 upgrade over existing 3A/3B/v1/v2 generated source and metadata; original row projections, user/catalog/History/Campaign/active-session snapshots preserved. Migration ledger complete and reapplication safe. Fresh install rehearsed by the catalog suite.
- Connected service checks reject cross-World destinations, guessed IDs, self-links and hierarchy cycles; allow explicit cross-level/overview connections without inventing a map parent. Stale relationship writes conflict. Associated duplication and copied preferences retain shared geography identities with new representation IDs.
- Connected production browser workflow passes World → continent → authored region → town, multiple charts, actual source selection, source movement/rename, reload, Back/Forward, failed-read retry, archive/restore and explicit read-only Administrator review, including phone layout. Final run adds measured openings and native phone touch pan to the complete existing Worlds/Atlas regressions.

- Password-recovery disposable production build/browser regression passes keyboard show/hide, every role's recovery setup, password confirmation, hashed storage, code download/replacement, concurrent consumption and expiry, anonymous phone recovery, old-password rejection, single-use tokens, session/code invalidation, cross-origin rejection, rate limits and absence of browser runtime errors. Authentication implementation was not changed.
- Actual desktop and phone screenshots were inspected. All 28 new PNGs and both measurement JSON files are committed under `docs/screenshots/worlds-atlas-pass-3d/`; earlier pass evidence remains unchanged.

During verification, the browser caught an initial native-history integration bug: copying Next's internal state prevented search-parameter subscribers from updating after place selection. The implementation now supplies only the Atlas visit trail, and the actual URL-and-panel regression passes. Test-only offscreen clicks and shared synthetic sign-in rate-limit collisions were corrected without changing application security policy. Final visual inspection also corrected a question-mark separator in destination choices; the connected production workflow and screenshots were rerun afterward.

## Changed files

- Model/schema/migration: `src/features/worlds/atlas.ts`, `src/db/world-atlas-schema.ts`, new `drizzle/0108_worlds_atlas_navigation.sql`, its snapshot and appended journal entry.
- Server reads/commands: `src/features/worlds/atlas-service.ts`, existing Atlas API route.
- Viewer/navigation/association controls: new `atlas-navigation.ts`, `atlas-explorer.tsx`, `atlas-connections.tsx` and navigation units; existing Atlas workspace, map editor, record editor, cartography scene, Atlas stylesheet and World workspace.
- Guidance and design: shared page help, Atlas roadmap, new navigation architecture document, this report and screenshot README.
- Verification: new `scripts/worlds-connected-geography-checks.ts`; disposable Worlds harness; optional capture destinations in existing generation/refinement checks; stale baseline migration-list test described above; tracked production screenshots and measurement JSON.

## Limitations and performance

Each geography has one optional parent. Overlapping/cultural regions are independent location identities and map representations, not simulated borders or multiple-parent area polygons. Breadcrumbs select ancestors and their chart choices; they do not invent a unique map parent. Current generic local cartography can represent future sites but has no dedicated city streets, building rooms or dungeon floors. No new Campaign sharing, System Canon flags, public discovery, secrets policy or actual 3D rendering is introduced.

The library remains the existing full World bundle with lazy thumbnails; very large map libraries may need later pagination. Explore loads one source scene per read and indexes relationships once per loaded bundle. Source-rich cached charts and desktop/phone navigation are measured in committed JSON. In the final connected run, ordinary desktop openings take 223.5?527.3 ms and phone openings 203.1?414.1 ms. The separate 5,069-mark source takes 2,519.6 ms to open and warm its terrain caches; leaving that dense scene for its detail chart takes 1,389.6 ms. These readings include real authorized loads and Playwright interaction overhead. The retained dense-editor regression measures 5,460 native marks and 107 drawings: pan frame p95 18.1 ms, zoom frame p95 36 ms and one 74 ms long task during terrain editing. Hardware/cache warm-up affect timings; this pass does not promise uniform performance across devices.

## Deployment and recovery

Required migration: `0108_worlds_atlas_navigation.sql`, after finalized 0107 and all earlier unapplied entries in journal order. Earlier SQL and snapshots are immutable. No package, service, environment variable or configuration change is required. Do not use schema push.

For an authorized controlled deployment:

1. Verify the release commit, server/database identity and actual migration ledger. Protect a verified database backup and current application release.
2. Stage dependencies/build using the server's existing environment. Pause writers while applying committed pending migrations in journal order with `npx drizzle-kit migrate`.
3. Activate the verified application release through the existing server process. Smoke-test sign-in/recovery, existing systems, owned Worlds, connected maps and explicit read-only Administrator review on desktop and phone.

The schema is additive and old read projections remain compatible. Older writers do not understand new map associations, geographic classifications or preferred references, so keep authoring paused if temporarily restoring the older application. Prefer a reviewed forward fix. A Git revert does not undo migration 0108 or its ledger. Never delete live columns/links or edit migration history to downgrade. If a backup restore is required, stop writers, protect post-backup changes, restore to a verified target and reconcile both data and release versions.

Pass 3D is independently deployable and ready for an authorized GitHub push and controlled server deployment. No known completion blocker remains. No remote push, deployment or Production write was performed. No usage/quota meter is exposed in this session. Development stops here; Pass 3E city/dungeon construction is not started.

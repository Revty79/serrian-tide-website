# Atlas UX-0A documentation and preparation report

Date: **2026-10-15, America/Denver**. Scope: agreed roadmap, final bounded contract and read-only DEV preparation only. Implementation authorization is pending. See the [contract](../architecture/worlds-atlas-ux0a-contract.md) and [unified roadmap](../architecture/worlds-map-maker-decisions.md#revised-completion-roadmap--adopted-2026-10-15).

## Verified reset target

Verified at **2026-10-15 20:15 MDT** (receipt timestamp `2026-10-16T02:15:49.185Z`). Configuration was parsed without logging credentials. Before catalog/content reads, the verifier required the configured loopback host, port 5432 and exact `serrian_tide_dev` name, then verified the actual server identity in a repeatable-read read-only transaction. The transaction was rolled back and the connection closed. No fallback/Production connection, DDL, migration, application save or shared-service action occurred.

| Check | Current result |
| --- | --- |
| Database / role | `serrian_tide_dev` / `serrian_tide_app` |
| Actual server | `::1/128`, port 5432, PostgreSQL 18.0 |
| Search path / transaction | `"$user", public` / read-only `on` |
| Public base tables | 322 |
| Migration ledger | 132 of 132 committed entries; every ordered SHA-256 and timestamp matches |
| Latest migration | `0131_worlds_categorical_rasters` |
| Worlds / Atlas maps | 0 / 0 |
| Geographic surfaces / features / versions | 0 / 0 / 0 |
| Raster sources / versions / asset rows | 0 / 0 / 0 |

The private sanitized receipt is `artifacts/guidance/atlas-ux0a-preparation/2026-10-15-readonly-verification.json`. The configured URL and credentials are not included. This is a point-in-time check and must be repeated before future target use. Matching migration hashes are not proof of full runtime schema parity or a successful application build.

## Prior material preserved

The two canonical manifests under `storage/world-raster` and six retained manifests under `artifacts/guidance/geo-repair/paired-assets` remain present. Their eight manifest checksums were reread and match their content-addressed bundle names. The canonical manifests declare 49,164 categorical and 11,142 numerical/display entries. Four additional fictional retained bundles declare 23, 23, 36 and 36 entries. This pass did not rehash every asset or repeat the prior exact restoration; those earlier receipts remain historical evidence.

The pre-reset checkpoint pointer `artifacts/guidance/map-maker-readiness/latest.txt` still identifies `checkpoint-N8tSWD`; its dump/private-assets and older separately labelled fixture are retained. Do not mistake the pointer for a current backup of the reset DEV contents.

Protected external retention was checked read-only at `D:\serrian-tide-backups\map-maker-development-20261016T002808Z`:

- `checkpoint.tar`: present, 2,699,837,440 bytes.
- `retention-results.json`: present, 1,459 bytes.
- `verification-followup.tar`: present, 768,000 bytes.

No archive was replaced, restored, extracted or rehashed in this pass. No claim of new full-backup verification or off-device retention is made. These are protected historical resources; deleted Earth recovery is canceled. Native regional 10-metre land-cover acquisition remains later approved scope; the retained global overview is about 594 metres.

## Architectural and migration outcome

The agreed source-format design requires **one new additive validator migration**, provisionally `0132_worlds_atlas_starter_library.sql`, with numbering rechecked at implementation time. Existing 0104 drawing/presentation functions strictly accept v1 and reject new keys. Historical payload wrappers delegate to these validators. The contract specifies retained v1 validation/rendering, v2 pinned asset/style references, strict checks, fresh/populated rehearsals and rollback limits. No SQL, snapshot or journal entry was generated or applied here. No new database tables are presently required by the chosen design.

No unresolved architectural decision blocks approval of the bounded brief. Artistic quality, geographic-mask/projection behavior, historical v1/v2 compatibility, local recovery and phone/resource costs remain implementation risks with explicit gates. Any new-table/additional-migration need or scope/budget change requires a documented amendment before that work.

Prior readiness work recorded runtime-schema verifier/snapshot/deparsed-expression discrepancies. This documentation pass neither repairs nor reruns that full checker. Do not infer it passes from the complete ledger match. The implementation must disclose and resolve/agreedly classify required validation failures in disposable infrastructure before joint readiness; no automatic approval exception is created here.

## Documentation validation and approval gate

Changes are limited to repository guidance/architecture/operations documentation, plus the ignored read-only preparation receipt. No application code, artwork, migration, package, private source or data record changed. Documentation validation passed: all 72 relative links/anchors resolve, roadmap/contract coverage and UTF-8 encoding checks pass, and staged `git diff --check` is clean. The migration/rollback, preservation and joint approval language were reviewed. Build/runtime/browser tests are intentionally not rerun for this documentation-only checkpoint and no new runtime pass is claimed.

Stop at a clean local documentation review commit without push. Owner approval must explicitly cover the [final UX-0A contract](../architecture/worlds-atlas-ux0a-contract.md), including its planned validator migration, before implementation. No asset production, test-infrastructure startup, persistent authoring, Production work, deployment or owner-testing invitation occurs now. Later writes belong only to newly owned isolated disposable targets; the empty-World application journey and populated legacy compatibility/recovery targets stay separate. Both Cody and Ember must approve the completed implementation commit and evidence before the owner is invited to test.

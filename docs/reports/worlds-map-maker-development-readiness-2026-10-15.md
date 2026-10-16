# Map Maker development readiness - 2026-10-15

Authorized scope: adopt the revised remaining roadmap, verify the current development recovery point, rehearse isolated recovery and prepare UX-0 owner acceptance. Application base: technically approved UX-0 `b40bccc2cced333832b55239c77bcb21d165bb95`. This documentation checkpoint's commit is the containing commit; resolve it with `git log -1 --format=%H -- docs/reports/worlds-map-maker-development-readiness-2026-10-15.md`.

## Roadmap and authorization

The [adopted roadmap](../architecture/worlds-map-maker-decisions.md#revised-completion-roadmap--adopted-2026-10-15), Atlas roadmap, Studio handoff and AGENTS.md now agree on the five completion standards and remaining order. The [readiness procedure](../operations/worlds-map-maker-development-readiness.md) separates recoverability, owner acceptance and release readiness. It includes an owner task/outcome record.

D3-B needs a precise terrain/elevation brief and separate authorization. The Geographic Data Library, supported fresh-Earth creation, native regional 10-metre classification before E, Glass Sea preservation, D4/E historical-layout review, D5 local-map assets and later application-wide cleanup remain required. No later implementation began.

## Current DEV and recovery evidence

Positive read-only verification selected the intended local DEV database, actual server address/port, application tables, search path and all 132 committed migration hashes/timestamps. The successful captured snapshot has 322 public tables and one World with one Atlas map; the earlier read-only inspection had zero maps, so concurrent activity occurred before that snapshot. No geographic features or raster versions/assets were present. The two surviving canonical C2/C3 bundles are unassociated private files. This is the current checkpoint; no lost Earth or replacement demonstration was restored into shared DEV.

Recovery results are recorded in the [sanitized evidence receipt](worlds-map-maker-development-readiness-evidence.json). Full snapshots, SQL schema, dump inventory, private manifests, local target identities, hashes and operational logs remain outside Git in the protected ignored `artifacts/guidance/map-maker-readiness` directory. `latest.txt` identifies the completed current checkpoint; interrupted attempts remain separately retained and are not successful recovery evidence.

The database capture uses an exported repeatable-read snapshot for the custom dump and complete table comparisons. Restoration uses a new owned loopback PostgreSQL cluster and a separate private asset root. Ownership and grants are intentionally omitted when restoring under the disposable owner; application schema objects, table rows, migration ledger and sequence state are compared independently. This does not establish restoration of server roles or their operational grants.

The rehearsal passed: all 323 tables, complete row-content digests, sequence state, schema definitions and 132 migration rows are exact. All 60,306 declared assets and both manifests were restored and checked, including full retained elevation/classification value hashes. Original database content and rehashed source files were unchanged in the final comparison. The owned recovery cluster is stopped.

A new protected archive outside the checkout retains the complete current checkpoint and a separately labelled copy of the older six-bundle UX-0 fixture, including historical/fictional originals and its own paired dump/receipt. Every one of its 120,750 file/hardlink members was checked against the source digest inventory; its size is 2,699,837,440 bytes. Its checksum and exact private location are retained in the checkpoint's `retention-results.json`. The external directory grants access only to the operator account, SYSTEM and Administrators. This copy is on the same D: volume: **off-device/separate-failure-domain retention is not verified**.

No active raster associations exist in this DEV checkpoint. The full geographic `raster readiness` release gate therefore remains unsatisfied; its requirement for associated canonical sources is unchanged. A recoverable empty geography catalog is not a populated geographic installation or a Production activation approval.

## UX-0 owner review preparation

A separate new disposable fixture is prepared from the previously verified UX-0 acceptance backup, with the unchanged approved production build. It retains five fixture Worlds/maps, 16 raster versions and all six canonical/fictional bundle associations. It is not the pristine restoration of today's DEV and does not establish a fresh Earth through the website. Its private configuration and task results remain beside the readiness evidence.

Fresh Chrome checks passed at 1440 × 900 and 390 × 844 with mobile/touch emulation on the latter. Both relief and classification rendered; the canvas stayed within the viewport; browser page errors were zero. The two screenshots were visually inspected. These are limited environment smoke checks, not a repeat of the entire UX-0 regression suite or physical-device/owner acceptance. The helper's temporary authentication and hidden-settings assertions were corrected before the successful run; no product code changed.

The prepared fixture is stopped. To begin a local owner-review session from this checkout, use the retained Node 22 helper below, then open the local `/worlds` URL it prints and sign in with the account credentials retained in the fixture snapshot. Ctrl+C stops only its application and owned PostgreSQL cluster. It uses the private operator receipt, not `.env.local`, and never starts shared services.

```powershell
& artifacts/guidance/geo-repair/tools/node-v22.23.3-win-x64/node.exe --conditions=react-server --import tsx artifacts/guidance/map-maker-readiness/owner-acceptance.ts serve
```

This command depends on the retained local operator artifacts; it is not a new application/deployment entrypoint. Use the documented isolated fixture procedure to prepare another machine rather than copying private receipts into Git.

The owner task record remains **pending** for discoverability, drawing/editing, independent saves and reopening, failed-save/conflict recovery, connected settlement/interior/dungeon journeys, desktop and physical-phone comfort. Existing technical screenshots and automated smoke checks cannot provide the owner's decision. The retained baseline fixture has generic geographic maps; specialized journeys may require creating disposable examples through the existing application workflows. No permanent content or new canon is implied.

## Validation, deployment and recovery

This checkpoint changes documentation only. The current runtime fingerprint is `e96bc14cb1f4b194976686623c68a005b58750446b108dbeac172b8bf858210a`, exactly matching the approved UX-0 production build and its committed 102-check browser evidence. Those build/unit/regression results are retained evidence, not new executions during this documentation pass. TypeScript and full ESLint were rerun: TypeScript passed; lint has zero errors and the existing unused `LoreFamily` Stories warning.

Schema health has a separately recorded tooling limitation. The unchanged standard `validate:runtime-schema` checker **did not pass**: JSONB default text ordering/spacing differs; a diagnostic that compares JSONB values then finds `world_entry_visibility_valid`, which is present in committed migration 0114 and both databases but absent from the snapshot inventory; accounting for that exact guard then exposes history-search index expression formatting. No checker code, finalized migration or snapshot was edited.

All 132 committed migrations successfully ran in an additional new disposable database with 322 public tables. Comparing its complete schema with the captured DEV schema found exactly 22 single-line CHECK-expression renderings: 21 add parentheses around leading AND groups and one casts the same four varchar literals individually to text rather than casting their array. All non-CHECK definitions, including the privacy guard and history-search index, match exactly. These observations explain the representation/inventory discrepancies; the raw schema-text comparison and standard checker remain recorded as failures. No automatic schema-health gate is claimed green, and verifier maintenance remains separately scoped. The additional owned cluster is stopped.

No migration, schema, dependency, runtime configuration, engine, dataset or UI code changed. Existing migration ordering remains through 0131. No push, Production contact, deployment, Docker operation, shared-service restart or persistent DEV write occurred.

This checkpoint may be reviewed locally. Owner usability acceptance, verified off-device backup retention, schema-verifier maintenance and target-specific geographic release validation remain outstanding. Before any separately authorized deployment, verify the target/release/ledger, protect matched backups and the running release, stage the build, then perform role-specific desktop/phone smoke checks. Reverting this documentation commit does not undo data or creator edits. Recovery restores a matched dump and private assets only into a verified authorized target, preserving post-backup changes for reconciliation.

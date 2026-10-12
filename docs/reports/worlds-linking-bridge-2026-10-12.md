# Worlds linking bridge — review handoff

Starting commit: independently technically reviewed Repair I `46497452b17c1b2b8496809105b971715cd23a3b`. The owner explicitly accepted that exact pushed appearance. The checkout was clean and synchronized at that SHA before bridge implementation. This report is part of the local bridge commit; its exact release SHA is supplied with the completion handoff.

## Implemented

- Realms connect to genuine saved Atlas map identities, independently of existing geographic/place associations. Multiple maps per Realm, shared maps, abstract Realms, author labels, perspectives, interpretations, privacy and two-way navigation are supported.
- The eleven existing World-native society families connect to calendar traditions, exact rules/version/revision, or saved year-counting systems. Roles, uncertain or independently unknown boundaries, overlaps and competing interpretations remain authored narrative. Existing Primary calendar adoption accounts can supply their own authoritative period; no second adoption/evolution system is introduced.
- Profiles, Atlas editing/exploration, Calendars and Chronology use contextual disclosures, saved names, shared guidance and semantic appearance variables. The record being viewed is fixed in its connection form. Related records open in another tab, preserving selection and drafts. The existing map guards now permit these separate-tab links while retaining discard confirmation for links that leave the editor.
- Stable connection identities, immutable source/content versions and timeline-specific heads support conflicts, identical creation retries, archive/restore and explicit parent inclusion/exclusion. Parent changes do not silently establish or update connections in another timeline. Existing adoption/evolution remains Primary-only; alternate timelines can write their own cultural interpretations.
- Ordinary projections filter the complete relationship and its retained/effective sources before list bounds, choices, counts and inverse views. Protected Realms/societies/maps/calendars, confidential geographic associations and secret interpretations are withheld. Administrator review is explicit and read-only; foreign G.O.D.s, Players and anonymous requests are denied.

All existing creator fields, chronology arithmetic, calendar rules/evolution, original event sources, map drawing geometry, generators, rendering and existing geography links remain intact. No History events, geometry, mechanical ownership, VTT controls or Campaign objects are created by a connection.

## Verification

| Check | Result |
| --- | --- |
| Focused Worlds domain/regression tests | 57/57; includes ten bridge domain tests and existing Peoples, societies, Cosmology, calendars, chronology, branching and Atlas tests |
| Lifecycle/schema regression tests | 12/12; both new retained-authorship FKs classified; 111 inbound User FKs, unchanged seven cleanup categories |
| Disposable bridge service groups | 13/13; genuine many-to-many maps, all eleven society families, original sources, conflicts, transactional rejection, timeline inclusion/interpretation, archive/restore and authorization |
| Additional privacy groups | 4/4; original protected pins after release, retained/current confidential geography, calendar protection, and more than 2,000 protected rules/connections filtered before ordinary bounds |
| Production-browser checkpoints | Desktop connections, native phone and permissions passed; real two-tab conflict, transport failure with retained draft, reload, archive/restore, two-way navigation and actual Administrator review; no page errors |
| Final dirty-map/context cases | Desktop and native touch passed; unsaved map values/selection retained across Realm read/return; leaving-page links still prompt; contextual sources fixed; all saved World rows unchanged |
| Production build | Final isolated optimized build passed after the lifecycle-inventory registration; retained production server started successfully |
| TypeScript/lint | TypeScript passed; full lint passed; final changed-file lint passed |
| Migration consistency | Drizzle check passed; fresh installation, populated approved-I-schema upgrade and migrator reapplication passed using exact staged Git migration bytes |
| Data preservation | Every pre-existing World row compared unchanged across migration and direct bridge saves; map/History/calendar source rows unchanged during final browser draft checks; unrelated runtime/Campaign/catalog snapshots unchanged |

The single focused production acceptance cycle resumed unfinished checkpoints using the same isolated data/build. Builds were refreshed when source changed; completed service and browser checkpoints were retained. No comprehensive Phase 9 suite was run. The legacy broad harness's latest-migration assertion was updated for 0122, but that broad harness was not run.

Application issues found and fixed: contextual forms could change the source outside the visible profile; dirty-map navigation guards blocked separate-tab links; ordinary archive limits needed filtering before counting. Harness issues were separate: calendar creation returned a rules-version ID, scoped card/title locators needed corrections, one reader assumption depended on list order, and repeated login fixtures triggered rate limiting. Those harness issues were corrected without resetting saved test work.

Evidence remains locally in `artifacts/guidance/worlds-linking-acceptance/`: migration/service/privacy receipts, browser checkpoints, draft results, desktop/native screenshots, real conflict and failed-save screenshots, Administrator review and production logs. `artifacts/guidance/linking-completed-environment.json` identifies the retained task-owned database/build. The test server and cluster are stopped at completion. Build-generated TypeScript configuration changes are restored.

## Persistence, release and recovery

Only additive migration **0122_worlds_linking_bridge.sql**, after 0121, is required. It creates the three bridge tables, adds the adoption composite key, same-World FKs, source/shape checks and immutable/version/ancestry guards. Existing migrations are unchanged. The new source-attribution FKs are registered as blockers in the existing account-deletion inventory, preserving its policy and cleanup categories.

Rehearsed migration Git blob: `b4b8e9f0a751a084e8d3633c0632723226c24234`. SHA-256 of those migration bytes: `9cb9fb385fb9da5fb60a91b2e8c914ea3bc6d1c3ea51f1c21061f97f1694945c`. The final local commit must retain that exact migration blob. Reapplication means the normal migration runner uses its ledger; raw SQL replay is not the procedure.

No new configuration or service is required. For a later separately authorized rollout: confirm the reviewed release and target database identity/ledger, protect the normal verified backup and current release, apply committed migrations in order through 0122 with the existing migration runner, activate the verified application build, and smoke-test authenticated author/Administrator/ordinary views.

Reverting code leaves the additive schema and saved connections intact. Keep the tables, sources and migration ledger; recover with compatible code or a reviewed forward fix. Do not drop retained records to make an older checkout match. See the [model and recovery details](../architecture/worlds-linking-bridge.md).

## Review status and limits

Interaction, guidance, reuse/navigation, reading and data/security have the focused evidence above. Independent technical review and owner visual approval of this bridge remain **pending**. Automated/browser evidence does not constitute human acceptance.

The bridge bounds each authorized selector collection and connection view at 2,000 records, reporting an explicit limit instead of silently truncating. New links require active endpoints; restore an archived endpoint before editing its relationship. Saved participants remain fixed; archive and create another connection for different targets/rules. Current and original source names/revisions are distinguished. Ordinary freeform accounts must be protected if they reveal independently private details. Maps retain shared geometry; historical map-state authoring belongs to Phase 6B. Primary adoption accounts cannot be included into an alternate timeline.

Technically ready for independent review as a complete increment. **No push, deployment, shared DEV/Production migration/write/restart or Phase 6 work is authorized by this handoff.** Repair G is canceled; the comprehensive whole-Worlds assessment is Phase 9 after separately authorized Phases 6–8. Stop here for independent technical and owner visual review.

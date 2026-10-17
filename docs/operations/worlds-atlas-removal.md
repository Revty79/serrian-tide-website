# Worlds Atlas removal — 2026-10-17

Owner-authorized reversible application separation, based on `8743854ecc52412e141569472684f34e553255cb`. Implementation and validation checkpoint: `b7889ced70260a7a64e0d77123a50a85a53245dc`, developed on `feature/worlds-atlas-removal`.

The owner's subsequent instruction on 2026-10-17 explicitly authorizes publishing the completed pass to `origin/main`. This supersedes the original local-only publication boundary; the validation receipts retain their historical no-push status at the time of testing. The accompanying publication changes only documentation and Git references. The pre-removal Atlas is preserved through the named checkpoint and instructions in [Atlas retrieval](worlds-atlas-retrieval.md). No deployment, shared-service restart or shared DEV/Production writes are authorized.

## Behavior

Worlds retains twelve information workspaces: Overview, History, Chronology, Calendars, Timelines, Peoples, Individuals, Politics, Organizations, Cosmology, Lore/Stories/Legends and Campaigns. The Atlas navigation item, mounted workspace and Overview map preview/action are removed. No replacement placeholder is added. Each information destination writes its tab into the URL, so reloads and browser navigation preserve the chosen workspace.

Saved place names, descriptions, historical event associations and lore geography relationships remain available. Historical place references and lore place references render as information rather than editor links. Realm-to-map relationships retain names, source versions, interpretation, periods and privacy, with map opening and mutation controls suppressed. Society-to-calendar/chronology connections retain their existing editable workflow.

Legacy Atlas query parameters are removed on server navigation and client navigation; map tabs fall back to Overview. Timeline, review/ordinary knowledge, non-map entity selection and library place filters remain intact. Legacy `/worlds/:id/atlas/...` paths return to the World Overview and undergo the normal role/World access checks. Normalization does not grant access.

## Retained dependencies and request boundary

- `atlas-workspace.tsx`, `world-geographic-preview.tsx` and all Atlas/editor/rendering/generation/asset modules remain in the repository, dormant. No implementation files are deleted.
- All existing schemas, migrations, saved maps, geography identities, source versions, raster records, historical appearances, settlement/interior/dungeon records and relationships remain unchanged. There is no new migration and no migration rewrite.
- Map-only HTTP endpoints under `/api/worlds/:id/atlas/**`, `/geography/**`, `/elevation` and `/land-cover` are blocked centrally in `worldRequest` after session/CSRF handling and before endpoint callbacks. Existing GET/POST handlers return private, no-store 404 responses. Unimplemented methods retain 405. Encoded route segments receive the same block. Their implementation and services remain available as retained reference and for isolated fixture validation.
- The shared `/links` endpoint retains authorized reads and society-time mutations. Realm-map save/archive/restore/exclude/include mutations fail before data writes, including parent-source inclusion.
- `/peoples`, `/milestones`, `/history`, `/sky`, `/links`, `/calendars`, `/chronology`, `/timelines`, `/campaigns` and `/campaign-contexts` remain available under their existing ownership, privacy, revisions and read-only review checks. Place references still rely on geographic identity/privacy services; these are information relationships, so those dependencies must remain.
- Shared calendar, historical source, World ownership, ordinary-knowledge projection and Campaign association services are retained. No gameplay, account or authentication implementation is changed.

## Validation and evidence

Changed files are confined to Worlds integration and its evidence:

| Files | Purpose |
| --- | --- |
| `src/features/worlds/world-workspace.tsx` | Remove Atlas mount/tab/dirty state and Overview preview; persist valid information tab navigation. |
| `src/app/worlds/[worldId]/page.tsx`, `src/app/worlds/[worldId]/atlas/[[...path]]/page.tsx` | Normalize legacy queries and path bookmarks under existing role access. |
| `src/features/worlds/atlas-availability.ts`, `atlas-availability.test.ts`, `http.ts` | Central map endpoint block and context-preserving bookmark normalization, with focused regressions. |
| `src/features/worlds/historical-entity-links.tsx`, `peoples-workspace.tsx`, `pilot-editor.tsx`, `lore-geography-editor.tsx` | Retain place information and authoring relationships while removing map-opening links and wording. |
| `src/features/worlds/linking-panel.tsx`, `linking-service.ts` | Read-only retained Realm map relationships; preserve society-time behavior. |
| `src/features/guidance/page-help.ts` | Remove map editor instructions from active Worlds help; retain geographic lore guidance. |
| `scripts/worlds-atlas-removal-disposable.test.ts`, `package.json`, `.gitignore` | Reproducible isolated production/browser regression command and ignored temporary outputs. |
| `AGENTS.md`, `docs/architecture/worlds-map-maker-decisions.md`, this report | Record current owner direction while retaining prior roadmaps. |
| `docs/screenshots/worlds-atlas-removal/` | Reviewable screenshots and final validation receipts. |

Run `npm run validate:worlds-atlas-removal` for the dedicated harness. It creates a fresh local PostgreSQL cluster on its own nonstandard loopback port, replays the current committed migrations and seeds disposable existing maps/appearances/relationships. It copies the current source into an isolated checkout without environment files and overrides database and authentication configuration before building and starting its own production server. It stops only its owned server/database; generated Next configuration stays inside the disposable source checkout. Temporary test resources and build logs remain local under the OS temp directory and ignored artifacts; they are not handoff dependencies.

Committed evidence: [workflow/data receipt](../screenshots/worlds-atlas-removal/results.json), [verification index](../screenshots/worlds-atlas-removal/verification.json), [desktop Overview](../screenshots/worlds-atlas-removal/overview-desktop.png), [phone Overview](../screenshots/worlds-atlas-removal/overview-phone.png), [read-only Realm relationship](../screenshots/worlds-atlas-removal/realm-retained-relationship.png), and [phone Cosmology](../screenshots/worlds-atlas-removal/cosmology-phone.png). Full-page captures start at the document top so a scrolled sticky header does not obscure the evidence.

| Check | Result |
| --- | --- |
| Production build and its TypeScript check | Passed with the normal Next 16.3.2 Turbopack build in the owned source checkout. |
| Feature regressions | 2,262 passed, zero failed across 281 files. |
| Standalone TypeScript | Passed. |
| Full lint | Zero errors; one existing unused `LoreFamily` import warning in unchanged `scripts/worlds-stories-checks.ts`. Changed page/harness lint also passed without warnings. |
| Fresh migration replay | All 133 existing migrations applied only to the owned disposable cluster; no new or rewritten migration. |
| Real World lifecycle | Create, edit, save, reload, archive and restore passed through browser controls. |
| Non-map authoring | Thirteen creator families edited/saved/reopened; History era/event creation and place linking, chronology/calendar edits, alternate history, Campaign associations and society-time reads/writes passed. |
| Access and disabled editors | G.O.D., own-World Admin authoring, explicit read-only Admin review, foreign owner, Player, anonymous, ordinary/private filtering and CSRF passed. Every retained map route rejected GET/POST or unsupported mutation methods. Realm-map save/archive/restore/exclude/include requests were rejected. |
| Deep links | Query/path bookmarks fall back safely; repeated ordinary parameters use the same first-value interpretation in server and client, with protected History absent from the ordinary response. |
| Preservation | All rows compared unchanged across 40 map/geographic/source/raster/appearance/connection tables and 133 gameplay/runtime tables; retained Realm-map versions also unchanged. The sample includes existing geographic geometry/parts/versions and a historical map appearance. |
| Presentation | Desktop and 390px touch-emulated phone passed; no horizontal overflow, browser runtime errors or map API requests from the active interface. Screenshots personally inspected. |

The source checkout uses its own offline-installed locked dependencies and contains no shared environment file. The successful normal build used genuine Google font downloads. Initial in-place build attempts consumed excessive resources; the clean isolated build completed normally. A diagnostic webpack fallback found the pre-existing Chat `node:crypto` client-import incompatibility; no Chat change was made, and webpack is not the validated release path. Earlier harness interruptions were duplicate/hidden-element selectors, corrected before the successful workflow run.

Older Atlas browser suites remain retained historical editor tests; their Atlas UI expectations are intentionally superseded by this pass's dedicated separation suite. Existing pure source/geometry/editor unit regressions remain useful and are retained. Phone evidence is browser touch emulation, not physical-device or owner acceptance. No new regression was found in the authorized pass; independent review and owner acceptance remain pending.

## Controlled deployment and recovery

Migration order: no changes; existing release migration ledger remains authoritative. Configuration: no new runtime environment variables or feature switch. Deployment, once separately authorized, follows the normal reviewed release process from a clean release checkout, using `npm ci` and `npm run build` (Turbopack), with current target-ledger verification. This pass alone requires no data conversion or private-asset provisioning.

Rollback is a code revert to the prior release; no database rollback is necessary. Previously saved maps, identities and historical sources remain available to that prior implementation. Protect existing database/private-asset backups using the established deployment process. Re-enabling retained Atlas is a separate owner decision.

Ember's exact-commit independent review and owner acceptance remain separate from the recorded technical checks; publication to `origin/main` does not record either approval. The owner-authorized publication includes the completed removal and its retrieval documentation. Do not deploy, change shared data or start a replacement Map Maker as a continuation of this pass.

# Worlds Creator Pass 1 — implementation and verification

## Functional result

`/worlds` is a private gallery with name-only creation, search, classification labels, identity editing, archive/restore and links into dedicated `/worlds/[worldId]` workshops. Workshops provide a compact world switcher, Overview and History. The overview includes the introduction, historical overview, recently written accounts and a functioning timeline preview.

Historical eras and entries persist in PostgreSQL. Eras have independent optional boundaries, can overlap, and support archive/restore. Entries can belong to multiple eras in their own world or none. Historical accuracy and recorded/planned status are independent. Known, approximate, uncertain-window, duration and undated dates retain their distinct meanings. Archived eras retain their entries and associations.

The horizontal timeline supports drag panning, buttons and keyboard navigation, zoom, fit, year jumps, era selection, individual and grouped event selection, filtering, and a chronological reading alternative. Undated entries have their own section. Opening and editing accounts retains the viewport. No Campaign time or mechanical state is changed.

Following visual feedback, Era/Genre assignment was rebuilt as a compact picker with separate groups, search, selectable pills and removable selected labels. Opening or changing its selection keeps the choices visible in the editor. Desktop dialogs are centered; phone controls remain usable above the footer. This picker reuses existing classifications and does not create a competing tag catalog.

## Architecture and design decisions

See [the pre-implementation architecture/design plan](../architecture/worlds-pass-one.md). Five isolated tables hold worlds, historical eras, historical entries, entry/era memberships and existing classification-tag memberships. Ownership is session-derived. Every service operation checks current roles; HTTP endpoints authenticate separately from page/layout guards. Administrators explicitly enter read-only review of other owners' worlds. Their own worlds remain manageable. Private responses use `Cache-Control: private, no-store`.

Composite foreign keys reject cross-world entry/era relationships. Transactions lock the world and compare record revisions, preventing stale edits, archives and restores. Failed saves retain drafts; conflict recovery explicitly loads the latest version after confirming draft discard. Archived worlds remain readable and cannot be edited until restored. World ownership was added as a blocking reference to the existing account-deletion FK inventory; account authoring/role policy was not changed.

Fantasy time uses versioned `world-year` JSON with signed whole years, a real Year 0, and no implied Earth calendar. Metadata timestamps use ordinary database timestamps. Historical years do not use JavaScript Date. Timeline ticks are adaptive and bounded; event clustering depends on viewport width, date kind, narrative status and historical accuracy. The displayed stage is independent of year-count magnitude. Colors use the shared semantic theme. Geometric covers use existing fonts, CSS and icons; no upload system or new dependency was added.

Galaxy Forge in the [StFinal reference repository](https://github.com/Revty79/StFinal) informed the bands, marker selection and contextual editing. Its application was not imported wholesale.

## Files changed

| Area | Files |
| --- | --- |
| Registry/workspace routes | `src/app/worlds/page.tsx`, `src/app/worlds/[worldId]/page.tsx`, `src/app/worlds/loading.tsx`, `src/app/worlds/error.tsx` |
| Private HTTP endpoints | `src/app/api/worlds/route.ts`, `src/app/api/worlds/[worldId]/route.ts`, `src/app/api/worlds/[worldId]/history/route.ts` |
| Data/service layer | `src/db/world-schema.ts`, `src/features/worlds/history.ts`, `src/features/worlds/timeline.ts`, `src/features/worlds/world-service.ts`, `src/features/worlds/http.ts`, `src/features/worlds/client-api.ts` |
| Interfaces | `src/features/worlds/world-registry.tsx`, `world-workspace.tsx`, `world-editor.tsx`, `historical-timeline.tsx`, `classification-picker.tsx`, `classification-picker.module.css`, `worlds.module.css` (all under `src/features/worlds/`) |
| Guidance/lifecycle | `src/features/guidance/page-help.ts`, `src/features/lifecycle/user-account-delete-plan.ts`, `src/features/lifecycle/admin-account-lifecycle.test.ts` |
| Verification | `src/features/worlds/history.test.ts`, `scripts/worlds-pass-one-disposable.test.ts`, `package.json` |
| Database ledger | `drizzle.config.ts`, `drizzle/0098_worlds_pass_one.sql`, `drizzle/meta/0098_snapshot.json`, `drizzle/meta/_journal.json` |
| Documentation | `docs/architecture/worlds-pass-one.md`, this report |

The password-reset implementation from `a3b0b3c` was preserved. A separate homepage change to `src/app/page.tsx` appeared during the pass and was left untouched and outside this work.

## Migration

Drizzle generated `0098_worlds_pass_one` after inspecting the current journal ending at `0097_password_recovery_codes`. It creates only the five World/history tables and their constraints/indexes. No previous migration was modified. The rehearsal applied the existing chain through 0097, inserted existing users, tags, Campaign and active-session/scene fixtures, then applied 0098 and compared retained data. No Production migration or deployment was executed.

## Executed verification

| Command | Result |
| --- | --- |
| `npm run validate:password-recovery` | Passed before beginning Worlds: production build, visibility toggles, every account role's recovery setup, anonymous recovery at 390px, single-use codes/tokens, password confirmation, expiry, session invalidation, CSRF and rate limits. |
| `npm run validate:worlds` | 10/10 unit tests passed, including all date kinds, Year 0/negative years, malformed dates, open/overlapping eras, trillion-year tick bounds, 2,000 coincident entries and independent status grouping. |
| `npm run validate:worlds-disposable` | Passed on isolated local PostgreSQL and a production Next app, including a fresh production build with TypeScript verification. |
| `npx next typegen` | Passed. |
| `npm run typecheck -- --incremental false` | Passed. |
| Focused ESLint over Worlds routes/features/schema/harness and changed guidance/lifecycle files | Passed without warnings. |
| `npm run validate:appearance` | 12/12 passed. |
| `npm run validate:navigation` | 42/42 passed, including existing Campaign membership/workflow boundaries. |
| `node --import tsx --test src/features/lifecycle/admin-account-lifecycle.test.ts` | 9/9 passed; all 103 current inbound User FKs are classified. |
| `npx drizzle-kit check` | Passed. |
| `git diff --check` for Pass 1 changes | Passed. |

The disposable rehearsal exercised persistent world/era/entry creation and editing, reloads, two-tab conflicts, failed-save draft retention, archive/restore, cross-world FK rejection, same-origin mutation checks, direct URL/HTTP privacy, G.O.D./Admin/Player/anonymous boundaries, phone authoring, keyboard timeline navigation, classification search/selection/removal, and crowded histories. A before/after comparison covered all Campaign-prefixed tables plus Form/Evolution-related runtime tables; existing data was unchanged. No browser runtime errors were observed in the main authoring flow.

Windows `initdb` cannot start inside the restricted sandbox, so these disposable tests ran outside it. Their database URLs were generated for local temporary PostgreSQL, overriding `.env.local`; the tests did not connect to Production. Temporary databases, server processes and builds were removed. Test-only route typing changes were cleaned without replacing unrelated checkout changes.

## Screenshot verification

Screenshots were captured using 1440×900 and 390×844 browser viewports and visually inspected. Full-page captures supplement viewport captures where the workshop extends vertically. The final review covered the gallery, selected-world overview, timeline/history, open field help, phone entry editor, and the redesigned Era/Genre picker. Off-center native dialogs, clipped marker/era labels, icon alignment and picker choices obscured by the footer were corrected before the final passing rehearsal. No horizontal page overflow was found at 390px.

Artifacts are local ignored files under `artifacts/guidance/`:

- `worlds-registry-desktop.png`, `worlds-registry-mobile.png`
- `worlds-overview-desktop.png`, `worlds-overview-mobile.png`
- `worlds-history-desktop.png`, `worlds-history-mobile.png`, `worlds-timeline-mobile.png`
- `worlds-classifications-desktop.png`, `worlds-classifications-mobile.png`
- `worlds-entry-editor-mobile.png`
- `worlds-pass-one-next.log`

These screenshots contain disposable fixtures, not seeded user content.

## Current limits and later passes

Pass 1 supports whole fantasy years from minus one trillion through one trillion. It does not supply sub-year dates or custom calendars. Each world currently loads its authorized history as one snapshot; the stage shows up to 200 event groups and 40 era bands per viewport, while filtering, zoom and chronological pagination provide access to remaining material. Classifications reuse existing Era/Genre tags, with at most 40 selected per world. Cover artwork uses theme-derived fallbacks; uploads were intentionally excluded.

Custom calendars, geography/maps/locations, factions/cultures/languages/religions, cosmology, deeper connected lore, Campaign integration, sharing, actual time advancement, mechanical interactions and printing/export remain reserved for later passes. No empty destinations for them were added. Work stops at Pass 1 for review. No GitHub push was performed for this pass.

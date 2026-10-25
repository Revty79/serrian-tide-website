# Pass 2 correction - retained intermediate working state

This is a retained intermediate engineering snapshot, not the current completion or acceptance receipt. See [the completed delivery report](worlds-pass2-delivery.md) for the final implementation, validation, forward migration and publication boundary. The candidate storage-consolidation sketch below was evaluated but not adopted: World definitions and Campaign gameplay must retain separate authority, and existing records must stay accessible.

## Owner's latest instructions

Complete the full Pass 2. Relocate/evolve the existing comprehensive Heavens Town and Shop Builders into the approved Worlds creator experience. Reuse the actual `CreatorWorkshop` standard and Individual creator depth; no narrow generic popup/side form substitutes. Make Places of Interest and Buildings obvious, first-class creation paths. Preserve full commerce configuration, catalog, stock, price, staff/NPC and association functionality. New World definitions require no Campaign.

Keep all important links: Atlas to the same permanent World Town, Town to places/people/businesses, and optional multiple Town entrances to ONE Shop. Most Shops can have one Town or no placement; franchise branches can be independent Shop records. Do not let optional multi-town behavior compromise core builders.

Keep Heavens pages/navigation functional until OWNER approval to retire them. They have been restored from the foundation after premature redirects were preserved privately. Git commit and push of the COMPLETED correction are explicitly authorized. Production/deployment/standalone Studio changes remain unauthorized. The owner plans hands-on morning review; continue autonomously, not just a proposal.

## Current checkout and persistence

HEAD remains `419c2ffa78ab50bffcc37b93cdc85d651705227c` on main. Extensive uncommitted Pass 2 code exists; no reset/discard, commit or push has occurred. All changes are this pass, including earlier Pass 1 screenshot rerun updates. Original full Heavens builders remain in `src/app/heavens/{towns,shops}`.

0134 is APPLIED to confirmed localhost `serrian_tide_dev`, immutable SHA256 `9f006922a5c5104ceb2f557d8ed31fa8ffee271afade14b82a94f63767818863`. File: `drizzle/0134_world_towns_shops.sql`; snapshot/journal entry also exist. Never rewrite it or earlier migrations. Further schema correction requires 0135 or later.

0134 added eleven tables: settlement profile/history, map place/operation, Shop, Shop location/offering, Town place/resident, place-person link and creation-operation receipt. The owner rejected the parallel builder/storage approach and wants existing structures evolved where appropriate. KEEP necessary link tables and stable geographic UUIDs. Do not casually drop records or the applied tables; safely consolidate canonical storage through a tested forward change, preserving recovery evidence.

DEV backup: `artifacts/worlds-atlas-pass2/dev-backups/2026-10-25T02-15-45-548Z/before-0134.dump`, SHA256 `19c3c67da1f495f4342c32a5340a0359ed6c9bd750ec75a6e6a468dbd935ab69`. Exact disposable restore and all 326 existing public-table row digests matched before/after upgrade. 259 private terrain files copied and individually verified; manifest SHA256 `381f89468bbfeca7c78dc310dfd0d9f25b675ea0db12a810977034473f9106df`. Prior ledger unchanged; existing migration 0132 has only the known checkout CRLF versus stored LF hash difference.

Latest read-only correction inventory: `artifacts/worlds-atlas-pass2/correction/preflight.json`. Original `town` contains ONE row; Shops/places/memberships/NPC associations/offerings/staff/transactions/money events contain ZERO. Owner thought no data; discrepancy reported and row preserved. New 0134 rows are ALL in the archived engineering fixture `dca7e1f3-8f8b-4bd3-89df-3e42e27fbb4f`: 2 Towns, 1 Shop, 2 Shop location links, 1 offering, 1 place, 1 resident, 1 person association, 1 map marker, 3 place operations and 7 creation operations. Resident has no existing lore link. Reverify before any correction; never assume later owner work is absent. Production was not contacted.

## Implemented baseline, NOT accepted UX

`world-town-service.ts` and `world-business-service.ts` implement World-only owner-authorized CRUD, explicit read-only Admin review, private/ordinary exclusion, request identity/hash receipts, optimistic revisions and physical marker links. Shop baseline normalization was extracted from `src/features/shops/shop-builder.ts`; legacy helpers delegate to shared definition/offerings normalization. Catalog details were extracted to `shop-catalog-details.ts` and reused by the original Heavens workspace.

`world-business-workspace.tsx` currently renders a long library/details page plus small generic modal editors. `world-town-editor.tsx` currently renders a small generic Town modal. THESE are the rejected interfaces to correct. Do not call their test passes usability acceptance. Useful state/retry/conflict/CRUD logic can be retained, but use the real Worlds workshop and full creation flows. Explicit place/building creation is missing as an obvious flow; only a generic Add place is currently exposed after selecting a Town.

The completed terrain autosave/marker work stays: completed strokes/undo/redo/applied sea level debounce 1.2s; one request in flight; painting continues; ACK advances baseline without overwriting later edits; retry preserves exact pending command; IndexedDB recovery and stale conflicts remain. Physical map frame and east/west wrapping are independent of numerical grid dimensions. Marker removal preserves Town; same Town on many maps; one Shop linked to many towns via `world_shop_location`, not copied.

Late baseline lifecycle fixes (after main rehearsal): Town archive reason persisted/displayed; Shop/place reasons displayed; inhabitant archiving uses confirmation without an unsupported reason field; business schema rejects a nonempty inhabitant archive reason. These changes still need correction-era validation.

## Existing Worlds standard inspected

Read `docs/architecture/worlds-creator-experience.md` and coverage inventory. The approved standard uses `src/features/worlds/creator-workshop.tsx` and its semantic-theme CSS: large centered native modal, freely selectable named sections, fixed footer, independently scrolling central editor, live preview, mobile preview tab, keyboard/visual viewport handling, opener focus restoration. Use whole-draft `noValidate` validation and route technical field paths to sections and focused controls. Keep parent drafts and exact accepted save boundaries during related creation; one controlled subview, no stacked modals.

The actual full existing Individual workflow is `PilotEditor` in `pilot-editor.tsx`, composition/profile helpers, and the `LoreEditor` wrapper inside `peoples-workspace.tsx`. The wrapper uses full PilotEditor recursively for related supported creators, with bounded `PilotRelatedEditor` only for the families permitted by that older contract. Do NOT use the bounded name/description related form for Individuals here. The full editor should be reused for inhabitants/people references rather than another minimal person builder. `changePeople` creates random entity UUIDs (not request UUIDs), with idempotency by world/creator/request UUID. It saves immutable versions and typed fields. `worldLoreHead` holds primary/current version and revision.

Potential UI composition: one Town/Shop workshop host holding retained parent/child draft frames and rendering ONE `CreatorWorkshop`; named sections for full Town identity/background/population/World associations, places/buildings, residents, Shops, privacy/preview; full Shop identity, locations, catalog/stock/prices, staff, buying/selling policies, privacy/preview. Related create/save returns to parent with draft retained and explains separate accepted saves. Saving a new Town/Shop and continuing enables dependent places/offerings/staff without a fake placeholder. Reuse full Individual PilotEditor for related inhabitants. Adapt the existing proven functionality instead of adding further shallow forms.

Potential storage consolidation (not implemented yet): evolve original `town`, `shop`, `town_place`, `shop_offering` roots for World-owned records with nullable Campaign legacy scope and stable geographic UUID links, preserving integer legacy IDs/FKs and separate Campaign state. Reuse original column/validation factories to avoid nullable typing breaking legacy services. Keep required map/World relationship tables. Retain any superseded 0134 physical rows as immutable recovery sources if needed rather than deleting data; only one active authority. Replace duplicate active profile tables with read projections if appropriate. Carefully test original 0035/0036 consistency triggers and current Tabletop code; don't blindly remove Campaign IDs. This is a design candidate, not owner-approved exact DDL. Latest owner authorizes a forward migration when required, with lossless safeguards; no architecture-only pause is requested.

## Validation already performed (baseline only)

- Four iterations of owned disposable PostgreSQL + isolated normal Turbopack production build and browser rehearsal. Final baseline passes, including all other Worlds destinations, thirteen creator families, History/calendar/Campaign links, privacy, retained old map sources and retired Atlas HTTP boundary. `docs/screenshots/worlds-atlas-pass2/results.json`.
- Full 2,275 feature tests (283 files) pass. `artifacts/worlds-atlas-pass2/full-tests.log`.
- Existing Shop commerce disposable PostgreSQL regressions 2/2 pass, preserving atomic stock/money/ownership/requests/retry behavior. `commerce-regression.log`.
- Root TypeScript and final isolated checkout production build passed before the latest lifecycle/UX correction work. Drizzle check passed. Full lint had baseline unused LoreFamily warning plus two newly introduced warnings, which were fixed (old unused ShopCatalogItem import and numeric request counter capture in TerrainLocations). Recheck final lint.
- Real DEV HTTP save/reopen/restart passed using ONLY an owned separate dev website process, temporary owner session, archived engineering fixture. Temporary session removed, existing Worlds and 91 legacy Campaign-related tables unchanged. `dev-browser-results.json`. The owner's running dev server was untouched.
- Baseline brush metrics: 16 desktop batches mean 0.84ms/max1.8ms; touch-emulated phone 1 batch0.9ms. Lost-response retry, painting while saving, browser reload recovery, stale save protection and restart persistence passed. No physical-phone claim.
- Screenshots personally inspected; full-page shots show sticky nav at captured scroll position (capture artifact). Real DEV evidence helper now scrolls to top first.

## Harness/tool notes

`scripts/worlds-atlas-pass2-disposable.test.ts` creates its OWN cluster and checkout under artifacts, never .env.local. It supports build reuse with `SERRIAN_TERRAIN_REUSE_BUILD=1`; source differences force rebuild. It runs DB checks once before build. Browser helper `worlds-atlas-pass2-browser-checks.ts` matches the REJECTED interface and must be updated for the real workshops.

Windows initdb fails under sandbox restricted token. Use authorized `exec_command require_escalated` for owned disposable PostgreSQL/test processes and backed-up DEV operations. Ordinary source/lint/type work runs normally. No auto-review rejection occurred.

Playwright delayed-response tests must use `page.unrouteAll({behavior:'wait'})` after releasing held responses, otherwise pending route.fulfill can throw Route already handled. Wait for accepted API state after clicks; button click does not await save completion. Use explicit aria-label on native selects whose wrapped text includes options.

`worlds-atlas-pass2-dev-migrate.ts` is now historical one-time 0133-to-0134; DO NOT rerun it (asserts old ledger counts). Create a new guarded correction migrator for 0135 if needed. Existing `terrain-backup-restore.ts` restores trusted dumps with session search_path fixed for older unqualified CHECK helpers. `rowSnapshot` from `worlds-terrain-upgrade.test.ts` uses COLLATE C for locale-stable row digests.

No subagents: developer prohibits delegation without explicit request. No memory updates authorized. Relevant memory registry lines 1222-1223 were used to find existing Shop reconciliation/retry behavior and then code-verified. Final response must end with one memory citation block citing those lines and rollout ID `01a0772b-b271-7592-8fa4-1f7710554a7b`.

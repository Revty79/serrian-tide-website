# Atlas Stage 3 Pass 5C — labels and map composition

**Technically complete ? 2026-10-28. Migration 0145 is required; shared databases and deployment remain untouched.**

Approved 5B baseline: `f6baa2eb42681c58a9e9d7793b0ef24060a3c3c4`. Actual starting main: `e930f5478f0b61249e6ba5fec89d9cd25f341019`, preserving the navigation correction: Lore, Stories & Legends → Atlas → Towns → Campaigns. Initial implementation checkpoint: `222940c`. Final application implementation: `53e9161b05f75fe7ab9a86d511184011953bea7e` (preview transition and phone-test correction). Final validated source/test checkpoint: `4500234f2203af565241e9e89cdf97287ccdbfbf`. The final delivery commit is the commit containing this completed report; resolve it with `git log -1 -- docs/operations/worlds-labels-5c-delivery.md`.

## Delivered behavior

The existing expanded Atlas now has **Labels & Layout**. Creators can place point, area and annotation labels, draw a label path, or accept selected suggestions from named accepted rivers, lakes, water features, catchments and placed World Towns. Other categories remain available manually, including continents, regions, mountain ranges, forests, routes and landmarks. Suggestions never invent names or create geographic/gameplay records.

Labels retain physical World-metre anchors and paths, stable UUIDs and optional exact source associations. Text, inspector name, native font family/coordinated preset, size, weight, italic, color, tracking, rotation, alignment, opacity, halo, backing, wrapping width, viewing-scale range, collision priority, visibility and explicit collision override are editable. Unicode, punctuation, accents and multiline annotations are supported. Path lettering follows retained geometry with upright glyphs; short/sharp paths and joined scripts use readable shaped midpoint lettering. Geometry is never bent to suit text.

Manual/protected labels survive refreshed suggestions. A changed or missing source becomes stale/unresolved, retaining authored text and geometry. Adopting current source wording/geometry is explicit and requires unlocking protection. A linked Town label replaces its old fixed name block, including when the new label is hidden; the underlying Town marker and identity remain intact. Deleting the label restores the normal Town name.

Composition is independent of geographic anchors: repositionable viewport-relative title/subtitle, measured scale bar, map-top north indicator, actual appearance/visible-artwork legend, notes/attribution and optional neatline. Existing appearances use coordinated serif/reference/scientific treatments; creators can override them. Presentation preview hides editing readouts and floating controls and selects navigation. It changes no accepted map data. The label inspector is bounded on phones/tablets.

Preview → accept/cancel → save is separate from terrain, materials, water, climate, appearance and artwork. Selection, deletion, undo/redo, partial-creation/preview recovery, original-request retry after interrupted acknowledgement, conflict retention, saved reload/export and immutable revision restoration use existing Atlas conventions. Owner authoring and explicit read-only Admin review remain enforced server-side; ordinary preview cannot read or write labels. Maps without labels retain an empty, invisible composition by default.

## Reuse and files

Reuses Canvas2D, authoritative World coordinates, existing numerical/refinement sources, water geometry, Town placement identities, shared field guidance/theme controls, native installed fonts, physical units/nice distances, guarded HTTP access, World write transactions, optimistic revisions and recovery conventions. No dependency/font/image asset was added. Existing 5A preset documents and 5B artwork documents are unchanged.

New `src/features/worlds/terrain-labels*` modules cover the strict model, source catalog, service, client recovery/authoring, controls, layout, painter and unit tests. New database schema: `src/db/world-labels-schema.ts`; guarded API: `src/app/api/worlds/[worldId]/terrain/labels/route.ts`. Existing Canvas/editor/tool/CSS integration, artwork visibility metadata, optional measurement-bar drawing and account-lifecycle reference bookkeeping are narrowly extended. `scripts/worlds-labels-*` supplies functional, authorization, migration, touch, refinement, visual, paired-performance and offline source verification. Older migration-check helpers exclude the new tables only when reconstructing their earlier snapshots.

## Migration and recovery

**MIGRATION 0145 IS REQUIRED FOR SAVED LABELS AND LAYOUT.**

`0145_world_labels.sql` adds `world_labels` and immutable `world_labels_version`, with World/map/user relationships, revision/request uniqueness and previous/restored revision references. It changes no historical table. Drizzle snapshot/journal entry 0145 is included. SQL SHA-256: `ce76b373cbd63a84513995427d1a0d7e1bdb02978f553ae7d0d55be64774791a`. SQL was frozen after its first successful disposable rehearsal. All 145 preceding migrations/snapshots, including 0143 and 0144, remain exact.

Owned PostgreSQL 18 rehearsal verified fresh replay, populated through-0144 upgrade, **350 existing tables unchanged**, two new tables, actual missing-migration service behavior, complete backup/restore, restored reads, immutable history and repeated migration with 146 ledger entries. No shared DEV/Production database was accessed or migrated. Missing 0145 produces a visible authoring notice while other map layers remain available.

Before deployment, independently identify and back up each intended target, including private terrain storage; inspect its ledger and apply outstanding migrations in order through 0144, then 0145. Deploy the matching code only through a separately authorized operation. Existing authentication/storage configuration remains required; no new service or remote font configuration is needed. Code rollback does not undo SQL: retain the additive tables/history, export unsaved browser drafts before downgrading, and use a verified full database/private-storage backup if database recovery is necessary. Do not edit/reapply old SQL or drop accepted label history as a rollback shortcut.

## Validation

- `node scripts/run-feature-tests.mjs`: **2,511/2,511**, 307 feature test files, no skips/failures; includes 20 new label tests.
- Production build: `EGtEoDEc_QtSYIpapuvDt`, 1,698 runtime/input files, SHA-256 `5189d104ef47718caabefc3234b0f3dd6e3931b428c4d10cc51063792a83c564`.
- Root `tsc --noEmit`: passed. Full ESLint: zero errors, one existing unused `LoreFamily` warning in `worlds-stories-checks.ts`.
- Offline `drizzle-kit check` using a no-dotenv temporary config and dummy loopback URL: passed. Default `.env.local` configuration was never used.
- Account lifecycle in its own disposable PostgreSQL cluster: **5/5** tests passed; 131 user-reference constraints are accounted for.
- Focused production Chrome with `--disable-gpu`: authoring, preview/cancel, exact physical movement, priority/visibility, suggestions/protection, five appearances, fresh-context reopen, dropped-response recovery/original retry, conflict retention, history restore, native CDP touch at 390/820 CSS px and roles/CSRF/body/font validation passed.
- Full inherited production/database/browser chain: **passed**, with terrain browser coverage enabled, zero page errors and 146 migration entries. Includes terrain generation/import/sculpting/refinements/recovery, complete Town/Shop workshops, water, climate/vegetation, five appearances, styles, artwork, labels, all twelve information destinations, thirteen creator families, History/calendars/Campaign associations, role/privacy and phone workflows. All 133 gameplay tables and retained legacy map/Realm relationships remained unchanged.
- Genuine million-kilometre World/fine island: actual Canvas text drawing matched the World-anchor projection in both fine and base views (largest observed error below 0.00002 px; assertion tolerance 0.2 px); exact labels and numerical fingerprint were retained.
- Offline source/build verification: **8,555 protected approved Git blobs exact**, 1,698 production runtime/input files and 588 validation scripts byte-exact to the owned executed copy. All 145 old migrations/snapshots, original public assets and historical screenshot evidence remain unchanged. The separately executed verifier is `scripts/worlds-labels-source-check.mjs`.

Failure corrections retained in ignored local logs: an initial path unwrapping argument-order error was corrected; a stale-source unit fixture key was corrected; React render-time ref reads were replaced with state; visual review corrected composition contrast over viewport margins and duplicate editing-scale/readout clutter. A visual-capture test initially tried to click Fit after presentation preview hid it; the camera is now positioned before entering preview. The first full aggregate stopped in the inherited Pass 8 phone journey when tapping the already-selected Preview tab after native navigation did not reopen settings. The test now uses the explicit Show creation settings action for both reopen steps, retaining native ruler/pen/no-record assertions; the existing creation workshop code is unchanged. No threshold or assertion was removed to hide those failures.

## CPU and memory

The successful full run used the exact approved 5B build with equal geographic/artwork inputs, installed Chrome 134.0.6998.166 and `--disable-gpu`. It compared 96 labels plus composition against 5B. All nine unchanged limits passed. Times below are rounded milliseconds; detailed receipts remain ignored locally. The inherited live 5A/artwork comparison and 1,024-placement artwork stress also passed.

| Journey | 5B ms | 5C ms | Existing limit ms |
|---|---:|---:|---:|
| Cold application ready | 2,389 | 2,304 | 3,500 |
| Warm navigation, ten keys | 150 | 179 | 500 |
| Regional ready | 1,748 | 1,895 | 2,185 |
| Close ready | 4,343 | 4,038 | 5,429 |
| Repeated pan/zoom | 5,584 | 5,227 | 6,980 |
| Main-thread fallback navigation | 3,751 | 3,846 | 4,689 |
| Far zoom ready | 296 | 271 | 1,000 |
| Input during climate calculation | 11 | 12 | 100 |
| Climate preview | 993 | 933 | 1,241 |

Dense 512-label forced-collision stress passed: 20 navigation keys in 442 ms (<1,500), maximum label draw 57.4 ms (<100), 200 visible copies / 1,765 graphemes, 156,820 estimated measurement-cache bytes (<1 MiB). Repeated panning did not rebuild layout or remeasure text. Measurements are bounded estimates, not process RSS; timings describe this machine and are not a device guarantee. Absolute warm navigation/input costs rose with labels but remained within the existing limits.

## Visual review and limits

Personally inspected actual production captures of Unicode/multiline labels over creator-authored dark forest, bright desert, snow/ice, illustrated forest, existing mountain relief and topographic contours. Halos kept wording readable without large opaque blocks. Also inspected the accepted curved Silver Run label, linked Sable Port name, five appearance treatments, composition on map/viewport margins and narrow native-touch layouts. Test biome overrides were explicitly creator-authored, restored afterward and were never presented as generated canon. Existing terrain/artwork quality remains as delivered by earlier passes; this typography review does not record owner artistic acceptance or physical-device acceptance.

Limits are explicit: 512 labels; 512 points per path / 8,192 total; 512 KiB request; first 128 named suggestions; 200 visible copies / 2,400 graphemes per draw; 4,096 cached text measurements / approximately 1 MiB; 24 local undo entries; 60 visible accepted history entries. Extreme tiny projected Worlds suppress unusable geographic text. Priorities and scale ranges are creator-adjustable; collision decisions do not move saved anchors. Wrapped copies share one identity and canonical plan. Source lookup supports accepted named water and up to 2,048 placed Towns; categories without suitable sources remain manual. Long annotations wrap and may show an ellipsis while retaining their complete source text. Native font shaping/fallback can vary by OS. Composition uses the current viewport, its legend describes actual appearance/artwork, north means map top, and export/printing remains future work.

Owner artistic direction, added during validation: a future selectable **Engraved Fantasy Atlas** style should target integrated, publication-quality illustration: fine engraved linework and hatching, intricate connected mountain ranges, dense varied forest masses, detailed coasts/water, ornamental borders, botanical scrollwork, cartouches and coherent lettering. The supplied open-book photograph is inspiration and a quality benchmark, not artwork to trace or copy. This direction requires a separately authorized artistic refinement pass; it does not replace existing appearances or change geographic authority. No implementation or image asset is included in 5C.

Numerical terrain, materials, hydrology, climate/vegetation authority, World/map/place identities, Towns/Shops, Campaign/Tabletop/gameplay sources, prior histories, private assets and retired HTTP boundaries are preserved. No Studio, geographic generator, settlement/interior/dungeon, gameplay or 5D work was introduced.

All screenshots, dumps, browser output and detailed receipts stay ignored under `artifacts/labels-5c-*`. No new screenshot gallery or historical evidence copy is committed. This report is the single consolidated delivery record. The implementation is ready for the authorized normal main push and controlled deployment preparation, with no remaining technical blocker found in this pass. Independent review, owner artistic/physical-device acceptance, deployment, owner service restart, shared migrations and next-pass construction remain separate.

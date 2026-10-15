# Geo UX-0 focused Map Studio - 2026-10-15

Approved base: `72150c1efc3524080a286890305f011697aea40c`. This report belongs to the single local UX-0 review commit; resolve its SHA with `git log -1 --format=%H -- docs/reports/worlds-geo-ux0-2026-10-15.md`. Independent technical review and owner visual acceptance remain separate. No push or deployment was performed.

## Before and after

The approved build stacked the World introduction, tabs, timeline controls, historical workspace and wrapping map tools above the canvas. At 1440 x 900 its canvas began 1,909 pixels below the viewport top; at 390 x 844 it began 3,004 pixels down. Both had zero canvas visibility on entry without scrolling.

The existing Atlas editors now open in a focused shell below the actual application navigation. The World introduction and tab collection are hidden while editing. World/timeline, map name, current mode and draft feedback remain visible. Historical appearances and unknown dated coverage keep their context beside the map even with History settings closed. The canvas, persistent palette and contextual inspector share the working area. Inspector scrolling leaves the canvas in place. Narrow screens use a dismissible settings sheet; the map name/mode stay within the viewport even with long feedback.

This is the existing Map Maker inside existing Worlds routing, not another editor. Direct `editMap` links also open settlement, interior and dungeon maps. Return to Maps focuses and scrolls to the library heading. Browser history retains viewing parameters and draft protection. A cancelled Back navigation keeps the same live editor, source draft and generation preview.

The original V1/V2 map/variation generator also uses this shell. Its settings, description interpretation/review, seed and explicit new-map save sit beside its existing preview. No generator algorithm changed. D3-A authoritative generation remains a separate operation inside a map.

## Retained tools and independent saves

The complete [before/reorganized tool inventory](../architecture/worlds-map-studio.md#inventory-before-reorganization) records all controls and their destinations. Up to seven applicable categories appear: Artwork, Geography, Generate, Layers, History, Connections and Export. Artwork selection uses a compact native picker grouped into selection/navigation, coastlines/locations, terrain/paths and labels/symbols. Every previous tool remains selectable.

Retained capabilities include Atlas drawing/painting/sculpting, paths/rivers, locations, symbols/labels, exact artwork points and fields, ordering/archive/restore, layers and locks; D2 source association/readers, polygons/rivers, components/exteriors/holes, vertex selection/focus, source Undo/Redo, original/latest comparison and rebase; D3-A previews/worker cancellation/recipes/acceptance/retries; geographic projections/themes, elevation and classification preferences; historical appearance/territory/source/connection tools; connected maps, settlements, floors and dungeon levels; visible combined and authored-only PNGs, credits and recovery downloads.

Panels use stable portal targets and remain mounted while hidden. Switching categories or closing settings preserves input values, brushes, source documents, selection, preview geometry, worker/request identities, undo histories and errors. Existing pending/disabled boundaries are carried into their new locations. Artwork pointer mode suspends geographic editing without discarding its source draft. Artwork Undo/Redo retain their original availability outside geographic mode; geographic Undo/Redo stay with the source editor.

Atlas artwork/map information, authoritative source revisions, generated batches, elevation preferences, land-cover preferences and historical appearances retain separate handlers and save actions. A geographic preview cannot enable an unrelated map/source save. Failed saves, conflicts and lost acknowledgements keep their drafts and retries. Save feedback names its scope. No new generic Save operation was introduced.

## Measured production-browser acceptance

| Viewport | Entry canvas top / height | Canvas in viewport | Least unobscured during normal working checks | Working page-scroll change |
|---|---|---|---|---|
| 1440 x 900 | 287.6 / 523.1 px | 100% | 100.0% | 0 px |
| 1024 x 768 | 336.8 / 348.3 px | 100% | 70.1% | 0 px |
| 768 x 1024 | 336.8 / 604.3 px | 100% | 65.4% | 0 px |
| 390 x 844 | 337.2 / 426.9 px | 100% | 56.0% | 0 px |
| 360 x 740 | 337.2 / 322.9 px | 100% | 51.1% | 0 px |

Settings dismissal leaves 100% of the canvas unobscured at all five sizes. There is no horizontal page overflow; all applicable primary palette buttons meet the 44-pixel target. Returning from direct Earth editing places the library heading at about 117 pixels on desktop and 121 pixels on phone.

The reduced-height keyboard checks at 768 x 744, 390 x 564 and 360 x 460 preserve entered text, draft state, heading/tool bounds and navigation, with no page-width overflow. The SVG remains within each viewport. At 360 x 460 the open sheet covers the remaining 42.9-pixel-high canvas; closing it restores canvas access. This is a limit while typing, not a measured claim of usable drawing area beneath an on-screen keyboard.

The retained D1-B performance suite measures 21 initial Earth preview requests and 149,018 decoded bytes. During 70.115 seconds idle, zero vectors or raster tiles reload and the same scene stays mounted. Eight lightweight authorization/metadata refreshes total 20,338 decoded bytes (two status checks, six metadata responses). Seven visible local previews remain bounded over another 35.015 seconds: ten lightweight requests, 12,087 decoded bytes, no vector/tile reload. Focus, changed revisions, permission removal, offscreen cancellation and successful retry retain their existing behavior.

Measurements come from real element bounds, document scroll position, viewport width and inspector overlap. Canvas visibility means its SVG box remains inside the viewport; unobscured area subtracts the settings sheet's overlap. Closing settings exposes the entire canvas. Explicit navigation to the library intentionally moves the page to that destination. No test scrolls the page to bring a Studio canvas into view before the UX screenshots.

Creator journeys enter from the World/Atlas library, create a geographic source, adjust fields, switch to artwork, draw a label, use Undo/Redo, save independently, retain a failed artwork save for retry, generate a coastline preview, scroll long settings, cancel Back navigation, discard explicitly and return through Back/Forward. Brush size/spacing/density/style and selected tool survive panel changes. Native browser touch and keyboard are exercised across the five sizes. Exact stored touch-drag coordinates match the existing SVG inverse/reference adapter, rather than screen pixels. Keyboard-related viewport resizing retains the entered revision account.

Additional journeys cover settlement/interior/dungeon entry and exit, both legacy generator layouts, rectangular Earth with both rasters, historical political overlays and persistent unknown-coverage labels. Six specialized-editor round trips in a further exact disposable copy create a building/room with mouse or native touch, Undo/Redo, save, and compare stored coordinates against the existing SVG inverse and dungeon grid rules (within 0.02 map units, allowing the editors' existing rounding). Each retains every prior shape exactly. Existing compatibility journeys exercise source revisions/conflicts/rebase, failures/idempotent retries, ordinary/review/foreign authorization, projections, linked exploration, immutable source recovery and PNG composition/export cancellation.

## Checks and preservation

Node 22.23.3 checks passed:

| Check | Result |
|---|---|
| Entire feature unit suite | 2,201 passed, 0 failed; 265 files |
| TypeScript | Passed |
| Full ESLint | 0 errors; one existing Stories warning |
| Actual isolated production build | Passed; all browser receipts match runtime fingerprint `e96bc14cb1f4b194976686623c68a005b58750446b108dbeac172b8bf858210a` |
| UX-0 creator/context journeys | 19 passed |
| Specialized source round trips and legacy previews | 8 passed |
| D1-A combined editing/save/privacy compatibility | 14 passed |
| D1-B preview/export/privacy compatibility | 12 passed |
| D1-B timed thumbnail performance/privacy/retry | 9 passed |
| D2-A editing/revisions/privacy | 13 passed |
| D2-B multipart/revisions/privacy | 11 passed |
| Canonical Glass Sea multipart editing/exports | 4 passed |
| D3-A generation/recovery/privacy | 10 passed |
| Canonical Glass Sea generation/retained originals | 2 passed |
| D1-B read-only services, fresh migration and existing-ledger no-op | 8 groups passed |
| D3-A source transaction, revision, privacy and bounded generation services | 6 groups passed |

The browser suites total 102 checks with zero page errors. Existing compatibility scripts now navigate the real Studio categories and grouped tool picker; their geometry, privacy, revision, draft-recovery and export assertions remain in place. D1-A runs in an additional full copy because it deliberately changes pre-existing fixture artwork. Specialized editor writes use another full copy.

Reproduction uses the retained `worlds-geo-d1a-harness.ts` environment verification and build command, never shared database configuration. Run Node 22 directly with `scripts/run-feature-tests.mjs`, `node_modules/typescript/bin/tsc --noEmit`, and `node_modules/eslint/bin/eslint.js .`. Browser/service scripts use `--conditions=react-server --import tsx`. The D2/D3 `--fresh-browser` checks create new acceptance Worlds before their browser suites; `--glass-copy` creates each exact Glass Sea copy before `--glass-sea`. `worlds-geo-ux0-checks.ts` creates the additional copy required by D1-A `--studio-copy` and UX-0 `--studio-copy --special-only --special-edits`. Preserve these receipts and run browser scripts sequentially on their owned application port. Compare D1-B `--after` immediately after its read-only services, then run D3-A `--after` for the retained original baseline.

Final preservation comparisons retain all 160,852 original World rows across 118 World tables exactly, including map/source identities, original geometry, registrations, versions, provenance, Realm relationships and Living History. A second comparison finds every current World table exactly unchanged across the read-only D1-B service/migration checks. All 132 migration-ledger entries are exact; migrations 0130/0131 and the journal are untouched. Fresh migration and upgrade no-op checks passed with zero new migrations.

All 16 retained raster versions and six private bundle identities/checksums verify against existing files. C1/Geo B vector originals remain in the exact original row comparison. No worldwide asset was regenerated. Geographic engines/services, coordinate adapters, renderers, raster storage/loaders, export implementation, thumbnail implementation, database schema, dependencies and Docker configuration remain unchanged.

The D3-A Glass Sea copy retains every original row and head exactly after additive generation. In the separate D2-B copy, only Glass Island and Copper Isles source heads deliberately advance through their normal authoring actions; original immutable versions, all other World rows, existing artwork, surface/map identities and Glass Channel remain exact. Exterior and interior boundaries and the individual isles are exercised independently, with original geometry still recoverable. These are disposable acceptance changes, not established additions to persistent Glass Sea.

Every new write used the retained receipt-verified disposable PostgreSQL environment, purpose-created test Worlds, or additional exact copies. The older D1 artwork-editing suite uses its own full copy so those deliberate artwork changes cannot affect the primary preservation comparison. Glass Sea editing/generation uses additional copies, retaining the persistent originals. Existing raster bundles are borrowed read-only. The owned application/browser processes were cleaned up, and the isolated PostgreSQL cluster was stopped; neither owned test port remains listening. No `.env.local`, persistent DEV/Production operation, shared-service restart, Docker change or asset provisioning was needed.

## Screenshots and evidence

Full application captures show the map and tool access together:

- Before: [desktop](../screenshots/worlds-geo-ux0/before-1440.png), [phone](../screenshots/worlds-geo-ux0/before-390.png).
- Focused editing: [desktop brush](../screenshots/worlds-geo-ux0/brush-1440.png), [tablet](../screenshots/worlds-geo-ux0/entry-768.png), [landscape tablet](../screenshots/worlds-geo-ux0/entry-1024.png), [phone generation](../screenshots/worlds-geo-ux0/generation-390.png), [narrow phone](../screenshots/worlds-geo-ux0/brush-360.png), [keyboard resize](../screenshots/worlds-geo-ux0/keyboard-390.png).
- Earth: [desktop layers](../screenshots/worlds-geo-ux0/earth-1440.png), [phone layers](../screenshots/worlds-geo-ux0/earth-390.png), [phone canvas after dismissal](../screenshots/worlds-geo-ux0/earth-unobscured-390.png), [historical politics](../screenshots/worlds-geo-ux0/historical-political-1440.png), [unknown coverage](../screenshots/worlds-geo-ux0/historical-unknown-390.png).
- Retained editors: [settlement](../screenshots/worlds-geo-ux0/settlement-1440.png), [interior phone](../screenshots/worlds-geo-ux0/interior-390.png), [dungeon](../screenshots/worlds-geo-ux0/dungeon-1440.png), [legacy generation phone](../screenshots/worlds-geo-ux0/legacy-generator-390.png), [connections dialog](../screenshots/worlds-geo-ux0/connections-dialog.png).

The [committed evidence receipt](worlds-geo-ux0-evidence.json) retains build identity, check totals, measurements, preservation results and screenshot hashes. Detailed snapshots, compatibility captures, downloads and logs remain in ignored `artifacts/guidance/geo-ux0` and the established isolated harness directories. Original committed D1/D2/D3 screenshots remain unchanged.

## Limits, deployment and recovery

Long contextual settings still scroll independently. Narrow palettes/action bars can scroll horizontally within their own areas; page overflow is prohibited and tested. A settings sheet overlays the map while open and can be dismissed without losing work; the measured small keyboard viewport limit is recorded above. Dense original sources keep D2's vertex/component focus and editing limits; this pass introduces no geometry simplification or new scale capabilities. The connected explorer and standalone source library retain their established layouts.

Native touch means Chrome browser/CDP touch events and mobile emulation. Keyboard-related resizing is emulated; physical phones, on-screen keyboards on device, Safari and owner visual acceptance remain separate checks. Node 22 production/build validation here is on Windows; Linux CI requires separately authorized push. The existing Stories `LoreFamily` lint warning is unchanged. The successful isolated build also reports the nested-checkout multiple-lockfile warning and the existing dynamic filesystem tracing warning in `raster-storage.ts`; this pass does not alter build configuration or raster storage.

Ready as a complete local UX-0 increment for independent review. No new migration, schema, runtime configuration, dependency, engine, dataset or art library. Existing migration order remains through 0131. D3-B/D4/D5/E, Advanced Map Studio and the application-wide Worlds navigation/language overhaul were not begun. Glass Sea's D-E completion, D4/E historical layout review and D5 settlement/interior/dungeon visual assets remain scheduled.

Before any separately authorized deployment, verify the release/target identities and ledger, protect database/private-asset backups and the running release, preserve unsaved creator drafts, build the approved commit and smoke-test owner/ordinary/Admin, independent saves, source edits, history, touch and exports. A code rollback restores the prior presentation while retaining persisted artwork, sources, versions and preferences. No format conversion or migration reversal is required; reverting code does not undo creator saves. No push, deployment or Production operation occurred in this pass.

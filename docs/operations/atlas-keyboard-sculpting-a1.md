# Atlas post-recovery Stage A1: Keyboard Sculpting Mode

Technical recommendation: **PASS for owner/Ember review**. Usability, artistic and physical-device acceptance remain with the owner. This milestone stops here; no Earth construction, graphics milestone, source import, deployment or Production work is included.

Starting reviewed main: `2b64e73faae109d3e366972c545845d44ff2911c`. The exact ending publication commit and its Actions result are recorded in the delivery response. The application fingerprint below identifies the production build used for validation, independently of documentation commits.

## What a creator can do

Open an editable native terrain map and choose **Keyboard Sculpting Mode**, directly over the map. Entry closes the existing side panels without resetting their selections. The compact dock has a persistent Exit button, active/paused state, brush settings, source spacing, source/World position and native save status. Its expandable instructions explain the whole workflow. Existing panels can still be reopened.

| Control while the map has focus | Result |
| --- | --- |
| Arrow keys | Move by the selected number of source samples; movement alone does not sculpt. |
| Single / Fine / Coarse selector | Choose one sample or configurable whole-sample increments, from 1 to 256. Fine defaults to 1; coarse defaults to 10. |
| Shift + arrows | Use the coarse increment. |
| Enter | Apply one native brush stamp. In supported path/outline drawing, add a preview point instead. |
| Shift + Enter | Begin a deliberate stroke preview, then finish it as one native Undo step. |
| Esc | Cancel an unfinished stroke; otherwise deselect a control point or exit the mode. |
| V / Shift + V | Select next/previous supported path, polygon, regional-outline or unfinished measurement point. Arrows then adjust its native preview. |
| C | Reveal the precision cursor. |
| Click | Position the cursor for supported sculpt/path/outline tools. |
| Space-drag / middle mouse, +/−, F | Existing pan, zoom and fit controls. |
| Ctrl/Cmd + Z, Shift + Ctrl/Cmd + Z, Ctrl/Cmd + Y | Existing native Undo/Redo. |

Use **Instructions & precision controls** to enter exact source column/row or World east/south metres. Choose **Focus map for keyboard editing** afterward. Native polygon/workshop changes still require their normal Prepare/Apply or Accept controls. Completed terrain stamps/strokes follow normal autosave; **Review changes** opens retained recovery work.

The persistent crosshair and existing brush-footprint renderer use the active numerical source, including single-sample footprints. Zoom, display quality and interpolation cannot add samples. Raise, lower, smooth, level and all three coastal brushes use the same native operations as the pointer. Other Atlas tools retain their existing controls; this does not introduce keyboard authoring for every map family or control-point type.

## Numerical and preservation design

`TerrainKeyboardBinding` translates input and selection into existing Canvas callbacks. `TerrainCanvas` constructs the same `TerrainStroke` used by mouse editing, with the same brush, source grid, blocked mask, RAF budget, patch callback, Undo/Redo ledger and save/recovery pipeline. No terrain algorithm, server authoring endpoint, migration, persistent format or alternate history system was introduced.

Source position follows Atlas's existing node convention: `World = frame origin + sample / source dimension × physical extent`. World metres run east and south from the World frame's top-left origin. Whole-sample movement resolves against the selected source or numerical refinement, independently on each axis. Exact entry may retain fractional sample positions; the selected native brush precision determines its numerical effect. Single-sample editing uses the native rounding/wrapping rules.

Full wrapping sources wrap horizontally; nonwrapping sources and polar edges stop at their valid bounds. Regional frames use the existing seam-aware coordinate conversion, accepted outline containment and inherited protection masks. A source change cancels a pending keyboard stroke and resets the cursor within the visible numerical source, reporting the new spacing. The tests demonstrate a real selected refinement with 62.5 m steps; this is not a claim about every map's resolution.

The native TerrainDocument has no authoritative geographic CRS/georeference. A1 therefore supports actual source and World coordinates and explicitly explains that no latitude/longitude is inferred. Deriving geographic coordinates solely from aspect ratio or wrapping would falsely imply a geographic reference. Adding such a reference is outside this milestone's saved-format-preservation scope.

Typing in inputs, selects, forms or other application surfaces cannot invoke the canvas handler. IME composition and browser/application modifier combinations are excluded. Held Enter cannot repeat stamps or start/finish repeatedly. Held arrows can move deliberately; reaching a boundary does not enqueue additional dabs. Blur, hidden-page state, pointer navigation, mode exit, tool/brush/source/protection or editing-access changes cancel an unfinished keyboard preview through native cancellation. Completed edits retain normal autosave and interrupted-save recovery.

Current permissions and source availability gate native stroke creation. A server-side stale lease can still reject a locally prepared draft; the accepted revision remains unchanged and the native draft remains available for recovery. Local cursor/preview activity does not grant permission to persist. Historical and administrator-review views remain read-only. Supported regional point edits use the original `onVertexDrag` start/finish authority; pending/read-only outlines reject the edit.

## Actual changed files

| Files | Purpose |
| --- | --- |
| `src/features/worlds/terrain-keyboard.ts` | Source-coordinate transforms, movement settings and focused-key classification. |
| `src/features/worlds/terrain-keyboard-binding.ts` | Cursor, stroke intent and existing control-point callback adapter. |
| `src/features/worlds/terrain-keyboard-controls.tsx` | Discoverable mode, state, position controls and instructions. |
| `src/features/worlds/terrain-keyboard.test.ts` | Nine focused numerical/input/native-operation tests. |
| `src/features/worlds/terrain-canvas.tsx` | Shared native stroke integration, persistent footprint, focus and pointer safety. |
| `src/features/worlds/terrain-editor.tsx` | Native save status and space-preserving entry behavior. |
| `src/features/worlds/terrain-operation-workshop.tsx` | Keyboard precision in existing polygon/path previews. |
| `src/features/worlds/terrain.module.css` | Compact dock and narrow-screen layout. |
| `scripts/worlds-keyboard-disposable.test.ts`, `scripts/worlds-keyboard-browser-checks.ts` | Owned synthetic fixtures and real production-browser checks. |
| `scripts/worlds-regional-editing-browser-checks.ts` | Opt-in A1 branch, complete build source copy and explicitly isolated storage roots. Original browser branches remain. |
| `scripts/worlds-regional-editing-fixture.ts` | Explicit owned artwork/raster roots in addition to terrain. |
| `scripts/worlds-regional-editing-db-checks.ts` | Correct obsolete 154-migration fixture expectation to 161 and require exact complete restored/source ledger equality. Original domain assertions remain. |
| `scripts/worlds-collaboration-cpu.test.ts` | Opt-in exact A1 build proof and fail-closed owned-fixture/storage checks. All metric producers, baseline comparisons and 36 limits remain unchanged. |
| `package.json` | `validate:atlas-keyboard` command; no dependency or lockfile changes. |
| `eslint.config.mjs` | Exclude private operational storage from application lint. Application source remains checked. |
| `.gitignore` | Keep A1 runtime, receipts, screenshots and diagnostics private. |
| `AGENTS.md`, this report | Authorization, evidence and review boundary. |

All pre-existing files outside this reviewed list retain their starting Git content. In particular, the numerical terrain engines, saved geometry/storage formats, authentication/server permission code, public assets, data and migration history through 0160 remain unchanged. The isolated source snapshot contains no owner environment file.

## Verification

Production application SHA-256: `04ec7e8ff1a3cb7a64a7d2d9da6f9c8f7f073d7ecdf97ddfb252428047a6ad91`.

Production build ID: `Tyid5D9VC_nB1ZwfwmAPw`. The source proof covers `src`, `data`, `public`, `ops` and the specified package/build/compiler inputs. The isolated compiler config is either exact or differs only by Next's two generated isolated type paths. This is a production build in a newly owned local runtime, not a deployment.

| Check | Actual result and evidence |
| --- | --- |
| Focused keyboard tests | 9 passed, including 21 native brush/precision combinations, coordinate seams, source changes, focus/repeat/IME, protection, cancellation and existing point callbacks. |
| Full normal unit suite | 2,921/2,921 across 377 files; `artifacts/atlas-keyboard-1/unit-final.log`. |
| TypeScript / full ESLint | Passed; final release logs are `artifacts/atlas-keyboard-1/{types,lint}-release.log`. One existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts` remains. |
| Environment / raster integrity | All 15 environment-integrity checks passed. Windows raster checks passed 2 with 1 explicit POSIX-permission skip; Linux coverage is verified separately in publication CI. `artifacts/atlas-keyboard-1/{environment,raster}-release.log`. |
| Production browser | All ten A1 groups passed on exact source/build above, installed Chrome 134.0.6998.166, headed and GPU disabled, no page errors. `artifacts/regions-s43-keyboard-a1-6/{browser-results,keyboard-results}.json`. |
| Numerical pointer equivalence | An actual mouse stamp and equivalent keyboard stamp produced identical persisted grids; save/reload preserved their exact values. All seven brushes also match native `TerrainStroke` across original/fine/single precision in the focused suite. |
| Controlled edits/history | Single and continuous strokes, cancel, one-step Undo/Redo, invalid input, source boundaries, zoom/pan and forms passed. |
| Native polygon workflow | Visible point creation and vertex adjustment, original worker preview and Apply, saved result and outside-extent numerical preservation passed. |
| Refinements/protection | Protected parent samples rejected; actual selected fine source moved exactly 62.5 m, stamped, saved and reopened with exact samples. |
| Recovery | A real save transport failure left the accepted revision unchanged. Reload, Review changes and native recovery replayed the exact original save request and persisted the intended numerical result. |
| Read-only/lease | Real historical appearance and administrator review refused mutation. A deliberately stale fence in the owned fixture produced actual server 403/409 denial with accepted grid/revision unchanged and recoverable native work. |
| Independent visible inspection | Separately authenticated normal test-admin browser session confirmed discovery, persistent footprint, 200 m source movement and read-only refusal. Final evidence: `artifacts/atlas-keyboard-1/independent-final-{review,mode}.yml` and `independent-final-review.png`. This is technical inspection, not owner acceptance. |
| Narrow layout | Desktop and 390 px viewport passed; no horizontal page overflow. Entry remains accessible above the existing settings sheet; Exit remains visible while the dock scrolls. |
| Native touch events | Chrome CDP touch, including two-finger navigation, cancelled an unfinished keyboard preview and left accepted terrain/revision exact. `artifacts/regions-s43-keyboard-a1-touch/keyboard-touch-results.json`. This is emulation, not a physical-device test. |
| Original regional database regression | Native shared geography, local composition, water/environment/material/artwork/labels, Town identities, permissions, retries, source pins, seams/refinements, outside preservation, paired restore and fresh-process restored service reads passed. `artifacts/atlas-keyboard-1/original-regional-db-2.log`. |
| Native precision benchmark | Unchanged million-sample benchmark passed all seven brushes with exact Undo/Redo/cancel; `artifacts/atlas-keyboard-1/native-precision-performance.log`. This is separate from the rendering limits below. |
| Original matched CPU gates | Four original nine-limit artwork/labels/engraved/regions suites passed on the exact A1 production build against unchanged baseline `88cfa27c682b5b339e7f672d8c98b1f0289b2191`. Final runner receipt: `artifacts/collaboration-s7b-keyboard-a1-cpu-5/{progress,results}.json`; no threshold relaxation. |

Normal checks use `npm run typecheck`, `npm run lint`, `npm run validate:unit`, `npm run validate:raster-deployment` and `npm run validate:environment`. `npm run validate:atlas-keyboard` uses the existing isolated regional fixture/build harness, PostgreSQL 18 and installed Chrome; prepare the isolated dependency checkout as required by that harness. Build afresh with `SERRIAN_REGIONAL_EDIT_REUSE_BUILD=0`, then use `1` only with its exact source-fingerprint proof. `SERRIAN_KEYBOARD_TOUCH_ONLY=1` selects the separate native-touch check. The existing CPU runner accepts `SERRIAN_ATLAS_A1_CPU=1` only for the owned A1 runtime; its retained source fixture must be a complete, stopped, previously passed synthetic CPU fixture. These are explicit local validation prerequisites, not a new deployment process.

## Clean DEV and environment boundary

Initial read-only preflight at `2026-11-09T23:57:11Z` and final read-only verification at `2026-11-10T01:14:40Z` identified only clean DEV `127.0.0.1:5433/serrian_tide_dev_clean`, application role `serrian_tide_app`. Both retain zero Worlds/geographic sources, eight users/accounts, five campaigns, 1,421 skills and all 161 exact source migrations. The final check also verifies Revty79's existing admin/god/player roles, all three configured active clean roots and HTTP 3000 login availability. Receipts: `artifacts/atlas-keyboard-1/clean-dev-{preflight,final}.json`.

Automated geography and deliberate lease failures were confined to newly owned synthetic databases, storage and application ports. No owner login/account write, DEV website restart, original DEV 5432/recovery-point access, original private-storage access, Production/Ubuntu access or Canon action occurred. Clean DEV was not seeded. These bounded checks verify identity, ledger, retained counts and roots; they are not a newly claimed full database/file comparison or another backup operation.

Final owned-service audit found no live postmaster marker in 11 recorded task environments and no listener at 19 recorded task ports. It did not stop or probe owner services and deleted no files. Receipt: `artifacts/atlas-keyboard-1/owned-services-final.json`.

## Retained failures and limits

The ignored logs preserve failed/incomplete attempts rather than merging them into the final pass:

- An offline dependency install lacked cached `sharp`; the subsequent online install used the unchanged lockfile. Initial lint exposed declaration ordering/JSX text issues and a private operational `.cjs` in storage; source issues were corrected and private storage excluded without editing it.
- The first isolated build omitted existing `ops/stamp-build.mjs`; the harness now copies `ops` and includes it in the source proof.
- Browser attempts 2 and 3 used obsolete/unscoped recovery/history locators. They were corrected to the actual Review changes/Pending Work and Tool panel flows, retaining the same assertions and normal clicks.
- Attempt 4 exposed a real narrow-screen discoverability issue: the settings sheet covered the entry control. The dock/entry behavior was corrected. Attempt 5 passed an intermediate build and is not final-source evidence; attempt 6 and independent inspection passed the fingerprint above.
- The original regional restore test still expected 154 migrations. It was corrected to 161 and strengthened with full exact source/restored ledger equality; the subsequent complete original regression passed.
- CPU attempts 1–3 stopped before benchmarking because a retained old synthetic fixture was incomplete or its compiler proof was too narrow. No PostgreSQL control file was reconstructed. A complete stopped, previously passed pre-Earth Stage 8 synthetic fixture was selected through the runner's guarded existing source option. Source data was copied into new owned targets; it was not started or modified. Attempt 4 passed all 36 limits; the final runner then refused missing control/configuration files rather than fabricating them, and attempt 5 passed all 36 again.
- A final read-only helper initially compared an unparsed PostgreSQL enum-array string with a JavaScript array. Explicit SQL text-array projection corrected the helper; all expected owner roles then passed. No account changes were made.

All failed receipts and screenshots remain private. No claim is made that every historical Atlas suite was rerun, that all map families now support keyboard sculpting, or that software/browser emulation proves physical accessibility. Keyboard focus, labeled controls, live state, modifier/IME safety and narrow/touch workflows were checked; screen readers, operating-system key remapping and physical keyboards/touchscreens still require acceptance testing.

Owner/Ember should assess discoverability, instruction clarity, map-space tradeoffs, cursor visibility and comfort of deliberate strokes on their actual devices. Technical verification does not settle those judgments. Stop for that review before another milestone.

# Atlas Pass 4 delivery — 2026-10-25

Implementation: **09ec66ed1af022ea8115028f1fd8da409218cd64**, including core implementation `a861d96a2f3bb562fbe9716f9ef7058e37716e95`. The scope checkpoint is `8ff0d66b6a025e572e2032c2a01373f365811c3f`; all descend from the owner's published `6169311ef8ad01d2d0275b3b2e8b05105e5d45ab`. Publication includes the evidence/handoff commit following the implementation.

This completes the supplied Pass 4 sculpting increment of original Stage 2. It does not complete Stage 2. Describe Your World, final owner-led corrections and all Stage 3 work remain separate. Owner artistic/usability acceptance is pending.

## Numerical tools

| Tool | Numerical behavior |
| --- | --- |
| Raise, Lower, Smooth | Original default calculations remain exact against the retained Pass 3 implementation. Optional hardness changes only an explicitly chosen brush's falloff. |
| Level | Moves lower and higher samples toward a typed or sampled target. Strength controls approach; hardness controls the firm centre and outer falloff. |
| Extend land | Raises low ground toward a bounded height above current sea level, preserving already-higher land. |
| Expand water / carve bay | Lowers high ground toward a bounded depth below sea level, preserving deeper water. |
| Smooth shoreline | Blends neighboring heights only within the chosen elevation band near sea level. The authoritative coast remains the numerical elevation/sea intersection. |
| Ridge | Adds a continuous blended distance-field profile along editable points. Maximum corridor influence prevents intersections/joins from piling up extra height. |
| Valley | Subtracts the corresponding continuous profile, with controlled depth, width and falloff. This is terrain shaping without flow or river simulation. |
| Selected area | Previews Level, Smooth, Raise or Lower within an explicit rectangle. Optional feathering stays inside it. Outside samples remain numerically identical. |

Ridge/valley intent supports successive clicks, controlled dragging, moving existing vertices, coordinate editing and point removal. Width and relative height/depth are explicit. A prepared proposal is temporary and cancellable; Apply creates one manual history operation and uses the existing autosave/recovery path. After application, ordinary terrain sculpting edits its accepted numerical heights. Paths are temporary intent rather than a second saved geometry system.

## Workspace and interaction

The original Canvas2D renderer, palette and editable signed-metre grid remain. Normal mode groups navigation, brushes, coasts, landforms/areas and history. Expanded mode uses a compact tool chooser and disclosures around a larger viewport, with visible elevation and sticky save feedback. It retains the same canvas, grid, view and drafts while rising above the site navigation through the browser's native top layer. Exit expanded editor or Escape returns to normal mode.

Brush settings explain their effect, radius, hardness and target. Physical footprint and sample spacing stay distinct from zoom. Cursor/path/selection overlays never enter saved numerical tiles. Target sampling is read-only, including clicks outside wrapped artwork. Space/middle-button navigation cannot fall through into painting or choosing a location.

Pointer strokes use bounded animation-frame batches and reusable smoothing scratch space. Completed gestures produce one exact typed-array patch. A cancelled gesture restores its provisional heights. Touch defaults to navigation; **enable One-finger painting** to sculpt. A second finger rolls back provisional painting before pinch/pan. Path/area workshops provide their own explicit one-finger editing toggle. Mouse and pen remain direct authoring inputs.

Pan, fit, pointer-centred wheel zoom, two-finger navigation and keyboard navigation remain. Focus the canvas for arrows, +/−, F (fit), P (Pan), I (Inspect), R/L/S/T (brushes), Space (temporary pan), Ctrl/Cmd-Z and Shift-Z/Y. Expanded focus cycles within the workspace; native creator dialogs retain their existing focus behavior.

## Persistence and database

**NO NEW MIGRATION IS REQUIRED FOR PASS 4.**

No schema, numerical format, HTTP save contract, private storage layout or accepted-source format changes. DEV was inspected read-only before and after: **137 migration entries through 0136**, latest hash `4ef0c01a4c1484fec257bd1c1ad53fe5f173e483022157c02245b685c201867f`. This pass performs no shared DEV writes, Production access, Ubuntu access, deployment or owner's-service restart.

New results are existing manual numerical saves. The original generator/import provenance remains readable; recipes never rerun implicitly. Changed samples continue to acquire existing manual protection for selected-area regeneration. Tile revisions, request idempotency, stale-save protection, browser recovery and private content-addressed files remain authoritative.

All map origins use one editor: blank ocean/land, generated, imported and previously modified. Actual HTTP tests save and reopen new edits, restart only the owned test app, and compare numerical values and original provenance. Town markers, World relationships and legacy records retain their identities and coordinates.

The [preservation receipt](../screenshots/worlds-atlas-pass4/preserved-source.json) verifies **549 protected existing files unchanged** from `6169311`, including original Town/Shop/Tabletop work, all database schemas/migrations, renderer, generator, source metadata, persistence and recovery services. The established terrain command schemas remain unchanged.

## Validation

- **2,292 feature tests pass across 287 files.** Thirteen focused brush/sculpting tests cover old behavior, leveling, coasts, gap-free strokes, cancellation, wrap/fixed edges, ridge/valley continuity and overlap, exact selection boundaries, undo/redo and bounds.
- Root TypeScript and production builds pass. Changed-file lint has no errors or warnings. Full lint has zero errors and the one pre-existing unused LoreFamily import warning in worlds-stories-checks.ts.
- Fresh owned PostgreSQL replay covers all 137 existing migrations; no new migration or populated-schema upgrade is necessary. Populated numerical/business fixtures verify retained saves, sources, immutable history, stale/repeated requests, privacy and existing relationships.
- Full production browser regression passes Town/Shop/Individual workshops, independent related saves, stock/prices/staff and multiple entrances, Heavens retirement, direct retained Tabletop access, all other creator families, World lifecycle, History/chronology/calendars/Campaign associations, old bookmarks, owner/Admin/Player/ordinary/foreign privacy and CSRF checks.
- Passes 1–3 remain covered: blank ocean/land, every generator preset, numerical 16-bit import, autosave while painting, lost-response retries, recovery, conflicts, restarts, protected regeneration, original provenance and markers.
- New browser journeys sculpt an island and shoreline, carve a bay, build/edit a ridge, drag a valley, level/smooth a plateau, cancel previews, perform multiple undo/redo operations, save/restart/reopen, edit generated and imported terrain, and exercise fixed/wrapped boundaries and exact outside-area equality. Invalid inactive target values return to and focus the correct control.
- Final focused production proof adds expensive-worker cancellation, actual native pointer-centred wheel coordinates, wrapped sampling safety, bounded browser heap retention, and native touch navigation/two-finger rollback/explicit painting at 390px phone and 820px tablet sizes. GPU acceleration is disabled. Physical-device, Safari and other browser-engine acceptance is not claimed.

The exact final source has a passing production build. Full regression and final focused receipts are separate so their scope is explicit: [full acceptance](../screenshots/worlds-atlas-pass4/results.json), [new sculpting/memory/touch](../screenshots/worlds-atlas-pass4/pass4-results.json), [final focused](../screenshots/worlds-atlas-pass4/focused-results.json).

## Measured performance

All measurements are observations on this Windows test machine, not cross-device guarantees. The maximum remains **1024 × 1024**. The numerical benchmark reads the original brush from exact Git checkpoint `6169311` and asserts identical default results for paired workloads.

| Workload | Result |
| --- | --- |
| Paired Raise dab, radius 24 | Pass 3 ~0.116 ms; Pass 4 ~0.110 ms |
| Paired Raise dab, radius 64 | ~0.685 vs ~0.688 ms |
| Paired Smooth dab, radius 24 | ~0.102 vs ~0.110 ms |
| Paired Smooth dab, radius 64 | ~0.560 vs ~0.592 ms |
| Long large-radius leveling | ~5.5 ms average bounded batch; ~6.2 ms maximum; final exact-patch construction ~4 ms |
| 256-point wide ridge / valley | ~152 / 137 ms in the numerical worker kernel |
| Full-grid smoothing, 20 passes | ~938 ms in the worker kernel |
| Twelve full-grid level previews | ~239 ms total kernel time |

The old/new dab differences are small absolute variations; no universal speedup is claimed. Pass 3's recorded ordinary browser stroke was ~0.61 ms average/~1.5 ms maximum at a smaller radius. The new high-resolution mixed-tool journey used larger brushes and measured ~2.4 ms average/~8.8 ms maximum batches; it is a heavier workload, not an equivalent benchmark. Ordinary strokes redraw affected tiles rather than recomputing whole maps.

After twelve maximum-size previews and yielded major GCs, backing-buffer growth is exactly **10 MiB**, the retained latest preview grid and precise patch. Browser heap snapshots across repeated real operations grew by approximately **2.2 MiB**, with about **3.8 MiB** additional backing storage for retained work. Workers terminate after completion/cancellation. History keeps the existing 60-step/one-million-sample budget, retaining the latest large operation as one undoable step.

See [paired numerical/memory measurements](../screenshots/worlds-atlas-pass4/numerical-performance.json) and the browser receipt for exact values. Production browser proof includes the renderer, actual HTTP autosave/private storage and navigation rather than only pure kernel timing.

## Screenshots and owner review

Personally inspected actual [island/coast](../screenshots/worlds-atlas-pass4/sculpted-island-and-bay.png), [mountains](../screenshots/worlds-atlas-pass4/sculpted-mountains.png), [valley](../screenshots/worlds-atlas-pass4/sculpted-valley.png), [plateau](../screenshots/worlds-atlas-pass4/plateau-and-transitions.png), [ridge intent/preview](../screenshots/worlds-atlas-pass4/ridge-preview.png), [desktop](../screenshots/worlds-atlas-pass4/expanded-desktop.png), [phone](../screenshots/worlds-atlas-pass4/expanded-phone.png) and [tablet](../screenshots/worlds-atlas-pass4/expanded-tablet.png). They are actual application output, not generated mockups.

1. Worlds → select a World → Atlas → open or create a map. Try Expand editor; use its Active terrain tool selector and disclosures. Existing view/recovery/save state stays in place.
2. Choose Level. Type a target or Sample target height, then click the map. Adjust strength/hardness and paint both lower and higher ground. Try the three coastline brushes and inspect real elevations.
3. Build ridge or Carve valley. Draw successive points or drag, move vertices, adjust width/height/slope, prepare the preview and Apply. Try Cancel and subsequent ordinary sculpting.
4. Select area. Drag or enter a rectangle, choose Level/Smooth/Raise/Lower, set effect and interior blend, prepare and inspect. Apply, Undo/Redo, wait for autosave, then reopen.
5. On touch, start with navigation; enable One-finger painting or the workshop's selection/path toggle when intentionally editing. Try two-finger pan/zoom and confirm save feedback remains visible.

## Limits and controlled release

Ridge/valley paths have at most 256 temporary points; their width is bounded to 256 samples and the map width. Rectangles use the canonical grid and do not form a disjoint cross-seam selection; operate on each edge separately when needed. Polygon/freehand selection, analytical editing of an accepted vector path, pressure-sensitive brushes, rivers/flow, climate, multiple styles, Town Maps, interiors, dungeons and standalone integration are outside this pass.

No new configuration or dependency is required. Retain the existing database/auth/private terrain configuration. Future deployment must independently verify the target is compatible through **0136** and has its private terrain files; this pass's lack of a new migration does not assert that an uninspected server is current. Build/activate only under separate deployment authorization.

Rollback keeps the original signed-metre tiles, accepted history, metadata and ledger intact. Earlier compatible terrain readers can read these manual results. Code rollback does not undo saved sculpting; use deliberate numerical history/forward edits and protected backups where appropriate. Preserve uncertain browser requests before changing releases. No schema rollback or data deletion is part of this pass.

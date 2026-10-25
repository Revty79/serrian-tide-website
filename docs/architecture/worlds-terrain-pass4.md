# Atlas Pass 4: intentional terrain sculpting

Authorized starting checkpoint: `6169311ef8ad01d2d0275b3b2e8b05105e5d45ab`. This extends the existing website World heightmap editor within original Stage 2. Preserve Passes 1–3, the Heavens retirement, all original builders/runtime, stable World/map/marker identities, generator/import provenance, numerical tiles, private storage, accepted revisions, recovery and autosaving. No Town Maps, interiors, dungeons, climate/river simulation, rendering-style expansion or standalone Studio work.

## Implementation boundaries

Keep Canvas2D and the signed integer metre grid, 32-sample tiles and 1024-per-axis maximum. Extend the original brush kernel with optional hardness and target controls while retaining the original Raise/Lower/Smooth defaults. Level moves toward a chosen or sampled height. Land and Water brushes approach explicit sea-relative heights without flattening higher land or deeper water. Shore smoothing operates near the existing elevation/sea intersection; no competing coastline data is created.

Ridge/Valley paths are temporary editable authoring intent. Successive points or controlled dragging define a continuous distance field; width, relative elevation change and falloff form real heights blended into the existing grid. Wrapped paths use the shortest segment across the seam. Accepted paths become ordinary editable numerical terrain, not a second saved geometry system.

Reuse rectangular selection and the existing creator shell for selected-area operations. Level, Smooth, Raise and Lower prepare cancellable worker previews. Accept applies only the precise changed samples as one undoable manual operation, then uses the established autosave/recovery path. Cancel changes nothing. Rectangles stay within the canonical grid, including on wrapped maps; disjoint edge selections can be performed separately. Workers never mutate the authoritative editor buffer.

Use bounded frame processing and reusable scratch buffers for pointer strokes. A completed gesture produces one history entry. Pointer cancellation or switching to a two-finger gesture rolls back provisional painting. Ordinary touch defaults to navigation; one-finger painting/path editing requires an explicit choice. Cursor footprints use the same bounded sample radius as the kernel, including physical aspect and seam copies.

Expand the existing workspace with logical tool groups, contextual guided controls, a larger canvas and a viewport-filling mode. Preserve semantic theme colors, accessible controls, keyboard/pointer-centered navigation, visible numerical inspection, save/conflict/recovery feedback and retained World locations/provenance.

## Persistence and validation

No schema change is planned: all results are existing manual numerical tile saves. Applied migrations through 0136 are immutable. Verify the current ledger read-only; no shared DEV or Production schema operation is needed for a UI/numerical pass. Use newly owned disposable PostgreSQL/browser environments for acceptance; never restart the owner's service.

Cover exact changed samples, range and fixed/wrapped bounds, original brush defaults, target sampling, path continuity/editing, overlap behavior, selection outside equality, preview cancellation, grouped undo/redo, autosave/retry/conflict/recovery, all map origins and original provenance. Measure full 1024-square brush/path/area work, render updates, memory across repeated operations and navigation with GPU acceleration disabled. Preserve existing Worlds/Town/Shop/Tabletop/security regressions and complete root TypeScript, lint, feature tests and production build. Personally inspect actual terrain and desktop/phone/tablet screenshots. Publish the complete pass under the existing authorized Git workflow, with a review handoff; no deployment or Stage 3 follows.

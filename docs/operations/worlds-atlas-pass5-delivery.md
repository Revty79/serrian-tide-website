# Atlas Pass 5 delivery — 2026-10-25

Implementation: **771ad35162d4035bf5a9e74fdd9d5e027e336268**, including core `fed9b593352eeda23373c32969467ee41a6b2b7d`. Scope checkpoint: `cc236bb87360f68195d1b08933e17e52bd3261bf`, from the owner's published `f1b446a7eafcb88222b44fe210f1dd56d927fda3`. The following evidence/handoff commit completes publication; it does not change the runtime implementation.

This completes the supplied physical-scale generation and relief increment. **Stage 2 is not complete.** Owner artistic/usability acceptance remains pending; independent review is not claimed. No Production or Ubuntu access, deployment, shared-service restart or shared database writes occurred.

## Physical generation

New creations default to **world-heightmap-v2**, through the existing generator workshop, worker and numerical acceptance path. All six geography choices remain: Single Continent, Multiple Continents, Archipelago, Large Island, Land-Dominant World and Randomized World.

| Geographic Scale | Continent width | Major island width | Range length × width | Intended peak above sea |
| --- | --- | --- | --- | --- |
| Familiar | 5,000 km | 600 km | 1,500 × 150 km | 3,500 m |
| Grand Fantasy | 20,000 km | 1,800 km | 5,000 × 700 km | 6,000 m |
| Colossal | 200,000 km | 12,000 km | 80,000 × 10,000 km | 10,000 m |
| Custom | Explicit kilometre dimensions | Explicit kilometre dimensions | Explicit kilometre dimensions | Explicit metres within saved bounds |

These are editable starting configurations. Controls include count/distribution, physical gaps, island cluster spacing/variation, coastline scale/complexity, range spacing/intensity, ruggedness, lowlands, highlands, plateau strength, coastal transition and ocean depth. Lengths use equal kilometre axes even when physical extent and sample-grid proportions differ. Wrapped Worlds use periodic X distances/fields; north/south edges remain fixed.

Landforms use irregular physical envelopes, coherent seeded fields and curved connected ranges. There is no tectonic, river, climate or erosion simulation. Intended peak, plain, highland and ocean heights are independent of allowed elevation bounds. Invalid intent is rejected with retained values; the creator can deliberately correct it. Coasts, range placement and coarse sampling can produce lower actual peaks than the stated intent.

V2's physical size and count control the proposal. Preferred land coverage is a comparison, not a quantile operation that secretly enlarges landforms. Preview reports actual coverage. Conflicts explain alternatives and offer explicit changes to count, size or preferred coverage; extent remains an explicit creation choice. Overlap and edge cropping are reported. Trying an alternative invalidates the previous proposal until regenerated.

## Resolution and extreme Worlds

The existing ceiling remains **1024 samples per axis**. A million-kilometre square at 1024² has **976.5625 km sample spacing**. A requested 5,000 km landform spans about **5.1 samples along its intended long dimension**, with fewer samples through its shorter dimension. Narrow mountain ranges and coastlines can disappear or be represented poorly.

Preview explains these limitations, distinguishes zoom from numerical detail, and offers smaller extent, higher supported detail or deliberately larger geography. Under-resolved/cropped proposals require an explicit acknowledgement before acceptance. The server independently checks physical resolution acknowledgement and intended height bounds before staging files. The acknowledgement is retained with source provenance. Preview/Cancel never creates a permanent record.

| Same seeded continent intent | Numerical grid | Measured physical long-axis span |
| --- | --- | --- |
| 5,000 km on a 10,000 km square | 1024² | ~4,581 km |
| 5,000 km on a 40,000 km square | 1024² | ~4,576 km |
| 5,000 km on a 20,000 × 10,000 km rectangle | 1024² | ~4,581 km |
| 5,000 km on a 1,000,000 km square | 1024² | Coarse few-cell result; no expansion to continental canvas proportions |
| Deliberate 200,000 km Colossal intent on that extreme World | 1024² | ~183,188 km |

The measurement uses physical covariance of the irregular land footprint, not an exact bounding-box promise. The well-resolved examples differ by about 0.1%. Extreme coarse results are not precise geographic measurements.

Compare [10,000 km](../screenshots/worlds-atlas-pass5/physical-continent-10000km.png), [40,000 km](../screenshots/worlds-atlas-pass5/physical-continent-40000km.png), [rectangular extent](../screenshots/worlds-atlas-pass5/physical-rectangular-world.png), [million-km feedback](../screenshots/worlds-atlas-pass5/extreme-million-km-resolution-feedback.png) and [deliberate Colossal geography](../screenshots/worlds-atlas-pass5/colossal-million-km-wrapped.png).

## Relief and compatibility

The palette and Canvas2D/tile renderer remain. **Classic** retains the original pixel calculation exactly. Existing v1, blank, imported and older maps default to Classic. New v2-origin maps default to Enhanced physical relief unless a browser preference exists.

Physical relief derives normals from metre height differences divided by independent X/Y metre spacing. Interior gradients use two neighbors; fixed edges use one-sided gradients; wrapped X uses its real seam neighbors. Natural (1×), Enhanced (20×), Dramatic (80×) and Custom (1–1000×) exaggeration affect illumination only. The main editor's preference is local to this browser and map; preview appearance is temporary. No relief choice enters a numerical command, recipe, revision, protection mask or geographic record. Source and manual-operation previews inherit the current map relief.

Compare the same numerical terrain in [Classic](../screenshots/worlds-atlas-pass5/relief-classic.png), [Natural](../screenshots/worlds-atlas-pass5/relief-natural.png) and [Enhanced](../screenshots/worlds-atlas-pass5/relief-enhanced.png). Natural relief is intentionally gentle where physical slopes are gentle; exaggeration provides an explicit visual choice.

**world-heightmap-v1 remains available as a compatibility choice.** Its algorithm body is unchanged apart from import aliases, its strict recipe parsing is retained, and all twelve pre-Pass-5 fixed/wrapped reference hashes match. New v2 recipes contain all physical settings needed for reproduction. Preview and persisted provenance use the same normalized seed, including when a creator types surrounding spaces. Reopening accepted terrain reads saved samples and never reruns a recipe.

Selected-area regeneration can deliberately choose another version/settings while preserving the original creation recipe. Exact outside-area heights, protected manual samples, optimistic revisions, immutable versions, request retries and browser recovery remain. All Pass 4 manual brush/path/area numerical mechanics are unchanged.

## Validation and preservation

- **2,310 feature tests pass across 289 files.** Tests cover v1 hashes, v2 determinism, physical spans/aspect ratios, gaps, height independence, highlands, wrapping, canonical seeds, resolution/admission rules, pathological candidate limits, physical slopes, exact Classic pixels and unchanged numerical arrays under display changes.
- Root TypeScript passes. Full lint has zero errors and the pre-existing unused `LoreFamily` import warning in `scripts/worlds-stories-checks.ts`; changed-code lint has no errors or warnings.
- Production Turbopack build passes. Full disposable production/browser regression covers earlier generation/import, every Pass 4 tool and expanded/touch behavior, Town/Shop/Individual workshops, inventory/staff/entrances, Heavens retirement, retained Tabletop access, World lifecycle, all creator families, History/calendars/Campaign associations, legacy map boundaries and privacy/CSRF roles.
- Final focused production coverage includes the seed correction, six v2 presets, largest-grid/extreme/rectangular/wrapped proposals, acknowledgement, explicit coverage alternatives, invalid inactive and collapsed-field focus, unchanged v1 reopen, appearance-only/no-save proof, lost acceptance/recovery, protected v2 regeneration, restart/reopen and 390px/820px native Chromium touch emulation. GPU acceleration is disabled.
- PostgreSQL checks rehearse all 137 existing migrations in a new owned cluster and exercise populated numerical/business fixtures, immutable origins/history, exact retries, rejected/stale saves, protected areas and owner/Admin/Player/foreign access.
- The preservation receipt confirms **1,058 existing files unchanged**, including all schemas/migrations, Town/Shop/Campaign/Tabletop code, other World systems, numerical brush/operation mechanics, storage and recovery. Existing runtime and legacy map rows remain unchanged in disposable regression snapshots.

Evidence: [validation index](../screenshots/worlds-atlas-pass5/validation.json), [full regression](../screenshots/worlds-atlas-pass5/results.json), [final physical browser](../screenshots/worlds-atlas-pass5/pass5-results.json), [preserved source](../screenshots/worlds-atlas-pass5/preserved-source.json), [phone controls](../screenshots/worlds-atlas-pass5/physical-controls-phone.png), [phone acknowledgement](../screenshots/worlds-atlas-pass5/physical-preview-phone.png) and [tablet preview](../screenshots/worlds-atlas-pass5/physical-preview-tablet.png).

Full browser regression was completed at core `fed9b59`; the final focused build/browser/database checks cover `771ad35`'s seed normalization correction. Root feature tests and TypeScript cover the final implementation. New desktop/phone/tablet screenshots were personally inspected. Physical-device and other browser-engine acceptance are not claimed; technical checks do not replace owner artistic/usability review.

## Performance

These are observations on this Windows machine, not cross-device guarantees. Numerical kernels and actual browser worker/redraw journeys are separate measurements.

| Workload | Observed result |
| --- | --- |
| Familiar 10,000 km, 256² grid | ~103 ms mean Node generation kernel |
| Familiar 10,000 km, 1024² grid | ~1.68 s mean Node generation kernel |
| Familiar 40,000 km, 1024² grid | ~152 ms mean Node kernel |
| Familiar million-km square, 1024² | ~1.3 ms kernel; very little of the sparse grid intersects the small feature |
| Colossal million-km square, 1024² | ~256 ms mean Node kernel |
| Wrapped 40,000 × 24,000 km, 1024² | ~183 ms mean Node kernel |
| Classic / Enhanced full 1024² shading kernels | ~42 / 32 ms CPU time |
| Nine-tile Classic / Enhanced halo kernels | ~0.20 / 0.51 ms mean |
| Ordinary Raise, radius 24 | ~0.135 ms mean numerical dab |
| Actual GPU-disabled 1024² browser redraw | ~221–401 ms elapsed across frames; measured largest frame ~6.7 ms |
| Actual incremental stroke refresh | 16 tiles, ~14 ms elapsed; largest frame ~3.1 ms |
| Twelve repeated kernel previews after GC | +2 MiB numerical buffers, the retained latest grid |
| Browser retained JS heap across the physical journey after GC | ~0.52 MiB growth in the final focused run |

Actual browser generation plus preview redraw took about 1.1 s for the close familiar example and 0.2–0.9 s for the other tested extents. Timings vary between runs. Final raw observations are in [numerical performance](../screenshots/worlds-atlas-pass5/numerical-performance.json) and the physical browser receipt. Browser JS heap does not include every native canvas/process allocation; Node memory snapshots report heap, RSS and numerical buffers separately.

Work is tied to bounded samples, feature counts and spatial tile candidates, not an unbounded number of kilometres. Expensive overlapping settings fail with an actionable message rather than silently resizing geography. Workers remain cancellable; ordinary brushes keep incremental redraw.

## Database and controlled release

**NO NEW DATABASE MIGRATION IS REQUIRED FOR PASS 5.**

V2 and its acknowledgement use existing JSONB source provenance and existing signed-metre tiles. There are no schema, column, terrain encoding, storage-root or configuration changes. DEV was verified read-only: **137 entries through 0136**, latest hash prefix `4ef0c01a4c14`, matching the journal. See [DEV ledger](../screenshots/worlds-atlas-pass5/dev-ledger-readonly.json). Production contents/ledger were not inspected or assumed.

An installation already through 0136 needs no database operation for this pass. A future deployment must independently identify its target, verify its ledger/backups and apply only genuinely pending historical migrations in journal order before using the tested application. Do not use schema push or rewrite applied migrations. Existing private terrain storage must remain mounted with the same access controls.

Publication is authorized; server deployment is separate and has not occurred. Before a separately approved deployment, select the exact release, stage/build it, preserve the running release/private terrain/database backup, then perform authenticated owner and read-only Admin smoke checks. No new dependencies or environment settings are required.

Prefer a forward correction for recovery. Earlier numerical data remains intact, but a pre-v2 writer does not understand the new recipe. Pause v2 authoring if reverting to older application code; retain numerical tiles, source/history and backups. A Git rollback never rolls back accepted data or migrations.

## Owner review

1. Open a selected **World → Atlas → Create flat world**. Choose generated geography, Familiar Geography and a seed. In World size & edges, compare 10,000 km and 40,000 km extents with a 5,000 km continent intent. The feature occupies less of the larger World while keeping comparable kilometres.
2. Compare preferred and actual coverage. Try an explicit alternative, then regenerate; the application never applies one automatically.
3. Try a million-kilometre square at the largest supported detail. Review the sample-spacing warnings and either adjust the choices or acknowledge the limited result. Colossal is a deliberate separate choice.
4. Accept, close/reopen, sculpt, undo/redo and regenerate a selected area. Previously painted samples stay protected by default.
5. Open **Sea level & generation → Visual relief** in the map editor. Compare Classic/Natural/Enhanced/Dramatic. Watch that the terrain revision does not change merely from viewing relief. Existing maps start in Classic.

World features are approximate procedural shapes, not geologically simulated results. Coarse numerical resolution cannot represent ordinary local detail on extreme Worlds. Adaptive measurement, unit switching, rulers, physically sized editing controls, local refinement, Describe Your World, Town Maps/interiors/dungeons, Stage 3 simulation/styles and standalone Studio remain later work. No subsequent construction phase has begun.

# Atlas Pass 6 delivery

Starting checkpoint: `ca19ee19de2dbf3fef97d6a3bdb00044384a7b0d`. Final implementation: `60056f36575fa75eb02f7d202b6e077b73968820`; core implementation: `79f5012ebf71afa6cf88e709433a30d33c7b0fad`; compact-workspace/device checkpoint: `649a3b87357d60e9d153a0a5fc33a20ae954aa36`. This report and evidence follow in a documentation-only handoff commit. Owner hands-on acceptance remains separate. This pass does not complete Stage 2 or authorize Pass 7.

## Database and deployment

**NO NEW DATABASE MIGRATION REQUIRED FOR PASS 6.** No schema, applied migration, terrain DTO, database service, tile storage format or numerical resolution changed. Read-only local DEV verification found 137 ledger entries through `0136_world_terrain_sources`, matching SHA-256 `4ef0c01a4c1484fec257bd1c1ad53fe5f173e483022157c02245b685c201867f`. No shared database writes, Production access, Ubuntu changes, deployment or owner-service restart occurred.

Normal deployment assumes the existing migrations through 0136 and Pass 5 private terrain storage configuration. Production contents/configuration were not inspected; independently verify that target before any future deployment. Use the existing build/start process. There is no new environment variable or data-conversion step. Deploy only after owner authorization. Reverting to the preceding code checkpoint does not require reversing database changes; physical edits are ordinary saved numerical heights. Browser view preferences can remain safely stored when older code is used.

## Delivered behavior

- A restrained optional metre-aligned grid with automatic 1/2/5 intervals, 60–160 px hysteresis, manual spacing, major/minor lines, bounded labels and honest thinning at dense scales. Optional snapping starts off and affects canvas ruler/landform points; typed coordinates, freehand terrain and Town markers retain their own behavior.
- A permanent viewport-derived scale bar, visible extent, sample spacing and brush-footprint readout. Grid intervals and zoom are explicitly separate from numerical terrain detail.
- Automatic metric/imperial display and explicit km, m, mi, yd and ft. Height m/ft is independent. Exact international conversion factors apply; browser-local preferences never round-trip existing canonical values. Explicit feet height entry rounds to whole stored metres, while original metre-field validation remains intact.
- Temporary ruler, multi-point path and closed area, with Finish/Edit/Clear, draggable vertices, point selection/removal and precise coordinate inputs. Area includes perimeter and physical width/height. Measurements create no terrain revision or location record. Up to 256 points are supported.
- Shortest wrapped X segments by default, with explicit direct routes and waypoints. Seam polygons unwrap coherently. Self-crossing, degenerate and world-winding ambiguous areas show guidance rather than a false large area. North/south stays fixed; calculations remain flat and planar.
- Optional physical brush diameter/radius with actual metre-space circular influence on unequal sample axes. Sample mode retains its original output. All seven brushes keep strength/hardness, bounded stroke batches, exact one-patch undo, manual protection and autosave. Ridge/valley physical widths use the existing operation worker and numerical patch flow.
- Requested physical sizes remain visible when unsupported. Painting pauses until a supported request or explicit minimum/maximum adjustment is chosen. The million-km/1024-square example still has 976.5625 km sample spacing even when the measurement grid displays 1 km. No refinement or additional height samples are implied.
- Compact map-adjacent controls and normal-view quick brush settings; expanded controls scroll internally. Unit/grid/measurement changes preserve viewport pose and do not enqueue terrain tile shading. Source workshops and location-coordinate displays use the same preference without rewriting their canonical settings or positions.

## Evidence and validation

Evidence lives in [the Pass 6 evidence directory](../screenshots/worlds-atlas-pass6/). [The evidence index](../screenshots/worlds-atlas-pass6/README.md) links the screenshots and [validation receipt](../screenshots/worlds-atlas-pass6/validation.json). Tests use owned temporary PostgreSQL clusters and loopback production builds, never `.env.local` or shared database targets. Chromium runs with `--disable-gpu`; native input-protocol pen and touch emulation do not constitute physical-device testing.

Reference cases include a 100 km ruler, 150 km path, 5,000 km² rectangle, 20 km seam ruler, 2,000 km² seam polygon, physical circle on unequal sample spacing, retained request at extreme resolution, exact save/undo/redo/restart, and all 18 pre-Pass-6 sample-mode hashes. Preservation evidence checks the untouched generation kernels, renderer, storage, recovery, migrations, World business and gameplay foundations.

Validation completed:

- Final implementation: 2,327 root feature tests across 291 files; root TypeScript passed. Full lint: zero errors and one pre-existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts`. Final changed-file lint: zero errors/warnings.
- The full disposable Pass 1-6 browser/database run passed, including thirteen information creators, lifecycle, History/calendars, role/privacy/CSRF and disabled legacy endpoints. All 133 gameplay-table snapshots and retained legacy map rows stayed unchanged. Final readout placement/guidance/label-only polish was followed by a fresh final production build and all Pass 6 database/browser/device checks.
- Final Turbopack production build passed. Exact byte parity covers 1,529 source/data/public/package/config files in the owned production checkout.
- All 18 original brush/landform sample-mode reference hashes match. The 17 focused numerical tests cover conversions, known measures, large coordinates, wrapping, bounded grid plans, physical influence, cancellation and resolution limits.
- The protected-file manifest retains 1,779 existing source/data/public files, including 326 database/migration files; authoritative terrain command validation is exact.
- Desktop, 390 x 844 phone and 820 x 1180 tablet were inspected; native input-protocol pen/touch and keyboard checks passed. Expanded phone canvas remains 180 px high with controls scrolling internally. This is browser emulation, not physical-device certification.

Reproduce the full owned browser/database run with `node --conditions=react-server --import tsx scripts/worlds-atlas-pass6-disposable.test.ts`; it requires the established local PostgreSQL/Chromium executables and creates fresh isolated targets. Run numerical performance with `node --expose-gc --import tsx scripts/terrain-measurement-benchmark.ts`. Root checks use `node scripts/run-feature-tests.mjs`, `npm run typecheck` and `npm run lint`.

CPU observations on this machine:

- Final browser overlay samples during a 256-point path and rapid zoom/pan/unit changes: 0.9-1.8 ms; no terrain tile refresh. Retained browser heap increase after GC: 0.54 MiB. Native 256-click input dispatch time is reported separately from kernel work.
- Bounded physical brush stroke: 71,752 changed samples, seven batches, maximum 6.6 ms, exact one-patch undo.
- A 64-point physical ridge changed 430,626 samples in 112.3 ms in the numerical benchmark; the UI uses the existing worker.
- A 256-point area kernel averaged 0.43 ms. 10,000 extreme dense-grid plans stayed bounded. Repeated stroke/cancel testing retained about 2 MiB of additional numerical buffers after GC.

No known implementation blocker remains within Pass 6. Controlled deployment still requires owner authorization and independent target/configuration verification. Publication and independent/owner acceptance remain separate.

## Limits

The existing 1024-per-axis numerical ceiling is unchanged. A physical brush must fit the existing bounded interactive footprint on both axes; very unequal layouts may require sample mode or a different numerical layout. Coarse circles remain sampled approximations. Measurements are temporary and disappear on reopening; unit/grid preferences persist in the browser. Dense manual grids thin visible lines explicitly. World-winding areas need separate bounded outlines or a deliberate direct route. No regional refinement, Town Maps, new permanent landforms, environmental simulation or Studio work was added.

## Owner review

1. Open an existing World → Atlas map. Show the grid, zoom and pan, switch km/mi and height m/ft, then hide the grid and check the remaining scale bar.
2. Use Measure for a ruler, multi-point path and closed area. Finish, edit, drag/remove points and clear. On a wrapped map, compare the shortest seam route with the direct route.
3. Expand the editor and change units, tools and brush settings while keeping your position. On touch, navigate first, then deliberately enable one-finger measuring or painting; use two fingers to navigate.
4. Select physical brush diameter on a map with unequal physical width/height. Check the circle and stated footprint, paint, wait for autosave, undo/redo and reopen.
5. Try a small physical request on a million-km World. Check the stated sample spacing, paused painting and explicit practical adjustment. The requested value should remain visible.
6. Open Ridge/Valley and creation workshops to review the unit-aware dimensions and actual numerical preview. Confirm Town markers and the full Town/Shop builders still use their existing identities.

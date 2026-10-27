# Stage 3 Pass 3C - evidence index

See the [delivery report](../../operations/worlds-hydrology-s33c-delivery.md) for implementation, numerical interpretation, deployment/rollback guidance and limitations. All geography shown here is disposable test content. No owner database, private numerical objects, environment secrets or diagnostic World content is published.

Starting checkpoint: `001efbf0e22c920ba34b206e53db4ea62e00ac22`. Final application/test checkpoint: **`23ca9cd4d13e9a4b8fbd56cd43754867a2801f6b`**. The [validation receipt](validation.json) binds final checks and log hashes; the final file manifest binds screenshot/result bytes. Evidence/documentation commits after that checkpoint do not alter application code.

## Final run

`full-2/` is the final unfiltered production/database/browser run, including inherited terrain, materials, 3A/3B, new 3C and all Worlds/runtime-preservation checks. Its source verification identifies exact runtime files/build and the separately byte-verified validation scripts. Tests run from the main checkout against a disposable production app copy; application source and executable test scripts remained frozen throughout this run.

| Evidence | Purpose |
| --- | --- |
| [run-build.json](full-2/run-build.json), [source-verification.json](full-2/source-verification.json) | Exact production build/runtime source, test script hash and preserved historical implementation/assets/migrations |
| [results.json](full-2/results.json) | Complete unfiltered result, all Worlds checks, unchanged gameplay and retained old-map records |
| [natural-database.json](full-2/natural-database.json), [natural-backup.json](full-2/natural-backup.json) | Three document formats, exact retries/restores, concurrency, privacy and full owned-database backup/restoration |
| [natural-matched.json](full-2/natural-matched.json) | Same original v2 graph/terrain/camera rendered with 3C artwork |
| [natural-workflows.json](full-2/natural-workflows.json) | Acceptance identity reuse, explicit replacement, features, protection, recovery, history and independent terrain autosaving |
| [natural-devices.json](full-2/natural-devices.json) | Actual CDP native touch/pen, two-finger safety, cancellation and exact test cleanup |
| [natural-performance.json](full-2/natural-performance.json) | Cold/warm World/regional/close artwork, caches, worker review and main-thread input |
| [natural-precision.json](full-2/natural-precision.json) | v3 HTTP roles/CSRF, million-km wrapped geometry at a 32 m viewport, actual endpoint line and symbol pixels |
| [water-system-performance.json](full-2/water-system-performance.json) | Inherited million-km/fine-refinement 3A/3B workload; compare only with the equivalent prior workload |
| [completed-visual-review.json](full-2/completed-visual-review.json) | Fifteen supplementary completed-render captures, eight consecutive ready frames, exact historical geometry hash and no World API writes |

## Actual rendered comparisons

These are completed application captures, not mockups. GPU acceleration was disabled. Owner artistic approval, physical-device certification and parity with the owner's server remain separate.

| View | Actual screenshots |
| --- | --- |
| Original published 3B, matched graph | [Realistic Terrain](before-3b/matched-realistic-terrain.png), [Illustrated Fantasy](before-3b/matched-illustrated-fantasy.png), [Topographic](before-3b/matched-topographic.png) |
| Final 3C artwork, same old 754 segments/two lakes | [Realistic Terrain](full-2/reviewed-matched-realistic-terrain.png), [Illustrated Fantasy](full-2/reviewed-matched-illustrated-fantasy.png), [Topographic](full-2/reviewed-matched-topographic.png) |
| Saved 26-segment natural network, same accepted terrain, subsequent manual spring link retained | [Realistic Terrain](full-2/reviewed-natural-realistic-terrain.png), [Illustrated Fantasy](full-2/reviewed-natural-illustrated-fantasy.png), [Topographic](full-2/reviewed-natural-topographic.png), [Physical Relief](full-2/reviewed-natural-physical-relief.png), [Classic Elevation](full-2/reviewed-natural-classic-elevation.png) |
| Scale-dependent presentation | [World](full-2/natural-world-overview.png), [regional](full-2/natural-regional-waterways.png), [close river/shore](full-2/natural-close-river-and-shoreline.png) |
| Source and downstream relationship | [Linked spring](full-2/spring-and-downstream-network.png) |
| Steep reach / provisional wet areas | [Potential waterfall and wetland](full-2/potential-fall-and-provisional-wetland.png) |
| Creator wetland / river | [Boundary artwork](full-2/creator-wetland-and-river.png) |
| Lake inflows and outlet | [Unhighlighted lake](full-2/polished-lake-inflows-and-outlet.png), [connection inspection](full-2/water-lake-inflows-and-outlet.png) |
| Same saved special-feature geography in two styles | [Realistic Terrain](full-2/reviewed-features-realistic-terrain.png), [Illustrated Fantasy](full-2/reviewed-features-illustrated-fantasy.png) |
| Devices | [390 px touch](full-2/natural-390-native.png), [820 px pen](full-2/natural-820-native.png) |
| Extreme wrapped coordinates | [Protected fictional channel and endpoint waterfall](full-2/extreme-protected-course-and-fall.png) |

The same-grid SHA is `a26a70236bfe8a6991dfb8f42c7e1416f6da58a14e4e81e10a14e5e9e8e4ab77`; the old accepted geographic SHA is `c5ef135f7d15400e04308bda34a7af8da5c9db047ceed007478cc6d67f9a9930`. Matched original/final views retain all 754 segments. Explicit replacement selects 26 segments and two lakes; that second change is creator-accepted selection, not display deleting records. Repeated horizontal geometry is wrapped World copies. The straight fine cascade is an intentional sampling fixture, not evidence of natural valley complexity.

Some original workflow `matched-*`, `natural-network-*` and `special-features-*` screenshots caught Realistic Terrain while its tile drawing had resumed after a style change; their loading readouts remain visible. They are retained as raw workflow evidence, not the final visual comparison. The indexed `reviewed-*` images wait for eight consecutive ready frames and no drawing readout. They were captured after the full run by resuming only its owned app/database, without World writes; the old matched graph was loaded into an unsaved browser draft. The completed natural set includes the later deliberate spring/source edit; the selection-only step/counts remain recorded in `natural-workflows.json`. An initial supplementary login received the disposable test rate limit (429); retrying in the resumed owned app succeeded without changing auth configuration or shared services.

## Prior attempts and failures

These folders are retained as historical evidence and must not be treated as final-source acceptance:

- `before-3b/`: successful preserved 3B build and matched baseline.
- `after-display-1/`: failed production TypeScript check; save wrapper returned an optional Promise. Corrected to an async wrapper without weakening the contract.
- `after-display-2/`: successful early display-only build/comparison, predating later editing/safety corrections.
- `database-1/`: successful full three-format database/backup verification, without final application browser acceptance.
- `focused-1/`: failed UI timeout after Discard suggestions closed the feature section. Disclosure state and test navigation were corrected; its failure image/body remain.
- `focused-2/`: successful early 3C browser/native/performance run; predates acceptance safeguards and final precision verification.
- `focused-3/`: failed production build because a test Canvas element was typed as HTMLElement. Corrected the test's explicit HTMLCanvasElement type; assertions retained.
- `focused-4/`: successful expanded focused run at `b9136b8`, including channel precision. Later personal screenshot inspection found the endpoint symbol could be overpainted by another wrapped river copy. The earlier line-only precision assertion was insufficient; do not treat this success as final visual clearance.
- `full-1/`: inherited terrain/materials/3A/3B plus new feature/native/cache paths passed, then the strengthened actual-symbol pixel assertion failed against the `6170317` app (`darkSymbolPixels: 0`). This assertion was added in the root script during that run after screenshot inspection; the earlier `source-verification.json` is a point-in-time pre-correction snapshot, not an end-of-run script freeze claim. Draw order was fixed at `23ca9cd`. The failed aggregate is retained.

The [failure ledger](failures.json) preserves log excerpts/hashes for those attempts and the earlier focused protected-overlap assertion and verifier syntax correction. Raw local logs remain under ignored `artifacts/hydrology-3c-*`; the published ledger contains only sanitized test output. The final run uses frozen scripts and must pass the stronger assertion rather than waive it.

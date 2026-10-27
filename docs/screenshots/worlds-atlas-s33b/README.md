# Stage 3 Pass 3B evidence

Starting published 3A checkpoint: `7a875e49411eceaab29e5876f9a3c2a462ca4032`. Initial implementation: `b8ef5dae0ebf3cd151642370d14e04d0b3a26771`. Final implementation: `2d42efb7bf1235ed9ad65c4ed8d65d2a2f7c209c`. See the [delivery report](../../operations/worlds-hydrology-s33b-delivery.md) and [architecture](../../architecture/worlds-hydrology-s33b.md).

**Final result: PASS.** [Validation receipt](validation.json): 2,420/2,420 units in 302 files, zero skipped; TypeScript; whole-repository lint with zero errors and one pre-existing warning; offline Drizzle check; complete unfiltered production/database/browser regression; final correction-focused browser run. Both final runs use build `huJ0EDERHHEssVoMsY6tb`, runtime SHA-256 `6bb12b790094f3e0c5d6e9492931e1f9725f5cfecfa56883902b761b87d93835`, with 1,583 byte-verified runtime files. [The final-run manifest](final-run-files.json) hashes all 212 aggregate receipts/screenshots/files.

No new SQL migration. Existing 0141 remains the persistence prerequisite. All 142 historical migrations and database schemas are unchanged. Shared DEV/Production were not inspected or changed. Final installed-Chrome local lake review: 1,902.4 ms end-to-end, 1,462.3 ms worker, 330,765 connected cells, 59.4 MiB typed arrays, 18.3 ms navigation response. See the delivery report for the before/after allocation and precision limits.

All screenshots are actual installed-Chrome production-app rendering, using disposable numerical terrain and test users. No owner World, private diagnosis or fabricated artwork is included. Rendering was allowed to finish before capture. The fixtures are deliberately controlled terrain: a 64 km wrapped V-shaped mountain valley with two depressions, and a 20 km high-resolution island with a central depression inside a million-km World. Regular parallel/diagonal routing on the linear fixture is visible and remains a stated single-receiver limitation, not an artistic acceptance claim. Wrapped display copies share one stored geographic identity.

## Final application views

| Evidence | What it establishes |
| --- | --- |
| [Connected mountain system](full-2/water-connected-mountain-network.png) | Accepted channels and two potential lakes on the same numerical geography |
| [Lake inflows and outlet](full-2/water-lake-inflows-and-outlet.png) | Explicit inlet/outlet geometry after spill review; shared network highlighted |
| [Closed basin and watershed](full-2/water-closed-lake-watershed.png) | Closed lake, independently visible contributing-area overlay |
| [Realistic Terrain](full-2/water-realistic-terrain.png) | Same water geometry above land-material rendering |
| [Topographic](full-2/water-topographic.png) | Same accepted system in a cartographic appearance |
| [Edited river and lake](full-2/water-edited-river-and-lake.png) | Creator geometry, explicit fictional connection, retained water surface |
| [Terrain reconciliation](full-2/water-terrain-review-retained-lakes.png) | Terrain edits retain water identities and protected shoreline |
| [Local lake in a million-km World](full-2/water-million-km-fine-lake.png) | Fine accepted lake inside a much larger numerical World |
| [Fine shoreline](full-2/water-fine-lake-shoreline.png) | Stable geographic shoreline under closer zoom; land materials stay beneath water |
| [390px native touch](full-2/water-390-native.png) | Actual CDP touch lake creation/save and responsive phone layout |
| [820px native pen](full-2/water-820-native.png) | Actual pen-oriented tablet journey |

The phone/tablet inputs are native browser-event emulation on installed Chrome with GPU disabled. They do not replace physical-device or owner acceptance. Terrain artistic quality remains rejected/deferred; owner-runtime parity and independent Ember review remain outstanding.

## Commands and receipts

Commands run from the main checkout with the owned app/database isolated. No `.env.local` is loaded by the disposable runner. The offline Drizzle check receives a placeholder loopback URL on port 9; it does not contact a database.

```powershell
node scripts/run-feature-tests.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --format json --output-file artifacts/hydrology-3b-lint-corrected.json
$env:DATABASE_URL='postgresql://offline:offline@127.0.0.1:9/offline'
node node_modules/drizzle-kit/bin.cjs check
```

Full disposable production/database/browser regression:

```powershell
$env:SERRIAN_WATER_SYSTEM_PASS='1'
$env:SERRIAN_WATER_SYSTEM_ONLY='0'
$env:SERRIAN_WATER_ONLY='0'
$env:SERRIAN_WATER_SKIP_MIGRATION='0'
$env:SERRIAN_S32_FOCUSED='0'
$env:SERRIAN_S32_EVIDENCE_DIR='docs/screenshots/worlds-atlas-s33b/full-2'
$env:SERRIAN_TERRAIN_REUSE_BUILD='1'
node --conditions=react-server --import tsx scripts/worlds-surface-disposable.test.ts
$env:SERRIAN_WATER_SYSTEM_SOURCE_EVIDENCE='docs/screenshots/worlds-atlas-s33b/full-2/source-verification.json'
node scripts/worlds-water-source-check.mjs
```

The runner rebuilds when runtime source bytes differ, even with reuse enabled. Its checkout is a disposable production-build copy; development and commits remain in the owner's normal main checkout. Browser/DB test fixtures, accepted water history and numerical data are recreated in owned targets. No shared DEV/Production is involved.

| Receipt | Coverage |
| --- | --- |
| [Source verification](full-2/source-verification.json) | Byte-exact production source/build, original flow body/mesh, all historical SQL/schema/snapshots, original materials and numerical/rendering services |
| [Complete aggregate](full-2/results.json) | Fresh migration replay/build and inherited Atlas/Worlds/privacy/lifecycle/gameplay preservation |
| [Water database](full-2/water-system-database.json) | v1 compatibility, v2 lakes/ports, old pending retries, downgrade refusal, concurrent winner, invalid geometry, roles and unchanged numerical head |
| [Backup/restoration](full-2/water-system-backup.json) | Complete database dump/restore, exact old/extended heads and history, actual restored-service reads, repeated migration and immutable history |
| [Water workflows](full-2/water-system-browser.json) | Suggestions, watersheds/units, lake links, editing/undo, recovery, conflicts, old history, old-network acceptance and terrain reconciliation |
| [Native input](full-2/water-system-devices.json) | Phone/tablet drawing/save, safe two-finger navigation, early cancellation and no numerical writes |
| [Measured performance](full-2/water-system-performance.json) | Actual before/after worker/elapsed/memory/input figures and loaded numerical overview pins |
| [Baseline water regression](full-2/hydrology-browser.json) | Original 3A authoring, original recovery/privacy and all five appearances |

The full directory also preserves inherited generation/sculpting/physical-scale/measurement/refinement/description/cartography/imagery/material/Worlds/Town/Shop/role regression receipts and screenshots. No failures are omitted to obtain a passing final result.

## Earlier attempts and corrections

The [development run ledger](development-runs.json) records local log hashes and result lines. Selected failed output is retained here; raw logs remain ignored under `artifacts/hydrology-3b-*`.

| Attempt | Result and correction |
| --- | --- |
| [Refinement contour regression](failed-core-refinements.txt) | 20/21 passed. A contour margin based only on finest spacing cut off contributing coarse cells. The margin now uses physical contributing-cell extents; the unchanged assertion and expanded tests pass. |
| [Stronger mountain fixture](failed-core-mountain.txt) | 20/21 passed. A supposed unrelated course actually drained into the selected lake and correctly caused a cycle rejection. The test now chooses an independent connected component; cycle protection remains. |
| [First worker typecheck](failed-types-worker.txt) | A missing `EMPTY_HYDROLOGY` import failed compilation; fixed before any passing build. |
| [Focused 2](failed-focused-2.txt) | Browser timeout exposed refusal of a full-circumference watershed. Added bounded canonical-cut watershed geometry with numerical coverage; later full runs pass. Its screenshot/body remain in `focused-2`. |
| [Old-network acceptance regression](failed-existing-network-fix.txt) | 24/25 passed. Acceptance lost a protected-route lake review flag. Merge now retains that flag and any existing outlet; 25/25 focused and 2,420/2,420 full units pass. |
| [Focused 5](failed-focused-5.txt) | New connection checks passed, then the test tried a shoreline field in a collapsed section. The journey now opens it explicitly. Failed screenshot/body remain in `focused-5`; focused 6 passes every check. |

Initial scoped lint warnings were corrected. Whole-repository lint retains only the existing unused `LoreFamily` type warning in `scripts/worlds-stories-checks.ts`. PowerShell initially refused the `npm.ps1`/`npx.ps1` launchers; checks were run through their Node entry points without changing execution policy.

`full-1` passed the entire unfiltered chain at the initial implementation checkpoint. Its [source checkpoint receipt](full-1/source-checkpoint.json) binds the earlier build to `b8ef5d…`; final lake-port and old-network corrections are covered by `focused-6` and the final `full-2`. The earlier aggregate inherited a hardcoded `newMigrations: 1` label from 3A: no SQL was added, and the final aggregate correctly reports zero new migrations and five inherited replays. Earlier passing runs are retained as historical evidence, not substituted for the final corrected run.

No Production access, migration, deployment, owner-server restart, owner visual acceptance or Pass 3C execution is represented by these results.

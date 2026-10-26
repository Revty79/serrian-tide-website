# Pass 3A evidence index

The fixtures in this directory are newly owned disposable test data. No shared DEV/Production content or private owner diagnosis is published.

- `focused-1`: first browser attempt failed on an unrealistically exact subpixel mouse-coordinate assertion after a successful database check/build. Failure screenshot/text and intermediate screenshots are retained. A 30 m move at this World scale was smaller than one CSS pixel. The corrected browser test makes a visible 5 km move, checks both axes within one pointer pixel, asserts a material change and retained identity, and retains exact numeric coordinate tests in the unit suite.
- `focused-2`: complete focused water workflow, recovery/security, phone/tablet touch/pen, cancellation and million-km performance pass. The complete regression chain and populated migration rehearsal were intentionally deferred to the full run, not represented as covered here.
- `full-1`: full previous Atlas/Worlds regression chain plus the new hydrology checks, fresh production build and migration rehearsals. **Passed without filtering or skipped groups**, including all earlier creator, terrain, cartographic, material and information-workspace checks. `results.json` has no browser errors and 142 applied disposable migrations. `hydrology-migration.json` records the populated 0140 upgrade and restore rehearsal.

Earlier development failures and final validation receipts are indexed in `validation.json`. Long raw logs remain in ignored local `artifacts/hydrology-*`; their checksums and relevant summaries are retained here. Failed aggregate evidence remains separate from later passing results.

[Delivery and limitations](../../operations/worlds-hydrology-s33a-delivery.md).

- `final-water`: **passed** against the same production build at test checkpoint `0293ac759832e7f5bb9912ae950fd8874dc44f69`, with selected-course/downstream acceptance, exact remove/undo and numerical editing-source switches additionally verified. Its `source-verification.json` binds the final source copy to the application build. This focused run does not replace or expand the full-run migration coverage.

## Actual screenshots

- [World accepted water](final-water/hydrology-world-accepted.png), [regional confluences](final-water/hydrology-regional.png), [close-up](final-water/hydrology-close-up.png). The controlled terrain is deliberately a simple ramp/valley; straight and parallel D8-style routes remain visible rather than being artistically concealed.
- [Fine island on a million-km World](final-water/hydrology-million-km-fine-island.png), [fine river close-up](final-water/hydrology-fine-river-close-up.png), [World overview](final-water/hydrology-million-km-world.png).
- [Realistic Terrain with water](final-water/hydrology-realistic-terrain.png), [water hidden](final-water/hydrology-imagery-water-hidden.png), [topographic](final-water/hydrology-topographic.png), [illustrated](final-water/hydrology-illustrated-fantasy.png), [classic](final-water/hydrology-classic-elevation.png), [physical relief](final-water/hydrology-physical-relief.png).
- [390 px native touch](final-water/hydrology-390-native.png), [820 px native pen](final-water/hydrology-820-native.png), [Admin read-only review](final-water/hydrology-admin-read-only.png).

All five appearances, World/regional/close-up views, fine-island close-up and phone/tablet captures were personally inspected. The water overlay is legible and follows the graph; its angular/parallel geometry remains a known first-method limitation. Terrain visual quality remains owner-rejected/deferred. This is not Ember approval or physical owner-hardware acceptance.

## Final technical results

2,407/2,407 unit tests; 301 files; no skips. TypeScript, production build, Drizzle, complete regression and final water browser runs passed. Repository lint: zero errors and one pre-existing unused type warning in `scripts/worlds-stories-checks.ts`. Additional delivery scripts: zero errors/warnings. `validation.json` preserves failed attempts and log digests separately.

Measured final million-km sample: 327,684 cells; 870.6 ms worker computation; 1,208 ms end-to-end; 48.8 MiB retained/working typed arrays; 36.8 ms keyboard navigation response during calculation. JavaScript/browser overhead is additional. GPU disabled, installed Chrome 134, emulated devices; see `final-water/hydrology-performance.json`.

**Migration 0141 has only been rehearsed in disposable databases. Shared DEV and Production were not migrated or written. No deployment or Pass 3B was performed.**

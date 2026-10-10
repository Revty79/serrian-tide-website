# Atlas naturalism and performance evidence

Real Chromium screenshots from the isolated production build, using disposable synthetic private Worlds. These files are repository evidence and must be included in the release commit. They contain no Production data or copied reference artwork. The original 3C screenshots remain unchanged in `../worlds-atlas-pass-3c/`.

| Capture | Recipe / purpose |
| --- | --- |
| [Chaotic world](chaotic-world.png) | Continental preset, `refinement-acceptance-2026`, v2: unequal continents, rotated coastlines and uneven terrain. |
| [Broken archipelago](broken-archipelago.png) | Archipelago preset, same seed, v2: varying island sizes, loose clusters/chains and open ocean. |
| [Dramatic continent](dramatic-continent.png) | Northern preset, same seed, v2: single directional continent, contrasting coastline character and regional terrain. |
| [Description before](description-before.png) / [after](description-after.png) | Identical 3C example paragraph, `description-example-2026`, identical interpreted plan/appearance; only algorithm v1 versus v2 differs. These are newly captured real previews of both engines. |
| [Dense map](dense-map.png) | Generated rugged chart plus native editable stress strokes, over 5,200 terrain marks. This deliberately stresses the current source limit, rather than calling a sparse generated map dense. |
| [Dense PNG export](dense-export.png) | Full 2000×1200 native artwork export after the dense editing/save/reopen check; reusable definitions are preserved. |
| [Phone editor](regressions/phone-editor.png) | Real 390×844 touch generation, terrain edit and save; source retains its identities. |
| [Phone description workflow](regressions/phone-description.png) | Supported-plan review, warning acknowledgment, worker preview and save on a phone viewport. |
| [Desktop generation controls](regressions/generation-controls.png) | Shared appearance and guidance, Natural/Original landscape choice and preview workflow. |

The other files in `regressions/` record the existing 3C workflows against this refinement. [performance.json](performance.json) contains measured production-browser frame/long-task results, full-detail DOM/mark/cache counts and three pure generator timing runs for each small/medium/dense recipe and engine. [performance-before-raster.json](performance-before-raster.json) preserves the measured baseline before resolution-aware caching. These are measurements on this checkout's test machine, not guarantees for every device. See the [completion report](../../reports/worlds-atlas-refinement-2026-10-10.md) for interpretation, limits, validation and deployment instructions.

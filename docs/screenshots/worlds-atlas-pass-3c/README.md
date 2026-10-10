# Atlas Pass 3C browser evidence

Real screenshots from Chromium against the disposable PostgreSQL/Next production browser regression. All Worlds, names and accounts are synthetic. Native editable SVG artwork is rendered using the application's shared map appearance roles; these are not generated raster assets or reference artwork.

| Capture | Recipe and seed | Demonstrates |
| --- | --- | --- |
| `continental-world.png` | Continental world, `atlas-world-2026` | Three major continents, eight islands, six rivers, three lakes, mixed terrain, Illuminated. |
| `northern-continent.png` | Northern continent, `atlas-north-2026` | One large northern continent, rugged west, eastern bays, vertical central range, southern woodland, five islands, three rivers/two lakes, Parchment. |
| `archipelago.png` | Archipelago, `atlas-islands-2026` | 28 varied islands, separated ocean space, four rivers/two lakes, tropical terrain, Illuminated. |
| `rugged-world.png` | Rugged fantasy world, `atlas-rugged-2026` | Four irregular continents, seven islands, high mountain/ruggedness tendencies, eight rivers/five lakes, Parchment. |
| `generation-controls.png` | Continental world, `atlas-world-2026` | Desktop settings and explicitly unsaved full-map preview. |
| `edited-generated-map.png` | Northern continent, `editable-acceptance-2026` | Saved/reloaded map after coast sculpt, island move, range/forest/river edits and named Brightwatch settlement. Original relevant IDs are asserted stable. |
| `phone-generation.png` | Archipelago, `phone-generator-2026` | 390 × 844 phone settings, full preview and acceptance form without horizontal overflow. |
| `phone-editor.png` | Edited northern continent above | Existing phone editor after a further forest-density change/save. |

Exact preset settings and placement defaults are versioned in `src/features/worlds/generation-spec.ts`. The regression uses several seeds and also checks 25 preset/seed combinations in unit tests. Actual land percentage is reported rather than guaranteed. See [generation architecture](../../architecture/worlds-atlas-generation.md) for deterministic source/version/identity behavior.

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
| `description-driven.png` | Example paragraph, `description-example-2026` | One large northern continent, three eastern islands, deep western bays and an additional eastern bay, central vertical range, southern woods and one eastern river outlet. Illuminated appearance; actual land 23.89%. |
| `description-controls.png` | Same paragraph and seed | Desktop original paragraph, full reviewed plan, explicit river-width limitation/acknowledgment and unsaved preview before acceptance. |
| `phone-description.png` | Same paragraph, `phone-description-2026` | Real 390 × 844 description review, acknowledgment and preview. Subsequent save is asserted in the regression. |
| `phone-description-map.png` | Same phone description seed | Complete native preview at phone width; source coordinates remain 2000 × 1200. |

Exact preset settings and placement defaults are versioned in `src/features/worlds/generation-spec.ts`. The regression uses several seeds and also checks 25 preset/seed combinations in unit tests. Actual land percentage is reported rather than guaranteed. See [generation architecture](../../architecture/worlds-atlas-generation.md) for deterministic source/version/identity behavior.

The exact description paragraph is versioned as `descriptionExample` in `src/features/worlds/description-interpreter.ts`. Unlike presets, description interpretation uses a documented simple baseline and supported explicit instructions. The primary example uses 48% approximate land target, large/balanced shape, 88% western ruggedness, three deep western bays plus one east bay, 65% mountain tendency/one central N–S range, 85% southern woodland tendency, three eastern islands, one eastern river, zero lakes and temperate terrain. The original paragraph's relative river width is not interpreted and is visibly acknowledged. Generated features, drawing/source-point IDs and direction/count/terrain source are asserted rather than inferred only from these screenshots.

# Native Atlas generation

Pass 3C extends the ordinary 3A polygons/geography records and 3B terrain, paths, labels and presentation. Blank drawing, existing editing and PNG export remain available. Generated content passes the same strict draft and database validators as manual content. Decorative terrain creates no place identities.

## Technology review

The current upstream repositories, licenses and dependency manifests were checked during this pass:

| Option | License and integration | Decision |
| --- | --- | --- |
| [Mapgen4](https://github.com/redblobgames/mapgen4) | [Apache 2.0](https://github.com/redblobgames/mapgen4/blob/master/LICENSE); triangulation, sampling, noise and rendering dependencies. Its terrain mesh and raster presentation would need conversion into native editable Atlas features. | Valuable reference for terrain generation, but importing the mesh pipeline would add substantial conversion and maintenance work. |
| [Azgaar](https://github.com/Azgaar/Fantasy-Map-Generator) | [MIT](https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE); a larger application with D3, triangulation, UI and simulation dependencies. | Its full application and broader simulation are outside this pass. Extracted algorithms would still need a native source conversion. |
| Original native generator | Repository-owned TypeScript using existing SVG artwork and contracts. | Selected: no new packages, copied third-party code, external generation service or asset licensing requirements. |

If third-party code is incorporated later, retain the applicable license/copyright notices and comply with upstream attribution and modification requirements. No reference artwork was copied.

## Engine and bounds

`serrian-atlas-v1` hashes an explicit seed into a deterministic pseudorandom stream. Correlated periodic radial components create irregular headlands and coastlines, with independently controlled carved bays. Major landmasses occupy separated areas; bounded rejection sampling places varied islands in available ocean. Woodland strokes cluster in chosen inland regions; illustrated mountains follow coherent directional ranges. Broad biome marks supplement those groups. A bounded land-cell search routes rivers from the interior/mountain flank toward actual coast vertices, avoiding uphill/range penalties. Modest source-point meanders and existing native path curves are checked against land; valid less-curved source is retained when smoothing would cross ocean. This is artistic geography, not a geological or climate simulation.

The source remains 2000 × 1200 map units, with 160 vertices per generated continent and 64 per island. All original limits remain: 128 features/geography drafts, 256 vertices/polygon, 8192 geographical points, 512 drawings, 128 points/stroke/path, 16384 drawing points, 600 derived terrain marks/stroke and 6000/map. Group spacing is adjusted within existing controls to meet mark budgets. Important requested groups/counts are not truncated. Invalid settings or packing/routing failures give an explicit adjustment message; attempts are bounded. The existing 2 MB private POST limit remains in force.

Settings cover map type, 0–6 major continents (exactly one for a continent map), 0–32 offshore islands, approximate 10–55% land coverage, size/shape, 0–100 ruggedness/mountain/woodland tendencies, 0–12 rivers, 0–10 lakes, broad biome, appearance and a 1–64-character seed. Placement supports a single directional continent; several continents use separated automatic placement. Terrain placement is relative to each landmass. Bays, range direction/count and cardinal river outlets have optional controls. Initial settings remain approachable with optional advanced sections. Coverage and densities are explicitly artistic tendencies; actual land coverage is reported in the preview. Presets include continental world, northern continent, island world, archipelago and rugged world.

## Description interpretation

Checkpoint B adds an original deterministic English vocabulary interpreter, version 1. No private text is sent to an AI provider or another external service. Descriptions begin from one large balanced temperate continent, mountains/woods, one river, no offshore islands/lakes, the current appearance and explicit seed; unspecified features are shown in the complete review plan. This baseline makes interpretation repeatable rather than dependent on prior form edits.

Use short sentences or comma-separated feature clauses. Supported words are matched case-insensitively; the trimmed original paragraph is retained. Counts use digits, zero through twelve, a/an (one), several (three), and many islands (24). Counts above twelve should use digits. Counts are exact within their existing limits; invalid/negative/fractional/oversized counts fail visibly instead of being capped. At most 4000 characters and 48 clauses are accepted.

| Instruction | Actual interpretation |
| --- | --- |
| `one large continent in the north`, `medium continent in the southwest` | Main-continent count, bounded size and cardinal/diagonal placement. Small/medium/large/varied and balanced/elongated/crescent/varied shapes are supported. Tiny/huge map to bounded small/large with a notice. Several continents use automatic separated placement, with a notice if directional positioning was requested. |
| `three islands off the eastern shore`, `28 islands in the southeast`, `an archipelago` | Additional island count and broad cardinal/diagonal placement. Archipelago selects zero main continents and 24 islands. Island-only maps support small/medium/large/varied sizes; independent offshore-island size beside a continent is explicitly unsupported. |
| `western coast is jagged`, `smooth coast`, `several deep bays` | 88% ruggedness on the named coast (smooth: 15%); one/three or explicit 0–4 bays per continent and depth 1 or 3. A subsequent bay clause inherits the preceding coastline side. Coast/outlet sides are cardinal, not diagonal. |
| `two mountain ranges run north to south through the center` | Up to three ranges per continent, a region and N–S/E–W/NE–SW/NW–SE orientation. Density is 65% by default, 35% sparse or 85% dense/rugged; no mountains disables it. Relative peak height/range length is disclosed as unsupported. |
| `dense forests in the southern regions`, `sparse woodlands in the northeast` | Woodland tendency 85%/30% (ordinary: 65%), and its broad region. No forests disables it. Rainforest also selects tropical terrain. |
| `a river from the mountains toward the eastern bay`, `two rivers to the west` | River/stream count and cardinal outlet. Sources use generated mountain flanks or the interior; explicit directional source placement is disclosed as unsupported. A requested bay outlet adds a bay on that coast without removing an earlier coast's bays. Relative width, stream-only styling and lake-connected routing are disclosed as unsupported. |
| `two lakes in the west` | Exact count of editable inland lake groups and broad region. Relative lake size is disclosed as unsupported. |
| `desert in the east`, `grasslands in the south`, `wetlands in the west`, `snow in the north` | Additional native terrain strokes in the specified broad region. Plains/swamps/tundra are recognized equivalents. Hills/valleys support broad automatic terrain; specific placement is disclosed as unsupported. Removing biome terrain by negative description is not supported. |
| `cold climate`, `temperate`, `arid`, `tropical`, `mixed` | Existing broad illustrated biome tendency. Cold/cool/frozen/icy select northern, dry selects arid; warm/hot alone prompts clarification rather than inventing a climate simulation. |
| `parchment style`, `illuminated`, `night` | Existing map appearance, without changing editable contracts. |

The review shows the whole resulting settings/feature plan, understood clauses and unsupported/ambiguous details before previewing. Unknown words, unnamed unsupported major features, conflicting counts/regions, opposite regions and compound secondary feature instructions are explicitly reported. Conflicting supported assignments use the later instruction and retain a warning. Unrestricted grammar, named towns, volcanoes, civilization simulation and arbitrary prose are not claimed. Put each major feature in its own clause. `No forests`/`zero islands` are supported; ambiguous `not` clauses are not applied. A paragraph containing no supported instructions fails visibly.

If limits remain, the user must either revise the paragraph or explicitly acknowledge a partial plan. Text changes invalidate review and acceptance; recipe changes invalidate the previous preview. Switching to configured settings retains the resulting settings but clears the description/interpretation claim. The server reinterprets the paragraph and requires an identical normalized plan/understood/warnings record, plus explicit warning acknowledgment. Forged interpretations and omitted warnings fail atomically. Description metadata survives save/reload, normal manual edits, duplication and new variations; the editor's Creation recipe shows the original text, interpreted instructions and acknowledged limits.

The example paragraph is exercised against actual saved native source: one northern continent, three eastern islands, jagged western coast and deep bays, a central north–south range, southern woods and one eastern coastal/bay outlet. Its `large river` qualifier produces an explicit width limitation. Separate tests cover diagonal regions/orientations, extra terrain, climate, zero counts, unsupported details, conflicts and forged plans. Production browser checks cover interpretation, stale text, acknowledgment, saved geometry, later edits, source-preserving variation, private HTTP metadata and phone generation/save.

## Save, identity and reproducibility

Preview runs locally without persistence. Accepting creates a new map; the authorized server regenerates and validates the same recipe. UUIDs come from an independent cryptographic identity source, so equal version/seed/settings reproduce equivalent shapes and artwork while new maps have independent map, geography, feature, vertex, drawing and drawing-point identities. Uncontrolled `Math.random` is not used.

Creation requests carry a stable new-map ID. World-root serialization and a normalized request hash make concurrent/repeated creation idempotent. An acknowledged request cannot later regenerate a manually edited map. A readback failure after acknowledgment instructs the user to reload the saved Atlas. Validation and save failures retain the preview and settings. Editing uses existing revision protection and stable source IDs.

Duplicate creates independent features, vertices, drawings and drawing points, while retaining links to the same World geography. Shared place metadata is still subject to its own revisions. Generate variation creates a new map and new geography from a source recipe; source map/revision provenance is retained. Neither operation overwrites the source. All source references are checked against the owner and World before generation.

Nullable `world_atlas_map.generation` stores the original recipe, optional description/interpretation, author, timestamp, algorithm/seed and source map/revision separately from authoritative editable source. Manual save never rewrites that creation record. After editing, reproducibility describes the original starting arrangement, not the current map. Future algorithms must retain version distinctions; saved maps are always read from source rather than regenerated on load.

## Privacy and scope

The existing World root authorizes reads and writes. Metadata, original descriptions and source references are private under the same rules as maps. Explicit foreign-World Administrator review remains read-only. Players, anonymous users, another G.O.D. and implicit Administrator access remain blocked. Same-World restrictive foreign keys, strict metadata validators, CSRF protection, no-store responses and normal revisions remain authoritative. Layer visibility is an editing control, not a permission boundary. No canon controls, automatic Campaign/Character changes, city/interior/dungeon tools or connected-scale navigation are added.

## Migration and recovery

New `0106_worlds_atlas_generation.sql` follows unchanged 0105. It adds two nullable map columns, a same-World source-map FK and strict immutable metadata validation. Existing map geometry, drawing order/content, geography identities, map revisions and timestamps remain unchanged. The disposable rehearsal applies 0102–0105 in stages over saved 3A/3B data, then 0106; a separate catalog rehearsal covers a fresh full-chain install. Reapplication must not alter existing data. All older migrations/snapshots remain immutable.

For a controlled release, verify target identity and ledger, retain a verified backup/current release, pause Atlas writers, run pending committed migrations in journal order with `npx drizzle-kit migrate`, build/activate the verified release, then smoke-test owner editing and denied/review roles. No new environment variables or services are required. This document does not authorize those operations.

Reverting application code does not undo migration 0106. A prior 3B reader can ignore the nullable creation fields and display native generated source; it cannot create or display generation provenance. Pause Atlas writers during rollback and retain source/provenance columns and the ledger. Prefer a forward fix. A backup restore requires stopped writers, a verified target/backup and reconciliation of edits made after that backup.

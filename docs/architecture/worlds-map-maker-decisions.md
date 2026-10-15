# Initial Map Maker and later mapping projects

Owner decisions recorded 2026-10-14 during the C2/C3 deployment repair, from pushed C3 `14f9e2c24a17de16a37527a5f7e6de8aa2c2b58c`. These are permanent requirements for later separately authorized work. Recording them does not authorize Geo D/E implementation.

## Progressive source resolution

Keep C3's worldwide ESA WorldCover 2021 approximately 594-metre categorical overview. Its resolution is a baseline, never an architectural ceiling. Do not replace it with the approximately 117-GB native worldwide archive.

The current 256-MiB C3 release-acceptance budget measures that retained overview foundation and its indexes; it is not a permanent platform/creator storage quota or a resolution ceiling. Later separately approved regional provisioning must state its additional storage and revise the operator acceptance policy deliberately, without silently dropping the shared overview or immutable history.

The source engine must select inexpensive coarse representations worldwide, finer available sources regionally, and genuine high-resolution sources locally where provisioned. Areas without finer coverage remain usable and state their available resolution. Zooming cannot invent source accuracy. Land-cover classification at 10 metres does not establish 10-metre elevation, building footprints or photographic imagery; those require independent sources or authored content.

Future source descriptors must distinguish immutable originals from derived display imagery and record spatial coverage, native cell size/units and registration, coordinate reference/topology, observation period, provenance, license, dataset/version identity and derivation method. Region and zoom selection must be generalizable across Worlds and surface references, rather than keyed to Earth names or one test location. Define deterministic overlap/precedence and NoData behavior, preserve exact version pins and privacy, and expose the actual source resolution separately from a generalized display level. New finer regional sources extend retained identities; they do not silently replace original samples or historical accounts.

## Initial Earth presentation

The initial unified Map Maker must open worldwide Earth in a normal **flat rectangular map presentation by default**, while retaining the existing alternate geographic projections as selectable options. Earth's spherical coordinate reference remains authoritative: choosing a flat display does not turn Earth into a planar World or change its source coordinates.

During D1, visually verify the intended full-world presentation in the actual application; do not assume today's projection label produces the desired appearance. Advanced interrupted, unfolded-globe and other sophisticated global projections belong to the later Advanced Map Studio, outside this initial integration.

## Geo D increments

The owner separately authorized [D1-B previews and complete visible-map export](worlds-geo-d1b.md) from approved `2683a72d3c41d4c6fce0515d307f6a844536cfe1`. It preserves original sources and stops at local review; no later increment, push or deployment is authorized.

The owner separately authorized [D1-A unified Geographic Atlas foundation](worlds-geo-d1a.md) from approved `fcf911d24641436424c7acf766baba7cebe5b10c`. Its local implementation does not authorize D1-B or later increments, push or deployment.

| Pass | Required usable result |
| --- | --- |
| D1 — Unified Map Maker | Combine imported geographic vectors, C2 relief, C3 classifications and creator-authored Atlas content in the actual working Map Maker. Remove the confusing blank-Atlas separation. Deliver stable pan, deep zoom and navigation using available geographic detail. Resolve automatic screen jumping, including source-reader and workspace scrolling. |
| D2 — Visual editing | Direct visual creation and reshaping of fictional geography, with proper saving, undo/redo and retained history. |
| D3 — Procedural geography | Believable generated fictional geography whose saved source remains editable, rather than a locked image. |
| D4 — Connected scales | World → Continent/Region → Settlement/City → Building → Interior → Dungeon. Select a city on a larger map and open its associated detailed map. Preserve existing place/map identities, relationships and navigation. |
| D5 — Good-quality cartography | Attractive, readable 2D maps across these scales, including visual asset improvements for settlements, interiors and dungeons, without expensive artwork or dedicated server GPU infrastructure. |

Each increment must independently meet the [deployment standard](../operations/pass-deployment-standard.md); a later increment cannot be a prerequisite for its functionality. Existing Atlas editing, immutable histories, sources, shared baseline artwork and server-side ordinary/review filtering remain protected.

D4 and Geo E must explicitly review historical interior/dungeon layout changes across connected scales. Preserve the [Living History foundation](worlds-living-history-acceptance.md): shared baseline artwork and requested time context do not establish dated room/layout coverage. Review the requirements and separately approve any dated-layout authoring scope before implementation; this CI correction adds no such authoring.

## Geo E acceptance

Demonstrate an entire fictional map-building journey through the visual interface. Also demonstrate a real Earth journey from worldwide overview into a selected region, progressively selecting genuinely finer provisioned data, including **native 10-metre ESA land-cover classification in at least one manageable region**, and continued navigation into linked local maps. Retain accurate resolution, source identity and provenance throughout. Regional acquisition/provisioning must be reusable for another selected region, without a hardcoded demonstration location or downloading the native worldwide archive. Deep zoom and progressive detail belong in the initial D/E Map Maker, before Advanced Map Studio.

## Shared foundations and accounting

Retain authoritative common geographic foundations once and reuse them when appropriate. Store creator modifications separately from immutable shared data. Campaign use must not automatically duplicate large datasets. Make shared platform bytes distinguishable from creator-owned bytes so future subscription/storage accounting can be added without redesigning the engine. This decision does not authorize subscriptions, quotas, payments, Campaign runtime integration or broader sharing permissions.

## Later standalone work

Advanced Map Studio remains a separate project after the complete initial 2D Map Maker and the approved intervening Worlds phases. It adds professional artistic rendering, advanced procedural generation, terrain sculpting, 2.5D/3D exploration and broader high-resolution coverage. It must support spherical, flat, hollow, cylindrical, polyhedral, ring-shaped and custom topologies, without assuming Earth-like creator Worlds. It cannot be a prerequisite for the visual Map Maker promised by Geo E. Comprehensive Historical Earth remains the final stage of the later standalone mapping effort.

Worlds remains standalone. Future VTT integration is a separate dashboard application, outside Worlds and Paths. This repair implements none of these future controls, sources or commercial systems.

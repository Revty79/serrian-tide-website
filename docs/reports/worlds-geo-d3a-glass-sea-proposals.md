# Glass Sea geographic proposals - D3-A

These are disposable-copy proposals for owner review, not established Glass Sea geography or lore. Nothing was added to persistent Glass Sea or DEV. Original Glass Island, its opening, Copper Isles, Glass Channel, artwork, source identities/versions and the planar surface remain retained.

Use the existing `AUTHORED:glass-sea` reference, local units and `[0, 0, 2000, 1200]` surface bounds. Recipe algorithm: `serrian-geography-v1`, with frozen Atlas V2 land defaults. Bounds below are `[west, south, east, north]` coordinate values; the original planar Atlas canvas orientation is preserved. Names here describe proposals, not new canon.

| Candidate | Reproducible seed | Target extent | Complete configurable settings |
|---|---|---|---|
| glass-east-chain | `glass-east-chain` | `[1510, 20, 1980, 180]` | 0 major / 16 islands; requested coverage 25%; complexity 68; size varied; shape varied |
| glass-low-y-shelf | `glass-low-y-shelf` | `[50, 50, 1100, 180]` | 1 major / 5 islands; requested coverage 45%; complexity 72; size large; shape varied |
| glass-high-y-island-7 | `glass-high-y-island-7` | `[1600, 950, 1950, 1150]` | 0 major / 1 islands; requested coverage 40%; complexity 85; size large; shape crescent |

The three candidate extents are clear of the original features' retained bounds. New generation does not automatically resolve collisions with other saved sources; the preview overlay lets the owner inspect proposed additions before acceptance.

- **Eastern island chain:** A promising larger expansion for future maritime routes and regional maps. Sixteen separate editable islands can later support varied terrain and waterways without changing Copper Isles. Generated 16 sources / 1152 vertices; actual design coverage 14.81% of the chosen extent. [Context screenshot](../screenshots/worlds-geo-d3a/glass-sea/glass-east-chain-context.png).
- **Low-coordinate shelf:** A broader coast and five companion islands offer room for future region/settlement demonstrations. Its narrow strip produces elongated forms; owner review should decide whether that shape fits the World. Generated 6 sources / 552 vertices; actual design coverage 14.48% of the chosen extent. [Context screenshot](../screenshots/worlds-geo-d3a/glass-sea/glass-low-y-shelf-context.png).
- **High-coordinate outlying island:** A modest first addition for owner review: one irregular island, clear of the existing originals, with a small connected-map footprint for later D4 development. Generated 1 sources / 72 vertices; actual design coverage 11.46% of the chosen extent. [Context screenshot](../screenshots/worlds-geo-d3a/glass-sea/glass-high-y-island-7-context.png).

All were previewed with creator controls and reproduced from the retained settings. Only the high-coordinate island was accepted and then manually reshaped in D2, inside an additional disposable database copy. The exact original generated version and full recipe stayed recoverable; every pre-existing Glass Sea row/head remained unchanged.

Before any persistent addition, the owner should approve the overall extent, density and shape, then separately propose names/lore. D3-B/later work will develop terrain/waterways; D4 connects regions, settlements, buildings, interiors and dungeons; D5 adds cartography/assets; E validates a coherent explorable fictional World alongside Earth accuracy. This proposal performs none of that later development.

The [completion evidence](worlds-geo-d3a-evidence.json) contains complete recipes, frozen inherited settings, output digests, timings and source counts. Requested coverage/size are tendencies, so use the measured preview rather than assuming an exact land percentage or geographic area.

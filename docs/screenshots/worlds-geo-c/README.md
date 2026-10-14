# Geo C1 application captures

These are actual screenshots of the isolated optimized production application, authenticated against the full DEV restore rehearsal and its checksum-frozen C1 import. The existing Earth World, map and coordinate-surface identities were preserved. The same native record plan is used for the authorized DEV import. No illustration, mockup, raster relief or external tile service is present.

The capture uses a 1,440-pixel desktop viewport, expanded vertically to contain the complete map panel below the fixed navigation. Shared site theme colors are retained. The original map title, **Natural Earth sample sources**, is unchanged even though its source inventory now covers the whole selected foundation.

| Capture | Context | Extent west, south, east, north | Projection / detail |
| --- | --- | --- | --- |
| [Global physical vectors](global-physical-vectors.png) | Owner's ordinary preview | `[-180, -90, 180, 90]` | Equirectangular / overview |
| [Himalayas, Ganges and cities](himalayas-ganges-cities.png) | Owner author mode; focused native Himalayas source | `[72.50074913828689, 23.838696600384694, 98.68372032969319, 36.93304474491593]` | Equirectangular / regional, selected automatically |

Visible controls enable physical land, rivers/channels, inland water, mountains/peaks, landscape regions, marine names, populated places, authored geography and bounded labels. Administrative interpretations are disabled for these physical comparisons. Source-protected disposable records do not appear in the global ordinary capture and lie outside the regional extent. Source names, original coordinates and raw classifications were verified against the pinned archives.

The global view includes Antarctica and both sides of the antimeridian, with major named water and mountain systems. The regional view includes the Himalayas, Karakoram, Tibetan plateau, Everest and K2, the Ganges/Brahmaputra system, real source lakes and cities such as Delhi, Lahore and Lhasa. Label rank/collision limits mean that every saved source does not receive a label simultaneously.

Source editions: physical land overview 110m **4.1.0** from preserved Geo B; C1 rivers, lakes, physical region/point/elevation labels **5.0.0**; marine regions **5.1.0**; populated places **5.1.2**. [The manifest](../../../data/geography/natural-earth-physical-sources.json) contains exact archive URLs and full SHA-256 values. [Coverage](../../reports/worlds-geo-c1-coverage.json) records the worldwide counts and the explicitly omitted fictional Null Island sentinel.

For independent comparison, use the pinned [Natural Earth physical sources](https://www.naturalearthdata.com/downloads/10m-physical-vectors/) and [populated places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) at these exact extents. Physical-region polygons are approximate naming extents, not surveyed mountain boundaries or a land-cover grid. Peak values remain original attributes; C2 numerical elevation/relief and C3 classified land cover remain outstanding. Equirectangular preserves the familiar longitude/latitude arrangement but distorts area toward the poles.

Separate native-touch emulation used 390 × 844 at 6× CPU throttling, verified panning, zoom, bounded labels and no horizontal overflow. These automated desktop/touch checks and the agent's visual inspection are technical evidence. Ember's independent technical review and the owner's visual acceptance remain pending.

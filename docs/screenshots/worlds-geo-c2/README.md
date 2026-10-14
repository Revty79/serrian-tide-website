# Geo C2 actual application captures

These are authenticated captures of the optimized production application against the owned full DEV restore rehearsal. The existing Earth World `981b883d-17a1-4603-b003-1053968e4f6c`, Atlas map `dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c` and surface `964f24cd-7a7b-45dd-9d0e-c37fce26149a` retain their original identities. The same checksum-frozen numerical bundle was subsequently imported into DEV. No illustration or external tile service is used.

| Capture | Context and extent | Projection and source resolution |
| --- | --- | --- |
| [Worldwide ETOPO relief](global-etopo-relief.png) | Owner's ordinary preview; `[-180,-90,180,90]`; all vector themes and bounded labels | Equirectangular, Automatic vectors; 20 by 20 source-cell box averages, approximately 20 arc-minutes |
| [Himalayas and Ganges relief](himalayas-etopo-relief.png) | Owner author view; `[72.50074913828689,23.838696600384694,98.68372032969319,36.93304474491593]`; rivers, inland water, peaks, cities, administrative accounts and labels | Equirectangular, Automatic regional vectors; 2 by 2 source-cell box averages, approximately 2 arc-minutes |

Both use ETOPO 2022 v1 60-arc-second **ice-surface** Float32 elevation and bathymetry, in metres relative to EGM2008 (EPSG:3855), with EPSG:4326 horizontal coordinates and cell-area registration. Heights are unchanged. The original native cells remain readable independently of the displayed averages. At finer extents the imagery reaches the original 60-second cells; this is not street-level terrain accuracy.

The elevation tint is numerical, not vegetation or land-cover classification. Negative values alone do not classify water. Shading uses northwest illumination with threefold visual slope exaggeration; neither lighting nor opacity changes native heights. Greenland and Antarctica show ice surfaces, not subglacial bedrock. The reference is undated shared modern geography and establishes no historical terrain reconstruction.

The captures use the saved shared site appearance and a 1,440-pixel desktop viewport expanded vertically to contain the complete map panel. A separate 390 by 844 native-touch emulation at 6x CPU throttling verified loading, zoom, pan and no horizontal overflow. This is browser emulation, not physical-device or human visual acceptance.

For independent inspection, compare the [official NOAA model](https://www.ncei.noaa.gov/products/etopo-global-relief-model), [user guide](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf), [pinned source and derived inventory](../../../data/geography/etopo-2022-surface.json) and [completion report](../../operations/worlds-geo-c2-completion.md). Source SHA-256: `9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e`. Ember's independent technical inspection and the owner's visual acceptance remain pending.

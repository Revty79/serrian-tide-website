# Geo C2 numerical elevation and terrain relief

Portable provisioning, canonical manifest reconstruction, complete integrity checks and paired database/private-volume recovery are now specified by the [C2/C3 deployment runbook](../operations/worlds-raster-deployment.md). Committed receipts do not contain the actual asset files. The C2 and C3 hosting costs must be accounted for together; C3's separate 256-MiB budget does not include C2 terrain assets.

The owner authorized implementation and the guarded DEV import after a verified backup and complete disposable rehearsal. The approved starting commit is `b5fe27842dcdb6cd9077fa74cc0797e91e9769c4`. Stop at a clean local review commit; no push, deployment, Production changes, shared service restart, C3 or Geo D.

## Preparation decision

The initial read-only check verified the existing Earth World/map/surface/timeline and Glass Sea, all 130 migration hashes through 0129, and all 12,468 C1 native records with exact source geometry/attributes. DEV measured 275,625,663 database bytes; geographic tables and places occupied 232,349,696 bytes. Existing checked-in data/public assets occupied 1,110,786 / 11,625,081 bytes respectively.

The official ETOPO 2022 v1 60-second ice-surface GeoTIFF is 465,969,062 bytes, internally tiled at 256 pixels, with a 21,600 by 10,800 Float32 grid, PixelIsArea registration and bounds [-180,-90,180,90]. Its metadata declares EPSG:4326, EGM2008 / EPSG:3855 and NoData -99999. Native TIFF blocks can be read independently without loading the full grid.

Retain that original compressed TIFF in durable private file storage, with checksummed metadata in PostgreSQL. Controlled CPU preprocessing derives numerical Float32 levels and 256-pixel relief imagery; styles and map preferences remain separate from numerical originals. Numerical levels use explicit box averages and propagate NoData. Native numerical lookup continues to read the original TIFF. The initial complete bundle must measure below 1 GiB before any persistent import.

Asset storage is content addressed, outside `public`, and must be backed up/restored alongside database metadata. Each delivery rechecks World, map, surface, selected timeline, ordinary/review context, current source head and retained-version protection. Browser responses use private no-store; application state belongs to the full viewing context. No persistent browser image cache contains source imagery.

Choose bounded regional source tiles independently of vector Detailed settings. Reproject their derived pixels in the browser through the existing projection, preserving the same coordinate reference, antimeridian rotation and Mercator limits. Raster failures retain the vector map and valid current raster tiles, with an explicit retry. Derive and measure native, regional, global and fictional surface cases before release.

This document records the preparation strategy; executed budgets, integrity, rehearsals, screenshots and release/recovery evidence belong in the completion report.

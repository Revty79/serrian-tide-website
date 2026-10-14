# Geo B application screenshots

These are captures of the running optimized Serrian Tide application, with authenticated ordinary-knowledge viewing. They are real application output, not illustrations. The data came from the verified full DEV restore and the frozen worldwide import rehearsal; the identical pinned plan is applied to the existing DEV Earth before completion. Disposable protection fixtures are excluded from these ordinary views.

World: `981b883d-17a1-4603-b003-1053968e4f6c`. Map: `dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c`. Surface: `964f24cd-7a7b-45dd-9d0e-c37fce26149a`. The original map name, “Natural Earth sample sources,” is preserved. The captures crop the complete geographic map section from the stated browser viewport.

| Capture | Browser viewport | Projection | Longitude/latitude extent | Detail |
| --- | --- | --- | --- | --- |
| [Global modern Earth](global-modern-earth.png) | 1440 × 1582 CSS pixels | Equirectangular | `[-180, -90, 180, 90]` | Automatic overview |
| [Pacific / Fiji](pacific-fiji.png) | 1440 × 1474 CSS pixels | Equirectangular | `[176.8467940163573, -18.726235983642702, -179.35507412540596, -15.58263627309852]` | Automatic detail |

The global view uses physical land 110m edition 4.1.0; countries 110m edition 5.1.1, with 50m/10m edition 5.1.1 fallbacks for identities absent at coarser scales; and disputed-area overlays 10m edition 5.1.1. The Fiji view uses physical land 10m edition 5.1.1, countries 10m edition 5.1.1 and eligible detailed land-boundary/disputed overlays (boundary lines 5.1.0, disputed areas 5.1.1). Exact download URLs, bytes and SHA-256 values are pinned in [the source manifest](../../../data/geography/natural-earth-world-sources.json).

Filled land and administrative outlines are independent. Dashed warning-colored outlines describe disputed or uncertain source classifications. The provider’s de facto interpretations do not establish undisputed sovereignty. The original three Geo A overview sources retain their original display metadata and theme-based outline styling.

Visual checks compared the global output with an independent direct-coordinate rendering of the original source polygons at the same extent, and inspected detailed Fiji across the antimeridian. Both show correct longitude/latitude orientation, recognizable major continents, Greenland, Antarctica and islands. Source inventory checks separately prove component and coordinate preservation. The boundary adapter removes paired wrapping cuts through Taveuni; small unmatched seam tails reflect the source’s unequal endpoints.

Natural Earth is generalized cartography, not a survey or a complete inventory of every islet. Global equirectangular viewing distorts polar areas; Mercator clips above its supported latitude. Source editions and physical/admin resolutions differ. This evidence supports technical review; Ember’s independent assessment and the owner’s visual acceptance remain pending.

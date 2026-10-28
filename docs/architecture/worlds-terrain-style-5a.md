# Stage 3 Pass 5A: terrain art and creator styles

Authorized from `bc4806d284f7bf94881f9c191640f2d80adb3cf9`. Work stays on main; the completed pass may be committed and pushed. No deployment, shared database access or migration, server restart, or Pass 5B is authorized.

The five existing appearances use one numerical geography. Classic, Physical and Topographic retain their default rendering. Realistic and Illustrated receive a new, versioned presentation treatment. Terrain generation, climate interpretation, water geometry, protection and history services remain authoritative and are not rewritten.

An optional `art` object extends the existing version 1/2 appearance JSON. Old documents decode without injected properties. Its version identifies the presentation algorithm. Bounded parameters operate during existing cached artwork preparation, not a full canvas filter per frame. Style signatures invalidate stale worker replies and cache entries. Existing physical coordinates, wrap periods, tile halos, cache limits and fallback work budgets remain in force.

The style workshop keeps a candidate separate from the current browser appearance: preview, accept or cancel; accepted local choices still require the existing explicit map appearance save. Cancel restores the original browser appearance. Defaults are an explicit candidate. Read-only review cannot publish styles.

Named styles are immutable snapshots in one additive table, independent of numerical terrain. Each records format version, creator, World, source map, observed map appearance revision, capture time and exact appearance JSON. Saving the same request is idempotent; a new variant receives a new identity. They are available across compatible terrain maps in that World. Loading one prepares a candidate and never writes the destination map. Accepted map appearances embed their choices, so they remain usable independently of the preset library. This is a small style snapshot facility, not a general asset library. No migration rewrites or legacy conversion are needed.

Validation compares production renderer output against the retained Pass 4 captures and uses newly owned loopback PostgreSQL and application processes only. GPU-disabled installed Chrome, source preservation, disposable upgrade/recovery, authorization, static checks and full regressions are required. Artistic acceptance remains the owner's decision.

## Controls

| Setting | Range / default | Presentation effect |
| --- | --- | --- |
| Palette | Natural (default), Verdant, Warm ochre, Muted atlas | Coordinated geographic colors |
| Land / water color | Six-digit sRGB; `#b6ad85` / `#286779` | Target colors for explicit tint |
| Tint | 0–1 / 0 | Blend material colors toward chosen colors |
| Saturation | 0–2 / 1 | Environmental and surface chroma |
| Brightness | 0.6–1.4 / 1 | Output lightness |
| Contrast | 0.5–1.5 / 1 | Output tonal separation |
| Shading | 0–2 / 1 | Artistic emphasis of saved physical gradients |
| Texture | 0–2 / 1 | Surface grain and texture normals |
| Detail density | 0.25–2 / 1 | Physical frequency of decorative surface/canopy texture |
| Vegetation | 0–2 / 1 | Supplementary forest/canopy artwork |
| Biome blending | 0–1 / 0.8 | Interpolate local category colors with the existing smoothed artistic palette |
| Illustration ink | 0–2 / 1 | Terrain-following pen strokes and open-country stipple |
| Scale emphasis | 0.5–2 / 1 | Favor broad or fine visual detail, subject to footprint filtering |

All five styles expose palette, tint and tone. Detailed surface/environment controls belong to Realistic and Illustrated; ink belongs to Illustrated. Existing contour interval, coastline, paper, bathymetry and lighting presets remain available. Diagnostic climate/category overlays retain their scientific colors. Styling never changes those categories or manual protection masks.

## Persistence and recovery

Migration `0143_world_map_style.sql` adds one table, source-map and author foreign keys, an index, validation and an immutable-snapshot trigger. The owner reported applying it during implementation; its bytes are frozen in the evidence index. No further edit to that migration is permitted. The application still previews and saves map appearances without the named-style table; library reads report unavailable and named saves explain the required migration.

Named captures contain the exact candidate, which can include unsaved adjustments, plus the source map's observed accepted appearance revision. They do not claim that the captured candidate was previously saved. New variants receive new UUID identities; version 1 describes the snapshot format. `art.version = 1` identifies the rendering parameters. A stored map embeds its entire appearance and does not dereference a mutable preset on reopen.

The workshop's preview bypasses local appearance storage. Accept writes the browser preference through the existing hook. Explicit map saves retain the original request through the existing retry/recovery mechanism. Named-save retries retain their original snapshot in browser storage, including after a lost response or reload. Existing appearances preserve optional-field shape, authorization, revision conflicts and original request behavior. There is no new geographic save, import or conversion.

Recovery uses a complete database backup and the previous compatible code. Older binaries do not understand the optional `art` fields or named-style route: rolling back code alone is not a database downgrade or a promise that older validators can read newly styled appearances. Retain the new table and captured JSON; use a forward correction rather than stripping fields or deleting snapshots. Verify the deployed migration ledger and backup independently before any future owner-authorized deployment.

# Stage 3 Pass 4 - climate, biomes and vegetation

Owner-authorized unattended implementation and normal origin/main publication starts from `9fe55788c16a80c72ff9f2e159fc2d6e17527d87`. Stop after this pass. No shared DEV/Production access, migrations, deployment, owner-server restart, historical SQL rewriting, Stage 3 Pass 5, climate-driven drainage replacement or new gameplay integration.

## Audit and model

Existing numerical terrain, sparse refinements, material strokes, appearance and v1/v2/v3 hydrology remain independent authorities. Older generation descriptions mentioning forests/deserts do not constitute accepted climate. They must not silently alter numerical generation history. The preserved 3C production baseline was rerun before changes in `docs/screenshots/worlds-atlas-s34/before-3c`, including matched terrain/water views and CPU samples.

Introduce an independently versioned environment document: calibrated, explicitly simplified climate settings; accepted bounded global/local derived fields; sparse biome/vegetation brush/polygon overrides with stable IDs and protection; visibility choices and exact provenance. Global fields supply camera-independent thermal/moisture context. Local analysis downscales that accepted context with pinned numerical refinements, not an isolated viewport climate. Saved fields remain authoritative after terrain changes; offer explicit review instead of automatic regeneration. Proposals are temporary until accepted and explicitly saved.

The climate model uses configurable thermal bands, uniform/gradient/exotic alternatives, explicit seed/version, altitude cooling, physical distance to major water, continental influence and windward/leeward mountain tendencies. Physical influence distance is creator-configurable rather than inferred from Earth's circumference. Temperatures are simplified calibrated estimates, moisture is dimensionless and seasonal contrast is provisional; no measured precipitation, weather, groundwater or discharge is asserted. Accepted standing water and confirmed creator wetlands inform interpretation without converting potential water into certified permanence.

A bounded global grid and selected local fields store quantized deterministic recommendations, not raster artwork or individual tree objects. Sparse overrides independently replace biome or vegetation interpretation. Regeneration preserves authored/protected geometry; removing an override deliberately restores the accepted automatic field. Original source pins/algorithm/settings stay retained in immutable versions. New proposals must reference current map-owned sources; exact old history remains restorable.

## Composition and authoring

Retain the original terrain/imagery/cartography renderers. Add a cached environmental artwork layer using their World-coordinate sampling/Canvas2D preparation patterns, bounded background work and main-thread fallback. Geography, environmental identity and illustrative canopy detail stay distinct. Stable procedural coverage provides clustered canopy, conifers/broadleaf distinctions, grass/scrub/bare ground and scale-dependent art; no per-frame randomness or individually measured trees. Broad classification transitions interpolate rather than follow arbitrary render tiles.

Precedence is explicit: numerical land/sea plus accepted standing-water masks; protected environmental overrides; accepted automatic environment; manual material authority; final style composition and existing water artwork. Environmental tint/canopy is attenuated by manual material coverage, so a fully authored material is never buried. Hiding environment reproduces the original terrain artwork. Environment never edits heights, water geometry or material strokes.

The map-first inspector gains one Climate & Biomes section, basic presets and broad controls, advanced assumptions collapsed, preview/cancel/accept with selected-region regeneration, physical brush/polygon editing, inspection, undo/redo and independent saves/history/recovery. Reuse shared semantic controls and field guidance. Map palette colors remain geographic artwork, separate from interface theme colors.

## Persistence and validation

The repository ledger has 142 entries through immutable 0141. New additive 0142 reserves independent environment head/version tables with map/World ownership, immutable history, exact retries, optimistic conflicts and lifecycle authorship dependencies. Missing migration must disable only environment saving, with a clear prerequisite. Do not inspect shared ledgers. Validate fresh replay, populated 0141 upgrade, repeats and complete backup restoration in owned targets.

Use deterministic thermal/coast/ridge/rain-shadow/alpine/exotic fixtures, wrapped and million-km Worlds, local/adjacent/nested sources, manual protection and material/water masking. Exercise actual production browser workflows, native touch/pen, all five styles, recovery/conflict/history, CPU/caches and unchanged prior data. Inspect completed captures, using multiple consecutive ready frames; preserve failed iterations. Re-run inherited terrain/material/hydrology/Worlds/gameplay regressions. Numerical correctness, technical delivery and owner artistic acceptance remain separate.

Code rollback cannot erase accepted environment/history. Older code ignores the additive tables; retain them and correct forward. Any future target deployment requires independent target/ledger verification, database plus private numerical-storage backups, ordered missing migrations, and separate authorization. Owner artistic quality remains unaccepted. No later pass starts automatically.

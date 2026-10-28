# Stage 3 Pass 5A: terrain art and creator styles

Authorized from `bc4806d284f7bf94881f9c191640f2d80adb3cf9`. Work stays on main; the completed pass may be committed and pushed. No deployment, shared database access or migration, server restart, or Pass 5B is authorized.

The five existing appearances use one numerical geography. Classic, Physical and Topographic retain their default rendering. Realistic and Illustrated receive a new, versioned presentation treatment. Terrain generation, climate interpretation, water geometry, protection and history services remain authoritative and are not rewritten.

An optional `art` object extends the existing version 1/2 appearance JSON. Old documents decode without injected properties. Its version identifies the presentation algorithm. Bounded parameters operate during existing cached artwork preparation, not a full canvas filter per frame. Style signatures invalidate stale worker replies and cache entries. Existing physical coordinates, wrap periods, tile halos, cache limits and fallback work budgets remain in force.

The style workshop keeps a candidate separate from the current browser appearance: preview, accept or cancel; accepted local choices still require the existing explicit map appearance save. Cancel restores the original browser appearance. Defaults are an explicit candidate. Read-only review cannot publish styles.

Named styles are immutable snapshots in one additive table, independent of numerical terrain. Each records format version, creator, World, source map, observed map appearance revision, capture time and exact appearance JSON. Saving the same request is idempotent; a new variant receives a new identity. They are available across compatible terrain maps in that World. Loading one prepares a candidate and never writes the destination map. Accepted map appearances embed their choices, so they remain usable independently of the preset library. This is a small style snapshot facility, not a general asset library. No migration rewrites or legacy conversion are needed.

Validation compares production renderer output against the retained Pass 4 captures and uses newly owned loopback PostgreSQL and application processes only. GPU-disabled installed Chrome, source preservation, disposable upgrade/recovery, authorization, static checks and full regressions are required. Artistic acceptance remains the owner's decision.

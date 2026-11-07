# Atlas map-consumption contract, schema 1

Stage 7C establishes an **internal, read-only saved-source contract**. It creates no Tabletop application, publishing service, public endpoint, asset download, or consumer-facing control. Atlas remains inside Worlds and is the only map-authoring environment. The producer never captures a baseline, advances a head, writes an audit or session, or creates a version. Existing authorized Atlas authoring may deliberately retain an appearance first.

The schema, TypeScript types and physical validation are in `src/features/worlds/atlas-map-consumption.ts`. The server-only entry points in `atlas-map-consumption-service.ts` are:

```ts
readAtlasMapContract(authenticatedUserId, worldId, {
  target, timelineId, year, stateId, versionId,
});
readAtlasMapResource(authenticatedUserId, manifest.pin, resourceKey);
readAtlasMapTiles(authenticatedUserId, manifest.pin, resourceKey, tileIndexes);
validateAtlasMapManifest(candidate);
validateAtlasMapResource(manifest, resourceKey, candidate);
```

The host must provide its existing authenticated World request context and session. The supplied user ID must equal that actor. Never construct that context from a consumer-supplied actor/session ID. These functions are internal server functions, not an alternative authentication mechanism. There is no write or Publish entry point.

## Versions and pinning

The envelope has `schema: "serrian-atlas-map"`, `schemaVersion: 1`, `projectionVersion: 1`, `stage: "accepted-saved"`, `publication: "not-published"` and `readOnly: true`. Unsupported versions, extra fields and malformed native structures are rejected. Future incompatible geometry or projection semantics require an explicit new version and version dispatch; they must not silently reinterpret schema 1. Only version 1 is implemented now.

`source` identifies the exact World, native target kind/ID, selected timeline, requested canonical year, state and immutable version. There is no `latest` alias. `sourceRevision` is the primary native component's accepted revision, not a mutable head counter. `history.originTimelineId` retains the immutable version's original timeline independently of the selected/adopting timeline. Period endpoints are inclusive. Year zero and negative years use the existing canonical year schema, without calendar conversion or a new epoch.

An explicitly selected retained source outside its period remains a reference with `coverage: "unknown"`; its geometry does not establish presence at the requested year. Archived appearances also establish no active coverage. Missing states, unadopted branches, missing source versions and protected sources fail; current geometry is never substituted. Inherited branch content requires the existing explicit adoption mechanism.

The pin repeats the exact source tuple and schema/projection versions and contains a SHA-256 over canonical JSON of the manifest without its `pin` field. Canonicalization sorts object keys recursively and retains array order, using the existing native canonical JSON/hash implementation. Each resource descriptor additionally identifies its retained source component and source checksum, projected resource checksum and UTF-8 JSON byte length. Derived family/connection resources can combine immutable components of the selected version; the descriptor names an anchor component, not a public fetch-by-component capability. The projected checksum covers the complete derived resource. Both manifest and resource verification helpers must pass before interpreting received data. A checksum proves integrity and binding; it is neither a signature, permission nor publication approval.

`AtlasMapStateBoundary` explicitly distinguishes an unsubmitted working state, accepted saved source and future published-consumer reference. The future type names a separate publication/approval identity, but no such record, minting operation, storage, approval authority or delivery mechanism exists in this stage. In particular, Administrator review does not approve publication. An ordinary saved pin cannot be relabelled as published: the implemented schema rejects that value.

Later saves append normal Atlas revisions. They cannot replace the pin's `versionId`. To select a newer representation, a future consumer must deliberately choose another authorized source and receive another pin. Changed permissions, withdrawal, missing assets or altered ordinary source availability may withhold an existing pin or make its ordinary projection incompatible; the producer never replaces it with a newer head. A consumer must not treat a retained hash as a permanent entitlement or retry by silently selecting latest.

## Native family data and resource handling

The manifest is a bounded index, not a flattened picture or a duplicate map database. Its `geometry` resource uses a discriminated family structure:

- World/Regional: exact accepted terrain ID/revision, physical settings, base elevation, sea level and sparse verified tile descriptors. A Region additionally retains its authored footprint, extent and parent World identity; it shares numerical authority with that World.
- Town: independent local-metre extent and the original typed Town design, including roads, districts, buildings, walls, waterways and authored labels. Saved Place and Shop-location IDs remain in their actual eligible features.
- Floor: building identity, local extent, independent floor order/elevation and typed room, wall, opening, furniture and transition geometry.
- Underground: site identity, local extent, order, original depth text and typed dungeon/cave/sewer structures and ordinary attributes. Textual depth is never converted into an invented numeric elevation.
- Craft: classification, local extent, included outline and typed exterior plan. A hidden outline does not leave a dangling outline ID.
- Deck: original craft identity, its independent extent, order/nullable height, outline and plan. A common craft identity does not prove a horizontal transform or dated placement.

Further typed resources retain materials, hydrology/coastlines, environment/climate fields, installed artwork, labels, authored appearance, composition, volcanic landform operations, numerical refinement/source packs and actual dated Town/craft positions. An absent authored appearance is represented by `null`; an application default is not invented as an authored choice. Label source display/reference payloads are removed after permission/privacy checks; authored eligible wording and physical label geometry remain. Selected primary record references are identity-only summaries. Feature and position resources retain their own exact native record IDs; the summaries do not duplicate every marker or imply dated narrative facts.

Original strict native feature/geometry schemas and validation remain in use. Hidden/archived/absent features, orphaned openings/walls and unresolved direct destinations are excluded from the projected copy; the stored source is never changed. Connections are represented separately only after resolving actual retained sources. Authoring lock/protection flags on physical layers are not gameplay rules. No movement cost, collision rule, door state, trap activation, faction visibility or combat behavior is derived from them.

The manifest permits at most 512 resources and 256 KiB of UTF-8 JSON. A resource is bounded by the existing 12 MiB native component limit. Terrain references retain coordinates, LOD, SHA-256, `i16le-v1` encoding and 2,048-byte object length; no private filesystem path or editing protection bitmap is exposed. A tile contains 32 by 32 signed 16-bit elevation samples in metres. Callers select at most 32 distinct tile indexes within a resource, never arbitrary file paths, checksums or URLs. The existing private tile reader verifies length, encoding and actual bytes against the checksum. Missing/corrupt objects fail with a source-recovery error, without exposing a path or substituting terrain.

Root tiles are sparse: unspecified root samples use the accepted base elevation. A missing required refinement object is not a zero-elevation tile. Refinement/source packs retain exact source and parent IDs/revisions, physical frames, grid dimensions and LODs; boundary interpolation must follow those pinned parents with the existing `samplePinnedTerrainPoint` convention. The producer exposes references rather than materializing a million elevations into the manifest or running browser terrain processing. No new numerical engine, renderer, cache allowance or performance limit is introduced.

## Physical coordinates

All physical distances, x/y coordinates, widths, heights and numeric elevations are metres; native sizes expressed in kilometres are converted by the existing terrain geometry function. X increases right, Y increases down. No pixel position, screen DPI, printable scale or Tabletop grid replaces physical authority. Original grid/snap and label presentation values remain authored presentation metadata and confer no gameplay mechanics.

World and Regional resources use `coordinates.system: "world-metres"`. A Region's boundary remains in its parent World's coordinates. Its parent mapping is **identity**, not another translation by the extent origin. Wrapping is the saved World's X wrapping; Y is not wrapped. Root sample `(column,row)` lies at `(column/gridWidth*widthMetres,row/gridHeight*heightMetres)`, matching the existing bilinear sampler, not an invented half-cell offset.

Town/floor/underground/craft/deck geometry uses independent local metres. Where an actual authorized retained parent source exists, `coordinates.parent` includes its native target/version and exact frame. `centre-rotation` uses the native formula for clockwise degrees in the right/down coordinate system:

```text
dx = x - width/2; dy = y - height/2; r = rotation * pi/180
parentX = frame.x + width/2 + dx*cos(r) - dy*sin(r)
parentY = frame.y + height/2 + dx*sin(r) + dy*cos(r)
```

Apply saved World X wrapping after this transform when applicable. `consumptionToParent` implements that formula and is checked against native Town transforms. Compose only recorded, authorized parent transforms. `null` means the exact authorized parent binding is unavailable, not an origin at zero. Some older retained floor/craft/deck captures have no explicit parent appearance dependency: their local geometry and permanent building/craft identities are supported, but a historical parent transform/placement is unknown. The adapter deliberately does not reconstruct it from a current binding, nearby coordinate, name or another map choice. Unconnected underground levels likewise have no invented surface position.

## Connections and World references

The manifest indexes the complete connection resource by count and resource key; it never embeds or truncates a dense connection graph. The independently verified typed resource uses the same 12 MiB bound as other resources. Its target must match the manifest, every edge must attach to that target and saved connection IDs must be distinct. Each connection identifies the original saved connection/transition ID, whether it is explicitly two-way, both actual native targets and immutable versions, any separate retained parent-geography version, actual entrance IDs where known and exact saved arrival points. Underground/craft strict accounts use their retained endpoint pins and existing date/condition/source guards. Floor transitions are directed unless their own saved relationship establishes otherwise; a similarly named stair does not establish a reciprocal route. Both ends independently pass ordinary geographic and family-scope checks. Unavailable links are omitted without returning confidential endpoint names or reasons. A connection cannot grant permission or establish unknown historical coverage.

World record IDs are links, not authority to read those records. They remain in their original World and independent variation. Use the existing Worlds services to resolve them with current permissions and exact historical context. A map label or identity-only summary does not manufacture a versioned lore association. Missing old parent/source associations remain an explicit omission, rather than a new universal registry.

Personal variation provenance identifies the original World and Primary timeline, the original native map target from the accepted identity map, and the original copied version where an exact mapping exists. Later independently authored versions may have `sourceVersionId: null`; their source map provenance remains, without inventing a historical source version. Original and personal World/map/version IDs stay distinct. Provenance never authorizes access to the source World after withdrawal.

## Permission and image boundary

Every manifest, resource and tile call requires the current authenticated actor/session and the existing History, Appearances and requested native-family scopes. The producer uses repeatable-read **read-only** transactions, narrows the same actor to ordinary content without adding a scope, and revalidates the original live permission/session after slow work. Viewer, Editor, owner, ordinary Canon Player, personal-variation owner and explicit Administrator review remain distinct authorization cases. All produced representations remain read-only and unapproved for publication.

Protected appearance versions are unavailable even in this ordinary consumer projection of an owner's or Administrator's review. The adapter uses the existing ordinary World-record projection and protected geographic map/place rules, also at both connection ends. Underground secrets, confidential attribute/craft notes, unavailable map/World references, hidden geometry and unrelated private source data do not enter the representation. Missing scopes remove related destinations and assets, not the guards.

Composition requires the existing Assets scope. Installed artwork retains its installed version. Uploaded artwork may retain only its exact authorized version reference/placement through the existing ordinary native asset-pin rules. It exposes no private bytes, original upload, object path, download URL or reusable bearer capability. `private-assets` records that private image delivery is outside this representation, including omitted unauthorized references. The omission marker does not reveal whether the cause was an unavailable scope, a filtered placement or reference-only delivery. A future authenticated asset consumer must recheck the selected World and exact version through the established private artwork boundary; publication/redistribution rights are not inferred. This stage adds no asset-byte reader. Unused private library assets and protected-only pins remain unavailable.

## Deferred to the future Tabletop

The future rebuild must separately define publication eligibility, explicit approval, immutable published consumer identity/lifetime, appropriate asset rights and delivery, authentication and revocation behavior, campaign/session selection and deliberate upgrades. It must keep gameplay/session changes apart from original Atlas geography. Tokens, character movement, combat/initiative, fog of war, exploration memory, door state, effects, secrets and campaign-specific outcomes remain outside this contract. There is no Planning/Active/Player interface, publishing destination, Stage8 export/printing, Earth or Studio work in Stage 7C.

See the [capability matrix](../operations/worlds-atlas-map-consumption-s7c-matrix.md) and [delivery report](../operations/worlds-atlas-map-consumption-s7c-delivery.md) for actual validation, exact sources, retained failures and review limits.

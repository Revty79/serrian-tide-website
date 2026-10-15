# Geo D2-A: direct visual geographic authoring

Authorized from technically approved `19c22170288e1a7f533df57584db09c3acd9e6bf`. Reuse the unified Atlas canvas, geographic frame/projectors, original-source reader, immutable versions and spatial display parts. Stop at a clean local review commit. No Production/live database access, shared-service activation, Docker/private asset deployment, push or later phase is authorized.

## Scope and coordinates

Explicit geographic mode creates simple landmass/island polygons and open geographic river lines, selects existing eligible sources, drags/adds/removes vertices, previews changes and supports separate undo/redo. Input inverts the existing display projection into full-precision authoritative source coordinates. Pan, zoom and projection are ephemeral view operations. Source geometry and decorative artwork use separate drafts and saves. Failed and conflicting source writes retain the draft; compare, reload, deliberate rebase and draft download provide recovery.

The core editor supports at most 256 original vertices, one closed polygon ring or one open line. It validates source bounds, closure, winding, duplicate vertices and intersections on client and server. Multipart, holes, points, polar geometry beyond 85 degrees and longitude spans of 180 degrees or more are explicitly read-only. Unsupported geometry is never reduced to an editable subset. No exotic topology is claimed.

Empty generic maps can explicitly associate an existing surface or create an authored plane/sphere using existing surface/view tables. A plane declares its own bounds/units; a fictional sphere uses the authoritative angular reference. Realm and ordinary privacy remain enforced. No geographic mode is available for dated appearances, read-only/ordinary/Admin review, political overlays or dedicated local-map editors.

## Persistence and provenance

The existing dataset JSON column accepts a creator-authored provenance variant with creator, title, creation account, coordinate reference and display recipe. It contains no fabricated provider, download URL, external license or file checksum. The existing content SHA-256 identifies the creation receipt. Legacy import provenance and import schemas remain unchanged. Both provenance variants are rendered honestly in source readers and geographic credits.

The owner-only, same-origin private authoring endpoint uses existing World transactions, timeline/layer/Realm checks and the same source/version/part writer. New features receive server-generated stable place, feature, dataset and original version identities. Idempotent request IDs are retained across failed retries. Revisions validate the expected head, retain semantic/place/source identity, imported provenance/properties/protection and the previous immutable version, then generate bounded derived parts. Imported source revision needs an explicit acknowledgement. No schema migration is required; applied migrations through 0131 remain immutable.

## Compatibility and acceptance

The navigation guard covers geographic, artwork and raster drafts. Each save names its own scope and leaves other drafts intact. Unsaved geographic drafts must be saved/discarded before a complete visible PNG, while authored-only PNG remains separate. Successful source saves refresh the existing geographic view without rewriting artwork or raster registrations. Historical artwork, timelines/pins, territories/connections, original sources and linked local maps remain authoritative.

Acceptance must exercise the production build with actual planar/spherical creation, revision/original reading, line operations, invalid geometry, failures, interruption, two tabs, privacy, historical/local compatibility, both exports and desktop/keyboard/native touch. Use the owned isolated environment, protect original source/table/asset identities and report measured requests/storage and exact validation status. Deployment requires separate approval and the existing deployment/raster recovery procedures. Application rollback retains all new immutable JSON source records; legacy readers that only understand imported provenance require the compatible reader changes to remain available when creator-authored records exist.

# Geo D2-B: multipart geography and interior boundaries

Authorized from independently technically approved D2-A `fab810a295b342d5a11239aad21080c38630d2be`. Extend the existing geographic draft, coordinate adapter, renderer, source/version/part writer and private authoring endpoint. No database migration, parallel map engine or conversion to decorative artwork is required.

## Complete feature drafts

A draft retains Polygon or MultiPolygon structure, every component and every exterior/interior ring. Selection lives outside geometry and does not mark a draft dirty. The full feature is previewed, while only the selected ring has editable vertex handles. New disconnected islands promote Polygon to MultiPolygon within the same source/place identity. Removing a component retains MultiPolygon structure even if only one component remains. A component's removal explicitly includes its holes; removing a hole keeps its exterior and other rings. Undo/redo retains all parts, including incomplete outlines.

Successful saves keep the selected component/ring. While drawing, taps add vertices even close to previous handles; completion switches to vertex dragging. A preview-only artwork checkbox can hide retained decorative paint that would otherwise cover a source opening. It defaults to showing artwork, does not mark any draft dirty and is not saved. Visible PNG follows the current preview; authored-only PNG keeps the artwork. Changing this view choice during export cancels the captured composition through the existing context guard.

New or changed rings are closed with opposite exterior/hole winding. Unchanged rings keep their exact coordinates and order, including retained imported orientation. Server canonicalization uses the immutable previous source for retries and changes only deliberately edited/new rings. Source creation retains honest creator provenance; imported revisions retain original provenance, licenses, properties and privacy and require deliberate acknowledgement.

## Bounded topology

The editor supports at most 256 total original vertices, eight components, 24 total rings and eight holes per component. No source is simplified to fit these limits. Unsupported sources remain intact and visibly read-only. Points and multipart lines remain outside this increment; D2-A open rivers continue to use their existing single-line workflow.

Planar validation reuses existing source topology plus strict boundary checks: holes must stay wholly inside their component and separate from other holes; component filled areas must not overlap; rings cannot cross, touch or retrace. Distinct exterior components may meet at isolated points when their filled interiors remain disjoint; shared edges and crossings through vertices are rejected. An island entirely within another component's hole may remain a separate valid component.

D2-A single-ring spherical limits remain in place. Complex spherical sources are limited to local geometry with original vertices within 75 degrees south/north and longitude span below 120 degrees. Great-circle edges are checked together in a common gnomonic plane using the existing polygon validator, as well as original-coordinate validation. Polar, antimeridian and wider unsupported originals stay read-only without dropping components.

## Saves, recovery and compatibility

Geographic, decorative artwork and raster preference saves remain separate. Combined navigation/discard protection, failed-save retention, stable retry IDs, optimistic heads, latest-source comparison and original-version reads remain in the existing editor. Conflict recovery compares complete features; deliberate replacement explicitly identifies component/ring counts. Geometry edits never create historical evidence or rewrite dated appearances. Ordinary/Admin review and owner/Realm filtering remain authoritative.

Source saves refresh existing geographic representations, previews and PNG export. No new worldwide query, private raster asset or schema migration is introduced. Rollback must retain D2-A creator-provenance readers. D2-A readers will show newly multipart sources as read-only; their version data stays valid. Never flatten or delete saved multipart geometry to roll application code back.

## Glass Sea and later phases

Use an additional owned disposable database copy of the existing canonical Glass Sea, retaining the same World/source/map/surface identities and all original versions. Verify visual exterior/hole editing for Glass Island and individual Copper Isles, immutable new revisions and recoverable originals, retained Atlas artwork and an unchanged Glass Channel/surface relationship. The main owned clone and persistent DEV/Production remain unchanged. Record actual screenshots, functional findings, payload/topology timing and storage effects.

The [owner's continuing Glass Sea commitment](worlds-map-maker-decisions.md#glass-sea-completion-across-geo-de) schedules substantial geography in D3, connected places/maps in D4, artistic presentation in D5 and coherent fictional acceptance alongside Earth in E. New geography, settlements and lore need owner proposals/approval before becoming established content. This pass implements none of those later phases and does not begin the postponed interface, navigation or language overhaul.

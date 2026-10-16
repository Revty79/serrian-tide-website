# UX-0A palette and persistent city checkpoint

The complete pass remains in progress. The [third focused art study](../screenshots/worlds-geo-ux0a/art-direction/revision-3/README.md) at `f71c170` awaits Ember?s independent decision; no new art revision is promoted and the complete library is not expanded.

## Delivered behavior

Generic Map Studio now has a thumbnail palette with name/tag search, family filtering, individual placement and paint actions for suitable illustrations. Original SVG thumbnails load lazily through the local versioned public paths. The current runtime subset remains the same three revision-1 subjects; this is engine/UI proof independent of the art gate.

Palette placement retains exact asset references. The selected symbol has an actual-size cursor preview, scale and rotation controls. Natural v2 placed artwork uses the terrain layer and shared land clipping. V1 symbol behavior remains retained. Paint strokes retain exact ordered asset sets, points and deterministic seed; the inspector can revise compatible illustrations, seed, size, spacing and density without creating individual mark rows. Stroke move/point editing, order, archival and undo use the existing editor.

Place city stages a persistent settlement location and optional linked label as one validated undoable artwork action. The creator can explicitly reuse an active existing location. Reuse retains identity and avoids adding a second active label for the same place on that map. A default label follows a place rename; intentionally customized wording is preserved. City placement outside saved known land (including unknown/loading land) requires a native confirmation before any place/drawing is staged; cancellation creates nothing. Markers remain visible outside land. New default labels receive an inset near the canvas edge. Detailed settlement maps and gameplay towns are not created.

New empty island-style maps do not paint terrain over an unknown all-water canvas before land exists. Existing artwork-only v1 clipping remains unchanged. Geographic/migration/ordinary/Admin authorizations stay on the existing services. No schema migration or new persistent table is added by this increment.

## Verification

- All **2,224** feature tests pass, no failures/skips. Six new focused placement tests cover atomic city/label identity, edge inset, reuse/no duplicate label, default/custom rename, failure/history behavior and v1/v2 natural-art layer separation.
- TypeScript, focused changed-file lint and isolated Node 22.23.3 production build pass. The previous full lint has only the pre-existing stories-harness unused import warning; new files have zero lint warnings.
- Actual production website: thumbnail/tag search, paint/seed edit, city preview, atomic undo/redo, save, rename, outside-land cancellation/confirmation, close/reload/reopen. Database read-back verifies exact v2 references and stable place/drawing/label identities.
- Actual visible PNG, native-touch 390px palette/filter/settings retention and explicit read-only Admin review pass, with no page errors. [Indexed screenshots/PNG and sanitized records](../screenshots/worlds-geo-ux0a/palette/README.md) were inspected by Cody. No physical-device claim.
- Edge-label clipping was found and corrected, including normal UI correction of the earlier saved test label. A harness follow-up initially queried a nonexistent drawing timestamp; it now uses the existing sort order. No product/data workaround bypassed website saves.

## Remaining gates and representation question

The full approved UX-0A journey, 12?16 approved illustrations, independent save/recovery UI, integrated learning, fault/performance/storage checks and joint final readiness remain incomplete. No owner testing is requested.

Before adding the eventual hill/wetland placements, Cody [asked Ember to review a concrete compatibility question](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6208217691): v2 placed symbols and immutable 0132 retain the legacy base kind enum. Exact-reference rendering is independent of that field, but new literal terrain-symbol kinds are absent. A documented catalog compatibility slot is being evaluated; no misleading product name, weakened v1 validator, rewritten 0132 or unapproved extra migration has been adopted. Painting those terrain families is already structurally supported. Current three-subject functionality is complete within this checkpoint; the full collection stays gated.

No main merge, deployment, shared DEV/Production contact/write, retained backup/private-asset change, deleted-Earth restore, shared restart, Docker or later Geo scope is part of this work.

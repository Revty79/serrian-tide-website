# UX-0A source-backed composition checkpoint

Implementation continues on the owner's authorized `codex/atlas-ux0a` draft PR #5. The full pass remains incomplete; no owner testing or deployment readiness is claimed. Ember reviewed the three-subject art checkpoint `e7c68f8` and requested further corrections before expansion. The next small-subset revision needs its own explicit approval.

## Delivered

`AtlasMapScene` now composes editor, explorer, geographic thumbnails and visible export from the same currently authorized geographic view. Exact projected source paths provide visible land and the transient even-odd land mask. Independent white fills union separate sources, retain holes and allow an island from another source inside an opening. Complete valid authoring and generation previews derive temporary display/mask paths without persisting a duplicate coastline. Invalid/unfinished edits retain the saved land until a valid replacement is available.

Terrain visibility is clipped, including retained v1 strokes, while original stroke points remain editable and saved in full. Loading/partial/unavailable views cannot reuse a previous mask. Display-theme filtering now occurs after the authorized bounded view is loaded, so hiding a visual theme cannot remove its clipping boundary. There is no global mask download or new protected-source query. Historical and specialized-map behavior stays on the existing context paths.

A deliberately declared fictional reference gets artistic sea; scientific unknown coverage gets neutral paper. Existing scientific raster values/colors and explicit legacy/night styles remain retained. The pinned island paper, water, land, ink and river roles live in the shared semantic appearance scope and are independent of site branding. Missing exact style references show a retained-data warning and block image export, as missing asset revisions already do.

New generic maps default to regional scale and explicitly request the pinned island style. Existing creation clients and specialized maps keep their earlier defaults. Surface association still requires the creator's explicit existing-service action, with recommended 0?2000 by 0?1200 planar bounds and the sphere/reuse controls retained. Generate an island and Draw an island are both visible; generation now starts from the retained versioned single-island preset. Legacy illustrated generation and coastline tools remain reachable.

The actual phone-browser direct-open check exposed an existing navigation blocker: an artwork editor URL could omit the World Atlas tab. Editor URLs now explicitly retain that tab, and newly created maps record their editor URL. The final browser run requires direct reopening of the same map.

## Evidence and checks

- [Both actual baseline reproduction paths](../screenshots/worlds-geo-ux0a/baseline/README.md).
- [Website-created mainland/opening/inner-island/offshore proof, PNG and reopened/touch views](../screenshots/worlds-geo-ux0a/masking/README.md).
- Node 22.23.3 isolated production build and TypeScript: pass. Build artifacts and fingerprint are under the owned `artifacts/guidance/geo-ux0a` receipt.
- All 2,218 feature tests pass; 23 focused source/asset/frame/mask/composition tests pass. No failures or skips.
- Full lint: zero errors; retained stories-harness unused import warning is pre-existing.
- Actual production browser: normal website geometry creation, independent saves, full retained stroke, visible PNG and close/reload/reopen. Pixel proof: 14,632 terrain-fill pixels on land, zero outside. 390px native-touch browser events and bounded page width; emulation is not physical-device evidence.
- No new migration beyond the previously verified immutable 0132. No shared DEV/Production access, retained scientific-asset changes, Docker, deployment, main merge or deleted-Earth restore.

## Friction and remaining work

The browser harness originally selected the authored-only export name while expecting a geographic visible download, and assumed a library view after reload of an editor URL. Those harness assumptions were corrected; actual PNG/exported pixels and deliberate library close/reopen are now checked. The direct-open Atlas-tab defect was separately reproduced and corrected in application code.

The rectangular mask proof uses the retained v1 brush intentionally. It is not a finished island or new-library artistic acceptance. The visual palette, settlement/label flow, independent status/recovery UI, integrated learning, complete generated/manual journeys, fault-injection/performance/storage gates and independent final review remain required. This checkpoint requests no owner action.

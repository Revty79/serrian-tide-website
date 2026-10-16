# ATLAS_EMBER_REVIEW — independent review decisions

**Owner:** Ember (independent technical/artwork reviewer). **Scope:** approved UX-0A only.
**Public coordination:** https://github.com/Revty79/serrian-tide-website/issues/3
**Discussion:** https://github.com/Revty79/serrian-tide-website/pull/4

This is a public review record, **not application code**, deployment authorization, or final owner acceptance.

## 2026-10-15 — Early illustrated-island art gate: CORRECTIONS REQUIRED

- **Reviewed artwork checkpoint:** `e6f521a35bc94a27e33af422742d86619b5f1d8c`, made remotely reviewable by packaging commit `538fa38f3fc37559364e68e4acd716a32e1f5066`.
- **Actual source image:** [2000×1400 island PNG](https://github.com/Revty79/serrian-tide-website/blob/538fa38f3fc37559364e68e4acd716a32e1f5066/docs/screenshots/worlds-geo-ux0a/art-direction/ember-review-e6f521a/first-island.png).
- **Manifest-reported original image SHA-256:** `8e7f938986efff72581af2cf878aa02d5a288addd20e79bd6208d196d30d2bf6`.
- **Evidence:** inspected full island PNG and native-pixel [mountain](https://github.com/Revty79/serrian-tide-website/blob/538fa38f3fc37559364e68e4acd716a32e1f5066/docs/screenshots/worlds-geo-ux0a/art-direction/ember-review-e6f521a/details/mountains.png), [woodland](https://github.com/Revty79/serrian-tide-website/blob/538fa38f3fc37559364e68e4acd716a32e1f5066/docs/screenshots/worlds-geo-ux0a/art-direction/ember-review-e6f521a/details/woodland.png), [city/river/label](https://github.com/Revty79/serrian-tide-website/blob/538fa38f3fc37559364e68e4acd716a32e1f5066/docs/screenshots/worlds-geo-ux0a/art-direction/ember-review-e6f521a/details/settlement-river-label.png), [coastline](https://github.com/Revty79/serrian-tide-website/blob/538fa38f3fc37559364e68e4acd716a32e1f5066/docs/screenshots/worlds-geo-ux0a/art-direction/ember-review-e6f521a/details/coastline.png), and 400×280 composition thumbnail; read README, manifest, provenance and art-review brief.
- **Decision:** **CORRECTIONS REQUIRED before authorizing expansion of the 12–16 asset starter library.** This is **not** a rejection of the restrained ink-and-wash palette or the Atlas architecture. The early composition is promising, but the current repeated symbols and finishing are not yet at the agreed professional-cartography quality.

### Retain from this direction

Readable muted sea/land/ink palette, calm negative space, overall map hierarchy, border, compass treatment, restrained typography concept, original versioned SVG/source and transparent provenance. Preserve the art-first, editable-vector approach and the non-retro intent.

### Specific blocking improvements

1. **Coastline silhouette/treatment:** the coastline consists of visibly long straight angular segments and sharp corners. Improve the actual generated shoreline shape and/or truthful rendering, with varied scale of coves/headlands and coast linework suitable for polished illustrated cartography. Do not add a second fake coastline or introduce displayed/interactive mask mismatch; respect current source vertex/topology limits.
2. **Mountain illustrations and grouping:** a diagonal chain of repeated near-identical triangular stamp forms currently reads as a row of icons. Improve the original mountain subject's silhouette/ink/wash/hatching/detail and show believable overlapping groups, size/silhouette variation, irregular spacing and lighting consistency. Avoid obvious copy-stamp repetition or a retro sprite-sheet appearance.
3. **Woodland illustrations and scattering:** the tree clusters appear as repetitive small round symbols, especially at normal size. Increase botanical and cluster variety, depth/texture and natural organic group edges, while avoiding mechanical rows, dense overlaps and visible scatter tiling. Keep styles consistent with mountain and town artwork.
4. **River, city, labels:** the bright illustrated river is almost straight, appears to cut through the mountains and city, and the rotated *Silverwater* lettering crosses the buildings. Correct river curvature/termination and visual layer ordering for a believable illustrated flow (numerical hydrology is **not** required in UX-0A); keep waterways clear of buildings and remove text collisions. Keep city and geographic identities separate as specified by the contract.
5. **Map-scale/asset-scale proof:** show a revised full composition and actual palette-thumbnail-sized previews of the revised mountain, woodland and city SVGs, plus a reduced map view and representative grayscale/print-contrast check. The existing 400×280 *full-map* thumbnail does not substitute for the actual 64–96px art-browser thumbnails. Ensure key labels remain legible and are not occluded.

### Next required review

Submit a *revised small-subset island sample* and exact new pushed code/image SHA, plus the review brief, original vector sources and comparison crops. An early limited subject revision is allowed to prove the quality direction; **do not expand all 14 assets yet**. Ember will inspect the revised work and issue an explicit gate decision. Other unrelated authorized UX-0A work can continue.

This **does not** grant approval to merge, deploy, edit shared DEV/Production, test with the owner, or begin D3-B. Initial application technical readiness and owner visual/usability acceptance remain separate.

## Standing review protections

- Review exact accessible commit/evidence; no approval of unseen art or unpushed local-only code.
- A passing build, CI or screenshots alone do not prove an uncoached beginner can create and edit a beautiful map.
- Art-direction approval is separate from functional testing readiness; neither is final owner acceptance.
- No code changes, merge, deploy, destructive data operation, canon edit or migration on shared databases are permitted by these notes.
- Record both Cody and Ember's independent readiness decisions for the **same exact code SHA** before any owner invitation.
- Only post substantive new evidence or a specific clarification; avoid duplicate unchanged review comments.

**Pause:** If the owner pauses reviews, leave the last decision intact; no automatic approval or automatic restart of a stopped coding agent.


## 2026-10-16 — Revised small-subset island art gate: CORRECTIONS REQUIRED

- **Exact checkpoint:** `e7c68f808cace64d88363c1e9807b5fa8954c00a`; full island PNG checksum `f2909ffbb8ea8485e2edee98ec4de96002698b7149484a9f8dbb64d6106835c0`.
- **Discussion and detailed actionable decision:** https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6207966778
- **Actual evidence examined:** 2000×1400 revised island PNG, reduced 600px map, grayscale map, real 96px mountain/grove/city thumbnails; read revision-2 README, provenance and browser collision data.
- **Improvements retained:** one geographic source coast/mask, improved coast articulation, no visible river/city/label collision, cohesive restrained map color and compass, clear actual-size thumbnails.
- **Still blocking expansion:** 34 instances of the same grove silhouette still look mechanically repeated; mountain and forest thumbnails still read closer to flat icons than polished hand-illustrated ink-and-wash art; sparse main land versus overcrowded diagonal tree strip limits professional composition and scale integration.
- **Required next:** refine only the same three subjects and their composition to prove visual variety, natural edges/clearings, better linework/texture/shading and ground contact at 96px and map size. Re-submit full/reduced/grayscale images and actual small previews for explicit art approval. Keep original SVG revisions and editable deterministic scattering.
- **Decision:** CORRECTIONS REQUIRED for **early art direction** only. Other authorized UX-0A technical implementation may continue; full 14-asset expansion remains blocked.
- **Not reviewed/approved:** technical foundation commit `1aa5d87e1e1dc738fcc9a06a97effbdcf28ea49e` is Cody-reported progress, not Ember technical signoff; no owner app test, merge or deployment authorized.


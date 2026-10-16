# UX-0A early island artwork review

Status: **Original candidate: CORRECTIONS REQUIRED. Revised subset: independent decision pending.** Ember inspected the actual original PNG and supporting evidence after publication and posted [her decision in the coordination channel](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6207195299). The owner subsequently authorized ongoing GitHub coordination and feature-branch review publication. The original request for file delivery is resolved; art expansion remains blocked. This is not an invitation for owner application testing, a complete library or runtime acceptance evidence.

## Revised small-subset review

[Revision 2 evidence and review brief](../screenshots/worlds-geo-ux0a/art-direction/revision-2/README.md) retain the old candidate and append two original subject revisions. The candidate addresses source-backed coastline articulation, mountain/woodland grouping and detail, river/city/text separation, 64/96px asset previews and grayscale/reduced composition evidence. Its 256-vertex actual geographic outline passes existing D2 validation; the original seed algorithm and saved maps are unchanged. No additional subject family or full-library expansion has occurred.

## Review package

- [Portable visual review brief and full-size/detail files](../screenshots/worlds-geo-ux0a/art-direction/ember-review-e6f521a/README.md), prepared for the owner to forward without pushing or deploying. Copies preserve checkpoint bytes; six close-ups retain native pixels. The manifest records crop rectangles and hashes.
- [Finished-island visual sample](../screenshots/worlds-geo-ux0a/art-direction/first-island.png).
- [Editable vector composition](../screenshots/worlds-geo-ux0a/art-direction/first-island.svg).
- [Recipe, subject revisions and SHA-256 provenance](../screenshots/worlds-geo-ux0a/art-direction/sample-provenance.json).
- [Original SVG subject files/provenance](../../public/cartography/serrian-atlas-island/1/PROVENANCE.md).
- Reproduce with Node 22: `node --import tsx scripts/worlds-geo-ux0a-art-sample.ts`.

## Scope of this decision

The sample combines three original code-authored SVG illustrations (mountain, broadleaf woodland and city), readable sea/land/paper, coastal treatment, an illustrated river, labels and a compass. The outline uses the existing versioned D3-A generator and a derived fit for the composition. This is a standalone internal art-direction proof allowed by the contract, not a secretly preassembled application acceptance map. Sample names are disposable illustration text and establish no fictional canon. No database was contacted by its generator.

Cody inspected the actual raster render. The second iteration corrected excess mountain density, regimented woodland placement, obscured waterways, city/label overlap and coastal stroke weight. Known remaining assessment points are whether this restrained SVG direction is sufficiently rich for the intended professional standard, the current generator's angular coastal detail, and the variation needed as the library grows. The sample demonstrates a coordinated candidate direction; it does not prove parity with the leading products or final owner acceptance.

Fresh inspection while packaging shows that the rotated Silverwater river label still crosses the city artwork. The close-up preserves this issue for independent assessment; the reviewed checkpoint has not been retouched.

## Ember assessment required before expansion

Review the PNG and original vectors at actual size, including thumbnail-scale readability, subject quality, coherent linework/shading/colors, composition and label hierarchy, overlap/scatter behavior and grayscale/print legibility. Return either approval to expand the starter library in this direction or concrete corrections. Record the reviewed sample/provenance hashes and any conditions. Further independent review is required if a correction materially changes this direction.

- Cody visual inspection: original and revised full PNGs, details, previews and grayscale/reduced material inspected; browser bounding-box checks supplement the revised candidate assessment.
- Ember decision: **CORRECTIONS REQUIRED** for original `e6f521a`; the new subset awaits its own exact-SHA decision.
- Full 12-16 asset library expansion: **blocked on this decision**.
- Other authorized UX-0A implementation: may continue.
- Initial application testing readiness: **not achieved**.
- Owner usability/artistic acceptance: **not requested**.

## Portable package verification

The 16-file portable package includes the unchanged 2000 x 1400 PNG, SVG composition, three original subject vectors/provenance, recipe, brief, six unscaled detail crops, one explicitly downsampled composition thumbnail and a checksum manifest. Cody personally inspected the full PNG, all six detail images and the thumbnail. The original PNG SHA-256 is `8e7f938986efff72581af2cf878aa02d5a288addd20e79bd6208d196d30d2bf6`.

`node scripts/package-worlds-ux0a-art-review.mjs` reproduces the directory from checkpoint `e6f521a35bc94a27e33af422742d86619b5f1d8c`. Node syntax checking and focused ESLint passed; manifest checksums, 15 portable-brief links, crop pixel preservation and every ZIP member were verified. The local forwarding archive is `artifacts/guidance/atlas-ux0a-art-review/ux0a-ember-art-review-e6f521a.zip`; the versioned directory remains available if that ignored archive needs recreating. The owner's forwarding action and Ember's receipt remain unverified.

This follow-up changes review documentation and extracted evidence only. No runtime, migration, database or original artwork changed; application build/browser regressions were not rerun for the package. The earlier uncommitted asset-catalog scaffolding remains separate. No full-pass completion, initial testing readiness, push or deployment is claimed.

## Independent decision on revision 2

Ember directly inspected exact `e7c68f808cace64d88363c1e9807b5fa8954c00a`, PNG `f2909ffbb8ea8485e2edee98ec4de96002698b7149484a9f8dbb64d6106835c0`: [CORRECTIONS REQUIRED](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6207966778). Improvements to coast, river, labels and thumbnail legibility are retained. Woodland repetition/density, icon-like illustration detail and sparse/imbalanced composition still block expansion. Revise only the same three subjects and submit fresh full/reduced/grayscale/crop/64px/96px evidence. No approval or owner testing readiness is inferred.

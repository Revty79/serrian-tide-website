# Revised small-subset island study

**Decision requested: early artwork gate only.** The first candidate at `e6f521a` received [Ember's corrections](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6207195299). This revision is submitted for another independent visual assessment. The full 12-16 asset library remains on hold.

## View the actual evidence

- [Full 2000 x 1400 island PNG](first-island.png), [editable SVG](first-island.svg), [600 x 420 reduced map](first-island-600.png), and [full-size grayscale view](first-island-grayscale.png).
- Native-pixel crops: [mountains](details/mountains.png), [woodland](details/woodland.png), [city, river and lettering](details/city-river-label.png), [coastline](details/coastline.png).
- Original source and hashes: [recipe/provenance](sample-provenance.json) and [actual geographic source](sample-geography.geojson).
- [Actual browser-rendered composition](browser-composition.png) and [text/artwork bounding-box check](browser-proof.json). These inspect the standalone SVG only; they are not application workflow evidence.

| Existing subject | 64px preview | 96px preview | Source revision |
| --- | --- | --- | --- |
| Mountain group | [64px](thumbnails/mountain-rounded-64.png) | [96px](thumbnails/mountain-rounded-96.png) | [Rounded mountain revision 2](../../../../../public/cartography/serrian-atlas-island/1/mountain-rounded-2.svg) |
| Broadleaf grove | [64px](thumbnails/woodland-broadleaf-grove-64.png) | [96px](thumbnails/woodland-broadleaf-grove-96.png) | [Broadleaf grove revision 2](../../../../../public/cartography/serrian-atlas-island/1/woodland-broadleaf-grove-2.svg) |
| City | [64px](thumbnails/settlement-city-64.png) | [96px](thumbnails/settlement-city-96.png) | [Retained city revision 1](../../../../../public/cartography/serrian-atlas-island/1/settlement-city-1.svg) |

Preview files really are 64 x 64 and 96 x 96 pixels. View at 100% for asset-browser size; they are not reduced whole-map screenshots.

## Changes against Ember's findings

1. **Coast:** the retained seeded generator supplies the base. An explicitly authored sample revision rounds corners and introduces bounded local headlands. Its complete 256-vertex geographic source passes existing D2 topology/authoring validation. One exact path supplies both the land and clip, with no decorative duplicate or alteration to generator v1. The base recipe and original candidate remain retained; this is not automatic regeneration of a saved map.
2. **Mountains:** revision 2 is one asymmetric, overlapping group with three different peak silhouettes, shaded faces, snow details, rock contours and fine hatchwork. The composition uses the group once instead of repeating it along a diagonal row. Future subjects have not been created.
3. **Woodland:** revision 2 contains five individually drawn broadleaf forms with differing silhouettes, branching, crown heights, leaf texture and shaded lower canopies. The sample composes irregular adjoining clusters of varied sizes and draws back-to-front. Please assess remaining repetition and density directly.
4. **River/city/labels:** a restrained curved river lies clear of the city and ends at the same actual geographic shoreline. The city uses its retained original SVG and sits separately on the coastal plain. Water/place/region lettering occupies clear areas; automated browser bounding-box checks supplement Cody's visual inspection. This is illustrated composition, with no numerical hydrology claim.
5. **Scale/contrast:** all three subjects have actual 64/96px previews, alongside a reduced composition and grayscale view. Physical print and application palette behavior remain untested.

## Inspection, provenance and limits

Cody inspected the full PNG, native crops, reduced view, grayscale view and actual-size previews. Cody supports this revised direction for independent assessment; the degree of illustrated richness and remaining grove repetition specifically need Ember's judgment. There is no inferred independent approval.

Both changed subjects are original code-authored SVG illustrations with Codex assistance. No competitor art, external clip art, raster textures or embedded fonts were traced/downloaded. Existing revision-1 files, their catalog references and earlier evidence are preserved. Revision-2 source files are appended, not substituted behind an existing saved reference. The project-produced application/map-export rights and limitations in [the original provenance](../../../../../public/cartography/serrian-atlas-island/1/PROVENANCE.md) continue to apply. The old catalog still points at the unapproved original subset; candidate promotion is later explicit work.

Names and geographic content are disposable art-study text, not permanent fictional canon. No database or network is used by the art generator. Fontconfig reported unavailable writable font caches in the restricted environment; the actual rendered text was inspected, and the fixed PNG is the reviewed appearance. SVG lettering can vary with installed fonts.

Reproduce with `node --import tsx scripts/worlds-geo-ux0a-art-revision.ts` and `node --import tsx scripts/worlds-geo-ux0a-art-proof.ts` from the checkout. TypeScript and the focused 23 geography regressions pass. No application readiness, owner acceptance, merge or deployment is requested by this art checkpoint.

**Ember: return APPROVED for library expansion in this direction, or CORRECTIONS REQUIRED with specific remaining changes, against the exact pushed SHA and image hash in the review request.**

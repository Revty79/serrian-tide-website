# Atlas Pass 3E-A visual evidence

Actual production-build captures from disposable PostgreSQL fixtures and synthetic private accounts. Desktop viewport: 1440 x 1100. Phone viewport: 390 x 844 with native touch enabled. Full-page images include scrollable properties. No real private World or Production data is included.

| Image | Demonstrates |
| --- | --- |
| [Desktop editor](desktop-settlement-editor.png) | Saved town source, dedicated tools, selected structure and overlapping district memberships. |
| [Completed town](desktop-town-map.png) | Saved streets, building footprints, canal, wall, gathering square and districts in Explore. |
| [District properties](district-properties.png) | Actual boundary authoring and narrative properties during creation. |
| [Building properties](building-properties.png) | Authored description, custom classification and memberships before the town save. |
| [Streets and footprints](streets-footprints.png) | Individual buildings, irregular footprint, curved routes and editable areas. |
| [Place exploration](settlement-explore.png) | Persistent building identity and authored information without entering the editor. |
| [Connected navigation](connected-navigation.png) | Arrival through a preferred regional-map connection using the same settlement identity. |
| [Phone editor](mobile-settlement-editor.png) | Native touch rectangle/path creation and persisted touch movement, with accessible property controls. |
| [Phone exploration](mobile-settlement-explore.png) | Saved touch-authored building description and connected navigation on a narrow screen. |
| [Dense editor](dense-settlement.png) | 900 persisted buildings, 24 routes, two districts and additional objects; Structure 450 selected through search, moved and saved. |
| [Dense exploration](dense-settlement-explore.png) | The same retained dense source in read-only Explore. |

[Performance measurements](performance.json) record opening, selection, edit/save and navigation observations on this machine. Opening includes library navigation and authorized reads; edit/save includes validation, database writes and readback. These are single-run workflow measurements, not general latency guarantees.

The regression directories contain newly captured connected navigation, generation and refinement evidence from the full prior Atlas browser suite. Earlier pass evidence directories remain unchanged. The refinement PNG export is identified separately from browser screenshots in the manifest.

Inspected desktop editor/Explore, phone editor/Explore and dense editor images. Controls wrap without horizontal phone overflow, source remains visible and selected place information is readable. Dense or overlapping path/area names can collide at fit scale; automatic label collision avoidance is outside this foundation pass. Small building labels are suppressed until zoom/selection, and the searchable place list retains access to every object.

Images accompany persisted-ID/source assertions, migrations over existing records, owner/Admin/foreign-user checks, two-tab conflict recovery, native touch movement and unchanged gameplay snapshots. Screenshots are evidence alongside those checks.

## File manifest

All 43 evidence files (39 PNGs, three JSON measurements and this README):

```text
README.md
building-properties.png
connected-navigation.png
dense-settlement-explore.png
dense-settlement.png
desktop-settlement-editor.png
desktop-town-map.png
district-properties.png
mobile-settlement-editor.png
mobile-settlement-explore.png
performance.json
regressions/connected/breadcrumbs.png
regressions/connected/continent-selection.png
regressions/connected/dense-exploration.png
regressions/connected/navigation.json
regressions/connected/phone-connections.png
regressions/connected/phone-region.png
regressions/connected/phone-town.png
regressions/connected/place-information.png
regressions/connected/regional-towns.png
regressions/connected/world-connected.png
regressions/generation/archipelago.png
regressions/generation/continental-world.png
regressions/generation/description-controls.png
regressions/generation/description-driven.png
regressions/generation/edited-generated-map.png
regressions/generation/generation-controls.png
regressions/generation/northern-continent.png
regressions/generation/phone-description-map.png
regressions/generation/phone-description.png
regressions/generation/phone-editor.png
regressions/generation/phone-generation.png
regressions/generation/rugged-world.png
regressions/refinement/broken-archipelago.png
regressions/refinement/chaotic-world.png
regressions/refinement/dense-export.png
regressions/refinement/dense-map.png
regressions/refinement/description-after.png
regressions/refinement/description-before.png
regressions/refinement/dramatic-continent.png
regressions/refinement/performance.json
settlement-explore.png
streets-footprints.png
```

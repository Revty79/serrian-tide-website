# Atlas Pass 3D production-browser evidence

Captured from an isolated production Next build using real disposable PostgreSQL persistence and synthetic private accounts. Desktop: 1440×1100. Phone: 390×844, including native touch selection and pan. No real private World or Production data is included.

| Screenshot | Demonstrates |
| --- | --- |
| [World map](world-connected.png) | Existing saved native generated chart, several continent/island identities and Explore controls. |
| [Selected continent](continent-selection.png) | Artwork selection highlights the same continent and shows its description and user-authored preferred detail map. |
| [Region and towns](regional-towns.png) | Regional representation with linked Grayhaven marker and both local-chart choices. |
| [Place information](place-information.png) | Settlement context, parent, authored description, preferred chart and alternate chart. |
| [Breadcrumbs](breadcrumbs.png) | World → continent → kingdom → settlement, separate from the Previous map trail. The local map uses today's generic cartography, not future city tools. |
| [Phone region](phone-region.png) | Touch-selected town, multiple destinations and responsive information panel. |
| [Phone town](phone-town.png) | Nested map, wrapped geographic ancestry and return navigation. |
| [Dense exploration](dense-exploration.png) | A separate saved connected copy near the native terrain budget, retaining every editable mark while browsing to its detail chart. |
| [Phone connections](phone-connections.png) | Mobile association/preferred-destination controls with native labeled fields and guidance. |

[Navigation measurements](navigation.json) record source counts, measured desktop/phone openings, viewports and the actual tested workflow. These timings include Playwright interaction and authorized reads; they are observations from this machine, not universal latency promises.

The `regressions/generation/` captures rerun the accepted settings/description/editing/phone workflows. `regressions/refinement/` contains freshly captured natural landscapes, v1/v2 description comparisons, the dense editor/native PNG export and `performance.json`. Original Pass 3B/3C/3C.1 evidence directories are preserved.

Screenshots accompany assertions on stable persisted IDs, source movement/rename, unchanged recipes, multiple destinations, two-tab conflicts, URL/panel selection, browser back/forward, direct reload, read-failure recovery, archive/restore, same-World constraints, authorization and unchanged Campaign runtime. Visual capture alone is not the acceptance test.

# Geo UX-0 focused Map Studio

Authorized from independently approved D3-A `72150c1efc3524080a286890305f011697aea40c`. This is a presentation/workspace pass before D3-B. No new source, geometry engine, schema, dataset, persistent World edit or later Geo work is authorized.

## Inventory before reorganization

The existing entry is World workspace -> Atlas library -> map. `editMap` opens generic/settlement editors directly; `atlas` opens connected exploration; `mapYear`, timeline, ordinary and review parameters retain the viewing context. Exploration can return to editing. Generic/settlement appearances pass through HistoricalMapWorkspace; settlements can open the same Atlas artwork editor. Interiors and dungeons use PlanEditor. Connections, floors/levels, place history and source comparison use existing dialogs.

| Existing tools and controls | Retained destination |
|---|---|
| Select, pan, zoom, fit, feature lists, shared-place information, map information | Artwork/navigation inspector and canvas navigation |
| Draw landmass, freehand coast, edit points/coordinates, move, location markers, smooth coast, coastal detail, sculpt coast | Artwork inspector |
| Terrain brush radius, spacing, density, style; paths/rivers/roads, curves/width; symbols, labels/text/rotation and linked places | Artwork inspector |
| Artwork Undo/Redo, outline/path completion, archive/restore, ordering, unapplied fields | Artwork controls; persistent artwork save/history actions |
| D2 surface association, source reading, island/landmass/river creation, mouse/keyboard/touch vertices | Geography inspector |
| D2 components, exterior/holes, add/remove parts, exact vertex selection/focus, Undo/Redo, original/latest comparisons, rebase, download, revision account/import acknowledgement/protection | Geography inspector; independent source save |
| D3-A presets, seed, coverage/count/size/shape/complexity/extent, preview/cancel, recipe download, explicit accept, conflicts/retries and saved coastline selection | Generation inspector; independent batch acceptance |
| Projection, geographic themes/labels, source search/provenance/coordinates; artwork layer visibility/locks, presentation | Geography reader and Layers/display inspector |
| Numerical elevation/bathymetry, shading/opacity/legend and preference save; dated classification/opacity/classes and preference save | Layers/display inspector; separate existing saves |
| Baseline/year/appearance/revision selection, create/edit/archive/restore/retain, period/account/privacy, historical comparison/connections, political overlays | History inspector and existing dialogs |
| Atlas connection editing, connected exploration, place milestones, Realm linking, interior floors/dungeon levels | Existing navigation/dialogs and Connections inspector |
| Visible combined PNG, authored-only PNG, credits/resource retry, generation history/draft recovery | Export inspector; required raster credit stays beside canvas |
| Settlement streets/buildings/walls/districts/areas/markers, templates, layers and points | Existing SettlementEditor inside focused shell |
| Interior/dungeon rooms/walls/openings/furnishings/transitions, natural passages, grid, layers, object fields/points, protected features, floor/level navigation and recovery | Existing PlanEditor inside focused shell |

The former World hero, tabs and timeline controls precede all editors. Historical controls and wrapping artwork tools then push the map farther down. Geographic authoring, generation, readers, raster settings, layers and exports share one long inspector; mobile stacks it below the map. UX-0 replaces this layout while retaining these controls and their separate drafts.

## Focused shell and context

`MapStudio` wraps the existing selected-map and legacy-generation branches of AtlasWorkspace. It is not another editor or route. The application navigation stays available; the World hero, tabs, timeline selector and authoring summary are hidden while editing. A compact World/timeline context remains in the Studio, alongside the map title, current tool and draft status. `editMap` works for generic, settlement, interior and dungeon maps. Existing explorer destinations, timeline/year/review/ordinary parameters and appearance selection remain authoritative.

The shell follows the actual application navigation's bottom edge and the visual viewport. Desktop uses a tool rail, canvas and independently scrollable inspector. Narrow layouts use a horizontal tool palette and dismissible settings sheet. Small-phone sheets have a lower height cap; closing settings restores unobscured map access. Required raster attribution remains beside the canvas. The page stays locked while the Studio is open; cleanup restores its previous overflow style.

The existing V1/V2 new-map/variation generator also opens in this shell: its original settings, description interpretation/review, seed and explicit new-map save stay in Generate, beside the existing preview renderer. It keeps its original algorithms and saves new maps through the same Atlas service.

The categories appear only when their panels apply to the current editor/view. The seven categories are Artwork, Geography, Generate, Layers, History, Connections and Export. Artwork uses a compact native picker grouped into selection/navigation, coastlines/locations, terrain/paths and labels/symbols. Current tool is also visible beside the map title. The active pointer mode is independent of display/history/export settings, so inspecting them does not switch a geographic tool to artwork. A held canvas gesture finishes before tool/drawer changes are accepted. Settings can scroll without moving the canvas. Selecting a category returns its inspector to the top. Escape or Close tool settings returns focus to the triggering palette/Settings button.

`StudioPanel` and `StudioActions` use stable portal targets owned by the shell. Hidden panels stay mounted; changing categories does not reset input values, source documents, workers, preview geometry, request identities, undo histories or errors. Each panel preserves the original pending/disabled fieldset boundary in its rendered location. The no-shell fallback retains existing component reuse. Geographic pointer authoring is suspended in Artwork, while its separate draft remains retained. Ordinary/review/historical contexts cannot activate owner authoring through a category selection.

The original artwork, geographic source, generation batch, elevation, land-cover and appearance save handlers remain separate. Artwork Save/Undo/Redo and return/explore/connection actions use the footer; source and raster saves remain in their relevant inspectors. Saving artwork reveals its settings/feedback. A source preview alone cannot enable an artwork save. Navigation keeps the combined guard. Studio map closure after Back/Forward is deferred until the existing World guard has accepted or restored the URL; cancelled navigation must retain the same live editor rather than reopen saved data.

## Geometry and compatibility

No generator algorithm, source schema, migration, coordinate adapter, projection, raster loader, exporter or immutable source service is changed. SVG screen matrices and existing inverse coordinate adapters continue to convert pointer positions after resize; screen coordinates never become authoritative geography. Existing resize observers update hit sizes and render widths. Layers, source/component/ring/vertex focus, rasters and previews use the original scene. Specialized settlement and floor-plan controls move into panels while keeping their own authoring handlers and save semantics.

No migration, dependency, configuration or new asset is required. A compatible prior release can read all saved maps/sources: this pass changes presentation and navigation, not stored formats. Reverting code does not undo any authorized creator saves. Deployment requires the existing target verification, protected backups, build and role-specific smoke checks; no push or deployment is authorized here.

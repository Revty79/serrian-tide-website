# Professional 2D Atlas: capability audit and proposed sequence

**Proposal for owner and Ember review, 2026-10-16. No implementation authorization is implied.** This document responds to the [owner priority correction relayed by Ember](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6219239411). It proposes completing professional 2D authoring across scales **before** numerical heightmap development. It does not amend the [adopted roadmap](worlds-map-maker-decisions.md), the [UX-0A contract](worlds-atlas-ux0a-contract.md), published migrations, or main.

The implementation parent and exact proposal SHA are recorded in the accompanying coordination request. This audit inspects repository contracts, services, editors and renderers. UX-0A browser evidence covers its regional island workflow; it does not establish fresh novice acceptance of every city/interior/dungeon capability below. A schema field, helper function or named tool alone does not establish professional usability.

## What the existing application gives us

Keep Atlas inside Worlds. The application already separates persistent geographic/place identities from drawings, has dedicated settlement and plan models, and connects maps, buildings, floors and levels. Reuse those systems. The remaining work is substantial authoring, visual and output development, with shared editing capabilities integrated into each existing editor. A larger stamp collection alone cannot deliver the requested result.

The four statuses below describe the inspected implementation: **EXISTING** means an implemented capability in the cited code; **PARTIAL** means a restricted implementation or a missing cross-scale workflow; **MISSING** means no supported implementation was found in the cited current editor/contracts; **NEEDS VISUAL REWORK** means useful underlying data exists but the current rendering is insufficient evidence of the requested professional finish. These are findings for the named feature, not blanket acceptance of a whole editor.

### Core editing and workspace

| Capability | Status | Repository evidence and remaining gap |
| --- | --- | --- |
| Fixed-coordinate geometry, tap polygons/lines, point fields and vertex editing | EXISTING | [Atlas](../../src/features/worlds/atlas.ts), [geographic authoring](../../src/features/worlds/geographic-authoring-workspace.tsx), [settlement editor](../../src/features/worlds/settlement-editor.tsx), [plan editor](../../src/features/worlds/plan-editor.tsx). Keep original coordinates and place IDs. |
| Geographic multipart components and enclosed openings | EXISTING | [D2 geometry](../../src/features/worlds/geographic-authoring-geometry.ts), [authoring workspace](../../src/features/worlds/geographic-authoring-workspace.tsx). Existing interactive bounds and unsupported-source read-only behavior remain. |
| Freehand, curves and smoothing | PARTIAL | [Decorative coast tools](../../src/features/worlds/coastline.ts), [curved artwork paths](../../src/features/worlds/cartography.ts), [settlement line curves](../../src/features/worlds/settlement.ts). No common editable Bézier/freehand system across geographic land, streets, walls and rooms. Smoothing decoration is not automatically a source edit. |
| Rectangle and round shapes | PARTIAL | Settlement buildings and plan rooms have shape actions; round chambers retain polygon vertices in [PlanEditor](../../src/features/worlds/plan-editor.tsx). No uniform shape/constrain/resize handles across scales. |
| Select, move, rotate and scale | PARTIAL | [Atlas editor](../../src/features/worlds/atlas-map-editor.tsx), [settlement transforms](../../src/features/worlds/settlement.ts), [plan transforms](../../src/features/worlds/dungeon.ts). Single-object functions/fields exist; behavior and direct handles are inconsistent between editors. |
| Duplicate with retained wall attachments | PARTIAL | [Plan duplication](../../src/features/worlds/plan-editor.tsx) includes attached openings; settlement has object duplication. Regional drawings and geographic sources lack a uniform explicit duplicate workflow with correct identity choices. |
| Multiselect, user groups, mirror, alignment/distribution | MISSING | Current editors keep a single selected ID. Attached-wall copying is a specific dependency rule, not arbitrary grouping. Define geometry copies versus shared-place representations before adding batch operations. |
| Layers, hide/lock, ordering and masks | PARTIAL | [Cartography layer controls](../../src/features/worlds/cartography-controls.tsx), settlement/plan state layers and [geographic land mask](../../src/features/worlds/geographic-land-mask.ts). Regional order is within fixed layers; no shared custom layer tree or arbitrary editable masks across scales. |
| Object/layer opacity, material fills, blending and eraser | MISSING | Existing grid opacity and SVG implementation opacity are not creator-controlled general opacity. No authored texture-fill/mask/blend/erase contract in the inspected draft models. An eraser must retain source/history and declare whether it erases paint, cuts a mask or edits geometry. |
| Snapping, measurement and guides | PARTIAL | [Dungeon snapping](../../src/features/worlds/dungeon.ts) supports square/hex grids. Generic guides, angular/endpoint/object snaps and measured print distance are absent. Do not infer real units from a drawing coordinate. |
| Undo, redo, pending fields and conflicts | EXISTING | [Editing history](../../src/features/worlds/atlas.ts) and existing editors retain scoped undo and revision comparison. [Island recovery](../../src/features/worlds/island-recovery-panel.tsx) provides restoration for supported live generic maps. Extend genuine recovery to other scales rather than claiming it already covers them. |
| Asset/object search and palettes | PARTIAL | [Island palette](../../src/features/worlds/island-palette.tsx), settlement/plan name/kind searches. No shared all-scale library browser or creator tags. |
| Viewport workspace and contextual tools | EXISTING | [MapStudio](../../src/features/worlds/map-studio.tsx) mounts existing panels into a viewport shell. Preserve pending fields and drafts while changing panels. |
| Desktop, touch and keyboard parity | PARTIAL | Pointer, coordinate fields and keyboard operations exist; UX-0A has isolated desktop/touch-emulation evidence. Uniform shortcuts, direct transform handles and uncoached all-scale use require fresh checks. Emulation is not a physical phone claim. |

### World and regional cartography

| Capability | Status | Repository evidence and remaining gap |
| --- | --- | --- |
| Real coast generation, islands, bays, openings and manual edits | EXISTING | [Versioned generator](../../src/features/worlds/geographic-generation.ts), D2 authoring and mask. Generated recipes remain provenance; saved edited geometry stays authoritative. |
| Beaches, cliffs, shoals and coastal edge brushes | MISSING | Current island library and [terrain kinds](../../src/features/worlds/cartography.ts) do not offer a complete editable coastal material/edge system. |
| Rivers, streams, roads and trails | EXISTING | Editable illustrated paths and curves in [cartography](../../src/features/worlds/cartography.ts) and its inspector. They are authored 2D paths, without numerical water simulation. |
| Rail, reusable bridges and path junction treatment | MISSING | No dedicated regional rail/bridge/junction authoring in current path kinds. A settlement bridge variant does not supply this cross-scale workflow. |
| Lakes/marshes/biome vegetation | PARTIAL | Legacy terrain, geographic holes/water sources and the v2 wetland/woodland library exist. Need coherent editable water/material fills, transitions and vegetation coverage beyond the starter style. |
| Mixed scatter, footprints and clearings | PARTIAL | [Versioned scatter](../../src/features/worlds/island-asset-scene.tsx) retains stroke, seed and ordered exact references; the approved grove has two silhouettes. Need natural mixed packs, exclusion/clearing masks and better footprint/edge control with bounded rendering. |
| Materials and terrain edge blending | MISSING | No general authored terrain-material layer with editable blend edges. Distinguish decorative material from categorical scientific coverage. |
| Physical versus political maps | PARTIAL | [Territory models](../../src/features/worlds/historical-territories.ts) and existing History sources provide political overlays. Professional visual presets must work without replacing physical identities or dated accounts. |
| Typography and label hierarchy | PARTIAL | Place/region/water labels, scale/rotation and linked places exist. Need font/style families, readable print hierarchy, curved/path text where useful, collision assistance and creator overrides. |
| Legend, compass, measured scale and grid | PARTIAL | [Presentation](../../src/features/worlds/cartography.ts) includes an editing grid. No complete authored legend/compass/measured scale composition. A scale bar requires explicit calibration, projection and units. |

### Detailed cities, towns and villages

| Capability | Status | Repository evidence and remaining gap |
| --- | --- | --- |
| Streets, districts, waterways, walls, spaces and buildings | EXISTING | [Settlement contracts](../../src/features/worlds/settlement.ts), editor and service already store independently editable entities with stable places. A city marker opens a different level of representation. |
| Street-network assistance, blocks and lots | PARTIAL | Manual connected lines and district/building outlines exist. No reversible block/lot subdivision, street junction/network assistance or selective layout regeneration. |
| Footprints and roofs | NEEDS VISUAL REWORK | [SettlementScene](../../src/features/worlds/settlement-scene.tsx) renders footprints plus a simple roof line. Need coordinated roof forms/materials and independent visual detail without baking footprints into a picture. |
| Canals, ports, walls, gates and bridges | PARTIAL | Waterways, wall lines and bridge/gate/harbor variants exist. Detailed quays, locks, working junctions, bastions and convincing waterfront artwork are missing. |
| Squares, markets, parks, farms and fortifications | PARTIAL | Space/landmark/custom classifications permit narrative identities. They lack a complete editable visual tool/material/prop set. A text classification is not an implemented visual object. |
| Industrial, modern, futuristic and mixed-era layouts | MISSING | Generic footprints can be described, but there is no supported coherent pack/tool workflow for these eras. |
| Destroyed, abandoned and ruined city appearances | NEEDS VISUAL REWORK | [Historical settlement system](worlds-historical-settlements.md) retains dated conditions and source appearance. Need visibly authored damage/ruin variants and materials; never destroy baseline buildings to represent a dated condition. |
| Building-to-interior linkage | EXISTING | Settlement editor and [floor navigation](../../src/features/worlds/interior-floors.tsx) reuse building/place IDs. Discoverability and round-trip workflow still belong in connected-scale acceptance. |

### Buildings, interiors, dungeons and caves

| Capability | Status | Repository evidence and remaining gap |
| --- | --- | --- |
| Rooms, editable walls, attached doors/windows and openings | EXISTING | [Interior source](../../src/features/worlds/interior.ts), [PlanEditor](../../src/features/worlds/plan-editor.tsx) and [scene](../../src/features/worlds/interior-scene.tsx). Preserve opening segment IDs and genuine gaps. |
| Modular curved walls and curved room boundaries | MISSING | Current wall/area models use point arrays; a round chamber is a polygon. Need versioned curve/modular junction support and attachment-safe transformations. |
| Floors and material palettes | NEEDS VISUAL REWORK | Plain/boards/tiles are basic current floor treatments. Need editable room/surface materials, convincing edges, wall thickness/joins and original top-down visual packs. |
| Doors, transitions, stairs, portals and multiple levels | EXISTING | Explicit transition links, [interior floors](../../src/features/worlds/interior-floors.tsx) and [dungeon levels](../../src/features/worlds/dungeon-levels.tsx). No automatic story or gameplay inference. |
| Furnishings and props | NEEDS VISUAL REWORK | Existing table/chair/bed/storage/fireplace/machinery and other symbols in InteriorScene are simple line marks. Retain semantic entities; add coherent detailed alternatives and modular room furnishing tools. |
| Caves, caverns, tunnels, corridors and environmental surfaces | PARTIAL | [Dungeon models](../../src/features/worlds/dungeon.ts) support authored passage appearance, cavern outlines, water/chasm/rubble/cliff/surface. Need natural cave edges/materials, ruins and junction finish. |
| Hazards, traps, secrets and private annotations | EXISTING | Dungeon entities distinguish ordinary/secret/G.O.D.-only and private notes. Preserve server filtering and ordinary export boundaries; presentation layers do not grant access. |
| Square, hex and gridless plans | EXISTING | Dungeon grid state and snap math support kind, size, offset and orientation. Physical scale calibration/export controls remain incomplete. |
| Visual light/shadow layers | MISSING | No creator-authored local light/shadow system in inspected models. Propose a bounded static visual layer only after materials; no line-of-sight engine, gameplay or server GPU. |

### Library, styles and professional output

| Capability | Status | Repository evidence and remaining gap |
| --- | --- | --- |
| Exact original asset/style revisions, provenance and lazy loading | EXISTING | [Catalog](../../src/features/worlds/island-assets.ts), [source validation/loading](../../src/features/worlds/island-artwork-source.ts), [0132](../../drizzle/0132_worlds_atlas_starter_library.sql). Keep all old pins and fail closed for missing revisions. |
| Professional visual coverage across all scales and eras | PARTIAL | UX-0A's bounded 14-subject candidate is one regional starter collection. Settlement/plan renderers do not yet use equivalent coordinated packs. Asset count is not the final quality gate. |
| Era/genre/environment/condition/style taxonomy and creator tags | PARTIAL | Built-in names/family/tags support basic filtering. No durable creator tag/library organization model. Avoid tagging recolors as genuine silhouette/footprint variety. |
| Creator-owned custom assets and imports | MISSING | Existing built-in SVG validation is not an upload workflow. Need ownership, rights declarations, sanitized original bytes, versioned derivatives, private delivery, quotas and export rights before import controls. |
| Same-visible-map PNG with credits and access recheck | EXISTING | [Exporter](../../src/features/worlds/cartography-export.ts) preserves source and rechecks authorization before download. Required attribution and private-source exclusion remain mandatory. |
| User resolution, paper size, print scale and tiled output | MISSING | [Export layout](../../src/features/worlds/map-export-layout.ts) fixes map pixels at 2000×1200 plus credits, with a 12 MB SVG bound. Higher output requires measured memory/work bounds, cancellation, print calibration and seam-free tiling. |
| Transparent / gridded / gridless export choices | PARTIAL | Visibility and existing scene/background determine current output. There is no consistent explicit export product across every scale with selectable transparency, grid and print scale. |
| Supported SVG and layered interchange | MISSING | SVG is an internal PNG rasterization step, not a supported download contract. Review safe embedded assets/fonts/credits and privacy first. Layered interchange needs a documented format and compatible versioned sources; do not promise arbitrary third-party native files. |

### Preservation and connected knowledge

| Capability | Status | Repository evidence and remaining gap |
| --- | --- | --- |
| Stable World/map/place IDs, source versus illustration, ownership/review | EXISTING | [Atlas service](../../src/features/worlds/atlas-service.ts), geographic services and schema. Keep ordinary/private filtering on the server and Administrator review explicit/read-only. |
| Linked world/region/city/building/interior/dungeon navigation | PARTIAL | [Workspace](../../src/features/worlds/atlas-workspace.tsx), [connections](../../src/features/worlds/atlas-connections.tsx), floors and levels exist. End-to-end authoring and return/arrival context must be made discoverable and tested across every scale. |
| Immutable historical maps, settlements, territories and connections | EXISTING | [Map states](../../src/features/worlds/map-state-service.ts) and [Living History acceptance](worlds-living-history-acceptance.md). Keep exact sources, explicit year coverage and branch pins; do not infer missing dates. |
| Dated interior/dungeon layout authoring | MISSING | Existing baseline plans do not establish dated room/layout coverage. Retain the D4/E requirements review; implementation needs its own approved brief. |
| Independent saves and recovery across scales | PARTIAL | Separate source/artwork/history boundaries exist; UX-0A adds real generic-map restoration. Specify and deliver equivalent plan/settlement recovery before claiming all-scale reliability. |
| Canon and gameplay boundaries | EXISTING | Current authorization and narrative-only contracts must be preserved. Future System Canon marking stays Administrator-only. No NPC/shop/campaign objects or VTT runtime are created by 2D map tools. |

## Proposed sequence for review

Bring forward the relevant **D4 connected creation and D5 professional 2D work**, split into complete increments. Names below are proposed review boundaries, not authorized passes. Only finish already-authorized UX-0A until the owner approves an amended sequence and a bounded next contract.

| Proposed checkpoint | Deliverable and dependencies | Concrete user-visible acceptance |
| --- | --- | --- |
| 0. Finish UX-0A | Preserve the working island foundation, old pins, 0132 and independent final art/technical gates. Resolve measured regressions; both reviewers approve the same exact SHA before inviting the owner. | Separate generated and drawn zero-World journeys, normal saves/reopen/revise/recovery/export, all starter subjects. This is a first island, not a complete professional Studio. |
| 1. Shared precise 2D editing | Integrate selection/multiselect, explicit copy/group identity rules, duplicate/mirror/rotate/scale handles, aligned guides/snaps and scoped undo into existing editors. Version any necessary new shape/group contracts additively. Start with a cross-scale vertical slice rather than a replacement editor. | Select mixed objects, group/mirror/duplicate a bounded composition, edit vertices precisely by mouse/touch/keyboard, undo and reopen with attachments and shared places correct. |
| 2. Materials, library packs and useful output foundation | Exact versioned materials/brush references, authored masks/edges, opacity/erase semantics, shared library taxonomy and lazy pack loading. Add print calibration, bounded high-resolution/transparent PNG and explicit grid choices. Creator imports are a separate bounded subincrement with rights/security review. | Use two genuinely different materials/brush sets, erase only selected paint/mask content, retain editable originals, export a legible calibrated print and transparent image with resource/cancellation proof. |
| 3. Professional regional/world cartography | Coastal edge tools, terrain/vegetation coverage, path/bridge/rail treatment, typography, legend/compass and physical/political design. Use existing geographic sources and vector generation; no height arrays or terrain solver. Depends on 1–2. | A novice creates two visibly different original regions, heavily revises coasts and materials, mixes natural vegetation, routes/labels them and exports at print size without developer coaching. |
| 4. Detailed city studio | Extend existing settlement editor with street/network assistance, editable blocks/lots/roof forms, waterfronts, civic/agricultural/fortified and industrial/modern structure packs. Manual override and selective assisted regeneration retain originals. Depends on 1–2; linked regional place workflow is part of the increment. | Draw and revise a distinctive detailed town and a modern/industrial counterpart. Create a visibly ruined/abandoned dated appearance while preserving the intact source and stable buildings. Open a selected building's floor plan and return. |
| 5. Detailed interior and dungeon studio | Extend PlanEditor, attachment-safe modular/curved walls, flooring/material/prop packs, cave/ruin edges, doors/windows/transitions and cross-level navigation. Static visual lighting can be a bounded later subincrement if measurements justify it. Depends on 1–2; reuses existing floor/level and secret models. | Furnish and heavily edit a multi-floor building and a cave/dungeon, including irregular rooms, attached doors, stairs/portal and private hazards. Export calibrated square, hex and gridless images; ordinary previews/exports omit secrets. |
| 6. Connected 2D acceptance | Finish D4's scale navigation/discoverability and D5's professional output/variety. Independently review the historical interior/dungeon-layout requirement and seek separate authorization for any new dated layout contract. | Unfamiliar creator completes linked world/region → city → building/interior → dungeon → return, reopens and revises all scales, checks alternate-era/ruined city appearance and useful print output. Evidence includes actual workflows, screenshots and rendered print-size exports. |
| 7. Geographic Data Library and progressive real sources | Retain this separate required checkpoint; it need not block purely fictional 2D editing. Exact-version shared dataset attachments, supported imports, progress/cancel/retry and regional precedence/NoData must work before real-source final acceptance. Existing import/raster/private storage is reused. | Create a fresh Earth from the website using genuine licensed datasets, add a manageable native 10 m ESA region and a second-region provisioning proof, safely retry interrupted work. No deleted-Earth restoration or per-World custom script substitute. |
| 8. Numerical terrain under a new bounded brief | Only after professional 2D is accepted, consider retained D3-B1 → B2 → C: numerical heights/units/NoData, changed-tile undo, deliberate coastline reconciliation and terrain-aware assistance. Keep immutable scientific originals separate from creator edits. | Separate numerical journeys verify actual values, resource bounds and explicit accept/cancel dependencies. Illustrated mountains never masquerade as heights. |
| 9. Geo E full integration | Complete the substantial fictional and real-source demonstrations with all Data Library, regional-source, connected-scale, professional 2D and authorized terrain dependencies implemented. E verifies finished features; it does not hide unfinished development. | Uncoached end-to-end fictional and real-geographic tasks, saves/recovery/privacy, linked dated context and usable exported images on desktop/touch/keyboard. |

This proposal preserves the Glass Sea completion commitment, surviving originals and owner approval before permanent new canon. It preserves rectangular Earth with authoritative spherical coordinates, low-cost hosting and scientific source accounting. Major application-wide Worlds cleanup and standalone Phases 7–9 remain after Geo E; later advanced topologies, 2.5D/3D/simulation and Comprehensive Historical Earth remain later enhancements to the same Studio.

## Suggested coherent packs and artistic acceptance

Plan packs around real authoring needs, not a fixed final inventory number. Each pack needs distinct silhouettes/footprints/materials, consistent scale/viewpoint/light/ink, safe originals and exact references. Review representative maps at intended viewing and print sizes before expansion.

| Pack group | Suggested coverage and variations |
| --- | --- |
| Regional natural geography | Coast/beach/cliff/shoal edges; rocky/rolling/alpine terrain; broadleaf/conifer/mixed/arid/tropical vegetation; marsh, snow, sand, stone, grass and water materials; settlement hierarchy and readable paths/cartographic furniture. |
| Historical/fantasy city | Regional roof/stone/timber materials; irregular and planned blocks; cottages, civic/religious/commercial buildings, markets, farms, walls, ports and forts; distinct settlements rather than many resized houses. |
| Industrial/modern/future city | Factories, rail/roads, warehouses, docks, apartments, civic buildings and futuristic modules with coherent footprints. Allow mixed-era neighborhoods and tags, without converting narrative classification into game mechanics. |
| Condition/ruin sets | Damage, foundations, rubble, abandoned roads, broken roofs/walls and overgrowth as authored variants/overlays over retained source identities. Not automatic random destruction of the baseline. |
| Interior architecture and furnishings | Modular walls/joins, doors/windows/stairs, stone/wood/tile/floor materials, domestic/civic/workshop/industrial room props and consistent top-down silhouettes. |
| Dungeon/cave/underground | Natural rock and constructed/ruined passages, floors/edges, openings, chasms/water/rubble and readable hazards/annotations; clear ordinary/private alternatives and square/hex/gridless finish. |

Art review targets the usability and visual standard described by the owner as Inkarnate/Wonderdraft-grade regional/city work and Dungeondraft-grade local plans. This is a comparative quality ambition, not a verified feature-parity claim. No competitor files, traced artwork, unlicensed packs or native file compatibility are assumed. A rights problem blocks the affected pack, not permission to substitute unknown-origin art.

## Cost, performance, data and implementation risks

Keep browser/CPU rendering, original vector sources, lazy exact-reference assets and bounded progressive/tiled derivatives. No required server GPU, paid external art/AI API, AI GitHub reviewer or infrastructure expansion is proposed. Asset storage, backups and bandwidth still have real costs; each pack/import/export brief must state its byte/CPU/memory/storage bounds and measure them on representative maps before approval.

Current limits are evidence to assess, not sufficient promises for professional cities: [generic draft](../../src/features/worlds/atlas.ts) supports 4000 settlement/plan shapes/entities and fixed 2000×1200 drawing coordinates; [cartography](../../src/features/worlds/cartography.ts) bounds drawings/marks/points; D2 has bounded editable sources; export currently has fixed pixels and a bounded serialized SVG. Do not silently raise limits, simplify originals or claim arbitrary city density. Prototype culling, hit testing, progressive/lazy artwork and tiled exports in owned fixtures; define useful completion/rejection behavior and justify any schema/API limit changes.

The existing UX-0A interactive budgets remain unchanged for its representative 100-drawing/1500-mark fixture: measure frame/brush responsiveness, desktop/touch exports, save/generation/cancel latency and memory, with the full library loaded. Later passes need explicit larger representative city/plan fixtures and agreed output dimensions; carrying over the same small island does not establish their performance. Keep the C3 256 MiB overview-release budget distinct from any future creator/import storage policy and separately budget regional native data.

Principal risks are curve/opening attachment compatibility; group copies accidentally duplicating or merging persistent places; texture/import rights and unsafe SVGs; heavy city scenes and high-resolution export memory; privacy leakage through layers, cached previews or downloads; losing drafts on linked-map navigation; and mistaking shared baseline plans for dated historical layouts. Address each in its bounded contract with normal website failure/retry/recovery proof and immutable-source checks.

No new database migration is selected or numbered by this proposal. Future contracts must inspect the then-current journal, add new versioned contracts/migrations where needed, rehearse populated upgrades and document recovery. Never rewrite 0132 or published predecessors. A code rollback after newer data is saved requires compatible readers/writers or separately authorized matched recovery; it is not a down-conversion exercise.

## Approval requested

Review whether this sequence and audit capture the owner's professional 2D-first outcome, especially the shared editing/material/output dependencies and the city/plan visual coverage. After owner/Ember agreement, record an explicit roadmap amendment and prepare **only the next bounded implementation contract**. Until then, this remains planning, with current UX-0A review gates intact and numerical heightmap work unstarted.

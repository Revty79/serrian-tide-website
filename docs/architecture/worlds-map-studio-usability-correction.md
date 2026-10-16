# Proposed Geo UX-0A: first-map workflow and presentation

Status: **proposal only; implementation is not authorized by this document**. Proposed from UX-0 `b40bccc2cced333832b55239c77bcb21d165bb95` and readiness checkpoint `98fe23858dec708faa57231163a3eb3f01c7e346`, following the owner's 2026-10-15 usability rejection. D3-B is blocked until the correction receives explicit owner usability acceptance; D3-B still requires its own bounded authorization afterward.

## Owner outcome

UX-0 is **not accepted for usability**. The owner reports that generated coastline content appeared on a black background, that most tools and their locations/purposes were unclear, and that the overall Map Maker required coaching. The viewport/scrolling correction and independent technical approval remain valid historical results; they do not establish discoverability or usability.

The smallest sensible follow-up is one complete first-map journey inside the existing Studio, with task-based tool access and a readable default canvas. A background-only fix or another help page would leave the reported workflow problem unresolved. This proposal does not rebuild the editor or add geography/terrain capabilities.

## Bounded result

A creator entering a supported fictional map can answer “what do I do first?”, generate or draw land, reshape a coastline, add illustrated terrain and a place marker/label, understand the separate saves, and reopen the result without developer coaching. The workflow is a freely selectable aid, not a mandatory wizard. Existing maps open normally; creators can return to the starting actions without resetting work.

### 1. Give the creator a starting point and a next action

Add a compact **Start here** area in the existing workspace with **Generate coastlines**, **Draw an island**, and **Edit existing land** when applicable. Keep the canvas and save/return actions available. Route these actions into the existing editors and handlers rather than creating a second authoring flow.

Show a short, optional route through **Create land → Shape the coast → Paint and draw → Add places and text → Save and reopen**. Each stage opens the appropriate current controls. After generating, distinguish **Unsaved preview** from the explicit action that adds/saves the generated geography, then make **Edit this coastline** an obvious next action. Required source associations use the current supported setup with plain-language explanations and deliberate confirmation; never silently choose or change a World's topology or write configuration merely on entry.

### 2. Organize existing tools by what the creator wants to do

| Working group | Visible actions and meaning | Existing system reused |
| --- | --- | --- |
| **Create land** | Generate coastlines or draw an island. Creates editable land shapes. | D3-A generation and D2 visual creation. |
| **Shape coastlines** | Select land, change its boundary, add/remove points, edit an opening or island component where supported. | D2 selection, multipart/ring editing and existing limits. |
| **Paint and draw** | Paint mountains/forests and draw illustrated rivers/roads. Explain that these are map illustrations and do not create numerical elevations or authoritative waterways. | Atlas artwork brushes, paths and Undo/Redo. |
| **Places and text** | Place a marker/symbol, add a name, and use existing saved-place links. A city symbol alone does not create a settlement or connected city map. | Current markers, symbols, labels and place-link controls. |

Keep **Map appearance**, **History**, **Connections** and **Export** clearly reachable as supporting tools. Show common actions as labelled choices, with a short visible purpose and the current click/tap/keyboard instruction, rather than relying on a long native picker or question-mark help. Keep exact coordinates, source versions, recipes and less common controls under clearly named detail sections; required fields, current limits, save actions and errors stay visible.

These groups describe Atlas/geographic work; specialized editors retain their type-appropriate tools. Existing illustrated-coast drawing, freehand and sculpting actions also keep clear destinations and an artwork description. Route edits to the selected content's original editor; never silently convert drawn coastlines into geographic sources or send them through the wrong save service.

Retain the existing illustrated-map generator and variations with an explicit description that they create a new drawn map. Do not present that operation as interchangeable with adding geographic land to the current map. All tools must have an accounted-for destination; organization changes cannot remove capabilities.

### 3. Fix default canvas presentation across the actual workflow

First reproduce the owner's black-background outcome in both existing generation paths and identify its actual cause. Static inspection identifies a candidate: the geographic Atlas path suppresses `CartographyScene`'s illustrated background, while its canvas uses the application's deep surface color; `GeographicScene` supplies source shapes and optional rasters rather than a general background. This is a hypothesis, not a reproduced diagnosis.

Give new or unspecified fictional-map presentation an intentional, readable land/water or map-paper treatment using the existing shared map/theme tokens and styles. It must work without elevation/classification assets and remain consistent through preview, saved editing, reopening and relevant PNG export. Preserve explicit creator styling, imported source colors, attribution, unknown/NoData meanings and each map type's intended background. Do not paint unknown real-source coverage as inferred water or alter scientific raster values/colors. No new art library or D5 asset work is included.

### 4. Make actions and saving understandable

Keep the current mode and selected object obvious. Use scope-specific labels such as **Save coastline changes** and **Save artwork**, with separate saved/unsaved feedback. A generated preview, accepted geography and painted artwork must be distinguishable. Retain the current explicit generation acceptance, source revision fields, preference saves and artwork save handlers; do not introduce a combined save, hidden autosave or a misleading global “all saved” message while another draft is dirty.

Switching groups must preserve active drafts, selections, undo histories and navigation protection. Explain a disabled action's real prerequisite and offer the existing next action. Existing failure/conflict/retry behavior and required validation remain available and understandable.

## Acceptance and stop condition

Observe the owner completing a goal such as: **“Make an island with a mountain illustration, a city marker and a name; change its coast; save it and reopen it.”** The product's own visible instructions may help; the developer does not direct clicks or explain internal source terminology. Separately check the manual Draw an island entry so generation is not the only understandable starting point.

Acceptance requires the owner to find the correct tools, distinguish geography edits from illustrations/content placement, understand what each save preserves, and judge the default result readable and comfortable. Recheck desktop, keyboard and phone/touch use, with physical-device acceptance distinguished from emulation. Capture before/after views of the initial state, generated coastline and edited/decorated result. Record friction and the owner's explicit decision; developer screenshots and automated checks cannot overturn another usability rejection.

Technical validation must retain the no-page-scroll workspace, stable mounted panels, coordinate registration, export composition, separate draft/save boundaries, save/reopen and failure/conflict recovery, ordinary/Admin privacy and historical context. Reuse read-only/disposable Earth and Glass Sea fixtures and verify existing settlement/interior/dungeon access and capabilities without redesigning their workshops. Run the required production build, TypeScript, lint and focused relevant regressions; expand testing only for a concrete regression risk. No full implementation or owner acceptance is claimed by this proposal.

## Boundaries

Reuse `MapStudio`, `StudioPanel`, `StudioActions`, current Atlas/geographic editors and generators, renderers, styles and shared field/page guidance. This is one focused presentation/workflow correction, not a new onboarding framework or application-wide Worlds cleanup.

No D3-B, numerical terrain/elevation generation, new geometry engine, dataset, asset library, schema migration, import platform, lost Earth recovery, persistent demonstration/canon edit, unrelated schema-verifier repair, Production contact, Docker change, shared-service restart, push or deployment. Any later implementation authorization should permit only isolated owned fixture writes and stop at a clean local review commit for independent technical review and explicit owner usability acceptance.

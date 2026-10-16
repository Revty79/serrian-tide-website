# Unified Atlas development roadmap and permanent Map Maker decisions

Owner decisions recorded 2026-10-14 during the C2/C3 deployment repair, from pushed C3 `14f9e2c24a17de16a37527a5f7e6de8aa2c2b58c`. These are permanent requirements for later separately authorized work. Recording them does not authorize Geo D/E implementation.

## Revised completion roadmap — adopted 2026-10-15

The owner, Cody and Ember reached architectural agreement on 2026-10-15. **Atlas inside Worlds becomes the complete professional 2D Map Studio during current Geo D/E.** Its first usable release must produce visually compelling, editable, interconnected maps through understandable creator workflows. Existing Atlas, geographic-source, generation, settlement, interior, dungeon, navigation and Living History systems remain the foundation. Extend and integrate them; do not rebuild Worlds, embed an entire external map application or create a disconnected replacement Studio.

This section is the definitive remaining roadmap, superseding earlier scope statements that deferred practical sculpting or professional 2D artwork to a separate Advanced Map Studio. Earlier pass authorizations, reports and technical receipts remain historical records. The owner authorized the [UX-0A contract](worlds-atlas-ux0a-contract.md), including its bounded validator migration, after Ember independently approved `2d656267137972644b75d0f492211f069150bfeb`. Implement only that scope, with migrations/writes restricted to newly owned isolated disposable targets. The early independent art-review gate remains mandatory before library expansion; later passes still require separate authorization. No push, Production contact/change, deployment, shared-service restart or persistent demonstration/canon edit is authorized. The reset DEV database is an expected empty starting point; do not recover the deleted Earth.

The locked sequence is **UX-0A → D3-B1 → D3-B2 → D3-C → Geographic Data Library → D4 → D5 → Geo E**. Split checkpoints only when necessary to keep complete working increments and record their scope; sequencing does not grant implementation permission.

### Five completion standards

Every remaining D3–E increment must meet all five standards, with evidence appropriate to its scope:

1. **Capability:** the tool performs its intended operation correctly.
2. **Discoverability:** a new creator can find the appropriate action without external instructions.
3. **Usability:** the creator can complete the task without developer coaching.
4. **Output quality:** the result meets the agreed cartographic standard and remains fully editable.
5. **Reliability:** saving, reopening, revising, undoing, recovery and navigation preserve the creator's work.

Automated regressions support technical evidence; owner hands-on acceptance and observation of an unfamiliar creator remain separate. Tooltips and field coverage alone do not establish usability. Lead with creator intentions such as Create a World Map, Generate a Continent, Draw an Island, Add Mountains and Rivers, Place a City, Create a Building Interior, Create a Dungeon and Import Real-World Geography. Teach geographic sources, raster data, coordinates, heightmaps, versions and provenance through contextual instructions, optional lessons using the actual editor and searchable reference material. Do not hide depth or invent simpler meanings. Preserve independent artwork, geography, generation, raster-preference and historical saves, combined navigation protection, privacy and exact version identities.

### Joint readiness before owner testing

The owner will not be asked to test an unfinished Atlas checkpoint. Cody must complete the approved scope, run technical/browser regressions, personally inspect the actual workflow/screenshots/exports, resolve blockers and supply a reviewable local commit with evidence. Ember independently reviews that exact commit, architecture, checks, preservation and visual/functional results. **Invite the owner only after both Cody and Ember explicitly approve initial testing readiness.** Record corrections and renewed review after material changes; neither approval may be inferred from tests or supplied on the other's behalf. This gate establishes readiness for initial human evaluation, not final usability or artistic acceptance. The owner's actual experience remains decisive. No deployment/shared-data permission follows from any review.

Map Maker workflow and language improvements belong inside each relevant increment. The later application-wide Worlds navigation/language cleanup retains its separate place after Geo E.

### Remaining sequence and human journeys

Pass names below are planning boundaries, not implementation authorization. Split further when needed to deliver independently usable and deployable increments.

| Order | Bounded result | Human acceptance journey |
| --- | --- | --- |
| Preparation prerequisite | Preserve prior paired backups/private originals. Reverify actual reset DEV identity and every migration hash/timestamp read-only. Keep empty-journey and populated-compatibility targets separate. See [current preparation](../operations/worlds-atlas-ux0a-preparation.md) and the [recovery procedure](../operations/worlds-map-maker-development-readiness.md). | Establish the actual starting state without assuming old Worlds/maps survive or restoring deleted Earth. |
| UX-0A — Create Your First Island | Deliver the [bounded contract](worlds-atlas-ux0a-contract.md): real zero-World/map website creation, geographic island generation/manual drawing/editing, readable style and geographic land masking, 12–16 versioned original illustrations, thumbnail palette, transforms/painting, illustrated river, persistent city/label, learning, separate saves/recovery and attractive PNG. Include the early internally approved finished-island sample and v1/v2 migration/compatibility. | Create, decorate, save, close, reopen and continue the same island through the real website. The owner rejected UX-0 usability; only joint technical readiness permits another owner invitation, followed by explicit human acceptance. |
| D3-B1 — Editable numerical terrain | Establish a separately authorized precise brief for Float32 heights with explicit units/reference/NoData, provisional 512-cell long edge with aspect ratio, browser-worker core brushes, changed-tile undo, immutable saves and separate creator modifications. Reuse raster storage/rendering and selectively adapt reviewed prototype algorithms. | Create/initialize actual terrain heights, raise/lower/smooth/flatten/set/sample them, save/reopen and undo with measured CPU/memory costs; illustrated mountains remain distinct. |
| D3-B2 — Sculpting and coastline reconciliation | Add practical ridge/valley tools and targeting/masks; explicitly preview sea-level/coastline changes. Resolve contour complexity versus current editing limits, retaining originals and manual artwork/waterways. No silent regeneration. | Sculpt a mountain range/valley, preview shoreline consequences, accept or cancel, recover/revise and preserve unrelated work. |
| D3-C — Coherent physical geography | Complete terrain-aware waterways/lakes and bounded climate/biome assistance, preserving editable results, source identities, recipes and manual work. Distinguish geographic vectors, numerical elevation, classification and illustrations. | Develop a believable landscape, inspect dependencies, override suggestions and regenerate only explicitly selected content. |
| Geographic Data Library/import checkpoint | Add reusable approved datasets, exact-version World attachments, supported additional-file imports and bounded recoverable processing with visible progress. Reuse existing import services and private storage. | Create a fresh Earth through the website, select genuine datasets, understand coverage/credits and safely retry an interrupted import. |
| D4 connected creation | Integrate existing regional, settlement, building, interior and dungeon editors and navigation. Complete finer regional-source selection here if not delivered in the data checkpoint. Explicitly review historical interior/dungeon layout requirements. | World → region → settlement → building → interior → dungeon → return, preserving place identities, drafts, arrivals and selected historical context. |
| D5 professional 2D output | Expand the versioned coordinated libraries/styles/materials/brushes across world/region, settlement/city, building/interior and dungeon maps, with genre/era flexibility, typography, print readability and bounded high-resolution exports. Professional visual direction starts in UX-0A; it is not deferred entirely to D5. | Make and revise attractive maps at each supported scale and export useful print/tabletop/VTT-style images without coupling to VTT runtime. |
| Geo E | Complete both substantial demonstrations and full acceptance using supported application workflows, including an unfamiliar creator's uncoached tasks and the historical-layout review. | Finish the fictional and real-geographic journeys, including failure/retry, save/reopen, connected navigation, exports, privacy and desktop/touch/keyboard use. |
| After Geo E | Major Worlds interface/navigation/language cleanup, then standalone Worlds Phases 7–9 in the previously approved order; later sophisticated advanced visualization/simulation/topologies and Comprehensive Historical Earth. | Validate broader Worlds independently, then extend the same Studio with advanced 2.5D/3D capabilities and comprehensive historical geography under separate briefs. |

### Geographic Data Library and real-source requirements

The minimum maintainable extension separates a centrally provisioned, curated immutable source library from World attachments and creator modifications. Retain common originals once where appropriate; World-specific places, permissions, selections and revisions remain separate. Existing content-addressed raster files are reusable, but current World-scoped vector originals do not yet constitute a shared vector library. Any necessary schema change needs a new numbered migration and explicit authorization; never rewrite finalized migrations.

The current small source-bundle importer and controlled CPU preparation are foundations, not a completed ordinary-creator worldwide importer. Generalize orchestration that currently targets the former Earth IDs. Define supported formats/references, coverage, licensing, validation, storage/CPU limits, progress, cancellation and safe retry/resumption. Do not expand this into an unrestricted GIS conversion platform, require creators to duplicate worldwide archives, or add expensive infrastructure without a demonstrated need. Prepared approved datasets can be provisioned once by an operator; creators must be able to establish and populate their Worlds through supported website actions without per-World custom scripts.

Current raster associations select one elevation and one classification source per map. Progressive selection of separate finer regional sources needs implementation, including registration, deterministic overlap/precedence, NoData, exact source/version identities and current authorization. Deliver this before Geo E, either in the data checkpoint or a bounded D4 increment. Native 10-metre ESA classification in at least one manageable region and reusable provisioning for another region remain mandatory. E verifies these working capabilities; it must not conceal unfinished import or regional-selection development. Classification resolution does not imply matching elevation, buildings or imagery.

### Initial-scope decisions and output quality

The agreed D3-B architecture is provisional pending its bounded implementation brief: Float32 numerical heights, explicit horizontal/vertical units/reference/registration and NoData, a 512-cell initial long edge preserving aspect ratio, browser-worker editing, changed-tile undo, immutable saved versions and separate creator modifications over immutable scientific originals. Assess older local heightmap brush/filter/preview algorithms; adapt them to Atlas rather than importing an incompatible editor, normalized-height assumptions or automatic spherical wrapping. A full array occupies only part of working memory; measure additional buffers, display, history and storage. Do not rebuild complete global raster bundles per stroke. Practical terrain sculpting belongs in B1/B2; sophisticated simulation remains later.

Before authorizing D3-B, define exact operations, generation/initialization, surface/topology support, CPU/memory/storage bounds, coastline reconciliation, failure/retry/conflict/draft recovery and acceptance examples. Retained D3-A coastlines and older decorative terrain generation are distinct capabilities. Preserve old seed/algorithm versions and never automatically regenerate saved manual work. Geographic vectors, numerical elevation, classification, artwork and persistent places remain technically distinct, visually integrated content categories. Geographic coastlines directly supply illustrated land masks; no duplicate manually maintained coast is required.

Assess current interactive geometry limits against the agreed journeys: 256 original vertices per geographic feature, bounded multipart/ring counts and restricted local spherical editing/generation. Unsupported originals remain intact and explicitly read-only. Address required gaps narrowly; do not claim unrestricted spherical editing or silently simplify originals to fit limits. Define expected cross-session/crash recovery and draft restoration before claiming reliability complete: a recovery JSON download alone does not establish a supported restore workflow.

D5 must deliver genuinely attractive professional 2D cartography, including settlements, interiors and dungeons. Polished tabletop/print/VTT-style output is the visual direction; previously rejected retro sprite-style artwork is not the target. Agree export resolution/readability, asset rights and runtime budgets with visual examples. This is a quality commitment within the initial Map Maker, not permission to defer meaningful quality to Advanced Map Studio or introduce VTT runtime integration.

### Demonstrations, preservation and later work

Recovery of the lost Earth database is canceled. Fresh Earth must be created with new application-generated identities using the finished application's own creator workflows and genuine, accurately registered, attributed sources. Historical recovery scripts or old DB imports cannot substitute for that demonstration. Surviving originals remain protected; this decision does not authorize deletion or reprovisioning of retained assets.

Glass Sea remains the substantial coherent fictional demonstration across D3–E. Preserve surviving Glass Island/exterior/opening, Copper Isles, Glass Channel, original planar reference, identities, versions, provenance, artwork and associations. Use disposable copies for compatibility and proposals. New permanent geography, settlements and lore require owner approval; do not replace the existing World or silently establish canon.

The commitments below remain in force: rectangular Earth display with authoritative spherical coordinates; shared source accounting and GPU-free low-cost hosting; native regional 10-metre classification before E; D4/E historical interior/dungeon-layout review; and D5 local-map visual assets. Dated layout authoring remains separately approved scope. After the complete initial professional 2D Studio, cleanup and Phases 7–9, retain later advanced topologies/projections, sophisticated simulation and 2.5D/3D enhancements to this same Studio, followed by Comprehensive Historical Earth. Worlds remains standalone; future VTT is a separate dashboard application.

## Progressive source resolution

Keep C3's worldwide ESA WorldCover 2021 approximately 594-metre categorical overview. Its resolution is a baseline, never an architectural ceiling. Do not replace it with the approximately 117-GB native worldwide archive.

The current 256-MiB C3 release-acceptance budget measures that retained overview foundation and its indexes; it is not a permanent platform/creator storage quota or a resolution ceiling. Later separately approved regional provisioning must state its additional storage and revise the operator acceptance policy deliberately, without silently dropping the shared overview or immutable history.

The source engine must select inexpensive coarse representations worldwide, finer available sources regionally, and genuine high-resolution sources locally where provisioned. Areas without finer coverage remain usable and state their available resolution. Zooming cannot invent source accuracy. Land-cover classification at 10 metres does not establish 10-metre elevation, building footprints or photographic imagery; those require independent sources or authored content.

Future source descriptors must distinguish immutable originals from derived display imagery and record spatial coverage, native cell size/units and registration, coordinate reference/topology, observation period, provenance, license, dataset/version identity and derivation method. Region and zoom selection must be generalizable across Worlds and surface references, rather than keyed to Earth names or one test location. Define deterministic overlap/precedence and NoData behavior, preserve exact version pins and privacy, and expose the actual source resolution separately from a generalized display level. New finer regional sources extend retained identities; they do not silently replace original samples or historical accounts.

## Initial Earth presentation

The initial unified Map Maker must open worldwide Earth in a normal **flat rectangular map presentation by default**, while retaining the existing alternate geographic projections as selectable options. Earth's spherical coordinate reference remains authoritative: choosing a flat display does not turn Earth into a planar World or change its source coordinates.

During D1, visually verify the intended full-world presentation in the actual application; do not assume today's projection label produces the desired appearance. Advanced interrupted, unfolded-globe and other sophisticated global projections belong to the later Advanced Map Studio, outside this initial integration.

## Geo D increments

The owner separately authorized [D3-A seeded authoritative geography](worlds-geo-d3a.md) from approved D2-B `c4c4f67cead798b1ef72660049c4ee39d3ce594e`. Generated coastlines must be real, fully editable geographic sources with retained deterministic recipes. Glass Sea expansion candidates remain disposable-copy proposals pending owner approval; terrain/waterways and D3-B or later work need separate authorization.

The owner separately authorized [D1-B previews and complete visible-map export](worlds-geo-d1b.md) from approved `2683a72d3c41d4c6fce0515d307f6a844536cfe1`. It preserves original sources and stops at local review; no later increment, push or deployment is authorized.

The owner separately authorized [D1-A unified Geographic Atlas foundation](worlds-geo-d1a.md) from approved `fcf911d24641436424c7acf766baba7cebe5b10c`. Its local implementation does not authorize D1-B or later increments, push or deployment.

| Pass | Required usable result |
| --- | --- |
| D1 — Unified Map Maker | Combine imported geographic vectors, C2 relief, C3 classifications and creator-authored Atlas content in the actual working Map Maker. Remove the confusing blank-Atlas separation. Deliver stable pan, deep zoom and navigation using available geographic detail. Resolve automatic screen jumping, including source-reader and workspace scrolling. |
| D2 — Visual editing | Direct visual creation and reshaping of fictional geography, with proper saving, undo/redo and retained history. |
| D3 — Procedural geography | Believable generated fictional geography whose saved source remains editable, rather than a locked image. |
| D4 — Connected scales | World → Continent/Region → Settlement/City → Building → Interior → Dungeon. Select a city on a larger map and open its associated detailed map. Preserve existing place/map identities, relationships and navigation. |
| D5 — Good-quality cartography | Attractive, readable 2D maps across these scales, including visual asset improvements for settlements, interiors and dungeons, without expensive artwork or dedicated server GPU infrastructure. |

Each increment must independently meet the [deployment standard](../operations/pass-deployment-standard.md); a later increment cannot be a prerequisite for its functionality. Existing Atlas editing, immutable histories, sources, shared baseline artwork and server-side ordinary/review filtering remain protected.

D4 and Geo E must explicitly review historical interior/dungeon layout changes across connected scales. Preserve the [Living History foundation](worlds-living-history-acceptance.md): shared baseline artwork and requested time context do not establish dated room/layout coverage. Review the requirements and separately approve any dated-layout authoring scope before implementation; this CI correction adds no such authoring.

## Geo E acceptance

Demonstrate an entire fictional map-building journey through the visual interface. Also demonstrate a real Earth journey from worldwide overview into a selected region, progressively selecting genuinely finer provisioned data, including **native 10-metre ESA land-cover classification in at least one manageable region**, and continued navigation into linked local maps. Retain accurate resolution, source identity and provenance throughout. Regional acquisition/provisioning must be reusable for another selected region, without a hardcoded demonstration location or downloading the native worldwide archive. Deep zoom and progressive detail belong in the initial D/E Map Maker, before Advanced Map Studio.

## Glass Sea completion across Geo D–E

Owner supplement recorded 2026-10-15: develop the existing Glass Sea into a substantial, coherent, usable and explorable fictional demonstration World. Earth demonstrates real geographic accuracy; Glass Sea demonstrates complete fictional world creation through the actual creator interface. Preserve Glass Island and its enclosed opening, multipart Copper Isles, Glass Channel, the original planar surface, every source identity/version/provenance, Atlas artwork and map association. Do not replace the World or silently establish new canon.

| Phase | Glass Sea commitment |
|---|---|
| D2-B | Use isolated/disposable copies of the existing geometry as a primary acceptance case. Visually edit Glass Island's exterior/opening and individual Copper Isles, retain the other parts, save immutable revisions and recover originals. Preserve Glass Channel and its original surface relationship. No persistent Glass Sea or DEV edits are authorized. |
| D3 | Use the completed procedural tools to develop believable geography, terrain, waterways, regions and other geographic features. |
| D4 | Build representative connected regions, settlements, buildings, interiors and dungeons through the established hierarchy. Retain the D4/E review of historical interior/dungeon layout changes. |
| D5 | Develop artistic map presentation with the completed cartographic tools and assets, including the planned settlement/interior/dungeon visual improvements. |
| E | Complete and validate the substantial fictional World alongside the separate Earth geographic acceptance work. Demonstrate creator workflows rather than hidden developer shortcuts. |

Propose new geography, settlements and lore for owner approval before treating them as established Glass Sea content. Each later phase and persistent data write still needs its own authorization. This supplement does not authorize D3–E implementation during D2-B. Complete planned Map Maker/Worlds development before the postponed interface cleanup, main Worlds navigation redesign and application-wide language overhaul; D2-B controls stay inside Atlas.

## Shared foundations and accounting

Retain authoritative common geographic foundations once and reuse them when appropriate. Store creator modifications separately from immutable shared data. Campaign use must not automatically duplicate large datasets. Make shared platform bytes distinguishable from creator-owned bytes so future subscription/storage accounting can be added without redesigning the engine. This decision does not authorize subscriptions, quotas, payments, Campaign runtime integration or broader sharing permissions.

## Later advanced Studio work

Later Advanced Map Studio work is a separately authorized enhancement program for this same Atlas Studio after the complete professional 2D release, major Worlds cleanup and standalone Worlds Phases 7–9. It does not create a disconnected replacement or defer practical height editing/professional 2D artwork out of Geo D/E. Retain sophisticated procedural/simulation capabilities, advanced 2.5D/3D exploration and spherical, flat, hollow, cylindrical, polyhedral, ring-shaped and custom topologies without assuming Earth-like Worlds. Comprehensive Historical Earth remains the later final historical-geography project. Earlier references to a separate standalone mapping project are superseded by this architectural agreement; Worlds remains its own standalone worldbuilding application.

Worlds remains standalone. Future VTT integration is a separate dashboard application, outside Worlds and Paths. This repair implements none of these future controls, sources or commercial systems.


## Focused Map Studio before D3-B

The owner technically approved D3-A `72150c1efc3524080a286890305f011697aea40c` and directed Geo UX-0 next. The [focused workspace](worlds-map-studio.md) retains the existing editors and engines while replacing whole-World page scrolling with persistent tools, a viewport canvas and independently scrollable contextual settings. This scoped presentation pass does not begin the application-wide Worlds navigation/language overhaul, D3-B or later Geo phases. Existing Glass Sea D-E commitments, D4/E historical-layout review and D5 settlement/interior/dungeon visual assets remain retained.

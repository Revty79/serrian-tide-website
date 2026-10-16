# Atlas UX-0A implementation contract: Create Your First Island

Agreement recorded 2026-10-15 following the owner's direction and Cody/Ember architectural agreement. **Final bounded brief awaiting owner implementation authorization.** Documentation and read-only preparation are authorized; implementation, asset production, migrations and owner testing have not begun. The [unified roadmap](worlds-map-maker-decisions.md#revised-completion-roadmap--adopted-2026-10-15) is authoritative. This contract supersedes the smaller [initial usability proposal](worlds-map-studio-usability-correction.md).

## 1. Outcome and scope

Deliver one complete, attractive and editable island-making workflow in the existing Atlas Map Studio. The creator starts with no Worlds or maps, creates a World and map through the website, generates or manually draws geographic land, reshapes it, decorates it through a visual palette, adds an illustrated river and persistent city with a label, saves, closes, reopens, continues editing and exports a PNG. The product must explain the operation and its next action without developer-directed clicks.

The initial professional 2D Studio is part of current Geo D/E, not deferred to Advanced Map Studio. UX-0A establishes a finished regional visual style and a working small library; it does not claim the complete D5 library or cross-scale professional output is already delivered.

Reuse `MapStudio`, stable mounted `StudioPanel`/`StudioActions`, AtlasWorkspace, D2 geographic authoring, D3-A generation, artwork strokes/paths, persistent places, existing save/version services, export, shared guidance, authorization and Living History. No replacement editor, wholesale embedded map application or application-wide Worlds redesign.

## 2. Actual website journey

| Step | Required behavior and evidence |
| --- | --- |
| Create the World | From the normal Worlds registry, create a World with the existing creator workshop and select its intended timeline/context. A zero-World registry must offer an understandable starting action. Repair only demonstrated blockers on this path; do not redesign other workshops. |
| Create the map | Enter Atlas and choose Create map. Explain name, purpose and scale; choose a general regional land/terrain map. Offer a recommended fictional planar frame with visible bounds 0–2000 by 0–1200 map units. Deliberate creator confirmation creates/associates the surface through existing services. Do not silently choose a World topology or change an existing surface. Existing spherical and other supported choices remain available through their current controls. |
| Create land | Show equally discoverable Generate an island and Draw an island actions. Generation reuses the versioned D3-A single-island preset, editable seed/settings, cancelable preview and explicit additive acceptance. Manual drawing reuses D2, closes a valid geographic ring and saves a geographic source. Both paths create real geographic sources, not a second decorative coastline. |
| Shape the coast | After acceptance, select the saved source and make Edit coastline obvious. Support selecting/moving/adding/removing vertices, component and enclosed-opening selection, undo/redo and an explanation of applicable limits. Preserve source IDs, originals, notes, provenance and immutable revisions. |
| Decorate | Open the thumbnail palette, choose artwork, see a placement/brush preview and place or paint it. Select and revise it afterward. Show the geographic land mask and the difference between changing land and decorating it. |
| Add water and a city | Draw and edit an illustrated river. Place a city using the Place city action, create or explicitly reuse its persistent location, name it and add a linked editable label. Reopening and renaming retain the same place identity. The marker does not create a detailed settlement map, gameplay town or terrain-aware river. |
| Save and reopen | Show every independent dirty domain and its corresponding save action. Save the appropriate content, return to the library, close the editor, reload the browser, reopen the same map and continue editing. Verify source, drawing and place identities, artwork/style references and revision changes. |
| Export | Export the same visible composition as PNG, including the intended background, coastline, artwork, city, labels and required credits. The editable source remains available in Atlas. |

The complete generated-island route and a separate manual-island route are mandatory. A prepared map, imported demonstration database, per-World developer script or replay of the deleted Earth cannot establish this journey. Test infrastructure may initialize schema and test access; all World/map/content creation for this acceptance must occur through the normal website.

## 3. Canvas, geography and tool behavior

### Readable presentation and the black-background correction

Reproduce and record both geographic generation and legacy illustrated generation paths before correcting presentation. Source inspection identifies the geographic renderer handoff: the artwork scene's background is suppressed when a geographic frame exists, and a source-only scene exposes the deep workspace surface. Verify the actual behavior rather than treating that explanation as complete browser evidence.

New UX-0A maps use the versioned island style described below. Land and water must be intentional and legible before elevation/classification exists, during preview, after acceptance, editing, reopening and export. Separate the map's persisted artistic style from application-brand colors through shared semantic cartographic tokens. Preserve UI theme controls, existing explicit map styles and intentional night maps. Unknown scientific coverage and NoData must not be painted as inferred water. Scientific elevation/classification colors and values remain unchanged.

### One geographic land boundary

Derive a shared, transient land mask from the currently authorized geographic features and exact viewing/draft context. It must use original coordinate adapters and correct Polygon/MultiPolygon ring semantics, union separate land components and exclude enclosed openings. An island inside an opening can contribute land through its own source. Geographic authoring previews may update the visible mask, but cannot alter unrelated saved sources.

Use that mask for land styling and illustrated terrain clipping in the editor, exploration/thumbnail composition where applicable, reopening and visible PNG export. A painted stroke remains editable across the boundary; clipping its visible marks must not delete its retained stroke points. Preserve terrain illustration inside land and keep it out of water/openings by default. Placement previews explain when a terrain stamp will be clipped. City placement outside known land receives a clear confirmation rather than creating hidden content.

Do not persist a duplicate manually maintained coast or convert geographic sources into artwork geometry. Reuse one composition/mask adapter across the affected views, with the same source access checks and historical version selection. Keep legacy artwork-only clipping behavior for legacy maps. No global Earth mask download or change to scientific source semantics is included.

### Understandable tools with retained depth

Use labeled task groups: Create land; Edit geography; Paint artwork; Places and labels. Keep navigation, Layers/appearance, History, Connections, Save and recovery, and Export reachable. Numerical elevation is explained in reference material as a distinct capability; do not expose a nonfunctional sculpting control.

The current tool, selected object/type, next canvas action and dirty state stay visible. Selecting a source opens geographic editing; selecting a stroke, symbol or label opens its artwork inspector. Disabled actions explain their actual prerequisite and provide the next supported action. Account for every existing tool, including legacy illustrated generation/variations and decorative coastline tools; those retain clearly described destinations and their original saves. Do not silently convert legacy artwork into authoritative geography.

Retain stable panels, gesture cancellation, combined navigation guards, keyboard access, coordinate/point fields, source versions, recipes, provenance, historical context and privacy. Coordinate references, sources and versions should be taught, not hidden or renamed into inaccurate concepts.

## 4. Starter artwork and the early quality gate

### Initial art direction

Create original illustrated ink-and-wash regional cartography: warm light paper/land, restrained blue water, readable dark ink, muted natural woodland and stone colors, consistent lighting/viewpoint, fine linework, controlled hatching and coherent shadows. Assets must combine convincingly at intended map scale, remain clear in grayscale and avoid conspicuous repeated stamp grids. They must not resemble retro sprites, UI icons or temporary geometric placeholders.

Use the shared appearance system: scoped semantic map-paper/water/land/ink/material roles express the persisted artistic style, while chrome, controls, validation and selection retain shared UI roles. This is an extension of the shared system, not a page-specific independent palette. Changes to site branding must not invalidate the approved cartographic composition.

### Bounded library

Target **14 original illustrated assets/variants** within the agreed 12–16 range:

| Family | Count | Initial subjects | Supported use |
| --- | --- | --- | --- |
| Mountains | 3 | Rounded, craggy and snow-capped peaks | Place and paint/scatter |
| Hills | 2 | Low and rocky hills | Place and paint/scatter |
| Woodland | 4 | Broadleaf tree/grove and conifer tree/grove | Place and paint/scatter |
| Settlements | 4 | Village, city, port and castle markers | Individual placement with persistent-place semantics |
| Wetland | 1 | Reed/marsh illustration | Place and paint/scatter |

Background treatment, illustrated river/road paths, labels and thumbnails are coordinated style components; they do not inflate the 14-asset count. Internal review may exchange subjects within the same scope and 12–16 bound, with a recorded reason. Broader genres/eras/scales arrive through later libraries without changing old references.

### Internal visual sample before expansion

First produce one finished-island visual sample using a small representative subset: background/coast treatment, mountain group, woodland, river, city and labels. Cody and Ember explicitly review composition, style coherence, overlap, label hierarchy, print legibility and actual-size thumbnail readability before expanding the remaining artwork. Record the reviewed sample, included asset/style revisions and both decisions. A standalone art-direction sample is allowed at this early gate; it does not substitute for the subsequent real application journey. Do not ask the owner to diagnose an unfinished editor or treat this internal approval as owner artistic acceptance.

### Palette and editing

Provide thumbnails with plain-language names, family filters and a small search by name/tag. Show selected asset and cursor/brush footprint before placement. Place all appropriate assets; paint/scatter terrain assets with size, spacing/density and deterministic variation controls. Settlement markers are individually placed, not sprayed into anonymous towns.

Placed artwork supports select, move, scale, rotate, layer ordering and archive/restore with undo. Painted groups retain source strokes, seed and exact asset references; support moving/reshaping the stroke, changing size/spacing/density, choosing its asset set and undoing those changes. A painted group is edited as a stroke, not thousands of independent database rows. Require finite bounds and helpful validation for transformations. No full vector-illustration editor, arbitrary asset upload, marketplace or hundreds of new assets is included.

## 5. Storage, provenance and migration decision

### Chosen representation

Use a small committed, validated built-in catalog and immutable original SVG artwork/derived thumbnails. No remotely hotlinked asset dependency, new asset server or new user-asset table is needed. Proposed catalog identity is `serrian-atlas-island`, revision 1; style identity is `island-ink-wash`, revision 1.

Each manifest entry records stable asset ID/revision, library ID/revision, checksum, renderer contract/version, intrinsic viewbox, anchor, default scale, family/tags (including intended scale/genre/era where meaningful), supported placement/brush behavior, author, creation method, source/derivation and distribution/export rights. Review SVGs for self-contained rendering and no scripts, external references or embedded unsafe content. Keep original production files and license/provenance records with the release. Record AI assistance honestly if used; it does not replace rights review or artistic approval. Do not copy or trace competitor artwork or assume map-export permission permits distributing an asset library. Unresolved rights block release of the affected artwork.

Extend the existing JSON contracts with explicit **version 2** variants while retaining version 1 readers/renderers:

- Placed asset: existing drawing identity/archival/place association plus point, scale, rotation, semantic decoration/place role and `assetRef` containing library ID/revision and asset ID/revision.
- Painted stroke: retained drawing identity, editable points, bounded size/spacing/density and seed, plus an ordered bounded `assetRefs` set. Versioned scatter logic produces the same marks after reopening.
- Presentation: existing layer visibility/locking and grid, plus a pinned style reference. Preserve version 1 presentation unchanged. Paths and labels can keep their existing source format when no extension is required.

Validate references against the shipped catalog on the server, derive their semantic role there and enforce persistent-place requirements. Structural database validation must not hardcode the complete future asset inventory, so compatible new catalog entries do not require schema changes solely to add names. Historical payloads and source copies preserve exact references. Library updates append revisions; they never replace files behind a saved reference or automatically restyle existing maps. Cache keys include asset/style/renderer revision and relevant appearance inputs. Missing references produce an explicit retained-data warning, never a substitute illustration falsely presented as the original.

### Required migration: now identified

**One additive validator migration is required.** Current `world_atlas_drawing_valid` and `world_atlas_presentation_valid` in migration 0104 reject new JSON keys and all versions other than 1. JSONB storage alone does not permit the proposed extension. Current historical payload validators delegate to these functions, so their compatibility is also part of the migration rehearsal.

After implementation authorization, add the next numbered migration, provisionally **0132_worlds_atlas_starter_library.sql**, after 0131. Recheck numbering against intervening work. Preserve or equivalently retain the exact version 1 validation branches; add strictly validated version 2 branches. Preserve identity, place, bounds, finite-number, archival and payload constraints. Revalidate affected CHECK constraints over populated legacy data. Check historical wrapper functions and change them only if necessary for the declared v2 payloads. Include the required migration journal/snapshot and tests. Do not rewrite 0104, 0124–0126, 0130 or 0131, delete ledger rows, weaken validation generally or bulk-rewrite saved drawings/history.

No SQL file is generated or applied in this documentation pass. No numerical-raster schema change, new dataset, wholesale geography migration or persistent DEV operation belongs to UX-0A.

Fresh-install and populated-upgrade rehearsals must prove v1 and v2 read/save, immutable historical copies, invalid-payload rejection and ordinary/Admin authorization. Populate upgrade fixtures through a prior approved application version with fresh test identities, plus narrowly scoped retained source fixtures where appropriate. Keep that compatibility target separate from the empty-World acceptance target. Do not restore the deleted Earth World/database, including as a demonstration or acceptance shortcut. Any separate full-backup recovery rehearsal needs its own authorization.

### Deployment and rollback contract

UX-0A remains a separately deployable complete increment. Ship catalog/artwork, application validation/renderers and the ordered migration together. Controlled deployment, if separately authorized later, requires exact target/ledger verification, matched database/private-asset backup, migration rehearsal, build, migration application and authenticated smoke checks. No push or deployment is authorized here.

New readers must read v1 data. **Older code is not assumed able to read/write v2 maps.** After v2 saves, a code-only rollback can fail or discard new metadata. Prefer a reviewed compatible forward fix; any rollback needs v2-compatible readers/writers or stopped writes and a separately authorized matched recovery with post-backup reconciliation. Do not down-convert originals or history to make old code work.

## 6. Saving, history, undo and genuine recovery

Keep separate geographic source, generation-acceptance, artwork/map, geographic presentation/raster preference and historical saves. A compact status area lists each dirty domain and its action. Use clear scoped names such as Save coastline and Save map artwork, with pending/success/failure feedback. Do not imply these operations are one transaction or show All saved while another domain is dirty. Explicit generation acceptance remains additive and idempotent under retry.

Changes to an existing coastline append source revisions. Artwork retains its established map revision and immutable baseline/historical source behavior; do not promise a new per-click permanent artwork history. Show revision information and saved comparisons without silently replacing the active draft. Switching tools, opening help or closing a lesson preserves drafts, pending field edits, selection and undo/redo. Undo is scoped to the indicated editor/domain; the UI explains its boundary. Closing/navigation guards cover all dirty domains.

Failed requests retain work. Conflicts display the saved revision, offer comparison and deliberate rebase/recovery, and retain other independent drafts. Preserve request IDs across ambiguous retry, avoid duplicate accepted generations/places and verify server success rather than clearing dirty state on request dispatch.

Provide a real generic-map recovery path in Save and recovery:

1. A validated versioned recovery-bundle download and restore UI for the live owned World/map/context, including all supported island-flow dirty domains and their base revisions/request IDs. Restore stages drafts for review; it does not silently save or resurrect deleted Worlds/maps. Retain source identities and reject a different owner/context or incompatible source format.
2. An explicitly enabled **Keep a recovery draft on this device** option, with visible checkpoint status. Store bounded local recovery data under user/World/map/timeline keys after completed operations; no server autosave is implied. Offer recovery after browser interruption. Clear checkpoints on successful domain save or deliberate discard as appropriate. Recheck current authorization and base revisions before restoration; no draft from another logged-in user may be offered.
3. A maximum 4-MiB recovery envelope for this bounded workflow, visible size/storage errors, and a supported download fallback. Never claim an unapplied field or in-progress gesture is checkpointed unless it is captured; indicate Apply/finish needed for the next checkpoint. Local storage failure must not erase the live draft or claim it is protected.

Test download/restore and enabled local crash recovery through the website, including conflict and partial-save cases. With local recovery disabled, explain that unsaved edits are not guaranteed after a crash; the manual recovery bundle remains usable. A download without a tested restore path is not acceptance evidence.

## 7. Integrated learning

Deliver all three mechanisms with UX-0A:

- Visible contextual instructions: purpose, actual pointer/touch/keyboard operation, affected content and save boundary. Reuse shared GuidedField/PageGuidance patterns and native accessible dialogs.
- Optional Create Your First Island lesson inside the real editor. It opens actual tools and checks real drafts/saved records; it does not inject a completed island or use a fake editor. It can be skipped, closed and resumed without changing work, supports generated and manual branches and ends with save/reopen/export. Lesson completion must not imply owner acceptance.
- Searchable reference material reachable from Studio help. Include starting from no Worlds, geographic surfaces/coordinates/sources/versions, elevation versus illustration, asset placement/painting/editing, illustrated rivers, persistent places, independent saves, undo/recovery and export. Provide short worked examples and links to the actual applicable tools. Search includes titles, tool names and plain-language synonyms. Advanced controls remain documented and reachable. Explain later elevation concepts without advertising unfinished sculpting controls.

Each subsequent phase delivers its corresponding instructions, reference and lessons with its tools. No separate learning application or general learning-platform framework is included.

## 8. Explicit acceptance criteria and evidence

All cells are required gates, not completed claims. Cody records the exact release and environment, inspects the evidence personally and resolves blocking failures before requesting Ember's readiness review.

| Area | Pass condition | Required evidence |
| --- | --- | --- |
| Functional journey | Both generated and manually drawn geographic islands complete every step in section 2 from a zero-World/map start. No developer content scripts. Reopen after browser reload and edit again. | Recorded UI steps/browser tests, initial zero counts, final source/map/place identities and revisions, before/after screenshots, exported PNG. |
| Land mask | Mainland, offshore islands, an enclosed opening and a separate island inside an opening compose correctly. Preview/edit/save/reopen/export agree; painted source strokes are retained. | Focused geometry/renderer tests plus actual application/export crops and coordinate-registration checks. |
| Artwork quality | 12–16 finished original assets, readable thumbnails and coherent complete island at actual size; no placeholder appearance, broken overlaps, illegible labels or visible scatter seams. | Early visual sample with Cody/Ember decisions; final desktop/phone application screenshots and PNG personally inspected by both. Actual owner visual acceptance remains pending. |
| Discoverability/usability readiness | Start/next actions, tool purposes, selected content and independent saves are clear; lesson and reference operate through genuine actions. Keyboard users can reach tools, palette, help, save and return. | Cody's complete click/tap/keyboard walkthrough, Ember's independent assessment and a recorded friction/correction log. This is readiness evidence, not a claim that human novice usability has already passed. |
| Reliability | Undo/redo, canceled gestures/previews, independent partial saves, network failures, idempotent retries, conflicts, draft download/restore, enabled local crash recovery and reopen retain the intended work and identities. | Fault-injection browser/service tests in disposable targets, actual recovery UI proof and before/after comparisons. No unexplained lost draft or duplicate source/place. |
| Compatibility/privacy | All prior map kinds, v1 art/styles, immutable historical sources, coordinates, selected timeline/year, ordinary filtering and explicit read-only Admin review remain correct. No protected sources/labels/assets leak through masks, previews or export. | Populated migration rehearsal, affected Geo/Living History and specialized-editor regressions, role-specific actual browser checks. |
| Release health | Production build, TypeScript, lint, relevant unit/service/browser checks and migration validation pass or pre-existing exceptions are explicitly resolved/agreed; no known blocking failure is hidden. | Commands, results, logs and exact commit. Existing schema-checker discrepancies are separate recorded risks, not silently repaired or reported as passing. |

### Performance and storage gates

Use a reproducible representative scene of one primary island with an opening, two offshore sources, up to 100 artwork drawings and 1,500 derived terrain marks, including river/city/labels. Record hardware, browser, viewport, cache state and CPU throttle. Check existing maximum limits separately for safe completion/rejection; retain 512 drawings, 16,384 drawing points, 6,000 terrain marks and current D2 limits unless a separately reviewed change is necessary. Never trim retained originals to pass a benchmark.

- Desktop 1440×900 and 1024×768; touch-browser layouts 390×844 and 360×800 plus tablet/landscape. Preserve the viewport workspace, reachability with the on-screen keyboard and no new whole-page scrolling. Native touch events and physical-device evidence are identified separately; emulation is not claimed as physical-phone proof.
- Representative warm pan/zoom: at least 30 rendered frames/second during a defined five-second gesture; pointer/brush feedback p95 at most 100 ms desktop and 150 ms touch-browser at the documented 6× CPU throttle. Capture at least 100 input updates. Failures require correction or explicit amended budget approval before readiness.
- Local production-mode generation preview/cancel, save acknowledgment and PNG export: each completes within five seconds on desktop and ten seconds in the documented throttled touch-browser case. Local recovery checkpoint finishes within two seconds of a completed operation, or visibly reports failure. Report cold-start/network observations separately; do not present localhost timing as hosted latency.
- Initial starter-library plus thumbnails: at most 5 MiB compressed transfer, lazy-load unused material, no unbounded external downloads. Representative browser JS heap growth above the loaded empty Studio: at most 64 MiB after repeated edit/undo/reopen cycles; record total process memory separately where measurable. JS heap is not total browser memory. No continuing growth or idle re-fetch/rebuild loop.
- Measure committed artwork bytes, map/revision/recovery-envelope sizes, retained-history growth, server RSS and CPU work. No dedicated server GPU, paid service, worldwide raster rebuild or new large dataset. These bounds describe this scene/library, not permanent platform quotas or a reduction of scientific data resolution.

## 9. Test targets and preservation

The owner reset DEV. [Current preparation](../operations/worlds-atlas-ux0a-preparation.md) records a read-only identity/ledger check, not continued validity of old contents. Reverify before future access. Shared DEV is read-only for this pass; all future acceptance writes and migrations belong to newly owned isolated disposable PostgreSQL/application/private-storage targets with explicit identities and ports. Do not start/restart shared services or Docker.

Create the acceptance World through the normal website in an initially zero-World/map target. Keep separate populated compatibility/recovery targets for v1/history and retained geographic-source/Glass Sea preservation, using fresh test identities or existing isolated fixtures without restoring the deleted Earth. Existing backup dumps and raster bundles are protected retained originals, not supplies for seeding the first-island journey. Never overwrite backups, restore the deleted Earth World/database, reprovision retained scientific assets, create permanent Glass Sea canon or contact Production. Record source and target identity and preservation checks; stop task-owned processes after testing.

## 10. Joint readiness, owner acceptance and stop conditions

1. **Authorization gate, now:** finish this documentation/preparation pass at a clean local review commit. Obtain explicit owner authorization for this bounded brief, including its planned validator migration, before implementation or asset production.
2. **Internal art gate:** Cody and Ember approve the early finished-island visual sample before artwork expansion. Record exact revisions and corrections; this is not owner testing or final artistic acceptance.
3. **Cody completion gate:** implement the authorized scope; run technical and real browser journeys; personally inspect actual screenshots/exports; resolve known blockers; provide local review commit, migration/recovery report and indexed evidence. A prepared fixture cannot stand in for the empty-World journey.
4. **Ember independent gate:** review that exact commit, source/architecture, checks, screenshots, preservation, costs and demonstrated workflow. Record explicit approval for initial testing readiness or concrete corrections. Material subsequent changes require renewed review; prior approval cannot be carried silently to another commit.
5. **Owner invitation gate:** only after both Cody and Ember explicitly agree to initial testing readiness may the owner be invited to open/test Atlas. No unfinished workflow is handed to the owner to diagnose. Cody cannot infer Ember's approval from automated tests or send a message on Ember's behalf; use the owner's supplied independent review or its repository record.
6. **Human acceptance gate:** the owner's actual uncoached experience decides final usability and visual quality. Record accepted, accepted with explicit conditions, or changes requested. An unfamiliar creator assessment remains part of the roadmap; do not relabel technical review as that observation. D3-B still needs UX-0A acceptance and its own bounded authorization.

The implementation completion report includes commit, delivered scope, visual approvals, commands/results, empty-start journey, screenshots/PNG, performance/storage evidence, ordered migrations, configuration/provisioning, rollback/recovery, preservation, unresolved risks, Cody readiness, Ember readiness and owner acceptance status. Push/deployment are separate explicit permissions.

## 11. Exclusions and remaining risks

No numerical heightmap authoring, terrain-aware hydrology, climate simulation, new geographic dataset/import platform, native regional 10-metre acquisition, full D5 library, D4 connected-scale redesign, dated interior/dungeon-layout authoring, advanced visualization, VTT runtime integration or broad Worlds cleanup. Retain existing access to those established editors and source readers without unfinished controls.

No unresolved architectural choice blocks authorizing this contract. Remaining implementation risks are artistic quality, mask behavior across projections/holes, strict v1/v2 validator/history compatibility, recovery completeness and phone/resource limits. Each has a gate above. The migration is required and ungenerated. The early art sample and all runtime results remain pending. Discovered need for new tables, extra migrations, altered identity/history semantics, changed performance bounds or expanded scope must be returned as a concrete brief amendment before that work begins. Documentation approval is not implementation or owner-testing approval.

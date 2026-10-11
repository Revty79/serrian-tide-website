# Worlds Phase 4A architecture and approved checkpoints

Starting checkpoint: `9bf7391d3ac3f7c7f2390d0c8f1dbae5cebc4480`. The creator approved two independently deployable checkpoints on 2026-10-10. This document records the architecture before substantial implementation. Phase 4A is complete only after both checkpoints pass verification.

## Inspection findings

- `world.owner_id`, `worldReadAccess`, `worldWriteTransaction` and `worldRequest` provide the private World boundary, owner write lock, role checks, explicit read-only Administrator review, CSRF and no-store responses. Campaign membership does not provide World permission.
- Bridge A's `world_history_version` and `world_history_head` preserve immutable entry/era interpretations and direct-parent pins. Their checks and DTOs explicitly distinguish entries from eras; they cannot safely hold a species, culture or relationship. Extend the same preservation strategy with separate entity versions; retain existing history tables and data unchanged.
- `changeTimeline` copies parent history references in its World-locked transaction. Entity source pins must be captured in that same transaction. Existing alternatives need deliberate adoption of newly available parent entity sources; future parent edits must never silently replace accepted sources.
- Chronology already distinguishes known years, approximate years, uncertain windows, durations and undated accounts. Saved reckonings and calendar sources retain their notation. Reuse those distinctions and validators; do not convert an approximate date into a known one or infer calendar days.
- Bridge B associates stable integer Campaign IDs with UUID World/timeline/context IDs. Its independent authoring selection supplies context, not entity existence or a live clock. New entity writes require no Campaign and change no association or runtime state.
- Atlas's `world_geography` is the stable place identity, with same-World keys and retained archive/restore. Geographic distribution must reference that identity rather than map pixels or mutable names. Settlement, building, floor and dungeon identities already extend it.
- Heavens `races` and `creatures` use integer mechanical identities, attributes, anatomy, Forms and Evolution definitions. World species remain independently authored UUID identities. There is no Heavens FK, mechanical conversion or automatic record creation in 4A.
- Account deletion explicitly inventories ownership/attribution FKs. New authorship references must be retained and added to that inventory. Existing Campaign deletion remains separate.
- The committed migration journal ends at 0113. Read-only target-ledger verification refused the configured non-loopback/non-`_dev` target before connecting. Current DEV and Production ledgers remain unverified. No target writes are authorized.

## Checkpoint 4A-1: identities, origins and historical relationships

Deliver complete creation, editing, search, related-record navigation, archive/restore, conflict recovery and desktop/native-phone behavior for:

- Races/species: optional physical form, biology, propagation, development, aging, adaptations, habitats, supernatural qualities, traits, variations and transformation accounts. Classification and descriptions are creator-authored. None requires Earth biology or mechanics.
- Peoples: independent identity, heritage, distinctions, ways of life and historical development. A people is not forced to represent one species or culture.
- Origin accounts: independent contradictory narratives, multiple subjects/progenitors, attribution, perspective, reliability, recorded/planned status and protected knowledge. Unknown creators retain honest authored references. No accepted origin is automatically chosen.
- Relationships: independent, named accounts with custom relationship types and multiple participants/roles. Ancestry can have several progenitors, and authored paradoxes are permitted. There is no single biological parent field or automatic hierarchy.
- Historical context: existing chronology/source notation, links to immutable event/era versions, primary/alternate/nested authoring, explicit inheritance decisions, deliberate parent-source adoption and local interpretations.

The first checkpoint must work without any editor or migration from 4A-2. It does not claim complete Phase 4A acceptance or the full Ashborne civilization/population scenario.

## Checkpoint 4A-2: cultures, societies, languages and populations

The second checkpoint remains required, with complete domain editors and relational authoring for:

- Cultures: values, customs, social practices, rituals, arts, education, family/community traditions, magic/technology, beliefs, historical exchange and divisions; overlapping peoples/species/civilizations.
- Civilizations: multiple peoples/cultures, languages, traditions, knowledge, economic practices, achievements, expansion, migration, decline and renewal without requiring a nation-state or single homeland.
- Languages: communication method, writing/representation, users, origins, related languages, dialects, adoption, transformation, extinction and revival without requiring constructed grammar.
- Populations/communities: optional estimates, habitats, adaptations, overlapping geographic presence and migration using stable Atlas places. Numbers and routes remain absent unless authored.
- Beliefs/traditions/practices: meaningful reusable identities or structured records, including which groups attribute/support/conflict with an account.
- The complete Ashborne acceptance example, geographic/history links and populated performance/regression checks across both checkpoints.

These add domain records to the same identity/version/reference interfaces. They do not replace 4A-1 identities, sources or relationships. Governments, individuals, organizations, cosmology resolution, redacted publication and living-history simulation retain their assigned future passes.

## Required checkpoint 4A-H: universal History index and Atlas authoring retrofit

The subsequent architectural addenda require this checkpoint before Phase 4B, alongside completion of 4A-2. The historical authority remains the existing History entry and its immutable Bridge A versions. There is no second event database. Structured milestones entered through 4A-1 entity editors already create/update these entries atomically, preserve their event identity and chronology, and support bidirectional navigation. Manual events can link several World entities or existing Atlas places.

Version-bound entity links carry a structured entity category and original event relationship/type, with same-World FKs and searchable indexes. Optional event prominence belongs to the authored historical source, separately from fictional reliability. 4A-H implements the shared index controls for text, entity category, custom event type, era/date range and author-controlled visual prominence. Hiding a category is a view operation and never deletes, archives or rewrites history. Interactive event labels retain full-account reading and navigation to all linked entities.

In 4A-1, `world_history_version_entity` addresses either the common lore identity or the existing Atlas geography through a same-World FK. The category is derived from the validated entity family/place classification, not supplied by the browser. Custom types remain free authored text. These links are copied with each new canonical History version; changing a relationship appends a History version rather than mutating an old binding. A later parent participant that is absent in an existing branch opens in its original authoring timeline, without silently adopting it into that branch. A pinned historical reference opens its exact immutable original account independently of current History edits.

4A-H also adds actual milestone authoring to the existing islands, towns, settlements, buildings and other Atlas editors. Existing places/maps retain their identities and source geometry. A dated founding updates its linked History record; old undated places acquire no invented date. This retrofit spans independent geography, settlement and map save contracts, so it is separated from entity-version implementation to keep both deployable and reviewable. Existing Atlas authoring remains fully usable until that checkpoint; its automated dated milestones are not claimed as completed in 4A-1.

Future phases 4B/4C/4D/5 reuse this contract. Phase 6B consumes the historical source rather than requiring duplicate authoring. No living-state simulation, changing borders or evolving map engine is implemented in these checkpoints.

## Persistent identities and distinct domain records

A small identity registry holds only the immutable World address, entity family, origin timeline and creation attribution/request identity. It supplies one same-World FK target for multi-participant relationships and future phases. It is not a universal descriptive entity table.

Species, peoples, origins and relationships have separate typed version tables with their actual domain fields. Cultures, civilizations, languages and communities will likewise have distinct domain tables. Common version headers hold provenance, timeline, historical context, reliability, visibility and lifecycle; domain content stays in the corresponding typed table. Custom sections supplement these records, with stable section keys and protected flags. They do not store reference IDs in unvalidated JSON.

Relations and origin participants use structured, version-bound rows. Each participant references exactly one same-World identity or an explicitly unresolved authored reference, with a creator-defined role and account. Multiple participants are permitted. Event/era references pin the existing immutable historical version with its same-World identity; they do not copy the event into another narrative or automatically adopt it into a branch.

Names are display text, never join keys. Identically named beings remain possible. Create retries use a separate request UUID and normalized input comparison, preventing accidental duplicate identities. Branch edits append another state against the same identity.

The first checkpoint supports 2,000 retained identities per World, 100 participants and historical-source references per entity version, 40 custom sections and 40 retained milestones per entity, and 100 participating entities per event. Lists render 100 records at a time; family and name search precede pagination. Existing-history pickers render 60 matching sources at a time. Reference queries load bounded identity metadata, not the complete narratives of every connected record. These explicit limits may be extended by later deployable increments without replacing identities or source versions.

## Historical-state strategy

Each timeline selects one immutable source version per identity through an independently revisioned head. Versions include their typed content, participants, custom sections and historical references. SQL must reject updates/deletion of committed source rows and changes to immutable identity/provenance fields. Composite keys reject cross-World identity, timeline, dating, calendar and history references.

The context describes an authored account, not a simulated complete life or civilization. Undated accounts remain undated. Conservative automatic inheritance accepts only explicitly bounded, recorded sources wholly before divergence; approximate, unknown or crossing contexts require deliberate review. Sources at/after divergence stay outside effective records until explicitly adopted. Reliability does not become fictional truth through inheritance.

Branch creation pins parent entity sources atomically with existing history pins. Local interpretations never alter primary or descendant versions. New parent records require explicit adoption; changed parent sources require a revision/version checked acceptance. Pending/excluded records remain visible as source-review records and cannot be edited as effective facts until deliberately included. Exclusion expresses absence of an accepted account; it must not fabricate a known extinction date.

Archive/restore appends timeline-local versions and retains identities/references. Archived referenced records remain readable as retained references. Revisions are checked before any change, including unchanged stale submissions. World-locked writes serialize related mutations; queries read only the chosen timeline/version and bounded reference metadata, without recursive graph expansion.

## Protected knowledge and future interfaces

All reads require World authorization, including guessed IDs and any ordinary-knowledge preview. Owner authoring and explicitly authorized Administrator review may inspect protected knowledge; review cannot mutate. An ordinary preview must filter accounts, private notes, sections and references on the server before serialization. No Player/public route is introduced, and Campaign links grant no access.

Future 4B/4C/4D entities add their own domain records and use existing identity/participant/history interfaces. Authored references to an unimplemented god, Creature or cosmic entity retain their text and uncertainty until a later authorized resolution; they create no fabricated entity or mechanical link. Platform canon and fictional reliability remain independent; no System Canon controls are added here.

Future NPC links must explicitly validate an eligible Bridge B Campaign context. Live World/timeline position, travel, dates, encounters, inventories and VTT journeys remain separate runtime systems. No Phase 4B editor is introduced during 4A.

## Verification and release boundaries

Each checkpoint requires fresh and populated upgrade/reapplication rehearsals, meaningful entity/relationship fixtures, owner/foreign G.O.D./Player/anonymous/Admin-review checks, server-redaction assertions, stale two-tab writes, unsaved/failed drafts and real desktop/native-phone interactions. Reuse and rerun Bridge A/B, calendar, Atlas/settlement/interior/dungeon, Campaign, mechanical Race/Creature, Forms/Evolution/Character/combat, authentication and lifecycle regressions as appropriate.

Measure bounded list/detail/reference reads, source review, relationship navigation and representative writes. Do not load every related complete record or traverse networks recursively. Verify production build, TypeScript, lint, migrations and whitespace before the local completion commit. Screenshots are optional and captured only for diagnosis.

Migration `0114_worlds_peoples_origins` contains 4A-1's additive tables, visibility default for existing entries, same-World constraints, source immutability and ownership/audit guards. The later checkpoints receive their own additive migrations. Finalized SQL/snapshots through 0113 remain unchanged. No new environment/service requirement is needed. Deployment requires separate authorization, verified target/ledger, backup, committed migration ordering and controlled activation. Code rollback does not reverse schema or retained data; preserve source versions and pause incompatible Worlds writes/deletion workflows. Older History writers do not copy the new entity bindings or protected metadata into new versions. Never drop entities or rewrite ledger entries as rollback.

Status: architecture and split approved; runtime implementation and verification results are recorded in each checkpoint's completion report. Current allocation remaining is not exposed by this environment and must not be guessed.

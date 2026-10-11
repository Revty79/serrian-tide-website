# Worlds Bridge B: Campaign associations

Bridge B extends the approved Bridge A checkpoint `520ee91fa6b6e7d525a15ac82d80cc972891b185`. Worlds retains private ownership, authored history, immutable versions, signed canonical years and shared geography. Heavens retains authoritative Campaign records, rules, membership, Characters, NPCs and runtime. This is a narrow relationship-management interface between those systems.

## Relationships and independent designations

`world_campaign_context` gives each explicitly authored `(campaign_id, world_id, timeline_id)` relationship a stable UUID, creator attribution, optional canonical historical starting year, independent revision and retained removal timestamp. Campaign IDs remain serial integers; World/timeline IDs remain text UUIDs. A composite timeline/World foreign key rejects mixed-World contexts. A unique relationship includes removed records, so restoration preserves identity instead of duplicating links.

One World can contain many Campaign contexts. One Campaign can have many timelines in the same World and contexts in several Worlds now. Associations duplicate neither Campaigns nor Worlds. They do not copy history or imply physical travel.

`world_campaign_home` stores a nullable Campaign-wide reference to one of that Campaign's contexts, with its own revision. It is optional and is set explicitly. A composite FK prevents assigning another Campaign's context as home. First associations leave home blank; association creation never replaces an existing home.

`world_authoring_selection` independently stores one creator's currently selected context, nullable canonical viewing year and revision. It does not belong to Campaign runtime or to a browser viewport. No Campaign is selected arbitrarily. The creator explicitly selects one association; two first selections and stale unchanged submissions are revision protected. Browsing another timeline does not update this selection, home, starting year or gameplay. A small indexed summary query displays the difference throughout the World workspace.

Historical starting year, authoring viewing year and a future live Campaign date are separate concepts. Blank remains absent, including when another date exists; zero and negative years retain their canonical meanings. Dates before an alternative's divergence are allowed. Input/display can use existing World reckonings without changing the stored canonical year. No calendar day, historical event, precise conversion or live clock is inferred.

`world_campaign_context_change` records append-only association creation, year edits, removal, restoration and home changes, retaining author attribution and snapshots. No authoring selection is recorded as a fictional journey or historical event.

## Ownership and transaction boundary

The association service validates a current G.O.D./Administrator role plus ownership of both the World and Campaign by the acting creator. Administrator rights in ordinary Campaign settings are broader; those rights cannot mutate another creator's World through this service. Explicit World Administrator review is read-only. Campaign settings for a foreign Administrator show the ownership limitation without exposing World names, IDs or dates. Campaign membership, Player roles, guessed IDs and anonymous access do not provide World access.

All public mutations pass through the existing private no-store/CSRF-protected Worlds HTTP boundary. Commands validate mixed identifier types, reference combinations, revisions and years server-side. SQL reinforces same-World references, creator ownership at link/restore, immutable association identities, one-step revision advancement, home Campaign identity, selected creator identity, available designation targets and append-only audit history.

Every relationship mutation locks Campaign first, then affected owned Worlds in sorted ID order, then home/context/preference rows. Creation locks all selected Campaigns in integer ID order before inserting the new World. World/timeline lifecycle already locks the World; Campaign lifecycle locks Campaign. These paths do not acquire those locks in the opposite order. Selected authoring preferences serialize independently after those locks, including initial revision-zero creation. Transactions reject stale unchanged submissions before making writes.

World creation, classification validation, automatic Primary History and initial associations commit together. Invalid, archived, foreign or stale Campaign choices roll back the entire operation, including primary and audit rows. Creating with no Campaign remains the normal valid path. Choices expose only active owned Campaign ID/name/update-token metadata; no membership, Character, NPC or inventory data is loaded.

Reads retain unavailable relationships while masking a Campaign's current private name when ownership stops matching. A new Campaign owner cannot discover the previous creator's private World contexts. Restoration or deliberate replacement requires eligibility again; no sharing capability is created.

## Lifecycle and interfaces

World creation offers optional multi-Campaign selection and refreshes stale metadata without losing the World draft. In a saved World, Campaigns manages relationships with the selected primary, alternate or nested timeline. It supports dates, an explicit home, a separate authoring context, deliberate removal and restoration. Revision failures retain editors and offer explicit latest-version reload. Native dialogs, accessible field guidance, before-unload warnings, tab/timeline/World-switch guards and guarded links protect drafts. Deep links from Campaign settings use stable IDs with `tab=campaigns` and `timeline`; Back/Forward and reload preserve navigation without writing preferences.

Archiving any parent retains relationships, dates, homes and selected authoring IDs, displaying those contexts as unavailable. A valid restore makes retained active links available again. Removed relationships require deliberate restoration. Removing a home requires an explicit clear or an eligible replacement in the same transaction; the interface can designate another home before removal or explicitly clear the current home. Neither removal nor archival silently selects another authoring context.

Linked Campaigns cannot be permanently purged, including after soft removal, because their stable relationship/audit history belongs to standalone Worlds. The existing lifecycle preview reports a blocking dependency and continues to allow archive. Unlinked Campaign deletion remains unchanged. The Campaign delete closure and User deletion inventory explicitly classify these retained references; no cascade destroys World history.

## Limits and future use

Supported limits are 2,000 eligible Campaign choices, 2,000 retained contexts per World or Campaign, and 100 initial Campaign choices per World creation. Removed records count toward retention limits. Queries join only minimal metadata and remain constant in number; relationship lists render incrementally and support search. The authoring summary queries only the selected context. Large-list pagination beyond these limits is future work.

Phase 4A can reference a context identity together with stable World/timeline/Campaign IDs after validating current availability and ownership. Authored peoples, factions and individuals must derive their existence from timeline state, not association presence. Future NPC linking must require an explicit selected eligible Campaign. No Phase 4 editor or NPC action is implemented here.

Future VTT current location/timeline/date, transitions, journeys and return destinations belong in separate runtime tables. They may reference these identities without replacing them. Bridge B creates no live travel, clock, scene, encounter, chronicle, Character/NPC/inventory movement or playable mechanics integration.

## Migration, activation and recovery

Additive migration `0113_worlds_campaign_associations.sql` follows immutable 0112 and creates four initially empty tables plus guards/indexes. It does not alter or renumber existing Campaign, World, timeline, history, calendar or Atlas records. Rehearsal covers populated 0112 with existing alternate and nested immutable interpretations, upgrade/reapplication, fresh installation and all existing World projections.

Under separate release authorization, verify the exact database identity and ledger, protect a verified backup and running release, pause conflicting writes, apply all pending committed migrations in journal order using `npx drizzle-kit migrate`, stage/verify the production build, activate and smoke-test owned/foreign roles, creation with and without Campaigns, dates, home, authoring selection and archived retention. No new package, environment variable or service is required.

Reverting code does not undo these relationships or migration ledger entries. Bridge A understands the unchanged World/history model, but its Campaign/account deletion previews lack the new retained references: pause permanent deletion or retain the compatible lifecycle checks during rollback. The database restrictive FKs prevent destructive deletion. Releases before Bridge A are incompatible with alternate-history writers/readers and require the protections documented in [Branching history](worlds-branching-history.md). Prefer a reviewed forward fix. Backup recovery requires stopped writers, preservation of later edits for reconciliation, verified restoration and matching code/ledger; do not drop relationships or remove ledger rows to simulate a rollback.

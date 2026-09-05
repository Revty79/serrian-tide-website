# Entity lifecycle and deletion

This document is the lifecycle authority for persistent Serrian Tide game and
content records. Archive is the normal reversible action. Permanent deletion is
reserved for records whose ownership and complete dependency graph have been
verified on the server inside the deleting transaction.

Authentication accounts, credentials, migration history, canonical/system
references, lifecycle audit events, and standalone combat/roll history are not
ordinary deletable content.

## Common policy

The shared lifecycle API is implemented by
`src/features/lifecycle/lifecycle-service.ts` and exposed through the async
Server Actions in `src/app/heavens/lifecycle-actions.ts`:

- `previewLifecycleEntity(target)`
- `archiveLifecycleEntity(target, reason?)`
- `restoreLifecycleEntity(target)`
- `permanentlyDeleteLifecycleEntity(target, confirmationName?)`

The client supplies only an entity kind, numeric ID, optional archive reason,
and typed confirmation. Ownership, roles, record classification, names, and
dependency counts are always re-read from the database. Archive, restore, and
delete lock the target and write an audit event in the same transaction.

The lifecycle roots are Campaign, player Character, Race NPC, Creature NPC,
Race, Creature, Skill, Item, and Derived Ability. Every root stores
`archived_at`, `archived_by_user_id`, and `archive_reason`. Active/archive
indexes support normal lists and explicit Archived views.

Shared-library classification is deliberately conservative:

- A user-created record has a non-null `created_by_user_id` and a null
  `source_system`.
- A record with `source_system` is canonical/imported/system content.
- A record without a creator is ambiguous legacy/system content.
- Canonical/imported/system and ambiguous records cannot be archived, restored,
  or permanently deleted through ordinary lifecycle actions, even by an
  administrator.

Archive never severs references. Normal creation and runtime selectors exclude
archived roots, while historical readers continue resolving them.

## Authorization matrix

| Actor | Own Campaign, PC, or NPC | Another owner's Campaign, PC, or NPC | Own user-created shared root | Another creator's shared root | Protected shared root |
| --- | --- | --- | --- | --- | --- |
| Owner G.O.D. | Archive, restore, and guarded delete | Denied | Archive, restore, and guarded delete | Denied | Denied |
| Other G.O.D. | Not applicable | Denied | Not applicable | Denied | Denied |
| Player | Denied | Denied | Denied | Denied | Denied |
| Administrator | Archive, restore, and guarded delete | Archive, restore, and guarded delete | Archive, restore, and guarded delete | Archive, restore, and guarded delete | Denied |

`requireGodOrAdminAccessContext()` resolves the authenticated user and current
roles from the database. Rendering a control is never treated as authorization.

## Root lifecycle matrix

| Entity and table | Creation/edit path and owner | Archive and restore | Permanent deletion, confirmation, and dependencies | Audit and historical behavior |
| --- | --- | --- | --- | --- |
| Campaign — `campaign` | `/heavens/campaigns/new`; edited in `/heavens/campaigns`; owned by `created_by_user_id` | Owner or administrator. Campaign-scoped Chat rooms are archived/restored in the same transaction. Normal Heavens, Realms, Chat, Tabletop, Character, and NPC selectors exclude archived Campaigns. | Owner or administrator; exact Campaign name required. Preview includes memberships, PCs, both NPC kinds, inventory, instances, currencies/holdings, authorized-library links, Sessions, Scenes, Encounters, runtime/combat, checks, rulings, firearm data, rolls, Derived Ability history, and Chat. The explicit child-before-parent plan removes only the locked Campaign's graph. | Durable deletion event retains actor, Campaign ID/name, owner, time, and dependency snapshot. Users and shared Race/Creature/Skill/Item/Derived Ability roots survive. Campaign Chat is part of the deleted Campaign world. |
| Player Character — `campaign_character` with `is_npc=false` | `/heavens` creates for a Campaign member; `/realms/characters/[id]` edits; Campaign creator owns lifecycle | Owner or administrator. Archived PCs stay available to authorized archive/history views but are excluded from normal Realms and new Tabletop enrollment. | Owner or administrator. Character-owned profile, attributes, inventory, instances, equipment, currency, spells, active state, and history-free firearm state are removable. Deletion blocks on Session roster, Encounter participant, Initiative/action, timed-effect, reward, roll, called-check, high-low, ruling, firearm history, or Derived Ability ownership/use/recharge rows. | Audit persists. Campaign, membership, player account, and shared masters survive. Existing `deleteCharacterAsGod` remains PC-only; the common service supplies parity and administrator behavior. |
| Race NPC — `campaign_character` with `is_npc=true`, `npc_kind='race'` | NPC archive creation; Campaign creator owns it; detailed editing reuses the Character aggregate | Owner or administrator. Archived NPCs appear only in Archived NPC view and cannot enter new runtime contexts. | Same complete Character preview/blockers as PCs. Only the NPC aggregate is deleted. | Audit persists. Campaign, controller membership/user, selected Race, Skills, Items, and Derived Abilities survive. |
| Creature NPC — same root plus `campaign_creature_npc_profile` | NPC archive creation from a master Creature snapshot; Campaign creator owns it; detailed editor is `/heavens/npcs/[id]` | Same as Race NPC | Same Character blockers. Snapshot profile is owned child data. | Audit persists. Master Creature is never mutated or deleted; the stored NPC snapshot disappears only with the NPC aggregate. |
| Race — `races` | `/heavens/races`; user-created records owned by creator | Creator or administrator, only for explicitly user-created records. Archived Races cannot be newly allowed or selected. | Delete only when no Campaign allowlist or Character/Race-NPC profile references exist. Attribute caps, movement modes, and Race Skill grants are owned child rows. | Audit persists. Existing historical Character references resolve an archived Race. Imported/canonical/ambiguous Race is protected. |
| Creature — `creatures` | `/heavens/creatures`, including derived-Creature creation; user-created records owned by creator | Creator or administrator for user-created roots. Archived Creatures cannot create new NPCs or temporary encounter participants. | Delete only when no derived child Creature, Creature-NPC snapshot, temporary Encounter participant, or Item property reference exists. Definition variants, attributes, movement, HP, attacks, abilities, defenses, Skills, and uses are owned children. | Audit persists. Existing NPC snapshots and Encounter history continue resolving archived masters. Protected Creature roots cannot be mutated through lifecycle actions. |
| Skill — `skill` | `/heavens/skills`; user-created records owned by creator | Creator or administrator for user-created roots. Archive preserves the recursive graph for historical display but excludes new allocations/links. | Delete only with zero parent edges, child edges, Race grants, Creature links, Character allocations, saved Character spell documents or other `spell-construction` Skill extensions naming it as `frameworkSkillId`, Derived Ability requirements, weapon/defense mappings, and called-check history. The target Skill's own extensions are owned children. Both Skill relationship FKs and Race-grant Skill FK use `RESTRICT`. | Audit persists; recursive topology and spell-framework references cannot be silently detached. Protected Skills cannot be lifecycle-mutated. |
| Item — `items` | `/heavens/equipment` and `/heavens/inventory`; both are catalog scopes over one Item root; variants are created from the same workspace | Creator or administrator for user-created roots. Archived Items cannot be newly authorized/acquired but existing ownership and history resolve. | Delete only with zero child variants, ammunition links, related Item properties, Campaign authorizations, Character stacks/instances/overrides, weapon governance, firearm runtime/history, active or historical Item-sourced Conditions/Modifiers, pending Item action sources, Item effect plans, and defending-Item reaction history. Runtime/effect/weapon/armor/property/tag rows are owned children. | Audit persists. Campaigns, Characters, and Item-linked history are never silently rewritten. Protected Items cannot be lifecycle-mutated. |
| Derived Ability — `derived_ability` | `/heavens/derived-abilities`; user-created records owned by creator | Creator or administrator for user-created roots. Archived abilities cannot be newly learned/allowed but existing ownership/runtime remains readable. | Delete only with zero inbound Derived Ability prerequisites, legacy Campaign links, Character ownership, use, and recharge records. Requirement/condition/cost/limit/effect/trigger definitions are owned children. | Audit persists. Canonical/imported/ambiguous abilities are protected. Historical ownership/use is never silently removed by deleting the shared definition. |
| Campaign Session — `campaign_session` | `/heavens/tabletop`; owned through the parent Campaign | `complete` is the domain archive transition and `reopen` is restore. The Campaign owner or administrator may start, complete, or reopen after a locked server authorization check. | Planned-only. Server preview counts roster, Scenes, Encounters, participants, Initiative, actions/reactions/effects, rewards, Rolls/checks/rulings, firearm records, and Derived Ability uses. Preparation-only descendants may cascade; any non-planned child or runtime/history row blocks deletion. | Complete records an `archive` audit, reopen records `restore`, and deletion records `delete`, all with the locked dependency snapshot. Completed Session history remains readable. |
| Scene — `campaign_session_scene` | Created within a Session in `/heavens/tabletop`; owned through the parent Campaign | Same domain complete/reopen mapping and owner-or-administrator authorization. Parent Session state remains authoritative. | Planned-only while the parent is not completed. Scene members and planned Encounter preparation may cascade. Active/completed Encounters and all runtime/history references block deletion. | Audit snapshots retain Campaign, owner, Scene name/status, actor, action, and dependencies. Completing or reopening never erases Encounter or Character state. |
| Encounter — `campaign_session_encounter` | Created within a Scene in `/heavens/tabletop`; owned through the parent Campaign | Same domain complete/reopen mapping and owner-or-administrator authorization. Completion continues through authoritative closeout; reopen preserves rewards and history. | Planned-only while parent Session and Scene permit preparation. Participant preparation may cascade. Initiative, action/reaction/effect, duration, reward, Roll/check/ruling, firearm, or Derived Ability history blocks deletion. | Both completion entry points write one `archive` lifecycle audit in their transaction. Reopen writes `restore`; guarded deletion writes `delete`. Historical runtime rows are never erased by ordinary root deletion. |

## Campaign-owned child/configuration records

| Record | Lifecycle decision |
| --- | --- |
| Campaign membership — `campaign_player` | Association only: add/remove, never user-account deletion. Removal must be blocked while **any** Campaign Character (PC or NPC) uses the composite membership key; counting only PCs can cascade-delete NPCs. |
| Campaign currencies — `campaign_derived_currency` | Campaign-owned authoring child. Detach/delete only when no Character holding references it; it is deleted with the whole Campaign. A future standalone currency archive control may use the same parent policy if required. |
| Allowed systems, Races, Items, tags, and legacy Derived Abilities | Explicit attach/detach configuration managed by the Campaign editor; no separate global archive control. Detaching never deletes the shared master. |
| Character profile, attributes, Skills, inventory stacks, exact instances, equipment, spells, active health/mana/effects, and Creature snapshot | Owned aggregate children, managed through Character/NPC editors. They have no independent global lifecycle. |
| Item profiles, firing modes, armor, effects, properties, tags, and weapon Skill mappings | Item-owned definition children. Explicit governance mapping removal remains separate where restrictive references require it. |
| Race caps, movement, and Skill grants | Race-owned definition children. Skill masters survive Race deletion. |
| Creature variants/stat blocks/abilities/effects | Creature-owned definition children. A derived Creature represented by a separate `creatures` root is not a child row and blocks parent deletion. |
| Derived Ability requirements, costs, conditions, limits, effects, and triggers | Definition children. An inbound prerequisite from another root blocks deletion. |

## Tabletop and historical roots

Campaign Sessions, Scenes, and Encounters already have the domain lifecycle
`planned`, `active`, and `completed`, with an explicit reopen transition.
Completed is historical, not a physical `archived_at` flag. For audit parity,
completion maps to lifecycle action `archive`, reopening maps to `restore`, and
planned-root permanent deletion maps to `delete`. Every mutation resolves the
actor's current G.O.D./administrator roles from the database, locks and reloads
the root, verifies Campaign ownership or administrator override, and records
the audit in the same transaction. Delete dialogs obtain their counts and
blockers from `previewTabletopLifecycleEntity`; deletion repeats that preview
after locking and applies the central production safety gate at the service
boundary. Start, complete, reopen, and delete controls all open an accessible
confirmation dialog that presents the server-resolved entity, Campaign,
ownership, dependency, and consequence context before mutation.

The Tabletop page admits both G.O.D. and administrator roles through a
database-resolved access context. A Campaign's G.O.D. retains its authoring and
runtime controls. An administrator can select any active Campaign and receives
a read-only authoring/runtime view with the Session, Scene, and Encounter
lifecycle controls still available. Permanent deletion remains visually
separated as the destructive operation. Session and Encounter completion retain
their existing closeout review before the lifecycle confirmation, while Scene
completion and every start/reopen action use the same preview-backed confirmation
boundary. Every path still performs the same locked authorization/dependency
recheck and writes its lifecycle audit inside the transaction.

Roster members, scene members, encounter participants, Initiative, pending
actions, declarations, reactions, effect plans/effects, duration bindings,
rewards, firearm state/events/attacks, rolls/amendments, called checks, high-low
requests, and player ruling requests are generated state or history. They are
not independent author-created roots and receive no ordinary global delete
button. A Character deletion is blocked by their active or historical
references. Whole-Campaign deletion removes them only through the explicit,
Campaign-scoped, child-before-parent plan and leaves a durable lifecycle audit.

Temporary encounter Creatures are runtime participants, not persistent NPCs;
they never appear in the NPC archive.

There is no Shop, merchant, or shop-inventory persistence root in the current
schema or application. The starting-equipment “store” is a Character-creation
interface over the Item catalog. No speculative Shop lifecycle is introduced.

## Chat

Chat already has specialized lifecycle semantics:

- `chat_room.is_archived` makes a room read-only.
- Campaign rooms are system-created containers and follow Campaign archive.
- Global/direct rooms are infrastructure, not ordinary game-content roots.
- `chat_message` deletion is a tombstone carrying status, actor, reason, and
  time; messages are not permanently deleted through lifecycle actions.

Campaign deletion includes that Campaign's room membership and messages as part
of the explicitly confirmed Campaign world. Other rooms and messages are
outside the Campaign predicate and remain unchanged.

## System/reference records

`challenge_rating_reference`, `attribute_score_reference`, Item tag catalog,
armor-location reference, Item rules, authentication/user/role/session tables,
and migration ledgers are system or reference data. Defense Skill-path mappings
are global canonical configuration rather than Campaign content. None receives
an ordinary archive/delete control in this pass.

## Production recovery boundary

Permanent deletion is disabled whenever `NODE_ENV=production` unless the exact
server-only value below is deliberately configured:

```text
SERRIAN_TIDE_ENABLE_PERMANENT_DELETION=true
```

Missing, false, differently cased, whitespace-padded, or alternate truthy
values remain disabled. Archive and restore remain available. The service
checks this policy before opening and again inside the locked delete
transaction; hiding a client button cannot bypass it. The setting remains
`false` in `.env.example` because public backup restoration has not been
proven.

## Transaction and audit guarantees

`lifecycle_audit_event` is append-only lifecycle history. Target, Campaign, and
owner identity are snapshots rather than foreign keys, so a successful delete
cannot erase its audit evidence. The actor remains a restrictive User FK;
ordinary user-account deletion is outside this lifecycle.

Campaign deletion uses the explicit plan in
`src/features/lifecycle/campaign-delete-plan.ts`. Every Campaign-owned table in
the Drizzle snapshot FK closure is listed exactly once in child-before-parent
order. Each statement is constrained by `campaign_id`, by Characters belonging
to that Campaign, or by Chat rooms belonging to that Campaign. Nullable
self-references are detached first. Shared libraries and users are absent from
the plan. An internal service-only forced-failure seam exists solely to prove
transaction rollback and is never accepted by a Server Action.

Item mutations that can create a durable Item identity acquire `FOR UPDATE` on
the active `items` root in the same transaction before consuming a resource or
persisting an effect/reference. This includes activated Item use, creation of a
new automatic passive effect, authored Tabletop Item sources/effect plans, and
defending-Item reactions. Item lifecycle archive/delete takes the same root
lock before its authoritative dependency recheck, so a preview cannot race a
new reference across deletion. Read-only Item previews deliberately remain
lock-free.

Tabletop pending-action sources, effect plans, and defending-Item reactions
are direct executable or durable Item identities and therefore block permanent
Item deletion, including completed history. Action-declaration JSON and player
ruling-request JSON/source text are retained as immutable, self-contained
intent snapshots rather than live catalog attachment points; they are not
additional Item dependency counts. Encounter effects are children of their
counted effect plans, so the plan supplies the direct Item identity.

Database-backed lifecycle tests must refuse any database that is not loopback
and named with a `_dev` suffix, use unmistakable fixtures, clean them in
`finally`, and verify zero fixtures remain.

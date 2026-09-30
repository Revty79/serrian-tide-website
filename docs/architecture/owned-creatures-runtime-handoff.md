# Owned Creatures: management completion and runtime handoff

Status: Passes 1–3 management is ready for Brannan and Ember's hands-on acceptance. Runtime integration is a separate future project. This document records current contracts and open decisions; it does not authorize or settle runtime mechanics.

## Authoritative contracts

| Concern | Authority | Meaning and boundary |
| --- | --- | --- |
| Ownership | `campaign_character.owner_character_id` | The sole current ownership relationship. Owner is a same-Campaign Player Character or Race NPC. No profile, inventory holder, master definition or event overrides it. |
| Persistent individual | `campaign_character.id` with `campaign_creature_npc_profile.character_id` | Use the exact individual, including its current snapshot and Evolution/Return state. Same-name individuals from the same master remain independent. |
| Normal travel | `owned_creature_disposition` | `accompanying`, `away`, `vessel-bound`. No row is legacy Not Yet Set. This describes normal travel, never actual Scene presence. An Away note is narrative only. |
| Exact Vessel bond | `owned_creature_disposition.vessel_instance_id` and `vessel_item_id` | One exact persistent Creature to one exact `campaign_character_item_instance`. Unique/FK/trigger constraints preserve exact identity. Name is presentation only. |
| Vessel capability | `creature_vessel_profile` | Explicit Item capability, independent of Creature Grant and Container capabilities. Empty copies may exist before any bond. Disabling cannot erase existing bonds or silently convert inventory representation. |
| Companion Profile | `companion_profile`, `companion_profile_role` | Authored intent on the persistent individual. Absence and notes-only rows leave behavior unconfigured. Multiple roles are allowed, including none after deliberate configuration. |
| Owner review | `companion_profile.requires_owner_review` | Ownership changes retain settings and mark them for G.O.D. review. A Player's note edit cannot approve those settings. Removing ownership retains the profile but blocks editing. |
| Histories | `companion_disposition_event`, `companion_profile_event` | Separate revisioned streams. JSON snapshots are audit evidence, not alternative runtime authority. Current reads show the latest 30 of each; all retained events stay stored. |

### Disposition and custody

Accompanying does not follow the owner automatically. Away does not move or despawn the Creature. Vessel-bound does not release, recall, store runtime effects, enroll a combatant, or make it usable from an inaccessible Vessel. Not Yet Set must not be silently interpreted as Accompanying.

The bond survives later custody changes: contained, closed, inaccessible, dropped, lost, stolen, or held elsewhere. Custody does not transfer Creature ownership. An archived Item definition can retain an existing bond. These are management/read states; no runtime availability ruling follows from them.

The Vessel bond is not an `inventory_instance_location` entry for the Creature and is not ordinary Container contents. If a Vessel Item separately has Container capability, its normal Item contents still use the existing containment system. Neither relationship supplies the other's rules.

New bonds require a currently enabled Vessel capability, an active exact copy, an active allowed Item definition under existing inventory rules, correct owner inventory, accessibility, no current competing bond, and current management authority. Owner and Creature must satisfy existing active-record and encounter restrictions. A later custody change preserving a bond does not authorize establishing a new one in that state.

### Bidirectional management: one command and one relationship

Both paths converge on `changeCompanionDispositionForActor` in `src/features/creatures/companion-disposition-service.ts`:

1. Creature side: select Vessel-bound, choose an eligible exact Vessel, save.
2. Vessel side: open an exact copy's binding view, use **Bind Creature**, select an eligible owned individual, review the stated prior travel disposition, save.

`readVesselBindingOptionsForActor` reuses the Creature-side eligibility projection. It excludes already-bound Creatures. The client submits the existing disposition command with the exact owner/Creature/copy IDs, expected revision, retry key and `acknowledgeUnbind: false`. It never creates an owner or Creature. Forged/stale commands still reach the original authorization, revision, unbind, inventory, encounter and database guards. There is no second binding table or Item-side history.

A new bond replaces Not Yet Set, Accompanying or Away with Vessel-bound. The old disposition and exact new copy are recorded in Travel / Vessel history. The inverse chooser never silently rebinds an already-bound Creature. Explicit unbinding/rebinding remains available through the existing Creature-side acknowledgement flow.

An internal future coordinator should extract/reuse the same transaction-level invariants if its work must be atomic with another operation. Calling a top-level transaction-opening action after separately committing ownership would not establish atomic capture. No such coordinator is implemented in Pass 3.

### Roles and behavior

The role identifiers are `companion`, `mount`, `familiar`, `pack-working`, `guard-combat`, `scout-utility`, and `other`. They are multi-select descriptors. Other has an authored label. None derives mechanics from name, master definition, species, Size, Attributes or descriptive text.

Control Models record intended decision-making: Player Directed, Owner Commands, or G.O.D. Directed. They do not grant Player combat permissions, execute commands, change controllers or create autonomous behavior.

Combat Preferences record normal intent: Normally Joins Combat, Normally Stays Out, or Decide When Combat Starts. A preference is not a hard prohibition and grants no enrollment, attack, defense or Initiative behavior.

Mount's positive `maximum_riders` and optional Mount notes describe intended capability. They are not a list/count of current riders, a mounted condition, shared movement, a saddle requirement, or carrying calculations. Familiar records a relationship and grants no powers, senses, spells, bonuses or summon/recall behavior. Pack / Working leaves inventory and carrying rules with their existing authorities.

### Runtime must consume the persistent individual

A future runtime adapter must use the exact individual's current Creature snapshot and Evolution state, current HP/damage/injuries, conditions/modifiers, equipment/inventory and authored attacks/abilities. It must not rebuild from a master definition because the Creature enters a Scene, enters combat or is associated with a Vessel. Historical Return preserves the same individual and its management relationships; it is not reacquisition or reclassification of roles.

The future coordinated Forms / Evolutions / Owned Creatures / Special Abilities project must establish a consistent current-state read and mutation contract with those systems. This management pass does not decide which active Form, Evolution change or ability applies during gameplay.

## Authority and management surfaces

- Player: current owned companions, existing rename authority, permitted disposition/binding changes, relationship notes, safe summaries and histories. No role/control/preference/rider/review authority.
- Campaign-owning G.O.D.: management on active records, explicit owner review, and read-only inspection of retained unowned profiles in both simple and detailed NPC editors. Race-NPC owners use this same model; no Player controls are added for them.
- Administrator/library role alone: existing record reads remain as previously authorized; they confer no companion travel, binding or behavioral configuration authority. Foreign G.O.D.s and unrelated Players are denied.
- Unowned retained inspection: exact-Creature and Campaign-owning G.O.D. checks on the server. It returns safe management fields and both histories, with no fake owner, mutation endpoint, private NPC notes or health projection. Archived retained records remain inspectable. Assign a valid active owner before editing or approving.
- Exact Vessel view: readable Item-copy identity, bound Creature name and Individual number, plus availability of the inverse management entry point. It returns no health/resources, NPC notes, hidden mechanics or owner-edit controls. Binding options contain only eligible owned individuals and management revisions/dispositions.

The reverse view and inverse chooser are hints from a read snapshot. The mutation always rechecks authoritative state. Another browser can invalidate the choice; the interface keeps the exact failed attempt for idempotent retry or explicit refresh.

## Ownership events and lifecycle

Bound ownership transfer remains blocked until deliberate unbinding/change of disposition. Ownership removal clears current disposition and records that removal, while retaining the profile and marking it for review. Reassignment also requires review, without automatic role changes. Neither UI names nor the identity of a Vessel's current holder may reconstruct an owner.

Archive/restore preserves management configuration and histories. Existing active-record rules restrict mutation of archived owners, Creatures and Campaigns. Definition archive retains an exact existing bond but excludes it from new selection. Exact copies have retirement/destruction handling rather than an independent archive/restore feature; a bound copy cannot be retired/deleted as a shortcut. Explicit full-Campaign deletion uses its existing ordered graph cleanup. No automatic repair/inference was added.

### Why automatic ownership events remain unattributed

The audit found these paths:

| Path | Actor context | Companion-history behavior |
| --- | --- | --- |
| `setCreatureNpcOwner` → `setCreatureOwnerInTransaction` | Authenticated record-management actor is known at the action boundary. | Owner update invokes the existing triggers. |
| `createNpc` initial assignment; `createOwnedCreatureInTransaction` | Authorized creation/commerce context. | Fresh individuals have no prior companion profile/disposition to review. |
| `sellCreature` | Established `actorUserId` from executed Shop operation is available. | Ownership removal invokes both relevant backstops; commerce and lifecycle maintain their own actor-bearing receipts. |
| `purchaseCreatures` exact resale | Executing commerce operation has `input.actorUserId`, but the helper context currently carries `ownerUserId` (the Character controller). | The controller must not be guessed to be the actual executing actor. Reassignment invokes profile review. |
| Full-Campaign lifecycle cleanup | Existing lifecycle operation context. | Explicit graph deletion removes management relationships before clearing ownership references. |

Migration 0088's removal trigger and 0089's review trigger directly insert immutable events with null actors and expose no transaction-local actor hook. Patching a receipt afterward would violate immutable history. Writing parallel application events would duplicate revisions/semantics. Supplying a helper parameter alone cannot change what those triggers record.

Pass 3 therefore retains explicit **actor not recorded** attribution for automatic events, including future events. It adds no migration merely to alter that contract and does not rewrite old history. Ordinary authored profile/travel/binding commands continue to record the authenticated actor. A later attribution change should deliberately design transaction-scoped authenticated actor/operation context across direct assignment, sale and resale, preserve null for genuine system work, and update the trigger contract through a separately reviewed migration. This is a documented management limitation, not a new gameplay ruling.

## Future capture/acquisition contract — document only

A successful future capture may coordinate: (1) establishing/acquiring the exact persistent Creature; (2) establishing legitimate ownership under future capture rules; (3) binding that exact Creature to the chosen exact empty Vessel using the existing Companion Disposition/Vessel contract. It must not invent separate captured-Creature storage or encode the Creature as Item contents.

Capture rolls, eligibility, resistance, costs, ownership timing, failure/rollback behavior and combat timing remain unresolved. The existing management entry point supports empty Vessels acquired before a Creature exists; it does not implement acquisition, capture or an atomic capture transaction.

## Decisions reserved for Brannan and Ember

None of the following is a ruling or an implementation task for Pass 3:

1. How Accompanying Creatures enter and leave Scenes; whether they are automatically present.
2. When Normally Joins Combat prompts or applies; treatment of Normally Stays Out and Decide at Start.
3. Player Directed combat authority and access boundaries.
4. Owner Commands workflow, timing and adjudication.
5. G.O.D. Directed workflow and its relationship to Player intent.
6. Multiple simultaneously active Creatures and whether any campaign-authored limits exist. No global companion/Mount/Familiar/deployment limit is assumed.
7. Release from a Vessel, recall to a Vessel, and any Initiative or other costs.
8. Use of inaccessible, closed, lost or stolen Vessels; use by a non-owner.
9. Recall of injured/incapacitated Creatures and durations/effects while stored.
10. Vessel destruction consequences, including how to resolve an existing bond.
11. Mounting/dismounting, rider/mount movement, rider-count enforcement and mounted combat.
12. Familiar mechanics, if any, and their actual source of authority.
13. Whether a future explicit **Transfer Creature + exact Vessel together atomically** operation should exist.
14. Capture/acquisition rules: roll, eligibility, resistance, cost, ownership timing, failure behavior and combat timing.
15. Mid-combat ownership changes and pending actions/control authority.
16. Interaction with active Forms and form transitions.
17. Creature Evolutions and Return during combat, including current state preservation.
18. Special Ability execution by controlled Creatures and coordination with existing execution authority.

## Evidence and acceptance boundary

See the [Pass 3 report](owned-creatures-pass-three-report.md), [human checklist](owned-creatures-acceptance-checklist.md) and [database evidence](../samples/owned-creatures-pass-three/no-runtime-proof.json). The audit compares every row of every public table during management scenarios. Only companion configuration/history tables may differ, with exact owner columns separately allowed only during explicit ownership changes. Existing lifecycle, custody, commerce and Evolution operations intentionally write their own domains and are tested separately for relationship preservation.

No new Scene, Encounter, participant, Initiative, action, attack, movement, mounted, capture, release, recall or deployment execution is implemented. Automated tests are evidence for technical behavior; Brannan and Ember's acceptance is still pending.

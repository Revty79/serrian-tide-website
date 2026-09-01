# Tabletop Operations Architecture Contract

Tabletop Operations is a tabletop aid. It organizes play, calculates deterministic mechanics, tracks objective state, and supports G.O.D. decisions. It does not run the game, choose tactics, select actions, or make narrative decisions.

## Hierarchy

```text
Campaign
  └── Session
        ├── Session Roster
        └── Scene
              ├── Scene Members
              └── Encounter
                    ├── Encounter Participants
                    └── Initiative Runtime
                          ├── Initiative Participants
                          └── Pending Actions
```

Build 2 establishes the Session Roster as references to existing Campaign Characters. Build 3 establishes Scenes and Scene membership beneath Sessions. Build 4 establishes Encounters and Encounter Participants. Build 5 establishes the persistent Initiative Runtime attached to that Participant identity. Authored attack, reaction, spell, Item, Creature Ability, and Active State integration remain later additions.

## Session Roster boundary

The Session Roster identifies the existing entities expected or available for one Session:

```text
Session Roster
  → references campaign_character
  → identifies entities available for the Session
  → may store Session-specific ordering and private preparation notes
  → never copies persistent Character state
```

Roster entries may reference Player Characters, race-based NPCs, and Creature NPCs from the Session's Campaign. Their names, Player identity, NPC kind, Race data, Creature template, and all mechanical state are read from the authoritative Campaign Character and its existing profile records.

Scenes and Encounters select from, or otherwise reference, the Session-level roster. They must not create new versions of Characters or NPCs.

## Scene boundary

A Scene is an organizational span of tabletop play: a coherent situation, location, conversation, or exploration segment inside exactly one Session. A Scene may exist without an Encounter and may eventually contain one or more Encounters.

```text
Scene
  → belongs to exactly one Session
  → stores simple context, lifecycle, ordering, and private G.O.D. notes
  → selects Scene Members only from that Session's Roster
  → never copies persistent Character or NPC state
```

Scene Members reference existing Session Roster entries. Session Roster membership means an entity is expected or available for the Session; Scene membership means that rostered entity is associated with a particular Scene. Encounter Participants remain a separate concept rather than replacing either layer.

Completed Scenes preserve their metadata and member references as history. Removing a Session Roster entry must be rejected while any Scene still references it, rather than cascading away Scene history.

Scene completion is the future lifecycle boundary for Active Effects whose duration kind is `scene`. Build 3 records that boundary only. It does not automatically expire, resolve, or otherwise mutate those effects; duration integration remains deferred until the later runtime lifecycle build.

## Encounter boundary

An Encounter is a focused challenge or confrontation inside exactly one Scene. The Scene therefore determines the Encounter's Session and Campaign. A Scene may exist without an Encounter and may contain multiple Encounters over time.

```text
Encounter
  → belongs to exactly one Scene
  → stores organizational type, lifecycle, ordering, and private G.O.D. notes
  → selects Encounter Participants only from that Scene's Members
  → never copies persistent Character or NPC state
```

Encounter Participants identify who is actively involved in that focused Encounter. Their order is G.O.D. display and preparation order only; it is not Initiative order. Encounter type is descriptive and never starts combat or changes mechanics automatically.

Completed Encounters preserve metadata and Participant references as history. Removing a Scene Member must be rejected while an Encounter still references it, rather than cascading away Encounter history.

Build 4 creates the stable Encounter Participant identity layer. Build 5 attaches Initiative, Hold/Pass, Combat Step/Round state, pending actions, and late Initiative enrollment to that identity rather than creating another participant identity system.

## One authoritative Character state

Tabletop Operations, the G.O.D. interface, and the Player Character interface are different views and controllers of the same authoritative `campaign_character` runtime state. They must never maintain competing copies of persistent Character or NPC state.

```text
                 campaign_character
                 AUTHORITATIVE ENTITY
                        │
        ┌───────────────┼───────────────┐
        │               │               │
 Player Interface   G.O.D. Table    Runtime Services
        │               │               │
        └───────────────┼───────────────┘
                        │
                  SAME LIVE STATE
```

Health, Mana, Conditions, Temporary Modifiers, Injuries, Inventory, Item Instances, Charges, Equipment, Attributes, Skills, Spells, Creature Abilities, and Creature snapshots remain in their existing authoritative Character-owned persistence and services. When later Tabletop Operations builds damage a Character, spend Mana, or apply a Condition, those operations must use those same services so both Player and G.O.D. views observe the same live state.

Encounter Initiative is valid Encounter-specific runtime state. Normal and Current Initiative, Hold/Pass/Suspension, signed Initiative debt, Round and Combat Step counters, deferred Initiative costs, and pending-action progress may be persisted beneath an Encounter because they describe that Encounter's continuous timeline. They are not alternative copies of Character state.

## Persistent entity state

Player Characters, race-based NPCs, and Creature NPCs remain existing `campaign_character` entities. Their persistent runtime state remains attached to those entities, including:

```text
Active Health
Active Mana
Conditions
Temporary Modifiers
Inventory
Owned Item Instances
Charges
Equipment State
Creature Abilities
Spells
Injuries
```

Session Rosters, Scenes, and Encounters reference these existing entities and services. They must not copy persistent Character state into Session, Scene, Encounter, or Participant tables.

## Session, Scene, and Encounter boundary

Session- or Encounter-specific state includes:

```text
session participation
scene participation
encounter participation
Initiative
Hold / Pass
pending actions
encounter entry / exit
approaching / withdrawing status
combat-step / round state
```

Build 5 implements only the Initiative-related subset of that state. It does not replace or reset persistent Character state.

Completing or reopening a Session is organizational. It must not reset Health, Mana, Conditions, Temporary Modifiers, Injuries, Inventory, Charges, Equipment State, Creature snapshots, abilities, or spells.

## G.O.D. authority

Tabletop Operations calculates deterministic mechanics and tracks state. The Campaign-owning G.O.D. always retains final authority over tactical, narrative, ambiguous, and discretionary rulings.

Automation must not choose Player actions, decide NPC tactics, infer narrative consequences, or resolve discretionary G.O.D. decisions.

## Initiative authority

All Initiative implementation must conform to:

```text
docs/rules/initiative-runtime-contract.md
```

Do not reinterpret or simplify that contract. Architecture changes affecting Initiative must update both the architecture documentation and its regression tests.

## Build 6 Initiative Tracker boundary

The G.O.D.-facing Initiative Tracker is nested beneath the selected Encounter in `/heavens/tabletop`. It is a read model and controller for the Build 5 engine, not a second Initiative implementation.

```text
Encounter Participants / Character identity
                    +
Build 5 Initiative Runtime
                    +
Authoritative capacity options
                    ↓
          Initiative Tracker read model
                    ↓
       Existing locked server operations
```

The Tracker joins names and kind labels at read time. Initiative tables continue storing Character IDs, Initiative state, and pending-action history only. Next-event precedence, action eligibility, retained Hold intervention, reaction timing, Round eligibility, capacity changes, carryover, and debt remain engine-owned calculations.

Build 6 supplies generic descriptive actions and explicit G.O.D. corrections. Authored Weapon, Spell, Item, Creature Ability, reaction resolution, Health, Mana, Conditions, damage, healing, maps, tokens, and live Player synchronization remain later integrations.

## Build 7 Combat Aid read boundary

Combat Aid is the read-only G.O.D. workspace nested beside Encounter Prep and the Initiative Tracker for the selected Encounter. Encounter Participant membership is its authorization and display boundary; it does not create a combatant record or copy Character state.

```text
Authorized Encounter Participants
              +
one repeatable-read transaction
              +
Active Health / Mana / Effects services
Equipment / Item / Charge services
Initiative runtime rows
              ↓
      Combat Aid read model
```

The server first resolves the Encounter through Session, Scene, and Campaign ownership and verifies the acting user is the Campaign-owning G.O.D. It then resolves only that Encounter's Participant identities. Within the same caller-owned read transaction it asks the existing domain services for living Health and anatomy, Mana, active Conditions and Temporary Modifiers, Equipment State and passives, operational inventory, and charged instances. Initiative is summarized from the selected Encounter's authoritative Initiative runtime.

The read model retains authoritative Character, Item, Item Instance, and Initiative identities needed for future operations. It does not persist totals, summaries, target state, equipment profiles, inventory state, or any other duplicate runtime data. Health totals and pool remaining values come from Active Health; Mana comes from Active Mana; effect duration/source snapshots come from Active Effects; weapon, armor, passive, and ownership data come from Equipment State; item-use definitions and charges come from Item Runtime and Charge State. Creature Health continues resolving from the Creature NPC's current snapshot anatomy.

Completed Encounter membership is historical, but Combat Aid intentionally shows current living Character state. The UI labels that distinction explicitly so it cannot be mistaken for an Encounter-completion snapshot.

Combat Aid contains no damage, healing, Mana spending, Condition, Equipment, Item use, charge, or Initiative mutation controls. Refreshing the page only rereads the same state. A failure to resolve one participant subsection is surfaced on that participant without hiding other independently available sections.

## Build 8 Runtime Integration boundary

Build 8 makes Combat Aid operational without creating another Character-state system. Every mutation begins by locking the selected Encounter, authorizing the Campaign-owning G.O.D., and confirming every source and target is a current Participant of that exact Encounter.

```text
Encounter Participant references campaign_character
                         |
             +-----------+-----------+
             |                       |
   Encounter Initiative       Existing runtime owners
   and authored action ID     Health / Mana / Effects
             |                Equipment / Items / Spells
             |                Creature snapshots / Abilities
             +-----------+-----------+
                         |
                  SAME LIVE STATE
```

Combat Aid delegates Health, Mana, Conditions, Temporary Modifiers, Injuries, Equipment, Item Use, Spell Casting, and Creature Ability execution to the existing transaction-aware services. Player and G.O.D. views therefore read and mutate the same `campaign_character` records. Tabletop persistence adds only Encounter-specific authored-action identity, selected request identities, resolution status, and Reaction accounting. It never stores Health, Mana, inventory quantities, charge counts, Attributes, Skills, Creature snapshots, or calculated Character state.

### Authored action timing

An authored Weapon, Creature Attack, Spell, Item, or Creature Ability starts as a normal Build 5 pending Initiative action plus a durable source binding. Starting an action spends only Initiative time. Damage, Mana, Item resources, Charges, Conditions, and other runtime consequences remain unchanged until the pending action reaches `completed` and the G.O.D. explicitly confirms resolution.

The durable binding survives refresh, Round advancement, interruption, and resume. Resume, Restart, and Adjusted Resume keep it pending. End or Abandon cancels it. Manual completion makes it eligible for resolution but does not secretly execute it. Resolution locks the binding and requires `pending`, so a repeated submission cannot execute consequences twice.

Spell bindings accept only durable Catalog, personal Spellbook, or saved Raw Spell identities during Initiative. Unsaved raw formulas remain available in their existing calculator/generic-action path. At resolution, every runtime source and target is reread and revalidated authoritatively; cached previews are not trusted.

### Reactions

Reaction opportunity comes only from the Initiative engine. Dodge commits 1 Initiative. Block and Parry require a currently wielded authoritative Weapon and commit its full Initiative Cost, including debt when necessary. The G.O.D. records success or failure; no roll is automated.

A successful Block or Parry refunds the defender's committed cost minus 1 and applies only the defending Weapon cost as additional attacker cost, because the attack's own cost has already elapsed. The shared timeline never rewinds. A failed defense keeps its committed cost and adds no attacker cost. If its source action is interrupted or ended first, the Reaction becomes `needs-ruling` so the G.O.D. explicitly keeps or refunds the commitment.

### Creature Catalog spawning

Creature Catalog spawning creates real Creature NPC `campaign_character` records through the same canonical constructor used by NPC management. A single caller-owned transaction loads the master Creature, builds the canonical snapshot, creates each independent NPC, and inserts Session Roster, Scene Member, and Encounter Participant references. Quantity naming is deterministic within the batch. Optional active-Initiative enrollment uses late-entry rules and never changes the shared timeline; it is never implied by merely adding the Creature.

Master Creature records remain reusable templates and never participate directly. Spawned Creature NPCs own independent Active Health and current snapshots. Any failure rolls back the entire batch and all membership/enrollment writes.

### Tabletop-aid authority

Runtime Integration does not invent attack rolls, defense rolls, automatic targets, NPC decisions, Weapon-to-Skill mappings, armor/soak automation, or narrative consequences. Creature attack damage is accepted only when it is direct numeric Serrian Tide damage; dice notation remains a G.O.D. ruling. Ambiguous or manual effects are shown for explicit G.O.D. resolution.

## Build 9 Duration Advancement and Encounter Closeout

Build 9 attaches Tabletop lifecycle context to the existing authoritative Active Condition and Temporary Modifier identities. The authored `durationKind`, `durationValue`, and `durationLabel` remain on the Active Effect unchanged. A `campaign_session_effect_duration_binding` stores only the owning Scene/Encounter, finite remaining value, and lifecycle status. `until-removed` effects never receive automatic bindings. Existing finite or Scene effects without trustworthy context remain visibly unbound until the G.O.D. explicitly binds them; they do not advance based on the currently selected page, timestamps, or inferred context.

```text
Authoritative Active Effect identity
                |
Tabletop duration binding and remaining value
                |
authoritative Initiative / Scene lifecycle boundary
                |
existing Active Effects end/resolve service
```

Combat Step and Round passage is observed around every server-side persistence path that mutates the Build 5 Initiative engine. The actual positive change in `stepNumber` advances `combat-steps`; the actual positive change in `roundNumber` advances `combat-rounds`. A Round transition can advance both once. Forced Round advancement is elapsed table time and counts normally. Advanced G.O.D. Initiative correction is bookkeeping and explicitly reports no duration passage. Closing Initiative expires remaining combat-scoped bindings in the same transaction. Completing an Encounter does not expire Scene effects; completing their specifically bound Scene does. Reopening Initiative, an Encounter, or a Scene never resurrects expired effects.

Duration advancement is driven by authoritative lifecycle boundaries, not page refreshes or inferred real time. Expiration uses the existing Condition resolution and Modifier ending services, preserves effect history, and closes the binding atomically. Manual Tabletop resolution closes its binding immediately; lifecycle processing also reconciles effects ended elsewhere without resurrecting or double-ending them.

Encounter closeout is a G.O.D.-facing read and controller layer, not another combat engine. It blocks finalization while Initiative is active; a pending action is active or interrupted; an authored action is pending or needs a ruling; or a Reaction is declared or needs a ruling. Unbound effects are warnings because their relationship to the Encounter is not objectively known.

Build 9 rewards are XP only. Authored Creature snapshot `core.killXp` values are optional, unchecked suggestions. Reward suggestions never constitute an automatic outcome or XP grant. The system does not inspect Health, infer defeat/death, or calculate XP from CR. The G.O.D. explicitly chooses Creature references and enters each Participant recipient's amount.

The finalizer locks the Encounter and exact Participant Character profiles, revalidates all blockers and recipients, increments only spendable `campaign_character_profile.experience`, writes immutable `campaign_session_encounter_reward` history, and completes the Encounter in one transaction. `totalExperience` remains the established lifetime-spent Advancement ledger and is not changed by awards. Zero XP is valid. Unique reward history and locked lifecycle state prevent repeat submissions from duplicating XP. Reopening does not refund XP, delete reward history, resurrect effects, or permit the prior award to be granted again.

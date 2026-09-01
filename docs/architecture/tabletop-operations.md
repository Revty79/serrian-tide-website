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

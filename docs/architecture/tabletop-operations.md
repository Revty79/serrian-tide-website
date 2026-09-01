# Tabletop Operations Architecture Contract

Tabletop Operations is a tabletop aid. It organizes play, calculates deterministic mechanics, tracks objective state, and supports G.O.D. decisions. It does not run the game, choose tactics, select actions, or make narrative decisions.

## Hierarchy

```text
Campaign
  └── Session
        ├── Session Roster
        └── Scene
              ├── Scene Members
              └── Encounter         [future]
                    ├── Participants
                    ├── Initiative Runtime
                    ├── Pending Actions
                    └── Encounter-specific state
```

Build 2 establishes the Session Roster as references to existing Campaign Characters. Build 3 establishes Scenes and Scene membership beneath Sessions. Encounters, Encounter participants, Initiative, and combat runtime remain future additions and must not be represented by speculative placeholder tables.

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

Future Scenes and Encounters will select from, or otherwise reference, the Session-level roster. They must not create new versions of Characters or NPCs.

## Scene boundary

A Scene is an organizational span of tabletop play: a coherent situation, location, conversation, or exploration segment inside exactly one Session. A Scene may exist without an Encounter and may eventually contain one or more Encounters.

```text
Scene
  → belongs to exactly one Session
  → stores simple context, lifecycle, ordering, and private G.O.D. notes
  → selects Scene Members only from that Session's Roster
  → never copies persistent Character or NPC state
```

Scene Members reference existing Session Roster entries. Session Roster membership means an entity is expected or available for the Session; Scene membership means that rostered entity is associated with a particular Scene. Future Encounter participants will remain a separate concept rather than replacing either layer.

Completed Scenes preserve their metadata and member references as history. Removing a Session Roster entry must be rejected while any Scene still references it, rather than cascading away Scene history.

Scene completion is the future lifecycle boundary for Active Effects whose duration kind is `scene`. Build 3 records that boundary only. It does not automatically expire, resolve, or otherwise mutate those effects; duration integration remains deferred until the later runtime lifecycle build.

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

Session Rosters, Scenes, and future Encounters reference these existing entities and services. They must not copy persistent Character state into Session, Scene, or Encounter tables.

## Session, Scene, and Encounter boundary

Session- or Encounter-specific state may eventually include:

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

That state belongs to the future Tabletop Operations layer. It does not replace or reset persistent Character state.

Completing or reopening a Session is organizational. It must not reset Health, Mana, Conditions, Temporary Modifiers, Injuries, Inventory, Charges, Equipment State, Creature snapshots, abilities, or spells.

## G.O.D. authority

Tabletop Operations calculates deterministic mechanics and tracks state. The Campaign-owning G.O.D. always retains final authority over tactical, narrative, ambiguous, and discretionary rulings.

Automation must not choose Player actions, decide NPC tactics, infer narrative consequences, or resolve discretionary G.O.D. decisions.

## Initiative authority

All future Initiative implementation must conform to:

```text
docs/rules/initiative-runtime-contract.md
```

Do not reinterpret or simplify that contract. Architecture changes affecting Initiative must update both the architecture documentation and its regression tests.

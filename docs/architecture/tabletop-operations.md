# Tabletop Operations Architecture Contract

Tabletop Operations is a tabletop aid. It organizes play, calculates deterministic mechanics, tracks objective state, and supports G.O.D. decisions. It does not run the game, choose tactics, select actions, or make narrative decisions.

## Hierarchy

```text
Campaign
  └── Session
        ├── Session Roster          [future]
        └── Scene                   [future]
              └── Encounter         [future]
                    ├── Participants
                    ├── Initiative Runtime
                    ├── Pending Actions
                    └── Encounter-specific state
```

Build 1 establishes only the Campaign-to-Session relationship. Session Rosters, Scenes, Encounters, participants, and combat runtime are future additions and must not be represented by speculative placeholder tables.

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

Future Sessions and Encounters reference these existing entities and services. They must not copy persistent Character state into Session or Encounter tables.

## Session and Encounter boundary

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


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

### Creature Catalog encounter occurrences

The Campaign roster remains limited to Player Characters and deliberately persistent Campaign NPCs. Creature Catalog selection instead creates only an Encounter Participant occurrence: it stores a stable encounter-participant identity, the exact canonical Creature ID, a frozen encounter snapshot, an encounter-local display label, and mutable encounter-local state. It creates no `campaign_character`, Creature NPC profile, Session Roster, or Scene Member row. Multiple occurrences may reference one canonical Creature without duplicating or mutating it.

The compatibility runtime key used by existing Initiative, pending-action, Reaction, and Roll records is negative and scoped through the Encounter Participant record; it is never a Character ID and never has a `campaign_character` row. Optional active-Initiative enrollment derives capacity from the occurrence snapshot, uses late-entry rules, and never moves the shared timeline. Deleting an eligible occurrence cascades only encounter-owned state; canonical Creature data remains restricted and untouched. Persistent Creature NPCs created deliberately through NPC management retain their existing Character/NPC/roster path and history.

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

## Build 10 Shared Roll Runtime and Session Closeout

Build 10 adds one durable `campaign_session_roll` ledger and one shared Roll Runtime service. The G.O.D. controller authorizes Campaign ownership and the Player controller supplies its own narrower authorization to the same transaction API. The domain itself does not require a G.O.D. role. The shared read policy returns every Roll to the Campaign owner. A Player receives `table` Rolls plus `private` Rolls only when the server-verified Player Character is the rolling Character; `god-only` and another Character's private Rolls never cross that boundary.

A Roll is evidence recorded by the tabletop runtime. Its stored objective percentile resolution does not make a G.O.D. ruling or execute a gameplay outcome. Build 11 uses this same Roll Runtime and Roll Ledger rather than introducing a Player-side dice subsystem.

```text
                    Shared Roll Runtime
                            |
              campaign_session_roll ledger
                    /               \
        Build 10 G.O.D. UI      Build 11 Player UI
```

A random Roll is generated and persisted on the server with `node:crypto` secure randomness. Every Roll in this runtime is Serrian Tide percentile, with one canonical result from 1–100; the browser supplies context, never a random result. Entered/physical Rolls use the same immutable record type, and physical percentile `00` is entered as numeric 100. Hit Location is a view derived from the ones digit of that same immutable percentile result and never causes another random request or ledger row. There is no Roll Type column, generic dice notation, polyhedral preset, multi-die result, damage-dice Roll, or Initiative Roll in this runtime; Damage remains direct numeric and Initiative remains calculated.

Roll context can reference an exact Session, Scene, Encounter, Character, target Character, pending action, or Reaction only after hierarchy, membership, and linkage validation. Active Encounter Initiative contributes a historical Round/Step event snapshot; it never creates alternate Initiative state. The Roll can retain a legacy target-number reference, purpose, label, notes, and visibility. A targeted mechanical Roll is evaluated exactly once by the shared percentile engine and stores that objective resolution; it never resolves attack/defense opposition, Damage, Soak, Injuries, action resolution, Reaction resolution, XP, targets, narrative consequences, or tactical choices. Existing authored-action and Reaction controls remain the only place the G.O.D. records what a Roll means.

Roll records cannot be edited or deleted. New corrections, rulings, and voids are append-only `campaign_session_roll_amendment` events linked into one unambiguous chain. A correction contains a new server-generated mechanical snapshot and may explicitly replace the effective raw result without changing the original. A void contains its own reason, timestamp, and user identity. Legacy Rolls already marked `status = 'voided'` continue using their original void metadata. The original Roll result, context, recorder, creation time, and initial snapshot always remain. Completed Encounter and Session history remains readable; recording resumes only after an explicit organizational reopen and always creates a new record.

### Pass 2 immutable mechanical snapshots

A targeted Roll stores a versioned JSONB snapshot containing the exact Attribute, exact Character Skill allocation path, or manual G.O.D. target used; the original target; each bonus and penalty; and the complete Pass 1 result. Attribute checks snapshot `100 - Attribute` at recording time. Skill callers must supply the already-calculated authorized roll-over percentage; the Roll Runtime never reconstructs it from allocated points or guesses a path. Historical reads validate and display stored snapshots without calling the current engine, so later Character advancement, Skill edits, or rule changes cannot rewrite the event.

Free Rolls and legacy rows may have no snapshot. They remain valid unresolved history and are never assigned a fabricated outcome. The compatibility `target_number` column is only a legacy reference when no snapshot exists; for new targeted Rolls it mirrors the snapshot's original target, while the snapshot remains authoritative.

Player ledger queries bind private access to the authenticated Player's server-resolved Character and the Roll's stored rolling Character. Supplying a filter Character ID cannot widen that scope. Mechanical snapshots on table-visible Rolls by another Character are redacted from the Player DTO so private NPC, Creature, and other-Character governing values do not leak; the Campaign-owning G.O.D. receives the complete ledger.

The Session Roll Ledger uses bounded cursor pagination and filters. The Session Roll Tray, Encounter Roll Tray, authored-action quick Roll, and Reaction quick Roll all render the same component and call the same server service. Quick controls only prefill context and never invoke an outcome control.

Session Closeout locks and rereads the complete Session runtime before completion. Active Scenes, Encounters, Initiative, pending/interrupted actions, unresolved authored actions, and unresolved Reactions are blockers. Planned content and objectively unbound finite durations are warnings, not guessed state. XP summaries derive from existing immutable Encounter rewards and Roll summaries derive from the Roll ledger; there is no second reward or Roll store.

Finalizing or reopening a Session changes only organizational lifecycle fields. It never heals, restores Mana, clears Conditions/Modifiers/Injuries, advances or expires durations, mutates Inventory/Charges/Equipment, alters XP, rewrites Rolls/rewards, replays Encounter effects, or resets Character/Creature state.

## Build 11 Player Active Encounter and live synchronization

The final Roll correction leaves one Serrian Tide percentile result, 1–100. Hit Location is never rolled separately: an Attack Roll derives the canonical 0–9 location from the same result with `result % 10`. There is no persisted Roll type and no separate hit-location die.

Build 11 adds a narrow Player controller over the same active hierarchy and runtime services. Active Encounter discovery is exact: the signed-in Player must own the non-NPC Character, and that Character must be present in the active Session Roster, active Scene membership, and active Encounter Participants. There is no newest/latest fallback and no Player combat copy.

The server projects a dedicated Player DTO. The Player receives their own full runtime read plus only each other Participant's identity label, current Initiative, participation status, and public pending-action summary. The projection never contains NPC Health, Mana, Effects, Equipment, inventory, private preparation notes, G.O.D. notes, authored payloads, or `god-only` Rolls. Server-side mutation authorization is repeated for every request; hiding a control is never authorization.

```text
Player controller                         G.O.D. controller
       \                                      /
        +---- shared transaction services ---+
                 |     |      |      |
             Initiative Actions Reactions Roll Ledger
                 |     |      |      |
              one Encounter and Character runtime state
```

Players may Hold or Pass only their own Initiative, start an action only from their own currently wielded authoritative Weapon, prepare a known or saved Raw Spell and enter its authoritative calculated casting time, declare an eligible Reaction for their own Character, and record a table-visible percentile Roll as their own Character. Weapon timing and Spell cost are reloaded server-side. Players cannot supply an Initiative Cost, use generic actions, adjudicate outcomes, apply Damage, resolve Reactions, mutate another Character, record private Rolls, or void Roll history. Items continue using the existing Character runtime outside active Initiative. While Initiative is active, direct Player Item execution is blocked both in the Character UI and on the server; missing combat timing remains an explicit G.O.D. ruling rather than invented Player timing.

Live synchronization transports invalidation only. A successful caller-owned database transaction invokes PostgreSQL `pg_notify`; PostgreSQL releases that event only after commit, so rollback emits nothing. Authorized Node SSE endpoints use dedicated `LISTEN` connections and filter minimal Campaign/Session/Scene/Encounter/Character identity plus a category. G.O.D. subscriptions require Campaign ownership. Player subscriptions repeat exact Character ownership and active hierarchy authorization. No Health, Mana, notes, Roll results, or other private state is sent in an event. The browser receives an invalidation, refreshes its normal server read, and reconnects with heartbeat status; SSE never becomes a second state store or mutation path.

## Pass 6 Action Declaration and Initiative Window boundary

Pass 6 adds a durable declaration controller above the existing pending-action engine. It does not introduce a second timeline. A draft stores editable intent and spends no Initiative. Locking revalidates exact Campaign, Session, Scene, Encounter, Initiative Participant, target, source, wielded Weapon/Profile/Mode, and Character weapon-governance state, then stores an immutable versioned snapshot. Locking still spends nothing. A material change to a locked declaration cancels that version and creates one explicit successor linked by `supersedes_declaration_id`.

```text
draft -> locked -> committed/open window -> rolling-ready -> rolling -> resolved
                     |                         |
                     +-> interrupted           +-> awaiting-god-ruling
                     +-> cancelled/abandoned   +-> cancelled/abandoned
```

Commitment delegates to the existing `startInitiativeAction` engine and creates exactly one existing pending-action row. Its start, original cost, elapsed cost, remaining cost, completion position, Round, and status remain authoritative there. Ordinary actions retain the engine's no-voluntary-debt rule. Only declarations explicitly marked multi-Round may start without enough Current Initiative; elapsed Initiative is charged by timeline passage, remaining work survives reset, and a continuation audit event plus any newly crossed responder window is persisted without restarting the action.

Action windows are deterministic inclusive descending intervals: `start Initiative` through `start Initiative - declared cost`. They never wrap. The actor, Passed Participants, suspended Participants, and Participants without positive Initiative are mechanically excluded. Active and Holding positions reached at either boundary are persisted as responder opportunities. Each mechanically reached candidate is marked as still requiring G.O.D. confirmation for awareness, allegiance, positioning, and other fiction that Initiative cannot decide. A G.O.D.-added exceptional candidate requires a reason.

`ordinary`, `melee-overlap`, `firearm-trigger`, and `preparation` are explicit window kinds. Melee overlap records that an admitted response may extend beyond the original nominal completion; it does not compare or resolve the actions. A firearm trigger window is valid only at exactly one Initiative and does not manufacture a broader defense interval. Preparation records its longer crossing interval and may reference an exact later declaration for the same actor and Encounter; it never guarantees the later action.

Responder opportunities persist independently of browser connection. Pending consideration blocks action Rolls. A generic future response label, explicit decline, G.O.D. ineligibility ruling, or cancellation reconciles the opportunity. Only a locked and committed declaration in `rolling-ready` or `rolling`, with every opportunity reconciled, may receive a linked Roll. Legacy pending-action Rolls remain readable and compatible. Recording a Roll moves the declaration to `rolling` or, for 1/100 criticals, `awaiting-god-ruling`; it never resolves the action or applies a consequence.

The G.O.D. Tabletop declaration workspace is the only new mutation surface in this pass. Its server actions require the Campaign-owning G.O.D.; administrator status alone is insufficient. The service layer also supports a Player actor only for that authenticated Player's exact non-NPC Campaign Character, ready for a later Player Combat Console without exposing one here. G.O.D. eligibility, interruption, resume, restart, timing correction, manual timing completion, cancellation, abandonment, and resolution commands record actor, reason where required, timestamp, state transition, and metadata in append-only declaration events. Declaration-backed actions cannot be changed through legacy pending-action correction controls because that would bypass the audit history.

The pure `calculateHasTheRun` result reports the nearest mechanically capable interferer, the exclusive maximum cost that stays ahead, the next reached Character, per-Participant inclusion explanations, active-action conflicts, and whether fiction still needs G.O.D. judgment. Holding remains capable; Passed and suspended state follow the authoritative Initiative engine. It selects no action and makes no tactical decision.

Open draft, locked, committed, rolling, ruling, or interrupted declarations block Encounter and Session closeout. Resolved, cancelled, and abandoned history remains readable. Pass 6 performs no Dodge, Parry, Block, Tackle, defense comparison, damage, Health, armor, ammunition, readiness, Aim calculation, Called Shot calculation, tactical selection, condition application, or automatic Reaction.

## Pass 7 Defense and Intervention Runtime

Pass 7 extends the existing `campaign_session_encounter_reaction` record rather than creating a second Reaction system. A Pass 7 row points back through an exact persisted responder opportunity to the locked action declaration and pending action. Its versioned declaration snapshot freezes responder, protected target, opposed Tackle identity, response type, exact source, governing Roll target, modifiers, cost, purpose, approval, author, and timestamp. Nullable additions keep legacy Reaction history readable. Append-only Reaction events preserve declaration, Roll, objective resolution, cancellation, cost reconciliation, and G.O.D. ruling history.

```text
Pass 6 locked action and pending action
                  |
      persisted responder opportunity
                  |
      existing Reaction plus frozen source
            /                 \
 immutable Roll ledger    append-only events
            \                 /
       Pass 1 objective comparison
                  |
 Initiative refund / pending-action extension
                  |
      explicit original-action disposition
```

Global `defense_skill_path_mapping` rows author approved Dodge endpoint Skills without hard-coded combat Skill names. Character resolution shares the exact weapon-governance allocation-lineage implementation, including canonical root-Attribute fallback and branch-ambiguity rejection. Parry and Block reload exact currently wielded ownership, Character weapon governance, and authoritative Item cost before commitment. Missing Item cost is never guessed.

The Roll barrier rejects initial response declarations after a related Roll and rejects any Roll until every Pass 6 opportunity is reconciled. One immutable attack slot belongs to the pending action; one immutable response slot belongs to each rolling Reaction. The server reloads their effective amendment history before comparison. A stored Roll alone performs no resolution.

Objective reconciliation is idempotent. Successful Parry/Block refunds are applied once; their full committed Item costs extend the one existing pending action through the shared Initiative engine. Original and additional costs remain separate, the timeline does not rewind, and prior responder opportunities are not duplicated. Critical collisions and general Interventions remain paused until an owning G.O.D. records a disposition. Service authorization permits a Player to declare or Roll only their assigned non-NPC Character's response; fictional eligibility, exceptional responders, Intervention adjudication, and critical rulings remain G.O.D.-only. Pass 7 exposed those governance controls only in G.O.D. Tabletop and left the Player surface to the later integration pass.

## Pass 13 Player Combat Console

Pass 13 integrates combat into the accepted `/realms/tabletop` console. It does not add a second Player route, Initiative model, Roll engine, firearm engine, defense engine, effect system, or EventSource. The server projects one exact assigned non-NPC Character only after verifying the active Session roster, Scene membership, Encounter participant, and Initiative entry. Other Participants contribute only target identity and public Initiative state; their equipment, private notes, user identities, and G.O.D.-only audit details are omitted.

The former `/realms/characters/[characterId]/encounter` entry point now redirects to the same Character selection in `/realms/tabletop`; its accepted Pass 11 implementation remains historical compatibility code rather than a competing live combat surface.

Player mutations reauthorize that same hierarchy independently. Hold and Pass delegate to the Initiative runtime. Weapon declarations derive current wielded identity and Initiative Cost on the server, lock through the Pass 6 declaration service, and use an advisory-locked submission identity to recover duplicate requests. Firearm preparation delegates to Pass 9 without exposing missing-cost overrides. Firearm attacks delegate to the corrected Pass 10 runtime; readiness, firing mode, ammunition, governance, target, Aim, defense allocation, damage proposal, and post-shot state are reread or frozen by that runtime. The browser cannot supply governing percentages, success counts, armor, soak, bullet allocation, damage, or authoritative ammunition state.

The shared declaration and defense services now admit the owning Player for objectively authorized completion/reconciliation paths. A Player may declare No Defense, unconditional Dodge, or an exact governed wielded Parry/Block and record their bound Roll. Ally defense, Tackle, general Intervention, exceptional eligibility, manual mechanics, critical disposition, timing correction, effect approval, and application remain G.O.D.-only.

`campaign_session_player_ruling_request` is the narrow persistent bridge for combat intent that cannot continue automatically. It freezes exact Campaign/Session/Scene/Encounter, requesting Character and user, source, optional exact Item instance, optional exact target participant (including a direct-Creature occurrence key), stated intent, requested timing, blocker, and relevant request facts. Status transitions and clarifications append events; the request is idempotent per Campaign, Player, and submission identity. G.O.D. review lives in the existing Heavens Tabletop declaration area. Called Shot approval stores the G.O.D.-assigned penalty and reason; a later Player firearm declaration must match that approved request's exact Character, target, firearm instance, objective, and location before it can lock.

Player-visible effect plans are read-only and limited to plans authored by or targeting the selected Character. Health, Mana, ammunition, inventory, and other effects remain unchanged until the owning G.O.D. approves and applies the existing Pass 8 plan. Every committed mutation emits the existing transaction-scoped tabletop invalidation and relies on the single Pass 12 Player live refresh for reconnect recovery.

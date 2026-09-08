# Supplement: encounter pause and later interface

User-authorized addition to the seven-pass backend assignment, 8 September 2026. Continue the current work; no replacement combat UI is part of this assignment.

## Freeze / Resume contract

Only the Campaign-owning G.O.D. can explicitly Freeze or Resume that Encounter. No written reason is mandatory. Persist the state across refresh, reconnect, and restart, and publish it to all authorized clients. Freeze/Resume must serialize with combat mutations: earlier committed changes remain, and later writes fail with “Combat is paused by the G.O.D.” without partial resource changes. Repeated requests set a desired state safely, never toggle it.

While frozen, every combat entry point, including retained integration paths, blocks declarations, defenses, combat Rolls, Initiative movement, combat resource spending, and consequences. Pause/Resume and authorized inspection remain available. Character and Creature details, HP by location, Mana, existing authorized results, and ordinary site navigation remain readable. Simultaneous choices and results remain sealed; availability information must not reveal a hidden choice.

Freeze preserves current Initiative, committed and remaining action time, Hold, unresolved responses, Rolls, Mana, ammunition, HP, effects, and the current Step/round. Combat-bound durations do not advance. Resume derives opportunities from that preserved state, without elapsed wall-clock catch-up, replay, refunds, or round restart.

The backend supplies each entity's authorized Initiative, current action/timing, current action/response availability, and concise blocking reason. Inspection remains possible regardless of availability. Projections include paused state and whether the current viewer can resume.

Focused validation must cover authorization, persistence/reconnect, readable paused information, blocked writes, concurrent Freeze/action ordering, repeated requests, pending-work resume without duplicated costs/effects, unchanged Step/durations, and privacy while a simultaneous group is sealed.

## Requirements for the later 90s RPG interface

- No portraits.
- Player screen: total HP, location HP, Mana, Initiative, target selection, and a command menu. Relevant options and Roll controls belong inside the chosen action.
- G.O.D. screen: compact combatant cards with name, Initiative, and short action/status text. Green means an action or response is available now; red means none is currently available. Every card also has an explanatory text label.
- Any card, including a red card, opens the same detail panel with that entity's information and relevant authorized controls. G.O.D. controls NPCs and Creatures; Players retain their own choices.
- Prominent Freeze Combat / Resume control and shared paused notice.
- Clear prompts for who can choose, what is underway, and whose input is needed next. Use the site's shared theme and authoritative engine projections.

Backend verification establishes mechanics. The later interface and live tabletop testing establish usability.

## Implemented backend handoff

The seven backend passes are complete; see the [Pass 7 evidence and limitations](../reports/combat-completion-pass-7-2026-09-08.md). This handoff records requirements for the subsequent screen assignment, not permission to build those screens now.

| Screen operation | Existing server action / contract |
| --- | --- |
| G.O.D. cards | `getGodCombatProjection(encounterId)` in `heavens/tabletop/combat-projection-actions.ts` |
| Player cards | `getPlayerCombatProjection(encounterId, characterId)` in `realms/tabletop/combat-projection-actions.ts` |
| Inspect a card | `getGodCombatEntityInformation` / `getPlayerCombatEntityInformation`; Player detailed resources are restricted to their own Character |
| Freeze / Resume | `setEncounterCombatFrozen(encounterId, frozen, expectedRevision)`; read the revision and resume authority from `pause` |
| Advance Initiative | `advanceEncounterInitiativeTimeline(encounterId, stateToken)`; round advancement likewise requires the observed token |
| Player movement / fleeing | `declarePlayerCombatMovement(characterId, encounterId, { movementMode, distance, intent, requestKey })` |
| G.O.D. movement | `declareGodCombatMovement`; use the exact controlled NPC or negative Creature occurrence |
| Arrival / return / withdrawal / confirmed escape | `changeCombatParticipation(encounterId, { participantId, operation, requestKey, expectedRevision, reason, movementMode? })`; operations are `arrive`, `withdraw`, `confirm-escape` |
| New direct Creatures | Existing Creature spawn action with a stable `requestKey`; active combat retries return the same exact occurrences |
| XP | `awardCombatExperience` or `finalizeEncounterCloseout` with `combatXpDecisions`; modes are `killer-only`, `full-to-each`, `shared-split` |
| Retained recovery | `getCombatRecovery`, `completeRetainedCombatEffectPlan`, `settleCombatEffectRemainder`, `withdrawCombatCheckpoint`; explicit owning G.O.D. decisions |

Each entity supplies `currentInitiative`, `currentAction` (label, status, original/elapsed/remaining time, expected finish), `canActNow`, `canRespondNow`, `canControl`, `canInspect`, `actionReason`, `responseReason`, `statusText`, and exact eligible response opportunity IDs. `participation` carries revision, departure status, reason and kind. Green is `canActNow || canRespondNow`; red cards remain selectable. Availability is an engine opportunity, not a promise that every source can pass its own cost, target or governance validation.

Keep public availability separate from control authority. The G.O.D. owns pause, participation and rulings, and controls NPC/Creature choices; Player Characters retain their Player choices. Use positive Character IDs and exact negative direct-Creature keys, never a Creature template ID in place of an occurrence.

Publish/reload through the existing Tabletop live invalidation subscription after committed mutations. Render the returned `pause.message` and `statusText`; use the checkpoint projection without guessing other actors' readiness from resources or request order. Retain original request keys for retries. A stale revision/token requires a fresh projection and a deliberate subsequent command.

Movement with flee intent must continue to show active participation until confirmed escape. A pending attack at departure can request a G.O.D. ruling; show that reason in the detail panel. No automatic escape Roll, additional opportunity attack or departure XP is implied.

A plan with only objectively declined consequences finishes automatically; do not prompt an empty Apply. An approved completed hit still needs its consequence application and cannot be discarded with generic cancellation. Historical completion can apply already-approved Health effects or finalize previously declined effects while preserving closed combat and audit history; it cannot replay source resource costs or duration-bound effects.

Use the shared theme variables for card surfaces, fields, controls and statuses. Provide text alongside green/red color. Keep portraits absent, one detail panel, action-contained options/Rolls, Player total/location HP and Mana, and prominent shared Freeze/Resume controls as specified above.

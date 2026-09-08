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

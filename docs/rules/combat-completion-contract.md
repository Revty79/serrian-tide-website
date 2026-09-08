# Combat completion contract

Authority: [Brannan's settled assignment, 8 September 2026](combat-completion-assignment-2026-09-08.md). Existing code and the earlier audit are implementation evidence. This contract introduces no replacement UI or alternate combat engine.

## Separate boundaries

1. **Declaration:** validate the controlled participant, exact source, targets, and current choice entitlement; freeze the choice and record its Roll. Starting a cast spends Mana here, exactly once. Invalid requests never begin casting.
2. **Simultaneous commitment:** capture everyone entitled to choose at this opportunity. Each locks its own action, Hold, or Pass. Neither server reads nor later mutations may expose/use another sealed choice or Roll. Reveal the group together when its commitments are complete. Future responders are not members of this gate merely because their Initiative lies inside an action's duration.
3. **Elapsed time:** retain current Initiative, duration committed, time spent, remaining work, and projected completion as separate values. Advance through intervening events. Recording a Roll does not complete elapsed work or apply consequences.
4. **Perception and response:** a numeric crossing is only a candidate. Awareness/fiction, lawful opportunity, and a chosen defense are separate. Use the existing explicit G.O.D. ruling where awareness is unresolved. An ongoing action alone does not prohibit a later legitimate defense.
5. **Opposed resolution:** preserve each original Roll and compare through the shared percentile/defense functions. A missed attack does not earn a successful-block refund: Goblin 2 spends 4, from 18 to 14. A block that stops an otherwise hitting attack costs the defender 1 and extends the attacker by the full defending weapon cost.
6. **Consequences:** apply supported source-specific effects at completion through the owning state services, with exact location/anatomy and before/after evidence. Preserve exceptional G.O.D. rulings. Ordinary extra successes, per-success spell damage, and firearm bullet allocation are distinct.
7. **Full Combat Step:** every still-capable combatant has started work, progressed ongoing work, or deliberately held. Include capable lower-Initiative actors. A declaration checkpoint is not a full Step. Refresh/retry/unchanged Hold do not count twice. Reconcile actors becoming unable to participate.
8. **Immediate effects:** effective Dexterity/movement/Initiative changes and expiration move current capacity, already-started completion positions, opportunities, and response windows immediately. Never retrospectively reroll. Temporary-effect recovery does not suppress its positive timing delta because the actor has debt.
9. **Persistence:** failure, interruption, or voluntary cancellation after casting begins never refunds Mana. An actual shot's later effect cancellation never refills ammunition. Already-applied results and immutable evidence survive cancellation/closeout. Each retry identifies and checks the original operation.
10. **Simultaneous outcomes:** an incapacitation at one completion point does not erase another action already completing at that point. Defeat value, credit, distribution, and actual XP awards remain separate decisions.
11. **Confirmed XP:** The owning G.O.D. chooses full Creature value for the killer, full value for every selected eligible Character, or an explicit shared split. "Everyone gets XP" means full value each. Additional encounter XP gives every selected recipient the full entered amount. These awards add together. Preserve occurrence attribution and exactly-once history; see the [Pass 7 XP clarification](combat-xp-clarification-2026-09-08.md).
12. **Freeze:** the owning G.O.D. sets the desired Encounter pause state with its observed revision. The Encounter write lock orders this with combat changes. Freeze preserves all committed work and combat duration boundaries; Resume never catches up wall-clock time. Inspection remains authorized and readable.
13. **Participation:** fleeing is an ordinary timed movement intent until the G.O.D. confirms escape. Withdrawal suspends the exact participant, keeps membership and history, and reconciles future work without cancelling already-due outcomes. Entry/return reuse canonical capacity and the existing Initiative row; leaving cannot clear debt, refill resources, or create a Combat Step. See the [arrival/departure contract](combat-arrivals-departures-2026-09-08.md).

## Rules to services

These are the implemented authoritative routes. The [Pass 7 report](../reports/combat-completion-pass-7-2026-09-08.md) records complete service encounters, validation and remaining source-specific ruling boundaries.

| Operation | Source / commitment | Timing and resolution | Application / retry identity |
| --- | --- | --- | --- |
| Weapon / Creature attack | `action-source-resolver-service`, `action-declaration-service`: exact weapon/occurrence attack, frozen targets/governance | `initiative-runtime`; declaration Roll via `defense-intervention-service`, shared `percentile-resolution` | `action-effect-plan-service` and owning Health service or occurrence state; declaration submission identity, one original Roll, one plan/effect application |
| Spell | Same declaration source route, actual known/personal Spell; no prepared-spell prerequisite | Roll and Mana at start, timing in existing Initiative engine; failed/interrupted cast retains Mana expenditure | Structured effects at completion via effect plan; cast-start expenditure belongs to the original declaration, not each retry |
| Item / ability | Exact owned item/instance or available ability via source adapters | Existing authored timing, governance, supported costs | Existing quantity/charge/consumption and effect services invoked once on the chosen route; no second legacy application |
| Movement / flee intent | `combat-movement-service`: exact authored mode and positive distance, `intent: move/flee` | Existing Initiative action and `getMaximumMovementDistance`; cost is distance divided by authoritative movement | Occurrence-local completed-segment history from actual elapsed Initiative; stable request key; no automatic escape |
| Dodge / Block / Parry / intervention | Persisted opportunity plus authority/awareness; `defense-intervention-service` | Declaration Roll; existing immediate/deferred commitment, opposed comparison and refund/extension | Exact reaction identity and resolution events; do not spend/refund twice |
| Firearm preparation / shot | `firearm-readiness-service`, `firearm-attack-service`: exact instance/mode/target/ammunition | Authored preparation/cycling/recoil; one original trigger Roll; sustained firing resolves each completed Initiative point | Existing ammo ledger and per-portion bullet plans; attack and portion identity; interruption preserves completed portions |
| Temporary effects | Owning Character modifier/condition services or exact direct occurrence | `initiative-capacity-service`, `initiative-runtime`, `duration-lifecycle-service`; effective changes at application/expiration | Character bindings and occurrence-local durations progress only on actual Step/round/Scene boundaries |
| Freeze / inspection | `combat-freeze-service`, `combat-projection-service` | Shared Encounter lock and durable desired state/revision; checkpoint-safe reads | `frozen_at`, `freeze_revision`; Player/G.O.D. live projections and resource inspection |
| Arrival / departure / return | `combat-participation-service`, retained enrollment and `creature-spawn-service` | Existing late enrollment; exact signed identity; future actions/responses and checkpoint reconciliation | Participation revision/request history in existing local state; stable Creature spawn key; no deleted membership |
| Recovery / closeout | `combat-recovery-service`, retained Health completion in `action-effect-plan-service`, `encounter-closeout-service`, `session-closeout-service` | Closeout checks all unresolved plans independently of declaration status; no generic cancellation of unsettled completed outcomes; all-declined generated plans finish automatically | Preserve applied receipts, spent resources and permanently sealed withdrawn Rolls; historical completion requires an explicit owning G.O.D. decision |
| XP | `combat-xp-service`, existing closeout recipient service and XP writer | Explicit Creature mode and full-per-recipient encounter award; whole shares with killer remainder for shared splits | Additive reward decision/source/request uniqueness; exact occurrence; immutable per-recipient award receipt |

Historical `pending_action_source` integration remains readable. New richer declarations use the declaration/effect-plan route; source costs and consequences must not also be applied through its legacy resolver.

All Initiative persistence, including retained server actions, now passes through `persistInitiativeEngineInTransaction`. It rejects a stale before-state and performs firing, movement, response and duration reconciliation in the same transaction. Advance commands also require the projection's `stateToken`; clients must reload after a stale request instead of advancing again automatically.

## Fixed trace authority

`scripts/fixtures/combat-completion-fixture.ts` preserves the supplied participants, Rolls, movement segments, and adjudicated first hit. Fixture Initiative is an explicitly authorized override, not a new production formula. The original trace ends with Mira at 18, the failed Bolt costing 3 Mana (20 → 17), and Goblin 3 starting its attack. Mira has not retroactively held or dodged. The invalid 94 Roll never belongs to an expected history.

Goblin 2's confirmed post-block value is 14; its next cost-4 attack projects to 10, crossing Rowan's 13. This projection is distinct from silently advancing past Mira's still-unselected next ordinary choice. The Hold variant is a separate explicit choice and uses the newly generated fixed defense Roll 36, obtained with `crypto.randomInt(1, 101)` during this assignment. It is not the discarded 94.

Missing Goblin general armor/attributes and universal anatomy are not manufactured. The first hit uses the explicit 11-damage/head-3-HP/severing ruling. Additional behavioral tests use separately identified authored synthetic sources and anatomy.

| Trace checkpoint | Required evidence/outcome |
| --- | --- |
| Rowan 26 | Declare longsword cost 6 and record 90/40; nominal finish 20. |
| Others 22 | Mira declares Bolt and records 12/40; Mana becomes 17. Goblin 1 declares block 20/50. Goblin 2 declares attack 55/50. Goblin 3 moves 4 feet to 20, then 2 to 19 and 2 to 18. Commit simultaneous choices before group reveal. |
| Rowan's first finish 20 | Apply the ruled 11 head damage to Goblin 1's 3-HP head; record severing, defeat, and value 3, with no award/distribution invented. |
| Rowan's legitimate dodge | Record 74/40 against Goblin 2; spend 1, leaving Rowan 19 with no damage. Do not reject solely because actions overlapped. |
| Rowan 19 | Declare next cost-6 swing, record 09/40, nominal finish 13. |
| Goblin 2 after its first swing | Its block 78/50 of the missed attack costs the full 4: 18 → 14. Its next cost-4 swing would finish at 10 and cross Rowan's 13. |
| Mira/Goblin 3 at 18 | Failed Bolt finishes with no damage and Mana 17. Goblin 3 begins attacking as the cast resolves; Mira has no established awareness. No defense Roll or cost exists for Mira; she remains 18. |
| Separate Hold variant | Mira explicitly commits Hold in that opportunity group. After all current choices lock/reveal, a legitimate aware response may use her retained Initiative and the fresh 36 Roll. This is never backfilled into the original trace. |

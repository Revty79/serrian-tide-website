# Combat completion: Pass 7 and backend handoff

Date: 8 September 2026. Branch: `main`, tracking `origin/main`. Starting commit: `683fe71` (completed Pass 6). Ending implementation commit: `72b023c` (`Complete combat participation, XP and historical outcome recovery`).

The seven-pass backend assignment now includes recovery, explicit XP decisions, movement, confirmed escape, withdrawal and return, with complete fixed-input service encounters. No replacement screen was built. Earlier UI removal and noncombat Tabletop functions remain intact. The [progress ledger](combat-completion-progress.md) records each preceding pass; the [rules-to-service contract](../rules/combat-completion-contract.md) and [screen handoff](../rules/combat-freeze-and-ui-handoff-2026-09-08.md) describe the integration boundary.

## Recovery and consistent persistence

Retained Initiative server actions now call the same transaction-owned persistence service as declarations. That service reconciles movement, sustained firing, response windows, source bindings and duration passage together. It rejects a stale before-state before any write. Timeline and round commands additionally require the projection's state token, preventing a repeated advance request from advancing twice.

Cancellation checks every consequence plan belonging to the declaration, including firearm portions. It preserves applied effects and receipts. An ordinary cancellation cannot silently discard a partially applied plan. The owning G.O.D. can explicitly decline only its unapplied remainder through `settleCombatEffectRemainder`; the event records preserved and declined effect IDs and does not refund resources. This recovery also works for retained plans inside already completed Encounters.

After the user selected the correct outcomes for the two historical plans, this pass also added `completeRetainedCombatEffectPlan`. It completes previously approved Health consequences through the normal effect receipts and Health services, or finalizes a plan whose effects are already declined. It requires owner authority, completed timing, revealed original choices and an explicit recovery reason; Freeze and transaction locks still apply. It does not reopen combat or replay resource costs. Historical resource/duration changes remain a separate explicit ruling rather than an automatic replay.

Completed actions with unsettled consequences now reject generic cancellation. Their due results must be applied or explicitly declined first. Completed Aim can still be abandoned because no shot has fired. Generated plans containing only objectively declined effects finish automatically with an explicit no-effects event, avoiding an empty Apply request. Critical outcomes still requiring a ruling are excluded from that automatic path. Failed-Roll explanations take precedence over a generic stopped-action label.

Closeout reports unfinished plans independently of the originating declaration's status. A cancelled declaration therefore cannot conceal an approved or partial plan. An open simultaneous checkpoint produces a generic blocker rather than revealing its hidden choices. `withdrawCombatCheckpoint` closes a stranded unrevealed group with an explicit G.O.D. reason, retains its Rolls permanently sealed, and keeps committed costs. Withdrawing a response group cancels its response, while preserving the incoming action from an earlier checkpoint.

Actual interruption of sustained firing ends its remaining shots. Restart/Resume of that interrupted declaration is rejected with a request to declare new firing; encounter Freeze/Resume preserves pending firing without cancellation. Completed portions retain their original Roll, ammunition and consequences.

## Arrival, departure and fleeing

`combat-participation-service` records the exact signed participant key, operation, reason, actor, revision and original request in existing encounter-local state. The Campaign-owning G.O.D. controls arrival, confirmed escape and withdrawal. Encounter locks, Freeze and revision/request checks protect all operations. Retrying an old withdrawal after return cannot withdraw the combatant again.

- Player fleeing uses `declarePlayerCombatMovement` with `intent: "flee"`. Existing authoritative movement supplies distance and Initiative timing. Requesting flight does not remove the participant or prevent targeting. Only G.O.D. confirmation changes participation. No escape Roll, fixed flee cost or automatic opportunity attack was added.
- Withdrawal suspends participation and preserves membership. Unfinished outgoing declarations and retained source-bound timing end without refunds. Their future responses are settled with costs retained. Completed incoming or outgoing outcomes remain applicable even when their Apply request arrives after departure. Fired sustained portions awaiting a ruling remain intact; unfired portions do not spend ammunition.
- An unfinished attack whose target leaves receives a specific G.O.D. ruling requirement. The engine does not invent whether that attack still connects or silently select another target.
- Uncommitted departing members stop blocking the current declaration checkpoint. Committed choices remain. Other choices remain sealed until the remaining required commitments are complete. Arrival does not retroactively join an open checkpoint.
- New Characters and persistent NPCs must be eligible unarchived Scene members and use existing late enrollment. Direct Creature spawning retains exact occurrence identity and requires a stable active-combat request key. Retries return the original occurrences.
- Return reuses the Initiative row and preserves current balance, debt, resources and history. Departed participants do not accumulate replacement round Initiative. Immediate effects still apply through existing services; duration bindings continue at their actual boundaries. Withdrawal itself neither cleanses an effect nor creates a Combat Step.
- Leaving is not death or defeat and creates no XP. The projection exposes participation revision, departure reason, status and availability; inspection remains available for red cards.

## XP rules and history

The existing recipient service and spendable-XP writer are reused. Positive Character IDs with an eligible authoritative XP profile include persistent NPCs under the existing rule. Direct Creature occurrences do not receive Character XP. Every recipient remains an explicit G.O.D. selection; participation or departure does not silently add/remove recipients.

| Decision | Result for a Creature worth 3 XP and two selected Characters |
| --- | --- |
| Killer only | Credited killer receives 3 |
| Full value to each | Each receives 3 |
| Shared split | Credited, selected killer receives 2; the other receives 1 |
| Additional encounter award of 10 | Each receives another 10, without division |

For three selected Characters, an explicit shared split of 3 gives 1 each; adding encounter XP of 10 yields 11 each. Full-value Creature XP plus that encounter award yields 13 each. Whole shares with the remainder to the credited selected killer implement the user's latest remainder clarification. Missing or ambiguous required killer credit needs a G.O.D. ruling. No killer is inferred from Apply request order.

Migration `0045_combat_reward_decisions` adds an immutable decision table and nullable decision link on existing award rows. Unique Encounter/source and Encounter/request keys prevent duplicate decisions, and decision/recipient uniqueness prevents duplicate increments. The exact defeated occurrence, authored value or explicit value ruling, credit, original request and awards are retained. Legacy unattributed awards stay unchanged and block potentially duplicate new awards until their history is reviewed. Completed closeout retries return matching original receipts; they cannot introduce a new award. Freeze blocks new XP writes.

Only spendable `experience` increases. Existing `totalExperience` represents advancement spending and is not an alternate award balance. Lifecycle deletion ordering and account attribution inventories now include reward decisions; the pre-existing checkpoint dependency is also included in explicit Campaign cleanup.

## Executable complete encounters

`scripts/combat-completion-trace-db.test.ts` runs the Rowan/Mira/three-Goblin exercise through actual source, declaration, defense, timing, effect and closeout services in both simultaneous submission orders. Fixed Initiative and Arc Bolt timing/Mana overrides belong to the supplied exercise. Production formulas are unchanged; additional numeric anatomy and sources are explicitly synthetic fixtures.

| Checkpoint | Verified outcome |
| --- | --- |
| Rowan from 26 | Original Roll 90 against target 40, cost 6, finish 20 |
| Choices at 22 | G1 Block 20, G2 attack 55, Mira Bolt 12, G3 movement 4 feet; group reveal waits for commitments |
| First hit at 20 | Explicit supplied ruling applies 11 to G1's 3-HP head, one severing record, defeat value 3; no automatic award |
| Rowan response | Dodge 74 costs 1, leaving 19; original attack/defense Rolls retained |
| Overlapping next work | Rowan Roll 09 finishes at 13; G3 movement history is 4, 2, 2 feet |
| Mira at 18 | Failed Bolt applies no damage; Mana remains 17 after spending 3 at cast start; no retroactive Hold or Dodge |
| G2 Block 78 | Missed attack grants no refund: G2 spends 4, remains 14; a subsequent cost-4 attack would finish at 10 |

The original trace stops before inventing Mira's next ordinary choice. A separately labelled completion continuation gives Mira an explicit Hold and G3 a fixed new attack Roll, preserves the supplied unawareness ruling, rejects the attempted 94 without recording/spending it, freezes/resumes unchanged work, cancels G3's future attack, and completes Rowan's miss at 13. The separate aware Hold variant in the participant suite uses the fresh Roll 36.

Final completion continuation: Rowan Initiative 13, Mira 18, G2 14; Rowan/Mira recorded health damage remains 0; Mira Mana 17; G1 retains 11 damage, severing and defeat. G3's one-Step fixture condition expires at the actual full Step and its movement history remains `[4,2,2]`. Explicit full-value Creature XP of 3 each plus encounter XP of 10 each adds 13: Rowan's spendable XP is 25 from 12, Mira's is 21 from 8. Repeated closeout retains exactly four award receipts.

The firearm suite also closes complete Player/NPC single-shot and burst encounters. Both use original declaration Roll 70, end firing at Initiative 21 and preserve cycling/recoil requirements. Starting with three cartridges, single fire leaves two and applies 5 damage; burst leaves zero and applies 15. Explicit encounter XP gives each selected Character 10 once. Repeated closeout neither refills ammunition nor repeats awards.

Additional sustained cases verify three firing points from 22 at 21/20/19, two cartridges per portion, and damage totals 10/20/25 from one original allocation. Interruption after 20 preserves four fired cartridges and 20 damage, leaving two cartridges. A later defense cannot cancel earlier applied bullets. Departure after a fired portion preserves its pending ruling and prevents the remaining portions from firing.

## Validation

The disposable PostgreSQL harness creates a new loopback cluster, applies all 46 repository migrations, executes real child TAP tests, stops PostgreSQL and removes its verified temporary directory. It rejects zero executed cases and a filter matching no script. No fixtures were inserted into the ordinary campaign database.

| Focused service suite | Passing cases |
| --- | ---: |
| Simultaneous checkpoints | 3 |
| Player/NPC/Creature ownership and Hold | 4 |
| Ordinary consequences and simultaneous defeat | 7 |
| Freeze, reconnect, inspection and actual lock races | 5 |
| Owned Spells, Mana and concentration | 11 |
| Immediate effects and duration expiration | 5 |
| Owned Items and Abilities | 3 |
| Firearms, sustained portions and departure | 12 |
| XP modes, authority, retries and actual concurrent awards | 6 |
| Recovery, movement, stale requests and historical completion | 7 |
| Complete fixed trace in both submission orders | 2 |
| Arrival, escape, withdrawal, responses, re-entry and retained bindings | 9 |
| **Total** | **74** |

Required checks passed: 1,261 feature tests across 145 files; TypeScript; ESLint; production Next.js build; Drizzle migration check; and Git whitespace check. The separate disposable account-deletion scenario passed, verifying fail-closed retained attribution and transactional deletion behavior with the new schema.

## Ordinary database and the two historical plans

The verified target was `localhost/serrian_tide_dev`. Immediately before this pass's migration, its applied ledger already matched all repository migration hashes through `0044`; those prior migrations were applied outside this agent's migration action. Only `0045` was pending. This pass applied that additive migration, leaving all 46 ledger entries matching and no pending migrations.

Before/after audits verified identical row counts and existing-value digests across 32 combat, resource, effect and history tables. Only newly additive fields are excluded from those digests. The [preservation result](combat-completion-db-preservation.json), [before audit](combat-completion-db-before-migration.json) and [after audit](combat-completion-db-after-migration.json) retain the evidence. No reset, seed or production deployment occurred.

The two already-completed-Encounter records were inspected individually before the user explicitly authorized their intended outcomes:

- **Plan 13 / declaration 13, Encounter 2:** an approved Longsword consequence for 8 localized damage to exact Creature `-4`, pool `HP-DOG-HEAD`, location 0. It follows a recorded critical 100 and five spent Initiative. The declaration is cancelled, but plan/effect remain approved. There is no applied timestamp or damage receipt.
- **Plan 14 / declaration 15, Encounter 2:** a Bite plan whose only damage effect is already declined. Its explanation records the action stopped by defense/intervention. The declaration is cancelled, but the parent plan remains calculated. There is no applied timestamp or damage receipt.

The original audit trail records `encounter-force-ended` at **2026-09-08 12:25:12 UTC**, cancelling both declarations with `noEffectsApplied: true`. Their enclosing effect plans were not reconciled. The old closeout checks considered declaration/timing state without independently checking every effect plan. Plan 14 also retained a calculated wrapper after its only effect had already been declined. Its original attack Roll was 8 against target 85 and failed; no successful defense Roll is recorded. The older generic defense/intervention message did not distinguish that failure from a defended hit. The event log identifies the force-end operation, but not its original client/caller; no writer using that event name remains in the current checkout.

The user's final instruction was to complete the approved head damage and preserve the correctly stopped Bite. The guarded local recovery script applied those instructions through the tested backend service:

| Historical record | Corrected state |
| --- | --- |
| Plan 13 / effect 12 | Applied once: Dog 1, exact participant `-4`, receives 8 damage in `HP-DOG-HEAD`; pool damage 0 -> 8, total damage 0 -> 8 |
| Plan 14 / effect 13 | Plan declined; its already-declined damage remains unapplied |
| Declarations 13 / 15 | Resolved with explicit historical-completion events; old force-end events remain |
| Encounter / Initiative | Encounter remains completed; runtime remains closed at round 1, Step 9, timeline 14 |

Dog 1's frozen head maximum is 5 HP. All 8 damage is retained rather than clamped away. Its total maximum is 45; no additional injury, kill credit or XP decision was fabricated beyond the approved effect. Retries returned the original application receipts. No records were physically deleted.

The [recovery receipt](combat-retained-plan-recovery-2026-09-08.json) and [recovery preservation check](combat-retained-plan-recovery-preservation.json) record the exact changes. A fresh [post-recovery audit](combat-completion-db-after-recovery.json) finds **zero unfinished plans**. The six changed tables contain only the intended occurrence damage, corrected declaration/plan/effect states and appended audit events; the other 26 audited tables have identical counts and digests. Initiative, Mana, ammunition, Character state and XP were unchanged. This authorized recovery is separate from the additive migration preservation check above.

Recurrence coverage now includes approved historical damage applied once after force-close, unauthorized/paused recovery rejection, preserved closed Initiative, automatically completed declined effects, an absorbed hit requiring no empty Apply, and rejection of generic cancellation while a completed hit remains unsettled. Current ordinary closeout entry points route through the service that checks all effect plans; cancellation of a declaration no longer hides an unfinished plan.

## Remaining boundaries for the screens

No new global rule question remains for these implemented flows. Missing authored numeric anatomy, armor, source timing/governance, exceptional criticals and unsupported free-text consequences still require the existing explicit G.O.D. ruling rather than invented mechanics. Whether an unfinished attack can still reach a departed target remains a case-specific G.O.D. judgment; completed outcomes are preserved automatically.

Movement records authoritative distance/time and leaves spatial escape confirmation to the G.O.D.; it does not introduce pathfinding. The fixed exercise is not a claim about universal anatomy or production-derived HP. The automated service evidence does not establish screen usability or replace later live tabletop testing. The next screen phase must use the authoritative projections, retained server controls and recorded portrait-free layout decisions.

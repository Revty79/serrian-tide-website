Serrian Tide combat engine completion plan

**Resumption notice:** [COMBAT-RESUME.md](../../COMBAT-RESUME.md) records the latest priorities and rulings. Its prohibition on responses during an unfinished action supersedes the permissions in this historical assignment. Apply its new-commitment affordability rule and retain the original trace as historical evidence.

Date: 8 September 2026

Status: Ready for Cody to implement. The rules questions raised during this planning walkthrough are settled. Execute all seven passes as one backend assignment.

Goal

Complete and reconcile the combat backend so it can maintain overlapping actions, legitimate responses, rolls, resource spending, damage, and ongoing effects without the G.O.D. manually calculating the Initiative sequence. Players and the G.O.D. still choose actions and make narrative rulings. The engine handles the bookkeeping and supported mechanical consequences.

The next deliverable is a verified backend suitable for connecting to a simple Initiative tracker and action menus. This plan does not start a replacement combat UI or a second combat engine.

Evidence and boundaries

The latest main verified during finalization is c223da89c4600a5fc2c1afd23199c74015189263, stepping back in order to move forward Combat. Its parent is the audit baseline, cda0362c570233c80d027f5864cef1a75a3b9298. Begin from the current intended checkout, read applicable repository instructions, and record the actual starting commit and local changes. Do not reset later authorized work to the audit parent. The finalization check verified branch metadata and parentage; it was not a full review of the new commit's diff.

This plan uses Cody's supplied Initiative, combat, and encounter audit, Brannan's walkthrough rulings, and a focused static review of the baseline declaration, defense, and Initiative code. The report's database and test results have not been independently reproduced in this review.

Cody reports reusable Initiative and percentile engines, action declarations, source snapshots, authoritative Character resource services, occurrence-local Creature state, firearm services, effect plans, and live updates. Reuse those foundations where they meet the agreed rules. The reported coexistence of integration generations is not proof of duplicate spending; it is a reason to choose and test one authoritative route for each operation.

Preserve the retained data model and historical evidence. UI deletion does not warrant a database reset. Introduce migrations only if an identified model change requires them. Use an isolated test database for mock combatants and mutation tests so fixtures do not enter ordinary campaign data.

Pass 1 — Establish the rules and the trace that will judge the engine

Work

Record the starting commit and account for the UI-removal changes.

Write a concise combat contract separating action declaration, roll recording, roll visibility, elapsed action time, perception, response declaration, opposed resolution, and application of consequences.

Identify existing service entry points for ordinary weapons, Creature attacks, spells, items, abilities, movement, defenses, and firearms. For each, name when Initiative, Mana, ammunition, charges, and effects are committed or applied, and how retries identify the original operation.

Create a deterministic trace of the Rowan/Mira/three-Goblin example using the fixed dice values already obtained. Build it around the existing engine and services. A readable trace is sufficient; no combat screen is needed.

Encode the confirmed rules below in the contract and tests. Do not reopen these settled questions. If implementation exposes a genuinely new ambiguity that changes an outcome, isolate it, ask one precise question, and continue independent confirmed work. Brannan's rulings are authoritative; existing code is evidence of implementation, not authority to change the rules.

Fixed mock combatants

These are the assigned values from our exercise. They are not claims that starting Initiative or every target was calculated from a complete authored Character sheet. Use explicit authorized fixture overrides where appropriate; test canonical derived-stat calculations separately rather than changing production formulas to force these numbers.

Value

Rowan

Mira

Each Goblin

HP

60

40

30

Starting Initiative

26

22

22

Weapon

Longsword

Staff

Shortsword

Base weapon damage

6

3

4

Weapon attack cost

6

4

4

Weapon attack target

40

50

50

Weapon block target

40

50

50

Dodge target

40

50

40

Armor soak

2

0

Not specified generally; apply Brannan's adjudicated first-hit result

Initial Mana

Not used

20

Not used

Defeat XP value

Not assigned

Not assigned

3

Mira's synthetic Arc Bolt targets one enemy, has roll target 40, costs three Mana and four Initiative, and deals two damage per success. Rowan's attributes are STR 50, DEX 50, CON 50, INT 35, WIS 40, CHR 35. Mira's are STR 30, DEX 40, CON 40, INT 60, WIS 50, CHR 40. Goblin attributes were not supplied. Goblin 1's head has 3 HP in the confirmed example; use explicit anatomy fixtures for other location tests instead of inventing a universal anatomy.

Confirmed facts for the first trace

Rowan starts at 26. His longsword costs six Initiative and has six base damage. His first swing nominally finishes at 20.

Mira and the three Goblins start at 22. Each Goblin has 30 total HP, a four-Initiative/four-damage shortsword, attack/block target 50, and dodge target 40.

Actions overlap. A participant's ongoing action does not impose a blanket ban on a later legitimate defensive response.

Rowan's first attack is 90 against 40. Goblin 1's block is 20 against 50. The accepted damage is 11. Brannan assigns the head location, with 3 HP, and rules that damage exceeding twice that amount severs the head and kills the Goblin.

Goblin 2 attacks with 55 against 50. Rowan dodges with 74 against 40. The dodge costs one, leaving Rowan at 19 after his first swing and dodge, with no damage taken.

Rowan then declares a six-Initiative swing from 19, nominally ending at 13. His roll is 09 against 40; Goblin 2's declared block roll is 78 against 50. Brannan subsequently confirmed that the block costs the full four Initiative because the incoming attack missed, despite the successful block roll. Goblin 2 goes from 18 to 14. Its next four-Initiative swing therefore has a nominal endpoint of 10 and crosses Rowan's 13. This cost branch matches the reviewed baseline code.

Brannan also confirmed the other block outcome: when a block successfully stops an attack that would otherwise hit, the defender spends only one Initiative and the attacker's action gains the full defending weapon cost in duration. For the shortsword this adds four Initiative of duration. Both confirmed block-cost branches match the reviewed baseline code and must be preserved and tested.

Goblin 3 moves four feet from 22 to 20, two more feet to 19, and two more feet to 18. It reaches striking distance of Mira at 18. These are this fixture's movement values.

Mira casts Arc Bolt from 22 to 18. Its casting roll must be recorded at declaration/start. The missing roll was later generated as 12 against 40: it fails and deals no damage when the spell finishes at 18.

Goblin 3 begins attacking as Mira's spell resolves at 18. Brannan rules that she does not yet know she is being attacked. The assistant's immediate dodge, its roll of 94, and its one-Initiative charge are invalid and must not enter the expected engine history. Mira is at 18 at that point.

Goblin 2's post-block position of 14 is now established by the confirmed cost. Its next attack endpoint of 10 follows from the four-Initiative weapon cost. Brannan has now explained the legitimate alternative for Mira: she may deliberately Hold at her simultaneous opportunity, then respond from her retained high Initiative after everyone currently eligible has declared. This is a separate choice from committing to a simultaneous ordinary action; do not retroactively invent a Hold in the original trace. Record defeat value 3 XP for Goblin 1 without inventing a distribution or Character award.

Further confirmed rules

Rolls: Rolls are made on declaration. For simultaneous declarations, everyone commits their choices before the declarations/results are revealed together at that declaration stage. Resolution/application still occurs at the action's proper point. Do not delay all rolls until action completion or until every possible later responder has acted.

Mana: Spend Mana when casting begins. There are no Mana refunds for failed, interrupted, or voluntarily cancelled casts once casting has begun. Mira's three-Mana Arc Bolt therefore changes her Mana from 20 to 17 despite its failed roll. Invalid/rejected requests that never begin casting do not constitute a cast, and replaying the same request must not spend Mana again.

Temporary effects: Dexterity, movement, and Initiative effects apply immediately. If an action has already begun, its Initiative/completion position must move to reflect the effect. This is an existing intended behavior to restore/integrate, not a newly proposed optional feature. Recompute affected opportunities and response windows consistently. Keep already recorded roll evidence intact; this ruling addresses timing changes, not retrospective rerolls.

Hold and simultaneous intent: When Mira and the Goblin can declare at the same time, Mira may choose Hold. After everyone currently entitled to declare has done so, she can use that retained high Initiative to respond. Choosing an ordinary action at the same opportunity is simultaneous with the Goblin's choice and does not give foreknowledge of it. This does not prohibit later legitimate defenses during an ongoing action.

Confirmed Combat Step and simultaneous-declaration rules

Brannan approved both definitions below.

Full Combat Step: Every combatant still able to participate has either started an action, made progress on an ongoing action, or deliberately chosen Hold. This may span several Initiative points. Combatants unable to participate do not prevent completion. Waiting for a lower Initiative opportunity does not, by itself, make an otherwise capable combatant permanently ineligible for that Step's accounting.

Current declaration checkpoint: All actors eligible to declare at the current Initiative opportunity finish committing their choices. This is distinct from a full Combat Step. A held actor may then use a legitimate response opportunity based on the newly established action context. Do not make that response wait for every lower-Initiative combatant in the encounter to take an action.

Simultaneous visibility: Lock everyone's choices in that simultaneous group before revealing the group's declarations and rolls together. Generate/record the roll with its declaration, preserve its identity, and reveal it at the group boundary. Enforce this in authoritative read projections and mutation rules; hiding a card in one client is insufficient. Submission order must not let a later participant choose using another participant's already-revealed result. Players and the G.O.D. still control their respective combatants.

The simultaneous group includes the actors entitled to choose at that opportunity, not every actor who might become a responder later during an action's duration. Hold interventions and new legitimate crossings can arise afterward. The gate for immediate simultaneous decisions must not recreate the blanket requirement to settle all future responses before making the original roll.

Step-based durations advance on the confirmed full-Step boundary. A refresh, retry, unchanged Hold status, or extra call that does not represent new action/progress must not create an additional Step or expire an effect. Reconcile the participating set when combatants become unable to participate; do not allow defeated actors to strand the counter. Cover continued actions, deliberately chosen Hold, and lower-Initiative participants in tests.

Additional focused code findings for implementation

At the reviewed baseline, capableParticipantIds selects active/holding participants whose current Initiative is at least the shared timeline point. reconcileCompletedCombatStep checks their lastSatisfiedStep. Starting an action and choosing Hold mark participation; spending time on an ongoing action also updates that marker. Thus the code's existing Step counter is not literally a check that every participant in the encounter has newly declared an action. Reconcile this implementation with the approved full-Step definition above. In particular, the set at the current timeline point is not automatically the set that must be accounted for across a full Step.

The reviewed applyDirectInitiativeDelta and changeNormalTotalInitiative update participant balances through replaceParticipant; they do not directly revise pending action expectedCompletionInitiative. Meanwhile, getNextInitiativeTimelineEvent derives completion candidates from current balance minus remaining cost, and reaction/window code also uses stored completion values. Trace the complete service path and make the scheduling calculation, stored timing, response eligibility, and projections agree after an instant effect. This static finding does not establish whether another caller currently repairs the discrepancy.

The old normal-capacity helper also has a penalty-recovery branch that can preserve a negative current balance rather than apply a positive difference. Review its actual callers against the confirmed immediate-effect rule; do not assume that recovery branch is an approved exception for temporary-effect application or expiration.

Source: baseline Initiative engine.

Evidence required

A rules-to-service map and the trace with fixed expected outcomes under the confirmed contract. Report only newly discovered outcome-changing ambiguities. This is a focused reconciliation, not another broad repository audit.

Pass 2 — Correct Initiative progression and response timing

Work

Keep actual current Initiative, committed duration, remaining duration, and projected finish distinct. In the reported engine, action time is spent as the timeline advances, rather than all elapsed time being applied at commitment.

Process intervening action starts, completions, movement segments, and legitimate responses in the correct order. Preserve simultaneous declarations and simultaneous outcomes according to the settled contract; client submission order must not create fictional foreknowledge or erase an otherwise simultaneous result.

Record rolls on declaration as confirmed by Brannan. Commit every choice in the current simultaneous group before revealing that group's declarations and results together. Preserve the original roll through later timing changes, refreshes, and retries. A stored roll must not automatically apply an effect early.

Separate a mathematical response window from awareness, a valid response opportunity, and the participant's choice to defend. Use existing G.O.D. confirmation/ruling facilities where judgment is needed. Do not require a new G.O.D. approval for every ordinary Player action that is already valid.

Apply dodge costs, block/parry commitments and any refunds/extensions, interruptions, and deferred costs exactly once. Recompute affected finish points and new response crossings without rewinding elapsed time.

Exercise Hold, Pass, ties, zero/negative balances, carry/debt, round transitions, and actions continuing across rounds. Valid participant enrollment and permission to start a particular action are separate questions.

Track supported movement distance and timing from authoritative movement data. Spatial judgment may remain with the G.O.D.; this work does not require a collision or pathfinding engine.

Evidence required

The Goblin trace must reproduce independently of request order through its supplied actions and outcomes. Add an explicitly declared Hold variant for Mira, using a fresh defense roll if she later dodges; never revive the invalid roll of 94. Add targeted cases for successful and failed block branches, no premature Mira dodge, group reveal after all commitments, a full Step spanning different Initiative points, ongoing-action progress and Hold participation, action extensions, instant modifiers, interruptions, simultaneous outcomes, and round boundaries. Expected values must come from the agreed mechanics, not merely repeat what the existing implementation returns.

Pass 3 — Make every combatant use the correct authoritative path

Work

Repair the reported positive-ID assumptions in combat controls. Real Characters and persistent NPCs use positive Character IDs; direct Creature occurrences use their exact negative runtime keys. Preserve strict ownership and Encounter membership checks.

Exercise two occurrences of the same Creature template to prove HP, conditions, targets, rolls, and Initiative remain separate.

Route each action through one declared commitment/application path. Reuse source-specific adapters; do not call both legacy resolution and effect-plan application for the same cost or consequence.

Resolve weapon and defense governance from real authored data and exact owned Skill allocations. Preserve approved fallbacks and G.O.D. overrides. Missing numeric or mapping data must produce a specific actionable issue, not a generic invalid-Character error or an invented mechanic.

Verify Player control, G.O.D. control of NPCs/Creatures, and read-only admin boundaries at the server.

Evidence required

Run the same supported action and defense through a Player Character, a persistent NPC, and a direct Creature occurrence. Demonstrate correct ownership, separate occurrence state, and one resource commitment on duplicate submission.

Pass 4 — Complete ordinary attack consequences

Work

Connect ordinary weapon and Creature attacks to the supported effect/resource services. Cody reports that their current adapters still emit manual damage instructions.

Calculate attacks and opposed defenses using each actor's target, modifiers, success count, and critical rules. Cover equality, 01, 00/100, and extreme targets. Keep unresolved critical collisions explicit rather than inventing outcomes.

Apply the correct source-specific damage rules. Ordinary weapon extra successes, per-success spell effects, and firearm bullet allocation are different calculations.

Resolve the hit location using the authored anatomy and established roll-location rules. Do not require a called shot for a normal attack to land on a specific location. Do not assume one Creature's location mapping applies to every anatomy.

Calculate supported armor, soak, damage type effects, and location/pool damage. Preserve the damage amount needed to judge severe location consequences before clamping HP.

Record supported injuries, severing, and mechanical defeat, with G.O.D. rulings for exceptional or unsupported consequences. Reconcile defeat with pending actions and simultaneous outcomes under the confirmed timing rules.

Keep exact before/after values and outcome evidence. A successful attack roll must not be presented as already-applied damage while its consequence is still pending.

Evidence required

Demonstrate the 11-damage/3-head-HP defeat, an ordinary nonfatal hit, armor absorption, a successful defense, and independent damage to two occurrences of one template. Prove retrying cannot apply the damage twice.

Pass 5 — Complete spells, items, abilities, and effect propagation

Work

Support the authored casting mode and governing source: Skill, Attribute, opposed, no-roll, or a specific manual ruling where the source requires it.

Spend Mana at cast start, record the declaration roll, and apply the effect at its proper completion point. Do not refund Mana for failure, interruption, or voluntary cancellation once the cast began. Preserve exactly-once spending on retries. Cover concentration and multi-round work where supported by the rules and source.

Apply supported structured damage, healing, conditions, modifiers, and resource changes through the same authoritative services. Multiple targets and continuing effects need explicit target identity and lifecycle handling.

Use actual owned spells and available Mana. Brannan's requested casting flow does not introduce a prepared-spell requirement.

Give direct Creature conditions/modifiers their correct duration behavior; do not assume Character-only duration bindings already cover occurrence-local effects.

Apply effective attribute, movement, and Initiative changes immediately, including shifts to already-started actions and their response windows. Keep computed and stored completion positions consistent. Cover expiration and existing debt under the confirmed immediate-effect rule.

Verify item/ability quantity, charge, consumption, and effect behavior through the chosen action path. Unsupported free text remains a precise G.O.D. ruling; it must not silently become numeric damage or a made-up effect.

Evidence required

Exercise an authored damaging spell, an opposed or resisted effect, a temporary modifier with expiration, an interrupted cast, a failed cast, and a consumed item. Verify ownership, Mana/charge changes, affected Initiative, and effect duration for Characters and direct Creatures where applicable. Arc Bolt's failed fixture alone is insufficient spell coverage.

Pass 6 — Verify firearms against the reconciled timing contract

Work

Retain the more developed firearm pipeline. Verify its integration with the corrected declarations, responses, timing, and effects rather than rebuilding it as an ordinary melee attack.

Cover readiness, drawing, loading/reloading, aiming, target changes, trigger pulls, cycling/recoil, and supported firing modes using exact weapon instances and authored costs.

Verify response opportunities, bullet hits/cancellations, ammunition spending, location damage, and called-shot behavior against the agreed firearm rules.

Preserve original submission identities. Cancelling or declining a later effect must not accidentally refill ammunition already spent by an actual shot.

Evidence required

Demonstrate the supported single-shot and multi-round-fire paths, insufficient ammunition, a legitimate defense, a target/aim change, and retry without duplicate shots or expenditure. An empty firearms table in the audited database is not runtime validation.

Pass 7 — Close the lifecycle gaps and prove complete encounters

Work

Define compatible states for declarations, pending timing, responses, effect plans, and applied resources. Resolve the reported case where cancelled declarations can leave unfinished effect plans inside completed Encounters.

Handle approved-but-unapplied and partially applied plans explicitly. Preserve historical evidence and inspect the reported rows before choosing any repair; do not automatically apply or delete them.

Make interruption, cancellation, retry, and failure recovery preserve the appropriate Initiative, Mana, ammunition, charges, and already-applied consequences.

Expire durations at the correct boundaries. Encounter/Scene/Session completion must not silently heal Characters, restore Mana, refill weapons, or erase injuries.

Keep defeat value, credit, distribution, and actual XP awards distinct. Record G.O.D. reward decisions with duplicate-award protection.

Verify reconnect/live refresh from authoritative committed state. Check that retained active combat cannot strand ordinary source use or Scene/Session completion while the old UI is absent; provide the appropriate authorized recovery route if such state exists in the target environment.

Evidence required

Run complete service-level encounters with fixed inputs: melee plus movement and casting, mixed Character/NPC/Creature participants, and a firearm case. Include a refresh/retry, a cancellation/interruption, an effect expiration, and closeout. Check final Initiative, HP/location state, Mana, ammunition/charges, conditions, and awards against the agreed outcomes.

Run the repository's required validation and the focused integration coverage for changed behavior. Report precisely what was exercised; a large passing test count alone is not a completed combat flow.

Completion standard

The backend is ready to connect to the new interface when it can:

Identify who can act or legitimately respond, and at which point, while actions overlap.

Retain committed actions and rolls while updating timing, costs, and consequences correctly.

Perform supported ordinary attack, spell, item/ability, and firearm calculations using real authoritative sources.

Maintain exact independent state for Players, persistent NPCs, and direct Creature occurrences.

Recover from interruption, failure, refresh, and duplicate submissions without corrupting resources or history.

Complete an Encounter with correct outstanding-work handling, durations, persistent resources, and explicit rewards.

The trace and tests establish mechanical behavior. The subsequent simple tracker and live tabletop testing must establish usability.

Complete assignment for Cody

This is the complete assignment covering all seven passes. The planning questions above have been answered and incorporated. Begin implementation; do not stop after returning another plan or audit.

Execute the full plan in dependency order. Passes 1 and 2 establish the timing foundation; they are not the stopping point for the assignment. Continue through participant integration, ordinary consequences, spells/items/abilities, firearms, and complete-encounter recovery and closeout.

Preserve and test the now-confirmed missed-attack/block-cost branch: Goblin 2 spends four and moves from 18 to 14. The successful-block branch is also confirmed: one Initiative for the defender and the full defending weapon cost added to the attacker's action duration. Rolls at declaration, Mana spending without refunds, immediate temporary effects, and the Hold-after-simultaneous-declarations sequence are now recorded. The full Combat Step boundary and simultaneous commitment/reveal ordering are also confirmed above. Preserve these decisions throughout the implementation.

For each pass, leave a reviewable commit and record the starting/ending commit, changed behavior, focused validation, and any remaining limitations. Continue through the remaining passes without requesting approval for routine implementation choices already covered by this assignment. Reuse already-confirmed rules and functioning services. Any newly discovered ambiguity that materially changes outcomes needs a specific rules question; do not silently choose a new Serrian Tide rule or conceal the gap behind a passing test.

The final implementation result must include the executable trace, the agreed rules-to-service map, the completed backend changes, focused and required repository validation results, complete encounter results checked against the agreed expectations, and remaining limits that matter for the new interface. The new combat interface follows this backend work. Preserve the existing noncombat tabletop functions and shared data services while carrying out this assignment.

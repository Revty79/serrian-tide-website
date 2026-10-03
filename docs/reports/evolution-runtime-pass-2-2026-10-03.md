# Evolution Runtime Pass 2: historical Return during Encounters

Started from `13c68529795a0079739658421026906838a2644c`. Existing historical Return now works during an unfrozen active Encounter at the same clean participant boundary as forward Evolution. This pass changes boundary integration, transactional refresh and presentation; the historical reversal calculations and permanent mutation fields remain unchanged. No schema change, shared migration, Production write or push.

## 1. Existing historical Return

The server still selects the latest unreversed forward event whose destination matches the individual's current definition. The request's event ID is an assertion of the reviewed candidate, not permission to choose another ancestor. Return uses immutable event provenance, including the original Race adjustment contribution or Creature source snapshots. Historical archived/creation-disabled source behavior, current Campaign-owning G.O.D. authority, Skill grant validation, Health/override consent, review tokens and durable idempotency remain in place. It does not rerun today's forward path or infer lineage from masters.

## 2. Shared Encounter boundary

Removed the separate blanket `readReturnEncounterBlockers`. Forward preparation, Return preparation and sheet state all call `readEvolutionEncounterBoundary`; execution repeats preparation under the existing shared transaction fence. There is one lifecycle classification for both operations.

An active Encounter must be unfrozen, and the individual must have no unfinished mechanical involvement as actor, target, protected target, responder or effect subject. Completed history and unrelated combatants' actions do not block. A planned identity-only participant remains allowed; prepared snapshot/local state, Initiative runtime/enrollment, frozen state or unfinished preparation blocks. No prepared state is rewritten.

| Runtime tables | Unfinished blocker |
| --- | --- |
| `campaign_session_encounter_declaration_checkpoint` | Unrevealed checkpoint involving the individual. |
| `campaign_session_encounter_action_declaration` | Draft, locked, committed, rolling-ready, rolling, awaiting-god-ruling or interrupted involvement. |
| `campaign_session_encounter_pending_action` | Active/interrupted action involving the individual. |
| `campaign_session_encounter_pending_action_source` | Pending/needs-ruling source outcome under unfinished applicable lifecycle, including structured grouped targets. |
| `campaign_session_encounter_reaction` | Declared/needs-ruling defense or reaction involving actor, reactor, target or protected target. |
| `campaign_session_encounter_responder_opportunity` | Pending/response-declared involvement with unfinished parent action/declaration/reaction. |
| `campaign_session_encounter_effect_plan`, `campaign_session_encounter_effect` | Unreviewed/unapplied plans or unfinished subject effects, including an applied-labelled plan with unfinished effects. |
| `campaign_session_encounter_firearm_attack` | Unfinished actor/target attack or firing portions; completion is established from Roll, action/declaration, portions and terminal plan, rather than a historical attack status label. |
| `campaign_character_firearm_preparation` | Pending/interrupted/requires-god-ruling preparation. |
| `campaign_session_player_ruling_request` | Pending/clarification-requested source/range/Called Shot ruling bound to unfinished action/reaction/firearm work. |
| `campaign_session_called_check_request` | Pending/answered/requires-god-ruling recipient check scoped to this Encounter or its Session/Scene. |

Membership, Session, Scene, Encounter and Initiative rows provide context. The retained fact fence also includes firearm bullets and Called Check batches; their existence alone is not a blocker. Resolved/cancelled/abandoned declarations, terminal plans/effects and completed parent opportunities remain historical. Neutral High/Low requests do not depend on Race/Creature mechanics. Pass 1's classification rules were retained, with shared blocker wording updated to name Return as well.

## 3. Race live Return

The prior Race becomes current on the same PC or Race NPC. Return removes only the recorded Evolution Attribute and HP/movement/magic-step contribution from current permanent values. Current restored Race readers immediately supply anatomy, Natural Attacks, Natural Protection, Interaction Rules, Size, movement, racial grants, caps and Base Magic. Existing retained-historical-Race behavior permits the approved archived/creation-disabled historical source without altering Campaign allowlists.

## 4. Creature live Return

The persistent positive Creature NPC receives the original event's historical baseline and prior current snapshot. The existing normalization applies its current HP Adjustment. Later master edits cannot substitute current master mechanics for the historical snapshot. Attack, ability, defense, anatomy, armor/Soak, Skill, Attribute and Interaction Rule readers continue using the authoritative individual snapshot. Negative direct occurrences are rejected before execution.

## 5. Initiative and participant preservation

Return never writes participant/enrollment/Initiative rows. Character ID, participant serial ID, current Initiative position, round, step, timeline, Hold/Pass status, controller and Scene/Encounter membership remain exact. It creates no action, cost, turn or DEX-based repositioning. Database and browser tests compare persisted participant and Initiative rows, including retries.

## 6. Health and injuries

Stored total/pool damage, unresolved injuries, resolved injury history, limb/incapacitation state and Health history remain unchanged. Returning anatomy determines the new view: the original exact pool identity becomes valid again; an evolved-only pool becomes orphaned. Tests give distinct pool IDs the same display name and verify no name matching or redistribution. Existing zero/low remaining HP warnings and consequence acknowledgement remain authoritative. Return does not heal, revive or add death handling.

## 7. Active effects and durations

Conditions, Modifiers, duration bindings, periodic effects and their history remain attached to the same individual. Tests retain a duration-bound Condition, permanent Modifier, periodic Health effect and limb state, including references to an evolved-only pool. Return neither duplicates effects nor deletes/retargets unresolved anatomy references.

## 8. Inventory, equipment and ownership

Stacks, quantities, worn/wielded state, Item instances, charges, magazines, custody and containers retain existing records. Tests compare all unrelated public tables and populate worn instances and weapon stacks. Owned Creature links and an evolving Creature's owner survive; companion/disposition/Vessel and Campaign/controller fields are not transition-owned. Equipment fit remains a review warning, with no automatic refitting or unequipping.

## 9. Combat source refresh

Both permanent operations now call `publishPermanentTransition` inside their execution transaction. It sends the existing Character-state invalidation and an all-participant invalidation for every active Encounter in the copied boundary context. Existing combat readers discard evolved attack choices and expose restored choices immediately. Incoming-target reads use restored protection, Interaction Rules and anatomy; no Return-specific attack or damage calculator was added.

## 10. Three periods of combat history

A regression completes a source Race attack, evolves, completes an evolved attached-Magic attack, Returns, then completes a restored-source attack. All prior Encounter tables remain byte-for-byte equivalent across Return. Locked declarations, Rolls, defense outcomes, damage/effect plans, effects and resource evidence are not rebuilt from current definitions. New actions use restored mechanics.

## 11. Later Race advancement

PC and Race NPC tests add Attributes, HP multiplier, movement and magic steps after Evolution, plus a learned/purchased Skill allocation, XP and Quintessence. Return subtracts only the original contribution and preserves those later values. It compares all non-transition profile fields and every Skill allocation row; it does not restore an old whole-character snapshot or clamp saved advancement.

## 12. Creature overrides

Current HP Adjustment alone remains outside meaningful override detection. A post-Evolution Attribute edit is detected, previewed and rejected without `confirmReplaceOverrides`; confirmation restores historical definition-owned mechanics using current HP Adjustment. All unrelated current profile fields survive. Browser coverage also checks the disabled confirmation button until override consent is supplied. No three-way merge was introduced.

## 13. Magic history

The evolved attack regression completes both ordinary damage and its authored attached construction effect before Return. Their applied records and frozen construction remain unchanged afterward; the new restored attack uses the source definition's Magic state. Existing Combat Pass 4 regression suites cover the shared adapters. No new Magic semantics or historical re-adaptation was added.

## 14. Runtime Return evidence

The existing Return event evidence JSON copies Encounter ID/name/type/status, Session and Scene IDs/names, participant ID/status, current Initiative, round, step, timeline and the clean-boundary result. No new table is needed. History renders the copied context as recorded at **Return**. Out-of-Encounter previews/events retain the existing shape without runtime context.

## 15. Concurrency and retry

Return keeps the common durable-key advisory lock, fresh Campaign-owner authorization, fact-table fence, Campaign/Encounter/individual locks and transactional permanent write/event insert. A new operation after preview blocks commit. A real action writer waiting behind Return acquires the Encounter lock after commit, rereads restored mechanics, rejects its obsolete evolved source and rolls back. Same-key concurrent Return creates one event and one transition; conflicting reuse errors. Lost-response retry returns that event without another Initiative change or notification.

PostgreSQL delivers invalidations only at commit. A listener test verifies Character and all-participant Encounter messages on success, no messages on rollback, and no repeat messages on replay. The existing conservative fact fence is retained: contention can require refreshing/retrying even when a concurrent writer concerns other records. No lock redesign or partial state was introduced.

## 16. Cycles and chains

Race and Creature tests cover A → B → Return A → B again, then B → C → Return B → Return A. The latest unreversed matching forward event remains the next Return candidate; older reversed events cannot be reused or selected by the client. Each operation creates separate immutable provenance. Re-evolution rejects a stale path version and succeeds only after fresh preparation under current path authority.

## 17. Freeze and closeout

Frozen active Encounters clearly block Return. Resume followed by a clean boundary permits it. Both normal Initiative closeout and force-end leave the restored Race permanent and preserve the Return event. Existing out-of-Encounter regressions also cover all Encounter types and planned/completed records.

## 18. Existing UI

Character, Race NPC and Creature NPC controls retain the existing review dialog and execution service. They now show the same live boundary for Evolution and Return: Encounter, Session/Scene, status, Initiative, round/step/timeline, availability and exact blockers. Review retains historical destination, Race delta reversal, Creature override consent, Health and equipment warnings. History identifies Return runtime evidence accurately. No combat-screen Return editor or Player-direct operation was added; stale Form preview/print selection cleanup remains unchanged.

## 19. Verification

All required validation passed:

| Verification | Result |
| --- | --- |
| Full Evolution disposable run | **173 cases across 15 suites**, including Evolution Passes 1–5, Runtime Pass 1 (19), new live Return (18), Race/Creature authoring, ownership, commerce/equipment and lifecycle. |
| Final expanded live Return rerun | **18/18**, adding nonzero Skills/XP/Quintessence, worn instances, restored protection/Interaction Rules/Base Magic and all non-transition profile-field comparisons. |
| Complete combat disposable harness | **522 cases across all 30 suites**, plus the passing harness test. Includes Race Natural Attacks, Creature Attacks, Magic, incoming protection, Health/injuries/limbs, Conditions/Modifiers/durations, inventory/equipment, declarations/effects, Initiative/freeze/closeout and firearms. |
| Evolution/Return browsers | Existing authoring, requirements, destination creation and historical Return flows pass. Live forward/Return flows pass for PC, Race NPC and Creature NPC; frozen Return, Creature override consent, lost-response replay across sheet reload, exact Initiative/participant preservation and open combat SSE refresh in both directions. |
| Unit suite | **1,883/1,883** across 210 feature test files. |
| Static checks | Next type generation, TypeScript, lint, Drizzle metadata and whitespace pass. No lint warnings in the final run. |
| Migration rehearsal | Fresh **93-migration** chain; populated upgrades preserve prior tables and immutable history. No shared migration applied. |

Desktop and 390px browser screenshots were inspected, including Return consent/Health/equipment review, Creature override warning, live boundary/history and restored combat display. Existing print/Form-reference browser regressions also passed. These automated checks do not replace hands-on acceptance. No Production build, deployment or shared-environment smoke test was performed.

Evidence under `artifacts/guidance/`: `evolution-return-runtime-full-browser.log`, `evolution-return-runtime-focused-final.log`, `evolution-return-runtime-combat.log`, `evolution-return-runtime-unit.log`, `evolution-return-runtime-typegen.log`, `evolution-return-runtime-typecheck.log`, `evolution-return-runtime-lint-final.log`, and `evolution-return-runtime-drizzle.log`. Browser images are under `artifacts/guidance/creature-evolutions/runtime-return-*`.

Test matrix mapping: historical behavior/authority/archived sources and planned Encounters are covered by Pass 5; matrix 6–45 by the three live preservation cases, shared-boundary cases and existing runtime suites; 46–49 by the completed three-period attached-Magic case; 50–54 by Race/Creature cycle-chain, concurrent retry, stale preview and waiting-writer cases; 55–58 by Freeze/Resume and normal/forced closeout cases. Existing shared incoming-effect tests verify application using the restored readers' protection contract.

## 20. Remaining work before Forms

No additional Evolution runtime feature is required by this pass. Hands-on Brannan/Ember acceptance and separately authorized shared migration rollout remain outstanding. Existing migrations `0087_evolution_history_returns.sql` and `0092_race_natural_attack_runtime.sql` were tested in disposable databases only; this pass did not apply either to shared DEV or Production.

The retained fence's contention behavior, existing orphan/unresolved anatomy handling and authored/runtime limitations remain as described above. Forms still have no authoritative active state. Future direction must explicitly decide Evolution/Return while transformed, including whether a Form exits, remaps or blocks. No Form runtime, timing/cost, automatic trigger, Player execution, Special Ability, companion runtime, new Magic system or Worlds work was started. Do not begin Forms or push automatically.

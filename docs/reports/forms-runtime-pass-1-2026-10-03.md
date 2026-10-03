# Forms Runtime Pass 1: lifecycle foundation

Baseline: `aca7345e51df2f3dcd849258bb9c67179853fbea`. This pass records Current Form and executes Enter Form / Return to Normal. **Normal mechanics continue to govern play.** No Forms Pass 2/3 mechanics, new Magic, Special Ability runtime, companion combat or Worlds changes are included. No push or shared database change is authorized by this pass.

## 1. Existing foundation

The [pre-implementation audit](../architecture/forms-runtime-pass-1-audit.md) was written before schema/code changes. Existing authoring, normalization, exact owner-local keys, Access evaluation, detached previews, Character Form references/printing and transformation vocabulary are reused. No second Form calculator was introduced.

## 2. Persistent model and migration

Forward migration `0093_form_runtime_state.sql` adds three tables: `campaign_character_active_form` (one positive individual, one exact entry), `form_transition_event` (immutable enter/return evidence), and `form_transition_request` (durable request identity, frozen review, paid resources, pending Initiative link and outcome). Typed Race/Creature columns and checks retain identity distinctions. Composite references prevent another individual's event becoming current. Return references its exact unreturned entry. Database triggers reject event updates and invalid provenance. Campaign deletion explicitly removes the scoped graph; ordinary individual/source/user deletion remains protected by history.

The migration does not infer or backfill state. The full 94-migration chain and populated upgrade rehearsals run only in temporary localhost databases. Existing shared migrations, including Evolution/Return and Race Natural Attacks, and new 0093 require separately authorized rollout. No shared DEV/Production migration or data write was performed.

## 3. Race identity

Entry resolves the saved current Race ID, exact Race Form database ID and stable key. Foreign Race Forms, wrong IDs and stale reviews fail. The full normalized Form mechanics/transformation definition, Access evidence and source digest are frozen. Deleting or editing the live Form does not rewrite an entered Form or its exit rules/history.

## 4. Creature identity

Persistent Creature NPC entry reads `campaign_creature_npc_profile.current_snapshot_json` and resolves the exact snapshot-local Form ID/key and Creature identity. It never obtains Forms from today's Creature master. Frozen definition and snapshot digest survive master edits. Negative direct Encounter occurrences are rejected.

## 5. Current versus Normal

No active row means Normal. Enter creates an entry event and current reference atomically. Return removes that reference and adds an event linked to the original entry. It does not restore a Character snapshot. Repeated cycles have separate immutable entries; repeated Return while Normal is a clear error. Changing directly between Forms requires an explicit Return first.

## 6. Access

The existing AND/OR evaluator uses saved Normal Attributes, purchased Skill paths, racial possession, Derived Ability possession, or Normal Creature snapshot facts. Form bonuses cannot qualify their own entry. Locked automatic requirements cannot be bypassed by G.O.D. rulings. Manual Access needs a recorded reason. Reviews are re-evaluated under the execution fence; pending completion rechecks saved facts against frozen requirements.

## 7. Authority

A current owning Player with Campaign membership may execute their own eligible PC's supported voluntary transitions. NPCs require the current Campaign-owning G.O.D. Creature ownership does not grant transformation control. Admin alone, another Player and another Campaign's G.O.D. cannot execute. Identity, roles, ownership and archival state are read from the server. Delayed completion rechecks the initiating authority.

## 8. Entry methods

Voluntary/either permits eligible Player entry. Involuntary, custom and unspecified control require explicit Campaign-owning G.O.D. evidence. Authored involuntary trigger definitions remain visible and their manual confirmation is recorded. No event watcher triggers a transformation.

## 9. Exit methods

Player Return requires an explicitly voluntary exit and executable exit requirements. Other authored exits require G.O.D. evidence. Return uses the entered Form's frozen exit timing/costs and shared changing conditions, which are independent of entry timing/costs. No currently authored separate exit-condition field was invented.

## 10. Timing

Instant operates at a clean boundary without Initiative mutation. Authored Initiative uses the existing pending-action engine, opportunity/affordability checks, elapsed expenditure, interruption and completion lifecycle. State changes only when timing is complete and other involvement is clean. Entry and exit use their own costs; retry never spends again or grants a turn. Completed timing can wait for a later clean boundary and can be completed/cancelled from the existing sheet.

Descriptive Time outside active Encounters requires explicit confirmation. Time in combat, Initiative without an Encounter, custom and unspecified timing need a G.O.D. ruling that explicitly selects instant completion or an existing Initiative action with a stated cost. Text is never parsed into a clock. Where multiple active Encounters exist, the review can select the timing owner while inspecting every participation boundary.

## 11. Resource costs

Exact canonical Character Mana uses the existing transactional pool reader/spender. Combined same-pool costs are checked together; separate entry/exit spending is durable. Costs are paid when a timed transition starts, following the existing pending-action approach. Cancelling retains already-spent resources/elapsed Initiative.

Health without an exact pool/application, ammunition without an owned instance, named/custom resources without a canonical owner, unresolved Mana and unspecified cost mode require explicit G.O.D. resolution. Creature NPC Mana remains manual because no matching canonical Character Mana pool exists. Manual rulings record what the G.O.D. resolved; they do not fabricate resource mutations or mean free. Players cannot resolve these costs.

## 12. Conditions

Existing typed ability-condition fact producers supply Health, equipment, active condition and Encounter facts. Known false conditions block. Unknown/manual/event conditions need explicit G.O.D. evidence. Notes and names never become mechanical facts. Pending completion checks current facts again; invalid completion remains pending with a visible reason and can be cancelled.

## 13. Involuntary/custom controls

G.O.D. rulings are mandatory fields, retained with the initiated/authorized user, authority, authored rules and command. Missing evidence fails on the server. There is no automatic damage, moonlight, XP, Skill or other trigger.

## 14. Pass 3 lifecycle boundary

Duration, involuntary triggers, limits, refresh scopes, cooldown and equipment notes remain frozen and displayed. No hidden counters, timers, expiry, condition-end or resource-depletion Return were added. Known unresolved limits/cooldown (including unspecified limits) require G.O.D. evidence instead of Player bypass. Already-entered Forms survive Encounter completion; unfinished requests cancel at normal/forced closeout.

## 15. Shared Encounter boundary

`readParticipantTransitionBoundary` is the single classifier used by forward Evolution, historical Return, Form entry and Form Return; the old Evolution export remains a compatibility alias. It inspects participant involvement, not table existence. Completed history and unrelated individuals' actions remain nonblocking. Frozen active and prepared planned Encounters block; an identity-only planned membership remains allowed.

| State | Unfinished involvement inspected |
| --- | --- |
| `campaign_session_encounter_declaration_checkpoint` | Unrevealed membership or involved declaration |
| `campaign_session_encounter_action_declaration` | Actor/target in nonterminal draft, lock, commitment, Roll/ruling/interruption |
| `campaign_session_encounter_pending_action`, `_pending_action_source` | Active/interrupted timing, unresolved actor/target source evidence |
| `campaign_session_encounter_reaction`, `_responder_opportunity` | Actor, defender, protected target or pending eligible responder |
| `campaign_session_encounter_effect_plan`, `_effect` | Unapplied/review-required source or target subject |
| `campaign_session_encounter_firearm_attack`, `_firearm_bullet`, `campaign_character_firearm_preparation` | Unfinished firearm source/target/portion/preparation |
| `campaign_session_player_ruling_request` | Unresolved ruling linked to relevant live work |
| `campaign_session_called_check_request`, `_called_check_batch` | Unresolved exact recipient at Encounter/Scene/Session scope |
| `form_transition_request` | Another pending transformation |
| Encounter/participant/Initiative records | Freeze, planned preparation, current membership/context |

Only the completing Form request and its own Initiative action are internally excluded. An external caller cannot bypass other blockers.

## 16. Evolution coordination

Active Form and pending transformation requests block forward Evolution and historical Evolution Return with a Return-to-Normal/finish-or-cancel explanation. Forms are never silently cleared, carried or remapped across permanent changes. Normal Evolution/Return continues unchanged and future Form choices resolve the new exact permanent source. Historical Form entries remain historical. Ordinary sheet Race reassignment also requires Normal with no pending transformation, so a pre-creation or G.O.D. edit cannot strand an active Form against a different normal Race. Ordinary advancement and same-Race edits remain available.

## 17. History, retry and concurrency

Events retain full Form/transformation evidence, exact source identity/digest, Access/condition facts, initiating authority, rulings, paid Mana and copied Encounter/Session/Scene/participant/round/step/Initiative evidence. Source library edits cannot rewrite it. Pending requests retain their original frozen rules; current eligibility is rechecked at completion.

Successful-key replay reads the immutable receipt before fencing unrelated runtime writers, after checking current read authority. Durable keys plus request hashes reject changed-input reuse; advisory serialization makes simultaneous same-key retries return one receipt/event. Entry, costs, current reference and event commit or roll back together. The existing short, fail-fast Evolution fact/Encounter fence is extended to Form state and its resource facts. It can temporarily reject unrelated concurrent writes; callers receive a refresh/retry explanation. This preserves the existing conservative concurrency tradeoff rather than introducing a weaker lock convention.

A real waiting combat source writer re-reads committed Form identity after the lock and freezes actor/target Form identity as evidence while still resolving Normal mechanics. Earlier actions/results are never recalculated. Live invalidation is transactional; rollback/retry publishes no duplicate transition notification.

## 18. UI and tabletop

Separate Current Form controls appear on Player Character, Race NPC and Creature NPC sheets, alongside detached View Form. They show Normal/current identity, Access, authored rules, costs/timing, exact Encounter blockers, G.O.D. review fields, pending status and history. Unsaved sheet edits disable execution. Durable browser storage preserves the exact confirmed request across a lost response/reload. Existing SSE refresh updates open sheet/combat identity without recreating the Encounter.

The interface explicitly says Normal mechanics remain until Forms Pass 2 and duration/limit/cooldown automation remains pending Pass 3. Combat choices remain Normal. Shared semantic theme variables, labelled guidance and bounded scrolling dialogs are used.

## 19. State preservation

Only Form lifecycle records, authored supported resource spending and normal Initiative timing change. Instant entry/Return preserve every other table byte-for-byte in disposable state comparisons. Tests seed damage, orphaned pools, unresolved/resolved injuries, limb state, Conditions, Modifiers, periodic effects, duration bindings, worn Items/charges and owned Creatures. Character/participant identity, ownership/controller, Race/Creature baseline/current snapshot, inventory/custody and unrelated advancement remain intact. New Normal attack choices/protection/anatomy remain unchanged even when the frozen Form authors different mechanics.

## 20. Verification

| Verification | Result |
| --- | --- |
| Dedicated Forms runtime database suite | **64/64** cases, including immutable cycles, all three individuals, frozen snapshot identity, authority/Access, costs/conditions, Initiative entry/exit, preserved populated state, ordinary Race reassignment, concurrent writer/replay, rollback notifications, and actual normal/forced closeout. |
| Evolution Passes 1-5 and Runtime Passes 1-2 | **94/94** existing cases. |
| Race/Creature Form authoring, mechanics, preview/Access, snapshot, ownership/commerce/lifecycle and upgrade suites | **79/79** existing cases. Together with the two rows above: **237 distinct database cases**, verified through full and focused runs. |
| Full combat disposable harness | **522/522** cases across **30 suites**; includes Race Natural Attack Pass 2, Creature Attack Pass 3, incoming protection, Health/injury, resources, effects/declarations, Initiative/freeze/closeout and equipment. |
| Normal unit suite | **1,883/1,883**, 210 feature files. |
| Existing Evolution/Return browsers and Character Form printing | Passed existing authoring/execution, all three live Evolution/Return flows, Form/print refresh and read-only print checks; three PDFs generated. |
| New Forms browser matrix | Passed owning Player PC, G.O.D. Race NPC and frozen Creature NPC at desktop and 390px; detached preview, Locked/manual Access, clean/frozen boundary, entry/Return, history, pending Initiative across reload, canonical Mana, live combat identity with Normal choices, shared theme, and lost-response/reload replay. Desktop/phone screenshots inspected. |
| Type generation, typecheck and full lint | Passed. |
| Drizzle | Metadata check passed; regeneration reported no schema changes; all 94 migrations rehearsed, including populated legacy upgrade preservation and zero inferred Form rows. |
| Whitespace | `git diff --check` passed. |

Reproduction uses the existing guarded harness: `node --import tsx scripts/creature-evolution-disposable.test.ts --browser` for the complete Evolution/Forms suite; `EVOLUTION_CASE_FILTER=forms-runtime-db` plus `--focused` for the Forms cases. The comma-separated filter `creature-evolution-db,forms-runtime-db`, `SERRIAN_EVOLUTION_SHEET_ONLY=true` and `SERRIAN_FORMS_RUNTIME_BROWSER_ONLY=true` select the final Forms browser subset with its required isolated fixtures. Use `node --import tsx --test scripts/combat-completion-disposable-db.test.ts` for combat and `npm.cmd run validate:unit` for units.

Evidence is under ignored `artifacts/guidance/`: `forms-runtime-db-final.log`, `forms-runtime-browser-final.log`, `forms-runtime-combat-final.log`, `forms-runtime-unit-final.log`, `forms-runtime-typegen-final.log`, `forms-runtime-typecheck-final.log`, `forms-runtime-lint-final.log`, `forms-runtime-drizzle.log`, and `forms-runtime-schema-verify.log`. The earlier combined `forms-runtime-evolution-browser.log` contains the passing existing suites/browser flows and the initial new-browser fixture failure; final Forms results are in the final logs. Screenshots are in `artifacts/guidance/creature-evolutions/forms-runtime-*`.

All database/browser work used guarded disposable localhost databases. Background vacuum is disabled only in that temporary harness so explicit concurrency cases control competing locks. No shared DEV/Production data or migrations were changed. Migration 0093 must be rolled out before deploying these readers. Automated results do not substitute for hands-on Brannan/Ember acceptance. No push or deployment occurred.

## 21. Exactly what remains for Forms Pass 2

Integrate authoritative active Form evidence with effective Race/Creature Attributes, anatomy/HP pools/hit locations, movement, attacks/abilities, Natural Protection/armor/soak, Skills/grants, Interaction Rules, manipulation/speech/equipment usability, combat choice/source readers and incoming damage/protection. Preserve the same individual and this lifecycle/history/locking contract, retain existing damage/orphan rules, refresh new choices and leave historical sources/results frozen. No such substitution is included here.

Pass 3 separately owns automatic triggers/expiry/condition-end/resource depletion, limit/cooldown refresh ledgers, forced equipment behavior and explicit active Form/Evolution coordination. Do not begin either pass automatically.

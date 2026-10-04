# Forms Runtime Pass 3 — lifecycle completion

Continued from accepted Pass 2 commit `f36c7b7b1110468df5c8b72a2f0d0208f6816fcc`. This pass completes runtime behavior for represented structured Form mechanics through the existing transition authority. It adds no inferred prose rules, automatic Creature passive Ability engine, Special Ability runtime, companion runtime or new Magic system.

## 1. Catalog audit

The initial read-only local DEV audit found 15 Race Forms and no Creature Forms. All are voluntary, persistent, Initiative-timed, unlimited, and have no transformation requirements or involuntary triggers. All entry costs name unsupported **Shift Reserve**; all contain nonblank cooldown prose. Fourteen specify no exit resource cost; one leaves it unspecified. Ten use unusable equipment and five custom equipment. Consequently this catalog remains G.O.D.-reviewed where those authored boundaries require it. Nothing was converted or rewritten. [Audit and classification](../architecture/forms-runtime-pass-3-audit.md).

## 2. Automatic duration behavior

Encounter and Scene modes capture an exact lifecycle owner at successful entry. That owner's actual completion marks Return due. Both normal Encounter closeout and force-end participate; Scene completion uses the existing Scene action. When the frozen exit permits duration-end and its timing/costs can execute at a clean boundary, the existing Return executor runs automatically. Persistent and voluntary-end never expire from time passage or closeout. An unbound entry never attaches itself to a future owner.

## 3. Manual duration behavior

Fixed, condition-end and custom descriptions have no typed Form clock or end predicate. They remain explicit G.O.D. tracking and Return review. Unbound Encounter/Scene entries remain manual. Unspecified or unsupported exit costs/timing are never waived; current mechanics remain active with visible Return due until the real Return completes. Reopening a completed Encounter cannot erase the retained endpoint.

## 4. Involuntary triggers

Normal individuals may automatically enter one uniquely satisfied Form with involuntary/either entry, automatically Available Access, all supported typed triggers and requirements satisfied, executable timing/costs, permitted uses and a clean unfrozen boundary. Facts are reread under the existing transition fence. Manual/unknown facts, Locked/Manual Access and competing satisfied Forms do not auto-resolve. While transformed, another satisfied Form is review information; no direct Form-to-Form transition occurs. Existing responder-window event facts belong to unfinished operations and cannot justify a body change mid-action; without a trusted executable boundary they remain manual.

## 5. Uses and refresh

Completed Enter events are the use record, scoped to exact individual, source kind/ID and Form ID/key. Round includes exact Encounter plus round; Encounter and Scene use exact owners; never is lifetime for that identity. All limits must pass. Pending/cancelled entry consumes no use. Exhaustion blocks Player, G.O.D. and automatic entry. Unlimited has no gate; unspecified/custom remains manual. Manual/event limits provide the authored maximum uses initially, without a refresh receipt or an extra entry ruling. They count all completed entries until the first refresh, then only entries after the latest exact matching receipt. Manual/event refresh requires explicit Campaign-owning G.O.D. evidence in an immutable receipt naming its exact authored scope/key and observed reason. It cannot waive round, Encounter, Scene or lifetime limits. The authoring meaning remains: maximum uses before the authored refresh.

## 6. Cooldown

Every nonblank cooldown string requires explicit G.O.D. evidence. Even apparently permissive text is not parsed. No automatic cooldown timer exists; Player entry cannot bypass that review.

## 7. Resource depletion

The existing exit method identifies no exact pool and threshold. Resource-depletion Return remains manual. Canonical Character Mana entry/exit costs still execute through the existing resource owner, without duplicate spending. Named/custom/Creature resources without an executor remain manual.

## 8. Physical equipment

Retained/inherited equipment is untouched. Unusable/merged equipment remains owned and recorded; active access follows Pass 2 capability checks and passive Worn Armor follows recorded state. Return restores access without re-equipping. Dropped equipment removes only exact recorded active copies/stack quantities through the existing equipment/custody operations at successful entry. Scene location, original state, quantity and custody receipts are frozen in transition evidence. There is no extra Drop Initiative. Loose/inactive inventory is preserved, ownership remains unchanged, and Return does not retrieve dropped gear. Without an exact Scene, or with unresolved contained/attached allocations, the G.O.D. must resolve existing custody controls before entry. Custom notes never execute physical commands.

## 9. Health and unrelated state

Neither automatic entry nor Return heals or redistributes damage. Stored total/pool damage, injuries, limb state, Conditions, Modifiers, periodic bindings, equipment ownership and historical effects remain under their existing owners. New effective anatomy uses existing orphan handling. Active Health mutation responses reread the resulting effective body after lifecycle reconciliation. Duration owners may still perform their normal authored effect expiry during closeout; Form Return does not invent an additional expiry or clear unrelated effects.

## 10. System history

Transitions retain Pass 1 immutable events and requests. System evidence explicitly records `system/lifecycle`, structured reason/facts, original entry, frozen lifecycle context, observing state owner, Campaign permission authority and normal timing/cost result. It does not portray the Campaign owner as clicking an automatic operation. Manual involuntary entry and G.O.D. rulings remain distinguishable. Completed action/source/target/result history is not recalculated.

## 11. Safe boundaries

The shared participant transition boundary still rejects open checkpoints, unfinished declarations/actions, firearm operations, defense/reaction/responder involvement, unapplied/review-pending effects, source/range/Called Shot rulings and prepared participant mechanics. Resolved history is not a blocker. A due Form keeps its current body while completion is deferred. New ordinary declarations, combat source choices and direct sheet executions reject expired-body actions; existing completion, defense and Return paths remain available under their existing authority.

## 12. Freeze and closeout

Frozen relevant Encounters prevent lifecycle mutation. Due state may be displayed without changing the body. Resume and subsequent clean authoritative boundaries retry reconciliation. Persistent/voluntary Forms survive normal and forced closeout; exact Encounter-duration Forms Return automatically or remain explicitly due according to frozen exit rules. Participant identity, current Initiative and ownership are preserved; only an authored transformation timing action spends Initiative. No fresh turn is granted.

## 13. Final Evolution coordination

Forward Evolution, historical Evolution Return and Race reassignment require Normal with no pending Form transition. Return due remains an active Form and continues to block them. The actual authored Form exit must finish first. There is no silent Return, waived exit cost, or mapping by Form name/key onto a new permanent Race/Creature.

## 14. Concurrency and retry

The existing fact fence, individual/Encounter protection, review tokens, durable request identity and executor remain authoritative. Automatic decisions and pending completions revalidate facts and limits. Deterministic lifecycle request keys prevent duplicate transitions; savepoints keep Form costs/drops atomic with the transition. Lock contention defers automatic work without discarding the originating Health/effect mutation. A transaction-local guard prevents recursive transition loops. Notifications use transactional PostgreSQL delivery: rollback publishes nothing and replay does not publish duplicate transition events. Manual use refresh also has durable same-input replay and rejects a changed successful request.

## 15. UI

The shared Current Form panel serves PCs, Race NPCs and Creature NPCs. It displays Active/Return due, exact bound owners, duration and exit contract, unfinished blockers, uses remaining/refresh scope, cooldown review, satisfied/ambiguous trigger information and equipment consequences. History exposes automatic reasons, manual rulings, exact dropped gear and use refresh receipts without raw JSON. G.O.D. refresh controls preserve retry input across reload; Player authority remains unchanged. Existing live events refresh sheet/combat choices without recreating the Encounter. Shared semantic theme and field guidance remain in use.

## 16. Verification and rollout

| Verification | Result |
| --- | --- |
| Forms Pass 1 transition suite | 64/64 |
| Forms Pass 2 effective mechanics | 87/87 |
| Forms Pass 3 lifecycle, rollback, concurrency and notifications | 74/74; all three Forms suites also pass together |
| Existing Evolution Passes 1–5, live Evolution/Return, Race/Creature Forms authoring/preview, ownership/commerce/lifecycle | 173/173 |
| Complete combat harness | 522/522 across 30 suites, including Magic Pass 4, Race Natural Attacks, Creature Attack/Ability, firearms, protection, Health/injuries, Conditions/Modifiers, durations, Initiative, freeze and closeout |
| Unit suite | 1,883/1,883 in 210 feature files |
| Fresh migration chain | All 97 migrations replay |
| Populated upgrades | Existing 0031, 0082 and 0086 rehearsals plus new 0094 active Form/pending Return/Health preservation |
| Lint and Drizzle metadata | Passed |
| Desktop/390px browsers | Passed: owning Player/G.O.D. PC, Race NPC and Creature NPC; voluntary and automatic entry/Return; live sheet/combat refresh; Return due; exit-cost ruling; manual refresh; exact copy drop; no retrieval on Return; history/theme/overflow; interrupted-response retry |
| Type generation, typecheck and whitespace | Passed |

Database evidence: `artifacts/guidance/forms-pass3-all-forms-final.log`, `forms-pass3-evolution-browser.log`, `forms-pass3-combat.log`; unit evidence: `forms-pass3-unit.log`; final Forms browser evidence: `forms-pass3-browser-final.log` and screenshots under `artifacts/guidance/creature-evolutions/`. The Evolution browser portion passed authoring, saved Character/NPC Evolution/Return, live combat source refresh, interrupted-response recovery and printable previews. The added Forms browser portion passed separately after correcting its exact-copy fixture to follow canonical charged Item ownership. Browser retry checks exercise only known transient lock contention; unrelated errors still fail. Native stderr warnings can make Windows PowerShell report a shell failure despite successful Node assertions; they are distinguished from test failures in these logs.

All database mutation tests run on fresh disposable loopback PostgreSQL clusters. The user separately confirmed applying migrations to DEV during this session. Applied `0095` bytes were preserved; the additional history guards are separate **`0096_forms_lifecycle_history_guards.sql`**. The final read-only DEV check observed all 97 migrations and both guards, with matching migration hashes. This agent applied no shared migrations, touched no Production data, and did not push or deploy. Other environments require separate rollout authorization, including `0087`, `0092`, `0093`, `0094`, `0095` and `0096` wherever unapplied. Automated validation does not constitute Brannan/Ember hands-on acceptance.

## 17. Intentional manual boundaries

Prose-only duration/cooldown/depletion, missing exact lifecycle owners, unknown resources, unsupported clocks or event facts, manual Access, ambiguous involuntary candidates, unspecified/custom limits, explicit manual/event refresh and custom equipment require the Campaign-owning G.O.D. Where a physical drop lacks an authoritative location/allocation, existing custody must be resolved before entry. No new generic rule language or speculative scheduler was introduced. This is runtime-complete within these represented structured mechanics; descriptive rules remain descriptive. Stop after this pass; no Special Ability or companion work begins automatically.

## Focused refresh semantics correction (2026-10-04)

Starting from `adfaf88cbfb76de14f5bbba2c3a945ec9258f0a5`, corrected `readFormLimits()` so absence of a manual/event refresh receipt does not make the initial allowance manual. The existing exact completed-entry counting and receipt boundaries are unchanged. Runtime explanations now distinguish initial availability from the Campaign-owning G.O.D. evidence required for refresh; the browser assertion no longer expects an initial-use ruling.

Focused lifecycle verification passed **80/80**. Combined Forms Pass 1/2/3 verification passed **64/64 + 87/87 + 80/80 = 231/231**. Coverage includes Player/G.O.D. initial entry, exhaustion and ordinary-ruling rejection, exact event keys, automatic initial/refreshed entry, pending/cancelled entries, simultaneous lifetime/round/Encounter/Scene limits, immutable receipts and retry after the restored allowance is spent. The unit suite passed **1,883/1,883**; typecheck, lint, Drizzle metadata and whitespace checks passed. Disposable harness runs also passed the fresh 97-migration chain and existing populated upgrade checks. Logs: `artifacts/guidance/forms-refresh-fix-lifecycle.log`, `forms-refresh-fix-combined.log`, `forms-refresh-fix-unit.log`, `forms-refresh-fix-typecheck.log` and `forms-refresh-fix-lint.log`.

No schema or migration changes; `0095` and `0096` retain their original hashes. All database tests used disposable local clusters. No shared data was modified. Broader combat/browser suites were not rerun for this focused service correction; the updated browser expectation is not claimed as newly browser-verified. No commit or push was performed.

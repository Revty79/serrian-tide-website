# Combat completion implementation record

Starting commit: `c223da89c4600a5fc2c1afd23199c74015189263`. Actual branch: `restore-shop-checkout-cda0362`. Working tree was clean. The parent `cda0362` is the audit baseline; the committed UI removal is preserved. No replacement combat screen is part of this assignment.

Authority: [complete supplied assignment](../rules/combat-completion-assignment-2026-09-08.md), [rules-to-service contract](../rules/combat-completion-contract.md).

## Pass 1 — contract and fixed trace inputs

Start: `c223da89`. Established the settled timing, visibility, perception, response, Mana, temporary-effect, and full-Step contracts and selected service routes. Added the exact fixed exercise inputs and independent percentile/outcome assertions. The executable engine/service trace is extended and verified in the subsequent implementation passes; fixture arithmetic alone is not claimed as complete combat validation.

Validation: 2 focused contract tests and ESLint passed. End: `968b62a`.

## Pass 2 ? Initiative and declaration checkpoints

Start: `968b62a`. Added durable declaration checkpoints (identified additive migration 0041), atomic declaration/response Rolls, SQL-level sealed ledger filtering, sealed declaration and Initiative projections, and time-advance guards. Current-group membership is distinct from full-Step participation. Lower-Initiative actors remain in Step accounting; retained Hold only advances on real progress. Immediate Initiative changes recalculate stored pending finishes and response windows, preserving original Roll evidence. Defense submissions retain their original opportunity/receipt on retries.

Validation: 31 focused pure timing cases; 3 disposable PostgreSQL service cases (both submission orders, hidden Rolls, blocked premature advance, Hold retry); 1,258 unit tests; typecheck passed. The database harness initializes and migrates a fresh temporary cluster; ordinary campaign data has not been migrated or seeded. Source-specific Rowan/Mira and completed-encounter coverage is added after the participant/consequence/resource integration in the subsequent passes. This commit is the timing foundation, not the final readiness claim.

End: `5b0b211`.

Validation correction discovered during Pass 3: the first disposable harness inherited `NODE_TEST_CONTEXT`, so its initial passing exit did not execute child service tests. That result is withdrawn. The corrected harness removes that variable, requires a positive TAP test count, and now actually passes all three checkpoint cases using real authored Attribute sources.

## Pass 3 ? participant identity and authoritative routes

Start: `5b0b211`. Corrected signed participant keys in Initiative controls and Roll actors, retained occurrence labels in the Roll ledger, and added authored direct-Creature Block/Parry sources. Migration 0042 changes only the defense identity constraint: exact negative occurrences may use their frozen authored defense without a fictitious Character inventory item. Character Blocks still require a real wielded owned item. Frozen governing mechanics survive execution and retry. G.O.D. Hold/Pass obeys Player choice ownership; new legacy untracked commitments are retired with an explicit route to declarations, while historical binding recovery remains available. Player and G.O.D. declaration endpoints accept the physical Roll with the choice.

Validation: the corrected disposable harness actually executes and passes 7 service tests: both simultaneous submission orders, sealed reads/advance, unchanged Hold retry, real Player and NPC weapon governance, two occurrences of one template using separate signed keys and authored attack/Block sources, cost/refund/extension exactly once, unauthorized action rejection, and the explicit Hold/awareness variant using fresh Roll 36 with no Roll 94. Unit suite: 1,258 passed. Typecheck passed. HP/condition and consumed-resource independence is validated with consequences in the following passes.

End: `b38b198`.

## Pass 4 - ordinary consequences and defeat

Start: b38b198. Ordinary weapon and Creature attacks now generate supported location damage plans from frozen sources, original Rolls, authored anatomy, armor and Soak. Failed or stopped attacks apply no damage. Exceptional criticals, unknown numeric protection and exceptional injuries remain specific G.O.D. rulings, with original calculations and amendments retained. Routine supported Player consequences use the Player authority and attribution. Applied damage retains over-damage and exact occurrence identity; explicit injuries and defeat values do not create XP awards. Simultaneous completed attacks survive either application order after defeat. A subsequent ordinary checkpoint waits for current completed outcomes.

Validation: 14 actual disposable PostgreSQL service cases passed, including seven consequence cases: Rowan's real owned Skill gives target 40, Roll 90 and failed Block 20 produce the ruled 11 damage to the 3-HP head, one severing record and defeat value 3; damage retry is unchanged; nonfatal armor/Soak and absorption; both simultaneous application orders; critical 01 and 100 remain unresolved rulings. Typecheck, lint and diff check passed. Last full unit suite: 1,258 passing before this pass; broader validation follows the resource integration. No ordinary database migration or fixture writes occurred.

End: `e046e27`.

Supplement accepted: [persistent Freeze/Resume and later screen requirements](../rules/combat-freeze-and-ui-handoff-2026-09-08.md). Implementation and race/privacy validation continue with the remaining backend passes.

## Freeze/Resume supplement - shared write boundary and projections

Start: e046e27. At the user's request, all ongoing work now uses main tracking origin/main. The four completed pass commits were pushed normally to origin/main. The superseded local main was preserved as backup-main-before-combat-completion-20260908; its removed UI was not restored.

Migration 0043 adds only frozen_at and freeze_revision on the retained Encounter. The owning G.O.D. sends an explicit desired state and observed revision; retries cannot toggle state or replay an old Resume over a newer Freeze. Freeze/Resume and combat mutations serialize on the Encounter row. Guards cover declarations, responses, Rolls and amendments, Initiative, durations, consequence plans, firearm operations and retained resource/integration routes, including Character sheet resource writes for active participants. Read projections and unrelated Encounters remain available. The existing commit-bound live invalidation tells every authorized subscriber to reload the authoritative pause state.

New G.O.D. and Player backend projections expose pause, resume authority, current Initiative and action timing, action/response opportunities, Hold intervention availability, concise blockers and inspection independent of availability. They use checkpoint-projected state and authorized declarations, preserving sealed choices and Rolls. Player resource inspection is limited to their Character; the G.O.D. can inspect each occurrence. No screen was added. The later screen decisions remain in the linked handoff document.

Validation: 19 actual disposable PostgreSQL service cases now pass, including five pause cases: unauthorized Freeze/Resume, persisted reconnect state, unchanged repeated requests and stale Resume rejection, Character/Creature inspection while frozen, blocked writes including health and duration advancement, sealed choices/Rolls, both actual lock-contention race orders, another Encounter remaining writable, and Resume of an approved damage plan applied exactly once. Existing timing and Roll state survive. All 1,258 feature unit cases passed; typecheck and lint passed during this supplement. Cast-start Mana and firearm-specific pause/retry coverage continues as those remaining pass integrations are completed. Ordinary database migrations have not been applied yet.

End: `172b723`.

## Pass 5 - casting, owned resources and immediate effects

Start: `172b723`. Begun casts spend Mana inside the declaration savepoint and retain one original Roll; invalid starts roll back atomically. Failed, cancelled and interrupted casts keep their paid Mana. Owned Spell identity is rechecked at commitment, source aliases resolve consistently, and the existing authored target-capacity rules validate exact signed target selections. Explicit source-specific G.O.D. mode rulings support owned Skill, Attribute, opposed, no-roll and manual execution; numeric per-success effects use the existing percentile quantity calculation. A multi-target Dodge protects its declared target without erasing another target's effect. Ambiguous multi-target Block/intervention scope remains an explicit consequence ruling.

Player endpoints accept owned Spell, Item and Ability choices and retry identities. Costs come from the source; missing Item/Ability timing requires a persisted G.O.D. source ruling. Derived Abilities use the existing availability/condition/limit planner and retained use/recharge ledger, with one use receipt and declaration-time Mana costs. The retained sheet executor directs active combat through declarations. Items use the existing exact stack/instance executors once at consequence application; failure rolls back the entire application group. Tests cover consumed quantities, charges, Creature healing, conditions and Initiative modifiers without affecting another occurrence.

Temporary Dexterity, movement and Initiative changes now adjust capacity, current balance/debt, pending finishes and response windows immediately on application and expiration. Character duration bindings and direct Creature occurrence durations advance at the same actual Step/round/Scene boundaries. Creature effect history is retained with expiration evidence. Sealed Mana projections preserve declaration privacy in inspection and public casting previews. Freeze keeps the effects, pending work and combat boundary intact.

Validation: 38 actually executed service cases passed in the disposable migrated PostgreSQL cluster, including 11 Spell cases, five timing/expiration cases and three Item/Ability cases. The authored concentration scenario crosses a round with one Mana payment and one Roll; its production practitioner/casting formula is unchanged. All 1,258 feature unit tests passed. Typecheck, lint, production build, Drizzle migration check and diff check passed during this pass. No ordinary campaign fixtures, database reset or replacement screen. Ordinary forward migrations remain scheduled after the remaining integration checks.

End: `1a115be`.

## Pass 6 - firearms and sustained firing portions

Start: `1a115be`. Firearm declarations now accept the original entered Roll at the actual trigger commitment; Aim and authored preparation remain separate no-roll actions. Invalid starts roll back the whole operation. Retry identities include the exact Encounter and original choices, and authority is checked before returning a receipt. Readiness preparation also retains exact request choices and cannot change an actively firing instance.

The [additional sustained-fire ruling](../rules/combat-sustained-fire-clarification-2026-09-08.md) is implemented through the existing Initiative engine. A three-point declaration from 22 visits 21, 20 and 19. The original bullet calculation is allocated by ordered bullet index and authored rounds per cadence. Each completed portion spends only that portion's ammunition and generates its own consequence plan. Overflow is retained once at the final portion; unsupported Called automatic DEX placement remains a precise existing G.O.D. ruling. Subsequent legitimate defenses can cancel only uncompleted bullet portions. Reconciliation applies defense refunds/extensions only once, including when a new response arrives after a previous group was resolved.

Migration 0044 adds a completed-portion counter and an effect-plan portion number, extends the existing uniqueness keys to include the portion, and permits partial ammunition expenditure on a fired attack. Existing plans remain portion zero; previously fired attacks are marked fully delivered without replaying any shot. Freeze preserves the next point. Interruption cancels remaining firing while preserving completed portions and authored cycling/recoil requirements. Simultaneously matured portions receive their ammunition and plan receipts before damage can interrupt another shooter's future work.

Validation: ten firearm service cases cover Player and NPC single/burst, exact ammo shortage, authored numeric Creature armor/Soak, invalid Roll rollback, repeated requests, Freeze, real target/Aim replacement, Called single damage, declining consequences without ammunition refunds, draw/reload/load/unload/mode/cycling/recoil operations, an aware Creature Dodge, the full three-point sustained sequence, interruption after its second point, and a later defense preserving earlier damage. All 48 service cases passed in the disposable migrated PostgreSQL cluster. All 1,258 feature unit tests, typecheck, lint, production build, Drizzle check and diff check passed during this pass. No ordinary campaign database has been migrated or seeded.

End: this Pass 6 commit (subject Complete firearm declaration timing and sustained firing portions).

## Remaining passes

7. Cancellation/closeout/recovery, explicit XP modes and complete service-level encounters, final validation and handoff.

Pass 7 XP clarification accepted: [confirmed Creature award modes and additive full-per-recipient encounter XP](../rules/combat-xp-clarification-2026-09-08.md). The latest clarification makes "everyone gets Creature XP" the full-value-per-recipient mode. Killer-only and explicit shared split remain available; for a shared split, equal whole shares plus the killer's remainder preserve the Creature value. Distribution is not wholly undecided.

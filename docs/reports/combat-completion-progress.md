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

End: this pass commit (subject `Unify combat participant identity and authored defense paths`).

## Pass 4 - ordinary consequences and defeat

Start: b38b198. Ordinary weapon and Creature attacks now generate supported location damage plans from frozen sources, original Rolls, authored anatomy, armor and Soak. Failed or stopped attacks apply no damage. Exceptional criticals, unknown numeric protection and exceptional injuries remain specific G.O.D. rulings, with original calculations and amendments retained. Routine supported Player consequences use the Player authority and attribution. Applied damage retains over-damage and exact occurrence identity; explicit injuries and defeat values do not create XP awards. Simultaneous completed attacks survive either application order after defeat. A subsequent ordinary checkpoint waits for current completed outcomes.

Validation: 14 actual disposable PostgreSQL service cases passed, including seven consequence cases: Rowan's real owned Skill gives target 40, Roll 90 and failed Block 20 produce the ruled 11 damage to the 3-HP head, one severing record and defeat value 3; damage retry is unchanged; nonfatal armor/Soak and absorption; both simultaneous application orders; critical 01 and 100 remain unresolved rulings. Typecheck, lint and diff check passed. Last full unit suite: 1,258 passing before this pass; broader validation follows the resource integration. No ordinary database migration or fixture writes occurred.

End: this pass commit (subject Complete ordinary attack consequences and preserve simultaneous defeat outcomes).

Supplement accepted: [persistent Freeze/Resume and later screen requirements](../rules/combat-freeze-and-ui-handoff-2026-09-08.md). Implementation and race/privacy validation continue with the remaining backend passes.

## Remaining passes

5. Cast-start spending, Items/abilities, immediate effects, and duration parity.
6. Firearms under the reconciled timing contract.
7. Cancellation/closeout/recovery and complete service-level encounters, final validation and handoff.

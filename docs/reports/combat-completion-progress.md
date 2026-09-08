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

## Remaining passes

4. Ordinary attack consequences and independent location/defeat state.
5. Cast-start spending, Items/abilities, immediate effects, and duration parity.
6. Firearms under the reconciled timing contract.
7. Cancellation/closeout/recovery and complete service-level encounters, final validation and handoff.

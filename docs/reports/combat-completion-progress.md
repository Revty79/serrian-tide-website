# Combat completion implementation record

Starting commit: `c223da89c4600a5fc2c1afd23199c74015189263`. Actual branch: `restore-shop-checkout-cda0362`. Working tree was clean. The parent `cda0362` is the audit baseline; the committed UI removal is preserved. No replacement combat screen is part of this assignment.

Authority: [complete supplied assignment](../rules/combat-completion-assignment-2026-09-08.md), [rules-to-service contract](../rules/combat-completion-contract.md).

## Pass 1 — contract and fixed trace inputs

Start: `c223da89`. Established the settled timing, visibility, perception, response, Mana, temporary-effect, and full-Step contracts and selected service routes. Added the exact fixed exercise inputs and independent percentile/outcome assertions. The executable engine/service trace is extended and verified in the subsequent implementation passes; fixture arithmetic alone is not claimed as complete combat validation.

Validation: 2 focused contract tests and ESLint passed. End: `968b62a`.

## Pass 2 ? Initiative and declaration checkpoints

Start: `968b62a`. Added durable declaration checkpoints (identified additive migration 0041), atomic declaration/response Rolls, SQL-level sealed ledger filtering, sealed declaration and Initiative projections, and time-advance guards. Current-group membership is distinct from full-Step participation. Lower-Initiative actors remain in Step accounting; retained Hold only advances on real progress. Immediate Initiative changes recalculate stored pending finishes and response windows, preserving original Roll evidence. Defense submissions retain their original opportunity/receipt on retries.

Validation: 31 focused pure timing cases; 3 disposable PostgreSQL service cases (both submission orders, hidden Rolls, blocked premature advance, Hold retry); 1,258 unit tests; typecheck passed. The database harness initializes and migrates a fresh temporary cluster; ordinary campaign data has not been migrated or seeded. Source-specific Rowan/Mira and completed-encounter coverage is added after the participant/consequence/resource integration in the subsequent passes. This commit is the timing foundation, not the final readiness claim.

End: this pass commit (resolved by its subject `Reconcile Initiative timing and simultaneous declaration Rolls`).

## Remaining passes

3. Participant identity, control, and authoritative source routes.
4. Ordinary attack consequences and independent location/defeat state.
5. Cast-start spending, Items/abilities, immediate effects, and duration parity.
6. Firearms under the reconciled timing contract.
7. Cancellation/closeout/recovery and complete service-level encounters, final validation and handoff.

# Item combat completion and targeting

Parent revision: `8ea4476`. Requested: unblock blast damage and simplify Items that help their user, help others, or harm one or several targets.

## Findings and correction

A read-only transaction against local DEV found the stuck action recorded as **Inferno**, declaration 41, effect plan 48. Cat 1 had an approved but unsupported damage effect with `hit-location-required`. Cat 2 and the acting Character had already been explicitly recorded as manual outcomes. Five Charges were already applied, reducing the owned copy from 14 to 9. No DEV records were modified during this work.

The old screen hid the location requirement among generic approval and manual-outcome controls. The server also reset a partially-applied plan to `calculated` when a location was supplied, violating the database constraint that protects its existing application record. A disposable service test reproduced the exact sequence before the correction.

Incoming rulings now retain `partially-applied` for those plans. The existing approval service can approve the unfinished calculated rows without changing terminal rows or clearing the application ledger. The application service continues to skip applied, declined and manual-resolved effects. The new coordinator checks campaign ownership, Freeze, the exact displayed result, and every requested frozen location before invoking those services. It never supplies a damage amount.

## Visible workflow

1. Choose **Item** and its ability.
2. Choose the recipient, **Use on myself**, or additional recipients. Magic target groups retain their existing capacity and self-target rules. The G.O.D. still chooses who is inside an authored area.
3. Commit the action with its authored Initiative and, only when required, its Roll.
4. The G.O.D. receives a main **Item result report** showing each effect and its cost. Missing damage locations are shown directly; **Calculate damage** passes those selections to the existing protection resolver.
5. **Apply item effects** confirms the remaining supported effects once. Previously spent Charges are labeled **Already paid**. Manual outcomes explicitly state that the app did not apply their HP changes. Exceptional rulings remain available under the details control.

Weapon/ammunition preparation stays available under a separate disclosure in Item. Full-body healing no longer shows an irrelevant location picker. Direct Item effects now retain separate applications for each selected recipient; previously they reused the first recipient's selection. Fixed-roll direct damage follows the original-roll location path already used by construction-backed Item damage. The false no-effects warning for deferred area templates is removed.

## Validation

- Seven actual Player/G.O.D. browser scenarios: depleted weapon-hit power, automatic condition, fixed-roll magic area damage, automatic area damage, healing self, healing multiple recipients, and direct damage to two different selected locations.
- Browser assertions check selected recipients only, original Roll count, unchanged Charges while reviewing, one final Charge spend, exact HP/pool changes, and unchanged results after reload. Desktop and 390px screenshots passed overflow checks; no captured browser errors. Evidence: `artifacts/combat-screens/item-flow-2026-09-21/`.
- Full disposable combat service suite: 389 tests in 28 scripts passed, including the new retained-partial recovery regression. Final focused service rerun: 23 passed, including one further original-roll direct Item regression. This is 390 distinct service cases across the runs, not a second full-suite run.
- Partial recovery regression rejects Player approval, stale results, invalid locations and premature application; preserves manual outcomes; applies the remaining damage exactly once; preserves already-paid Charges; creates no Roll; safely retries completion.
- 171 focused combat-screen, effect-bridge and incoming-effect unit tests passed.
- TypeScript, changed-file lint, isolated production build and `git diff --check` passed. No migration was needed.

## Decisions for Brannan's review

- Item outcomes now use one explicit G.O.D. result approval, consistent with the attack/spell report workflow, including beneficial Items. The Player retains the action and target choices.
- No-roll localized damage still needs a location decision. Area membership does not imply full-body damage, and this correction does not invent a random location roll or silently change authored damage distribution.
- Direct Item powers already supported multiple recipients in the server contract. The screen now exposes that choice. Authored magic target capacities remain enforced by their existing services.
- Existing manual outcomes remain terminal. For the retained Inferno, only Cat 1 is unfinished. Review the other two manual outcomes separately if automated HP changes were intended; this correction does not undo or replay them.
- No home/production server was inspected or changed. No saved Character, Item definition, Charge balance or historical result was edited. Automated validation is complete; Brannan's acceptance remains pending.

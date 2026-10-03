# Combat runtime completion Pass 1: protection, Armor and damage

This pass extends the existing incoming-effect pipeline. It does not introduce a second combat engine. The starting commit was `6d1bddd` after Special Ability progression/benchmark authoring. Production data was not modified. No schema or migration changes are required, and no later combat pass is authorized by this work.

## 1. Files and implementation

| Files | Change |
| --- | --- |
| `src/features/items/armor-damage-modifiers.ts` | Strict structured Modifier validation and canonical typed Worn Soak calculation, with exact decimal arithmetic and explicit ambiguity results. |
| `src/features/items/item-damage-types.ts` | Server authoring rejects new invalid numerical values and overlapping canonical definitions; only server-confirmed unchanged legacy rows can be retained. |
| `src/features/incoming-effects/resolve-incoming-effect.ts` | Executes typed Armor in the existing Worn stage; only surviving Worn damage enters later defenses. Stores each source, calculation and issue in the existing frozen trace. |
| `src/features/tabletop-operations/firearm-attack-service.ts` | Bullet compatibility summary obtains effective Worn Soak from that same trace, including typed modifiers. |
| `src/features/damage-types/damage-types.ts`, `src/app/heavens/items/item-workspace.tsx` | Signed Modifier guidance, visible numeric/duplicate validation, and descriptive-only Source Text/Notes help using shared controls/theme. |
| `src/features/items/armor-damage-modifiers.test.ts`, `src/features/incoming-effects/resolve-incoming-effect.test.ts` | Numerical, ambiguity, coverage, precedence, precision and full-layer regressions. |
| `scripts/fixtures/protection-pipeline-fixture.ts`, `scripts/pass5-runtime-db.test.ts`, `scripts/combat-completion-firearms-db.test.ts`, `scripts/combat-completion-spells-db.test.ts` | Shared approved example exercised through real declarations, effects, Health, Ammo/Mana and retries, plus periodic effects. |
| `scripts/pass6-gameplay-db.test.ts` | Old blanket prose-metadata blocker fixture now uses an actually malformed structured Modifier. |
| `scripts/damage-types-disposable.test.ts` | Actual Armor editor rejects nonnumeric values and duplicate definitions and persists signed values. |
| `scripts/magazine-catalog-repair-db.test.ts`, `scripts/weapon-catalog-repair-db.test.ts` | Old JSON test fixtures explicitly default the current required `is_system_canon` field; no catalog repair code or live catalog changed. |
| `tsconfig.json` | Excludes generated evidence under `artifacts` from source checking; an old production-build route declaration there conflicted with current Next route types. |
| This report, `COMBAT-RESUME.md`, `docs/architecture/incoming-effect-resolver.md`, `docs/architecture/protection-layers.md` | Current contract, evidence and resumption boundary. |

## 2. Final order

1. Exact incoming amount and authoritative source facts.
2. Exact target hit location when required.
3. Applicable Worn Armor, with remaining damage floored at zero. If none survives, subsequent protection stages are skipped.
4. Target Interaction Requirements, Immunity, Absorption and percentage defenses under the existing precedence rules below.
5. Creature Natural Armor then Natural Soak, or Race Natural Soak alone.
6. Existing active temporary/other signed Soak stage.
7. One final upward rounding, then the existing authorized Health application at the resolved pool/location.

The existing natural and temporary stage arithmetic and lifecycle remain intact. The new early stop is specifically for damage fully stopped at the Worn stage. Healing and non-damage harmful effects retain their existing distinct paths.

## 3. Effective Worn Armor Soak and storage audit

`max(0, Base Soak + matching structured Modifier)`.

Base 5 with Fire +2 gives 7; Piercing -2 gives 3; no match gives 5. Base 2 with Acid -5 gives 0. Numbers are never extracted from Source Text, Notes, or Armor Rules prose. Prose alone no longer blocks otherwise complete numerical protection.

A guarded read-only transaction against the configured `serrian_tide_prod` catalog found **40 Armor profiles, zero structured Damage Modifier rows, zero nonempty Damage Modifier Source fields, and zero duplicate definitions**. `transaction_read_only` was verified on and the transaction rolled back. This is evidence about that catalog at audit time, not a claim about every historical combat snapshot or other database. Local audit output is `artifacts/guidance/combat-protection-pass-1/armor-audit.json`.

The current string column therefore remains appropriate. Both authoring and runtime require the entire field to be a finite signed decimal. Examples `+2`, `-2`, `.25`, and `0` are valid; prose, percentages, hexadecimal, exponents, blank values and non-finite values are invalid. Exact arithmetic prevents intermediate floating-point subtraction from losing a remainder before final rounding.

Unchanged legacy invalid values and duplicate rows remain preservable and visible. Creating or changing an invalid value, or creating a duplicate canonical definition, is rejected server-side. Existing ambiguous content is neither converted nor consolidated automatically.

## 4. Damage Type matching

All matching uses the shared canonical Damage Type parser, including its existing spelling/alias normalization. One exact incoming type and one exact applicable modifier execute automatically. Nonmatching numerical rows do not change Base Soak. An authoritative per-effect Spell Construction type takes precedence for that particular effect; it is not substituted into every effect of the source.

## 5. Ambiguity and G.O.D. rulings

Automatic calculation stops with frozen source evidence for:

- Missing required hit location, unknown worn coverage, or invalid Base Soak.
- More than one worn source covering the same location. Each source remains listed; no stacking rule is invented.
- An unknown incoming Damage Type when typed Armor requires it.
- An unrecognized modifier Damage Type, a relevant malformed numeric Modifier, overlapping matching definitions, or a combined-type modifier definition without an approved matching rule.
- Unsplit mixed incoming types that yield different effective Armor Soak. Equal effective Soak for every type can execute; neither averaging nor equal splitting is invented.
- Existing ambiguous Interaction combinations, unknown required source facts, unsupported effects, or unresolved natural/temporary coverage and values.

The Item editor retains the existing multi-type control, with guidance that combined definitions need a ruling. New overlapping definitions across rows are rejected even when their names use equivalent canonical aliases.

## 6. Race and Creature protection

Normal Characters and Race NPCs use their currently assigned Race and actual anatomy/hit locations. Race protection has one authoritative Natural Soak value; the retired Race Armor field is not executed.

Persistent Creature NPCs use their individual current snapshot; direct encounter Creatures use that exact occurrence snapshot. Creature Natural Armor and Natural Soak remain separate ordered operations after Interaction defenses. Master Creature edits do not replace these snapshots. Owned Armor contributes only when actually Worn and covering the resolved location. Forms remain preview/reference data.

## 7. Interaction precedence

Requirements are evaluated against exact structured facts. A known failed Requirement prevents the harmful effect. Matching Immunity prevents damage when no possible Absorption conflict remains. Unknown rules remain blocking when their possible outcomes could differ.

One unambiguous Absorption converts its authored share of damage remaining after Worn Armor into healing; leftover damage disappears. Existing Health application caps healing. Absorption with Immunity, percentage defenses, or another Absorption remains a ruling. Resistance/Vulnerability retain their existing authored-order sequential percentage calculation and exact arithmetic, before natural protection. Earlier unresolved Worn/source problems cannot be hidden by a later prevention rule.

Approved example: **20 Fire - (Base 4 + Fire 2) = 14; 50% Resistance gives 7; Natural Soak 2 gives 5 damage**. Likewise, 20 reaching Interaction defenses with 50% Resistance and 4 natural protection gives 6.

## 8. Source parity and firearms

Ordinary Weapon and both Creature attack adapters produce gross damage for `resolveIncomingEffectPlanInTransaction`. Current projectile declarations, including Bow and Handgun fixtures, freeze source facts and defer protection to the same resolver. Each bullet/effect is resolved independently. The base bullet calculation and optional Power calculation reuse the same frozen target input.

The firearm summary previously displayed Base Soak even when its shared calculation used a typed adjustment. It now reports the effective Worn Soak from that calculation. Existing firing modes, burst/sustained behavior, aim, recoil/governance, ammunition, hit locations and retry identities are unchanged. The compatibility `armor`/`soak` summary is not used to reorder the full frozen stage trace.

**Remaining projectile boundary:** Weapon/Ammunition Magical, material and tag inheritance is still unruled. These facts remain unknown and can require a G.O.D. decision; the exact projectile Damage Type can still drive Armor modifiers automatically.

## 9. Magic, Item and ongoing effects

Executable Spell Construction damage remains `magical=true` with its exact authored per-effect Damage Type. Fire and Magical are separate facts. The disposable Fire Spell satisfies a Magical Requirement, uses Fire Armor +2, Resistance and Race Soak, applies five damage to the Head, and debits Mana once across retries. Existing magical Interaction matching and unsupported Spell-family boundaries remain unchanged.

Custom and canonical construction-backed Item powers likewise supply their exact per-effect type and pass the approved twenty-to-five example. Direct Mechanical Effects currently have no standalone Damage Type field. They use the shared pipeline with available facts; a typed Armor dependency requires a ruling rather than borrowing a Weapon type or parsing prose. A direct Item periodic fixture with Base Armor, a mechanical-effect Resistance and Race Soak resolves each accepted application to six damage.

Periodic effects store the accepted protected amount, then lifecycle ticks apply that amount and consume each due application once. They do not reread later Armor edits or subtract protection again. No new live damage-over-time semantics are introduced.

Creature attached Magic can establish Magical source identity, but its construction effects are still not executed. Remaining Spell effect families, Creature Magic execution and Ability lifecycle expansion are deferred.

## 10. Legacy paths and historical evidence

`ordinary-attack-consequence-service.ts` retains its explicit `sharedIncoming=false` compatibility branch for old plans without an incoming snapshot. Its remaining callers are historical plan ruling/rebuild fallbacks. New plans use the shared resolver; unavailable optional Powers recalculate against their frozen incoming input.

`firearm-attack-service.ts` retains pre-incoming-snapshot protection readers for historical previews lacking frozen source facts. Those unresolved older previews can retain legacy/manual protection boundaries; they are not silently upgraded. Current previews always freeze the facts and bypass that preliminary legacy subtraction. Existing committed plans/bullets remain stored history, and the effect resolver does not recalculate a saved incoming resolution from live edits.

Existing historical records with the old `armor-damage-metadata` ruling reason remain readable. New actions use structured typed calculation. Tests edit a saved modifier from +2 to +12 after planning and still apply the retained five-damage result once.

## 11. Validation

| Verification | Result |
| --- | --- |
| Focused incoming-effect, protection, Armor and Damage Type tests | 149 passed. Included again in the final normal feature run. |
| Normal feature suite (`npm.cmd run validate:unit`) | **1,831 passed across 208 test files**, no failures/skips. |
| Entire disposable combat DB harness | **408 passed across all 28 child scripts**, parent harness passed; fresh local database migrated through the current journal. |
| Armor/Damage Type disposable browser | Passed. Actual server-action rejection of malformed numbers and duplicates, signed save/reload, retained legacy types, shared theme and 390px controls. The complete Modifier row screenshot was visually inspected at phone width. |
| Combat-screen disposable browser | Passed the combined encounter walkthrough, attack-location/ongoing damage flow, and four incoming-defense scenarios: **12 recorded assertions, zero browser errors**. Includes actual Player/G.O.D. roles, frozen explanations, Absorption, ruling conflict, resource retries, Freeze/Resume and closeout. |
| Typecheck | Passed after Next route generation and excluding stale evidence-build route declarations. |
| Lint and whitespace | Passed. |
| Schema/migrations | No changed schema, migration or journal files; no migration was applied to a shared database. |

The 28-case requested matrix is covered by `armor-damage-modifiers.test.ts` (base/signed/nonmatching/mixed/legacy), `resolve-incoming-effect.test.ts` (coverage, all defense layers, Magical facts and ambiguity), and real source-parity fixtures in the three combat DB scripts above. Existing full-suite tests cover Creature/Race anatomy, Health/injury, temporary lifecycle, ammunition, mode/aim/recoil, resource accounting, rulings and retained historical evidence.

Local logs and browser evidence are under `artifacts/guidance/combat-protection-pass-1/`; Armor screenshots are under `artifacts/guidance/damage-types/`. An initial expanded DB run exposed obsolete catalog JSON fixtures omitting `is_system_canon`; those test-only defaults were repaired before the complete successful rerun. Existing tests were changed only where a blanket prose-metadata blocker conflicted with this pass's approved structured semantics, or where the old test setup fully blocked damage before the later Interaction rule it intended to exercise.

No production build/deployment or human acceptance session was performed. Automated browser rehearsal is not human acceptance.

## 12. Pass 2 boundary

No Race Natural Attack runtime was implemented or started. No additional protection-pipeline blocker was identified for that pass within the audited scope. This pass supplies the existing shared pipeline that a later adapter should consume, with exact source identity, Damage Type/Magical facts and authoritative location. Race Natural Attacks still require their own authorized implementation pass. G.O.D. decisions listed above remain intentional boundaries, not assumed canon for that later adapter. Human Player/G.O.D. acceptance remains separate from automated testing.

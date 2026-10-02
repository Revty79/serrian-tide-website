# Program cleanup and runtime coverage review

Reviewed 2 October 2026 at commit `f619e2f`. Scope follows Brannan's clarification: find outdated or unused program/database structures and authored features without gameplay execution. This is a review and proposed work order; no application behavior, catalog records, migrations, or runtime data were changed.

The application has substantial working gameplay infrastructure, but several newer authoring systems remain disconnected from execution. The largest measured catalog gap is Spell Construction: **28 of its 30 effect types become manual instructions**. In local DEV, **349 of 371 constructions contain at least one manual effect**. Forms, Race Natural Attacks, Special Ability mechanics, and companion behavior have separate substantial integration gaps. There are also **12 application modules with no production import path** and stale verification/lifecycle bookkeeping.

## Coverage and evidence

- Inventoried 924 JavaScript/TypeScript source files: 717 application modules and 207 test modules. Traced static imports, exports, literal dynamic imports and `require` from 41 Next entry points. 702 application modules are reachable; 15 are outside that graph, of which three serve tooling/tests intentionally.
- Inspected current authoring, save/read, action-source, effect-adapter and execution code for the gaps below; compared current code with the Forms, Special Ability, Evolution, companion and containment handoffs.
- Inspected **local `serrian_tide_dev` only**, using database-enforced read-only connections and repeatable-read transactions for data inventories. The active environment configuration was not used as a substitute for the saved local DEV target. Production was not inspected.
- Current schema parity passed against `0090_snapshot.json`: **199 tables, 2,305 columns, 1,489 constraints, 404 explicit indexes and 51 enums**. All **91 migration timestamps and hashes** match the repository.
- All 516 public foreign keys are validated. Checked orphan queries for the 95 foreign keys whose child tables contain rows; **zero orphans**. No extra/missing public tables or columns. Skill parent-cycle and populated allocation-parent checks found no violations. No duplicate Skill names within the same classification/tier were found.
- Parsed all 742 Skill extensions and exercised the spell adapter against all 371 saved constructions. No invalid extension JSON/recognized document parsing failures were found; all 371 constructions passed the adapter's validation.
- TypeScript passed. The normal unit command reported **1,755 passed / 9 failed**. The failures are classified below. Rerunning the five CSS-loader failures plus the two omitted TSX test files with the repository loader passed **47/47**.

Local evidence and reproducible read-only scripts are in `artifacts/guidance/program-runtime-review-2026-10-02/`: `source-inventory.json`, `database-inventory.json`, `content-inventory.json`, `schema-parity.log`, `unit.log`, `loader-and-tsx.log`, and `typecheck.log`. These are ignored local audit artifacts. [Compact inventory](program-runtime-inventory-2026-10-02.json) preserves the aggregate findings and table counts with this report.

Module reachability is a conservative cleanup screen, not an exhaustive proof about every exported symbol, CSS selector, external consumer or uploaded asset. Some tests inspect source text rather than importing it. Local DEV contains no saved Encounter runtime; this review establishes implementation coverage and data structure health, not end-to-end combat acceptance. Production records, external consumers and browser gameplay require separate verification before destructive cleanup.

## Authored features missing all or part of their runtime

| Area | What exists | What still needs execution support | Current DEV evidence |
| --- | --- | --- | --- |
| **Special Ability mechanics** | Versioned authoring, conditions/provisional qualification, references, sheet/print/tabletop reading. | Activation, resource balances, paid costs, selected choices, event execution, modifier/Interaction application, outcomes and override precedence. Native Creature possession and temporary active-Form grants also lack adapters. | 86 Special Ability Skills; **zero** `special-ability-mechanics` documents. Both content authoring and runtime integration remain. |
| **Race and Creature Forms** | Definitions, access requirements, mechanical/transformation authoring, previews and Race Form reference printing. | Authoritative active Form, enter/exit commands, timing/costs, duration/cooldown, forced changes, health mapping, equipment consequences and live derived values. | **15 Race Forms across 5 Races**, including 30 Form attack rows. Creature Form tables are empty locally. |
| **Race Natural Attacks** | Normal-body attacks, anatomy/Skill associations, Initiative/range, effects, magic, previews and printing. | A selectable Character/Race-NPC attack source with availability, body-part checks, roll governance, costs and consequences. Their absence is broader than transformation alone: Normal Race attacks also have no dedicated combat source. | **30 attacks across 7 Races**. |
| **Companions and Vessels** | Persistent ownership, individual snapshots, travel disposition, exact Item-copy binding, roles/control/combat preferences, notes/history. | Automatic following/Scene presence, participation from preferences, Player-controlled Creature commands, release/recall/capture, mounting and mounted movement/combat. Binding alone does not implement any of these. | Companion profile, disposition and Vessel capability tables are empty locally. |
| **Evolution and Return** | Permanent individual changes and historical restoration with authorization, transactions and history. | Live encounter transitions and coordination with active Forms, effects, prepared actions and controlled Creatures. | No local Evolution path/event rows. The existing service deliberately blocks active encounters and prepared encounter state. This is partial runtime coverage, not an absent Evolution implementation. |
| **Spell Construction effects** | Full construction/calculation/validation; casting and supported target/cost/damage pipelines. | Typed adapters for the other 28 effect families. Buff/debuff, summons, transformation, teleportation, control effects and others currently become manual instructions. | 371 valid constructions; **349 contain manual effects**, 22 contain only supported health effects. Of 828 saved effect entries, 708 use manual-only families. |
| **Creature Ability lifecycle and limits** | Explicit ability use, exact snapshots, structured effects, conditions, fixed/automatic/manual resolution, supported Mana costs. | Automatic passive reconciliation, a persistent Creature use/recharge ledger, broader event producers, and automatic payment of unsupported/non-Mana resources. | One local Creature Ability, with no structured authoring or effect rows. No local passive/limited/magic examples. |
| **Creature attached Magic Construction** | Attack/Ability editor, saved construction, magical-source classification. | Translating the attached construction into executed effects. The editor currently claims support that the Creature source/adapter does not provide. | No existing local Creature magic constructions; an in-memory reproduction confirms the missing adapter. See below. |
| **Derived Ability resource/event coverage** | Possession/qualification, supported passive reconciliation, explicit use, usage/recharge receipts, conditions and combat integration. | Authored Health, ammunition, arbitrary resource and custom costs lack automatic spending. Combat refuses costs whose planner status remains manual. Additional named events need authoritative producers. | Six definitions and six generalized requirements; no local effect, cost or use-limit rows. |

The 22 constructions with only supported health effects are **not** certified as fully automatic spells: casting governance, targets, location, other authored settings and table rulings remain separate requirements.

### Decisive implementation evidence

1. **Special Abilities:** [resolution.ts](../../src/features/special-abilities/resolution.ts) returns `runtimeSupported: false`; [read-service.ts](../../src/features/special-abilities/read-service.ts) returns `native-creature-unavailable` for that owner context. [progression.ts](../../src/features/special-abilities/progression.ts) still labels purchased-point progression provisional. The unresolved interpretation must be settled explicitly before execution depends on it.
2. **Forms:** [character-form-preview.ts](../../src/features/characters/character-form-preview.ts) creates a display projection. [the viewer](../../src/app/characters/character-form-preview.tsx) holds selection in local React state. The [Forms audit](../architecture/forms-final-audit.md) documents the same execution boundary. Form Interaction Rules and Natural Protection overrides must not be mistaken for the already-working Normal-body counterparts.
3. **Race Natural Attacks:** [race-natural-attack-service.ts](../../src/features/races/race-natural-attack-service.ts) is consumed by authoring/variant/preview flows. [action-effect-bridge.ts](../../src/features/tabletop-operations/action-effect-bridge.ts) and [action-source-resolver-service.ts](../../src/features/tabletop-operations/action-source-resolver-service.ts) have Weapon and Creature Attack sources, but no Race Natural Attack source. A generic Skill roll/manual ruling does not execute the authored attack.
4. **Companions:** [runtime handoff](../architecture/owned-creatures-runtime-handoff.md) specifies management authority and the missing gameplay decisions. [companion-disposition-service.ts](../../src/features/creatures/companion-disposition-service.ts) persists management changes and prevents changing them during active encounters.
5. **Evolution:** [evolution-execution-service.ts](../../src/features/evolutions/evolution-execution-service.ts), `readEncounterBlockers`, rejects active/prepared encounters. Existing permanent Evolution/Return should be preserved while a future live-state adapter is designed.
6. **Spells:** [mechanical-effects-adapter.ts](../../src/features/spell-construction/mechanical-effects-adapter.ts), `mechanicalEffectFor`, handles Damage and specified Healing; every other rule passes through `manualEffectFor`. Healing without an application is also manual. A generic modifier/condition runtime already exists, but authoring a Spell Buff does not automatically choose its channel, target or duration.
7. **Creature Ability gaps:** [combat-creature-ability-service.ts](../../src/features/tabletop-operations/combat-creature-ability-service.ts) explicitly rejects Passive activation and states that use limits have no persistent ledger. Unknown conditions, unsupported resources and unproduced event keys require explicit rulings.
8. **Derived Ability costs:** [derived-ability-use.ts](../../src/features/derived-abilities/derived-ability-use.ts), `planCost`, automates supported Initiative/Mana; other cost kinds stay manual. [combat-derived-ability-service.ts](../../src/features/tabletop-operations/combat-derived-ability-service.ts) refuses manual resource plans. [facts.ts](../../src/features/ability-use-conditions/facts.ts) currently registers three automatic event facts: action declared, attack declared and attack targeted; custom names do not create events.

### Confirmed authoring promise that does not match execution

[attack-authoring-fields.tsx](../../src/app/heavens/attack-authoring-fields.tsx), line 33, tells Creature authors that supported constructed effects are used during action resolution. Both Creature Attack and Ability editors mount this control.

However, [creature-ability.ts](../../src/features/creatures/creature-ability.ts), `adaptCreatureAbilityToMechanicalEffects`, reads the separate `effects` list or falls back to descriptive manual instructions. It never adapts `authoring.magic.document`. The Creature Attack source reads base damage and `authoring.onHitEffects`, likewise without translating the attached magic document. The magic document can establish a source's magical classification through [source-facts.ts](../../src/features/incoming-effects/source-facts.ts); that is different from executing its effects.

Reproduction, using a valid saved Damage construction only as input to an unpersisted synthetic ability:

| Input to the real adapters | Result |
| --- | --- |
| The construction as a Spell | A `health.damage` effect |
| Creature Ability with only that attached construction | Invalid: no structured or descriptive runtime consequence; zero effects |
| Same Creature Ability with description text | One `manual` effect; still no damage effect |

This warrants a focused implementation decision and immediate wording correction when fixes are authorized. It should not be described merely as incomplete catalog authoring.

## Outdated or unused program code

### Twelve application cleanup candidates

No current production import route reaches these files. Remove or consolidate them in a bounded cleanup pass, moving any still-useful assertions to the live replacement first.

| Candidate | Evidence / disposition |
| --- | --- |
| `src/app/characters/printable-character-sheet.tsx` | Old renderer has no importer. `character-print-center.tsx` mounts `PaperCharacterSheet`. Several tests still inspect the old source. **Its CSS remains imported and contains shared print rules; do not delete that stylesheet wholesale.** |
| `src/features/campaigns/campaign-race-state.ts` | No imports; equivalent local functions exist in Campaign create/workspace components. Consolidate or remove the unused helper. |
| `src/features/characters/character-deletion.ts` | Only its unit test imports it. Actual deletion runs through lifecycle policy/service. Preserve current authorization tests at the real boundary. |
| `src/features/tabletop-operations/player-encounter-notifications.ts` | Only tests import the old notification helper. It is not the current combat-screen event path. |
| Eight old action modules listed below | No imports. Current screens use other actions/services; removing wrappers must preserve their still-used underlying services. |

The eight action modules are:

```text
src/app/heavens/tabletop/closeout-actions.ts
src/app/heavens/tabletop/combat-aid-actions.ts
src/app/heavens/tabletop/combat-projection-actions.ts
src/app/heavens/tabletop/combat-xp-actions.ts
src/app/heavens/tabletop/firearm-attack-actions.ts
src/app/heavens/tabletop/weapon-governance-actions.ts
src/app/realms/tabletop/combat-projection-actions.ts
src/app/realms/characters/[characterId]/encounter/actions.ts
```

The old Player encounter page itself still serves a useful redirect and should remain. The reachable `runtime-integration-service.ts` also retains old start methods whose common `startAuthoredActionInTransaction` always rejects new commitments. That service still owns important live/recovery functions: retire individual obsolete entry points only after examining callers and historical bindings.

Three additional modules outside the application graph are **intentional support code**: `canon-classification-service.ts`, `canon-manifest.ts`, and `special-abilities/v2-fixtures.ts`. They are used by maintenance scripts and/or tests. They are not deletion findings.

### Stale verification and lifecycle bookkeeping

| Finding | Evidence and impact |
| --- | --- |
| Default unit runner omits TSX and lacks the existing CSS loader | [run-feature-tests.mjs](../../scripts/run-feature-tests.mjs) discovers only `.test.ts`, missing the two current `.test.tsx` files. Five test files fail on raw CSS imports. Loader-enabled rerun plus those two files passes 47 tests. |
| Appearance assertions predate current print templates | [appearance-source.test.ts](../../src/features/appearance/appearance-source.test.ts) exempts only the old print stylesheet and demands obsolete wording. Current print styles/Special Ability print reference use fixed ink under the documented print exception. These cause two failures. Update the test's print boundary while retaining screen-color enforcement. |
| New Skill exclusions are missing from lifecycle bookkeeping | [campaign-delete-plan.ts](../../src/features/lifecycle/campaign-delete-plan.ts) lacks `campaign_skill_exclusion`; its two closure/order tests fail. [lifecycle-service.ts](../../src/features/lifecycle/lifecycle-service.ts) also omits exclusion references from Campaign counts and Skill dependency reporting. Migration 0090 has Campaign `ON DELETE CASCADE`, so these failures do **not** demonstrate orphaning or a broken Campaign delete. Its Skill FK is restrictive, so a Skill used only by an exclusion can be presented without the proper dependency explanation before the database rejects deletion. This is an integration gap to fix, not a test to silence. |
| Runtime schema command targets an old snapshot | [package.json](../../package.json), `validate:runtime-schema`, still passes `0036_snapshot.json`. The verifier compares the full schema, so that argument is obsolete for current DEV. Running the same verifier against 0090 passed. |
| Old deferred-damage wording remains in source snapshots | [action-source-resolver-service.ts](../../src/features/tabletop-operations/action-source-resolver-service.ts) still embeds statements that ordinary attack damage/Armor/Soak/location are deferred. Current [action-effect-plan-service.ts](../../src/features/tabletop-operations/action-effect-plan-service.ts) invokes [ordinary-attack-consequence-service.ts](../../src/features/tabletop-operations/ordinary-attack-consequence-service.ts) to execute supported numeric attacks. Update new-output wording; preserve historical snapshots. |

The unit failures divide into **five loader failures, two stale appearance assertions and two lifecycle-plan failures**. The nine failures are not nine separate broken gameplay features.

## Database cleanup review

**146 of 199 DEV tables are empty.** Most are legitimate runtime/history/capability tables in a lightly populated development database. Emptiness alone is not grounds to drop them.

| Structure / records | Current DEV finding | Recommended treatment |
| --- | --- | --- |
| `item_rules` | Zero rows; the only table with no application consumer in the schema-symbol/raw-table scan. Canon import still writes it. | Best table-retirement candidate, subject to Production/source-receipt review and a deliberate importer/migration decision. |
| `campaign_allowed_derived_ability` plus Campaign compatibility flag | Zero links; all four Campaigns marked reconciled. Application compatibility reads still exist. | DEV is ready for a compatibility-removal assessment. Do not remove globally until every target is reconciled. |
| `derived_ability_trigger` | Six rows mirrored alongside six generalized requirements; zero local abilities depend solely on the legacy fallback. | Potential migration cleanup, but the editor still writes mirrors and runtime still supports fallback. Update all three parts together after Production review. |
| `session` | 23 rows, two expired at audit time. | Routine expired-session housekeeping candidate using the auth lifecycle. No tokens or account records were exported or changed. |
| Spell Construction v6 documents | 370 v6 documents and one v7; all 371 parse and pass the adapter. | Supported older representation, not corrupt/unused records. Preserve bytes until an intentional migration. |
| `spell-import-source` extensions | 371 valid JSON receipts. | Preserve provenance. Lack of gameplay execution is expected for source evidence. |
| Legacy charged Item Use | Zero local `use_mode = 'charges'` rows. Code intentionally blocks this retired activation model. | Production content audit before retiring compatibility/UI. Current Shared Charges and Item powers are a different, active implementation. |
| Companion, Evolution, runtime and effect ledgers | Many empty tables; declared and referenced by implemented workflows. | Retain. They record supported/future-authorized operations and immutable history, not abandoned data by inference. |
| Form/Natural Attack records | Populated and intentionally authored, despite missing gameplay adapters. | Retain and integrate. Their lack of execution is not a reason to delete content. |

No broken foreign-key references or definite disposable catalog rows were identified. Semantic duplicates across differently classified records, uploaded-file usage, historical JSON references outside the inspected extension/Skill paths, and Production data retention still need their own evidence before deletion.

## Runtime already present and worth preserving

Current source includes authoritative gameplay paths for Character creation/advancement and Campaign Skill access; encounter enrollment/Initiative/declarations/responses; ordinary and firearm attacks; health, injury, Mana, supported conditions/modifiers and duration processing; Normal-body protection/Interaction Rules; Item powers/charges/equipment and inventory custody/containment; Derived Ability qualification/passive/use ledgers; shops/commerce; rewards and closeout; live tabletop updates and chat; and permanent Evolution/Return outside encounters.

These are implementation-presence findings, not a fresh browser certification of each subsystem. Generic rolls, manual rulings and descriptive conditions are supported workflows, but do not automatically execute every rule mentioned in a description.

## Proposed order of work

1. **Repair misleading promises and verification drift:** Creature Magic guidance/adapter decision, Skill-exclusion lifecycle bookkeeping, test runner/print assertions and current schema target. This gives subsequent work trustworthy gates.
2. **Perform bounded cleanup:** the 12 unused application modules and their obsolete assertions. Preserve live shared print CSS, underlying services, redirects and maintenance tooling.
3. **Choose the runtime backlog using actual content:** the largest present-day catalog coverage gap is the 28 manual Spell effect families; Race Natural Attacks and Forms already have authored DEV records waiting for execution.
4. **Design coordinated live state for Forms, Special Abilities, Evolution and companions:** establish authoritative owner/current-body/possession facts, command authorization, timing/costs, effect lifecycles and preservation rules before joining the interfaces. Settle provisional Special Ability progression and companion/mount/capture rulings explicitly.
5. **Finish partial adapters:** Creature construction/passive/usage/resource handling and remaining Derived Ability resource/event types. Reuse existing effect, declaration and ledger services where their contracts actually fit.
6. **Retire database compatibility only after all-environment evidence:** start with `item_rules`, reconciled legacy Derived allowlists and redundant trigger mirrors; keep provenance and history.

No deletion, runtime implementation, Production inspection, deployment or Git push was performed as part of this review.

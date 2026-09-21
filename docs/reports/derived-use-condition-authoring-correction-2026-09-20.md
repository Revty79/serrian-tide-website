# Pass 5 correction: Derived Ability Use Condition authoring

Base: `a786f4d859fa7486fd49533cac7deec922e66339`.
Commit subject: **PASS 5 — CORRECT DERIVED USE-CONDITION AUTHORING**.
Commit hash: see the delivery message / the commit containing this report.

The Derived Ability editor now authors supported Use Conditions in the same terms that the existing shared runtime evaluates. This is an authoring/runtime-parity correction. **Pass 6 has not started. Stop for Brannan and Ember review.**

## Authoring behavior

| Selected fact | Normal comparison controls | Stored behavior |
| --- | --- | --- |
| Boolean Equipment, including exact Item state | Required State: Present / Not present | `possessed` / `not-possessed` |
| Boolean State, including Dead, Incapacitated and exact active Condition names | Required State: Present / Not present | Same existing presence operators |
| Numeric State, including current/max HP, HP percentage, Initiative and round | Greater than or equal to; Greater than; Less than or equal to; Less than; Equal to; Not equal to; Number to Compare | Existing numeric operator codes and `numericValue` |
| Text State, including movement mode | Equal to / Not equal to; Text to Compare | `eq` / `neq` and `textValue`; exact case-sensitive runtime comparison |
| Event | Select the supported Event; Exact Event matching is implicit | New Event conditions retain `operator: null`; no client-authored event is manufactured |
| Manual | Human explanation/notes | Always requires G.O.D. review; retained legacy fields are available only in Saved Condition Details |
| Custom/legacy key with unknown type | Advanced Comparison, with all existing plain-English operators and both value fields | Key, operator, number, text and notes remain editable and preserved; missing authoritative facts remain manual |

`abilityConditionFactType` uses the existing `ABILITY_FACT_DEFINITIONS` registry and the existing exact Item/active Condition key formats. It supplies presentation metadata only. Runtime facts, evaluation, operator codes and event producers are unchanged. Creature authoring reuses the shared operator-label map while preserving its existing visible labels and layout.

No value or operator is inferred merely by selecting a fact. The author explicitly chooses the required state/comparison. Saved incompatible operators remain visible for deliberate correction. Changing Condition Type no longer clears the key, operator, number, text or notes.

Supported numeric facts do not show an irrelevant text comparison in the normal workflow; supported text facts do not show a number field. Existing extra values are retained in editable **Saved Condition Details**. Equal/Not equal with both number and text shows an ambiguity warning and remains manual until deliberately corrected. Ordered numeric comparisons with saved text also explain the existing manual boundary. Custom comparisons expose both fields in Advanced Comparison. Manual records keep their old fields without presenting them as an automatic comparison.

The Derived editor's condition selects have explicit accessible names. New comparison controls use shared semantic form classes. The existing searchable fact/Item selector and Advanced custom keys remain available. No broad UI rewrite or authoring backfill.

## Updated help

- Use Conditions now explain that authoritative facts are checked at use and unknown/Manual conditions require a G.O.D. ruling.
- Resource Costs describe existing supported Initiative/Mana enforcement with the required encounter/pool context; unsupported/custom costs remain manual.
- Use Limits explain the existing use ledger: Round/Encounter/Scene counts use their matching context; Never counts uses since acquisition; Manual/Event refresh uses explicit recorded reset entries. No automatic event listener or new recharge semantics are claimed.
- Activation help describes current passive reconciliation, deliberate Activated use, and controller-chosen Triggered/Reaction opportunities. The obsolete claim that Pass 5 does not execute combat behavior is removed.

## Construction-backed Item Magical regression

Both custom Magic Construction and canonical construction sources are covered. The existing Item Power validator already rejected a mundane Item and accepted its Magical equivalent.

The new real locking tests exposed a separate defect: **both invalid stored construction types could still lock through combat**. The initial regression run passed all 26 existing Pass 5 cases and failed the two new cases with “Missing expected rejection.” This is the specific defect that triggered the request's permission for a focused correction.

The lock path now reads `isMagical` under the existing Item root lock and rejects a construction-backed Ability on a mundane Item. This adds four lines to the existing source resolver. It does not infer magic from names/prose, change the shared fact adapter, or redesign Item Powers.

Both new regressions now prove:

1. Mundane authoring is rejected for custom and canonical constructions.
2. Invalid stored mundane construction cannot lock.
3. A valid Magical Item locks with frozen `Magical = true`.
4. Its consequence satisfies a target `Requirement → Magical = true`.
5. A later live Item flag change does not alter that committed action's frozen incoming facts or result.

This is the only runtime change. No unrelated combat mechanics, incoming-effect math, resource spending, historical plans, Absorption precedence, armor stacking or firearm inheritance changed.

## Validation

- Full feature suite: **1,566 passed across 175 files**, including shared fact/evaluator, Derived runtime, Creature runtime and four new comparison-presentation tests.
- Full combat service harness: **284 passed across 27 scripts**, including all Derived runtime/ledger compatibility, Creature Ability runtime, and **28 Pass 5 runtime DB cases**. All existing combat expectations remain unchanged.
- New Derived authoring browser: **passed** against a newly migrated disposable PostgreSQL cluster, with no browser runtime errors. It authors/saves/reloads twelve conditions and evaluates the persisted rows through the real fact provider. It covers both armor presence states, exact searched Item → Wielded, Dead true/false and its inverse, HP 60/40 against 50, case-sensitive movement text, an actual server-produced attack-targeted response window, exact active Conditions, unknown custom keys, ambiguous old values and Manual history. It then deliberately clears the extra value and verifies automatic evaluation after save/reload. An unrelated Derived Ability record remains unchanged.
- Existing Creature authoring browser: **passed unchanged**, including supported selectors, plain-English operators, Manual/custom keys, hidden values, master/NPC save/reload, protection and interaction authoring, mobile layout and Harvest & Utility.
- TypeScript `--noEmit`: **passed**.
- Changed-file ESLint: **passed**, zero warnings.
- Production build: **passed**, Next.js 16.3.2. Temporary build-generated TypeScript include paths were removed.
- `git diff --check`: **passed**.

No existing expectation was weakened or mass-updated. The browser checks led to explicit accessible names for the condition selects, and the test reopens Saved Condition Details after Save before editing; all data-preservation and runtime assertions remain enforced. The new Item locking regressions failed before the production guard and passed afterward.

Validation uses disposable fixtures only; no application Character, Creature, Item or Derived Ability data was changed. No migration, backfill, push or deployment. Automated checks are regression evidence, not Brannan's human acceptance.

Local logs: `artifacts/creature-authoring/pass5-correction-*.log`. Focused phone screenshots and the successful Derived browser result are retained with this commit under `artifacts/creature-authoring/derived-use-conditions/`.

Reproduce with the full feature runner, `scripts/combat-completion-disposable-db.test.ts`, `scripts/derived-use-conditions-disposable.test.ts`, and the unchanged `scripts/creature-authoring-disposable.test.ts`. The disposable PostgreSQL/browser harnesses need normal Windows process permissions for `initdb`. Build uses the ignored `.next-creature-authoring-build` output directory.

## Scope and review

No new Event producers or condition language. No Creature passive persistence or Creature use-limit storage. Harvest & Utility is unchanged. No unresolved tabletop rule was decided. **No Pass 6 work.**

The acceptance question is satisfied by the browser-to-database-to-runtime checks: an author can select supported facts in plain English, choose the appropriate comparison, save/reload, and receive the result implied by those controls. Unknown or ambiguous legacy data remains explicit and reviewable.

## Exact files changed

```text
COMBAT-RESUME.md
artifacts/creature-authoring/derived-use-conditions/boolean-narrow.png
artifacts/creature-authoring/derived-use-conditions/results.json
artifacts/creature-authoring/derived-use-conditions/saved-details-narrow.png
docs/reports/derived-use-condition-authoring-correction-2026-09-20.md
scripts/derived-use-conditions-browser.ts
scripts/derived-use-conditions-disposable.test.ts
scripts/pass5-runtime-db.test.ts
src/app/heavens/creatures/creature-use-conditions-editor.tsx
src/app/heavens/derived-abilities/derived-ability-constructor.tsx
src/features/ability-use-conditions/authoring.test.ts
src/features/ability-use-conditions/authoring.ts
src/features/ability-use-conditions/comparison-editor.tsx
src/features/tabletop-operations/action-source-resolver-service.ts
```

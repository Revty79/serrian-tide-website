# Step 2 final Use Conditions usability correction

Base: `4b23143c9f2b44bfb06d6c027dc5b1f198434d60`.

## Result

Creature masters and NPC individuals share the revised Use Conditions UI. Accessible **?** buttons explain Activation Type, the condition types, keys, operators, comparison values and notes. They open inline by click/tap or keyboard and fit the mobile authoring card.

Manual Ruling shows a human explanation; Event shows Event Key and Exact Event matching; Equipment/State expose presence choices first. All eight comparison codes retain their stored values and use plain-English display labels. Advanced Comparison retains richer authoring, with contextual Number to Compare / Text to Compare fields. Saved Condition Details exposes preserved values outside the current view. Changing a type, operator or comparison view never automatically erases those values.

Help distinguishes current support from planned integration. Current Event matching needs a supplied matching event key. Equipment/State domain evaluation can use boolean maps, but normal Character Derived Ability runtime does not supply a complete equipment/state catalog. Numeric/text comparisons are preserved authoring, not a newly implemented runtime engine. Creature authoring profiles remain metadata.

The [authoring contract](../architecture/creature-authoring.md#explicit-later-combat--runtime-integration-requirement) records all required later work: authoritative Event, Equipment and Character/Creature State facts; supported key selectors; proper evaluation of every operator; numeric/text values; and G.O.D. fallback when an authoritative determination is unavailable.

## Decisions for Brannan's review

- **Separate Manual Description and Notes?** Use a single **Description / Notes** field backed by the existing `notes`. There is no separate description in the accepted model. This avoids adding a field or appropriating legacy `textValue`; the existing required manual explanation validation remains intact.
- **What happens when both number and text were saved?** Preserve both. Equal/Not Equal offers a local Compare As selector. Text-only data initially shows Text; other data initially shows Number. The other saved value remains in Saved Condition Details. Future runtime integration must explicitly settle ambiguous older combinations.
- **Should switching types/operators clear irrelevant values?** No. It changes presentation and the explicitly selected field only. Saved data remains available, including complex fields on Manual Ruling and Event conditions.
- **Should example keys be selectable supported keys today?** No. They are labeled examples; the supported catalog is an explicit later requirement.

## Validation

- **1,432/1,432 feature tests across 168 files pass**, including Creature authoring, Creature/NPC compatibility and Derived Ability runtime tests.
- **Disposable PostgreSQL/authenticated browser suite passes.** New checks exercise keyboard and actual touch help, all four type labels/help, key explanations, all eight plain-English operator options and exact stored codes, numeric/text help, notes, simple Manual Ruling, conditional visibility, mobile controls, and complex Manual/Event conditions containing both values. Exact conditions survive master save/reload, unopened-card saves, NPC construction, individual save/reload and unchanged baseline/master checks. The existing migration, snapshots, direct encounter, variants, lifecycle, Race and ordinary Creature authoring checks also pass.
- **TypeScript, changed-file ESLint, production build and diff checks pass.** Mobile screenshot reviewed at `artifacts/creature-authoring/use-conditions-phone.png`; help and controls fit the 390-pixel viewport. Browser reports no page errors.
- Attack and Harvest & Utility component bodies compare unchanged against the parent. No domain/service/database/migration files changed.

Local validation logs: `artifacts/creature-authoring/use-conditions-unit.log`, `use-conditions-browser.log`, and `use-conditions-build.log`. An initial browser run found a test locator referring to the last condition after additional rows were added; the locator was corrected and the complete suite rerun successfully. Automated authoring checks do not replace Brannan's usability review or validate future runtime integration.

## Exact files

```text
COMBAT-RESUME.md
docs/architecture/creature-authoring.md
docs/reports/creature-use-conditions-correction-2026-09-20.md
scripts/creature-authoring-browser.test.ts
scripts/creature-use-conditions-browser-checks.ts
src/app/heavens/creatures/creature-authoring-editor.tsx
src/app/heavens/creatures/creature-use-conditions-editor.module.css
src/app/heavens/creatures/creature-use-conditions-editor.tsx
```

## Scope

No domain, schema, migration, server save or runtime execution changes. Interaction Rules, Creature Attacks, Harvest & Utility, damage, Natural/Worn protection, Race Natural Protection and Incoming Effect Resolver are unchanged. Only disposable test records were authored during validation. No DEV catalog/Creature records altered, push or deployment. **Step 3 has not started. Stop for review after this correction.**

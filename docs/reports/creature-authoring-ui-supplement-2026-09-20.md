# Step 2 UI cleanup / supplement

**Base:** `709b2276cf50906ec8733f62126ea899bb0529c3`. This supplement is committed directly on that revision. Its hash is supplied in the final delivery.

The accepted Step 1/2 models remain unchanged. Creature masters and NPC individuals now use the same primary Attack and Ability forms, with legacy references and optional complexity separated from ordinary authoring. Races share the simpler Interaction Rule editor.

**Brannan's correction takes precedence:** Uses / Harvest & Utility is out of scope. Its component, both Creature Overview implementations, labels, controls, placement and data flow are unchanged. It remains visible and editable. The contrary instructions in the original supplement were not implemented.

## Attack fields

Normal visible fields are **Attack Name, Attack %, Attack Initiative, Damage, Damage Type, Attack Mode, Magical, applicable Range/Reach, and Notes**. Initiative belongs to the same primary field grid as Name, Attack % and Damage; there is no secondary Attack Setup block.

| Mode | Range fields |
| --- | --- |
| Melee | Optional Reach. Reach Unit appears only when a numeric Reach is entered, because the unchanged validator requires a unit for authored range values. No default unit is inferred. |
| Ranged | Distance Unit, Short Range, Medium Range, Long Range |
| Hybrid | Reach, Distance Unit, Short Range, Medium Range, Long Range |
| AoE | Existing supported range-to-effect fields: Distance Unit and Short/Medium/Long. Area description remains in Notes or optional Magic Construction. |

A melee Attack saves with blank Reach and no distance. Changing mode preserves previously authored hidden range values. Empty On-Hit Effects show **Add On-Hit Effect**, without an empty effect form. Authored effects remain editable and ordered. Magic Construction remains collapsed and optional.

## Ability fields

Normal visible fields are **Ability Name, Description, Activation Type, Ability Initiative when applicable, and Effects**. Empty Effects offer an add button. Activated/Triggered/Reaction show Initiative; Passive has neither Initiative nor activation-cost controls.

**Advanced Ability Settings** contains Origin, Resolution Mode, applicable Fixed Roll Target, Targeting Notes, Magical, applicable Resource Costs, Use Conditions, applicable Uses & Recharge, Magic Construction, Threat / CR Impact, and Notes. Conditions and costs do not create empty rows until requested. The existing activation-change behavior and validation are unchanged.

## Legacy references and preservation

Populated records display collapsed, read-only reference sections. New empty records display no empty legacy sections.

| Record | Reference-only fields |
| --- | --- |
| Attack → Legacy Data | Range / Reach text, Required Anatomy, Requirements, Uses / Recharge text, Special Effect text |
| Ability → Legacy Data | Activation text, Requirements text, Uses / Recharge text, Mechanical Notes (`mechanicalEffect`) |
| Creature/NPC → Legacy Defense Data | Existing Defense Type, Against, Value, Notes and CR Impact |
| Race → Legacy Data | Existing Legacy Description |

Legacy Defense creation/removal/edit controls are absent from the normal builder, and Creature Preview no longer repeats those rows as ordinary defense chips. They remain available in the one collapsed reference section. Structured Interaction Rules remain the new authoring path. Legacy values remain in the complete drafts; save/load, NPC snapshots and services are unchanged. System-owned canonical identities no longer appear as editable NPC Ability fields.

**Harvest & Utility is specifically excluded from this legacy cleanup.** It retains its established editor exactly as requested.

## Interaction Rules and Race layout

- Basic rules show Name, Type, **Requires/Against**, common matching fields, and **Amount (%)** or **Healing (%)** where applicable.
- Common options are Damage Type, Magical, Item Property and Condition Name. **More matching options…** opens Advanced Matching.
- ANY/ALL appears only with two or more conditions. New rules retain the existing ANY default; existing saved values are preserved.
- **Advanced Matching** contains Source Kind, Item Tag, Mechanical Effect Kind, optional Related Creature restriction, applicable scope, notes and Creature CR Impact. Saved advanced conditions/nonstandard scopes retain plain-language summaries.
- Mandatory Damage scope has no editable selector. Requirements/Immunities expose other scopes in Advanced Matching. No rule semantics, percentages, keys, ordering rules, reference handling or storage changed.
- Creature/NPC shared tab labels are **Stats & Movement**, **Health & Protection**, **Combat**, and **Abilities & Defenses**. Overview, Variants & CR and Preview remain; NPC-specific Current State/Inventory remain.
- Race **Mechanics** replaces Attributes & Movement and orders **Attribute Caps → Movement → Racial Interaction Rules**. No Natural Protection was added.
- The actual phone workflow exposed an existing Creature desktop-column override that could clip the card and Save button. Four scoped CSS rules now collapse the Creature workspace and wrap its editor header at narrow widths. Other page layouts and the Harvest component were not redesigned.

## Validation

| Check | Result |
| --- | --- |
| Feature suite | **1,432/1,432 passed across 168 files**, including Creature authoring, Interaction Rules, Race, NPC and snapshot compatibility tests |
| Disposable PostgreSQL/authenticated browser suite | **Passed**, including existing migration compatibility checks; no DEV or production data used |
| Ordinary Attack/Ability workflow | New cards expose primary fields immediately, omit empty legacy sections, keep optional settings closed, save/reload, and support all activation/range modes |
| Simplified Interaction Rule workflow | Common rules author without advanced fields; second condition reveals ANY/ALL; advanced types, scopes and CR remain reachable; percentages and stable ordering remain validated |
| Legacy preservation | Old Attack/Ability fields, Defenses and Uses compared before/after save; populated reference panels are accessible and read-only; old Race legacy text survives save |
| Structured preservation | Saving a reloaded master without opening its cards preserves complete Attacks, Abilities, Uses, Defenses and Interaction Rules; NPC current edits preserve baseline/master isolation and hidden legacy data |
| Snapshot/lifecycle compatibility | NPC construction, old snapshots, current snapshots, direct encounter snapshots, variants and Creature/Race archive/restore pass |
| Desktop / 390-pixel phone | Primary field visibility and viewport fit, conditional fields, optional sections, screenshots and actual mobile Save pass |
| Harvest boundary | Compared with the base: Harvest component and master/NPC Overview implementations are identical; browser verifies existing values/controls and save preservation |
| TypeScript, changed-file ESLint, production Next.js build, diff checks | Passed |

Evidence is under ignored `artifacts/creature-authoring/`, including `simple-attack-desktop.png`, `simple-attack-phone.png`, `simple-ability-desktop.png`, `simple-ability-phone.png`, `simple-rule-phone.png`, and `results.json`. Logs: `artifacts/creature-authoring-ui-unit.log`, `artifacts/creature-authoring-ui-browser.log`, and `artifacts/creature-authoring-ui-build.log`.

No schema, migration, domain model, server save service or runtime implementation changed. No existing DEV/catalog records were modified. Tests used disposable fixtures only. Combat damage/protection behavior is unchanged; no combat test expectation was changed. These checks demonstrate authoring workflows, not human play acceptance. **Step 3 and Natural-vs-Worn have not started. Stop for review after this supplement.** No push or deployment.

## Exact files changed

```text
COMBAT-RESUME.md
docs/architecture/creature-authoring.md
docs/architecture/interaction-rule-authoring.md
docs/reports/creature-authoring-ui-supplement-2026-09-20.md
scripts/creature-authoring-browser.test.ts
scripts/creature-authoring-ui-checks.ts
scripts/interaction-rule-browser-checks.ts
src/app/heavens/creatures/creature-ability-effects-editor.tsx
src/app/heavens/creatures/creature-authoring-editor.css
src/app/heavens/creatures/creature-authoring-editor.tsx
src/app/heavens/creatures/creature-workspace.tsx
src/app/heavens/creatures/creatures.css
src/app/heavens/interaction-rules-editor.module.css
src/app/heavens/interaction-rules-editor.tsx
src/app/heavens/legacy-authoring-data.module.css
src/app/heavens/legacy-authoring-data.tsx
src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx
src/app/heavens/races/race-workspace.tsx
```

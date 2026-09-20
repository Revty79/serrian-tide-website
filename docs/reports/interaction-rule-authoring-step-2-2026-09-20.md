# Step 2 — Creature and Race Interaction Rule authoring

**Base:** `a76483985e0bbac46581d8ea1840ecb600e0e5be`. Step 1 was explicitly accepted. This is a separate Step 2 commit directly on that base; the final delivery includes its hash.

**Acceptance result:** Creature masters, Creature NPC individuals and Races can author Silver/Magical Requirements, Immunity, Resistance, Vulnerability and Absorption with one shared model. These rules are preserved without being applied in combat. Step 3 has not started.

## Implementation

- One version-1 `InteractionRuleProfile` contains ordered rules with stable keys, names, type, explicit consequence scope, ANY/ALL matching, structured conditions, applicable percentage, notes and sort order. Creature rules additionally require the existing CR Impact choice. See the [exact shared types, validation and semantics](../architecture/interaction-rule-authoring.md#shared-contract).
- All seven matcher kinds are available: Damage Type, Magical, Source Kind, Item Property, Item Tag, Mechanical Effect Kind and Condition Name. Existing action/effect vocabulary is reused. Firearm is a restriction on `weapon`, not a new source alias.
- Item Properties use name and optional value, plus optional related Creature canonical identity. Ordinary Silver does not require a related Creature. Existing property relationship records and metadata are untouched. Tags use catalog canonical IDs, with an authenticated catalog selector and server reference validation.
- Creature and NPC **Traits, Abilities & Defenses** now begin with **Interaction Rules**; existing fields remain under **Legacy Defense Notes**. Race **Attributes & Movement** contains the same editor as **Racial Interaction Rules**, without Creature CR fields. Conditional controls, percentage guidance, explicit Magical help and Absorption semantics are shared. New interfaces use semantic theme variables and shared form controls.
- Resistance, Vulnerability and Absorption require finite positive percentages and Damage scope. Percentages have no upper cap or inferred default. Requirement and Immunity reject percentages. ANY/ALL remains flat. Stable identities and nested data survive reordering and copying.
- Creature master save/load, NPC baseline/current snapshots, individual edits, direct encounter snapshots and derived variants preserve the profile. Old snapshots with no profile still load. NPC edits leave baseline and master rules unchanged. Existing legacy Defenses are not parsed or converted.
- CR Impact is authored and preserved but deliberately excluded from calculated CR, because legacy Defenses may describe the same interaction. The browser suite confirms the new authored impacts do not change calculated CR.
- Race authoring/storage is complete. Characters currently reference a Race by ID; no Race interaction snapshot/application policy was invented.

## Migration and existing data

`0062_interaction_rule_authoring.sql` adds `interaction_rules_json` JSONB to **creatures** and **races**, nullable with no default. Two envelope constraints require an object, supported version and rules array. Domain validation checks the detailed shared contract. There are no updates, deletions, backfills or conversions in this migration.

Applied only to loopback `serrian_tide_dev`, after verifying all 62 existing migration hashes/timestamps and decoding a backup of both affected tables. After migration all **63 ledger entries match**. Row counts/digests for **all 158 public tables** are unchanged, excluding only the newly added nullable columns. All **92 Creatures**, **56 Races** and **23 legacy Defenses** remain; all new profiles remain null.

Local evidence (ignored artifacts):

- Backup: `artifacts/creature-authoring/interaction-rules-backup-1789942734328.json`
- Receipt: `artifacts/creature-authoring/interaction-rules-migration-receipt-1789942734328.json`
- Browser results/screenshots/server log: `artifacts/creature-authoring/`
- Run logs: `artifacts/creature-authoring-step2-unit.log`, `artifacts/creature-authoring-step2-browser.log`, `artifacts/creature-authoring-step2-build.log`

No production access, push or deployment.

## Validation

| Check | Result |
| --- | --- |
| Focused shared Interaction Rule domain tests | **14/14 passed**: five types, seven matchers, Silver/Magical, ANY/ALL, scopes, exact percentages including above 100, invalid percentages, malformed data, stable keys/order, copy isolation |
| Feature suite (`node scripts/run-feature-tests.mjs`) | **1,432/1,432 passed across 168 files**, including Creature, Race, NPC, Item Property/Tag, Mechanical Effects and migration compatibility checks |
| Disposable PostgreSQL migration and authenticated browser suite | **Passed**: old Creature/Race rows save with null profiles; additive migration preserves old columns; invalid envelopes rejected; shared rules save/reload; missing references rejected; percentages rejected without persisted changes; NPC/encounter/variant preservation; immutable baseline/master; legacy Defenses retained; Creature/Race archive/restore; 390-pixel authoring layout |
| TypeScript (`tsc --noEmit`) | Passed |
| Changed-file ESLint | Passed |
| Drizzle schema/history check | Passed |
| Production Next.js build, isolated output directory | Passed, including TypeScript and 27 static pages |
| Diff checks | Passed |

These checks verify authoring and preservation. They do **not** claim the new rules execute in combat or establish human play acceptance. Temporary build-generated TypeScript include changes were removed.

## Decisions made for review

1. Percentage rules currently allow only Damage scope, preventing accidental percentage effects on healing, buffs or conditions.
2. Firearms reuse the existing `weapon` source category with an optional Firearm-only restriction.
3. Item Property related Creature restrictions are optional; tag identity uses the catalog canonical ID.
4. New Creature CR Impact remains metadata until legacy Defense overlap is deliberately reconciled.
5. Variant copies retain owner-local rule keys with independent stored profiles; NPC individual edits preserve the immutable baseline.
6. Race/Character snapshot semantics are deferred because no existing Race-rule snapshot contract provides an authoritative answer.

Runtime questions remain explicitly deferred: precedence/stacking; damage/protection ordering; rounding and percentages above 100; combined weapon/ammunition source facts; harmful-effect classification and comparison normalization; Race snapshot/update timing; unavailable catalog references; and legacy CR reconciliation. The [architecture note](../architecture/interaction-rule-authoring.md#deferred-runtime-decisions-for-review) records these for the later approved steps.

**Combat damage/protection behavior is unchanged.** No incoming resolver, prevention, percentage damage adjustment or Absorption healing executes these profiles. Ordinary/firearm/spell damage, armor/soak, Active Health, Mechanical Effect application, Attack/Item Ability consequences and ActionEffectPlan final values are unchanged. The direct-spawn service changes only the preserved snapshot metadata. No Natural-vs-Worn work, Race Natural Armor, or Step 3 work was started. Stop for review after this commit.

## Exact files changed

```text
COMBAT-RESUME.md
docs/architecture/interaction-rule-authoring.md
docs/reports/interaction-rule-authoring-step-2-2026-09-20.md
drizzle/0062_interaction_rule_authoring.sql
drizzle/meta/0062_snapshot.json
drizzle/meta/_journal.json
scripts/creature-authoring-browser.test.ts
scripts/creature-authoring-disposable.test.ts
scripts/interaction-rule-browser-checks.ts
src/app/heavens/creatures/actions.ts
src/app/heavens/creatures/creature-workspace.tsx
src/app/heavens/interaction-rule-actions.ts
src/app/heavens/interaction-rules-editor.module.css
src/app/heavens/interaction-rules-editor.tsx
src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx
src/app/heavens/npcs/actions.ts
src/app/heavens/races/actions.ts
src/app/heavens/races/race-workspace.tsx
src/db/creature-schema.ts
src/db/race-schema.ts
src/features/characters/firearm-baseline-migration.test.ts
src/features/creatures/creature-npc-constructor-service.ts
src/features/interaction-rules/interaction-rule-references.ts
src/features/interaction-rules/interaction-rules.test.ts
src/features/interaction-rules/interaction-rules.ts
src/features/tabletop-operations/creature-spawn-service.ts
```

# Creature authoring Step 1 — 20 September 2026

Starting revision: `dc420a559776346ebd55ab2cdb84e3104022760a`, clean `main`, verified against `origin/main` before work.

## Delivered scope

Creature Attacks now author Initiative, Melee/Ranged/Hybrid/AoE mode, structured range, an explicit Magical qualifier, ordered On-Hit Effects, and optional shared Spell Construction. Traits and Abilities now author Passive/Activated/Triggered/Reaction behavior, Initiative where applicable, resource costs, use conditions, uses/recharge, resolution, targeting notes, and shared Magic construction. Origin replaces the ambiguous Type label. Harvest & Utility moves to Overview in both master and individual editors.

Migration `0061_creature_authoring.sql` adds two nullable, versioned JSONB profiles and envelope constraints. It updates or deletes no records. See [the storage and reuse contract](../architecture/creature-authoring.md) for field details and compatibility behavior.

The existing Mechanical Effect codec and editor are shared by Ability Effects and attack On-Hit Effects. Weapon range validation, Derived Ability activation/condition/cost/refresh definitions and validators, and the shared Spell editor/calculator/adapter are reused. The only new structures are the two versioned authoring profiles and their shared Creature/NPC editor.

## Decisions for Brannan's review

These are the questions resolved using the authorization to use judgment while Brannan is away:

1. **Should imported attacks be classified automatically?** No. Old timing, mode, range, and magic remain unspecified. No names or text are interpreted as rules.
2. **Must all ranges be complete before saving?** No. Partial profiles can be authored incrementally. Entered distances must be positive, have a unit, and maintain band order. Melee Reach is optional; no target distance is required.
3. **Which Origin values belong in the dropdown?** Natural, Supernatural, Elemental, and Construct match the instructions and current catalog. The existing combined `Natural / Supernatural` value remains available as a legacy choice.
4. **Should new fields start executing immediately?** No. They are saved for the next integration step. Existing timing fallbacks and existing Ability Effects continue to operate as before.
5. **What happens when an author changes an ability to Passive?** Activation Initiative, resource costs, and fixed-roll settings are cleared; legacy notes and structured effects stay. Passive conditions remain authorable. No automatic passive runtime is added here.
6. **Should unsupported magic or special effects block authoring?** Structurally valid Spell drafts may be saved; the shared editor/calculator reports incomplete construction. Unsupported effects stay manual/legacy. No new mechanics are invented.
7. **Should attack riders be removed from duplicate abilities?** No. No duplicate ability is migrated or deleted. Brannan can decide which authored record should remain after reviewing each case.
8. **Should the new metadata use separate child tables?** The ordered effects reuse the existing Mechanical Effect representation inside versioned owner profiles; existing Ability Effects retain their current table. This avoids duplicating four existing authoring systems and preserves the existing snapshot model.

## Catalog reauthoring candidates

A read-only loopback DEV audit found **92 Creatures, 171 Attacks, 48 Abilities, 23 Defenses, and 38 Harvest/Utility entries**. Of those, **80 attacks** have Special Effect text and **44 abilities** have Mechanical Notes; **zero abilities** currently have structured Ability Effect rows. No source mechanics were guessed or rewritten.

Examples needing deliberate review include Air Elemental → Gale Burst (forced movement), Baboon → Strike / Grapple, Banshee → Death Wail, Basilisk → Deadly Gaze, Behemoth → Crushing Charge and Trample, and bear claws or charges with Knockdown. Those descriptions do not establish executable mechanics. All 171 existing attacks and 48 abilities can benefit from explicit reauthoring when their canon is confirmed.

## Validation

- **1,417/1,417 feature tests**, across 167 files, including the new authoring cases and existing Creature, Derived Ability, Item Power, Spell, Character/NPC, and combat tests. The initial focused subset passed **225/225**. The migration-list regression now expects the additive 0061 migration.
- **Disposable migration and browser suite passed** (`node --import tsx --test scripts/creature-authoring-disposable.test.ts`). It migrates to the previous schema, inserts legacy records, applies 0061, and compares all legacy Creature/Attack/Ability/Defense/Use columns. Malformed authoring envelopes are rejected.
- The authenticated browser run covers old-record load/save, unknown Origin preservation, old snapshots, four Attack modes and conditional controls, ordered On-Hit Effects, shared Magic construction, all four activation types, resource costs, recharge, Harvest & Utility, NPC construction/editing, immutable baseline isolation, rejected negative Initiative with unchanged saved state, direct encounter snapshots, archive/restore, and a 390-pixel authoring layout. No browser page errors were recorded. This is automated validation, not human play acceptance.
- TypeScript, changed-file lint, production build, Drizzle consistency, migration ledger verification, and diff checks pass.

Early browser attempts exposed cold-compilation timeouts and ambiguous accessible labels on the new dropdowns. The controls now have explicit accessible names, the NPC route imports the shared Spell styles, and the test allows cold route compilation. The NPC fixture also supplies its existing required Role / Label. The final disposable run passes all checks.

The additive migration was applied to loopback **`serrian_tide_dev`** after backing up both affected tables. The migration ledger now matches all **62** repository entries. **All 158 public table row digests are unchanged**, excluding only the newly added nullable columns from their two owner-table comparisons. All new authoring profiles remain null; no legacy mechanic was backfilled. Character, NPC, encounter, inventory, and combat records were preserved.

Local evidence: `artifacts/creature-authoring/results.json`, desktop/phone screenshots, `legacy-authoring-backup-1789939034111.json`, and `migration-receipt-1789939034111.json`. Compiler/test logs are under ignored `artifacts/creature-authoring-*.log`.

## Files changed

| Area | Files |
| --- | --- |
| Schema/migration | `src/db/creature-schema.ts`; `drizzle/0061_creature_authoring.sql`; `drizzle/meta/0061_snapshot.json`; `drizzle/meta/_journal.json` |
| Shared authoring contracts | `src/features/creatures/creature-authoring.ts`; `creature-effects.ts`; `creature-ability.ts` |
| Master editor/save | `src/app/heavens/creatures/actions.ts`; `creature-workspace.tsx`; `creature-authoring-editor.tsx`; `creature-authoring-editor.css`; `creature-ability-effects-editor.tsx` |
| NPC and encounter preservation | `src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx`; `src/features/creatures/creature-npc-constructor-service.ts`; `src/features/tabletop-operations/creature-spawn-service.ts` |
| Tests | `src/features/creatures/creature-authoring.test.ts`; `src/features/characters/firearm-baseline-migration.test.ts`; `scripts/creature-authoring-browser.test.ts`; `scripts/creature-authoring-disposable.test.ts` |
| Documentation and local artifacts | `docs/architecture/creature-authoring.md`; this report; `COMBAT-RESUME.md`; `.gitignore` |

## Boundary

Final damage/protection resolution and the incoming-effect interaction engine are unchanged. This work does not redesign combat Initiative, Rolls, percentile success, hit locations, firearms, armor, inventory, spell rules, Derived Abilities, or ActionEffectPlan. Step 2 is not started. No push or deployment is part of this commit.

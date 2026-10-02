# Campaign Skill restrictions

Implemented and verified on 2026-10-02.

## Behavior and persistence

Migration `0090_campaign_skill_exclusions.sql` adds `campaign_skill_exclusion` with `campaign_id`, `skill_id`, and `path_key`. The primary key is `(campaign_id, path_key)`; foreign keys reference Campaign and Skill. A check validates numeric path syntax and the target ID. `path_key` uses the existing `RecursiveSkillPath.key` format, such as `131>66` for the currently authored Ranged Weapons → Firearms branch.

Only explicit exclusions are stored. Missing rows mean individually allowed. Ancestor exclusions are evaluated as path prefixes rather than copied to descendants, so an explicit child exclusion survives parent off/on. New paths default to checked and still inherit their system and ancestor restrictions. Create and edit use the same transactional validation and persistence service. No master Skill or other Campaign is changed.

The shared selector groups the recursive library by Attribute and Special Abilities. Groups and branches expand independently; search reveals matching paths. Its search input fills the panel and has a minimum height of 48px. Blocked descendants remain inspectable, with disabled controls and the blocking reason.

## System and path rules

One Campaign resolver evaluates the exact canonical root-to-target path. Missing edges, cycles, repeated identities and invalid roots fail closed. It has no three-level limit. Allocation ancestry is reconstructed from stored or planned `parent_allocation_id`, including negative temporary allocation IDs in an advancement plan.

The shared explicit name mapping covers Spellcraft; Talismanism; Faith/Prayer/Devotion; Psionic Focus/Meditation/Channeling; Resonant Performance/Resonance Attunement/Harmonic Awareness; and Channeling/Meditation shared by Spellcraft and Talismanism. Named support mappings apply even when the catalog classification is `standard`. A disabled supernatural system cannot be overridden by a checked path. A Sphere under Spellcraft, Talismanism and Faith is evaluated separately for each path.

Starting Tier permissions retain their existing creation-only role. They do not disable the G.O.D.'s Tier 2/3 exclusion checkboxes or become new advancement limits. Character creation still applies its normal Tier, parent and unlock rules after Campaign path access. Authored Tiers above 3 are not rejected for lacking a corresponding Campaign enum value. Tier 2/3 still require a valid parent allocation, and every descendant follows its actual authored ancestry.

Player creation, random generation and advancement choices use the resolver. Server saves and XP advancement independently validate fresh restrictions inside the write transaction, including G.O.D. sheet saves and the single-Skill advancement wrapper. Existing normal unlock, casting and investment rules remain in place.

## Grants and historical state

New Race grants and Creature grants must have an allowed canonical path. Existing grant schemas identify Skills without an allocation path, so these grants remain possible if at least one legal path survives; exact purchased allocations never switch branches automatically. Racial anchor creation uses an allowed path. The global Race and Creature definitions remain unchanged.

Guards cover Character Race assignment, Race NPC creation/recovery, Creature NPC/owned Creature construction, direct encounter spawning, Creature NPC snapshot edits, and Race/Creature Evolution and Return destinations. Owned Creature creation already passes through the shared NPC constructor.

Saving restrictions never deletes Character allocations, changes investment, or refunds points. The returned Campaign draft includes conflicts for exact learned allocations, current Race grants, Creature NPC snapshots and direct encounter Creature snapshots. Conflicts are shown in a disclosure on the settings page. Restricted allocations remain visible as historical/current state but cannot be changed, removed or advanced while restricted. Existing restricted Creature grant ranks are likewise preserved when editing their snapshot.

## Verification

- `npm.cmd run validate:campaign`: **58 passed**, including six new resolver regression tests.
- `npm.cmd run validate:realms`: **168 passed**, including random-generation exclusion and frozen-advancement regressions.
- `npm.cmd run validate:campaign-skills-db`: disposable PostgreSQL migration and real server-action scenario **passed**. Covers create/edit/reload, Campaign independence, duplicate/path validation, five-level save, excluded server purchase and XP rejection, rollback, unchanged investment/XP, default availability for a new Skill, blocked Race/Creature grants and historical conflict reporting.
- `npm.cmd run validate:campaign-skills-browser`: **passed** in Chrome at 1280px and 390px. Exercises Tier 2/3 checkboxes with only starting Tier 1 enabled, explicit child restoration, sibling independence, disabled supernatural systems, five-level search, input width/height and overflow.
- TypeScript, targeted ESLint and `git diff --check`: **passed**.

The browser check mounts the actual shared selector with the application's shared CSS; the database harness invokes the actual Campaign and Character actions with mocked request identity and Next navigation/cache boundaries. It does not constitute a complete deployed-site journey or human acceptance. No production deployment or production migration was performed in this pass. Read-only verification found migration 0090 and the new table already present in the local `serrian_tide_dev` database.

## Changed files

- Persistence: `src/db/campaign-schema.ts`; `drizzle/0090_campaign_skill_exclusions.sql`; `drizzle/meta/0090_snapshot.json`; `drizzle/meta/_journal.json`.
- Resolver/services: `src/features/campaigns/campaign-skill-access.ts`; `campaign-skill-access-service.ts`; `campaign-workflow.ts`; `src/features/skills/recursive-skill-library-service.ts`; `src/features/catalog-visibility/campaign-catalog-service.ts`.
- Campaign UI/actions: `src/app/heavens/campaigns/actions.ts`; `campaign-workspace.tsx`; `campaign-skill-selector.tsx`; `campaign-skill-selector.css`; `new/actions.ts`; `new/campaign-create-form.tsx`.
- Character enforcement/UI: `src/features/characters/character-campaign-skill-access.ts`; `character-rules.ts`; `character-advancement-rules.ts`; `models.ts`; `random-character.ts`; `src/app/characters/actions.ts`; `character-editor.tsx`.
- Grant boundaries: `src/app/heavens/npcs/actions.ts`; `src/features/creatures/creature-npc-constructor-service.ts`; `src/features/tabletop-operations/creature-spawn-service.ts`; `src/features/evolutions/evolution-execution-service.ts`.
- Tests: `src/features/campaigns/campaign-skill-access.test.ts`; `campaign-workflow.test.ts`; `src/features/characters/character-advancement-rules.test.ts`; `character-creation.test.ts`; `character-print-options.test.ts`; `firearm-baseline-migration.test.ts`; `random-character.test.ts`; `scripts/campaign-skill-access-disposable.test.ts`; `campaign-skill-actions-db.test.mjs`; `campaign-skill-selector-browser.test.ts`.
- Guidance/tooling: `src/features/guidance/page-help.ts`; `package.json`; `.gitignore`; this report.

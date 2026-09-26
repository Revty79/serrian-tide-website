# Form Access Requirements — Pass 4C

Built on Pass 4B `eb1fee3f89ee8b368fea55a4166459e7cbd7e5aa`. Race and Creature Forms now describe and display eligibility independently of their existing Transformation definitions. There is no active Form, transformation execution, resource spending, cooldown tracking or combat enforcement. Evolutions and the combined Forms audit remain separate future work.

## Shared architecture

`features/forms/form-access.ts` defines explicit `unrestricted` / `requirements` modes, structured requirement rows, strict owner-specific normalization and a pure evaluator. The result includes `available`, `locked` or `manual-review`, ordered groups and an explanation for every requirement. Undefined Access on legacy Forms means Unrestricted; malformed explicit definitions fail closed. Requirements mode with no rows is invalid. Unrestricted cannot retain hidden requirements.

`features/requirements/requirement-primitives.ts` extracts the existing Derived Ability numeric/possession operator vocabulary, numeric and absent-field validation, numeric comparisons, AND combination and OR combination. Derived Ability normalization/evaluation now calls these primitives without changing its semantics. Form Access does not impersonate a Derived Ability or evaluate transformation conditions.

Requirements in one numbered group are AND. Groups are OR alternatives:

| Group results | Overall eligibility |
| --- | --- |
| Any fully satisfied group | Available |
| No satisfied group, but an alternative has passing automatic checks plus unresolved manual checks | Manual Review |
| Every alternative contains a failed automatic check | Locked |

A failed automatic prerequisite dominates a manual requirement in the same group. An available alternative dominates a manual-only alternative. Manual text is never treated as automatic approval. An unknown Normal Attribute produces an explicit G.O.D. review explanation instead of an invented number; the same group-combination rules apply.

## Persistence and migration

`0076_form_access.sql`, its generated snapshot and journal entry add:

- `race_forms.access_mode` and `creature_forms.access_mode`, non-null and defaulting to `unrestricted`.
- `race_form_access_requirements`, with a cascading FK to its exact Race Form.
- `creature_form_access_requirements`, with a cascading FK to its exact Creature Form.
- Stable Form-local requirement keys, group/order positions, requirement type, Attribute identity, comparison/value, reference identities and notes.
- Restrictive Skill and Derived Ability FKs, reference indexes, unique keys/positions and checks for owner-appropriate types, coherent fields/operators and finite numbers. The shared column layout is constrained by owner: Creature Derived Ability prerequisites and Race Creature Ability prerequisites are forbidden.

There is no polymorphic owner FK. Mode/group consistency is enforced by shared save normalization. Requirement rows are replaced within the existing root transaction; surviving Form IDs stay stable. Omitted Access from an older editor preserves saved definitions. Client-supplied reference names/classifications are display-only and are not persisted as reference authority; reads hydrate labels from saved definitions.

Existing Forms remain intact and become Unrestricted. No rules are inferred from names, lore, Skills, transformation conditions or existing Form mechanics. The migration neither updates NPC snapshots nor adds an Access property to their stored JSON. It was generated and exercised only in disposable PostgreSQL databases; it was not applied to configured development or production databases.

## Race / Character semantics

`characterFormAccessContext()` accepts the saved Normal aggregate. It does not consume the edited draft or Form preview projection.

- **Skill / Special Ability possession:** existing persisted Skill allocations with positive investment, or the existing `getRacialSkillGrant(...).granted` result. Special Abilities remain Skill references, with classification visible in the picker and explanation. A Race `Granted` Special Ability with minimum **0** is possessed without purchasing a point. Ordinary racial Skill grants are also recognized.
- **Numeric Skill requirements:** existing `getCharacterSkillPointsById()` semantics: the highest persisted purchased Skill # investment for that Skill across allocation paths. No summing duplicate paths, Rank calculation, Attribute modifier, racial minimum or Form addition enters that number. Help labels explicitly distinguish possession from purchased-point thresholds.
- **Attributes:** the six existing `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHR` identities and saved Normal scores. Missing values remain unknown. Form adjustments do not participate; STR 35 with a Form granting +5 still fails STR ≥ 40.
- **Derived Abilities:** the existing resolved `derivedAbilityStatuses[].possessed` value. Ownership/acquisition and automatic possession remain the resolver's responsibility. A possessed ability whose live use is unavailable still satisfies a possession prerequisite. Live conditions are not reinterpreted as transformation conditions.
- **Unsaved edits:** changing an Attribute/Skill in the Normal editor does not grant eligibility before save. Selecting a different unsaved Race leaves its requirement-based Forms at Manual Review with a save-first explanation; Unrestricted remains Available. The viewer still lists every Form belonging to the exact selected Race and keeps it previewable.
- **Variants:** only the exact selected Race's definitions are read. Cloning copies mode and requirements into independent rows with new database identities. Parent/Variant edits do not share storage or merge access groups.

## Creature / NPC semantics

`creatureFormAccessContext()` consumes only the Normal Creature definition/snapshot:

- **Skill possession:** presence of the saved Normal Skill link. Native textual rank is never converted to Character points. Creature authoring accepts Possessed / Not possessed; numeric Skill operators reject at both service and database boundaries. Use Manual when the native rule cannot be evaluated deterministically.
- **Attributes:** the existing `resolveEffectiveCreatureStatistics()` output, including the Normal Creature's Size multiplier. Shared six-Attribute identities map to the existing native long names. Form Size/Attribute overrides are excluded.
- **Creature Abilities:** stable Normal `canonicalId`, never a display-name match. The save transaction validates against the final exact owner's Normal abilities, rejects foreign/Form-only/missing references, and remaps temporary IDs to system-assigned IDs. Removing a still-referenced Normal Ability rolls back. Removing its prerequisite and the Ability together is valid.
- **Portable identity boundary:** native Ability prerequisites are validated canonical IDs rather than a second mutable Ability object or an NPC lookup into the library. They have no independent library lifecycle root. Authoring validation protects removal; root Creature deletion cascades its Forms. Direct SQL edits to native abilities bypass this service guarantee, as with other service-validated portable metadata.
- **Derived Creatures:** cloning uses the existing Normal Ability copy mapping to remap prerequisites to the child's new canonical IDs. Requirement rows, modes and Form identities are independent. The mapping uses saved IDs, not names or ordering.

New NPC construction already deep-copies complete Form metadata into baseline/current snapshots; Access now travels through that same path. Existing NPC evaluation reads saved Normal current-snapshot facts plus its frozen Form requirements. It performs no current-library lookup. Subsequent library Skill/Ability/Access changes cannot change that NPC's eligibility.

The NPC workspace retains a saved Normal snapshot for eligibility, refreshing it after a successful save/refresh. Unsaved mechanical edits and preview projections cannot satisfy prerequisites. Existing server save protection restores frozen Form metadata from the locked current snapshot, including Access; forged payloads and unrelated individual saves cannot replace it. Older snapshots without Access remain valid, effectively Unrestricted, and retain their old shape on save.

## Authoring and viewers

Both Form editors use one `FormAccessEditor`, separate from Transformation. It offers mode selection, AND requirements, OR alternatives, owner-appropriate types, comparisons, reference search, Manual text and visible validation. Skill choices show classification and ID; native Ability choices show canonical identity. Active library search is server-authorized for G.O.D./admin users. Retained archived references remain visible even when absent from new-assignment search results. Identity keys reuse the existing HTTP-compatible Web Crypto helper. Existing semantic theme styles and GuidedField help are reused.

The help states:

> Access determines whether this entity is capable of using the Form. Transformation rules determine when and how an accessible Form may be entered.

Both viewers label every exact-owner Form with Available, Locked or Manual Review. Normal is still the default, and refresh/reopen resets selection. All Forms remain selectable. A shared Access summary shows group results, missing prerequisites and required G.O.D. rulings. Locked preview explicitly warns that viewing does not grant access or change runtime state.

Selection remains component-local with no mutation callback or runtime action. It does not alter Attributes, grants, readiness, budgets, ownership, equipment, Initiative, resources, health, baseline/current snapshots or combat state. Transformation authoring and all previous preview mechanics remain intact.

## Lifecycle and reference safety

Lifecycle previews report Race Form Access Skill prerequisites, Creature Form Access Skill prerequisites and Race Form Access Derived Ability prerequisites as deletion blockers. Their restrictive FKs also block raw library deletion. Archived references already present on that Form may be retained; newly assigning them rejects. Cloning an existing definition retains its already-used archived references, consistent with existing Form mechanics policy. Reference validation takes shared row locks during save to coordinate with archival/deletion.

Form deletion cascades its requirements. Eligible Race/Creature root deletion uses the existing lifecycle path and cascading ownership FKs. Character/Campaign deletion has no additional Form Access children: these definitions belong to library Forms, while NPC copies remain inside the already-owned snapshot.

## Validation record

All required checks passed:

- **44/44 Race database tests:** 10 Natural Attack, 10 Forms, 11 mechanics and 13 preview/Access cases. Includes zero-minimum Granted access and real resolved Derived possession even when live availability is false.
- **20/20 Creature database tests:** the 12 existing Pass 4B cases plus eight Access persistence, ownership, clone, archive/lifecycle and frozen-NPC cases.
- **Migration preservation:** 0076 retains every existing row across **177 public tables**, with only the two expected Unrestricted default columns added. Both old Form owners are populated before migration; baseline/current NPC JSON is unchanged. Existing 0075 preservation coverage remains intact.
- **Full Race browser workflow:** passed at **1440px and 390px**. Includes all existing Race authoring, natural attacks, Forms, mechanics, transformation, Character preview and guidance checks; new Access reference classification, AND/OR authoring, save/reload, all three statuses and locked self-unlock prevention. All **35 exact-Race Forms** remain selectable; default/reset, readiness, health and unrelated-save checks pass.
- **Full Creature browser workflow:** passed at **1365px and 390px**. Includes existing native authoring, effects/magic, interaction rules, NPC construction/editing and encounter snapshot checks; new Access author/save/reload and every eligibility status across **18 exact snapshot Forms**. Both workflows record zero mutation requests during preview, compare persisted runtime rows, preserve active damage of 7 and report zero browser JavaScript errors. Desktop/phone screenshots were inspected.
- **116/116 incoming-effect, Pass 5 runtime and Pass 6 gameplay database tests:** passed.
- **Existing lifecycle database suites:** lifecycle service, protected Skill framework references and tabletop lifecycle all passed through the disposable containment harness with the new schema.
- **498/498 domain/component tests:** Race, Creature, Character creation/sheets/printing, attack, mechanical effects, lifecycle, Derived Abilities and Forms. Includes **18 focused pure Form Access tests**. The existing Derived Ability static-render test imports CSS that direct Node cannot load; the final run used an ignored, test-only CSS module import stub. Its 13 tests also passed separately. No product stylesheet or existing assertion was removed; real browser workflows and production compilation validate the interfaces.
- `npm.cmd run typecheck`: passed.
- Changed-file ESLint with `--max-warnings 0`: passed.
- `node node_modules/drizzle-kit/bin.cjs check`: passed.
- `npm.cmd run build`: passed, including production TypeScript and route generation.
- `git diff --check` and the staged equivalent: passed.

Disposable logs and browser screenshots are under ignored `artifacts/race-authoring/pass4c-*`, `artifacts/creature-authoring/pass4c-*` and the existing Form browser screenshot paths. All database tests use temporary local PostgreSQL clusters and clean them up. No persistent database migration or production deployment was performed.

Focused coverage includes migration defaults/preservation; purchased/racial/zero-minimum Special Ability possession; all numeric operators; Normal Attribute checks; Derived possession versus live availability; Manual/AND/OR precedence; strict malformed/owner checks; native Skill/Attribute/Ability prerequisites; temporary/copy canonical ID mapping; independent clones; archived reference safety; lifecycle/FK blocking; requirement cleanup; old/new frozen snapshots; post-construction library edits; forged/unrelated saves; preview mutation checks and unchanged active damage.

Browser coverage includes author/save/reload, visible classification, AND/OR groups, every eligibility status, selectable Locked previews and explanations, all exact-owner Forms, default/reset behavior, no mutation requests, unchanged database snapshots/readiness, and desktop/390px layout. Existing Pass 1–4B authoring, mechanics, transformation and native NPC/runtime checks remain in the full harnesses.

## Files changed

All changes are limited to Pass 4C architecture, authoring, read-only display, migration, validation and this handoff.

- `docs/architecture/form-access-pass-four-c.md`
- `drizzle.config.ts`
- `drizzle/0076_form_access.sql`
- `drizzle/meta/0076_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/creature-authoring-disposable.test.ts`
- `scripts/creature-forms-browser-checks.ts`
- `scripts/creature-forms-db.test.mjs`
- `scripts/form-access-fixture.ts`
- `scripts/race-authoring-disposable.test.ts`
- `scripts/race-form-preview-browser.ts`
- `scripts/race-form-preview-db.test.mjs`
- `src/app/characters/character-form-preview.tsx`
- `src/app/heavens/creatures/actions.ts`
- `src/app/heavens/creatures/creature-forms-editor.tsx`
- `src/app/heavens/form-access-actions.ts`
- `src/app/heavens/npcs/[npcId]/creature-form-preview.tsx`
- `src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx`
- `src/app/heavens/races/race-forms-editor.tsx`
- `src/components/forms/form-access-editor.tsx`
- `src/components/forms/form-access-summary.tsx`
- `src/db/creature-schema.ts`
- `src/db/form-access-schema.ts`
- `src/db/race-schema.ts`
- `src/features/characters/firearm-baseline-migration.test.ts`
- `src/features/creatures/creature-form-service.ts`
- `src/features/creatures/creature-forms.ts`
- `src/features/derived-abilities/derived-ability-domain.ts`
- `src/features/derived-abilities/derived-ability-rules.ts`
- `src/features/forms/form-access-context.ts`
- `src/features/forms/form-access-service.ts`
- `src/features/forms/form-access.test.ts`
- `src/features/forms/form-access.ts`
- `src/features/lifecycle/lifecycle-service.ts`
- `src/features/races/race-form-service.ts`
- `src/features/races/race-forms.ts`
- `src/features/requirements/requirement-primitives.ts`

## Remaining boundaries

No unresolved canon decision blocks this pass. Numeric Character Skill requirements deliberately use existing purchased Skill # semantics; Creature numeric ranks remain unsupported. Missing native Attribute data requires manual review. These choices are visible in authoring help and tested. Automatic use enforcement, active transformations and Evolutions are not implemented.

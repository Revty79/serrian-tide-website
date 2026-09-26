# Race Improvements Pass 4A — Transformation authoring and Character Form Preview

Pass 4A extends the Race Forms foundation at `3d7bcde96fdf386e61ed3d6d7b77f2201ebf5a91`. It does not implement active transformations or Creature Forms (Pass 4B).

## Transformation definitions

Each Form owns an optional, versioned `RaceFormTransformation` in `race_forms.transformation_json`. Migration `0074_race_form_transformation.sql` adds only that nullable JSON column and its object/version constraint. It contains no backfill, name inference, Character fields, or runtime tables. Existing Forms retain their identities and mechanics and read with `transformation: null`. The agent applied this migration only to disposable databases. A later read-only inspection confirmed that local `serrian_tide_dev` already had migrations 0071?0074 applied, with matching SQL hashes and a validated transformation constraint; the agent made no changes to that database. No production deployment is part of this pass.

The collapsible Transformation editor uses shared `GuidedField` help and semantic theme colors. Its fields are:

- Entry: voluntary, involuntary, either, custom/G.O.D., or unspecified, with notes.
- Independent entry and exit timing: positive Initiative, elapsed-time description, explicitly instant, custom ruling, or unspecified. Initiative timing can also describe non-combat time. Switching away from Initiative clears that cost. Instant is explicit rather than inferred from zero.
- Independent entry and exit costs: unspecified, explicitly no resource cost, or authored costs. Rows reuse `DerivedAbilityCostDefinition` and its normalizer. Health means HP; named resources support Quintessence without introducing a new resource engine. Initiative is authored only in timing, avoiding duplicate costs. Amounts must be positive; no-cost uses no rows.
- Separate entry requirements and involuntary triggers: shared `DerivedAbilityUseConditionDefinition`, shared fact selector, comparison vocabulary, and validation. Numeric thresholds and typed Equipment/Event/State facts remain structured. Manual conditions require descriptions and cover moon phases, environment, concentration, ability requirements, and narrative rulings. Notes describe combinations/alternatives; this pass does not infer a trigger evaluation policy or evaluate any condition.
- Duration: until voluntarily ended, fixed, condition end, scene, encounter, persistent, or custom. Fixed/condition/custom durations require an explanation. There is no timer.
- Exit: multiple authored reasons can coexist (voluntary, duration, condition, resource depletion, action, custom), with notes explaining their relationship.
- Limits: unspecified, unlimited, authored limits, or custom. Structured limits reuse `DerivedAbilityUseLimitDefinition` and existing maximum-use/refresh vocabulary. Counts must be positive integers. Cooldown/custom-limit text is descriptive. No counters, refreshes, or cooldowns execute.
- Equipment entry/exit notes supplement the existing Pass 3 equipment intent. They do not introduce another equipment behavior field.

Choosing no costs/unlimited clears the corresponding authoring rows visibly; inconsistent hidden rows are rejected by the server. Clearing the entire definition stores null. Older callers that omit transformation data preserve the saved definition. All saves retain existing Race authorization and transaction ownership. Variant cloning copies JSON and mechanical children under new Form IDs; later edits and deletion remain independent. Deleting a Form removes its transformation with that row.

## Character read and display boundary

The authorized Character Race read adds an optional `formPreview` catalog containing exact-Race Forms plus the Race's Natural Attacks, Natural Protection, and Interaction Rules needed for inheritance. Races with zero Forms retain the previous read shape. The reader filters by the exact Race ID and never traverses parent, sibling, or child variants.

`resolveCharacterFormPreview` is a pure display projection. It accepts the normal Character draft, selected Race, selected Form ID, Skill catalog, and Attribute reference catalog. It checks the draft's selected Race ID and the Form's owner. Normal, stale, missing, and foreign selections return null. It neither imports server operations nor produces an authoritative `CharacterDraft`. The result is independently copied so consumers cannot mutate the saved catalog through a returned object.

The Character editor mounts a separate read-only viewer keyed by Character and Race. It accepts no mutation callbacks. Selection uses local React state, defaults to Normal, and resets when the sheet or selected Race changes. Every exact-Race Form is offered, without pagination or an arbitrary limit. There are no active/current Form fields anywhere in Character storage. The viewer is offered to normal race-based Characters, not NPC runtime or Creature authoring.

When a Form is selected, the panel says **“Form Preview — viewing this Form does not change the Character's current runtime state.”** It displays the complete preview above the normal editor/live panels. The ordinary panels continue to use the original draft and runtime records. Editing, save payloads, creation budgets/readiness/caps, live actions, and the print center never consume the preview. CSS also excludes the viewer from browser printing. Printable sheets retain Normal Character data.

## Mechanical display semantics

- **Attributes:** normal scores plus the six authored signed deltas, without Race-cap clamping. Modifier, roll target, and DEX Base Initiative reuse existing Character rules. Existing Attribute reference lookups also display carry/lift and other recorded canon values; unavailable scores remain explicitly unrecorded. There is no new Attribute engine.
- **Anatomy/HP:** Form override or Race anatomy (including the normal humanoid default), resolved through `resolveRaceHealthAnatomy` with preview CON and the Character's existing HP multiplier steps. The display shows maximums and hit-location/pool identities. Saved damage, injuries, and Active Health stay unchanged. Different anatomy is explicitly called out; damage redistribution is not defined here.
- **Movement:** Form override or Race modes, with existing permanent movement steps and the existing DEX movement-Initiative calculation. An empty override means no modes.
- **Protection:** effective authored Soak and location coverage. No incoming-effect or protection resolver receives these values.
- **Natural Attacks:** effective authored name, damage/type, Initiative, mode, reach/range, Skill, magical qualifier, and notes. No attack buttons or combat execution.
- **Skills/Abilities:** learned allocations remain. A display-only Race projection adds Form predispositions to existing racial grants before calling the existing rank/target helpers, preserving parent-path math. Unlearned Tier 1 predispositions can have temporary display rows; no allocations are stored. Form-only Special Abilities show their catalog definitions without inventing execution. Rows identify Form additions.
- **Interaction Rules:** Race uses the Race collection; Add concatenates Race and Form rules; Replace uses only Form rules. The display includes match scope, conditions, percentage, and notes. There is no runtime matching.
- **Physical capabilities:** effective Size (without Creature scaling), manipulation, speech, equipment intent, notes, and restrictions. Existing equipment controls and ownership remain operational and unchanged.
- **Transformation:** all authored entry/exit, timing, cost, requirement/trigger, duration, limit/cooldown, equipment, and general notes appear as information.

## Validation

- 405 distinct domain/Character tests passed: 240 Race, Creature, attack, mechanical-effect, and lifecycle tests, plus 165 Character tests. The latter includes all eight preview resolver cases, creation, advancement, Attribute references, health, Skills, printing/paper sheets, equipment/ammunition, and baseline migration checks. `npm.cmd run validate:character` also passed its 37 focused tests.
- Full `scripts/race-authoring-disposable.test.ts` passed: all 75 migrations; preservation snapshots of every public table at migration 0074; 31 existing Race Pass 1?3 database cases; six new transformation/preview database cases; existing Race browser checks; new real-browser authoring/preview checks; and 116 incoming-effect/runtime integration cases.
- Transformation persistence covers all four entry methods, all duration and exit categories, independent entry/exit timing, costs, typed/manual conditions, triggers, use limits, cooldown, omitted-field preservation, null defaults, independent variant edits, and Form deletion.
- Browser coverage includes 35 exact-Race Forms, Normal/reset/reopen, independent positive/negative previews, zero non-GET selection requests, unchanged creation status, unchanged database snapshots, an actual damaged-health record, an equipped inventory stack, and a real Story save while previewing. Domain coverage also checks a 250-Form list and rejected foreign/stale selections.
- Full `scripts/creature-authoring-disposable.test.ts` passed: legacy migration preservation, existing Creature editor authoring, NPC construction/editing, direct encounter snapshots, shared condition/cost authoring, archive/restore, and phone layouts. No Creature production files changed.
- Chrome headless browser checks and screenshots passed at 1440px and 390px; no horizontal overflow or browser JavaScript errors. The Attribute screenshots were visually inspected. These are automated checks, not human tabletop acceptance or Firefox/Safari coverage.
- Typecheck and changed-file ESLint (`--max-warnings 0`) passed. Drizzle metadata check passed. The production build passed, including TypeScript and all 27 static pages. `git diff --check` and `git diff --cached --check` both passed.

Logs and screenshots are local ignored artifacts under `artifacts/race-authoring/pass4a-*`, `transformation-*.png`, `character-form-preview-*.png`, and `character-form-attributes-*.png`.

The pre-existing baseline migration test still listed only migrations through 0070. Its expected forward list now includes 0071?0074, and it verifies every journal index/tag against the SQL files. No firearm mechanics changed.

The browser regression selects Forms, compares database snapshots and outgoing non-GET requests, switches independent Forms and Normal, saves a Story edit while previewing, and checks reload/reopen reset. Fixtures include saved damage and an equipped inventory stack. Disposable database tests also compare creation readiness, print output, Character Attributes, Skills, inventory, equipment, and health across previews and unrelated saves.

The Pass 3 isolation regression now permits the deliberately added read-only `formPreview` catalog while continuing to compare every normal Character field and stored row unchanged.

## Remaining runtime decisions

No new tabletop ruling is silently settled. A later runtime pass must decide execution authorization, resource spending, timing, condition combinations/triggers, active duration/refresh lifecycle, damage mapping between bodies, and actual equipment transformation. Preview does not resolve these questions or create stored state for them. Pass 4B remains unstarted.

## Exact file manifest

28 files changed:

- `docs/architecture/race-transformation-preview-pass-four-a.md`
- `drizzle/0074_race_form_transformation.sql`
- `drizzle/meta/0074_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/race-authoring-browser.ts`
- `scripts/race-authoring-disposable.test.ts`
- `scripts/race-form-mechanics-db.test.mjs`
- `scripts/race-form-preview-browser.ts`
- `scripts/race-form-preview-db.test.mjs`
- `scripts/race-form-transformation-fixture.ts`
- `src/app/characters/actions.ts`
- `src/app/characters/character-editor.tsx`
- `src/app/characters/character-form-preview.module.css`
- `src/app/characters/character-form-preview.tsx`
- `src/app/heavens/races/race-form-transformation-editor.tsx`
- `src/app/heavens/races/race-forms-editor.module.css`
- `src/app/heavens/races/race-forms-editor.tsx`
- `src/db/race-schema.ts`
- `src/features/characters/character-form-preview.test.ts`
- `src/features/characters/character-form-preview.ts`
- `src/features/characters/firearm-baseline-migration.test.ts`
- `src/features/characters/models.ts`
- `src/features/guidance/page-help.ts`
- `src/features/races/race-form-preview-service.ts`
- `src/features/races/race-form-service.ts`
- `src/features/races/race-form-transformation.test.ts`
- `src/features/races/race-form-transformation.ts`
- `src/features/races/race-forms.ts`

# Race improvements Pass 2: universal Forms

Implemented against Pass 1 commit `f32095986f8968b4441f9c11dbd7369476e64549`.

## Scope and structure

Any exact Race record can own zero, one or many independent Forms. The Race itself remains the normal state. Forms are alternate-state authoring definitions, separate from Race Variants and future Evolutions. There is no inferred Normal Form, ancestry between Forms, Race-family restriction or fixed Form count.

Migration `0072_race_forms.sql` adds one table, `race_forms`:

| Column | Purpose |
| --- | --- |
| `id` | Serial primary key, suitable for later mechanical child definitions |
| `race_id` | Required exact owner; FK to `races.id` with delete cascade |
| `key` | Nonblank stable Race-local identity, unique with `race_id` |
| `name` | Required nonblank Form Name |
| `description` | Authoring text, defaults to empty |
| `notes` | Additional authoring text, defaults to empty |
| `sort_order` | Nonnegative order derived from the submitted list |

The migration creates zero Forms. No existing tables, rows, Anatomy, Natural Attacks or Creature data are changed. It was applied only to disposable test databases; no persistent database migration or deployment was performed.

## Save and read behavior

`race-forms.ts` holds the small authoring type and shared validation. Text is trimmed, names and keys must be nonblank, keys cannot repeat within a Race, and array order determines `sortOrder`. There is no fixed collection maximum. Form names may repeat; keys establish identity.

`race-form-service.ts` reads Forms for one exact Race in order, including persisted `id` and `raceId`. Its server-only transaction helper requires callers to authorize access. It does not read a parent Race's Forms or infer inheritance. This is a reusable read boundary for later Character-facing work; no Character consumer was added.

The existing authorized Race save locks its root and saves Forms in the same transaction. Upserts use `(race_id, key)`, retaining database IDs for edits and reorderings. Only absent keys are deleted, so removing one Form does not recreate others. Client-supplied database IDs/owners are not accepted as mutation authority. Invalid Forms roll back the entire Race save, including a newly inserted Race. Older callers that omit `forms` preserve saved definitions; an explicit empty array removes them.

## Authoring UI

The Race workspace has a dedicated Forms tab with Add Form, Form Name, Form Description, Form Notes, Remove Form, Move Up and Move Down. Changes use the existing draft/save/discard and archived/read-only controls. The tab explains that the Race is the normal state and that runtime transformation is not implemented. It exposes no empty mechanical override controls.

Shared GuidedField help and semantic theme variables provide the existing appearance/accessibility behavior. Validation is visible and repeated on the server. Temporary keys use `crypto.getRandomValues`, compatible with plain HTTP authoring. Reordering never replaces those keys.

## Variants and lifecycle

Clone as Variant copies each saved Form to the new Race with a fresh database ID while preserving its Race-local key, name, description, notes and order. The existing root lock makes the copy consistent with Race saves. Edits/removals/reordering on either Race are independent afterward. Natural Attacks and other owned Race definitions continue to use their existing cloning paths.

Forms appear as nonblocking owned definitions in Race lifecycle previews. Archive/restore preserve their rows exactly. Eligible permanent Race deletion uses the ownership FK cascade. Forms have no independent archive state, and existing Race lifecycle restrictions remain in force.

## Validation

| Check | Result |
| --- | --- |
| Race, Creature, attack, mechanical-effect and lifecycle unit suites | 229 passed, including 4 new Forms tests |
| New disposable Forms server-action/database cases | 10 passed |
| Pass 1 Natural Attack disposable database cases | 10 passed |
| Full existing Race authoring, variants, lifecycle, Anatomy and browser suite | Passed |
| Existing incoming-effect, Pass 5 runtime and Pass 6 gameplay database suites | 116 passed |
| Existing Character Creation, Attribute and print unit suite | 37 passed |
| Desktop/mobile Forms browser | Passed at 1440/390px; screenshots inspected |
| Existing Creature migration/authoring/browser/NPC snapshot suite | Passed; no browser JavaScript errors |
| TypeScript | Passed |
| Changed-file ESLint with zero warnings | Passed |
| Drizzle check and snapshot preservation | Passed |
| Production build | Passed |
| Final `git diff --check` | Passed; new files checked as well |

The new database cases exercise existing/new zero-Form Races, a Human with one Form, 20 Forms with exact reload and ID-preserving reorder, edits/removal, older callers, invalid/duplicate keys, blank names, transaction rollback, database constraints, fresh variant IDs, independence in both directions, Race-local ownership, Natural Attack/Anatomy preservation, and authorized lifecycle behavior. The browser workflow adds 20 Forms, saves/reloads, edits, removes, reorders, clones and independently edits a variant. It also checks help/Escape behavior, unchanged drafts when opening help, plain-HTTP-compatible keys and horizontal overflow.

The migration harness pauses at 0071, seeds an existing Natural Attack, and compares complete existing Race/variant, Natural Attack, Anatomy, protection, caps, movement, Skill, Interaction Rule and Creature records before/after 0072. They remain identical; `race_forms` is empty. The 0072 snapshot chains to 0071 and changes only the added table.

Commands:

- `node --import tsx --test --test-reporter=tap` with all `*.test.ts` files under `src/features/{races,creatures,attacks,mechanical-effects,lifecycle}`.
- `node --import tsx --test scripts/race-authoring-disposable.test.ts` (set `RACE_FORMS_ONLY=1` for migration plus Natural Attack/Forms database cases).
- `node --import tsx --test scripts/creature-authoring-disposable.test.ts`.
- `npm.cmd run validate:character`.
- `npm.cmd run typecheck`; changed-file `npx.cmd eslint ... --max-warnings 0`; `npm.cmd run build`.
- `node node_modules/drizzle-kit/bin.cjs check`; compare 0071/0072 snapshots; `git diff --check`.

Logs and screenshots are local ignored artifacts under `artifacts/race-authoring/forms-*`. Browser verification used automated Chrome, not human gameplay acceptance or production deployment.

## Future boundary

No unresolved decision blocks this pass. Form mechanics, active Character state, transformation rules, Character Sheet display, NPC transformations, Creature Forms and Evolutions remain unimplemented. Pass 3 can add columns or children using the stable Form primary key without replacing this relationship. Do not begin Pass 3 as part of this change.

## Exact file manifest

- `docs/architecture/race-forms-pass-two.md`
- `drizzle/0072_race_forms.sql`
- `drizzle/meta/0072_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/race-authoring-browser.ts`
- `scripts/race-authoring-disposable.test.ts`
- `scripts/race-forms-browser.ts`
- `scripts/race-forms-db.test.mjs`
- `src/app/heavens/races/actions.ts`
- `src/app/heavens/races/race-forms-editor.module.css`
- `src/app/heavens/races/race-forms-editor.tsx`
- `src/app/heavens/races/race-workspace.tsx`
- `src/db/race-schema.ts`
- `src/features/guidance/page-help.ts`
- `src/features/lifecycle/lifecycle-service.ts`
- `src/features/races/race-form-service.ts`
- `src/features/races/race-forms.test.ts`
- `src/features/races/race-forms.ts`
- `src/features/races/race-variant-service.ts`

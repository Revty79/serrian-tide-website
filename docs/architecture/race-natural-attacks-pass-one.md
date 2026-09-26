# Race Improvements — Pass 1: Natural Attack authoring

Implemented against `8b6d4c78a4242b19630b0b0a5e062c71b010c69e`. This pass adds Race-owned authoring and storage. It does not add Forms, transformations, Character attack execution, sheet/tabletop attack buttons, or new Creature combat behavior.

## Storage and migration

`0071_race_natural_attacks.sql` adds one table, `race_natural_attacks`:

- Database identity and Race owner, plus a stable key unique within that Race.
- Name, Damage expression, Damage Type, Notes and explicit display order.
- Versioned shared attack-authoring JSON: Initiative, mode, structured reach/range, tri-state magical qualifier, ordered shared mechanical on-hit effects, and optional Spell Construction.
- Nullable `skill_id` referencing the existing Skill library, with descriptive basis notes.
- Structured Anatomy requirements: HP-pool canonical IDs, numbered hit locations, and notes for specific features/function.

Race ownership cascades on eligible root deletion. The Skill foreign key restricts deletion; lifecycle previews explain that dependency. Attacks have no independent archive state. Existing Races begin with zero attacks, and the migration neither seeds nor infers attacks from names, Anatomy or Base Magic.

The generated 0070→0071 snapshot chain was checked. Every existing table is identical in the two snapshots; only `race_natural_attacks` is added. All 72 migrations were tested in disposable PostgreSQL. No persistent database migration or deployment was performed.

## Shared attack infrastructure

`features/attacks/attack-authoring.ts` owns the shared description and mechanics types, empty defaults and normalization. Creature authoring retains its existing public names through aliases. Fixed Creature Attack %, CR, legacy Creature fields, and Creature execution stay outside the shared mechanics and outside the Race definition.

`features/mechanical-effects/effect-definitions.ts` extracts the existing ordered, keyed mechanical-effect normalization; `creature-effects.ts` preserves its former API. The same mechanical-effect codec, structured weapon-range validator and Spell Document parser continue to validate both owners. Damage remains an authored expression; no new damage language or calculation is introduced.

`app/heavens/attack-authoring-fields.tsx` shares conditional reach/range controls and the Magic Construction editor. Race on-hit authoring uses the existing configurable effects editor. Creature's existing fixed-percent field, costs, magic semantics and effect storage contract are preserved.

## Race authoring

The Race workspace has a **Natural Attacks** tab. Authors can add, edit, remove and reorder independent entries, with a summary of each attack's Damage, Initiative and Skill. Fields follow the shared theme and `GuidedField` pattern; invalid data remains visible and the server rejects invalid saves atomically.

Melee exposes Reach; ranged and AoE expose distance bands; hybrid exposes both. Positive fractional Initiative is accepted, while blank remains unresolved. Magical Yes/No/Unspecified is independent of Race Base Magic; an attached Magic Construction retains the established magical-source semantics. Notes can describe an area or an unresolved ruling.

New draft keys use `crypto.getRandomValues()`, including on plain HTTP LAN hosts where `randomUUID` is unavailable. The browser suite checks actual authoring at 1440px and 390px, including open help and no horizontal overflow.

## Skill and Anatomy references

The optional Skill selection references an active existing Skill at any tier. It is an intended attack basis, not a Race Skill grant; existing Race grant eligibility and Skill ownership are unchanged. Blank is explicitly Unspecified. Basis notes can document a Skill/Attribute relationship without inventing its future resolution. Existing archived Skill references can be retained and cloned, but cannot be newly assigned to another attack.

Anatomy selections reference the Race's existing HP-pool canonical IDs and hit-location numbers. A Race with no custom Anatomy uses its existing standard humanoid definitions. Pool renames preserve identity. Notes express details such as a functional jaw, horns, or tail. Removing referenced Anatomy is rejected until its attacks are updated; this also applies when an older caller omits the new attack list. No Form state or runtime availability evaluation is introduced.

## Save, variants and lifecycle

Race saves authorize and lock the existing Race root, then validate/persist the owned attacks in the same transaction. Upserts retain surviving row identities; removed entries are deleted. Older callers that omit `naturalAttacks` retain the saved definitions instead of clearing them.

Clone as Variant takes the existing parent lock and copies every saved attack into the new Race with a fresh database ID and identical authored values. Keys are scoped to their owner. JSON values and rows are independent; changing/removing an attack in either Race does not mutate the other.

Archiving/restoring a Race preserves its attack rows exactly. Eligible permanent Race deletion cascades its owned attacks. Parent/variant deletion restrictions, author permissions, and other Race-owned content keep their existing behavior.

## Validation

| Check | Result |
| --- | --- |
| Race, Creature and mechanical-effect unit suites | 170 passed, including 8 new focused Natural Attack tests |
| Lifecycle unit suite | 55 passed |
| Natural Attack disposable server-action cases | 10 passed |
| Existing Race authoring/variant/lifecycle/browser suite | Passed |
| Existing incoming-effect, Pass 5 runtime and Pass 6 gameplay database suites | 116 passed through the existing Race harness |
| Existing Creature migration/authoring/browser/NPC snapshot suite | Passed; no browser JavaScript errors |
| Desktop/mobile Natural Attack browser workflow | Add/edit/remove/reorder, conditional range, validation, Skill/anatomy/on-hit persistence, independent variant edits, HTTP-safe draft keys, help and 1440/390px layout passed |
| TypeScript and changed-file ESLint with zero warnings | Passed |
| Drizzle check, snapshot preservation and `git diff --check` | Passed |
| Production build | Passed |

New disposable cases prove zero/one/multiple attacks; ordering; melee/ranged/hybrid/AoE; explicit magical values; Skill/Anatomy references; on-hit and Magic Construction persistence using the existing canonical document normalization; invalid-save rollback; identity-preserving edits/removals; older callers; Anatomy rename/removal handling; variant independence; archived Skill retention; permissions; and Race lifecycle cleanup.

Migration tests compare existing Race/variant rows, Anatomy, caps, movement, Skill links, Natural Protection, Skills, Creatures and Creature attacks before/after 0071. They remain identical, and no Natural Attacks are created. Existing Race authoring tests also retain lore, Quirk, Interaction Rules, movement, caps, Skills/Abilities, Anatomy and Natural Protection.

The Creature harness initially had a stale pre-Anatomy migration assertion: it compared a pre-0066 Race row against the later schema without excluding the newly added `anatomy_json: null`. The test now checks that additive field's null default explicitly while continuing to compare all prior values. No product change was needed for that failure.

Commands:

- `node --import tsx --test --test-reporter=tap` with all `*.test.ts` files under `src/features/{races,creatures,attacks,mechanical-effects}`; separately, all lifecycle unit files.
- `node --import tsx --test scripts/race-authoring-disposable.test.ts` (set `RACE_NATURAL_ATTACKS_ONLY=1` for the migration and focused server-action cases).
- `node --import tsx --test scripts/creature-authoring-disposable.test.ts`.
- `npm.cmd run typecheck`; changed-file `npx.cmd eslint ... --max-warnings 0`; `npm.cmd run build`.
- `node node_modules/drizzle-kit/bin.cjs check`; compare 0070/0071 snapshots; `git diff --check`.

Logs and browser images are local ignored artifacts under `artifacts/race-authoring/natural-attacks-*`. Chrome automated checks are engineering validation; no production environment or human gameplay acceptance was exercised.

## Remaining design boundary

Future work must decide how Character Skill/Attribute resolution consumes the authored basis, how functional anatomy and Forms affect availability, and how on-hit/construction effects execute. This pass intentionally preserves unresolved values and notes without inventing those rules. No decision is required to save the authoring provided here. Do not begin Pass 2 as part of this change.

## Exact file manifest

- `docs/architecture/race-natural-attacks-pass-one.md`
- `drizzle/0071_race_natural_attacks.sql`
- `drizzle/meta/0071_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/creature-authoring-disposable.test.ts`
- `scripts/race-authoring-browser.ts`
- `scripts/race-authoring-disposable.test.ts`
- `scripts/race-natural-attacks-browser.ts`
- `scripts/race-natural-attacks-db.test.mjs`
- `src/app/heavens/attack-authoring-fields.tsx`
- `src/app/heavens/creatures/actions.ts`
- `src/app/heavens/creatures/creature-authoring-editor.tsx`
- `src/app/heavens/races/actions.ts`
- `src/app/heavens/races/race-natural-attacks-editor.module.css`
- `src/app/heavens/races/race-natural-attacks-editor.tsx`
- `src/app/heavens/races/race-workspace.tsx`
- `src/db/race-schema.ts`
- `src/features/attacks/attack-authoring.ts`
- `src/features/creatures/creature-authoring.ts`
- `src/features/creatures/creature-effects.ts`
- `src/features/guidance/page-help.ts`
- `src/features/lifecycle/lifecycle-service.ts`
- `src/features/mechanical-effects/effect-definitions.ts`
- `src/features/races/race-natural-attack-service.ts`
- `src/features/races/race-natural-attacks.test.ts`
- `src/features/races/race-natural-attacks.ts`
- `src/features/races/race-variant-service.ts`

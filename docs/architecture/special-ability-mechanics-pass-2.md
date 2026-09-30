# Special Ability Mechanics: Pass 2 implementation and completion report

September 30, 2026. Pass 2 is implemented for review; Pass 3 has not started.

This pass adds storage, validation, safe saves, reference protection and read-only resolution. It adds no full mechanics editor, gameplay execution or authored catalog mechanics. The [Pass 1 contract](special-ability-mechanics-pass-1.md) and [Production matrix](../reports/special-ability-mechanics-production-matrix-2026-09-30.md) remain design inputs. The matrix is a requirements inventory, **never a source for generated mechanics**. No ability IDs or names control behavior.

The later Pass 2 instruction supersedes Pass 1's progression recommendation: saved purchased points are a **provisional v1 resolution source**, not an approved universal interpretation of Special Ability progression.

## Storage, identity and exact v1 format

The existing Skill is the root. The existing `skill_extension` row is identified by `(skill_id, extension_type)`, with `extension_type = "special-ability-mechanics"` and `schema_version = 1`. No tables or columns were added.

These states remain distinct:

| State | Read result |
| --- | --- |
| No row | `absent`: legacy/definition-only |
| `{ "schemaVersion": 1, "rules": [] }` | `ready`, `empty: true`: intentionally structured, no rules yet |
| Valid authored v1 | `ready`, ordered rules |
| Invalid JSON, schema mismatch or invalid v1 shape | `invalid`, visible diagnostics |
| Matching row/document version newer than v1 | `unsupported`, visible diagnostic |

Every rule has `key`, `kind`, `title`, `description`, `when`, `limitations`, `notes`, and `references`. All fields are required; `limitations` and `notes` may be empty strings and `references` may be empty. V1 supports exactly:

| Rule kind | Additional fields | Meaning |
| --- | --- | --- |
| `capability` | `domain`: `sense`, `movement`, `breathing`, `communication`, or `other` | Descriptive intrinsic capability; domain is metadata |
| `manual` | Nonblank `adjudication` | First-class G.O.D. determination, never inferred execution |

Synthetic example only; this is not a rule for any catalog ability:

```json
{
  "schemaVersion": 1,
  "rules": [
    {
      "key": "synthetic-capability",
      "kind": "capability",
      "title": "Synthetic capability",
      "description": "An authored description for testing the format.",
      "domain": "other",
      "when": {
        "mode": "requirements",
        "groups": [
          {
            "key": "qualification",
            "conditions": [
              {
                "key": "self-threshold",
                "kind": "self-progression",
                "operator": "gte",
                "requiredValue": 7
              }
            ]
          }
        ]
      },
      "limitations": "Description only.",
      "notes": "Synthetic threshold using the provisional source.",
      "references": []
    }
  ]
}
```

Rules have unique local keys within their document. Group keys are unique within their rule; condition keys are unique across all groups of that rule, allowing a condition to move between groups without acquiring a new identity. Rule identity is owning Skill + extension family + rule key. Titles, names, array positions and serial extension IDs are not identities. Editors must preserve keys during rename, edit and reorder, and mint a key once when creating a new child. The codec validates uniqueness and preserves keys; a whole-document save cannot distinguish an intentional delete/add from an attempted key rename. No external child references are supported in v1.

The codec rejects unknown/missing properties, unknown discriminants, malformed JSON, version mismatches, invalid numeric operators/IDs, duplicate keys, blank required text, NaN/Infinity and arbitrary effect/formula payloads. It does not trim or normalize authored text or interpret prose as executable code.

Limits are 262,144 UTF-8 bytes per document, 100 rules, 20 groups per rule, 50 conditions per group, 50 documentation references per rule, 128 characters per key, 240 per title and 16,000 per text field. Numeric thresholds are finite, nonnegative and at most `Number.MAX_SAFE_INTEGER`; reference IDs are positive PostgreSQL integer IDs, at most 2,147,483,647. These are format bounds, not invented game caps.

## Conditions, progression and possession

`when` is either exactly `{ mode: "always" }`, or `requirements` containing a nonempty OR-list of nonempty AND-groups. Arbitrary nesting and empty requirements are rejected.

| Condition kind | Exact additional fields |
| --- | --- |
| `self-progression` | `operator`: `gte`, `gt`, `lte`, `lt`, `eq`, `neq`; `requiredValue`: number |
| `skill-possession` | `skillId`; `operator`: `possessed` or `not-possessed` |
| `derived-ability-possession` | `derivedAbilityId`; same possession operators |
| `manual` | Nonblank `notes` |

Every condition also has a stable `key`. Shared requirement primitives supply operators and three-valued evaluation:

| Combination | Result |
| --- | --- |
| AND with any failed condition | Unsatisfied, even if another is manual |
| AND with no failure but a manual condition | Manual |
| AND with all conditions satisfied | Satisfied |
| OR with any satisfied group | Satisfied, even if another is manual |
| OR with no satisfied group but a manual group | Manual |
| OR with all groups unsatisfied | Unsatisfied |

The owner must possess the owning Special Ability before any owner-specific conditions are evaluated. Unknown possession or definition-only context returns unavailable rules with no evaluated groups. A condition cannot manufacture possession of its owner.

The server uses saved Normal Character allocations and assigned Race Skill links. Positive purchased allocations or a Race link establish possession under existing semantics. A zero-point Race grant establishes possession without creating purchased points. No allocation, acquisition or advancement rule changes.

`resolveSpecialAbilityProgression` is the single dedicated adapter. It currently uses the existing `getCharacterSkillPointsById` helper: the maximum saved purchased allocation across paths, starting at zero. It excludes racial additions, Attributes, Rank, tier and temporary effects. Unknown saved facts produce `null`; a complete known allocation set with no matching purchase produces zero. Its result explicitly carries `source: "provisional-v1-saved-purchased-points"`, `provisional: true`, and a readable label. Documents contain only self thresholds, with no per-rule choice of progression source and no Character progression state.

Changing that source requires an explicit Brannan/Ember ruling, compatibility review of authored thresholds, tests and a deliberate semantic/version transition. Changing one adapter is technically possible; silently reinterpreting saved thresholds is not acceptable. Existing Form Access comparisons, Rank and Special Ability roll targets are unchanged.

## Explicit extension saves and stale-write protection

`getSkill` returns a coherent root, relationships, decoded extension views, and opaque `revision` from a repeatable-read, read-only transaction. Each extension independently reports `ready`, `invalid` or `unsupported`; one unreadable extension does not prevent loading the Skill.

`SkillDraft.extensions` is a loaded/editor view, **not a replacement list**. Only `extensionMutations` writes extensions:

```ts
// After loading the current saved Skill, preserve its revision.
const updated = changeSkillExtension(draft, {
  operation: "upsert",
  extensionType: "special-ability-mechanics",
  schemaVersion: 1,
  data: document,
});
await saveSkill(updated);

// Explicit detach; omitting a family never means removal.
const detached = changeSkillExtension(draft, {
  operation: "remove",
  extensionType: "special-ability-mechanics",
});
```

Upsert affects only its named family and preserves its row identity. Remove affects only its named family. Unmentioned rows retain their exact raw JSON bytes, schema versions, serial IDs and timestamps. Explicit generic-family writes are bounded finite JSON, with no execution path. Mutation lists reject duplicate families and malformed operation shapes.

The existing Spell Construction editor now emits these explicit intents for attach, edit and detach. Supported spell writes retain parsing, calculation snapshots, root-name synchronization when construction is edited, and framework reference locking. Core-only saves do not rewrite spell bytes or normalize older documents. Unknown/future documents show diagnostics in Skill Preview; unsupported/invalid spell documents do not mount editable construction controls. Explicit removal remains supported by the save API; a future-document removal UI is deferred.

Every existing-Skill save must supply its loaded revision. Under the graph lock and parent row write lock, the server recomputes a SHA-256 revision of the full stored root, relationship rows and complete raw extension rows, including identities and timestamps. Missing/stale revisions reject the whole transaction with a reload message. Simultaneous writers cannot overwrite each other's extension or core work. New Skills need no previous revision. This token is concurrency control, not authorization: existing role, creator/admin, archive, provenance and structural-change confirmation checks remain authoritative.

Classification uses the existing semantic predicate, including singular/plural Special Ability classification. Standard Skills cannot acquire mechanics. Changing away from Special Ability classification requires an explicit mechanics remove in the same operation. Validation failure rolls back the full save.

Future mechanics versions cannot be replaced by this v1 writer, even when their JSON is malformed or exceeds this reader's limits. Future Spell Construction versions likewise cannot be downgraded. Reads never write or upgrade. Safe core editing preserves all such rows; an authorized explicit remove is deliberate deletion. Invalid supported-v1 documents can be explicitly repaired with a valid v1 upsert.

## Typed references and lifecycle

V1 references are exactly `{ kind: "skill", skillId }` or `{ kind: "derived-ability", derivedAbilityId }`. Conditions and documentation references participate in the same integrity checks. They do not copy, grant or execute targets. Read projections resolve current labels on the server after authorization.

Saves validate exact existence and the shared-library G.O.D./admin read boundary; editing the owning Skill still requires its existing permission checks. New archived targets are rejected. Previously authored, valid exact references can remain after the target is archived; no name-based replacement is inferred. Missing targets are rejected on an explicit document save. Archived known targets retain diagnostic labels and can still supply known possession facts in read results.

Skill and Derived Ability authoring and lifecycle mutations first take transaction advisory lock `(1937006962, 2)`, before any parent/reference row locks. Reference validation locks Skill IDs in ascending order, then Derived IDs in ascending order, with shared row locks. Derived authoring joins this protocol so prerequisite FKs back to Skills cannot invert the lock order. This deliberately serializes catalog mutations in exchange for a simple safe graph boundary; reads do not take this lock.

Both target lifecycle dependency inventories scan mechanics rows, including archived owners. Valid references block permanent deletion. Invalid/unsupported mechanics documents conservatively block deletion of any potentially referenced Skill/Derived target because their dependency set cannot be proven. A deleting Skill's own mechanics row is excluded since it cascades with its owner. Archive/restore retain existing behavior. Deletion checks run again under the transaction lock, so previews are not the final authority.

No universal reference index was added. Integrity is service-level, not a database FK over JSON; raw SQL or a future writer bypassing this protocol is outside its protection. Any future writer must join the protocol. The broad deletion block for unreadable documents and catalog-write serialization are intentional v1 tradeoffs.

## Pure resolver and authorized projection

`resolveSpecialAbilityMechanics` has no database or runtime-service dependency. It consumes saved facts and resolved reference views, returns detached results, and does not mutate inputs. It returns source identity, document version/status, empty-document state, context, possession, provisional progression, rule identity/title/summary/authored data, evaluated groups and explanations, reference diagnostics, and `runtimeSupported: false`.

Rule statuses are `matched`, `not-matched`, `manual`, and `unavailable`; invalid or unsupported data is identified at document level. A matched Capability means its authored conditions match. It does not mean activated, executed, paid, applied or granted. Manual rules remain manual when their conditions qualify; a known failed requirement can still make them not matched. Missing facts or inaccessible/missing reference identities cannot satisfy a negative possession condition. Missing documentation references require manual review unless a known failed condition already rules the entry out. References never recursively resolve other mechanics documents.

`getSpecialAbilityMechanicsProjection(skillId, characterId?)` authenticates the session, loads roles on the server, and executes in a repeatable-read **read-only** database transaction. Catalog-only reads require G.O.D./admin. Character reads use existing Active State authorization. Players may inspect only possessed abilities in an authorized Character context; G.O.D./admin retain catalog access. Derived possession comes from the existing SELECT-only loader with `lock=false` and its authoritative resolver; no acquisition, use, recharge or passive-sync operation is called. The database independently forbids writes in this projection.

Native Creature NPCs require a later adapter rather than translating fixed Creature Rank into Character purchases. G.O.D./admin currently receive definition-only results for that context; other callers receive an explicit unsupported-context error. Active Form-granted temporary possession is also deferred. Preview, Character sheets, Form previews, print and tabletop can later consume the projection; these consumers are not all built here.

## One authoritative owner and future evolution

Only intrinsic Special Ability descriptions belong in this extension. Form access, anatomy, Attributes, movement, Natural Protection and Natural Attacks remain on Forms. Race, Creature, Item, spell, Evolution, Creature Ownership and existing Interaction Rule mechanics retain their owners. V1 supports no structured references to those systems and stores no duplicate Forms list, runtime balances or Character state.

To add a future family, deliberately define its authority and non-executing semantics, introduce its versioned typed shape/codec, add shared summaries/resolution and diagnostics, implement any new target's authorization/lifecycle protocol, and add preservation/regression tests. Keep old decoders available and migrate only through an explicit reviewed operation. Older writers must preserve newer rows. Unsupported concepts can already be authored as Manual/G.O.D. rules; no generic executable JSON, scripting language or placeholder effect fields are accepted.

Resource Rules, modifiers, interaction integration, overrides, activated/triggered effects, reactions, bindings, branches and actor links remain unimplemented. No Shift Reserve, Shift Forms conversion, breath weapon mechanics, Flight automation or catalog-specific behavior was added.

## Changed files

Paths below are relative to the repository root.

| Files | Responsibility |
| --- | --- |
| `src/features/special-abilities/models.ts`, `codec.ts` | Versioned discriminated format, limits and strict reads/writes |
| `src/features/special-abilities/progression.ts`, `references.ts`, `summaries.ts`, `resolution.ts` | Pure fact adapter, reference extraction and readable resolution |
| `src/features/special-abilities/reference-service.ts`, `read-service.ts` | Transactional integrity and authorized read-only projection |
| `src/features/special-abilities/mechanics.test.ts`, `extension-diagnostics.test.ts` | Domain/truth-table tests and rendered diagnostics |
| `src/features/skills/skill-extension-draft.ts`, `skill-extension-persistence.ts` | Explicit mutation API, preservation, revision checks |
| `src/app/heavens/skills/actions.ts` | Coherent reads and safe transactional saves |
| `src/app/heavens/skills/skill-construction-editor.tsx`, `skill-preview.tsx` | Existing spell editor integration and visible diagnostics |
| `src/features/characters/character-rules.ts` | Narrowed classification predicate parameter type only; unchanged behavior |
| `src/features/lifecycle/lifecycle-service.ts`, `src/app/heavens/derived-abilities/actions.ts` | Dependency checks and shared lock ordering |
| `src/features/skills/skill-framework-reference-service.test.ts` | Existing framework test follows delegated persistence boundary |
| `scripts/special-ability-foundation-disposable.test.ts`, `special-ability-foundation-db.test.mjs` | Guarded temporary PostgreSQL integration harness and scenarios |
| This document and `docs/architecture/special-ability-mechanics-pass-1.md` | Completion contract and superseding progression note |

The pre-existing Pass 1 architecture and Production matrix were still untracked at the start of implementation. The matrix's catalog content was not changed by Pass 2.

## Verification and database boundary

Final results:

- **394/394** focused regression tests passed across Special Abilities, Skills, Forms, Derived Abilities, Character rules/advancement, lifecycle, Spell Construction and shared-library authorization. This includes **11** new domain/render tests.
- **9/9** integration scenarios passed inside the **1/1** disposable-cluster harness. These exercise real Skill/Derived actions, independent spell/mechanics/unknown saves and explicit detaches, byte/ID/timestamp preservation, stale/missing revisions, simultaneous writers, creator/admin authorization and provenance, classification with structural confirmation, typed/archive/missing references, save/delete/archive races, Derived lock ordering, invalid/future preservation, and authorized Character projections with zero-purchase racial possession and Derived possession. Character/state tables are compared before and after projection.
- `npm.cmd run typecheck` passed.
- ESLint over every changed application/test TypeScript and the integration scripts passed.
- `git diff --check` and documentation link checks passed.

Reproduce domain/regression tests without loading environment files:

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/special-abilities/*.test.ts src/features/skills/*.test.ts src/features/forms/*.test.ts src/features/derived-abilities/*.test.ts src/features/characters/*.test.ts src/features/lifecycle/*.test.ts src/features/spell-construction/*.test.ts src/features/authorization/shared-library-access.test.ts
node --import tsx --test scripts/special-ability-foundation-disposable.test.ts
```

The database harness creates a unique temporary PostgreSQL cluster, binds only to loopback, overrides the database URL, checks its disposable name, applies the existing migration chain there, creates synthetic fixtures, and stops/removes the cluster. It never loads `.env.local`. PostgreSQL 18 is the default local binary path; `SERRIAN_TEST_POSTGRES_BIN` can override it. On this Windows environment `initdb` needed approved execution outside the restricted token. The child suite uses Node's experimental module mocking for session/cache boundaries while exercising real database/services; experimental/deprecation notices did not cause failures.

**No migration was generated or applied to shared DEV/Production. No shared DEV or Production data was changed.** Only disposable test databases received migrations and synthetic writes, and those clusters were removed. The implementation did not read Production. No real Special Abilities received extensions or inferred rules. No seed, deploy, commit or push was performed in Pass 2.

This is focused regression and database evidence, not a full gameplay or human acceptance audit. The narrow diagnostic UI was server-render tested; no interactive browser, production build, physical print or tabletop execution verification is claimed.

## Decisions and exact recommended Pass 3

Before exposing numerical condition authoring, Brannan and Ember must either approve a deliberate progression meaning or agree to keep self-progression fields unavailable/provisionally labeled. This pass does not settle what Production percentages, points or qualitative mastery mean. Capability/Manual authoring can proceed without that ruling by keeping numerical authoring gated.

Confirm the v1 authoring language and workflow around explicit `always`, alternative requirement groups, Manual/G.O.D. adjudication, and deliberate attach/detach. Decisions about ability-owned resistance, resources, breath/sonic attack ownership, bindings and active Form/Creature contexts remain future design work; none should be invented to unblock the small v1 editor.

Recommended **Pass 3 only**: build the Skill-integrated editor for the existing two v1 families and four supported condition kinds (self-progression gated as above), stable-key add/edit/reorder/remove operations, exact typed Skill/Derived pickers with archived retention diagnostics, explicit extension attach/detach, visible strict validation and stale-save/reload handling, and readable definition-only preview using the shared contract. Reuse semantic theme and field guidance. Add focused editor persistence and desktop/mobile browser checks with synthetic fixtures.

Do not add new rule families, resources, runtime controls, wider reference types, real-content conversion, Production writes or every downstream consumer as part of that recommendation. Pass 3 requires the user's next instruction; Pass 2 stops here for inspection.

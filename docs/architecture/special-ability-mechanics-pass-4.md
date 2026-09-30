# Special Ability Mechanics: Pass 4 expanded authoring toolbox

September 30, 2026. Implements the user's expanded-toolbox brief on reviewed Pass 3 commit `33496378e873fc20e3d4cda2a43f9e74c2442cd8`. The earlier suggested display pass is superseded by that brief. **Authoring only. Pass 5 has not started.**

## Completion report

### 1. Commit and push

The delivery response records the verified implementation SHA and remote synchronization result. This report is included in that implementation commit; its introducing commit can also be found with `git log --diff-filter=A -- docs/architecture/special-ability-mechanics-pass-4.md`. The intended remote is the user-supplied `https://github.com/Revty79/serrian-tide-website`, branch `main`.

### 2. Files changed

Paths below are relative to `src/features/special-abilities/` unless otherwise stated.

| Files | Purpose |
| --- | --- |
| `models.ts`, `v2-models.ts` | Versioned definitions, six additional families and typed child structures |
| `codec.ts`, `codec-primitives.ts`, `conditions-codec.ts`, `v2-codec.ts` | Strict version-specific validation; existing v1 helpers extracted without changing their rules; local integrity checks |
| `override-registry.ts` | Empty audited slot registry and explicit rejection of unknown slots |
| `references.ts` | Collect nested exact Skill/Derived identities for the existing lifecycle protocol |
| `resolution.ts`, `summaries.ts`, `v2-summaries.ts` | Nonexecuting definition projection and readable summaries |
| `authoring.ts`, `v2-authoring.ts` | Explicit upgrade, family factories, stable keys and human-readable validation |
| `mechanics-editor.tsx`, `mechanics-preview.tsx`, `mechanics.css` | Skill Creator integration, upgrade confirmation, summaries and shared-theme layout |
| `v2-fields.tsx`, `v2-effect-editor.tsx`, `v2-interaction-editor.tsx`, `v2-activation-editor.tsx`, `v2-rule-editor.tsx` | Conditional guided authoring controls |
| `mechanics.test.ts`, `v2-mechanics.test.ts`, `v2-fixtures.ts` | Future-version fixture update, focused validation/render tests and synthetic-only test fixtures |
| `src/features/skills/skill-extension-persistence.ts` | Prevent v2-to-v1 downgrade through an ordinary upsert |
| `src/features/guidance/page-help.ts` | Updated Skill page guidance |
| `scripts/special-ability-foundation-db.test.mjs` | Actual v2 save/lifecycle/read-only integration tests |
| `scripts/special-ability-authoring-browser.test.ts`, `scripts/special-ability-toolbox-browser.ts` | Actual desktop/mobile authoring and regression workflows |
| This report; `docs/architecture/special-ability-mechanics-pass-3.md` | Completion record and corrected handoff |

### 3. Schema and version evolution

The existing `skill_extension` family remains `special-ability-mechanics`. Its JSON envelope accepts **schema 1 or 2**, with the database row version required to match. v1 accepts only its original Capability and Manual shapes. v2 additionally accepts the six new families. Unknown fields, nonfinite/unsafe numbers, unsupported types and executable-expression shapes are rejected rather than normalized away.

`emptySpecialAbilityMechanics()` still produces v1. The first expanded-family action on a v1 draft asks the author to **Keep Version 1** or **Upgrade and Add Rule**. Confirming changes the draft version and adds an unfinished rule; Save Skill persists it. Upgrade deep-copies existing definitions without changing their keys or values. The server requires an explicit family upsert with matching v2 versions; opening, loading or core edits cannot invoke it. A v2 upsert cannot downgrade to v1. Deliberate detach remains available.

Limits remain bounded: 256 KiB document, 100 rules, 20 qualification groups per requirements block, 50 conditions per group, 50 documentation references per rule, 128-character keys, 240-character rule titles and 16,000-character long text. New keyed child collections, local-link arrays and typed candidate lists are limited to 50. Attribute choices use the six shared keys. Counts use positive safe integers where appropriate; authored amounts are finite and within safe numeric bounds. No arbitrary formulas, JavaScript, SQL or evaluated strings are accepted.

### 4. Exact rule families

There are eight top-level families: unchanged **Capability** and **Manual / G.O.D.**, plus **Resource**, **Modifier**, **Interaction**, **Activated / Triggered**, **Rule Override**, and **Choice / Binding Definition**. Outcome branches are children of Activated/Triggered and Override rules, not a ninth top-level family. All retain the common title, description, qualification, limitations, notes and documentation references.

### 5. Resource definition

The Resource rule's immutable `key` is its resource identity; its title is its display name. Fields describe unit, whether the ability intends to grant the resource, maximum, conditional changes to maximum, and keyed recovery/refill definitions with refresh scope, event and notes.

Amounts are fixed, Manual/G.O.D., or explicitly provisional progression-threshold definitions. Signed fixed contributions are permitted for changes to a maximum. Recovery additionally supports a full-refill definition. Event refresh requires an event description. No stacking, clamping, rounding, initial-balance or refill ordering rule is invented. No Character balance, spend, restore or resource table exists in this change.

### 6. Modifier definition

Uses the shared `ModifierApplyEffect` and `validateMechanicalEffect()` contract: label, channel, exact target, nonzero signed whole-number amount and shared duration. Channels are Attribute, Skill, Movement, Initiative, Soak and Damage. Targets use the existing six Attribute keys, `skill:<id>`, `movement:<mode>`, or `self` for the applicable channel. Skill targets participate in lifecycle validation.

The strict authoring wrapper rejects unrelated fields before invoking shared validation, then preserves the original authored values. Optional G.O.D. guidance records unresolved handling. Duration uses the existing Until Removed, Combat Steps, Combat Rounds and Scene definitions; counted durations require positive whole counts.

**Form Attributes, Size, movement replacement, anatomy and Natural Protection remain on the Form.** UI guidance states this boundary. No modifier is applied and no independent stacking or timing language is added.

### 7. Interaction contribution and shared semantics

An ability-owned contribution uses shared Requirement, Immunity, Resistance, Vulnerability and Absorption types; Damage, Condition and Mechanical Effect scopes; and ANY/ALL matching. The strict wrapper invokes `normalizeInteractionRuleProfile()` in its existing CR-free `race` validation mode using a temporary single-rule validation envelope. That mode is only a validator: no Race profile is saved or attached, and no new runtime owner is registered.

The shared validator remains authoritative: Requirement/Immunity have no percentage; Resistance/Vulnerability/Absorption use positive finite percentages and Damage scope. There is no new 100% cap, percentage arithmetic, stacking or rounding engine. Tests compare acceptance directly with the shared validator across type/scope/percentage combinations.

The supported matching subset is Damage Type, Magical status, Source Kind (including the existing optional Firearm restriction), Mechanical Effect kind and Condition name. Item-tag/property matching is deferred because its tag/Creature identity paths need additional lifecycle contracts. Unsupported matching remains Manual/G.O.D. Existing Race/Form/Creature profiles stay with their owners. Incoming-effect loaders and resolvers were not changed to consume these contributions.

### 8. Activated/Triggered definition

Bounded activation types are Activated, Reaction and Triggered. Reaction/Triggered require an event description. The family describes costs, use limits/refresh, optional shared duration, self/other/multiple/manual target intent, required local choices, keyed intrinsic effects and outcomes. Manual target intent requires guidance.

Cost kinds reuse Derived Ability vocabulary: Initiative, Mana, Health, Ammunition, Resource and Custom. Refresh scopes reuse Round, Encounter, Scene, Manual, Never and Event. These are shared vocabulary only; Special Abilities do not become Derived Abilities.

Resource costs either reference the exact Resource rule key in this document or provide a manual resource name plus identity guidance. Named text never identifies a runtime balance. Intrinsic effects reuse `health.damage`, `health.heal`, `condition.apply`, `modifier.apply` and `manual`, including existing health timing and duration validation. Existing Natural Attacks, spells and Items retain their owned effects. There are no affordability checks, event subscriptions, counters, use history, recharge or execution.

### 9. Override registry and audited slots

**Zero slots are registered.** The extension point requires owner subsystem, stable slot key, parameter schema version/decoder, conflict policy and `runtimeSupported: false`. An unknown slot, including prototype property names, is rejected. No arbitrary parameters are accepted because there is no reviewed slot to own them.

The repository audit found existing actor-authorized runtime rulings rather than shared definition slots:

| Area inspected | Existing authority | Decision |
| --- | --- | --- |
| Character spell casting / Spell Construction cost and timing | `src/features/characters/character-spell-casting.ts`, construction/casting rules | No reusable ability-definition slot with documented conflict policy; Manual |
| Weapon/Skill governance | `src/features/items/character-weapon-governance.ts`, its services; `action-declaration-service.ts` | Exact Character/one-action G.O.D. rulings must not become shared Skill grants; Manual |
| Attack/protection/defense | `src/features/tabletop-operations/defense-intervention-service.ts` | Campaign-owner-authorized interventions, not definition-level authority; Manual |
| Movement/timing | `src/features/tabletop-operations/combat-movement-service.ts` | Existing runtime movement authority; no reviewed override slot; Manual |

The Rule Override editor therefore stores a **Manual/G.O.D. proposed exception** with bounded subsystem category, proposed change, conflict/precedence guidance and optional outcome descriptions. Selecting a category confers no override authority. Supporting a future registered slot requires an explicit typed contract and codec/UI revision; populating the registry alone will not silently enable it.

### 10. Choice/Binding definition

Choices are their own rule family so rules can reuse a definition without duplicating it. The rule key is the choice identity. Types are Attribute, exact Skill candidates, exact Derived Ability candidates, and Manual/custom guidance. Fields include minimum/maximum selections, restrictions and reselection policy (Never, G.O.D. approval, Allowed). A typed candidate list must be nonempty and unique; its maximum cannot exceed available candidates. Selection counts are 1–50.

These fields define what an owner may later choose. No chosen value, Character ID, binding row or selection state is allowed. Item, Form, spell, Evolution and generic polymorphic IDs are not added.

### 11. Outcomes

Keyed branches use Success, Failure, Critical Success, Critical Failure or Manual. Each has description, G.O.D. guidance, limitations, notes and exact intrinsic-effect links. Manual outcomes require G.O.D. guidance. Effect links are scoped to the same Activated rule; Override proposals have no intrinsic effects, so their branches remain descriptions/manual handling. Cross-rule or missing effect links reject.

The existing roll/result system remains authoritative. This structure does not roll, classify criticals, choose branches, determine whether effects run once or per branch, or execute anything.

### 12. References and lifecycle

External reference types remain exactly Skill and Derived Ability. New collection sites include Skill modifier targets (standalone or intrinsic), Skill/Derived choice candidates and maximum-change qualification conditions. They all feed the existing graph lock, transaction validation, catalog visibility, retained-archive picker labels and symmetric deletion protection. A new archived link rejects; an existing archived link may be retained. Unreadable/future documents retain conservative deletion protection.

New local references are Resource rule keys from costs, Choice rule keys from Activated definitions, and same-rule intrinsic-effect keys from outcomes. Attribute keys and effect kinds reuse shared bounded identifiers. The codec checks existence and correct local kind on every write. Removing a referenced definition keeps a visibly invalid draft until the author repairs its dependents; saving cannot create a dangling reference or silently cascade-delete another rule.

### 13. Child identity

Rules, qualification groups/conditions, maximum changes, recovery definitions, interaction conditions, costs, use limits, intrinsic effects and outcomes all have local keys minted only on creation. Resource/Choice identity is the owning rule key. Rename, reorder and field edits preserve keys, including changing an intrinsic effect type inside its keyed wrapper. Keys are not editable UI fields. Child keys are scoped to their parent collection; qualifications preserve their existing per-block group/condition uniqueness rules.

External candidates use exact typed record identity and Attribute candidates use shared keys; neither stores array position or display name as identity. Local-reference keys remain valid when titles or order change. Rule removal has the existing confirmation; child removal targets only that key and is reversible within the unsaved draft/reload workflow.

### 14. Skill Creator interface

The existing tab, Save Skill, revision control and per-extension mutation path remain authoritative. A guided family selector describes the selected family, and conditional editors show only its relevant controls. Keyed child sections support add/remove/reorder. Saved rules retain Edit/Collapse controls. New controls use `GuidedField`, `.st-control`, `.st-button` and existing semantic theme variables; no independent palette or raw JSON editor is added.

Visible validation preserves unfinished drafts. Invalid local links explain how to correct them. Definition previews include new families, modifier target/duration, intrinsic effect descriptions/timing, local resource/choice names, allowed candidates, outcome effect associations, qualification and manual guidance. They explicitly state that no Character was evaluated and nothing executed.

### 15. Existing v1 behavior

Capability and Manual shapes and meanings remain unchanged. Opening, previewing and core-only saves do not attach, convert or upgrade documents. Core-only writes preserve extension bytes, row IDs and timestamps. Explicit mechanics edits retain the saved version unless the author deliberately adds a v2 family. Upgrade preserves existing rule payloads and keys. No content is inferred from prose or catalog names.

### 16. Unsupported/future behavior

Versions greater than 2 remain protected with visible diagnostics. Malformed supported documents also remain protected. Their original bytes survive core saves and unrelated-family edits. Newer content cannot be overwritten by this editor; explicit detach remains possible. Spell Construction and unknown extension families keep independent mutation and preservation behavior.

### 17. Progression

The unresolved purchased-point interpretation is not settled. Existing self-progression conditions retain the Pass 2 provisional semantics and read-only numerical UI. Amount definitions can preserve a future-facing `progression-threshold` structure, but it is not a newly selectable or numerically editable option and **no resource scaling is evaluated**. Saved provisional amounts show their numbers and unresolved status; an author may deliberately replace them with fixed/manual definitions.

Rank, roll target, Form Access, purchased points, Race-granted progression and Character advancement are unchanged.

### 18. Automated verification

- **488/488 affected regression tests passed**, including **33 Special Ability tests**, plus Skills, Forms/Form Access, Derived Abilities, Character rules, lifecycle, Spell Construction, authorization, guidance, catalog visibility, Mechanical Effects and Interaction Rules. The 15 new focused tests cover each new family, versioning, strict boundaries, references, stable identity, conditional UI, read-only previews and provisional values.
- **12/12 disposable PostgreSQL scenarios passed** through actual Skill actions and lifecycle services. Added coverage includes v1/v2 preservation and deliberate upgrade, downgrade/stale/dangling rejection and rollback, each nested external-reference location, archive retention/deletion protection, and unchanged Character runtime snapshots after reading v2 definitions.
- TypeScript, changed-file ESLint and whitespace checks passed. The future-version test fixture was advanced from 2 to 99 because 2 is now supported. Validation was not weakened to preserve the old fixture.

No production build, physical-device, Firefox/Safari, printer or gameplay-runtime acceptance is claimed. The authoring route compiled and ran under the actual local Next server during browser verification.

### 19. Actual browser checks

**10 scenario groups passed** in Chrome at **1365 × 950** and **390 × 844**, with zero browser page errors. Existing seven groups cover classification, no auto-attachment, empty attachment, Capability/Manual and AND/OR authoring, exact/archived pickers, stale-save recovery, invalid/future preservation, detach and Spell/unknown-family independence.

Three expanded groups author and save every new family, cancel/confirm v1 upgrade, preserve the legacy rule, edit every conditional family at phone width, exercise all choice types, retain local references through rename/reorder/effect changes, and reject then repair a dangling outcome link. Page and individual expanded-card horizontal overflow checks pass. Desktop and mobile screenshots were captured and visually inspected. Artifacts are local and ignored under `artifacts/guidance/special-ability-pass-4/`.

### 20. Migrations

**No new database migration, table or schema column.** JSON definition evolution uses the existing extension document. Test harnesses apply the existing migration chain only to freshly created disposable databases.

### 21. DEV/Production writes

**No shared DEV or Production reads/writes were needed for this pass.** The local environment points to Production, so integration and browser harnesses override it with guarded loopback URLs and synthetic auth/data. They stop their own temporary PostgreSQL/Next processes, remove the owned temporary database directory, and restore Next-generated TypeScript configuration changes. No real ability, Shift Reserve, Form, Character resource or binding was authored.

### 22. Intentionally Manual/G.O.D.

All override proposals; unresolved progression-based amounts; named/custom resource identity and handling; unsupported target identities and Interaction conditions; custom costs; ambiguous event/target/outcome behavior; future mechanics outside reviewed typed families. Existing Manual rules and manual intrinsic effects remain valid escape paths for authored prose, never executable scripts. The new structured families themselves remain authoring-only even when all fields are valid.

### 23. Decisions still owned by Brannan and Ember

Settle the Special Ability progression contract before enabling numerical threshold authoring. Decide actual catalog mechanics, costs, maxima, recovery, choice/reselection rules and outcome definitions. Future runtime work needs explicit resource identity/current-state ownership, activation/event timing, outcome/effect dispatch, binding ownership, modifier/Interaction integration and override conflict/precedence contracts. None is inferred from this toolbox. Existing subsystem rules remain authoritative.

### 24. Exact recommended Pass 5

After review, implement **read-only Character, print and tabletop presentation of the completed v1/v2 vocabulary**:

1. Reuse the shared authorized projection and summaries. Add saved Normal Character mechanics references and printable reference sections, then the relevant existing tabletop/Character inspection views. Avoid independent JSON parsers or new runtime readers.
2. Show authored resource maxima/recovery, modifier/Interaction definitions, activation costs/limits/targets, manual override intent, choice requirements and outcome branches as definitions. Never display a current resource balance, chosen binding, executable Use button or active effect inferred from a definition.
3. Preserve possession gating, provisional progression labels, qualification explanations, archived/missing references and absent/empty/invalid/future states. Keep new families explicitly nonexecuting; nested maximum conditions and amounts are authored definitions, not evaluated resource totals.
4. Specify native Creature and active Form read adapters before claiming owner evaluation there. Until a supported adapter exists, label those contexts definition-only/unavailable rather than inventing owner facts or copying Form mechanics.
5. Use synthetic tests for permissions, purchased and zero-purchase racial possession, ownerless/unsupported contexts, manual conditions, nested references, read-only state snapshots and actual desktop/390px/print rendering. Inspect exported PDFs for layout. Make no real ability authoring, runtime, shared DEV/Production writes or new state tables part of Pass 5.

**Stop here for review. Do not begin Pass 5 automatically.**

## Reproduction

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/special-abilities/*.test.ts src/features/skills/*.test.ts src/features/forms/*.test.ts src/features/derived-abilities/*.test.ts src/features/characters/*.test.ts src/features/lifecycle/*.test.ts src/features/spell-construction/*.test.ts src/features/authorization/shared-library-access.test.ts src/features/guidance/*.test.ts src/features/catalog-visibility/*.test.ts src/features/mechanical-effects/*.test.ts src/features/interaction-rules/*.test.ts
node --import tsx --test scripts/special-ability-foundation-disposable.test.ts
node --import tsx scripts/special-ability-authoring-disposable.test.ts
npm.cmd run typecheck
git diff --check
```

The Windows disposable harnesses require PostgreSQL 18 tools and Chrome. Restricted-token `initdb` execution required an approved escalation; no database credentials or real catalog payloads are contained in the fixtures.

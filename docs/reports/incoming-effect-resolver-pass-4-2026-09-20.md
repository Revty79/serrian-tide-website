# Pass 4: Shared incoming-effect resolver

Base: `530bc6c06af5cc9e80caf5528cbe343dfe288bac`. Separate commit subject: **PASS 4 — SHARED INCOMING-EFFECT RESOLVER**.

Pass 4 builds one shared, pure planning resolver and authorized target reads. It returns a transparent plan or explicit G.O.D. ruling reasons. **It does not apply an effect or change existing combat execution. Pass 5 has not started.** Stop for Brannan and Ember's review after this commit.

## Delivered model and authority

`IncomingEffectInput` carries the incoming amount/harmfulness, explicit source facts, exact target context, applicable hit location and optional authoritative current/maximum HP. `IncomingEffectResolution` returns status, a cloned input, six ordered stages, every rule/condition match, matched rules, candidate outcomes, structured issues, a final proposed effect and a human-readable explanation. Unresolved/invalid results have `finalEffect: null`.

Source facts cover Damage Type, explicit Magical, all ten existing Source Kinds, firearm family, Item Properties with optional value/related Creature, canonical Item Tags, all five Mechanical Effect Kinds and Condition Name. No free-text fact inference, magic-by-identity, source adapters or weapon/ammunition inheritance was introduced.

One matcher handles flat ANY/ALL. Human categorical strings compare trimmed and case-insensitively without changing saved authoring. Canonical IDs remain exact. Null authored property values match any value with the same property name; related Creature restrictions remain mandatory. Unknown facts are distinguished from known false/empty facts and require a ruling when they leave an applicable rule undecidable.

| Target | Authoritative rule read |
| --- | --- |
| Normal Character | Currently assigned Race's live profile |
| Race NPC | Currently assigned Race's live profile |
| Creature NPC | Current individual Creature snapshot, never baseline/master |
| Direct Creature | Exact encounter occurrence snapshot, never master |

The live server helper authenticates, checks database roles and target access, and uses a repeatable-read, read-only transaction. Existing Character active-state read permissions are reused; direct Creature read requires the owning G.O.D. or admin. Encounter `participantId` continues to mean the runtime `character_id` key, including negative Creature occurrences, **not serial `participant_id`**. Old snapshots without rules and Races without rules/natural protection remain valid. The pure resolver only consumes supplied facts; it never refreshes historical inputs.

## Resolution behavior

| Stage/rule | Implemented behavior |
| --- | --- |
| Source qualification | Retain/validate facts; classify known health.damage as harmful; require explicit classification for ambiguous non-damage effects. No Requirement execution here. |
| Worn | Single applicable Base Soak subtracts before interactions; zero floor. Overlap, unresolved coverage/value or damage-type metadata requires a ruling. No metadata has an approved universal executable case. |
| Requirement | Each applicable rule is an independent gate. All gates must pass; ANY/ALL operates within a gate. Failure prevents the entire harmful effect. |
| Immunity | A match prevents the harmful scoped effect entirely; every duplicate Immunity remains traced. |
| Resistance | Sequential multiplication by `1 - percentage/100`, stable authored order, floor at zero including percentages above 100. |
| Vulnerability | Sequential multiplication by `1 + percentage/100`, stable authored order, uncapped. No additive percentage combination. |
| Absorption | Zero damage; post-worn amount times percentage becomes healing; remainder disappears. Percentages above 100 remain uncapped. Natural and temporary stages are skipped. |
| Natural | Single applicable definition subtracts Natural Armor and Natural Soak after interactions; zero floor. Overlaps require a ruling. |
| Temporary/other | Active applicable signed Soak amounts sum, then subtract after natural protection; zero floor. Ended/expired modifiers excluded; unresolved coverage/value requires a ruling. |
| Final | Exact decimal arithmetic throughout, with one final upward rounding. Optional supplied HP context caps proposed healing. No writes. |

Non-damage harmful Condition/Mechanical Effects can be allowed/prevented by Requirement/Immunity; numerical protection and damage percentages do not reduce them. Known non-harmful effects skip harmful interaction execution. Mechanical Effect scope encompasses the supported mechanical effect kinds; narrower conditions still apply.

Absorption + Immunity, Absorption + Resistance/Vulnerability, and multiple Absorptions produce `requires-god-ruling`, preserving all matched rules, incoming amount, each standalone candidate and the ordered Resistance/Vulnerability candidate. No winner is selected. When unknown facts/conflicts coexist with a failed Requirement, the ruling remains visible rather than being hidden by the failure.

The exact arithmetic also handles ordinary decimal boundaries: 100 damage with 70% Resistance is 30, not an accidental 31 from binary floating point. Internal coefficient/scale arithmetic does not alter the existing runtime decimal helper. The returned trace has JSON-safe exact decimal strings as well as convenient numeric projections; no BigInts leak into the plan.

## Trace and deliberate ruling cases

Each stage exposes completed/skipped/blocked status, damage/healing before and after (numeric and exact decimal), operation names, source IDs, values and readable messages. Rule entries retain individual condition outcomes and Requirement explanations. Absorption explicitly explains conversion and skipped layers. The approved `12 → worn 9 → resistance 6.75 → natural 3.75 → temporary 2.75 → ceiling 3` example is asserted in tests.

The complete ruling-code inventory is in the [resolver contract](../architecture/incoming-effect-resolver.md#intentional-ruling-cases): unknown harmfulness/source facts; missing/invalid required hit location; unknown worn coverage/value; multiple worn sources; unsupported armor damage-type metadata; all unresolved absorption combinations; multiple natural definitions/unsupported values; unresolved temporary coverage/value; and actual numeric overflow. Malformed typed inputs instead return `invalid`. Authorization/missing-target failures remain server access errors.

A defect at an unrelated location does not block a known applicable location. Unknown coverage blocks because applicability is undetermined. Absorbed/prevented results skip protection that cannot affect their outcome. No hit location is required for non-damage effects or damage whose available protection is all-locations only.

## Validation

- **1,512/1,512 feature tests across 172 files pass**, including **71 new focused matcher/resolver cases**. Coverage includes all requested conditions and rules, exact canonical identities, unknown facts, scopes, sequential percentages, absorption conflicts, protection layers, signed modifiers, rounding, decimal boundary cases, immutable caller inputs and serialized replay.
- **24 disposable service suites / 249 cases pass**: all **23 existing suites / 242 cases unchanged**, plus **7 new target-context cases**. Existing coverage includes 19 ordinary damage cases, 47 firearm cases, 5 effect-plan/Mechanical Effect cases, spells/abilities, HP, resources, Initiative, recovery, conditions, injuries, revival and combat-screen services. No existing combat expectation was rewritten.
- New database cases cover normal Character/Race NPC live Race mechanics, reassignment/absent rules, Creature NPC individual snapshots with/without worn armor, exact direct occurrences and old snapshots, serial-vs-runtime identity, temporary Soak, authorization and read-only planning. The final check compares every public table's complete stored-row digest before/after repeated reads/planning; all are identical.
- **TypeScript, changed-file lint, production build and diff checks pass.** Next's temporary build-directory additions to `tsconfig.json` were removed; no configuration changes remain.
- Scope inspection confirms no changed existing combat, Item, Active State, Creature, Race, Protection, Interaction Rule, database-schema, migration or app-route source files, and no existing runtime imports the resolver. Only the disposable harness adds the new test script at the end.

The first full regression attempt exposed ordering in the new test harness entry: its committed fixture interfered with earlier catalog tests' empty-database requirement. The new read-only check now runs last, leaving all existing test bodies/expectations intact. The complete rerun passes. Decimal boundary review also added exact arithmetic and tests before final validation. These were addressed before commit.

Evidence is under ignored `artifacts/creature-authoring/`: `pass4-unit.log`, `pass4-target-db.log`, `pass4-combat-regression.log`, and `pass4-build.log`. No new UI was introduced, so no new browser acceptance is claimed. There were no DEV/production data changes, migration, backfill, push or deployment; database fixtures ran only in newly created disposable clusters.

## Decisions/questions retained for review

1. What precedence should Absorption + Immunity use?
2. How should Absorption combine with Resistance/Vulnerability?
3. How should multiple Absorptions combine?
4. How should overlapping worn armor stack or be selected?
5. How should overlapping Race Natural Protection stack or be selected?
6. What structured semantics should armor damage-type modifier metadata execute?
7. Which Weapon/Ammunition facts should future adapters inherit/combine?
8. Which ambiguous non-damage effects are harmful, and where will that authoritative classification be supplied?

For this pass, those unresolved mechanics remain explicit rulings/boundaries. Additional implementation choices to review: null-versus-empty source collections, inclusive Mechanical Effect scope, conservative preservation of uncertainty alongside failed Requirements, and omission of a hit location only when protection does not depend on one. No new canon is inferred from names or legacy text.

## Exact files changed

```text
COMBAT-RESUME.md
docs/architecture/incoming-effect-resolver.md
docs/reports/incoming-effect-resolver-pass-4-2026-09-20.md
scripts/combat-completion-disposable-db.test.ts
scripts/incoming-effect-target-db.test.ts
src/features/incoming-effects/exact-amount.ts
src/features/incoming-effects/incoming-effect-target-service.ts
src/features/incoming-effects/interaction-matcher.test.ts
src/features/incoming-effects/interaction-matcher.ts
src/features/incoming-effects/models.ts
src/features/incoming-effects/resolve-incoming-effect.test.ts
src/features/incoming-effects/resolve-incoming-effect.ts
```

**The new resolver mutates no HP, conditions, injuries, resources, ammunition, mana, Initiative, combat effects or ActionEffectPlans. Existing combat paths have not been switched over. Pass 5 has not started.**

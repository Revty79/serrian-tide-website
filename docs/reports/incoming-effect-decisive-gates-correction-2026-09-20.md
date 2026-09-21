# Pass 4 final correction: decisive Interaction gates

Base: `de25906efe693c8491c66567c40ee8ac59200118`.
Commit subject: **PASS 4 — CORRECT DECISIVE INTERACTION GATES**.

This correction changes only the planning resolver's treatment of irrelevant Interaction-stage uncertainty. It does not integrate live combat or begin Pass 5.

## Corrected decisions

The resolver retains all condition matches and Requirement explanations, then checks for existing source/Worn blockers before making an Interaction decision. Earlier invalid inputs, required hit locations, worn coverage/value, overlapping armor and unsupported armor metadata retain their existing blocking behavior.

Within an otherwise reachable Interaction stage:

1. **Any definitely failed applicable Requirement prevents the harmful effect.** Other Requirements may be unknown and downstream rules may match, be unknown or conflict; none can change the failed gate. Final damage and healing are zero. No downstream percentage or Absorption candidate math runs.
2. **Definite Immunity prevents when no Absorption matches or could match.** Known/unknown Resistance and Vulnerability cannot block it. An unknown Requirement also becomes irrelevant here: failure prevents, and passing still reaches definite Immunity.
3. **Matching or potential Absorption remains an exception to Immunity.** Matching Absorption + Immunity still requires a ruling. An unknown Absorption match that could create that conflict still requires a ruling and explicitly explains why. Absorption + Resistance/Vulnerability and multiple matching Absorptions remain unresolved when the gate allows downstream rules to be reached.
4. **Unknown Requirements remain unresolved when the alternatives can differ.** An unknown gate before possible healing, for example, is not silently treated as passed.

All ordinary percentage arithmetic, exact decimal handling, final ceiling, simple Absorption, maximum-HP cap reporting and protection-stage calculations are unchanged.

## Structured result and trace

No model/version, database schema or issue-severity field was added. The existing `issues` collection remains exclusively blocking. The resolver now makes decisive decisions **before** adding irrelevant Interaction issues or constructing downstream numerical candidates.

`ruleMatches` continues to preserve all outcomes, including unknown conditions. Existing stage entries gain the operation value `skip-rule`, with the rule ID and an explanation that the rule was not applied because a Requirement gate or definite Immunity already prevented the effect. Such information never enters `issues` or receives a required G.O.D. review label. Earlier blockers return a blocked Interaction stage without a false `prevent` operation.

## Focused coverage

Added **22 tests** without changing any existing expectation:

- Failed Silver Requirement with unknown Damage Type for Resistance.
- Failed Magical Requirement with matching Resistance, Vulnerability or Absorption; no healing or downstream math.
- Failed Requirement before Absorption + Resistance, Absorption + Vulnerability, and Immunity + multiple Absorptions.
- One failed Requirement with another unknown Requirement; failed gate with unknown Absorption/Immunity.
- Definite Immunity with each matching/unknown Resistance and Vulnerability.
- Unknown Requirement with definite Immunity and a definite Absorption mismatch; unknown Requirement before possible Absorption healing remains blocking.
- Definite Immunity with potential/unknown Absorption remains a ruling.
- Failed Requirement with each earlier Worn blocker: overlap, coverage, value, metadata and required location.
- Invalid source amounts and unknown harmfulness cannot be bypassed by a failed Requirement.

Existing tests continue to cover matching Absorption + Immunity, every other unresolved Absorption combination, simple 50/100/150% Absorption, sequential Resistance/Vulnerability, exact rounding and the approved `12 → 9 → 6.75 → 3.75 → 2.75 → 3` example.

## Validation

- **93/93 Pass 4 matcher/resolver tests pass** (71 existing + 22 new).
- **1,534/1,534 feature tests across 172 files pass.**
- **TypeScript, changed-file lint, production build and diff checks pass.** Temporary build-directory additions to `tsconfig.json` were removed; no configuration change remains.
- **24 disposable service suites / 249 cases pass unchanged**: all 23 existing combat suites / 242 cases, plus the seven Pass 4 target-context cases. Coverage includes ordinary attacks (19), firearms (47), effect-plan/Mechanical Effect application, spells/abilities, HP/resources, authorization, exact target identity and snapshot authority. The existing read-only check again confirms that target reads and planning leave every public table's stored-row digest unchanged.
- Scope/diff review confirms exactly six files changed: the resolver, its tests, and four documentation/handoff files. Existing combat tests, the test harness, target reader, shared result model, Protection Layers, authoring, app routes, database schema and migrations are untouched. No existing expectation was changed.

Evidence: `artifacts/creature-authoring/pass4-correction-focused.log`, `pass4-correction-unit.log`, `pass4-correction-combat.log`, and `pass4-correction-build.log` (ignored local artifacts). Database validation uses a newly created disposable PostgreSQL cluster only.

## Exact files changed

```text
COMBAT-RESUME.md
docs/architecture/incoming-effect-resolver.md
docs/reports/incoming-effect-decisive-gates-correction-2026-09-20.md
docs/reports/incoming-effect-resolver-pass-4-2026-09-20.md
src/features/incoming-effects/resolve-incoming-effect.test.ts
src/features/incoming-effects/resolve-incoming-effect.ts
```

The current architecture/handoff describe the corrected behavior; the original Pass 4 report points to this correction while retaining its historical validation record.

**No HP mutation, ActionEffectPlan change, source adapter, Event/State/Equipment runtime, Protection Layers change, Race/Creature authoring change, migration or existing combat integration. Absorption precedence remains unresolved. Pass 5 has not started. Stop for review.**

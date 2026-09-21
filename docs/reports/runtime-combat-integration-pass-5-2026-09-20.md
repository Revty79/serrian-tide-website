# Pass 5: runtime and combat integration

Base: `64bff7e31103c3b29724278f2c4cce79c184cff1`.
Commit subject: **PASS 5 — RUNTIME AND COMBAT INTEGRATION**.
Commit hash: see the final delivery message / the commit containing this report.

Passes 1-4 remain the rule foundation. This pass connects them to existing gameplay services. No migrations, backfills, live data edits, deployment or push. Pass 6 has **not** started. Stop after this commit for Brannan and Ember review.

## Incoming effects and historical truth

1. **One source adapter.** `source-facts.ts` produces structured facts; the transaction adapter reads exact Item identity, `isMagical`, properties and canonical tags. Weapon family is none for ordinary Weapons. Firearm/projectile facts use the existing firearm classification and damage source; Magical/properties/tags remain unknown because Weapon/ammunition inheritance is undecided. Spell Construction is Magical. Creature attacks/abilities use explicit Magical authoring or a construction document; identity/prose never establishes magic. Derived Ability magic remains unknown. Known non-Item sources have empty Item property/tag collections; unspecified facts remain null.
2. **Source timing.** The existing source lock adds optional `incomingSourceFacts` to the snapshot. Firearm preview freezes projectile facts and Weapon-Hit effects. AoE effect templates freeze with the source; later G.O.D. membership selects from those templates without reading an edited Spell/Item master. Existing snapshot schema stays readable.
3. **Target timing and authority.** Consequence creation reads the exact Campaign, Session, Scene, Encounter and runtime `character_id`, including negative Creature IDs. It reads the occurrence snapshot or Creature NPC current snapshot, current Race rules, Worn equipment and temporary protection. Serial participant IDs never substitute for runtime IDs. Public target-read authorization is unchanged; the internal helper runs inside the already-authorized combat transaction.
4. **Saved calculation.** Each new applicable effect stores the full resolver input, target application locations, source facts, result, stages, matches, candidates and issues in existing JSON. Application and inspection use that record. Amount rulings retain the original evidence. Optional Weapon-Hit resource removal/allocation recalculates against the frozen target and retains both calculations. New actions see later live edits; retained plans do not.
5. **Ordinary attacks.** Calculate gross source damage first, then run Worn -> Interaction -> Natural -> Temporary -> rounding exactly once. Existing Roll successes, locations, called shots, defenses, Weapon-Hit contributions, timing and charges remain. Direct Creature authored damage does not gain Character attribute/source damage modifiers. Existing extra-success damage is retained: it is an existing attack Roll rule, distinct from STR/DEX modifiers, and removing it regressed accepted injury/death behavior.
6. **Creature attacks.** Direct occurrence and Creature NPC attacks use the correct source snapshot. NPC Character rules and Worn equipment remain available. Four source/target directions are tested, including isolation from a later Creature master edit. Authored Initiative takes precedence; existing legacy fallback boundaries remain.
7. **Firearms.** Each bullet runs the shared resolver separately. Bullet records retain their base damage/protection audit; ActionEffectPlan combines approved Weapon-Hit additions before its own one-time resolution. Ammunition, firing cadence, cycling, preparation, allocation, called shots and resource retries remain in their existing services. Unknown inheritance only blocks when a target rule depends on it.
8. **Spells and AoE.** Each selected target resolves independently. Existing G.O.D. area membership and explicit zero-target results remain. Casting Mana still commits once at cast start. No new persistent-area lifecycle.
9. **Item, Creature and Derived Ability effects.** Structured damage uses the same adapter in combat plans and in the already-authorized sheet runtimes. Sequential sheet effects share projected Health, including prevented damage and capped Absorption. Relevant non-damage interactions use explicit harmfulness when available; otherwise a meaningful Requirement/Immunity ambiguity requires a ruling. Ordinary healing bypasses damage protection. Unsupported/manual mechanical effects retain their existing manual boundary.
10. **Status mapping.** Resolved damage produces the supported consequence. Prevention/zero produces a declined effect with its explanation and no fake damage; an all-declined action completes normally. Absorption produces same-pool healing. Unknown matters produce unsupported, G.O.D.-required effects; approval alone cannot apply the unresolved value. Invalid data throws and rolls back. An explicit ruling can set damage/healing, prevent/allow an effect, or select an exact frozen location.
11. **Absorption.** Uses the calculated healing amount and original incoming pool. Natural/temporary reduction stays skipped. Existing Active Health applies its current cap once. Missing pool preserves the calculated healing and asks the G.O.D. to choose from frozen anatomy. It never guesses a different pool.
12. **UI and privacy.** Ordinary attack, Spell and effect reports show the result and a collapsible stage explanation. Unresolved damage does not present gross damage as a finished outcome. Absorption displays healing separately from damage. Raw frozen evidence is further collapsed. After a G.O.D. decision, the report labels the unresolved evidence as the original calculation and displays the recorded result without the superseded gross-damage formula. Players receive a whitelist summary; private target rules/notes and full firearm protection snapshots remain G.O.D.-only. History needs no live rule reread.
13. **Old plans.** Optional fields do not force migration. Old effect values, damage records, Rolls and firearm records remain historical. Legacy ordinary rulings retain their old calculation path. A dedicated regression removes the optional snapshots and proves the stored consequence remains readable/applicable despite a later live Immunity.

## Shared Ability conditions

The typed fact model carries key, human label, category, boolean/number/text type, value, authoritative source and explanation. One evaluator serves Creature and Derived Abilities.

### Supported events and actual producers

| Key | Actual producer |
| --- | --- |
| `combat.action-declared` | Exact pending Responder Opportunity for this combatant and a revealed committed declaration |
| `combat.attack-declared` | That same window, with a locked Weapon or Creature Attack source |
| `combat.attack-targeted` | That attack window plus exact membership in the locked target set |

There is no generic event log watcher and no invented parry/death/damage producer. Reading a choice spends nothing. An arbitrary client key cannot manufacture an event. An explicit G.O.D. manual event requires owner authority plus the recorded use-requirements reason; it does not give the G.O.D. control of a Player's action.

### Equipment and State facts

| Keys | Source / limitations |
| --- | --- |
| `equipment.armor-worn`, `equipment.weapon-wielded` | Existing equipment reader, actual Worn armor / Wielded weapon profiles |
| `equipment.item:<canonical ID>:owned` | Exact live Item, positive owned stack or unretired owned copy, including inventory Items |
| `equipment.item:<canonical ID>:worn`, `:wielded`, `:equipped` | Existing exact equipment state; Equipped includes Worn/Wielded. Direct Creatures produce false for known Item possession/state, never fake Character gear. Missing catalog identities are unknown. |
| `state.current-hp`, `state.maximum-hp`, `state.hp-percent` | Active Health/anatomy or direct occurrence HP and damage; incomplete anatomy remains unknown |
| `state.condition:<exact name>` | Actual unresolved active condition, exact spelling/case |
| `state.dead`, `state.incapacitated` | Authoritative occurrence combat state; undifferentiated legacy defeat remains unknown |
| `state.initiative`, `state.round` | Current Encounter participant/timeline |
| `state.movement-mode` | Stored Encounter movement mode text; no inferred movement state |

Numeric comparisons require finite numeric facts/values. Equal/not-equal require exactly one authored number or text and matching types. Both or neither is ambiguous/manual. Present/not-present require booleans. Missing is unknown; explicit false is false. Manual Ruling always remains manual.

### Use and controller behavior

- Derived Ability use preserves possession/live prerequisites, Mana, limits, recharge records, Initiative and use receipts. The existing passive reconciler now evaluates shared conditions and relevant target interactions before maintaining persistent passive conditions/modifiers. Unsupported passive health/duration work remains manual.
- Creature Ability use checks the exact frozen ability, current facts, activation type, authored Initiative and automatic/fixed/manual resolution. Passive cannot become an activated action. NPC Mana costs reuse Active Mana, including supported sheet use; Initiative does not matter outside combat. Direct-Creature/custom costs and persistent limits require an explicit G.O.D. resource/use-requirements ruling.
- Triggered/Reaction choices appear in the existing response window for their controller. Selecting and committing uses the existing response snapshot, Roll, Initiative and resource path. Derived Ability uses retain a receipt; retries do not spend again. The **Intervention outcome still uses the existing explicit G.O.D. treatment**, rather than a new automatic reaction-effects engine. Nothing auto-selects or auto-fires.
- Creature and Derived authoring share searchable human labels. Exact Item search and Item-state choices avoid canonical-ID memorization. Exact active Condition names have their own field. Advanced custom keys and both old comparison values survive save/reload. Unknown facts explain the G.O.D. boundary. Harvest & Utility is untouched.

## Validation

- Full feature suite: **1,562 passed**, 174 feature test files. Includes the Pass 1-4 authoring, validation, interaction matcher/resolver and protection tests plus new typed-fact, source/proposal and report regressions.
- Full combat service harness: **282 passed across 27 scripts**, all against a freshly migrated disposable PostgreSQL cluster. The full 25-script combat run passed all 279 cases; both additional standalone Derived Ability compatibility scripts then passed their three cases in the same disposable harness. Includes **26 dedicated Pass 5 runtime cases**, firearm/spell integration additions, ordinary attacks, learned spells/AoE including zero targets, Item/Derived Ability use, Active Health, conditions, equipment, Initiative, authorization, exact target reads, immutable history, retry and resource conservation.
- Creature authoring/compatibility browser harness: **passed**; legacy migration preservation, master/NPC save/reload, shared selectors and help, all old operators/hidden values, Race/Creature Interaction Rules, Natural/Worn/Temporary protection, desktop and phone layout, and unchanged Harvest & Utility.
- Combat browser harness: **passed all 53 recorded workflow checks**, zero browser runtime errors, in a clean full 686-second run. Covers G.O.D./Player combat, Player attacks on exact Creatures, the four new incoming-effect cases, authored Reaction commitment, phone layout, all existing projectile/firearm/spell/Item flows, defense, revival, conditions, XP/Fame, retries and closeout. Successful results plus five focused phone screenshots are retained under `artifacts/combat-screens/pass5/`.
- Production build: **passed**, Next.js 16.3.2. No routes failed to compile/prerender.
- TypeScript `--noEmit`: **passed**. Changed-file ESLint: **passed**, zero warnings. `git diff --check`: **passed**. Build-generated temporary TypeScript include paths were removed.
- Service assertions cover per-bullet Resistance and same-pool Absorption with three rounds consumed once, unknown projectile inheritance, Spell Magical facts and separate target outcomes with Mana spent once, Item/Creature/Derived damage, client event spoofing, actual fact providers, both controller Reaction choices, stable existing plans after live edits, historical plans without snapshots, harmfulness fallback, and passive unknown-fact preservation.

Reproduction entrypoints: `node scripts/run-feature-tests.mjs`; `node --import tsx --test scripts/combat-completion-disposable-db.test.ts` (now includes all 27 scripts); `node --import tsx --test scripts/creature-authoring-disposable.test.ts`; and `node --import tsx --test scripts/combat-screens-disposable-browser.test.ts`. Build used `SERRIAN_TEST_NEXT_DIST_DIR=.next-creature-authoring-build` and `node node_modules/next/dist/bin/next build`. The disposable PostgreSQL/browser harness needs normal Windows process permissions for `initdb`; sandbox-only execution cannot start its restricted token.

Logs are local under `artifacts/creature-authoring/pass5-*.log`. The browser evidence retained with this commit is listed below. Initial failing runs exposed and corrected integration/report issues; a local sign-in connection reset was addressed with transport-only retry. A final screenshot review also corrected the post-ruling labels and suppressed the superseded gross formula. Editing during one full browser run triggered a development-server full reload and reset the last scenario's draft; the suite was rerun with unchanged source. No failed assertion was suppressed.

Validation uses disposable migrated loopback PostgreSQL databases and disposable authenticated browser fixtures. No application data was modified. Automated checks establish regression evidence, not Brannan's human acceptance.

## Every intentional change to existing test expectations

1. `combat-completion-damage-db.test.ts`, the fully protected Weapon-Hit periodic rider: OLD one periodic damage schedule survived even when its own damage was absorbed by protection; NEW zero schedules when shared protection reduces that rider to zero. WHY Pass 4 protection applies to every structured incoming `health.damage`; charges and non-damage riders retain their existing behavior. The unprotected case still schedules one.
2. `combat-completion-firearms-db.test.ts`, the single-hit periodic Weapon-Hit rider: OLD one three-damage schedule with two remaining ticks bypassed Natural Armor 2 + Natural Soak 1; NEW that rider is declined and no schedule exists. WHY the same accepted shared protection now applies to the rider. Base bullet damage, additive damage, non-damage riders and resource expectations are unchanged.
3. `creature-use-conditions-browser-checks.ts`, help/selectors: OLD help said the system-backed catalog and runtime were future work; NEW help describes current authoritative facts and unknown-key rulings. Raw key edits now open Advanced and target its textbox; a supported-event selection is additionally checked. WHY Pass 5 explicitly activates the deferred condition runtime and requires shared selectors. Stored keys, all operator codes, old numeric/text values, persistence and accessibility expectations remain unchanged.
4. `combat-screens-browser.ts`, projectile timing wait: OLD the helper waited for an Advance button after refresh even if the pending operation had already finished; NEW it accepts authoritative completion before looking for that button. WHY the completed operation legitimately returns the UI to a choice; no gameplay outcome expectation changed.

5. `combat-screens-browser.ts`, disposable login transport: the auth request now retries up to two connection-reset failures. HTTP/authentication errors and gameplay assertions still fail normally; this addresses an observed local development-server transport reset, not an outcome expectation.

No bulk replacement of damage expectations. The direct Creature extra-success change was reverted after regression evidence; existing death/injury expectations remain unchanged.

## Decisions and questions for Brannan / Ember review

1. How do Weapon and ammunition Magical status, Item Properties and tags combine? Until decided, those projectile facts are unknown; family and authored damage remain known.
2. What precedence applies to Absorption with Immunity, Resistance/Vulnerability, or multiple Absorptions? Existing Pass 4 G.O.D. boundaries remain.
3. How should overlapping Worn armor and overlapping Race Natural Protection stack? No precedence invented.
4. What executable semantics should armor damage-type modifier metadata have? Remains a ruling.
5. Which non-damage effects are authoritatively harmful? Names and prose are not used to guess.
6. What lifecycle/storage should automate Creature passive traits? They remain visible, cannot be activated, and have no new automatic persistence model.
7. What persistent use-limit/recharge and custom/direct-Creature resource model should Creature Abilities use? No Creature ledger invented; existing enforceable Character Mana is reused.
8. Which additional Event/Equipment/State facts should receive authoritative producers? Unsupported custom keys remain manual. No invented event names are registered as automatic.
9. Retain existing attack extra-success damage on direct Creatures while omitting Character STR/DEX/source damage modifiers; this preserves the accepted Roll and injury behavior. If COMPLETE DAMAGE is intended to exclude extra successes too, that would need an explicit rules decision and corresponding review of the existing combat expectations.
10. Authored Trigger/Reaction eligibility and resource commitment now work in the existing response framework. Automatic execution of arbitrary reaction effects beyond its existing G.O.D. Intervention treatment is a separate runtime decision; no second engine was introduced.

## Exact files changed

```text
COMBAT-RESUME.md
artifacts/combat-screens/pass5/pass5-absorption-narrow.png
artifacts/combat-screens/pass5/pass5-conflict-narrow.png
artifacts/combat-screens/pass5/pass5-requirement-narrow.png
artifacts/combat-screens/pass5/pass5-resistance-narrow.png
artifacts/combat-screens/pass5/pass5-response-narrow.png
artifacts/combat-screens/pass5/results.json
docs/architecture/incoming-effect-resolver.md
docs/reports/runtime-combat-integration-pass-5-2026-09-20.md
scripts/combat-completion-damage-db.test.ts
scripts/combat-completion-disposable-db.test.ts
scripts/combat-completion-firearms-db.test.ts
scripts/combat-completion-spells-db.test.ts
scripts/combat-screens-browser.ts
scripts/creature-use-conditions-browser-checks.ts
scripts/pass5-runtime-db.test.ts
src/app/characters/item-use-actions.ts
src/app/heavens/creatures/creature-use-conditions-editor.tsx
src/app/heavens/derived-abilities/derived-ability-constructor.tsx
src/app/heavens/tabletop/action-effect-plan-actions.ts
src/features/ability-use-conditions/fact-selector.tsx
src/features/ability-use-conditions/fact-service.ts
src/features/ability-use-conditions/facts.test.ts
src/features/ability-use-conditions/facts.ts
src/features/active-state/mechanical-effect-service.ts
src/features/characters/character-spell-runtime-service.ts
src/features/combat-screen/attack-report-panel.tsx
src/features/combat-screen/attack-report.test.ts
src/features/combat-screen/attack-report.ts
src/features/combat-screen/command-actions.ts
src/features/combat-screen/defense-panel.tsx
src/features/combat-screen/effect-ruling.tsx
src/features/combat-screen/incoming-effect-evidence.tsx
src/features/combat-screen/incoming-effect-ruling.tsx
src/features/combat-screen/result-summary.test.ts
src/features/combat-screen/result-summary.ts
src/features/combat-screen/spell-report-panel.tsx
src/features/creatures/creature-ability-runtime-service.ts
src/features/derived-abilities/character-derived-ability-service.ts
src/features/derived-abilities/derived-ability-use.ts
src/features/incoming-effects/effect-proposal-service.ts
src/features/incoming-effects/effect-proposal.test.ts
src/features/incoming-effects/effect-proposal.ts
src/features/incoming-effects/incoming-effect-target-service.ts
src/features/incoming-effects/models.ts
src/features/incoming-effects/public-evidence.ts
src/features/incoming-effects/runtime-plan-service.ts
src/features/incoming-effects/source-facts-service.ts
src/features/incoming-effects/source-facts.ts
src/features/mechanical-effects/models.ts
src/features/tabletop-operations/ability-response-service.ts
src/features/tabletop-operations/action-declaration-service.ts
src/features/tabletop-operations/action-effect-bridge.ts
src/features/tabletop-operations/action-effect-plan-service.ts
src/features/tabletop-operations/action-source-resolver-service.ts
src/features/tabletop-operations/combat-creature-ability-service.ts
src/features/tabletop-operations/combat-derived-ability-service.ts
src/features/tabletop-operations/defense-intervention-service.ts
src/features/tabletop-operations/defense-intervention.ts
src/features/tabletop-operations/firearm-attack-service.ts
src/features/tabletop-operations/ordinary-attack-consequence-service.ts
src/features/tabletop-operations/player-tabletop-console-service.ts
```

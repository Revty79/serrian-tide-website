# Combat Runtime Completion — Pass 4: Magic

Starting point: `19c1b6567eb10d9cf42ebb12f095a928d0796908`. Local work only; no push, Production write, or Pass 5 acceptance.

## Audit before implementation

The shared `spell-construction/mechanical-effects-adapter.ts` currently adapts Damage and Healing with an explicit Full Body/Area application. Other families become visible manual effects. Character combat casting and activated Item Magic already consume that adapter. Race/Creature Attack attachments are frozen and establish Magical identity but never enter the consequence list. Creature Ability attachments are also stored but ignored by their adapter.

Character combat casting resolves the exact owned Spell Skill, freezes its percentile target, uses the existing percentile service, spends calculated Mana at declaration, and uses the pending-action Initiative service. Declaration/effect receipts prevent duplicate costs and application. Failure does not refund begun casts. Saved formulas without an owned casting Skill require an explicit source ruling. The adapter owns no costs.

Multi-Target already uses exact identities/capacity; AoE uses G.O.D.-confirmed encounter membership and frozen effect templates, including an empty-area report. Shape and range labels are frozen, but range currently has no enforcement. No position/visibility engine exists. Self and encounter membership already have identity checks.

Character scaling collects Spell-wide modifiers across containers. Static overrides Per Success; ordinary static Spell Damage retains the existing additional-success damage bonus. Per Success currently throws for nonnumeric/manual effects rather than returning a ruling. Item Magic currently leaves scaling fixed. Attached attacks' existing consequence loop omits per-effect incoming metadata and Healing support; these must be preserved when adding constructed riders.

Progressive resolution supplies active containers/effects/modifiers to targeting and adaptation. Its casting calculation deliberately copies the original construction under `costMode: original-base`; this also freezes original rather than active Concentration. Clarification requested on cost basis; other work is independent. Normal Concentration already applies -2 Mana/+2 Initiative per point through the common calculator/practitioner chain.

The shared Mechanical Effect vocabulary already executes Condition and Modifier applications with exact channel/target/amount/duration, and Health timing supports explicit periodic schedules. Spell selections cannot currently author these. Construction durations are ignored by the adapter. A duration does not itself establish periodic damage frequency. Existing expiry services own steps/rounds and idempotent cleanup.

Pass 1 incoming effects already enforce Requirements, Immunity, Resistance, Vulnerability, Absorption, typed Worn protection, and natural protection. Healing bypasses damage reduction. Non-damage effects accept explicit harmfulness metadata; unknown harmfulness needs a ruling when relevant. All construction sources must preserve Magical separately from each Damage effect's type.

Item Magic already owns activation Initiative, equipment validation, exact charge/quantity costs, fixed progressive power level, effect identities and retry receipts. Its calculator return currently describes the original construction even when its adapter uses a resolved tier; no normal Spell Mana is spent. Preserve Item resource semantics.

## 1. What already worked

The audit above was recorded before implementation. Character casting already owned Skill resolution, percentile Rolls, Mana at declaration, Initiative, immutable source snapshots, target identities and effect receipts. Damage, configured Healing, Item activation resources, shared incoming protections and Condition/Modifier lifecycle services already worked. Those services remain the execution authorities.

## 2. Repairs and additions

The common construction adapter now understands optional, explicitly authored Condition/Modifier applications and exact construction-duration mappings. Race Attack, Creature Attack and Creature Ability owners consume it through one shared attachment helper. Character and Item construction effects retain the same adapted metadata, scaling, range evidence and incoming-effect path. Added range checks, active-tier Concentration, deep progressive effect cloning, visible manual outcomes and focused authoring controls.

Principal implementation: `spell-construction/runtime-application.ts`, `mechanical-effects-adapter.ts`, `combat-range.ts`, `engine/progressiveSpell.ts`; `tabletop-operations/attached-magic-effects.ts`, `construction-effect-range.ts`, `action-source-resolver-service.ts`, `race-natural-attack-service.ts`, `ordinary-attack-consequence-service.ts`, `action-effect-bridge.ts`; `creatures/creature-ability.ts`; shared Spell/Mechanical Effect editors and combat command/report components.

## 3. Full effect-family execution matrix

**A:** native executable with required application facts. **B:** only an explicit shared Condition/Modifier can execute; the family name and prose supply no mechanics. **C:** manual because an authoritative runtime owner or complete operation contract is missing. Counts below are base-document effect selections in the read-only DEV audit, not cast counts or progressive-tier totals.

| Family | Class | Catalog effects | Runtime boundary |
| --- | --- | ---: | --- |
| Damage | A | 92 | Numeric amount, exact target/location and separate Damage Type |
| Healing | A | 28 | Full Body or Area must be specified; all 28 catalog entries currently omit this |
| Buff | B | 113 | Exact authored Condition/Modifier |
| Debuff | B | 125 | Exact authored Condition/Modifier and harmfulness |
| Summon (minor) | C | 12 | No approved temporary occurrence/companion ownership contract |
| Summon (major) | C | 10 | No approved temporary occurrence/companion ownership contract |
| Create/Destroy (basic) | C | 14 | No exact object/terrain mutation owner |
| Create/Destroy (major) | C | 20 | No exact object/terrain mutation owner |
| Transform/Alter | C | 26 | No approved Form/Evolution integration |
| Illusion/Mask | B | 39 | Explicit state/modifier only; no invented perception simulation |
| Reveal/Detect | B | 36 | Explicit state/modifier only; no invented visibility/discovery |
| Counter/Cancel | C | 20 | Missing exact selected-effect cancellation semantics |
| Accelerate/Hasten | B | 14 | Explicit shared Modifier; no direct timeline rewrite |
| Decelerate/Slow | B | 26 | Explicit shared Modifier; no direct timeline rewrite |
| Link/Bind | C | 22 | Missing exact paired relationship/lifecycle semantics |
| Transfer Life Force | C | 7 | Missing paired source/recipient transfer contract |
| Teleportation | C | 14 | Missing authoritative position/destination owner |
| Banish | C | 5 | Missing destination/removal/return contract |
| Pocket Space | C | 1 | Existing inventory containers do not establish magical space semantics |
| Spatial Bubble | C | 37 | Missing spatial membership/lifecycle owner |
| Temporal Stasis | C | 16 | Missing approved timeline/state semantics |
| Push | C | 10 | No authoritative forced movement/coordinates |
| Pull | C | 10 | No authoritative forced movement/coordinates |
| Grapple/Restrain | B | 30 | Explicit state/modifier only |
| Immobilize | B | 41 | Explicit state/modifier only |
| Stun/Daze | B | 18 | Explicit state/modifier only |
| Disarm | C | 3 | Voluntary equipment handling does not authorize forced disarm |
| Knockdown | B | 18 | Explicit state/modifier only |
| Blind/Deaf/Silence | B | 3 | Explicit state/modifier only |
| Anchor/Lock | B | 18 | Explicit state/modifier only |

A named Condition records the exact state and duration. It does not automatically prevent actions, suppress senses, move combatants, mutate equipment or calculate geometry.

## 4. Character Spell costs and timing

Normal casts still resolve the exact learned casting Skill and Roll target. Calculated Mana spends once in the declaration transaction; pending Initiative and the original percentile Roll retain their existing owners. Failed, cancelled and interrupted begun casts keep the existing no-refund behavior. Unaffordable/invalid starts roll back. Adaptation never spends Mana. Repeated declaration/application requests reuse receipts.

## 5. Range, AoE and Multi-Target

Short/Medium/Long use 30/60/120 feet. A G.O.D.-supplied numeric distance is validated before commitment; an over-limit value rejects the action. With no authoritative distance, Touch/Reach/Line of Sight/limited range require explicit G.O.D. confirmation. Player-supplied range evidence cannot grant that authority. G.O.D. actors have range controls at selection; unresolved Player casts preserve a visible range ruling in the result workflow. Missing legacy range remains unspecified without inventing a default distance.

Self retains identity checks; Unlimited still requires legal encounter participants. Multi-Target chooses exact identities within capacity, rejects duplicate selections and freezes the selection. AoE retains G.O.D.-confirmed participant membership and legal empty-area reports. Shape/size labels now include their authored increment units; no coordinates or membership are inferred. Area range is measured/confirmed to the selected area. An empty area still follows begun-cast Mana rules.

Attachments use the owner's locked targets. Capacity, Self or unconfirmed AoE conflicts become explicit manual consequences; the construction cannot expand the target set. Attack-owned numeric distance is reused where available. Creature Ability AoE has an explicit membership confirmation control.

## 6. Concentration

Active-tier Concentration now contributes exactly -2 Mana and +2 casting Initiative per point through the common calculator. Original Concentration is removed from the casting basis before active Concentration is included, preventing double counting. Costs freeze at commitment. No sustained-concentration status was introduced.

The repository explicitly uses `costMode: original-base`. That established base-cost rule is preserved, with active-tier Concentration applied to it. The optional clarification received no answer; no wholesale active-tier repricing was assumed. This distinction should be confirmed during review before changing the progression contract.

## 7. Static and Per Success

Scaling remains Spell-wide across root and nested modifiers. Static overrides Per Success. Numeric Per Success effects use the one governing Roll's total successes; fixed constructed Damage retains the established additional-success damage bonus. Fixed Healing does not gain that damage bonus. Nonnumeric Per Success effects, or Per Success without a governing Roll, visibly require a G.O.D. ruling instead of throwing or silently applying a fabricated quantity.

Construction-backed Item Magic now honors the same authored scaling; its previous path silently used fixed quantities. The browser example with quantity 2 and three successes therefore applies 6 damage. Automatic Item constructions can use fixed scaling; an authored Per Success construction without a Roll requires a ruling. Ordinary nonconstruction Item effects retain their existing quantities.

## 8. Progressive tiers

Active containers, effects, modifiers, range, target groups and runtime applications come from the resolved tier, including additions/replacements. Runtime application data is deeply cloned so an edited resolved result cannot mutate inherited authoring. Historical snapshots include resolved Spell data or the frozen per-effect tier evidence.

Character practitioner resolution and Item fixed-power-level behavior remain authoritative. As established by existing Item tests, an Item with no fixed progressive power level uses its original construction. Attached progressive Magic needs an explicit practitioner level in its construction; otherwise it remains manual. Casting costs follow section 6's original-base contract with active Concentration.

## 9. Durations

Authors choose an explicit shared lifecycle or exact construction duration. Combat Step maps to one combat step; Combat Round to one combat round; positive integral Lingering quantity maps to that many combat steps, matching the existing rule definition. The nearest containing duration is used. Absent, Instantaneous or multiple ambiguous durations cannot define a Condition/Modifier lifecycle and become manual when construction duration is selected.

Existing expiry/cleanup owns removal and retries. New attachment database cases prove one-step Condition/Modifier expiry and unchanged state on repeated completion. A Damage/Healing construction duration does not invent periodic frequency. Already-authored shared periodic effects keep their existing schedule and frozen incoming-effect behavior.

## 10. Damage and Healing

Damage preserves authored quantity, active tier, scaling, target, hit location, Magical identity and per-effect Damage Type. Base Attack damage and construction Damage are separate consequences. A Slashing base attack with a Fire construction preserves both independent types.

Configured Full Body and Area Healing use shared Health application and receipts. Area Healing requires an exact pool; attack-attached Area Healing can use the established hit location. Healing bypasses Armor/Resistance damage reduction. The direct Area Healing regression starts at 6 total/3 head damage and ends at 4 total/1 head damage after healing 2, unchanged on retry. Unspecified Healing Application remains manual.

## 11. Explicit runtime authoring

The optional `EffectSelection.runtimeApplication` contains an existing `condition.apply` or `modifier.apply`, optional explicit harmfulness and a duration source. The shared editor collects exact Condition identity/description or Modifier channel/target/amount/lifecycle. Descriptions remain narrative. UI guidance explains that Condition names do not themselves suppress actions or create movement rules.

The original construction rule, quantity, Mana, mastery and construction validation remain intact. Schema version 7 is unchanged: this follows the existing additive optional-field codec pattern. Old documents remain readable/manual; malformed new data and unsupported family/application combinations are rejected. No catalog backfill or migration is needed.

## 12. Race Natural Attack construction

The exact locked Normal Race Attack adds adapted effects under a separate stable Magic namespace. Existing base damage and separately authored on-hit effects are preserved. A miss or hit-preventing defense suppresses attached hit-dependent consequences. The Attack owns Skill/Roll, Initiative, range and resources; construction adds no Spell Skill, Mana or casting time. Form-only attacks remain excluded.

## 13. Creature Attack construction

Direct occurrences and persistent Creature NPCs both execute the exact frozen Attack construction through the same helper. Attack %, Initiative, approved range, target and defenses remain owner facts. Master edits after lock do not change the plan. Database cases preserve base + on-hit + construction as distinct effects and apply Damage, Healing, Condition and Modifier once; miss and successful Dodge suppress the attachment.

## 14. Creature Ability construction

Ability adapter output merges native Ability effects with separately keyed construction effects. Existing activation, resolution mode, Initiative, exact target set and explicit Ability Mana/resource cost remain authoritative. Fixed-roll constructed Damage uses the original Ability Roll for location/scaling. The regression retains three native effects plus four constructed effects and charges an explicit 2 Mana once, without a second Spell bill.

Outside the combat workflow, where no exact combat target context is supplied, attached construction outcomes remain visibly manual. Passive Ability reconciliation and persistent use/recharge ledgers were not added.

## 15. Item Magic parity

Existing canonical/custom construction resolution still uses the common adapter. Exact Item identity, required equipment state, activation Initiative and charge/quantity receipts remain unchanged. Fixed progressive power levels resolve through the existing Item contract. No normal Spell Mana or casting Initiative is introduced. Section 7 documents the deliberate repair to previously ignored construction scaling.

## 16. Interaction Rules

Constructed Damage enters the full Pass 1 incoming pipeline, including Requirements, Immunity, Resistance, Vulnerability, Absorption, typed Worn Armor and natural protection. Magical is an explicit source fact; Damage Type is independent per effect. Construction metadata is preserved in ordinary attack rider proposals so it cannot inherit a conflicting base Damage Type.

Explicit harmful Conditions/Modifiers use applicable Requirements/Immunity where their scopes and facts permit. Unknown harmfulness remains a ruling when it changes the result. Damage percentages do not become condition percentages. Beneficial Healing remains outside damage reduction. Public result summaries retain private-mechanics restrictions.

## 17. Manual and future-system boundaries

All class C families remain visible Manual G.O.D. outcomes; tests exercise every family. Class B without explicit runtime authoring also stays manual. There is no Summon ownership, map/position engine, forced equipment mutation, Counter effect picker, paired life-force transfer or transformation runtime. Existing voluntary movement/equipment/inventory services do not authorize those magical operations. No Forms, Evolution, Special Ability, Worlds, Creature passive lifecycle or use/recharge work was included.

## 18. Read-only catalog audit

The [machine-readable receipt](combat-magic-catalog-audit-2026-10-03.json) records a fresh transaction with `transaction_read_only=on` against **127.0.0.1 / serrian_tide_dev**. The script requires `--local-dev`, overrides the configured Production destination and verifies database/address/read-only identity before reading. It performs no data writes.

Scanned 742 Skill extensions, 30 Race Attacks, 64 Creature Attacks and 1 Creature Ability; Character saved Spell, Item construction and persistent Creature NPC tables had zero rows. Found **371 constructions, all structurally valid**, currently all in Skill extensions. **35 progressive documents** also have separately recorded tier counts, with no tier validation errors. Empty owner tables are an audit coverage limit, not a defect; those owner paths are exercised in disposable fixtures.

Across **828 base effect selections**, **92 execute natively** and **736 remain manual** in the unchanged catalog. Of the manual selections, **481** can use the new explicit Condition/Modifier authoring, **28 Healing selections in 26 documents** need Full Body/Area authoring, and **227** belong to future/manual families. **349 constructions** contain at least one manual effect. Automatic here means the adapter has an executable consequence; legal targets, range, Rolls, protection and application still govern execution.

No malformed construction was detected. This does not establish semantic completeness: unspecified Healing, absent class B runtime details and future-system effects are the explicit ambiguities above. The audit does not certify every prose description against structured scaling; no description was parsed or rewritten.

Practical author-review candidates include **Cellular Mend, Cellular Regeneration, Soothing Stream, Gentle Reprieve and Healing Chorus** for Healing Application; **Adrenal Surge, Ancestral Aegis, Bulwark Sigil, Arcane Lockdown, Astral Chains and Chains of Melancholy** for exact runtime effects. **Concordance of One Heart** has seven authorable class B selections and also retains other manual families. These are review candidates based on stored family selections, not inferred mechanics from their names.

## 19. History and idempotency

Each construction effect retains its original effect identity plus an owner namespace and exact target identity. Native Ability and on-hit effects use separate keys. Frozen source/tier, incoming evidence, original Roll, target selection, costs and application receipts survive retries and later master edits. Regression checks cover repeated declaration, planning, effect application, browser reload, costs, Health, Healing, Conditions/Modifiers, periodic schedules and expiry. No history rewrite or second construction Roll was introduced.

## 20. Tests and results

- **1,883 feature tests in 210 files passed**, including all Spell calculator/validator/codec/progressive, Item, incoming-effect, active-state, duration and new runtime-application/plan/privacy tests.
- **Complete disposable combat harness: 521 cases across all 30 scripts passed.** After adding one final Area Healing case and strengthening the separate-type assertion, focused reruns passed all **28 learned-Spell** and **59 Creature Attack** cases. The final suite therefore contains **522 cases**, all exercised successfully. Race Natural Attacks contribute **45 cases**. Pass 1-3 regressions are included.
- **35 selected combat browser workflow checks passed across two runs:** 26 completed checks cover seven Creature Attack flows, five Race flows, Character Spell/runtime effects, protection/privacy, ordinary attack location and the combined encounter; the final focused run passed seven Item workflows and both empty/selected Spell AoE workflows. The earlier broad process stopped on a stale Item report label; after correcting it, the focused Item run exposed the intentional Per Success quantity change described in section 7. Expectations now test that quantity and use explicitly fixed authoring for the automatic Item fixture. No browser console errors were recorded in the resulting receipts.
- **Spell authoring browser passed:** Modifier save, Condition save/reload, harmfulness, construction duration, Damage Types, progressive inheritance and unchanged construction calculations. **Creature authoring/NPC browser plus 21 database cases passed. Item authoring browser passed**, including pending edits, failed creation/retry and phone layout.
- **Next route generation, TypeScript, full ESLint, Drizzle metadata and whitespace checks passed.** Final test-only typing corrections and range-label text were followed by another typecheck, focused bridge tests and changed-file lint, all passing. No new migration was generated.
- Visually inspected Spell authoring desktop/phone and the narrow Creature Magic combat result. The Spell editor's existing horizontal overflow remains (477px content within 364px available, unchanged by hiding Damage Type controls); this pass does not claim a complete mobile editor redesign. The new runtime fields render in the shared editor.

Local evidence is retained under ignored `artifacts/guidance/magic-pass4/` (logs and combat screenshots/JSON), `artifacts/guidance/spell-damage-types/`, and `artifacts/creature-authoring/`. Earlier failed development runs are retained as history; use `magic-pass4-units-final.log`, `magic-pass4-full-db.log`, the final learned/Creature logs, the 26-check `magic-pass4-regressions` receipt and the nine-check `magic-pass4-items-final` receipt for the results above.

The requested 54-scenario matrix is covered by these concrete suites:

| Requested cases | Evidence |
| --- | --- |
| 1-5 Skill/Roll, costs, failure and retry | `combat-completion-spells-db.test.ts`, `combat-completion-learned-spells-db.test.ts` |
| 6-15 Damage/Healing/type and full protection | Those Spell suites; `pass5-runtime-db.test.ts`, `incoming-effect-target-db.test.ts`; new Full Body/Area Healing fixtures |
| 16-19 Multi-Target, confirmed/empty AoE and limited range | Spell target-group units; Spell database suites; new Short/Medium/Long/forged-evidence cases; combat browser areas |
| 20-23 Concentration, scaling and progressive replacement/addition | Calculator/progressive units; `runtime-application.test.ts`; learned Spell database variants |
| 24-27 lifecycle, explicit Modifier/Condition, manual effects | Runtime-application units; `combat-completion-effects-db.test.ts`; new Creature attachment expiry and learned Spell cases |
| 28-42 attached source parity, types, native/on-hit separation, miss/defense, history and no second cost | `combat-race-natural-attacks-db.test.ts`, `combat-creature-attacks-db.test.ts`, attachment/bridge units and new Race/Creature combat browser flows |
| 43-47 exact Item costs, construction, retries and no second Spell bill | Item units; `combat-completion-items-abilities-db.test.ts`, `pass5-runtime-db.test.ts`; seven Item combat browser workflows |
| 48-54 representative manual families | All 30 effect families exercised in `runtime-application.test.ts`; manual-result/privacy unit and shared manual planner regressions |

## 21. Remaining before Pass 5 acceptance

Brannan/Ember still need hands-on review of representative authored Magic, range rulings, attachment results and the original-base progressive cost contract. Existing catalog Spells require explicit authoring before class B/unspecified Healing effects become executable. This pass does not approve that data authoring or perform it.

Prior Pass 2 migration `0092_race_natural_attack_runtime` still requires separately authorized shared-environment application; this pass adds no schema change. Validation uses disposable databases plus the read-only local DEV audit. No Production or shared catalog/Character data was changed, and no deployment or production build was performed. Automated browser/service checks are not human acceptance. Stop after the local commit: **no push and no automatic Pass 5**.

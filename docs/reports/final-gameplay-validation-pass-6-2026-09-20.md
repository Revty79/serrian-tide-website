# Pass 6 — Final gameplay validation and acceptance

Base: `21e20ae33f9795e9961c130a3ab96f8b800b2b88`. Commit title: **PASS 6 — FINAL GAMEPLAY VALIDATION AND ACCEPTANCE**. The final commit hash is reported with the delivery; this report belongs to that commit.

## 1. Outcome and scope

The accepted systems were exercised together through persisted combat services and authenticated G.O.D./Player screens. This is automated gameplay rehearsal, not a claim that Brannan or Ember completed human acceptance testing.

Only Player privacy projections and result wording changed in application code. Damage, protection, Roll, Initiative, resource, response and catalog mechanics remain the accepted Passes 1–5 implementations. No schema changes, catalog mass edits, legacy conversion, live Character changes or deployment. Harvest & Utility remains unchanged. No subsequent architecture phase was started.

## 2. Defects and intentional behavior changes

| Defect | Cause | Correction | Regression evidence |
| --- | --- | --- | --- |
| A resolved incoming-effect ruling exposed its private G.O.D. reason to the Player. | The Player projection hid the reason only while `godReviewRequired` was true; resolving the ruling cleared that flag. | Effects with a recorded incoming ruling show a public acknowledgment. Embedded ordinary-ruling notes are removed from the Player's final-value projection. | The real Player-read regression failed before the fix and passes before and after application; a focused test preserves public amount/location and confirms the stored object is unchanged. |
| A targeted Player received private Creature attack requirements and special-effect prose. | Redacting `authoredData` left copies inside frozen source effect instructions and the consequence's authored source. | Non-owning Player projections omit source instructions, costs, warnings and authored-source copies. Owners retain their authorized source data. | A real Creature-to-Player action exposed four exact nested paths before the fix; the regression now finds none. Legacy evidence without incoming fields is covered too. |
| Normal result explanations displayed internal stage keys and made the original damage less obvious. | The component rendered `source`, `worn`, etc. directly. | Plain-language stage names, an explicit incoming-damage amount, and “G.O.D. Ruling Required.” Advanced frozen evidence stays collapsible. | Authenticated combat browser and narrow result/ruling review. |

Those are the complete intentional application behavior changes. No tabletop precedence was added. Test fixture corrections during development addressed missing anatomy order, distinct Race/Creature CR metadata, exact firearm distance mode, explicit no-response/no-Roll paths, disclosure-control state and a construction-backed Item fixture that needed its accepted Magical flag; none changed production mechanics or weakened existing combat expectations.

## 3. Validation totals

| Validation | Result |
| --- | --- |
| Full feature suite | **1,568 tests / 175 files**, zero failures or skips |
| Full disposable combat service harness | **388 tests / 28 scripts**, zero failures or skips |
| New Pass 6 gameplay service matrix | **75 tests**, included in the 388 |
| Firearm/projectile service suite | **69 tests**, included in the 388; 18 new inheritance cases and one added Immunity case |
| Full combat browser | **60 workflow checks**, zero browser runtime errors |
| Creature/Race/NPC authoring browser and migration compatibility | **26 named checks**, additional Use Condition/protection save assertions and pre-migration compatibility; zero browser runtime errors |
| Derived Use Condition authoring browser | **3 workflow checks / 12 saved conditions**, zero browser runtime errors |
| TypeScript / changed-file ESLint / production build | Passed |
| Drizzle metadata check | Passed; existing migrations also applied to fresh disposable clusters with journal count checks |
| Diff checks | Passed |

Commands: `node scripts/run-feature-tests.mjs`; `node --import tsx --test scripts/combat-completion-disposable-db.test.ts`; the `combat-screens-disposable-browser`, `creature-authoring-disposable` and `derived-use-conditions-disposable` test scripts; `tsc --noEmit`; changed-file `eslint`; `next build`; `drizzle-kit check`; `git diff --check`. Logs are local under `artifacts/creature-authoring/pass6-*.log`. Selected review evidence is committed under `artifacts/combat-screens/pass6/`.

## 4. Combined mock combat

One encounter contains Rowan (Player Character), Sentry (Creature NPC with an individual snapshot, worn helmet, Natural Armor/Soak and a Magical Requirement), and two direct Creature occurrences using negative participant keys. Rowan's Race supplies Slashing Resistance. One direct Creature requires Magical attacks; the other absorbs Magical damage. All of these coexist from initial setup; rules are not swapped between turns to manufacture the outcomes.

1. Rowan commits an ordinary sword attack against Sentry while a direct Creature commits its authored attack against Rowan. Sentry's authored Reaction appears as an eligible choice without spending Initiative. At its actual opportunity, the G.O.D. chooses no response.
2. Rowan's 11 incoming damage loses 1 to the worn helmet, then fails Sentry's Magical Requirement. No damage is applied. The frozen evidence retains Sentry's individual Natural Armor 2 and Natural Soak 1; those later stages are skipped after prevention.
3. The direct Creature attack uses authored base 4 plus the accepted 2 extra-success damage. Rowan's 25% Race Resistance reduces 6 to 4.5, rounded up once to **5 Head damage**. There is no Character attribute bonus on the direct Creature source.
4. The G.O.D. freezes combat, reloads for inspection and resumes through the real controls. The saved effects, amounts, statuses and resolver evidence remain identical.
5. Rowan casts a learned Spell against the absorbing direct Creature. Construction establishes Magical=true. The calculated damage becomes **4 healing** to its exact incoming Body pool. Mana is spent once; subsequent actions leave the remaining Mana unchanged.
6. Rowan fires the exact loaded pistol at the other direct Creature after the exact target/weapon/mode/distance ruling. Projectile Magical inheritance is unknown, so its Requirement stops for a G.O.D. ruling. The G.O.D. explicitly assigns **2 damage to this shot**; the original unresolved calculation remains stored. Retrying fire returns the original Roll.
7. Rowan activates Watcher's Mark. Its existing automatic mode requires no Roll. One condition and one Derived use receipt are recorded. The encounter has five completed action plans and four Rolls.
8. The G.O.D. uses normal combat closeout and awards Rowan 2 explicit encounter XP, taking 12 to 14. All five plans remain unchanged; the Player returns to Tabletop.

The encounter uses real transactions for action choices and consequences, with authenticated screen inspection after each phase and actual Freeze/Resume and closeout controls. Other full-browser scenarios exercise the source-specific selection/commit controls directly. This distinction avoids representing service-driven rehearsal as five entirely mouse-driven actions.

## 5. Protection layers and authority

The new matrix covers normal Player Characters, Race NPCs, Creature NPCs and direct Creatures. Character identities each exercise no protection, Worn only, Natural only, Temporary only, Worn + Natural, and Worn + Natural + Temporary. Direct Creatures exercise their supported no-equipment combinations. Creature NPCs use Character equipment plus their individual Creature snapshot; edited master rules do not replace that snapshot. Direct occurrences use encounter snapshots and no fabricated inventory.

Every result asserts the six stages: **Source qualification → Worn → Interaction Rules → Natural → Temporary → Final**. For a gross 6, the Worn 1 + Natural 2 + Temporary 1 fixture applies 2, including for a Creature NPC. Separate assertions inspect actual layers and source identities. Protection is neither doubled nor collapsed into an unexplained total.

Multiple covering worn sources and multiple Race Natural Protection definitions retain both exact sources/amounts and require a ruling. Armor metadata such as `Fire +2` stays text and produces an explicit ruling boundary. Normal/called locations, Character/Creature anatomy and exact coverage remain covered by the existing location, damage, limb and firearm regressions.

## 6. Interaction Rules

- **Requirements:** 20 real weapon-plan combinations cover Silver, Magical, ANY, ALL and independent Requirements against Steel/Silver and mundane/Magical sources. Magical Steel still fails Silver. Separate Requirements remain independent gates. Accepted decisive-prevention regressions retain failed Requirements before irrelevant downstream uncertainty.
- **Immunity:** damage, condition and mechanical-effect matching, Resistance/Vulnerability prevention and potential Absorption conflicts run in the full resolver suite; firearm Immunity is additionally checked on each of three bullets.
- **Percentages:** real plans cover multiple Resistances, multiple Vulnerabilities, mixed percentages and values above 100. Ordered multiplication, exact intermediate values, Resistance flooring to zero, uncapped Vulnerability and one final upward rounding remain intact.
- **Absorption:** pure checks include 6 × 50%=3, 6 × 100%=6 and 10 × 150%=15. Real plans exercise 50/100/150%, same-pool healing and HP caps under retries. A Character case proves Worn 2 reduces incoming 6 to 4 before 50% converts it to 2 healing; large natural/temporary values are skipped.
- **Unresolved Absorption:** all four conflicts (Immunity, Resistance, Vulnerability, another Absorption) retain candidates and original trace. Twelve real-plan cases explicitly rule damage, healing or prevention and apply repeatedly without changing the original evidence. The existing non-damage ruling and location paths remain covered.
- **Non-damage effects:** authoritative harmful effects obey Requirements/Immunity. Unknown harmfulness only blocks when it can affect a relevant rule; ordinary condition/modifier effects without that uncertainty remain usable. No universal harmfulness classification was invented.

## 7. Attack and source families

| Family | Evidence and result |
| --- | --- |
| Ordinary weapons | Existing screen/service suites cover melee without distance, ranged bands, called shots, Aim where supported, defenses, critical results, additive Weapon-Hit damage, periodic riders, zero damage, fatal damage and repeated application. The combined encounter shows a prevented ordinary hit alongside the other systems. |
| Direct Creature attacks | Actual plans cover Character, Creature NPC and direct Creature targets. Base damage has no Character STR/DEX/source modifiers; accepted Roll extra-success damage remains. Editing the encounter attack after lock leaves that action unchanged; the next action sees new damage/Magical facts. |
| Creature NPC attacks | Existing Pass 5 source tests and the new target matrix preserve the individual snapshot, Character runtime identity, worn equipment and Creature natural protection. No fresh master substitution. |
| Firearms | 69 service cases retain Single/Burst/Sustained, independent bullets, ranges/Beyond Long replacement, Aim/called shot, exact ammo, magazine contents, cycling/recoil, Weapon-Hit effects, interruption, Freeze, retry and closeout. Resistance, Absorption, Immunity and an unknown Magical Requirement are resolved per bullet. |
| Bows / crossbows | Their accepted release/loading/Aim/called-shot behavior remains covered. Eighteen actual shots across Handgun/Bow/Crossbow place Silver, Magical or a tag on either weapon or ammunition. All retain unknown projectile facts and stop for a relevant Requirement; none inherits a launcher fact accidentally. |
| Spells / AoE | Learned/canonical casts, per-target plans, explicit zero targets, multiple victims, conditions/modifiers, Magical Requirements, percentage interactions and Absorption use existing Spell Construction and Mana services. The mock cast heals one exact target and does not spend Mana again on subsequent actions. |
| Item Abilities | Existing suites cover structured mundane/Magical effects, construction-backed powers, targeted damage, conditions, charges/consumption and retries. Both custom and canonical invalid mundane construction-backed Items still fail at lock; valid actions retain frozen Magical facts. |

## 8. Abilities, facts and agency

Activated, Triggered, Reaction and supported Passive Derived behavior retain the existing ownership/use/recharge ledger. Full feature and service suites cover round/encounter/scene/never limits and explicit recharge records, Initiative, Mana and actual use receipts. Four concurrent commits return one pending action; four concurrent plan requests return one plan; four concurrent applications produce one condition and one receipt. A new HP-gated passive case activates around 70%, ends around 40%, restores above 50%, and preserves established state when the fact becomes unknown.

Creature Activated effects, Triggered/Reaction opportunities, authored positive Initiative, NPC Mana and Passive activation rejection remain covered. New real-plan cases prove the Creature NPC spends its authored 2 Spellcraft Mana once under commit/application retries, while a direct Creature resource cost and persistent use limit stop with explicit G.O.D. boundaries. Previewing a response spends nothing. The Player controls their Character; the G.O.D. controls NPC/direct Creature choices. Unsupported direct resources and persistent Creature limits remain explicit manual boundaries, with no new ledger or passive lifecycle.

The three automatic Events still come only from real server response windows: `combat.action-declared`, `combat.attack-declared`, `combat.attack-targeted`. Fake Player Events fail; custom events require the existing explicit G.O.D. record. Real Equipment facts cover general worn/wielded and exact owned/worn/wielded/equipped Items; known direct-Creature equipment facts are false. State facts use authoritative HP, max/percentage, Initiative, round, movement, Dead, Incapacitated and exact active conditions. Unknown stays manual; explicit false stays false. Numeric comparisons, exact text equality/inequality and both presence operators are tested; no prose inference or speculative Events were added.

Hold, simultaneous declarations, overlap, independent free-combatant actions, responses and no-response choices run through the unchanged combat regression suites.

## 9. Historical truth, freezing and resource conservation

Old plans without incoming source facts/resolution/target evidence remain readable and apply stored values after live target changes. Legacy Creature/NPC snapshots and pre-migration authoring survive; no old plan is rewritten. Weapon properties/Magical, Creature attacks, Spell definitions and costs, target Race rules, natural/worn protection and temporary state use their accepted freezing boundaries. Retrying an existing plan preserves its original evidence; subsequent actions see new live facts.

The full harness retains exactly-once checks for lock/commit/Roll/plan/approval/application, Initiative, Mana, ammunition/magazines, charges, consumed quantity, Derived receipts, HP, healing, conditions/modifiers, XP and closeout. It includes real concurrent writes and Freeze/declaration races, not only sequential retries. New mechanics also coexist with Freeze/Resume in the combined encounter. Authorization checks include unauthorized ruling and foreign-source projection tests.

## 10. Screen and mobile review

The G.O.D. sees original damage, named stages, rules, candidates and preserved trace without opening raw JSON. The Player sees a public outcome and its own authorized source details, without the reproduced private source/ruling leaks. Both views are reviewed at 390px in the combined encounter; existing narrow cases cover result/ruling and Reaction choices. Creature Interaction Rules, Creature/Derived Use Conditions and Race Natural Protection run through their authoring browser checks, including saves and preserved legacy values. No new palette or broad UI redesign.

## 11. Open tabletop decisions for Brannan

These are game-design questions, not unfixed implementation defects:

1. **Weapon and ammunition facts:** which source supplies Magical, Item Properties and Tags? Example: does a Silver bow make an ordinary arrow Silver, or does only the arrow matter?
2. **Absorption precedence:** what happens with Immunity, Resistance/Vulnerability or multiple Absorptions? Example: should a Fire-immune target with 50% Fire Absorption receive no effect or healing?
3. **Overlapping worn armor:** how do two covering pieces combine? Example: helmet Soak 2 and hood Soak 1 on the same Head hit.
4. **Overlapping Race natural protection:** do overlapping definitions stack or replace one another? Example: general hide Armor 2 and Head scales Armor 4.
5. **Armor damage-type modifiers:** what does an authored modifier mean and when does it apply? Example: does `Fire +2` increase Soak, alter damage, or mean something else?
6. **Harmfulness of non-damage effects:** which conditions/modifiers are harmful? Example: is Marked harmful, beneficial or dependent on the specific effect?
7. **Creature passive lifecycle:** when should a passive start, end and restore? Example: should an aura persist through incapacitation or leaving the scene?
8. **Creature limits/recharge/resources:** what persistent model should govern them, especially for direct occurrences? Example: what records a once-per-scene breath weapon and restores it next scene?
9. **Additional supported facts:** which concrete Events/State/Equipment facts should become automatic? Example: should “an ally falls nearby” be a supported event with defined range and timing?
10. **Should direct Creature complete damage still receive extra-success Roll damage?** Example: should an authored Bite 4 with two extra successes deal base 4 or 6? Current accepted behavior remains 6 before protection.

No unresolved tabletop question was silently decided. Catalog costs, Skill mappings, individual rule/protection authoring, legacy defense conversion and Creature Ability backfill remain separate content work. Stop after this pass for Brannan/Ember review; no Pass 7.

## 12. Exact changed files

Application code changes are limited to three files; the rest are regression coverage, this report/handoff and review evidence. The machine-readable validation summary contains all 28 service-script totals.

```text
COMBAT-RESUME.md
artifacts/combat-screens/pass6/creature-authoring-results.json
artifacts/combat-screens/pass6/creature-use-conditions-phone.png
artifacts/combat-screens/pass6/derived-authoring-results.json
artifacts/combat-screens/pass6/derived-boolean-narrow.png
artifacts/combat-screens/pass6/interaction-rule-phone.png
artifacts/combat-screens/pass6/pass5-conflict-narrow.png
artifacts/combat-screens/pass6/pass5-response-narrow.png
artifacts/combat-screens/pass6/pass6-player-6.png
artifacts/combat-screens/pass6/pass6-walkthrough-2.png
artifacts/combat-screens/pass6/pass6-walkthrough-4.png
artifacts/combat-screens/pass6/pass6-walkthrough-5.png
artifacts/combat-screens/pass6/pass6-walkthrough.json
artifacts/combat-screens/pass6/race-natural-protection-phone.png
artifacts/combat-screens/pass6/results.json
artifacts/combat-screens/pass6/validation-summary.json
docs/reports/final-gameplay-validation-pass-6-2026-09-20.md
scripts/combat-completion-disposable-db.test.ts
scripts/combat-completion-firearms-db.test.ts
scripts/combat-completion-spells-db.test.ts
scripts/combat-screens-browser.ts
scripts/pass5-runtime-db.test.ts
scripts/pass6-gameplay-db.test.ts
scripts/pass6-gameplay-walkthrough.ts
src/features/combat-screen/incoming-effect-evidence.tsx
src/features/incoming-effects/effect-proposal.test.ts
src/features/incoming-effects/public-evidence.ts
src/features/tabletop-operations/player-tabletop-console-service.ts
```

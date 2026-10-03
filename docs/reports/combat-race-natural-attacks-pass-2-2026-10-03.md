# Combat Runtime Completion Pass 2: Normal Race Natural Attacks

Base commit: `99df181802672d65635b47aa24d63eada2d47a8e`.

Normal Race Natural Attacks are selectable attacks in the existing Player and G.O.D. combat screens. This pass uses the saved Race definitions and the existing Character Skill, declaration, Roll, defense, consequence, protection and Health services.

1. **Runtime identity.** The dedicated source kind is `race-natural-attack`. Its exact reference is `race:<Race ID>:attack:<URI-encoded stable attack key>`. The locked source includes participant identity, Race ID/name, saved attack definition, intended Skill definitions, actual governing allocation/Attribute snapshot, authored timing/range/damage/type/Magical/anatomy/effects/construction, Race revision and lock timestamp. Bounded source validators, incoming facts, effect plans and reports recognize this kind. Migration `0092_race_natural_attack_runtime.sql` adds one enum value; previous source kinds and records retain their meanings.

2. **Current Race ownership.** The reader joins the exact Encounter participant to its Campaign Character and current Character Race profile. Only `npcKind = race` supplies these sources. Lock and commitment recheck the current Race and attack key. Direct Creature occurrences, Creature NPC mechanics, another Race and Form-only definitions supply no Normal Race attacks. The runtime never reads preview Form selection.

3. **Skill and fallback.** Canonical parent paths pass through the existing `resolveCharacterSkillLineageOptions` implementation. Saved allocation IDs, parent allocation lineage, Rank/target calculation, owned parent/root and Attribute fallback remain authoritative. The attack does not create an allocation. Campaign purchase exclusions do not remove an inherent Race attack.

4. **Ambiguity.** Automatic governance requires the canonical alternatives to resolve to one exact governing source. Distinct valid sources, missing/unresolved or archived intended Skills retain a G.O.D. ruling boundary. No highest-value selection or invented target occurs. A source-specific ruling chooses an existing exact allocation/Attribute or an explicit manual source supported by the existing service. Changed attack or injury evidence invalidates the old ruling for future locks. The combat screen provides G.O.D. Attack source rulings for a Player without giving the G.O.D. control of that Player's action.

5. **Initiative.** Positive finite authored Initiative is authoritative. Missing timing requires an explicit source ruling; Creature timing heuristics are not used. Existing affordability, transaction and retry receipts prevent insufficient commitments or duplicate spending. Natural Attacks consume no ammunition, firing modes, recoil or invented resources.

6. **Modes and range.** Melee requires a measured distance within authored Reach. Ranged uses the existing Short/Medium/Long adjustments and explicit Beyond Long ruling. Hybrid requires a melee/ranged choice and preserves both possibilities. Player ranged distance approvals bind the exact source definition, Character, target, distance and unit, and are consumed once. AoE requires a G.O.D.-confirmed participant set; Notes never supply geometry. Each AoE target retains an explicit damage/defense outcome boundary. Ordinary single-target defenses and Called Shot infrastructure are reused. A single Dodge/Block/Parry cannot automatically resolve an entire AoE.

7. **Anatomy.** Required canonical HP pools and location numbers must exist in current Normal Race anatomy. Existing unrecovered structured limb-incapacitation facts block required parts. Anatomy Notes and injury prose do not execute. Damage or unresolved injury evidence associated with a required part, without a structured usability fact, requires a recorded G.O.D. usability ruling. Damage totals do not independently assert that the part is unusable. Changed injury evidence between lock and commitment requires preparation again.

8. **Damage and successes.** The ordinary attack consequence service handles direct numeric base damage plus the established Roll extra successes, success/failure/critical boundaries and authoritative hit location. Unsupported expressions keep an explicit ruling. There is no Race-specific damage parser or additional inferred Attribute damage bonus.

9. **Pass 1 protections.** Natural Attacks enter the shared incoming pipeline: Worn Armor and typed modifiers, target Interaction defenses, Creature Natural Armor/Soak or Race Natural Soak, temporary Soak, then Health. The approved 20 Fire example produces 5 damage after Worn 4 + Fire 2, 50% Resistance and Race Soak 2. Mixed/unresolved type distinctions retain the same ruling boundary. No duplicate armor calculation was added.

10. **Magical facts.** Explicit Yes, No and Unspecified remain distinct. An attached construction establishes Magical. Damage Type remains a separate frozen fact. Race Base Magic, names and prose do not determine Magical status. The facts drive Requirements, Immunity and percentage protections through the shared resolver.

11. **On-hit effects.** Supported authored Health damage, conditions and modifiers enter the existing effect planner/application path with the exact target and resolved location. Misses and preventing defenses decline riders. Effect receipts prevent repeat application. Manual and other unsupported effect applications remain visible G.O.D. boundaries.

12. **Attached Magic.** The full saved construction is frozen and contributes Magical identity. Its construction effects are explicitly deferred and are not translated or executed. Separately authored on-hit Mechanical Effects may execute.

13. **Authorization and presentation.** Players use their own Character's current Race attacks; Campaign-owning G.O.D.s use Race NPC attacks and supply authorized rulings. Existing Encounter/Character checks remain in force. The Attack selector and preview show name, intended Skill/basis, target or ruling status, cost, mode/range, damage/type, Magical status and availability reasons. No raw JSON is added to the combat screen. Race/Character reference and print views retain their existing behavior.

14. **History and retries.** Committed definitions, governing evidence and Rolls are frozen. Target protection evidence freezes when the consequence is calculated; existing plans retain their historical results after later source or target edits. Repeated command, commitment and effect requests reuse existing receipts. The legacy direct authored-action resolver rejects this source rather than bypassing the declaration/protection plan.

15. **Verification.** Final results are recorded below. Test data uses freshly migrated disposable localhost PostgreSQL clusters and synthetic authenticated browser accounts. The migration has not been applied to a shared DEV or Production database. Production data was not modified.

16. **Future work.** Full attached Attack Magic execution belongs to the later Magic Combat pass. Forms and Form attacks/anatomy/protection, Evolution, Special Abilities, companions, full Spell expansion and Creature Ability lifecycle remain outside this pass. AoE geometry and ambiguous anatomy remain explicit rulings. Human Player/G.O.D. acceptance remains outstanding. Do not start Pass 3, push, deploy or migrate a shared database automatically.

## Verification results

- **Feature/unit:** 1,831/1,831 tests across 208 files; no failures or skips.
- **Combat DB:** 451/451 service cases across 29 scripts, including the existing 408 cases and 43 new Natural Attack cases. The final focused 43-case rerun also passes. This reruns the Pass 1 protection cases. The full harness budget increased from four to six minutes after an otherwise passing execution exceeded its wrapper timeout; the final wrapper completes successfully.
- **Actual browser:** four Natural Attack flows pass: Player melee, owning G.O.D. Race NPC, Player ranged with approved distance, and Player action after G.O.D. supplies missing Skill/timing. The first three are included in the successful 15-check broader run; the final ruling-only run adds the fourth. The 12 other checks cover the combined encounter walkthrough, normal attack/rider locations and prior Requirement/Resistance/Absorption/conflict flows. Desktop and 390px screenshots were inspected; horizontal-overflow and reload assertions pass, with no recorded browser errors. The tests exposed and corrected the G.O.D. Attack ruling menu and accessible select labels.
- **Static checks:** Next route type generation, TypeScript, full ESLint and whitespace checks pass.
- **Migration:** Drizzle metadata check passes; generation reports no schema drift. Snapshot comparison changes only the source enum plus snapshot IDs. Both guarded disposable harnesses apply all 93 migrations and compare the ledger count with the journal. Shared migration-ledger verification was blocked by its loopback guard before connection; the shared database was not queried or migrated.
- **Scope of proof:** automated Chromium workflows and disposable data only. Human acceptance, other browsers, production build/deployment and shared migration application were not performed.

Local evidence is under `artifacts/guidance/combat-race-attacks-pass-2/` (ignored diagnostic artifacts). Final receipts: `unit.log`, `full-db.log`, `natural-db.log`, `browser.log`, `ruling-browser.log`, `typegen.log`, `typecheck.log`, `lint.log`, `drizzle-check.log`, `schema-drift.log`. Successful browser JSON receipts are `browser/results-race-natural-attack_pass5-incoming_attack-location_pass6-walkthrough.json` and `browser/results-race-natural-attack-ruled-player.json`. Intermediate failed browser attempts remain diagnostic history; the cited final receipts establish completion.

## Scenario coverage

The new disposable service file is `scripts/combat-race-natural-attacks-db.test.ts`, registered in the full combat completion harness. Its synthetic Race fixture also drives the browser cases.

| Requested scenarios | Evidence |
| --- | --- |
| 1-6: own Race, other Race, Race NPC, Creature exclusion, Forms, anatomy | Exact source-reader and lock checks; Player/Race NPC browser flows; missing pool/location and structured incapacity cases. |
| 7-10: trained Skill, fallback, ambiguity, missing Skill | Exact saved allocation/Rank, owned parent, Attribute, conflicting paths, missing Skill and G.O.D. ruling tests. |
| 11-15: Initiative, affordability, Roll, successes, retries | Authored/missing timing, insufficient Initiative, hit/miss, one Roll/commit/application receipts and browser reload assertions. |
| 16-22: protections and exact Health location | Worn and typed strength/weakness, Resistance/Vulnerability, Race Soak, Creature Armor/Soak, Requirements/Immunity and exact pool damage. |
| 23-28: Magical and effects | Yes/No/Unspecified Requirement cases, independent Fire/Magical facts, condition application once, miss-declined rider, manual rider, frozen deferred construction. |
| 29-32: modes | Reach rejection, all three ranged bands, both Hybrid choices, exact AoE target confirmation and per-target manual outcomes. |

Additional checks cover Campaign Skill exclusion, source/Race changes, malformed damage and mixed types, forged ranged modifiers, consumed distance approvals, ordinary Dodge and approved Called Shots. The normal unit suite covers Race authoring, Skill/governance, declaration/source, incoming effects/protections, defense and Active Health/injury regressions.

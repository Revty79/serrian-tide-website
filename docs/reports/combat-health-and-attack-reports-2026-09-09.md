# Combat health and attack reports

Brannan reported that dead actors were still being offered actions, requested automatic limb incapacity and condition alerts, clarified Slime's whole-body thresholds, and asked to reduce repeated attack approvals.

## Health and notifications

The [head clarification](../rules/combat-head-health-clarification-2026-09-09.md) and [limb/whole-body clarification](../rules/combat-limb-and-body-health-clarification-2026-09-09.md) extend the existing damage, condition, recovery, and projection services. Whole-actor death/incapacity suspends agency; a disabled limb retains separate local state and does not disable unrelated actions. The G.O.D. receives condition alerts for every actor; each Player receives their own Character's alerts. Acknowledgements survive reload in that browser session and do not clear the underlying condition.

## Ordinary attack review

With Automatic flow enabled, existing services advance timing and resolve recorded defenses, then prepare an ordinary Weapon or Creature Attack result without applying damage. The G.O.D. sees one report above the roster: actor, target, source, original Roll, outcome, exact location, damage, and the recorded calculation. **Approve & apply attack** uses that exact plan and the normal consequence executor. It updates HP and conditions together, with normal retry receipts.

Routine damage does not require a typed approval reason. Location/damage changes and unresolved rules expose their fields in that same report and require a specific reason. Unsupported damage stays unknown and cannot be approved through an empty location-only ruling. A changed report must be reread before approval; a failed application remains visible with its error and a retry control. Misses and fully prevented hits retain automatic no-effect completion and clearly say no damage was applied in activity.

Defense choices now preview their costs and Roll requirements automatically. Awareness decisions, Players' own responses, simultaneous choice privacy, exceptional defense rulings, firearm bullet allocation, and special source rules retain their owning services and authority. No tactical choice is inferred from enabling Automatic flow.

## Slime 1 diagnosis

A read-only inspection of the current loopback development test found Slime 1 in Encounter 6 with 105 Body HP and zero accumulated damage. Its frozen armor and soak fields were null at all ten Body locations. Declarations 36 and 37 retained unsupported damage proposals; location rulings did not supply final damage. Their histories then recorded effect declines and completed with no applied damage receipts. This explains both the missing HP change and the repeated approval controls. No campaign state or historical receipts were changed by the diagnostic reads.

The report now makes missing damage explicit and distinguishes a declined effect from applied damage even when the saved ruling reason says "approved". Brannan subsequently clarified that no armor/soak blocks no damage. Ordinary and firearm resolution now share that interpretation: blank protection is 0; authored numbers still apply, and malformed protection stays unresolved. The current in-progress Slime attack has no existing effect plan, so its result will use the corrected calculation when timing completes. Previously declined attacks remain historical decisions and were not replayed.

## G.O.D. force-end override

Brannan requested an absolute G.O.D. override to end combat. The header now offers **Force end combat**, including during Freeze and unrevealed simultaneous declarations. One confirmation closes the encounter and its Initiative runtime, cancels unfinished declarations, responses, effect plans and firearm preparations, and permanently withdraws unrevealed choices. An optional note and the affected record IDs are retained in the lifecycle audit. Applied damage, recorded Rolls, spent Mana/ammunition, and Initiative debt are not refunded or recalculated; the override awards no XP. Owner authorization remains required, and repeat submissions reuse the completed result. It also works before Initiative initialization.

## Outstanding magic and firearm walkthrough

Subsequent spell-Skill/success/scaling clarifications and the full catalog/editor audit are recorded in the [human-testing readiness report](combat-human-testing-readiness-2026-09-09.md). The diagnosis below describes the original blocker; learned-spell integration and AoE reporting are now implemented as described in the next section.

Brannan reported that magic and firearms did not offer a Roll, and intends to walk through combat from the human perspective, explaining the expected behavior at each failure. The initial health/report changes did not fix these source/setup blockers.

The Spell source resolver previously set every ordinary Spell to `manual-god-ruling` with no governing source until an encounter-specific ruling was recorded. The screen consequently hid its Roll controls. The earlier browser fixture pre-recorded an explicit no-roll source ruling, so its successful cast did not establish that the normal spell selection-to-Roll experience worked.

A read-only inspection also found Ysra's wielded Heavy Crossbow routed into the firearm workspace because it has an ammunition relationship and firing mode. That instance has no firearm runtime state; its Single mode has null cycling, recoil, cadence and rounds values, and is marked review-required. This explains a concrete setup blocker without establishing which gun or spell Brannan intends to demonstrate. No catalog values, casting rules, or current encounter state were invented or changed during this diagnosis.

## Learned spells and temporary AoE completion

The resolver now uses the exact owned catalog spell Skill's calculated percentage. The Player sees its Roll controls without a routine source ruling; saved documents without a learned spell Skill explain why they cannot be cast in combat. The existing casting engine still owns Mana and Initiative. Success counts use the shared percentile resolver; per-success and static quantities retain their authored scaling.

Ordinary damaging spells derive their hit location from the original Roll's ones digit and the target's authored anatomy. Browser-supplied locations cannot replace that result. A single spell report shows the Roll, total successes, damage/location/effects and scaling before one approval applies the result. Existing specific rulings remain for unsupported effects and exceptional direct outcomes.

For AoE, the caster chooses no individual occupants. The engine calculates a report for each authored area effect, waits for casting time, then records it and resolves the action automatically. G.O.D. and the caster see the area and calculated damage in Recent activity. No combatant HP or effects are applied by the report. Failed and critical AoE Rolls complete too; the report records the outcome without inventing extra critical effects. Mapped area membership remains deferred.

The service tests cover exact Skill ancestry, fixed/per-success/failed effects, automatic locations, refusing an unlearned spell, failed/critical area reports, and one-time Roll/Mana/application on retries. The updated browser fixture uses an actual learned spell without a source ruling. Its normal cast stops for one report approval; its AoE cast completes automatically, reports 8 damage in a 10-foot radius, and preserves every combatant's HP and conditions through reload. The previous revival fixture now supplies its missing canonical parent relationship so it also has a valid owned spell Skill.

## Validation

- Final spell/AoE integration: all **140** disposable combat service scenarios and **1,286** feature tests passed. Both learned-spell and AoE browser cases passed with no page errors; the result reports were visually inspected. Typecheck, production build, Drizzle check and the normal repository whitespace check passed. The production build required network access for the project's existing Google Fonts. Cleanup removed obsolete failure artifacts and excluded generated browser builds/artifacts from ESLint; the full `npm run lint` command now passes.
- Full disposable combat completion suite: 133 service scenarios passed, including nine new limb/whole-body cases, PC/NPC/direct-creature head cases, absent-protection ordinary/firearm damage, and four force-end cases.
- Disposable browser case `attack-report-alerts`: an actual Player attack stops before HP changes; one report approval incapacitates the whole-body creature; subsequent NPC limb/head hits alert both roles live. Player acknowledgements survive reload, current limb status remains visible, and unacknowledged G.O.D. alerts survive reload. Desktop and narrow screenshots have no horizontal overflow.
- Focused browser cases `awareness`, `overlap`, and `automatic` passed: automatic defense previews retain the Player's response choice, critical hits wait for their own completion and ruling, misses need no empty approval, and two G.O.D. screens plus reconnect preserve one Roll/cost/outcome.
- Final disposable browser cases `force-end,firearm,attack-report-alerts` passed. The override closed a frozen encounter with an unrevealed action and updated the Player screen live. The prepared firearm fixture committed a Roll and consumed one round without duplicate expenditure on reload. A real Player attack against blank whole-body protection applied its full 10 damage exactly once, triggering incapacity and alerts. The override dialog was visually inspected.
- 1,282 feature tests passed before the final protection/override additions; the 15 focused protection, report, next-input, summary and alert tests passed afterward. Final typecheck, source lint, production build, Drizzle check, and whitespace checks passed.
- Validation made no schema changes, live migration, production mutation, or deployment. Brannan subsequently authorized cleanup, commit, and push.

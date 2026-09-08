Build the agreed Serrian Tide Player and G.O.D. combat screens in three stages, connecting the completed combat backend.

Repository: https://github.com/Revty79/serrian-tide-website

Last verified main: db79bf41db3be1a56fe22709a02940e8ae2654dd
“Fix combat death, closed inspection and spell recovery”

Verify the actual checkout and origin/main first. Preserve newer work. Continue on main tracking origin/main, committing and pushing each completed implementation stage. No production deployment or ordinary campaign-data mutation.

Read the existing combat screen handoff, completion contract, and closed-state/recovery correction report. Treat the confirmed mechanics as settled. Reuse the authoritative services, projections, permissions, and live subscriptions.

Complete Stages 1 and 2 and the executable verification in Stage 3 without stopping for routine approval between stages. Actual human playtesting will happen afterward.

GOAL AND PRESENTATION

Create simple, usable 90s RPG-style command screens using Serrian Tide’s existing theme, semantic colors, typography, and controls.

* NO PORTRAITS.
* Compact command windows, clear selection states, readable text.
* One selected-action/detail panel rather than many competing panels.
* Use existing tabletop entry points; preserve encounter-library and noncombat functionality.
* Keep internal implementation terms such as effect plans, checkpoint IDs, and runtime keys out of normal gameplay.
* Preserve scroll, selected combatant, target, action draft, focus, and open controls across live updates whenever still valid.
* If something becomes invalid, explain why without silently selecting a different target or submitting another action.
* Support normal desktop use and narrower screens without horizontal page overflow.

STAGE 1 — SHARED LAYOUT AND AUTHORITATIVE LIVE STATE

Player:

* Show total HP, Mana, Initiative, and compact HP by location.
* Provide target selection and a command area.
* Show the current action, remaining time/expected completion where useful, and a clear next-step prompt.
* Detailed resources are limited to the Player’s authorized Character.

G.O.D.:

* Show small combatant cards with name, Initiative, and short status/action text.
* Green means an action or legitimate response is available now.
* Red means neither is available.
* Always include explanatory text; color alone is insufficient.
* Every card remains selectable, including dead, incapacitated, withdrawn, and otherwise unavailable combatants.
* Selecting a card opens its information and relevant controls in one detail panel.
* The G.O.D. controls NPCs and direct Creature occurrences; Players retain their Character choices.

Shared:

* Derive readiness from the engine’s canActNow/canRespondNow and authorization fields. Never infer eligibility from matching Initiative, local click order, or visible enemy intent.
* Preserve simultaneous-declaration privacy in cards, prompts, resources, activity, and live updates.
* Provide a prominent G.O.D. Freeze Combat / Resume control and a shared paused notice.
* While paused, information remains readable and combat mutations are disabled according to server state.
* Closed Initiative/completed Encounters remain inspectable with ordinary action controls disabled.
* Provide a compact recent-activity view with access to fuller authorized history.
* Use the existing live invalidation subscription and authoritative reloads.
* Handle loading, empty, pre-initialization, stale, unauthorized, and reconnect states clearly.
* Make the route from an eligible encounter roster into initialized combat usable through existing setup/enrollment services.

Commit and push Stage 1 after focused validation. Continue into Stage 2.

STAGE 2 — CONNECT THE COMPLETE GAMEPLAY FLOW

Player command menu:
Attack, Cast, Item, Defend, Hold, Move, Called Shot.

Expose eligible abilities within the command structure, using a compact Ability entry if needed. Do not omit supported ability use.

Put each command’s relevant choices inside the selected-action panel:

* Exact weapon/spell/item/ability source.
* Eligible target or targets.
* Relevant mode, location, distance, and other required options.
* Calculated Initiative/resource costs and governing roll information.
* Physical percentile entry and existing supported digital rolling.
* Commit the choice and required roll together using the established declaration flow.
* Preserve target equality and physical 00 = 100 behavior.

Cover the existing supported paths:

* Ordinary weapons and direct Creature attacks.
* Spells, eligible mastery, Mana, targets, items, charges, and ability limits.
* Firearm readiness, ammunition, firing mode, Aim, reload/preparation, cycling/recoil, and sustained-fire duration.
* Legitimate defenses and Hold interventions.
* Movement and movement intended to flee.
* Called Shots using the target’s actual anatomy and existing ruling flow.

Responses:

* Show clear prompts only when the engine supplies a legitimate opportunity.
* Do not grant advance knowledge or automatic defense because Initiative matches.
* Clearly distinguish “choose now,” “choice committed,” “action underway,” “response available,” and “G.O.D. ruling needed.”
* Do not require all possible future responses before allowing an original declaration-time roll.

Resolution:

* Use existing authoritative progression and routine consequence services.
* Supported ordinary outcomes should not require users to manually generate, approve, and apply internal plans.
* Place genuinely required rulings in the selected detail panel with the precise question and existing calculated evidence.
* Do not invent numbers or silently skip unsupported mechanics.
* Do not apply consequences early, reveal sealed choices, or duplicate effects through multiple connected clients.
* Expose a clear G.O.D. progression control where the engine requires advancement. Keep raw timeline administration out of the primary gameplay flow.
* Preserve original request keys across retries. Refresh on stale state tokens/revisions and require a deliberate subsequent command; never automatically replay advancement.

Secondary G.O.D. controls:

* Add eligible Characters/NPCs and spawn exact direct Creature occurrences.
* Withdraw, confirm escape, and return through the participation services.
* Inspect and resolve supported death/incapacity/recovery rulings.
* Show source-linked revival and temporary-revival stabilization prompts where required.
* Inspect unfinished work and use existing explicit recovery controls.
* End Combat and distribute XP.

XP closeout:

* Killer receives full Creature XP.
* Every selected recipient receives full Creature XP.
* Shared split, with the remainder assigned to the credited selected killer.
* Additional encounter XP gives each selected recipient the full entered amount.
* Preview recipients and totals before committing.
* Dead/incapacitated PCs retain eligibility under the existing recipient rules.
* Repeated closeout must not duplicate awards.
* Keep current condition separate from historical defeat and reward records.

Death/incapacity:

* Display the current mechanical status clearly.
* Block unavailable actions while keeping cards and records inspectable.
* Supported recovery recalculates eligibility without resetting Initiative/debt or restarting cancelled actions.
* Movement with flee intent remains active combat until G.O.D. confirms departure.

Commit and push Stage 2 after focused validation. Continue into Stage 3.

STAGE 3 — VERIFY THE SCREENS AND PREPARE HUMAN PLAYTESTING

Use isolated test data and authorized test accounts. Never seed or change ordinary campaign data for testing.

Verify through the actual screen/server integration:

1. G.O.D. starts combat and controls an NPC/direct Creature.
2. A Player selects a target, declares an attack, rolls, and sees the outcome/resources update.
3. Two simultaneous participants commit in both submission orders without revealing choices early.
4. A legitimate defense works; an unavailable defense remains blocked with a useful explanation.
5. Spell casting spends Mana once and applies supported consequences at the correct point.
6. Firearm use updates ammunition and timing correctly.
7. Freeze blocks gameplay writes for both roles; Resume preserves pending work.
8. Death/incapacity disables participation while inspection and XP eligibility remain.
9. Arrival, withdrawal, and confirmed escape update cards without blocking progression.
10. Closeout previews and awards XP once, then leaves final information readable.
11. Reconnect/live updates preserve valid drafts and do not reset scroll or duplicate submissions.

Reuse existing engine tests. Add focused integration coverage for new UI behavior and any concrete regression found. Run required repository checks and inspect representative Player/G.O.D. screens visually.

If browser access or test-account setup prevents a scenario, report it as unverified. Do not substitute a unit-test result for a claim that the screen was exercised.

Fix blockers found in these flows. Keep optional polish and unrelated refactors out of this assignment.

DEFERRED

* In-combat spell creation and a general custom-spell revival system.
* Portraits, maps, pathfinding, animation-heavy presentation.
* Redesigning settled combat mechanics or the spell catalog.
* Unrelated site changes.

FINAL HANDOFF

Report:

* Starting and ending commits, pushes, and worktree status.
* What is now playable on each screen and how to open it.
* Which screen scenarios were actually exercised.
* Validation results and specific remaining limitations.
* A short, plain-language checklist for our first live Player/G.O.D. fight.

The completion target is a connected combat interface we can play through, not just a visual shell. Automated verification prepares it for human testing; do not claim that live tabletop usability is already proven.

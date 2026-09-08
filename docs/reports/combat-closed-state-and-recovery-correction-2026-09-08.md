# Closed combat, mechanical death and recovery correction

Date: 8 September 2026. Base: `6eb5b1d` on `main`, tracking `origin/main`.

This follow-up preserves the completed seven-pass work and its historical reports. It changes backend behavior and adds isolated regression scenarios. It does not build screens, migrate/reset a database, or correct ordinary campaign records.

## Closed combat inspection

`readActionDeclarationWorkspaceInTransaction` and `readCombatProjectionInTransaction` load retained Initiative with the existing explicit closed-read option. The projection does not call active-only timeline helpers after Initiative closes or the Encounter completes. It returns final Initiative, authorized declarations/history, inspectable entities and a clear ended-combat explanation with ordinary action/response availability false. Entity detail continues to expose authorized Health, Mana and effects. Player ownership and resource privacy remain enforced. New declarations cannot be inserted against closed Initiative. The separately authorized retained-effect recovery service still operates without reopening combat.

The G.O.D.'s entity detail also returns `combatHistory`: condition events, damage outcomes, retained defeat and revival records. Temporary expiration records carry the exact effect/source identity and required stabilization ruling. These private audit records are not added to shared cards or other Players' resource views.

## Mechanical outcomes and participation

The confirmed fatal-head rule is evaluated against the actual target anatomy and applied damage: a hit **greater than twice** the authored HP of its single head causes death. The 11-damage/3-HP example now derives damage from the owned weapon, Skill and recorded Rolls, then records death without a damage override, injury name or `defeated` input. Selecting the head is still supported. Optional narration remains separate.

The implementation does not infer fatal rules for limbs, shared or multiple heads, missing HP, or exceptional authored location mechanics. Unsupported location consequences retain a specific ruling indicator. Reaching the total HP damage limit prevents participation; it does not by itself declare death or create Creature kill XP.

Current condition state and its individual blockers are stored additively in the existing Encounter member JSON. Death/incapacity is distinct from voluntary withdrawal. Original damage outcomes, historical defeat evidence, member identities, resource spending, attribution and award receipts remain intact. Legacy defeat that lacks a death/incapacity distinction remains explicitly uncertain until resolved through an appropriate ruling.

The existing departure reconciliation is shared for suspension. It cancels future declarations and retained pending actions, removes unavailable response/checkpoint blockers, retains paid costs and recorded Rolls, and preserves completed actions and fired portions already due. Suspending or recovering a participant does not fabricate a Combat Step. Suspended Initiative and debt do not refill across rounds. An explicit incapacity ruling chooses preserved Initiative or loss of positive Initiative; it does not apply a universal zero rule to every condition.

New actions/defenses and generic re-entry are guarded. Generic return cannot clear death/incapacity, and a generic condition ruling cannot substitute for a revival spell. PCs remain eligible for explicit G.O.D. XP selection while dead or incapacitated. Previously awarded XP and exact Creature award identities are unchanged.

## Authored spell recovery

The ordinary database was inspected **read-only** for the two named catalog spells. Their exact documents and import-source provenance are captured in `scripts/fixtures/combat-recovery-spell-catalog.json` for disposable tests; the catalog itself was not edited.

| Source | Verified recovery mechanics | Backend boundary |
| --- | --- | --- |
| Vital Wellspring, supplied row 62 | Grand Master revives one fallen ally at **1 HP**. Poison/disease cleansing starts at Novice. Grand Master text also describes healing/buffs. | Locked caster mastery and stable imported catalog identity authorize a source-linked G.O.D. recovery effect. One revived target per cast. Other prose-only healing/buffs retain their existing manual effect requirements. |
| Cycle of Rebirth, supplied row 72 | High Master temporary revival at **5 HP**. At spell end the revived ally stabilizes or falls dead again. | Exact cast, mastery, target and effect receipt are required. G.O.D. supplies the unresolved duration including lingering; the existing condition/duration lifecycle owns expiration. Expiration suspends participation pending the specific stabilization ruling. |

Both imported documents lack structured revival effects. Wellspring's progressive tiers contain descriptions with empty `changes` arrays. Cycle's import explicitly flags non-step lingering for review. Its stabilization save does not specify governing mechanics. The correction therefore adds **source-linked G.O.D. effect rulings**, not resurrection inferred from arbitrary spell descriptions or a name match. Personal/renamed healing spells and insufficient mastery do not receive resurrection authority.

Revival applies the source's exact return HP through existing Health persistence and retains the death event. Fatal-location anatomy restoration requires the G.O.D. to select the exact repaired pool. No unrelated injury, condition or body part is silently removed. Cleansing uses exact selected condition identities and closes their existing duration bindings. Clearing one blocker cannot erase another.

After supported healing or recovery resolves, the engine rechecks all blockers. Ordinary healing can resolve HP exhaustion when sufficient, but cannot clear death. A recovered combatant suspended for mechanical incapacity regains eligibility at its preserved Initiative/debt, through normal opportunities. This does not execute an action, reset the round, restart cancelled work, or return a voluntarily withdrawn participant.

Temporary revival keeps its bound condition, duration and source receipt. Natural expiration and the retained explicit-expiration API both expose the stabilization ruling. Successful stabilization can restore eligibility; failure records another death event while preserving the original defeat/XP source. Retrying the old cast cannot revive the target again after expiration. All changes serialize with Freeze and combat writes on the existing Encounter lock.

## Validation

The disposable PostgreSQL harness migrates a fresh loopback cluster and removes it after testing. The expanded suite covers closed Initiative and completed-Encounter inspection in fresh transactions; authorized historical recovery; derived Goblin/PC/NPC fatal damage; dead/incapacitated PC, NPC and direct Creature participation; pending work and response receipts; simultaneous privacy; retained XP; sufficient/insufficient healing; mastery restrictions; spell cleansing with remaining incapacity; exact revival HP; voluntary withdrawal; natural and explicit temporary expiration; Freeze; and concurrent/repeated revival requests.

Validation passed: **101 combat service scenarios** in a fresh disposable migrated PostgreSQL cluster; **1,261 unit tests** across 145 feature test files; TypeScript; ESLint; the production build; `drizzle-kit check`; and `git diff --check`. The final projection assertions were also verified through the affected service scenarios. The publication commit is recorded in the completion response. No ordinary campaign mutation, migration, reset or production deployment is part of this correction.

## Remaining source decisions

Cycle of Rebirth's lingering duration and stabilization save require a ruling for the exact cast. The existing catalog does not define an executable save threshold or governing Attribute/Skill, so none is invented. Other prose-only spell behavior and anatomy-specific consequences remain visible manual effects/rulings. These are narrow source limitations, not permission for arbitrary healing to resurrect.

The later screen handoff retains no portraits, authorized inspectable cards regardless of action availability, shared Freeze/Resume and the site's existing theme. Screens should use current condition state for ability to act and retain historical defeat/XP records for history.

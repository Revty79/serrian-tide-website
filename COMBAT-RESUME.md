# Combat resumption handoff

## Read this first

Updated **12 September 2026** for Brannan, Cody and Ember. The first action-opportunity fix is implemented and combat work is paused at Brannan's request. The remaining priorities below retain the supplied rules and order.

- Magic and ordinary attacks appeared to work in the cases Brannan tried; this is **not exhaustive acceptance**.
- **Implemented; human retest pending:** independent crossover action choices and no responses from actors already committed to unfinished actions.
- **Next implementation priority:** reject unaffordable actions before commitment; preserve unused Initiative for next round. Bull 1 and Ysra demonstrated this bug.
- Preserve completed spell, health, report, force-end and magazine-inventory work. Firearm/ranged work remains paused and unaccepted.
- Follow the latest rulings below over conflicting old notes/tests. Do not reconstruct rules from old traces or invent missing rules.

## 12 September stopping point

- Started from clean `main` at `6d94f2d` (the 9 September handoff); no intervening code changes were present on resumption.
- Priority 1 now excludes busy actors when creating response opportunities, validates that prohibition at action/response/exceptional-intervention submission, and removes busy response controls from the combat projection. Interrupted unfinished work also prevents a second ordinary action.
- An ordinary Initiative crossing retains the actor's independent target, Hold and Pass choices. G.O.D. response confirmation is available beside the selected combatant, including Player-controlled Characters; a future crossing no longer demands an early response. No-reaction remains a zero-cost response and preserves the ordinary choice.
- Obsolete unanswered busy prompts become ineligible through the existing service and `busy-responder-excluded` audit events. Cleanup waits for simultaneous choices to reveal. Existing declared responses, Rolls and results are retained.
- Readiness also refreshes after response-window reconciliation and before completion when a condition/departure has closed the last response. This fixes the reversed-submission movement completion failure without permitting pending responses to be skipped.
- Validation: **1,291 unit tests**, **10 screen-service DB cases**, **3 checkpoint DB cases**, **2 fixed combat-trace cases**, and **5 browser scenarios** passed. Browser coverage includes both simultaneous submission orders, overlapping actions, and G.O.D. Yes/No with Player no-reaction and Hold. See [browser results](artifacts/combat-screens/results-overlap_awareness_simultaneous.json). Typecheck, lint, production build, Drizzle consistency and whitespace checks passed.
- All DB/browser tests used disposable migrated loopback PostgreSQL clusters. **No schema change, development/production migration, live encounter repair, push or deployment.** Current development/production database and deployed revision remain unverified.
- This implementation and handoff are saved together in a local commit; identify it with `git log -1 --format="%h %s" -- COMBAT-RESUME.md`. It is ready for review and push.
- **Human acceptance is still pending.** Use a fresh authorized encounter or the disposable harness. Retest free/busy overlaps first; then resume priority 2. Affordability, mixed spell scaling, injury costs, firearms and combat magazine integration were not implemented in this pass.

## Historical 9 September snapshot

| Item | Verified snapshot before this documentation commit |
| --- | --- |
| Checkout / branch | `D:\serrian-tide-website`, `main` |
| HEAD | `8490baad1773d36bfa7483dae7150cc30f8bbf21` — `slowly getting the combat action working` |
| Worktree | Clean before this documentation pass. |
| Ember's last review | Brannan identifies `8490baa` as the last reviewed commit. Git confirms it added 14 lines of walkthrough notes only; it implemented no fixes. The review itself was not independently inspected. |
| Upstream | `origin/main`; the local remote-tracking reference matched HEAD, 0 ahead / 0 behind. No network fetch or live remote verification in this pass. |
| Implementations preserved | `a223a89`: magazine equipment/inventory and migration 0046. `a8ad564`: preceding combat/spell fixes. Both remain in ancestry. |
| Migration files | 47 journal entries, ending in `0046_magazine_inventory`; SQL and snapshot present. Prior evidence records migration/test success on disposable databases. |
| Current development / production migration state | **Unknown.** No current database was queried or migrated during this pass. |
| Deployment | **Unknown current deployed revision/migration state.** No push or deployment in this pass. Git ancestry does not establish production state. |

The local documentation commit follows that snapshot. Find its identity with `git log -1 --format="%h %s" -- COMBAT-RESUME.md`. Recheck HEAD/worktree on resumption; never reset to a handoff hash.

Historical magazine validation: 1,286 unit tests; 8 magazine DB tests including the parent; 13 firearm regression tests; one complete magazine UI scenario; typecheck, lint, build and migration checks. These were not rerun here and do not establish ranged acceptance. See [magazine handoff](docs/magazine-inventory-handoff.md), [health/spell report](docs/reports/combat-health-and-attack-reports-2026-09-09.md) and [human walkthrough record](docs/testing/tabletop-human-test-guide.md).

## Ordered tasks

### 1. Action opportunities and busy actors — implemented; human retest pending

When an ongoing action crosses a **free** combatant's Initiative, that combatant gets an independent choice: a legitimate interruption attempt or a normal action against their own legal target, with applicable Hold/Pass choices. They must not be forced into Defend/no-reaction against the original attacker. Preserve overlapping action timing; reconcile obsolete response prompts that otherwise block progression through the authoritative services/audit trail.

**Latest confirmed rule:** an actor committed to an unfinished action cannot defend, respond, interrupt or start another normal action while it is underway. Enforce this in opportunity creation, server validation and the UI. Busy actors must not create mandatory response prompts.

Being free does not automatically authorize a defense. G.O.D. still decides legitimate response eligibility. Preserve the prominent **Yes, can respond / No, cannot respond** controls for real response decisions. **Ambush checks happen before combat.** Preserve simultaneous-choice privacy; shared Initiative must not expose another actor's sealed choice or grant foreknowledge.

Before this fix, mathematical crossings became response candidates; prompts steered actors toward defense/no-reaction, including prioritizing response text when they could otherwise act. Pending eligibility/response records could block resolution. The 12 September changes above address this; automated checks do not replace Brannan's retest.

Sources: [windows](src/features/tabletop-operations/action-declaration.ts), [declaration service](src/features/tabletop-operations/action-declaration-service.ts), [defense service](src/features/tabletop-operations/defense-intervention-service.ts), [projection](src/features/tabletop-operations/combat-projection-service.ts), [checkpoints](src/features/tabletop-operations/declaration-checkpoint-service.ts), [next input](src/features/combat-screen/next-input.ts), [prompts](src/features/combat-screen/screen-types.ts), [choices](src/features/combat-screen/choice-service.ts), [response panel](src/features/combat-screen/defense-panel.tsx).

Focused tests: [next-input](src/features/combat-screen/next-input.test.ts), [declarations](src/features/tabletop-operations/action-declaration.test.ts), [defense rules](src/features/tabletop-operations/defense-intervention.test.ts), [checkpoint DB](scripts/combat-completion-checkpoints-db.test.ts), [screen service DB](scripts/combat-screens-service-db.test.ts). Demonstrate independent targets, busy rejection, legitimate response/decline, privacy and no progression deadlock. Reconcile old tests permitting busy defenders.

Initial estimate: **10,000–20,000 tokens including focused tests**. This is a rough conversational estimate, not a measured percentage or fixed budget; reassess after intervening changes.

### 2. Affordability, Hold and round transition — open bug; second priority

Bull 1 and Ysra each had **2 Initiative** but started attacks costing more. At Round 1 / Initiative 0, the supplied screenshot showed Bull's Horn / Headbutt with 2 remaining and expected finish -2; Ysra's Longsword had 3 remaining. Neither attack should have started.

- Calculate the **full known action cost**, including applicable injury adjustments, before commitment. Reject unaffordable actions before resource expenditure or committed rolls/actions.
- Exact-cost actions and affordable movement remain available: with 2 points, an action costing 2 or less can start.
- If no affordable action is chosen, unused Initiative carries into the normal next-round allocation. Do not start an unaffordable attack and carry that attack instead.
- This does not redefine additional costs imposed after an otherwise valid commitment.
- **Hold costs zero**, retains Initiative, satisfies the current required choice and allows others to proceed. Preserve held interventions and simultaneous-choice machinery.
- **No-reaction costs zero and is not Pass.** Declining defense must not forfeit the ordinary choice/round.

The engine's affordability guard is conditional on `allowsMultiRound`; inspect which declarations permit spanning rounds. Round advancement already adds normal Initiative to stored current Initiative. Fix command/source validation and the explanation beside the committing control, not only button visibility.

Sources: [Initiative engine](src/features/tabletop-operations/initiative-runtime.ts) (`startInitiativeAction`, `holdInitiative`, `advanceInitiativeRound`), [declaration service](src/features/tabletop-operations/action-declaration-service.ts), [source resolver](src/features/tabletop-operations/action-source-resolver-service.ts), [choice service](src/features/combat-screen/choice-service.ts), [command panel](src/features/combat-screen/command-panel.tsx). Tests: [Initiative](src/features/tabletop-operations/initiative-runtime.test.ts), [timing](src/features/tabletop-operations/combat-completion-timing.test.ts), [checkpoint DB](scripts/combat-completion-checkpoints-db.test.ts), [browser scenarios](scripts/combat-screens-browser.ts).

Initial estimate: **8,000–15,000 tokens including focused tests**; overlap with priority 1 may change this. No reliable account-usage percentage is available.

### 3. Mixed spell scaling — open bug

Verified in the current [spell resolver](src/features/tabletop-operations/action-source-resolver-service.ts): modifiers from the whole spell and all containers feed one `perSuccess` flag; **any Static Assignment disables scaling everywhere**. Effects must respect their applicable static/per-success scope. Verify a spell containing both, including container/nested scope; keep uniform all-static/all-per-success cases and casting-cost calculations working. If authored scope itself is ambiguous, identify the exact case rather than invent inheritance rules.

Count the initial successful roll as one success; against target 40, **50 is two successes and 60 is three**. Use [shared percentile resolution](src/features/tabletop-operations/percentile-resolution.ts). References/tests: [spell clarification](docs/rules/combat-spell-resolution-clarification-2026-09-09.md), [effect adapter](src/features/spell-construction/mechanical-effects-adapter.ts), [learned-spell DB](scripts/combat-completion-learned-spells-db.test.ts), [effect DB](scripts/combat-completion-effects-db.test.ts).

### 4. Injury timing — planned implementation; confirmed rules

- Two-handed actions with one functioning hand cost **double Initiative**, including weapon attacks.
- One-handed actions using the good hand keep normal cost.
- A two-legged actor with one disabled leg pays **double movement Initiative for the same distance**.
- Include adjusted costs in affordability checks. Do not invent further injury, anatomy or spell-component rules.

Incapacity state/alerts exist; these timing requirements are not established as completed. Trace action handedness, the selected usable hand and movement anatomy. Start with [limb state](src/features/tabletop-operations/combat-limb-state.ts), [condition service](src/features/tabletop-operations/combat-condition-service.ts), [source resolver](src/features/tabletop-operations/action-source-resolver-service.ts), [item schema](src/db/item-schema.ts), and [limb DB tests](scripts/combat-completion-limbs-db.test.ts). Existing tests do not prove these new costs work.

### 5. Firearms/ranged weapons — deferred separate phase; not accepted

When Brannan resumes this phase:

1. Correct overly broad firearm classification; connect normal equipment setup and per-owned-weapon initialization.
2. Finish preparation controls; include cocking in ready Initiative without a duplicate charge.
3. Implement **Single / Magazine** reload behavior. Single costs apply per insertion; completed insertions stay loaded if interrupted. Magazine swaps must complete before the replacement becomes usable.
4. Provide clear firearm damage calculation and result review. **Brannan authors weapon numbers; Cody provides working fields and runtime connections.**

Review [readiness gaps](docs/reports/combat-human-testing-readiness-2026-09-09.md) and the [historical catalog audit](docs/reports/combat-firearm-readiness-audit-2026-09-09.json), then verify current records. Identify missing values before requiring Brannan to choose a test firearm. Sources: [weapon editor](src/app/heavens/items/item-workspace.tsx), [save actions](src/app/heavens/items/actions.ts), [readiness](src/features/tabletop-operations/firearm-readiness-service.ts), [timing](src/features/items/firearm-timing.ts), [damage calculations](src/features/tabletop-operations/firearm-attack.ts), [attack service](src/features/tabletop-operations/firearm-attack-service.ts), [controls](src/features/combat-screen/firearm-controls.tsx). Tests: [completion DB](scripts/combat-completion-firearms-db.test.ts), [readiness DB](scripts/firearm-readiness-db.test.ts), [attack DB](scripts/firearm-attack-db.test.ts).

### 6. Magazine combat integration — planned with the firearm phase

**Completed:** catalog profiles, capacity, ammunition compatibility, weapon links, individual copies, outside-combat fill/top-up/empty, conservation/retry protection and loaded-content safeguards. See [implementation/migration handoff](docs/magazine-inventory-handoff.md), [schema](src/db/magazine-schema.ts), [catalog service](src/features/items/magazine-catalog-service.ts), [inventory service](src/features/items/magazine-inventory-service.ts), [panel](src/app/characters/magazine-panel.tsx), [DB tests](scripts/magazine-inventory-db.test.ts).

**Remaining:** attach a particular owned magazine to a weapon; select/swap physically compatible copies; use its capacity/ammunition and consume its rounds once; preserve removed-magazine contents; prevent duplicate attachment/accounting; handle interrupted operations and existing firearm state safely. Matching ammunition does not imply physical magazine compatibility. Do not manufacture magazines or relocate existing weapon rounds without an explicit supported transition.

Actual magazines retain their contents when removed. This **supersedes** the earlier temporary “return leftover rounds to loose inventory on swap” idea. Prepared rounds are currently unavailable to the old firearm runtime until emptied outside combat. Detached-magazine filling during combat is currently server-blocked and still needs a cost rule.

### 7. Catalog readiness — needs verification

Identify missing weapon values and exact editor/field repair locations before combat. Preserve unknown values; Brannan intends to fill existing weapon/ammunition fields. Check unresolved imported spell quantity discrepancies against intended effects and the current saved spell. Historical import warnings are **not proof every flagged spell is currently broken**. Do not bulk-correct from warning counts; begin with a demonstrated discrepancy and its authored source.

## Completed work to preserve

Status: **completed implementation**, with human acceptance limited to cases actually tried.

- Exact learned catalog spell Skill rolls; entered physical and generated digital roll controls feeding shared calculations.
- Original casting roll determines ordinary damaging-spell hit location using target anatomy; initial success counting and all-static/all-per-success cases work. Mixed scope remains open.
- Mana spent once at cast start; no refund on failure/interruption/cancellation; effects at completion.
- One result review for supported direct spells and ordinary attacks. Temporary AoE calculates/reports area effects and completes without selecting occupants or applying combatant HP/effects, including the existing failed/critical report path.
- Head 0 means unconscious; -1 or below means dead. Single whole-body targets such as Slime are incapacitated at 0 and dead at -1 or below. Limbs at 0 or below record incapacity. Preserve role-appropriate alerts and exclusion of dead/incapacitated actors from choices.
- No armor/soak means zero damage blocked. Preserve target damage application, including Slime 1, and the absolute G.O.D. force-end override.
- Magazine conservation, copy identity, permissions, active-combat handling restriction and loaded-content safeguards.
- Existing Hold, simultaneous-action/privacy machinery, overlapping timing, Freeze/resume, immutable records and server authorization, subject to priorities 1–2.

Evidence/tests: [health/report implementation](docs/reports/combat-health-and-attack-reports-2026-09-09.md), [spell DB](scripts/combat-completion-spells-db.test.ts), [conditions DB](scripts/combat-completion-conditions-db.test.ts), [damage DB](scripts/combat-completion-damage-db.test.ts), [Freeze DB](scripts/combat-completion-freeze-db.test.ts), [force-end DB](scripts/combat-completion-force-end-db.test.ts).

## Newer rulings, superseded notes and unanswered questions

| Topic | What governs resumption |
| --- | --- |
| Busy actors | The older [completion contract](docs/rules/combat-completion-contract.md) and [assignment](docs/rules/combat-completion-assignment-2026-09-08.md) permit defense during unfinished actions. The latest prohibition supersedes those passages and related trace/test expectations. Preserve historical records; update acceptance expectations explicitly. |
| Unaffordable starts | Older multi-round descriptions, including the [Initiative contract](docs/rules/initiative-runtime-contract.md), must be reconciled with priority 2. They do not authorize the Bull/Ysra starts or settle costs added after valid commitment. |
| Spell scaling | Older completion claims cover working uniform cases; the verified mixed-scope bug is open. |
| Awareness/injury | Older broad questions are narrowed: G.O.D. retains genuine response decisions; ambush precedes combat; only the specified hand/leg timing penalties are confirmed. |
| Reloads | Completed Single insertions persist. Replacement magazines are usable after swap completion; removed actual magazines retain contents. Older fixed-count/loose-return assumptions do not settle physical magazine behavior. |
| Deferred | Clips, separate chambers, mixed ammunition inside one magazine, mapped AoE occupants/application, spell component/anatomy restrictions and unrelated site work. |
| Needs a rule decision | Initiative cost for filling a detached magazine during combat. Do not infer it from reload cost. |

If implementation exposes another scope/cost/timing conflict, record the exact question and ask Brannan rather than guessing.

## Historical workaround and clean retest starting point

The following workaround describes the old implementation. Priority 1 now handles busy prompts automatically through audited service reconciliation and preserves free actors' ordinary choices. The clean-encounter guidance and warning about invalid unaffordable commitments still apply.

For the incorrect crossover prompt, select **No, cannot respond** for an already-busy actor or a free actor taking no response. This dismisses that opportunity without spending Initiative or marking them Passed. Busy actors continue their action; free actors choose normally when available. For a free actor this records an ineligibility ruling: it is a workaround, not the intended flow.

For a genuine response by a free actor, allow eligibility and use **Defend**. If already allowed but declined, choose **no-reaction → Commit response**: zero Initiative, no roll, no defense. If normal actions stay blocked, record the precise blocker.

**Next round does not repair Bull/Ysra's invalid commitments.** It retains pending attacks and remaining costs. Later outcomes in that encounter carry known incorrect state.

For clean acceptance after fixes, preserve the old encounter/history and use a **new user-authorized test encounter** or the existing disposable harness. Start with able actors, known HP/resources, no pending actions/stale response opportunities and recorded Initiative. Reproduce a 2-point actor with an action costing more than 2, an exact-cost action, and free/busy crossover actors. Establish the 2-point case through an explicit supported G.O.D. correction or fixture; do not edit historical rows, silently reset the campaign or recreate history.

## Acceptance and future resume behavior

When Brannan says “let's finish fixing combat,” “resume combat,” or similar:

1. Read this handoff; inspect current branch, HEAD, worktree and intervening changes. Preserve others' work. Verify database/deployment state only if needed for resumed work.
2. Briefly remind Brannan what worked, what blocks combat and the next priority. Start with the first unresolved priority, respecting new direction. The listed fixes are presently deferred; the future resume request restarts the agreed work unless Brannan instead directs continued triage.
3. During walkthrough triage, investigate narrowly, explain the demonstrated blocker and estimate usage before implementing it. Avoid broad exploration while usage is limited.
4. Demonstrate one issue at a time through **Player and G.O.D. controls**: independent overlaps, busy actors, exact/insufficient Initiative, carryover, Hold, defense/decline, ordinary attacks, learned spells and AoE. Then verify mixed scaling/injury; firearms and magazines await their separate phase.
5. Entered/generated rolls must calculate identically. Verify damage, Mana and ammunition apply once under refresh/retry, Freeze/resume and force-end. Preserve genuine G.O.D. decisions; remove unnecessary bookkeeping prompts. Automated rehearsal is not human acceptance.
6. Use the [disposable DB harness](scripts/combat-completion-disposable-db.test.ts) and [disposable browser harness](scripts/combat-screens-disposable-browser.test.ts); inspect filters before selecting focused cases. Do not run live-DB scripts blindly. Keep intentionally absent legacy Step 13 fixtures absent; do not seed them to force a validation pass.
7. Update this file after each completed fix: status, ruling, changed code, commit, focused checks, human acceptance, remaining limits and actual migration/deployment state. Cody and Ember resume from this same record. Do not push/deploy without current authorization.

The 12 September stopping point includes priority 1 code, tests and this handoff in a local commit. No live database migration, push or deployment is part of it.

# Combat resumption handoff

## Current status / Start here next time

Reconciled **12 September 2026** against implementation and recorded evidence. Start with the [next human walkthrough](#next-human-walkthrough), not another implementation pass.

- **Implemented; walkthrough pending:** free/busy choices, affordability/Hold/carryover, startup/key fix, weapon/movement injury timing including firearms, progressive-tier scaling, firearm setup/preparation, Single reloads, exact magazine swaps and detached filling.
- **Unfinished:** no further confirmed fix above was identified as unimplemented. Non-firearm projectile ammunition workflows and the explicitly deferred features below remain unsupported; they are not new work for this cleanup.
- **Brannan's catalog values:** firearm capacity, readiness/preparation/mode costs, ammunition/Skill links and damage; magazine compatibility and **Fill Initiative per Round**; Flaming Dart/Stone Pebble tier quantities. See the [repair report and editor locations](docs/reports/combat-catalog-repairs-2026-09-12.md).
- **Brannan's rule decision:** whether mixed fixed/per-success scope still exists and its exact applicability. Progressive-tier scaling is fixed; mixed scope/container inheritance remains undecided.
- **Local commits/worktree:** `main`, reviewed from `4dd5923`; follow-up/evidence preserved in **`37d48e5`**, with this documentation commit following. Only the handoff remained pending after preservation; no unrelated changes were found. Resolve its commit with `git log -1 --oneline -- COMBAT-RESUME.md`; recheck `git status --short` next time.
- **Local migrations verified read-only:** **2026-09-12 19:37 UTC**, **localhost:5432/serrian_tide_dev**, all **49** hashes/timestamps match through `0048_combat_magazine_attachment`. [Earlier backup/data-preservation evidence](artifacts/combat-dev-migration-verification.json) covers 146 pre-existing tables. No database state changed for this cleanup.
- **Production/deployment:** deployed revision, production migrations and current remote state are **unknown/unverified**. No push, deployment or production access occurred here.
- **Automated versus human:** saved **1,295 unit / 169 service** tests and linked browser results passed; previous checks are detailed below. None were rerun for this cleanup. Brannan's follow-up walkthrough remains pending; earlier successful magic/ordinary-attack trials are not exhaustive acceptance.

Follow the confirmed rulings below over conflicting historical notes/tests. Ordinary inventory filling/emptying and outside-combat firearm setup remain blocked during active combat; supported **Initiative-based** magazine filling and firearm magazine swapping are available through combat controls.

## Historical 12 September priority 1 stopping point

- Started from clean `main` at `6d94f2d` (the 9 September handoff); no intervening code changes were present on resumption.
- Priority 1 now excludes busy actors when creating response opportunities, validates that prohibition at action/response/exceptional-intervention submission, and removes busy response controls from the combat projection. Interrupted unfinished work also prevents a second ordinary action.
- An ordinary Initiative crossing retains the actor's independent target, Hold and Pass choices. G.O.D. response confirmation is available beside the selected combatant, including Player-controlled Characters; a future crossing no longer demands an early response. No-reaction remains a zero-cost response and preserves the ordinary choice.
- Obsolete unanswered busy prompts become ineligible through the existing service and `busy-responder-excluded` audit events. Cleanup waits for simultaneous choices to reveal. Existing declared responses, Rolls and results are retained.
- Readiness also refreshes after response-window reconciliation and before completion when a condition/departure has closed the last response. This fixes the reversed-submission movement completion failure without permitting pending responses to be skipped.
- Validation: **1,291 unit tests**, **10 screen-service DB cases**, **3 checkpoint DB cases**, **2 fixed combat-trace cases**, and **5 browser scenarios** passed. Browser coverage includes both simultaneous submission orders, overlapping actions, and G.O.D. Yes/No with Player no-reaction and Hold. See [browser results](artifacts/combat-screens/results-overlap_awareness_simultaneous.json). Typecheck, lint, production build, Drizzle consistency and whitespace checks passed.
- All DB/browser tests in that priority 1 pass used disposable migrated loopback PostgreSQL clusters. That pass made **no schema change, development/production migration, live encounter repair, push or deployment**; local migration status was unverified then. The later follow-up's verified local migration is recorded above.
- That implementation and handoff were committed as **`4dd5923`**. This is a historical stopping point, not the current HEAD or a new instruction to push.
- At that stopping point, human acceptance was pending and priority 2 was next. Affordability, mixed scaling, injury costs, firearms and magazine integration were outside that pass. The current status above supersedes that old work queue; preserve history and use a fresh authorized encounter for acceptance.

Subsequent testing follow-up (included in `37d48e5`): the Scenes view reported a missing React list key for the `EncounterLibrary` element passed by `TabletopOperationsPage`. Added the stable `encounter-library` key in `src/app/heavens/tabletop/page.tsx`; lint and typecheck passed. Disposable startup/affordability/Hold browser checks also captured list-key console errors and passed without any.

## Verified 12 September follow-up and recorded automated evidence

The implementation below is preserved in `37d48e5`. Intermediate counts of 14/16 firearm cases describe earlier checks within that pass; the final service run contains 23 firearm/magazine cases. Validation is recorded evidence, not a new run or Brannan's acceptance.

- The development database was inspected read-only: encounter **blammo** (1), Scene **a place**, and **session 1** were all planned, with two roster members and no initialized Initiative. These parent statuses explain the disabled start controls; they are separate from the pending rules fixes. No development rows were changed.
- Combat setup now opens before initialization, shows Session/Scene/Encounter status and the next prerequisite, and exposes the existing authorized **Start Session** and **Start Scene** actions. Initialization also checks active parents in the UI. Completed parents still require deliberate review/reopening in Tabletop.
- The disposable startup browser scenario passed: planned parents blocked encounter start/initialization; the G.O.D. started Session, Scene and encounter through the actual controls, initialized three combatants, and commanded an NPC and direct Creature. Evidence: [startup results](artifacts/combat-screens/results-start.json).
- Priority 2 is implemented: affordability is enforced independently of the legacy multi-round flag, with costs/blockers before commitment. Later forced costs, zero-cost Hold/no-reaction and unused Initiative carryover remain supported. Firearms preflight the full known aim plus firing cost, including injury adjustments.
- Verified evidence: 12 screen-service DB cases, 12 spell DB cases, and 4 startup/affordability/Hold browser scenarios passed. [Browser results](artifacts/combat-screens/results-start_affordability_hold.json). Unaffordable commands preserve Mana, ammunition, Rolls and committed state; exact-cost commands remain available. The concentration fixture now starts affordably and imposes a later explicit penalty to verify legitimate round carryover.
- The sustained-fire response deadlock is fixed: the clock reaches the response point without consuming that portion's ammunition; further advancement waits for the response/ruling and firing result. All 14 firearm-completion DB cases passed, including late Dodge, once-only ammunition and retained earlier damage. Free/busy and crossing rules remain enforced.
- Mixed scaling is under review: Brannan may have removed mixed static/per-success spells and will check; he suggested any existing per-success damage/range spell as an example. The loader currently hoists all container modifiers to spell scope, and the modifier rule table says spell-wide. Verify current authored examples before changing scope; no mixed-scope rule change is authorized by that suggestion alone.
- Active progressive-tier scaling is fixed: runtime reads the resolved tier's modifiers rather than the base spell's modifiers. All 9 learned-spell DB cases passed, including a tier adding per-success scaling and a tier replacing it with Static Assignment. This does not change modifier scope.
- Read-only catalog findings: Flaming Dart (Skill 718) and Stone Pebble (Skill 692) describe per-success damage and Short range in their Novice text, but their structured milestone changes are empty. Their later multi-target descriptions need author review before encoding quantities/scaling. No catalog rows were changed.
- Weapon/movement injury timing is implemented: one functioning hand doubles an explicitly two-handed action; a one-handed action uses the functioning hand at normal cost. A two-legged actor with one disabled leg pays double Initiative for the same distance, including partial movement progress. Stale prepared ordinary costs are rejected at commitment. All 12 limb DB cases and both new pure timing tests passed.
- Firearm injury timing now freezes adjusted Aim/firing costs without increasing Aim bonus, delivery quantity or damage. Trigger windows include the adjusted duration; sustained fire consumes each portion only after its full adjusted time. All 16 firearm-completion DB cases passed, including injured single/sustained fire, exact ammunition and one original Roll. Older frozen attacks retain their original timing.
- Preparation controls show requirements and known Initiative costs before submission. Firearm routing uses explicit firearm Weapon Types; other projectile families cannot fall through to an ammunition-free ordinary attack. Ready includes cocking without a duplicate charge. The Player preparation wrapper now accepts the selected exact magazine; its request identity uses the required 32-character hex format.
- Single loading charges the authored reload cost per inserted round. Each completed insertion transfers once; interruptions retain completed rounds. Magazine swaps charge the weapon reload cost and change the attachment only at completion. Removed magazines retain their contents; existing internal rounds require an explicit unload before attaching a magazine.
- Exact magazine attachments enforce ownership, physical fit and one weapon per magazine. Capacity and fired ammunition come from the attached copy, with no duplicate firearm load. Copies with attachments or unfinished filling cannot be retired/transferred.
- **Brannan's confirmed rule:** detached magazine filling has a separate authored cost per round. The new field is **Heavens → Items → Magazine → Fill Initiative per Round**. Combat **Item → Fill magazine** requires full affordability, inserts rounds at their completed timing and preserves completed insertions on interruption. Zero-cost preparation still requires an able, free actor's ordinary opportunity.
- Normal **Character → Sheet → Equipment State → Firearm setup** initializes an exact empty copy, loads Single ammunition, attaches/removes prepared magazines and readies a wielded firearm outside combat. Ordinary inventory handling and that equipment setup are restricted in active combat; combat **Item → Fill magazine** and **Ammunition & preparation → load/reload/unload** provide the supported Initiative paths. Firearm results expose each bullet's authored damage, DEX/additional-success adjustments, armor, Soak and net damage.
- Browser validation: all four firearm/magazine scenarios passed through actual Player/G.O.D. controls, including automatic swap/fill, once-only ammunition, ordinary equipment setup and the existing magazine editor/store workflow. [Results](artifacts/combat-screens/results-firearm_magazine.json). The final service regression passed **169 tests across all 19 scripts**, including **23 firearm/magazine cases**. Three older damage fixtures now follow the confirmed reached-response/busy-actor rules.
- Catalog audit: 22 explicit firearm profiles. Missing numbers and exact repair locations are in [the repair report](docs/reports/combat-catalog-repairs-2026-09-12.md); no canonical numbers were guessed or written.
- Recorded checks: **1,295 unit tests**, typecheck, lint, production build, Drizzle consistency and whitespace checks passed in the implementation turn. The earlier four startup/affordability/Hold browser scenarios also passed. The final equipment layout received its own [passing browser check](artifacts/combat-screens/results-firearm-setup.json) after the build; the build was not repeated for that layout adjustment. Saved unit/service/build/lint logs remain local under the ignored `artifacts/combat-screens/` directory; linked JSON results are committed. Automated results do not replace Brannan's acceptance.
- Additive migrations **0047_single_reload_timing** and **0048_combat_magazine_attachment** were applied to the verified ordinary **localhost:5432/serrian_tide_dev** database after disposable checks and a custom-format backup. All **49 ledger hashes/timestamps** match the journal. Counts and value checksums for all **146 pre-existing tables** are unchanged, excluding only the new columns. [Verification and backup location](artifacts/combat-dev-migration-verification.json). No encounter or catalog values were repaired or reset. Production migration/deployment remains unverified and untouched.
- These follow-up changes are committed locally as `37d48e5`. No push or deployment occurred in the implementation/preservation work. Human acceptance remains pending. Local testing can use the new fields; verify production's actual revision/ledger before any separately authorized release.

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

The historical documentation commit following that snapshot is `6d94f2d`. Later commits supersede that snapshot. Recheck HEAD/worktree on resumption; never reset to a handoff hash.

Historical magazine validation: 1,286 unit tests; 8 magazine DB tests including the parent; 13 firearm regression tests; one complete magazine UI scenario; typecheck, lint, build and migration checks. These counts belong to the older pass and do not establish ranged acceptance. See [magazine handoff](docs/magazine-inventory-handoff.md), [health/spell report](docs/reports/combat-health-and-attack-reports-2026-09-09.md) and [human walkthrough record](docs/testing/tabletop-human-test-guide.md).

## Ordered fix record and confirmed rules

### 1. Action opportunities and busy actors — implemented; human retest pending

When an ongoing action crosses a **free** combatant's Initiative, that combatant gets an independent choice: a legitimate interruption attempt or a normal action against their own legal target, with applicable Hold/Pass choices. They must not be forced into Defend/no-reaction against the original attacker. Preserve overlapping action timing; reconcile obsolete response prompts that otherwise block progression through the authoritative services/audit trail.

**Latest confirmed rule:** an actor committed to an unfinished action cannot defend, respond, interrupt or start another normal action while it is underway. Enforce this in opportunity creation, server validation and the UI. Busy actors must not create mandatory response prompts.

Being free does not automatically authorize a defense. G.O.D. still decides legitimate response eligibility. Preserve the prominent **Yes, can respond / No, cannot respond** controls for real response decisions. **Ambush checks happen before combat.** Preserve simultaneous-choice privacy; shared Initiative must not expose another actor's sealed choice or grant foreknowledge.

Before this fix, mathematical crossings became response candidates; prompts steered actors toward defense/no-reaction, including prioritizing response text when they could otherwise act. Pending eligibility/response records could block resolution. The 12 September changes above address this; automated checks do not replace Brannan's retest.

Sources: [windows](src/features/tabletop-operations/action-declaration.ts), [declaration service](src/features/tabletop-operations/action-declaration-service.ts), [defense service](src/features/tabletop-operations/defense-intervention-service.ts), [projection](src/features/tabletop-operations/combat-projection-service.ts), [checkpoints](src/features/tabletop-operations/declaration-checkpoint-service.ts), [next input](src/features/combat-screen/next-input.ts), [prompts](src/features/combat-screen/screen-types.ts), [choices](src/features/combat-screen/choice-service.ts), [response panel](src/features/combat-screen/defense-panel.tsx).

Focused tests: [next-input](src/features/combat-screen/next-input.test.ts), [declarations](src/features/tabletop-operations/action-declaration.test.ts), [defense rules](src/features/tabletop-operations/defense-intervention.test.ts), [checkpoint DB](scripts/combat-completion-checkpoints-db.test.ts), [screen service DB](scripts/combat-screens-service-db.test.ts). Demonstrate independent targets, busy rejection, legitimate response/decline, privacy and no progression deadlock. Reconcile old tests permitting busy defenders.

Historical estimate before implementation: **10,000–20,000 tokens including focused tests**. This was a rough conversational estimate, not a measured percentage, fixed budget or remaining-work estimate.

### 2. Affordability, Hold and round transition — implemented; human retest pending

Bull 1 and Ysra each had **2 Initiative** but started attacks costing more. At Round 1 / Initiative 0, the supplied screenshot showed Bull's Horn / Headbutt with 2 remaining and expected finish -2; Ysra's Longsword had 3 remaining. Neither attack should have started.

- Calculate the **full known action cost**, including applicable injury adjustments, before commitment. Reject unaffordable actions before resource expenditure or committed rolls/actions.
- Exact-cost actions and affordable movement remain available: with 2 points, an action costing 2 or less can start.
- If no affordable action is chosen, unused Initiative carries into the normal next-round allocation. Do not start an unaffordable attack and carry that attack instead.
- This does not redefine additional costs imposed after an otherwise valid commitment.
- **Hold costs zero**, retains Initiative, satisfies the current required choice and allows others to proceed. Preserve held interventions and simultaneous-choice machinery.
- **No-reaction costs zero and is not Pass.** Declining defense must not forfeit the ordinary choice/round.

**Historical defect, fixed in `37d48e5`:** the engine previously skipped its affordability guard when `allowsMultiRound` was true. `startInitiativeAction` now checks the full known cost unconditionally through `initiativeAffordabilityIssue`; command previews/commits include the relevant costs and guidance. Round advancement preserves unused Initiative, and additional costs imposed after a valid commitment can still carry across rounds. Do not reopen the old loophole as unfinished work.

Sources: [Initiative engine](src/features/tabletop-operations/initiative-runtime.ts) (`startInitiativeAction`, `holdInitiative`, `advanceInitiativeRound`), [declaration service](src/features/tabletop-operations/action-declaration-service.ts), [source resolver](src/features/tabletop-operations/action-source-resolver-service.ts), [choice service](src/features/combat-screen/choice-service.ts), [command panel](src/features/combat-screen/command-panel.tsx). Tests: [Initiative](src/features/tabletop-operations/initiative-runtime.test.ts), [timing](src/features/tabletop-operations/combat-completion-timing.test.ts), [checkpoint DB](scripts/combat-completion-checkpoints-db.test.ts), [browser scenarios](scripts/combat-screens-browser.ts).

Historical estimate before implementation: **8,000–15,000 tokens including focused tests**, with possible overlap with priority 1. It is not an estimate of remaining work or current account usage.

### 3. Spell scaling — progressive-tier defect fixed; mixed scope undecided

The current [spell resolver](src/features/tabletop-operations/action-source-resolver-service.ts) uses the active progressive tier's modifiers; **any Static Assignment disables spell-wide scaling** under the existing codec/modifier rules. Brannan is reviewing whether mixed static/per-success scope still exists. His suggestion to use a per-success damage/range spell does not define a new container inheritance rule. Flaming Dart and Stone Pebble provide catalog examples for author review; no mixed-scope change was made. Preserve uniform all-static/all-per-success behavior and casting costs.

**Completed defect:** progressive tiers previously adapted effects from the active tier while reading scaling modifiers from the base spell. Both now use the resolved tier, with learned-spell DB cases for a tier adding per-success scaling and one replacing it with Static Assignment. **Unresolved rule question:** applying different scaling scopes within one spell is not established as a current bug until Brannan confirms that such spells remain valid and identifies their intended scope. Do not change the codec or infer mixed scope from the progressive-tier fix.

Count the initial successful roll as one success; against target 40, **50 is two successes and 60 is three**. Use [shared percentile resolution](src/features/tabletop-operations/percentile-resolution.ts). References/tests: [spell clarification](docs/rules/combat-spell-resolution-clarification-2026-09-09.md), [effect adapter](src/features/spell-construction/mechanical-effects-adapter.ts), [learned-spell DB](scripts/combat-completion-learned-spells-db.test.ts), [effect DB](scripts/combat-completion-effects-db.test.ts).

### 4. Injury timing — weapons/movement implemented; human retest pending

- Two-handed actions with one functioning hand cost **double Initiative**, including weapon attacks.
- One-handed actions using the good hand keep normal cost.
- A two-legged actor with one disabled leg pays **double movement Initiative for the same distance**.
- Include adjusted costs in affordability checks. Do not invent further injury, anatomy or spell-component rules.

These timing requirements are implemented and covered by the current limb/firearm service cases. Retest action handedness, the selected usable hand and movement anatomy. Sources: [limb state](src/features/tabletop-operations/combat-limb-state.ts), [condition service](src/features/tabletop-operations/combat-condition-service.ts), [source resolver](src/features/tabletop-operations/action-source-resolver-service.ts), [item schema](src/db/item-schema.ts), and [limb DB tests](scripts/combat-completion-limbs-db.test.ts).

### 5. Firearms — implemented for supported firearm families; human retest pending

Implemented in `37d48e5` (human retest pending):

1. Explicit firearm classification, normal equipment setup and per-owned-weapon initialization.
2. Preparation controls and cocking included in ready Initiative without a duplicate charge.
3. **Single / Magazine** reload behavior: Single costs per insertion, completed insertions retained if interrupted, replacement magazines usable only when the swap completes.
4. Per-bullet damage calculation and result inspection. **Brannan authors weapon numbers; Cody provides working fields and runtime connections.**

Use the [12 September catalog repair report](docs/reports/combat-catalog-repairs-2026-09-12.md) for the audited missing values before selecting a test firearm. Earlier [readiness gaps](docs/reports/combat-human-testing-readiness-2026-09-09.md) and the [9 September catalog audit](docs/reports/combat-firearm-readiness-audit-2026-09-09.json) are historical context. Sources: [weapon editor](src/app/heavens/items/item-workspace.tsx), [save actions](src/app/heavens/items/actions.ts), [readiness](src/features/tabletop-operations/firearm-readiness-service.ts), [timing](src/features/items/firearm-timing.ts), [damage calculations](src/features/tabletop-operations/firearm-attack.ts), [attack service](src/features/tabletop-operations/firearm-attack-service.ts), [controls](src/features/combat-screen/firearm-controls.tsx). Tests: [completion DB](scripts/combat-completion-firearms-db.test.ts), [readiness DB](scripts/firearm-readiness-db.test.ts), [attack DB](scripts/firearm-attack-db.test.ts).

### 6. Magazine combat integration — implemented; human retest pending

**Completed:** catalog profiles, capacity, ammunition compatibility, weapon links, individual copies, outside-combat fill/top-up/empty, conservation/retry protection and loaded-content safeguards. See [implementation/migration handoff](docs/magazine-inventory-handoff.md), [schema](src/db/magazine-schema.ts), [catalog service](src/features/items/magazine-catalog-service.ts), [inventory service](src/features/items/magazine-inventory-service.ts), [panel](src/app/characters/magazine-panel.tsx), [DB tests](scripts/magazine-inventory-db.test.ts).

**Implemented:** attach a particular owned magazine to a weapon; select/swap physically compatible copies; use its capacity/ammunition and consume its rounds once; preserve removed-magazine contents; prevent duplicate attachment/accounting; handle interrupted operations and existing firearm state safely. Matching ammunition does not imply physical magazine compatibility. No magazines are manufactured and existing weapon rounds require an explicit unload transition.

Actual magazines retain their contents when removed. This **supersedes** the earlier temporary “return leftover rounds to loose inventory on swap” idea. Prepared rounds are now available through exact attachments. **12 September ruling:** Brannan chose a separate authored Initiative cost per round for filling detached magazines during combat. That field is implemented without a guessed numeric value; the weapon reload cost remains the swap cost.

**Verified detached filling:** [service](src/features/tabletop-operations/combat-magazine-fill-service.ts), [combat controls](src/features/combat-screen/magazine-fill-controls.tsx), [runtime progress integration](src/features/tabletop-operations/runtime-integration-service.ts) and the magazine schema/editor field are present. The final 23-case [firearm/magazine service suite](scripts/combat-completion-firearms-db.test.ts) includes completed/interrupted fills, full-cost affordability, zero-cost opportunity/busy guards and retries; the [browser results](artifacts/combat-screens/results-firearm_magazine.json) cover actual Player/G.O.D. filling and swapping. Implementation is complete for this confirmed scope; human acceptance is pending.

**Handling boundary:** the ordinary Character inventory panel cannot fill/top-up/empty magazines during active combat, and outside-combat firearm setup cannot bypass Initiative. Combat **Item → Fill magazine** can fill an owned detached copy; combat firearm preparation can insert/swap/remove a compatible magazine using its authored cost and normal opportunity/authorization rules. These supported combat operations are not prohibited by the ordinary inventory restriction. Clips, separate chambers and mixed loads remain deferred.

### 7. Catalog readiness — audited; authored values still required

Identify missing weapon values and exact editor/field repair locations before combat. Preserve unknown values; Brannan intends to fill existing weapon/ammunition fields. Check unresolved imported spell quantity discrepancies against intended effects and the current saved spell. Historical import warnings are **not proof every flagged spell is currently broken**. Do not bulk-correct from warning counts; begin with a demonstrated discrepancy and its authored source.

## Completed work to preserve

Status: **completed implementation**, with human acceptance limited to cases actually tried.

- Exact learned catalog spell Skill rolls; entered physical and generated digital roll controls feeding shared calculations.
- Original casting roll determines ordinary damaging-spell hit location using target anatomy; initial success counting and all-static/all-per-success cases work. Mixed scope remains open.
- Mana spent once at cast start; no refund on failure/interruption/cancellation; effects at completion.
- One result review for supported direct spells and ordinary attacks. Temporary AoE calculates/reports area effects and completes without selecting occupants or applying combatant HP/effects, including the existing failed/critical report path.
- Head 0 means unconscious; -1 or below means dead. Single whole-body targets such as Slime are incapacitated at 0 and dead at -1 or below. Limbs at 0 or below record incapacity. Preserve role-appropriate alerts and exclusion of dead/incapacitated actors from choices.
- No armor/soak means zero damage blocked. Preserve target damage application, including Slime 1, and the absolute G.O.D. force-end override.
- Magazine conservation, copy identity, permissions and loaded-content safeguards. The active-combat restriction applies to ordinary inventory handling; supported Initiative-based magazine filling/swapping remain allowed.
- Existing Hold, simultaneous-action/privacy machinery, overlapping timing, Freeze/resume, immutable records and server authorization, subject to priorities 1–2.

Evidence/tests: [health/report implementation](docs/reports/combat-health-and-attack-reports-2026-09-09.md), [spell DB](scripts/combat-completion-spells-db.test.ts), [conditions DB](scripts/combat-completion-conditions-db.test.ts), [damage DB](scripts/combat-completion-damage-db.test.ts), [Freeze DB](scripts/combat-completion-freeze-db.test.ts), [force-end DB](scripts/combat-completion-force-end-db.test.ts).

## Newer rulings, superseded notes and unanswered questions

| Topic | What governs resumption |
| --- | --- |
| Busy actors | The older [completion contract](docs/rules/combat-completion-contract.md) and [assignment](docs/rules/combat-completion-assignment-2026-09-08.md) permit defense during unfinished actions. The latest prohibition supersedes those passages and related trace/test expectations. Preserve historical records; update acceptance expectations explicitly. |
| Unaffordable starts | The old `allowsMultiRound` bypass is fixed. Conflicting passages in the historical [Initiative contract](docs/rules/initiative-runtime-contract.md) do not authorize unaffordable starts; the confirmed full-known-cost rule governs. Costs added after valid commitment remain distinct. |
| Spell scaling | Active progressive-tier modifier selection is fixed and tested. Mixed fixed/per-success scope is a rule question awaiting Brannan's review, not a confirmed unresolved implementation bug. Older completion claims cover uniform cases only. |
| Awareness/injury | Older broad questions are narrowed: G.O.D. retains genuine response decisions; ambush precedes combat; only the specified hand/leg timing penalties are confirmed. |
| Reloads | Completed Single insertions persist. Replacement magazines are usable after swap completion; removed actual magazines retain contents. Older fixed-count/loose-return assumptions do not settle physical magazine behavior. |
| Deferred | Clips, separate chambers, mixed ammunition inside one magazine, mapped AoE occupants/application, spell component/anatomy restrictions and unrelated site work. Non-firearm projectile ammunition workflows are not implemented by the verified firearm phase. |
| Detached-magazine filling | Implemented and tested in `37d48e5`; Brannan's walkthrough is pending. The separate authored cost per round governs completed insertions; interruption retains inserted rounds. Do not infer that cost from weapon reload cost or invent its value. |
| Inventory versus combat handling | Ordinary inventory filling/emptying is blocked in active combat. Supported Initiative-based detached filling and compatible firearm magazine swaps are allowed through combat controls. |

If implementation exposes another scope/cost/timing conflict, record the exact question and ask Brannan rather than guessing.

## Historical workaround and clean retest starting point

The following workaround describes the old implementation. Priority 1 now handles busy prompts automatically through audited service reconciliation and preserves free actors' ordinary choices. The clean-encounter guidance and warning about invalid unaffordable commitments still apply.

For the incorrect crossover prompt, select **No, cannot respond** for an already-busy actor or a free actor taking no response. This dismisses that opportunity without spending Initiative or marking them Passed. Busy actors continue their action; free actors choose normally when available. For a free actor this records an ineligibility ruling: it is a workaround, not the intended flow.

For a genuine response by a free actor, allow eligibility and use **Defend**. If already allowed but declined, choose **no-reaction → Commit response**: zero Initiative, no roll, no defense. If normal actions stay blocked, record the precise blocker.

**Next round does not repair Bull/Ysra's invalid commitments.** It retains pending attacks and remaining costs. Later outcomes in that encounter carry known incorrect state.

For clean acceptance after fixes, preserve the old encounter/history and use a **new user-authorized test encounter** or the existing disposable harness. Start with able actors, known HP/resources, no pending actions/stale response opportunities and recorded Initiative. Reproduce a 2-point actor with an action costing more than 2, an exact-cost action, and free/busy crossover actors. Establish the 2-point case through an explicit supported G.O.D. correction or fixture; do not edit historical rows, silently reset the campaign or recreate history.

## Next human walkthrough

1. Review the [catalog repair report](docs/reports/combat-catalog-repairs-2026-09-12.md), author the exact values needed for the chosen weapons/magazines/spell, then use a fresh authorized encounter. Preserve the old Bull/Ysra encounter and history.
2. Start Session, Scene and Encounter, then initialize combat. Check the prerequisite tips and inspect the roster/HP/resources before acting.
3. Test free/busy crossovers and simultaneous choices in both submission orders: independent targets, G.O.D. Yes/No, optional defense/no-reaction, Hold and Pass. Busy actors must receive no second action or response prompt; sealed choices stay private.
4. With 2 Initiative, reject a cost above 2 without spending resources, allow an exact-cost action, and check Hold/unused carryover. Repeat with the confirmed hand/leg penalties; verify health/condition alerts and inspectability.
5. Try ordinary attacks, uniform/static/per-success learned spells and an authored progressive tier. Check entered/generated Roll parity, initial-success counting, once-only Mana/damage and the existing AoE report-only boundary. Discuss mixed scope separately; do not treat it as an implemented rule.
6. Prepare exact firearm/magazine copies outside combat, then test Single loading, interrupted insertions, completed/interrupted swaps, detached filling at the separately authored cost, and sustained-fire response points. Check removed-magazine contents, per-bullet results, once-only ammunition under refresh/retry, Freeze/resume and force-end.

Record exactly what Brannan tried, expected and observed. Passing automated fixtures are preparation for this checklist; only his actual walkthrough establishes human acceptance for those cases.

## Acceptance and future resume behavior

When Brannan says “let's finish fixing combat,” “resume combat,” or similar:

1. Read this handoff; inspect current branch, HEAD, worktree and intervening changes. Preserve others' work. Verify database/deployment state only if needed for resumed work.
2. Briefly remind Brannan what worked, what blocks combat and the next priority. Start with the current status and first unfinished walkthrough/catalog/rule item under his direction; do not restart completed phases or treat historical instructions as the work queue. [AGENTS.md](AGENTS.md#resuming-combat-work) already routes “let's finish fixing combat” here.
3. During walkthrough triage, investigate narrowly, explain the demonstrated blocker and estimate usage before implementing it. Avoid broad exploration while usage is limited.
4. Demonstrate one issue at a time through **Player and G.O.D. controls**: independent overlaps, busy actors, exact/insufficient Initiative, carryover, Hold, defense/decline, ordinary attacks, learned spells and AoE, injury timing, firearms and magazines. Mixed scope still needs Brannan's rule confirmation.
5. Entered/generated rolls must calculate identically. Verify damage, Mana and ammunition apply once under refresh/retry, Freeze/resume and force-end. Preserve genuine G.O.D. decisions; remove unnecessary bookkeeping prompts. Automated rehearsal is not human acceptance.
6. When new implementation or a reproduced regression needs automated verification, use the [disposable DB harness](scripts/combat-completion-disposable-db.test.ts) and [disposable browser harness](scripts/combat-screens-disposable-browser.test.ts); inspect filters before selecting focused cases. Documentation cleanup alone does not require broad test/browser or migration reruns. Do not run live-DB scripts blindly. Keep intentionally absent legacy Step 13 fixtures absent; do not seed them to force a validation pass.
7. Update this file after each completed fix: status, ruling, changed code, commit, focused checks, human acceptance, remaining limits and actual migration/deployment state. Cody and Ember resume from this same record. Do not push/deploy without current authorization.

The historical priority 1 stopping point is `4dd5923`; the preserved follow-up is `37d48e5`. This handoff reconciliation is a separate local documentation commit. No gameplay code, catalog values, encounter records or database state were changed during reconciliation; no tests/browsers/migrations were rerun and no push or deployment occurred. Recheck the current checkout rather than resetting to either recorded commit.

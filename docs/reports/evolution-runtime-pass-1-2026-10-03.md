# Evolution Runtime Pass 1 — permanent Evolution during Encounters

Started from `f22b96891f67df814ca69dd85865157639f6e7cc`. This pass extends the existing permanent Evolution service. It does not resume Magic work, enable live Return, create Forms runtime, add a combat action, spend Initiative, introduce activation timing, or create automatic triggers. No Production data or shared migrations were changed. No push is authorized.

## 1. Previous Evolution behavior

The existing Race/Creature preparation, requirement evaluation, exact path/version checks, AND/OR/manual confirmations, Campaign Race enablement, Skill grant checks, archive rules, permanent mutations, Health preview, authorization, immutable event insertion and durable request keys remain authoritative. Only the current Campaign-owning G.O.D. can execute; Player, foreign G.O.D. and Admin-only requests remain rejected. Existing out-of-Encounter Evolution and historical Return regressions pass.

## 2. Active Encounter safety boundary

Each active/planned membership for the positive individual is inspected. Active Encounter participation is permitted when the Encounter is unfrozen and the individual has no unfinished mechanical involvement. Actor, target, protected target, reactor, responder and effect-subject identities are inspected in actual lifecycle rows and structured evidence. A checkpoint involving the individual must be revealed. Interrupted/resumable work remains unfinished.

An unrelated action elsewhere in the Encounter does not block this individual. Resolved, cancelled or abandoned declarations and completed effect outcomes remain historical. Table presence alone is not a blocker. Neutral High/Low requests are not Race/Creature-dependent prepared mechanics.

An identity-only planned membership remains nonblocking. A planned membership with a Creature snapshot, local state, Initiative runtime/enrollment, frozen state or unfinished preparation blocks. Evolution never rewrites that preparation. A frozen active Encounter explicitly says to resume before Evolution.

## 3. Inspected blocker tables and lifecycle rules

| Table | Unfinished involvement that blocks |
| --- | --- |
| `campaign_session_encounter_declaration_checkpoint` | Unrevealed checkpoint naming the individual, or containing a declaration involving it. |
| `campaign_session_encounter_action_declaration` | Draft, locked, committed, rolling-ready, rolling, awaiting-god-ruling or interrupted actor/target/source involvement. |
| `campaign_session_encounter_pending_action` | Active or interrupted own action, or linked declaration involving the individual. |
| `campaign_session_encounter_pending_action_source` | Pending/needs-ruling source outcome naming the individual, including legacy grouped Spell targets, unless the parent is abandoned/ended or the linked declaration is already terminal. |
| `campaign_session_encounter_reaction` | Declared/needs-ruling defense or reaction involving the reactor, protected target, target or originating action. |
| `campaign_session_encounter_responder_opportunity` | Pending/response-declared opportunity involving the individual while its parent action/declaration/reaction remains unfinished. A lingering opportunity under completed history is not a blocker. |
| `campaign_session_encounter_effect_plan`, `campaign_session_encounter_effect` | Unreviewed/unapplied/partially-applied/failed/ruling plans involving the individual, or unfinished effects even if their plan is labelled applied. Declined/cancelled/superseded plans are historical. |
| `campaign_session_encounter_firearm_attack` | Unfinished actor/target attack or firing portions. Completion uses the committed Roll, finished Initiative/declaration, resolved firing portions and terminal plan; a historical `consequence-planned` or `requires-god-ruling` label alone does not block. All associated plans/effects are independently checked. |
| `campaign_character_firearm_preparation` | Pending, interrupted or requires-god-ruling preparation for the individual. |
| `campaign_session_player_ruling_request` | Pending/clarification-requested source, range or Called Shot ruling involving the individual and linked to unfinished action/reaction/firearm work. Unbound requests do not freeze mechanics. |
| `campaign_session_called_check_request` | Pending, answered or requires-god-ruling check for this recipient, scoped to the Encounter or its Session/Scene without an Encounter ID. Resolved/cancelled/superseded checks are historical. |

Membership, Encounter, Session, Scene and Initiative tables supply boundary context. The existing fact fence is extended to these runtime dependencies, including firearm bullets and Called Check batches. Bullet outcomes are judged through their owning attack/portion and effect-plan lifecycle; historical bullet rows are not blanket blockers. Batch insertion precedes Called Check mechanical preparation and is fenced as well.

## 4. Race transition

The original execution writes the destination Race and applies only the path's existing permanent Attribute and HP/movement/magic-step adjustments. Normal Race readers immediately resolve destination anatomy, HP, Size, movement, Natural Protection, Natural Attacks, grants, Base Magic, caps and Interaction Rules. New Natural Attack choices discard the source Race. Saved Attributes are not clamped to creation caps. No new adjustment semantics were introduced.

## 5. Creature transition

The existing constructor replaces the positive Creature NPC's baseline/current snapshot and current Creature identity, preserving its existing HP Adjustment. Future attack, attribute, anatomy, movement, ability, defense, protection, Skill and Interaction Rule reads use that saved snapshot. Direct negative occurrences cannot enter this service. Editing a Creature master afterward cannot rewrite the event's frozen transition snapshots.

## 6. Initiative and identity

Evolution writes no participant, enrollment, pending-action or Initiative runtime row. The same positive Character ID and participant serial ID remain. Round, step, timeline, established Initiative, Hold/Pass/participation status and controller remain exact. No cost, enrollment, extra turn, DEX-based repositioning or replacement combatant is created. Tests compare persisted runtime rows before/after and after replay.

## 7. Health and injuries

Total damage, exact pool damage, unresolved injuries, resolved injury history, limb state and Health history remain stored without changes. The destination body supplies the effective view. Old pool identities remain orphaned; they are not matched by name, redistributed or deleted. Existing low/zero remaining HP warnings and acknowledgement still apply. Evolution neither heals nor adds revival/death handling.

## 8. Conditions, Modifiers and durations

Active Conditions, Modifiers, exact duration bindings, periodic Health effects and effect history remain unchanged. Tests include a periodic effect and limb state referencing an old pool. Evolution does not retarget or clear those records. Existing orphan/unresolved handling remains responsible for later use of absent anatomy; no new effect lifecycle rules were added.

## 9. Inventory, equipment and ownership

Existing stacks, instances, equipment state, custody, containers, charges, magazine state, Campaign membership, controllers and owner links are preserved. The service still owns only its prior permanent mechanics fields and event insertion. Equipment fit remains an explicit warning for the G.O.D.; no automatic resizing, refitting or unequipping occurs. Companion profile, disposition and Vessel fields are untouched; no companion combat runtime was introduced.

## 10. Combat refresh

A successful forward transition publishes the existing Character-state notification and an Encounter-wide `character-state` invalidation inside the execution transaction. PostgreSQL delivers it after commit. The Encounter notification carries no private mechanics and reaches authorized G.O.D./Player viewers, including other combatants who may target the individual. Existing combat reload/source-list effects consume it. Browser tests leave combat open while executing on each existing sheet and observe old attacks disappear and destination attacks appear without navigation or reload.

## 11. Historical actions/results

Evolution never updates prior Rolls, declarations, plans, effects, Health applications or spending. A real Natural Attack is completed before Evolution; its frozen source and all combat rows remain exact afterward. A subsequently locked action contains the destination attack. Completed projectile consequences also cease blocking despite historical status labels. No historical attack is recalculated against the destination body.

## 12. Immutable runtime evidence

Existing event evidence JSON now optionally includes Encounter ID and copied name/type/status, Session/Scene IDs and copied names, participant serial/Character IDs, participation status, current Initiative, round, step, timeline, frozen state and the confirmed clean boundary. Out-of-Encounter events omit this context. Historical UI renders these copied values, not mutable names fetched later. No new table or schema migration is required.

## 13. Concurrency and idempotency

Preview remains read-only. Execution repeats the boundary and current-fact evaluation inside the existing protected transaction, after its advisory request lock, fresh G.O.D. authority, fail-fast fact-table fence and Campaign/Encounter/individual locks. The runtime tables inspected by the boundary join that fence. Existing combat writers acquire the Encounter lock before reading/freezing mechanics.

Tests exercise a writer already holding the Encounter lock, a new declaration committed after preview, a runtime insert blocked behind the fact fence, and an actual old-source action waiting behind Evolution at its event-insert gate. After Evolution commits, that old-source action rejects and rolls back. The same-key concurrent live requests return one event and one replay for all three individual types; changed input under a successful key still rejects. Notifications and permanent mutations commit together. No Initiative write is repeated.

The existing fence is intentionally broad across fact tables and may return a transient busy error during another transaction, even unrelated work. This pass retains that fail-fast tradeoff rather than changing every writer's locking protocol. A retry/fresh preview is required when current facts change.

## 14. UI behavior

Existing Character/Race NPC G.O.D. tabs and Creature NPC Evolution workspace show current Encounter, Session/Scene, participant status, Initiative, round/step/timeline and `Available now at this Encounter boundary` or blockers. Review retains destination mechanics/Health and equipment warnings, requirement confirmations and the existing durable retry flow. No raw JSON or second combat editor is exposed. Success refreshes the individual, destination, history and combat choices. Existing stale Form preview/reference selection cleanup remains unchanged. Live Return continues to show its separate active-Encounter blocker.

## 15. Remaining limitations and rollout

- Hands-on Brannan/Ember acceptance remains outstanding; automated browser coverage used Chrome at desktop and 390px widths.
- No production build or other-browser/device matrix was run in this pass.
- The table fence retains the existing global write-contention tradeoff described above; scale/performance under a busy shared database was not benchmarked.
- Existing checked-in `0087_evolution_history_returns.sql` and `0092_race_natural_attack_runtime.sql` may still require separately authorized shared-environment rollout. Only disposable migration chains were applied here; live migration status was not queried.
- Live Return, Forms runtime, active Form coordination, Initiative/timing authoring, triggers, Player execution, Special Ability runtime and companion combat remain outside this pass.
- No deployment, Production mutation, shared migration application or push occurred.

## 16. Verification

- `node --import tsx scripts/creature-evolution-disposable.test.ts --browser`: **154 database cases across 14 suites passed**, including Evolution authoring/requirements/execution/destination creation/Return, 18 initial live-runtime cases, Race Forms/mechanics/preview, Creature Forms, ownership, commerce, lifecycle and migration rehearsal. The final focused live-runtime suite expands to **19/19** and covers linked rulings and Encounter/Session Called Checks plus concurrent live replay.
- The same wrapper's browser runner passed existing Evolution authoring and Character/NPC Return/printing regressions plus the three new live sheet-to-combat refresh workflows, frozen UI rejection, history, same participant/Initiative rows, and desktop/390px layout. Generated screenshots were inspected. Logs/screenshots/PDFs are under `artifacts/guidance/creature-evolutions/`.
- `node --import tsx --test scripts/combat-completion-disposable-db.test.ts`: **522/522 cases across all 30 suites**, final run 194 seconds; covers Race Natural Attacks, Creature Attacks, incoming effects/protection, Active Health/injuries/limbs, declarations/defenses/effects, resources/equipment, Initiative/freeze/force-end/closeout and retained runtime regressions. Firearm cases now additionally assert live Evolution attack/preparation boundaries and completed-history handling.
- `npm.cmd run validate:unit`: **1,883/1,883**, 210 feature test files.
- `npx.cmd next typegen`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npx.cmd drizzle-kit check`, `git diff --check`: passed. Type generation and final typecheck ran after the browser harness restored the repository configuration.
- Fresh disposable databases replayed all **93 checked-in migrations**. Populated 0082-to-current and 0086-to-0087 upgrade rehearsals preserved prior rows/history.
- Existing Evolution Pass 2/3/4 fixtures used obsolete `Physical` Skill classifications; those fixtures now author `standard`, preserving current Campaign Skill restrictions. Early new-case failures were incomplete fixture lifecycle timestamps/identities and were corrected; no grant, range or database lifecycle checks were weakened.

Evidence logs: `artifacts/guidance/evolution-runtime-all.log`, `evolution-runtime-new-final.log`, `evolution-runtime-combat-final.log`, `evolution-runtime-unit.log`, `evolution-runtime-typecheck-final.log`, `evolution-runtime-lint-final.log`, `evolution-runtime-drizzle.log`.

## 17. Evolution Runtime Pass 2 — live Return only after authorization

Live Return remains blocked for every active Encounter. A later authorized pass must connect the existing historical Return service to the same clean boundary, record Return runtime context, publish transactional combat refresh and verify historical Race deltas/Creature snapshot restoration during active participation. It must preserve current damage, effects, equipment, owner/controller and established Initiative; recheck concurrency/retry/freeze/closeout; and refresh current choices without reviving obsolete history. Forms coordination remains a separate decision. Do not begin Pass 2 automatically.

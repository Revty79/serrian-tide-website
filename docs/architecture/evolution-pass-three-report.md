# Evolution Pass 3: persistent Race and Creature execution

Implemented against approved Pass 2 baseline `392485765c2609283e24752e1b59d8c655034d31`, including the subsequent permanent Race mechanics correction. The release commit is the commit containing this report; its SHA is provided in the completion message.

Pass 3 performs permanent, out-of-Encounter Evolution on the **same positive `campaign_character.id`**. It adds no combat actions, Initiative costs, reactions, runtime Form changes, companion combat controls, automatic triggers, or new individual records. No deployment or live database migration was performed.

## Race architecture and the permanent mechanics correction

The inspected Race/Character architecture distinguishes these authorities:

| Authority | Mechanics |
| --- | --- |
| Exact saved Race definition | Size, anatomy/pools/hit locations, movement modes, Natural Protection, Natural Attacks, racial Skill/Special Ability links, base magic, Forms/Access, Interaction Rules, Attribute caps and descriptive Race fields |
| Saved individual | STR/DEX/CON/INT/WIS/CHR; permanent HP multiplier, movement and magic step counts; purchased Skills; owned Derived Abilities; XP/Quintessence; personal profile and state |
| Existing resolvers | HP from saved CON and multiplier steps; movement/magic from Race bases plus individual steps; Skill calculations; Derived Ability availability from its existing Attribute/Skill/system requirements |

Changing `race_id` alone does **not** change saved Attributes or permanent steps. Race caps are not replacement Attribute values. Race-owned Special Abilities use the existing racial Skill-link model; this pass does not invent a Race-owned Derived Ability grant system.

`race_evolution_paths.transition_json` now authors only the otherwise independent saved mechanics:

- `attributes`: unique Attribute key, `add` or `set`, finite numeric value.
- `hpMultiplierSteps`, `baseMovementSteps`, `baseMagicSteps`: optional `add`/`set` adjustment of the existing whole-number step count.
- `schemaVersion: 1`; null means no individual adjustments. Existing paths acquire no inferred adjustments.

Add can increase or decrease a value; Set replaces it. Negative outcomes, missing targeted Attributes, unknown keys, duplicate keys, nonfinite values and fractional step counts are rejected. Results are never clamped or constrained by creation-time caps. A step retains its existing meaning: 0.25, with the Character HP multiplier starting at 2. Nothing is purchased or charged.

Path authoring validates this structure, bumps the existing path version, respects existing source-library permissions, and copies adjustments independently when cloning a Race variant. Destination definition mechanics are not duplicated into transition fields.

### Exact Race writes

In one transaction:

1. Set `campaign_character_profile.race_id` to the exact destination.
2. Update only explicitly authored `hp_multiplier_steps`, `base_movement_steps` and/or `base_magic_steps`.
3. Update only explicitly authored `campaign_character_attribute.value` rows.
4. Insert one `race_evolution_events` row.

The preview and event include the authored transition and exact before/after saved values. The destination's current Race mechanics resolve normally. No Character Race-mechanics snapshot is created. Unspecified individual mechanics remain unchanged. Identity, Campaign, player, ownership, all other profile fields, purchased Skills and Derived Ability ownership/history remain untouched.

## Creature execution

Creature execution uses the existing constructor functions: `readCreatureNpcTemplateInTransaction`, `buildCreatureNpcSnapshot`, `normalizeCreatureNpcSnapshot`, and the existing snapshot parser. The loader now also supports an explicitly unlocked read for a read-only preview or an already protected transaction; existing construction callers retain their default locking behavior.

Exact writes are limited to `campaign_creature_npc_profile.creature_id`, `baseline_snapshot_json`, `current_snapshot_json`, and insertion of a `creature_evolution_events` row.

The destination baseline contains the exact active master mechanics at zero HP Adjustment. The destination current snapshot is normalized from that baseline using the individual's unchanged HP Adjustment. It includes destination Attributes, size, HP multiplier, anatomy, attacks, abilities, defenses, movement, Skills, Forms, Interaction Rules and the other constructor-owned mechanics. Source Forms are replaced; no Form activates. No matching or merging by names, positions or similarity occurs.

Mechanical override comparison normalizes source baseline and current snapshots at zero HP Adjustment. It compares mechanical sections with stable object-key ordering, excluding descriptive master metadata and recomputed HP totals. HP Adjustment alone is not an override. Meaningful edits trigger a separate mandatory replacement acknowledgement. All four raw snapshots and HP Adjustment remain in the immutable event.

The Character ID, owner, player/controller, Campaign, individual name, NPC kind/build mode/role, personality, instance notes and unrelated profile data remain unchanged.

## Health, possessions and effects

- Preview computes both health views using existing anatomy and Active Health projection functions. It never initializes or writes health rows.
- Total damage, every persisted pool-damage row and every resolved/unresolved injury remain exactly unchanged.
- Exact pool identities continue to resolve normally. Missing old pools retain historical damage through existing orphaned-pool projection. No display-name mapping is attempted.
- Lower maxima and zero remaining HP are displayed before confirmation. Evolution does not heal, scale/clamp stored damage, resolve injuries, or record death/revival.
- Inventory stacks, exact Item instances, equipment, charges, magazines/firearms, containers, custody, commerce and ownership history are untouched.
- Equipment remains in its current state. There is no general authoritative fit reconciliation routine to apply here; the G.O.D. receives an explicit fit-review warning.
- Experience, total Experience, Quintessence, currency, fame, fate, spells, conditions, modifiers, durations and existing effect history are not consumed, granted or cleared.

## Authority, prerequisites and confirmation

Preview, history and execution require the **current Campaign-owning G.O.D.** Execution rereads the role table and Campaign owner in its transaction. Admin alone, foreign G.O.D.s, library authors, Players, companion owners and stale role claims do not authorize execution. Archived individuals/Campaigns cannot evolve; their history remains readable to the current Campaign G.O.D.

Pass 2 eligibility readers now expose transaction-scoped reads, while retaining their original repeatable-read/read-only preview wrappers. Execution reuses those same facts/evaluator. AND-within-group and OR-across-groups remain the shared requirement primitives.

Explicit authored manual requirements can be confirmed by exact key for this execution. A Form qualification can be confirmed only when an existing viable Form Access group needs authored manual clauses, without missing automatic facts. Unknown age/XP, missing numeric Form facts, or unresolved inventory data cannot be converted into automatic success by checking a box. The saved facts must first be corrected, or a separately authored viable alternative group must qualify.

Every confirmed key and the original and confirmed group results are retained in the event. Failed automatic requirements cannot be overridden. Requirements remain prerequisites; nothing is consumed. The confirmation grants no permanent approval state.

The server recomputes eligibility and both health projections. A canonical SHA-256 review token binds the shown consequences to the individual, path/version, source/destination mechanics, health, requirement results and current Creature owner. A changed review requires a refreshed preview. This token is a stale-review check, never an authorization or eligibility decision.

## Atomicity, idempotency and concurrency

The complete request has a durable execution key and a canonical request hash including actor, kind, subject, path/version, review token and exact confirmations. The same successful request returns the original event, even after the individual's source has changed. Contradictory reuse fails. Both typed event tables share an advisory-lock key namespace, preventing cross-type key reuse races. A browser network retry retains its original request/key; changed confirmations obtain a new key.

History insertion and all assignment/mechanical writes share one transaction. Tests force an event-insert failure after the writes and prove complete rollback.

**Concurrency tradeoff:** existing inventory, effects and runtime writers do not all acquire one common Character-row lock. Pass 3 therefore uses a short, deterministic, table-level `SHARE ROW EXCLUSIVE ... NOWAIT` fence over its explicitly registered authoritative fact tables. This covers inserts as well as edits/deletes, including new Encounter enrollment before a participant row exists. Ordinary reads remain available, but unrelated writes to these fact tables can briefly contend with Evolution. Busy executions fail clearly and make no partial changes. This conservative correctness boundary is not a high-throughput, per-individual locking design; narrowing it later requires a shared writer protocol.

After the fence, the transaction reauthorizes and takes explicit Campaign, Campaign Encounter, subject/current-owner, profile, path, and ordered source/destination row locks. It rechecks exact source, type, archives, revision, requirements, current owner inventory, snapshots and consequences. Row locks are fail-fast; lock wait timeout is three seconds and each SQL statement has a 15-second timeout. There is no automatic broad transaction retry. Same-key requests serialize through their advisory transaction lock and replay the original success.

### Encounter boundary

Any active Encounter participation by the positive persistent Character ID blocks execution, across combat/social/chase/exploration/other and frozen/unfrozen Encounters. Negative direct Creature occurrence IDs never enter this service.

Planned persistent participant rows normally contain only identity and resolve mechanics later; those remain untouched. Planned participation with local snapshot/state, a frozen marker or an Initiative root fails safely. Completed Encounter/history rows remain untouched. Evolution writes no Encounter/runtime tables. The fact fence and Encounter locks prevent start/enrollment from crossing the transition.

## History and lifecycle

Forward migration **`0085_evolution_persistent_execution.sql`** adds:

- `race_evolution_events`: event/Campaign/individual/path/source/destination IDs, path version, actor/time, unique execution key, request hash and JSON evidence.
- `creature_evolution_events`: equivalent typed Creature references plus source baseline/current and destination baseline/current raw snapshots and HP Adjustment.
- Optional authored Race transition JSON and its versioned shape check.
- Database UPDATE-rejection triggers for both event tables.

Foreign keys restrict deletion of referenced individuals, paths, source/destination definitions, Campaigns and executing users. Library path deletion gives a readable history-dependency error. Individual/definition lifecycle previews show Evolution history blockers; account-deletion dependency inventory includes both actor references. Archives preserve readable history.

Explicit Campaign graph deletion removes its own event rows before deleting individuals. Tests prove that other Campaign events and shared definitions/paths survive. No Undo exists; an authored return path creates a new event on the same individual.

## UI

The existing Race/Creature eligibility dialog now offers reviewed execution. It shows exact individual/source/destination IDs and names, path revision, original prerequisite groups, exact manual confirmations, definition-mechanics comparisons, authored Race saved-value changes, before/after health, orphaned damage/injury counts, equipment warning, override replacement confirmation and active/prepared Encounter blockers.

The final action names the individual and destination. Success displays the event ID, retains the same individual, refreshes its current-source next-stage paths, and presents history. History is also reachable from the G.O.D. Character editor and NPC index, including archived NPCs. Creature history has expandable readable mechanical summaries and optional full recorded snapshot data.

Interfaces use shared semantic theme variables, existing GuidedField guidance and native scrollable dialogs. Desktop and 390px checks cover authoring, confirmations, execution, success/history, reachable buttons, wrapped warnings and viewport bounds. Automated browser checks had no page errors; screenshots were inspected. These checks do not replace human acceptance or physical-device testing.

## Validation

- **563/563** domain/render tests covering Evolutions, Races, Creatures, Forms/Access, NPCs, Active Health/Effects, Items, lifecycle, catalog visibility and shared-library authorization.
- **9/9 Pass 1**, **9/9 Pass 2**, **12/12 Pass 3** disposable database scenarios. The Pass 3 cases cover both Race individual kinds, full Creature snapshots/overrides, exact row preservation, authorization/archives, replays/concurrent duplicate calls, manual alternatives, unknown facts, stale revisions/state, current-owner Item availability, all Encounter types/freeze states, transaction fencing, rollback, immutable/restrictive history, chains/reverse paths, clone independence, XP/Skills/condition revalidation, invalid mechanical outcomes and explicit Campaign graph deletion.
- Existing disposable regression suites: **34 Race Forms/preview cases**, **21 Creature Forms cases**, **6 Ownership Pass 1 cases**, **16 Ownership/commerce/companion equipment and Item-use cases**, and lifecycle/migration rehearsals.
- **232/232** containment/inventory/lifecycle/Skill-framework/tabletop-lifecycle/magazine/firearm/freeze cases.
- **225/225** selected core combat completion cases, including participant identity, participation, checkpoints, damage, spells, effects, Items/abilities, firearms, XP/recovery, conditions/limbs/revival and forced end.
- Fresh **86-migration** chain and staged populated **0082 → 0083/0084 → 0085** rehearsed. Original 185 public-table contents survive; existing path IDs/versions/requirements survive; old Race paths have null transitions; no events are inferred.
- Changed-file ESLint, TypeScript, Drizzle metadata check, whitespace check, production build, desktop and 390px browser checks passed.

An initial **unfiltered** combat harness stopped in the unrelated legacy `magazine-catalog-repair-db.test.ts` fixture: its historical JSON Item import supplies null for the existing required `is_system_canon` column. That test did not reach gameplay assertions. The production Item schema/import tooling was not changed for this task. The core combat and inventory suites above ran separately and passed; this report does not claim the unfiltered catalog-repair harness passed.

Build and browser fixtures use disposable PostgreSQL, never DEV/production. Logs and screenshots are in ignored `artifacts/guidance/evolution-pass-three/` and `artifacts/guidance/creature-evolutions/`.

## Supplemental permanent Race adjustment audit

The supplemental amendment builds on shipped Pass 3 commit `829a8ab`; it does not restart execution or add another Evolution system.

- The **Permanent Character Changes** editor now exposes all six signed Attribute fields and all three signed step fields, with zero shown for unconfigured adjustments. Add preserves the purchased value and adds the authored delta; zero adds nothing. The existing Set option remains explicitly labeled as replacement, with separate guidance that Set zero replaces the value with zero.
- Every new Race execution snapshots `raceTransition.appliedAdjustments`: `attributeAdjustments` by key, `hpMultiplierStepsAdjustment`, `baseMovementStepsAdjustment`, and `baseMagicStepsAdjustment`. These are the actual differences between saved before/after values, including zero changes and the actual delta of any Set operation. Authored rules and complete before/after values remain alongside this evidence.
- History displays the applied signed deltas. Older immutable events remain readable using only their own before/after evidence; the reader never consults today's path and does not rewrite historical rows. No reversal operation has been added.
- Integration through the existing Character sheet exposed a missing Campaign boundary. Race execution now requires the destination in the existing Campaign Race list for NPCs, or the playable Race list for PCs. Both preview and execution enforce this and tell the G.O.D. what to enable. The transaction fence includes both lists, preventing a removal between validation and commit. Evolution never changes Campaign configuration itself.
- Expanded disposable coverage verifies STR increases, CHR decreases, simultaneous Attribute changes, CON/HP-step effects through the existing Active Health reader, signed movement/magic step changes, explicit zeros, retained purchased Skill rows, destination anatomy/movement/Skills/base magic through the real Character sheet, caps below evolved scores, unchanged stored damage/injuries, undamaged new anatomy, exact applied history after path edits, duplicate retries, negative Attribute and each negative step result, rollback, independent clones and Creature snapshot isolation. Campaign-list removal after preview and concurrent writers also fail without partial changes.

Supplemental verification passed: **125/125** focused domain tests; **33/33** disposable Evolution scenarios (9 Pass 1, 9 Pass 2, 15 Pass 3); fresh/staged migration rehearsals; desktop and 390px browser checks with screenshots inspected; TypeScript, changed-file ESLint, Drizzle metadata check, whitespace check and the production build. Evidence is in `artifacts/guidance/evolution-pass-three/supplement-*.log`. The broader validation counts above describe the original Pass 3 release, not additional reruns for this amendment.

The amendment changes no Drizzle schema, SQL migration, snapshot or journal. Its additional evidence fits the existing event JSON. The original `0085_evolution_persistent_execution` migration is still required wherever the Pass 3 schema has not been applied. No live database migrations or deployment were performed for this amendment.

## Live migration audit and rollout still required

Read-only audit on 2026-09-28 used `default_transaction_read_only=on` and repeatable-read/read-only transactions. Applied Evolution migration hashes matched checked-in files.

| Database | Current ledger | Required forward migrations |
| --- | --- | --- |
| DEV | 85 entries, through `0084_race_evolutions` | `0085_evolution_persistent_execution` |
| Production | 83 entries, through `0082_creature_evolutions` | `0083_creature_evolution_requirements`, then `0084_race_evolutions`, then `0085_evolution_persistent_execution` |

0082/0083/0084 were not edited. Apply the required schema migrations under separate rollout authorization before running this code against those databases. This pass only committed/synchronized code; it did not deploy or migrate either live database. The combined Forms/Companions/Evolutions runtime project remains deferred.

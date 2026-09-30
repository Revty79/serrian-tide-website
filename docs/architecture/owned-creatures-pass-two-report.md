# Owned Creatures Upgrade Pass 2

Companion Profiles now describe the intended roles, control relationship, combat preference, Mount capability, and relationship notes of an exact owned Creature. G.O.D. configures behavior; Players can edit their own Creature's relationship notes. Ownership changes preserve the authored profile and require review for the new owner.

This is authoring and configuration only. Ownership, travel disposition, and Companion Profile remain separate. Gameplay runtime is unchanged. Stop here for Brannan and Ember review; Pass 3 has not begun.

1. **Commit / push SHA.** Approved base: `66e3804d1a3aacff5be857c5a422d55b4682496f`. The commit containing this report is the completed Pass 2 revision; the delivery message records its exact pushed SHA. After checkout, `git log -1 --format=%H -- docs/architecture/owned-creatures-pass-two-report.md` identifies it.

2. **Files changed.** [changed-files.txt](../samples/owned-creatures-pass-two/changed-files.txt) lists every delivered path. The implementation adds `companion-profile.ts`, its schema/service, authorized management read service, server actions, shared editor/summary/history components, migration 0089 and metadata, and three disposable/browser scripts. Existing Animals & Companions, simple/detailed NPC editors, Character Item-copy rows, lifecycle dependency/deletion plans, account attribution registry, and page guidance consume those additions. Pass 1's encounter guard is reused with a context-appropriate error label. Its migration and stored history meanings are unchanged.

3. **Migration / schema.** [0089_companion_profiles.sql](../../drizzle/0089_companion_profiles.sql) adds three tables: `companion_profile`, `companion_profile_role`, and `companion_profile_event`. It includes primary/foreign/unique keys, legal-choice and field checks, persistent-individual/Campaign identity guards, deferred role/configuration consistency checks, ownership-review handling, and immutable-update history protection. No existing migration, including 0088, was edited. No profile is inferred or backfilled.

4. **Companion Profile storage.** `companion_profile.character_id` refers to the existing persistent Creature NPC profile; a composite foreign key binds that exact individual to its Campaign. It stores control/preference, relationship notes, review state, revision, attribution, and timestamps. The existing `owner_character_id` remains the sole current ownership authority. There are no Pet/Mount/Familiar entities, owner-side copies, Creature-side Vessel eligibility flags, or master/snapshot/Item configuration blobs.

   Absence of a row reads as “Companion behavior not yet configured.” A Player may save notes before G.O.D. configures behavior; that creates a notes-only row with both behavioral choices null and no roles. The interface still reports behavior as unconfigured. This permits harmless notes without inventing authoritative defaults. Only a deliberate G.O.D. configuration sets both choices. An unowned profile retained after ownership removal cannot be edited until a valid current owner is assigned.

5. **Role vocabulary.** The seven recognized identifiers and labels are:

   | Identifier | Label |
   | --- | --- |
   | `companion` | Companion |
   | `mount` | Mount |
   | `familiar` | Familiar |
   | `pack-working` | Pack / Working |
   | `guard-combat` | Guard / Combat |
   | `scout-utility` | Scout / Utility |
   | `other` | Other |

   Other requires a meaningful author-controlled label of up to 120 characters. It is plain narrative text. Unknown or duplicate roles reject.

6. **Multi-role behavior.** `companion_profile_role` has a composite primary key `(character_id, role)`, so each individual can have any combination of the reviewed roles, once each. No role forces another role, Control Model, Combat Preference, or travel disposition. G.O.D. can also deliberately leave the role list empty while setting the two behavior choices; this is displayed as “None selected.” No role grants Attributes, Skills, attacks, abilities, senses, anatomy, protection, movement, carrying capacity, spells, or owner mechanics.

7. **Control Model.** Configured profiles have exactly one of Player Directed, Owner Commands, or G.O.D. Directed. It belongs to the individual and remains editable over time. Another individual from the same master Creature can use a different model. It records intended future decision-making; it adds no Player action authority, command queue, autonomous behavior, training subsystem, or active controller switch.

8. **Combat Preference.** Exactly one of Normally Joins Combat, Normally Stays Out, or Decide When Combat Starts is authored independently. Every role/control/preference combination remains legal. This preference neither enrolls a combatant nor prevents self-defense, removes attacks, disables abilities, or creates Initiative.

9. **Mount model.** Only the Mount role row can store `maximum_riders` and `mount_notes`. Capacity must be a positive whole PostgreSQL integer; optional notes are limited to 500 characters. The editor starts at 1 only when Mount is deliberately added. Nothing reads species, Size, STR, description, or equipment to infer capacity. Removing a saved Mount requires acknowledgement before clearing its fields; removing Other likewise requires acknowledgement before clearing its custom label. Failed saves preserve the stored fields. Toggling a role off and back on before saving retains its local draft values. After confirmed removal, old values remain in history; adding Mount again starts a new deliberate draft at 1. There is no current rider, mounting/dismounting, riding position, movement, saddle requirement, attack, Initiative, falling, or carrying calculation.

10. **Familiar boundary.** Familiar is a role label only. No telepathy, shared senses, spell delivery, magical bonuses, resurrection, teleportation, or summon/recall behavior is granted. Those mechanics remain with their actual owning systems.

11. **Relationship notes.** Optional plain text, limited to 1,000 characters, describes the relationship. It is never parsed as mechanics or executable text. The separate notes command updates only notes and the profile's revision/history. Before behavior is configured, it leaves the choices null and roles empty. In the G.O.D. editor, notes-only save is disabled while role/behavior edits are pending, so it cannot silently discard those unsaved edits; Save Companion Profile saves them together.

12. **Player permissions.** An authorized owning Player can read the profile and edit relationship notes. The Player sees a concise list summary and the notes editor, without authoritative setting controls. Forging a configure command rejects on the server; attempting to attach authoritative fields to a notes command also rejects. Player plus Administrator roles still do not become Campaign-owning G.O.D. authority. Administrator authority alone is read-only for these controls. Another Player, foreign G.O.D., or wrong current owner cannot read/manage the companion through the owner-scoped endpoint.

13. **G.O.D. permissions.** The Campaign-owning G.O.D. can configure all fields for a valid Player Character or Race NPC owner. Simple and detailed Creature NPC editors share the same Profile editor; Animals & Companions also uses it. Archived Campaigns, owners, and Creatures reject all mutations. Authoritative configuration reuses Pass 1's outside-active-encounter checks for both owner and Creature, including paused encounters, and its short fail-fast encounter-write fence. Harmless notes can still be edited during an encounter. These guards perform no runtime writes and introduce no gameplay cost.

14. **Ownership transfer / review.** Any actual `owner_character_id` change on an individual with a profile preserves all roles, choices, notes, and Mount fields, increments the profile revision, and sets `requires_owner_review`. This includes removal and later reassignment. Bound Creature transfers remain prohibited by Pass 1 before any profile change can commit. Reads visibly identify retained settings as awaiting review. The current owning Player can edit notes but cannot clear the flag. G.O.D. must explicitly acknowledge review for the current owner when saving configuration. Stale pre-transfer commands reject. No role, Familiar relationship, or control assumption is silently rewritten or approved for a new owner. Current ownership is never copied into the profile; old/new owner IDs appear only as historical event context.

15. **Pass 1 disposition independence.** Accompanying, Away, and Vessel-bound remain unchanged. Profile saves do not alter them, and disposition changes do not alter the profile, its revision, or its history. Away preserves Mount/Familiar and all other designations. Accompanying was not subdivided into beside/following/perched/riding states. Narrative detail belongs in notes.

16. **Vessel independence.** Binding/unbinding preserves the whole profile. A Vessel-bound Familiar, utility Creature, G.O.D.-directed Creature, or Creature that normally stays out of combat remains valid. No role grants or restricts Vessel eligibility, auto-binds a Creature, moves a Vessel, changes custody, adds inventory contents, or modifies weight. The existing exact Item-copy bond remains authoritative.

17. **Evolution / Return.** Actual Evolution and historical Return were executed against a configured, Vessel-bound individual. Roles, notes, Mount capacity, control/preference, review state, profile history, and exact Vessel association remained unchanged through both operations. No Evolution/Return implementation or Creature master/snapshot format was modified.

18. **History / revision strategy.** Profile history has its own `companion_profile_event` table and vocabulary. It never replaces or reinterprets `companion_disposition_event`. Each authorized save compares the current profile revision and writes profile/role changes plus actor, timestamp, normalized command, before/after evidence, and request receipt atomically. Unique per-Creature request keys and revisions prevent duplication; identical same-actor retries return the prior receipt. Payload changes, stale notes, and competing edits cannot overwrite another update. Browser retries retain the exact attempted command until success or explicit refresh. A forced history-insert failure rolls the entire save back. History JSON is audit evidence; authoritative fields and roles are relational.

   Ownership review is guaranteed by a database trigger so existing transfer/removal/resale paths cannot omit it. Those automatic events record the old/new owner, time, retained values, and revision, with null actor attribution rather than inventing an actor. Existing ownership/commerce/lifecycle systems retain their own attribution. Improving actor attribution for these events and Pass 1 ownership-removal events is deferred; no legacy history was rewritten. Archive/restore retains profiles/history. Existing explicit, audited individual/Campaign permanent deletion cleans the new graph, and account deletion recognizes both new actor foreign keys as blockers.

19. **Reverse Vessel lookup / history UI.** Saved Vessel copies in the Character equipment store expose View Vessel binding. The server authorizes the holder's existing inventory access and verifies that exact copy still belongs to that holder. The response contains only the name-first copy label and bound Creature name, or “No Creature bound”; it exposes no private NPC notes, profile, resources, or owner controls. It is read-only and respects changed custody ownership. Companion management shows separate Profile history and Travel and Vessel change history disclosures, each limited to the latest 30 events. Travel history describes before/after disposition, Away note or exact Vessel label, actor when recorded, time, and revision. Historical Item labels use current definitions when still available; removed copies fall back to a previous-Vessel copy token.

20. **Proof that gameplay runtime is unchanged.** The database scenario captures every public table before configuring all seven roles across all nine Control Model / Combat Preference combinations. Only `companion_profile`, `companion_profile_role`, and `companion_profile_event` change. Separate exact-individual and owner snapshots confirm unchanged mechanics, equipment, inventory, health, injuries, conditions, and modifiers. No Session, Scene, Encounter, participant, Initiative, Roll, declaration, active movement, mounted state, Vessel deployment, or resource state is written by profile configuration. No attacks, defenses, movement, command, release/recall, mount/dismount, or AI execution was implemented. Chrome confirms the new editor has no such action buttons. Existing runtime regression checks also pass.

21. **Regression / test results.** All database validation used disposable synthetic PostgreSQL clusters.

   | Check | Result |
   | --- | --- |
   | Fresh migrations | All 90 migrations apply |
   | Populated upgrade | 0089 preserves complete row snapshots across all 195 pre-existing public tables, including seeded exact Creature/Vessel binding and Pass 1 history; new Profile/role tables remain empty |
   | Existing Pass 1 disposition/Vessel scenarios | 13/13 pass |
   | New Pass 2 profile scenarios | 15/15 pass |
   | Full existing Evolution / Forms / ownership / commerce / lifecycle wrapper | 136/136 inner tests pass, including companion equipment, Item use, Shop/resale and authoring |
   | Full existing Container / containment / custody / inventory / lifecycle wrapper | 232/232 inner tests pass |
   | Existing account deletion database integration | 1/1 pass; actual foreign-key registry coverage verified |
   | Broad feature suite with existing CSS loader | 1,762/1,764 pass; two baseline failures below |
   | TypeScript, changed-file ESLint, Drizzle metadata, whitespace | Pass |

   New scenarios cover legacy and notes-only state; every vocabulary choice and all nine control/preference combinations; multi-role and Other; Player/G.O.D./Admin/foreign authority; invalid Mount/role data; explicit role removal; travel/Vessel independence; ownership review/removal/reassignment; stale, retried and concurrent saves; archive/restore; active encounters; Evolution/Return; authorized reverse/history reads; transactional audit failure; and individual/Campaign deletion. The lifecycle preview now counts role rows as well as Profile and event rows.

22. **Browser / build results.** Actual installed Google Chrome, driven through Playwright with synthetic credential sessions, passed desktop 1365 x 1000 and phone-width 390 x 844 workflows. Checks cover G.O.D. simple/detailed editing, all Control and Combat choices, multiple roles, Other, Mount capacity/removal acknowledgement, ownership review, Player notes-only controls, legacy notes without inferred settings, persistence after reload, Vessel lookup, and separate history views. Shared Control Model help opens/closes with Escape without changing the choice. Horizontal overflow and page JavaScript errors were checked. The production Next build passed against temporary PostgreSQL, including TypeScript and all 28 static pages. [Screenshots and evidence](../samples/owned-creatures-pass-two/README.md) are committed. Automation is not Brannan/Ember human acceptance, physical-device testing, Firefox, or Safari coverage.

23. **Pre-existing baseline failures.** The broad suite is not entirely green. The same two `appearance-source.test.ts` failures documented in Pass 1 remain: the screen-palette test includes the existing `paper-character-sheet.css` print colors, and the theme-guide assertion expects the absent literal phrase `print/export rules remain fixed`. The test, print stylesheet, and guide are unchanged from approved Pass 1. They were not altered to hide failures. The recorded broad run uses the existing CSS loader; direct Node runs without it have the previously documented CSS-import limitation.

24. **DEV / Production access.** No shared DEV or Production database was read, written, migrated, or classified. Database wrappers override the connection with temporary loopback clusters and clean them up. Windows `initdb` required execution outside the restricted sandbox token; it still targeted only those disposable clusters. Static Drizzle/Next tooling reads local configuration, while database-backed validation uses the temporary URL. Neither 0088 nor 0089 was applied to shared environments during this pass. No deployment was performed; the push publishes source. Browser/build harnesses restore generated Next/TypeScript configuration after completion.

25. **Intentionally deferred issues.** Runtime Scene presence/following, release/recall/deployment, combat enrollment/control/actions/attacks/defenses, Initiative, movement, mounts/riding, Familiar powers, capture, autonomous behavior, training, active limits, and coordinated runtime interpretation remain deferred. Transfer-with-Vessel still requires separate design. Automatic ownership-event actor attribution, history pagination beyond 30 entries, and an unowned retained-profile inspection view remain management follow-ups. Current management resumes after a valid owner is assigned; data is retained meanwhile. Existing ownership-removal and profile-review events remain honest about missing direct actor attribution.

26. **Exact recommended Pass 3 scope.** Make Pass 3 a management review and audit pass: Brannan/Ember acceptance of legacy/notes-only/configured/review-required states; multiple same-definition individuals with different profiles; role removal, notes, and ownership review across Player and Race NPC owners; and archive/restore plus Vessel custody checks. Then add authorized actor attribution to future ownership-review/removal events through existing command paths, a read-only G.O.D. inspector for retained profiles while unowned, and history pagination/detail if acceptance identifies that need. Preserve existing history and metadata semantics. Do not include transfer-with-Vessel execution or gameplay runtime until its rules are separately approved. Pass 3 has not begun.

Reproduction commands:

```powershell
node --import tsx scripts/companion-profile-disposable.test.ts
node --import tsx scripts/companion-profile-disposable.test.ts --browser
node --import tsx scripts/companion-profile-disposable.test.ts --build
node --import tsx scripts/creature-evolution-disposable.test.ts
node --import tsx scripts/inventory-containment-disposable.test.ts
node --import tsx scripts/admin-account-lifecycle-disposable-db.test.ts
$env:NODE_OPTIONS = '--import ./scripts/register-test-css.mjs'
node scripts/run-feature-tests.mjs
npx.cmd tsc --noEmit
npx.cmd drizzle-kit check
git diff --check
```

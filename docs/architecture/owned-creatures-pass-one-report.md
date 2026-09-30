# Owned Creatures Upgrade Pass 1

Companion Disposition and Creature Vessel management are implemented. An exact owned Creature can deliberately be Accompanying, Vessel-bound, or Away. A Vessel binding identifies its exact existing Item copy. Ownership remains `campaign_character.owner_character_id`.

This pass adds persistent authoring and management. It does not change Scene presence, encounter participation, Creature actions, release/recall, or gameplay resource use. Special Ability Pass 6 and Owned Creatures Pass 2 remain deferred.

1. **Commit / push SHA.** Reviewed base: `ca7c920ce41a56cfe74dc6c7f999f87b439da06d`. The commit containing this report is the completed Pass 1 revision; its exact pushed SHA is recorded in the delivery message. `git log -1 --format=%H -- docs/architecture/owned-creatures-pass-one-report.md` identifies that revision after checkout.

2. **Files changed.** The complete path list is in [changed-files.txt](../samples/owned-creatures-pass-one/changed-files.txt). The changes fall into these groups:

   | Area | Files / purpose |
   | --- | --- |
   | Database | `src/db/companion-schema.ts`, the exact-copy composite key in `realm-schema.ts`, `drizzle.config.ts`, migration `0088`, its snapshot, and the migration journal |
   | Companion management | `companion-disposition.ts`, `companion-disposition-service.ts`, `creature-vessel-guards.ts`, existing owned-Creature read/actions and ownership-transfer service |
   | Interface | Shared `companion-disposition-editor.tsx` and CSS; Animals & Companions; simple/detailed Creature NPC editors; Item Overview/Preview; shared field/page guidance |
   | Exact Item ownership | Existing Character/NPC catalog reads, inventory creation, random Character allocation, ownership strategy callers, and Shop fulfillment |
   | Lifecycle | Inventory removal/destruction guards, Shop sale guards, Campaign cleanup and dependency previews, account attribution blockers |
   | Verification | Three disposable/browser scripts, updated migration/ownership/lifecycle assertions, screenshots, this report, and ignored temporary build/log paths |

3. **Migrations, tables, and constraints.** [0088_owned_creature_disposition.sql](../../drizzle/0088_owned_creature_disposition.sql) is additive; previous migrations are unchanged. It adds `creature_vessel_profile`, `owned_creature_disposition`, and `companion_disposition_event`, plus a unique `(id, item_id)` key on the existing exact-copy table. Primary/unique keys, composite foreign keys, check constraints, and narrow database triggers enforce persistent Creature identity, Campaign identity, exact-copy definition identity, enabled Vessel capability, one-to-one binding, valid notes, and positive revisions. Destructive identity/profile/copy changes fail closed. There is no data backfill.

4. **Exact Companion Disposition model.** One optional row belongs to the exact persistent Creature NPC. `disposition` is exactly `accompanying`, `vessel-bound`, or `away`. Away has an optional descriptive note of at most 240 characters. Only Vessel-bound has non-null Vessel copy/definition references. Configuration does not represent actual presence or deployment. No owner column, Creature snapshot, new Creature kind, or roster limit was added.

5. **Legacy behavior.** No row reads as “Travel disposition not set.” It is an unconfigured state, not a fourth disposition. Neither migration nor ordinary reads classify existing Creatures. Saving one of the three choices is deliberate. There is no management command to reset a configured Creature to legacy; removing ordinary unbound ownership clears the owner-relative disposition and records that removal.

6. **Creature Vessel Item profile.** Item authors explicitly enable a typed profile. Names, categories, Related Creature, magical status, Container profiles, and Creature Grant never imply Vessel capability. Read/save and cloning follow existing Item conventions; omitted fields preserve existing settings. A profile can be disabled when unbound. Its disabled row retains exact-copy tracking, so existing copies do not collapse into quantities. Physical profile deletion is blocked while exact-copy records remain. An Item with existing quantity stacks cannot be enabled until those stacks are resolved deliberately; this pass performs no automatic conversion. Enabled clones inherit capability; ordinary disabled Items acquire no unnecessary profile row.

7. **Exact binding model.** The optional binding is stored in the disposition row, so changing disposition and changing the bond commit together. `character_id` is unique, `vessel_instance_id` is unique, and `(vessel_instance_id, vessel_item_id)` references `campaign_character_item_instance(id, item_id)`. The definition reference also points to the explicit Vessel profile. There is no second Item-copy system. New binding requires an enabled, unarchived definition and an active, accessible, unbound exact copy in the owning Character's inventory. An existing bond can remain selected after custody changes. Replacing a Vessel or leaving Vessel-bound requires explicit unbind acknowledgement.

8. **Separation from Container storage.** No Creature enters a Container content row. No Creature body weight, HP, injury, or condition is stored on an Item. The Vessel Item retains its ordinary authored weight and can itself be placed in an ordinary valid container. An Item can independently have both Container and Vessel profiles. Creature Grant also remains independent: granting/purchasing a Vessel never automatically binds a Creature; a definition with both capabilities does not imply a combined operation.

9. **Item authoring UI.** Item Overview includes the shared guided “Creature Vessel” checkbox, visible storage-only explanation, and stack/disable guidance. Preview identifies the capability. No release, recall, capture, range, healing, Initiative, or recovery mechanics were authored. The new appearance rules use shared semantic theme variables. [Desktop control](../samples/owned-creatures-pass-one/authoring-control-desktop.png) and [390px control](../samples/owned-creatures-pass-one/authoring-control-phone.png).

10. **Animals & Companions UI.** The existing list shows the four readable display states, an Away note when present, and name-first Vessel identity with a stable `Copy` token for duplicates. The existing companion dialog provides deliberate save/refresh controls, server validation, and a required acknowledgement when unbinding. The same editor appears in G.O.D. simple and detailed Creature NPC management, including Creatures owned by Race NPCs. Unsaved detailed Character edits disable companion configuration until saved/discarded. [Desktop list](../samples/owned-creatures-pass-one/companion-list-desktop.png), [390px list](../samples/owned-creatures-pass-one/companion-list-phone.png), and [unbind confirmation](../samples/owned-creatures-pass-one/unbind-editor-phone.png).

11. **Authorization.** A Player can manage a Creature owned by their own authorized Player Character; the Campaign-owning G.O.D. can manage the relationship, including a Race NPC owner. Administrator/library authority alone grants no mutation authority. Archived Campaigns, owners, and Creatures reject changes. Foreign Campaigns/owners, ordinary Race NPCs or PCs presented as the stored Creature, and negative/direct encounter occurrences reject. The server checks both owner and Creature encounter state using existing guards, including paused active encounters. A brief fail-fast table lock also prevents concurrent encounter start/enrollment from slipping between checks; competing encounter writes can produce a retry message. This is a configuration guard and creates no encounter/action/resource mutation.

12. **Ownership transfer.** A bound Creature cannot be transferred, sold, or made unowned. The error asks the user to unbind and change travel disposition first. Neither Item nor Creature ownership moves as a side effect. After explicit unbinding, existing ordinary transfer works. Accompanying/Away remain attached to the individual when reassigned within the Campaign. Removing ownership clears that owner-relative configuration with a history event. A future “transfer Creature with Vessel” workflow needs separate design.

13. **Item lifecycle.** Bound exact-copy removal, retirement, deletion, destruction, and sale reject; service checks give useful errors and database guards protect the underlying relationship. Disabling/removing capability while bound also rejects. Archive follows existing Item conventions: it preserves exact copies and bindings, while archived definitions are excluded from new binding choices. Permanent catalog deletion remains subject to existing exact-copy dependencies and the new binding blocker. Destroying a container that is itself a bound Vessel rejects. Destroying an ordinary parent container continues to use existing containment handling; the contained Vessel's bond is preserved.

14. **Creature lifecycle.** Archive/restore preserve disposition and binding; management requires an active record. Permanent deletion of a bound individual rejects. Ordinary unbound individual deletion explicitly cleans companion configuration/history within the existing audited lifecycle transaction, subject to other established blockers. Deleting an owner or holder cannot bypass owned-Creature or bound-copy dependencies. Explicit whole-Campaign permanent deletion cleans relationships and history before the ownership graph, with existing lifecycle confirmation, audit, and rollback semantics. Actor attribution references are included in the account deletion dependency registry.

15. **Evolution / Return.** Bindings reference the persistent individual, never its current Creature definition. The new database scenario runs actual Evolution and historical Return operations and verifies the same individual, disposition, Vessel copy, and companion history throughout. No Evolution or Return implementation was changed. The full existing Evolution/Forms regression harness also passed.

16. **Custody.** Containment, closing the containing Item, dropped/lost/stolen custody, equipment state changes, and same-Campaign holder changes preserve the bond and Creature owner. New binding filters inaccessible copies through the existing Inventory access graph, including closed containers. Reads show a basic custody description for the owner/companion's own inventory; another holder is described as “Held elsewhere” without private holder/location notes. A bound copy cannot be moved across Campaign identity. This does not authorize runtime use of an inaccessible Vessel.

17. **History / revisions.** Each management save checks the current per-Creature revision and writes state plus an immutable-update history receipt in the same transaction. History includes actor, timestamp, normalized command, before/after state, revision, and a unique per-Creature request key. Same-actor retries of the identical command return the existing receipt; changed payloads and stale revisions reject. The browser retains an uncertain attempted command for retry and requires refresh before editing it again. History JSON is explanatory evidence; authoritative state and binding remain relational. Ownership removal uses a database-authored event with a null actor and the previous owner ID; it does not invent attribution for a legacy ownership operation. Existing ownership/commerce/lifecycle records retain their own attribution. Permanent deletion can clean this history only as part of the explicit lifecycle graph.

18. **Tests.** All database work used disposable synthetic clusters.

   | Check | Result |
   | --- | --- |
   | Fresh migration chain | All 89 migrations apply |
   | Populated upgrade through 0088 | Full row snapshots of all 192 pre-existing public tables preserved; legacy owned Creature, health/snapshots, stack Items, exact Item charges and identity unchanged; no inferred profiles/dispositions |
   | New companion database scenarios | 13/13 pass, covering authoring/cloning, relational rejection, deliberate disposition, exact cardinality, authority, atomic failure, retries/concurrency, custody, lifecycle/transfer, active encounters, actual grants/Shop sales, Evolution/Return, and Campaign cleanup |
   | Existing Evolution / Forms / ownership / commerce / lifecycle harness | 136/136 inner tests pass; includes companion equipment, Item use, actual Shop/resale, and Item authoring |
   | Existing physical Container / containment / custody / inventory / lifecycle harness | 232/232 inner tests pass; includes existing Item/firearm regression checks |
   | Existing account-deletion disposable integration | 1/1 pass; verifies actual foreign-key coverage |
   | Broad feature suite, using the existing CSS test loader | 1,762/1,764 pass; two pre-existing appearance assertions fail, described below |
   | Production build using temporary PostgreSQL | Pass, including TypeScript and all 28 static pages |
   | TypeScript, changed-file ESLint, Drizzle metadata check, whitespace check | Pass |

   The broad feature run is **not entirely green**. `appearance-source.test.ts` treats the existing `paper-character-sheet.css` print palette as screen CSS because its print exception list is stale; another assertion requires the exact phrase `print/export rules remain fixed`, which the existing theme guide no longer contains. The test, offending print file, and guide are unchanged from the reviewed base. These unrelated assertions were left outside Pass 1. Without the repository's CSS loader, direct Node imports also fail for four CSS-importing test files; the recorded 1,764-test result uses that loader.

   Reproduction commands (each database wrapper owns and cleans its synthetic cluster):

   ```powershell
   node --import tsx scripts/companion-disposition-disposable.test.ts
   node --import tsx scripts/companion-disposition-disposable.test.ts --browser
   node --import tsx scripts/companion-disposition-disposable.test.ts --build
   node --import tsx scripts/creature-evolution-disposable.test.ts
   node --import tsx scripts/inventory-containment-disposable.test.ts
   node --import tsx scripts/admin-account-lifecycle-disposable-db.test.ts
   $env:NODE_OPTIONS = '--import ./scripts/register-test-css.mjs'
   node scripts/run-feature-tests.mjs
   npx.cmd tsc --noEmit
   npx.cmd drizzle-kit check
   git diff --check
   ```

   Windows PostgreSQL `initdb` required execution outside the restricted sandbox token. The harness validates temporary paths and database identity; this did not permit shared database writes. Temporary Next build directories and logs are ignored, and the harness restores the original generated Next/TypeScript configuration files.

19. **Browser checks.** Actual installed Google Chrome was driven through Playwright with synthetic credential sessions and a temporary Next server/database. Desktop was 1365 x 1000; phone width was 390 x 844. Item enable/save/reload, Player legacy/Accompanying/Away note/binding, duplicate Item names, explicit unbind acknowledgement, persistence after reload, G.O.D. simple/detailed NPC management, and a Race NPC owner all passed. Horizontal overflow and dialog bounds were checked; no page JavaScript errors occurred. No release/recall/deploy controls were present in the new editor. Focused screenshots are in [the evidence folder](../samples/owned-creatures-pass-one/README.md). This is automated Chrome evidence, not Brannan/Ember human acceptance, physical phone testing, Firefox, or Safari coverage.

20. **DEV / Production access.** No shared DEV or Production database was read, written, migrated, or converted. Test processes override the database URL with loopback temporary clusters. Static Drizzle/Next tooling reads local configuration, but database-backed validation targets only those temporary clusters. Migration 0088 is committed for later application under the normal environment-specific process; it has not been applied to shared databases. The push publishes source only.

21. **Intentionally deferred.** Scene presence and arrival/departure; release, recall, deployment and multiple deployment; combat participation/control/attacks/defenses and Initiative costs; riding/mounting; familiar powers; capture/acquisition mechanics; active limits; runtime Vessel accessibility or use by a non-owner; durations while stored; injured/incapacitated recall; Vessel destruction consequences; combat ownership transfer; and coordinated Forms/Evolutions/Owned Creatures/Special Abilities runtime integration. No new gameplay behavior or costs were inferred.

22. **Exact recommended Pass 2 scope.** Keep Pass 2 within management and review: add an authorized reverse lookup from an exact Vessel copy to its bound Creature; expose the existing companion change history in a readable management view; make ownership-removal attribution explicit in the existing ownership command path; and run Brannan/Ember acceptance for multiple companions, duplicate Vessels, custody changes, transfers after unbinding, and archive/restore. Agree on behavior for any future “transfer Creature with Vessel” workflow before implementation. Do not include release/recall, Scene presence, encounter control, mounts/familiars, capture, destruction consequences, or other runtime integration. Pass 2 has not begun.

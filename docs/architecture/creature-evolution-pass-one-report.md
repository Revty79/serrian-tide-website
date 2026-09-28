# Creature Evolutions — Pass 1

Reviewed baseline: `b8e828dbf2415eca568d3d0b6580817233e95f0c`. Implementation is limited to definition authoring and persistence. Creature Ownership Passes 1/2, individual snapshots, Forms, inventory, commerce, and encounter execution retain their existing architecture.

## Persisted model

Migration `0082_creature_evolutions.sql` adds one table, `creature_evolution_paths`, and its Drizzle snapshot/journal entry. The previous migrations are unchanged. The migration creates no paths and updates no existing data.

| Column | Meaning |
| --- | --- |
| `id` | Stable serial primary key for this authored path; later requirements can reference it. |
| `source_creature_id` | Exact saved `creatures.id` that owns the path. |
| `destination_creature_id` | Exact saved `creatures.id` this path leads to. |
| `name`, `description`, `notes` | Required nonblank label and optional descriptive text. |
| `sort_order` | Nonnegative position within the source's authored list. |
| `version` | Positive revision used to reject stale edits, removals, and reorders. |
| `created_at`, `updated_at` | Path timestamps, separate from Creature definition timestamps. |

Both identities have foreign keys. A database check and server validation reject direct self-Evolution. Indexes support ordered exact-source reads and destination dependency checks. Neither names, canonical strings, JSON, parent lineage nor Forms establish the core relationship.

One source may have any number of paths, including branches to different destinations. Each destination may itself own paths, so incomplete and multi-stage chains work without requiring the entire chain upfront. Distinct paths may share a destination. There is no implicit reverse path or reversible flag. An explicitly authored opposite-direction path is permitted; only direct self-edges are prohibited. No recursive chain traversal or cycle execution exists in this pass.

## Authoring and permissions

Creature authoring has a separate **Evolutions** tab. Save a new Creature first, then add, name, describe, edit, reorder, or remove its paths. Existing Creature draft changes must be saved before the Evolution controls become available. Evolution dialogs save independently of **Save Creature**, so changing a path does not rewrite Creature mechanics or Forms. Removal has an explicit confirmation.

The destination picker searches active Creature names or canonical IDs and returns at most 30 results under the existing catalog visibility preference. Labels include the exact saved ID, canonical identity and immediate variant-parent context. Refine the search to locate other records. The selected destination is also shown as wrapping text so long canonical identities remain readable on phones.

All server actions authenticate with the existing G.O.D./Administrator access boundary. Mutations also authorize the exact source with `assertCanEditSharedLibraryRoot`. User-authored roots follow existing creator/Administrator rules; protected imported/system/legacy roots retain their existing G.O.D. authoring rule. Owning an individual Creature grants no library authoring access. The destination is a reference; authoring a path does not confer editing permission on that destination.

New destinations are checked again on the server against current catalog visibility and archive status. Stored references can be read and retained after a destination is hidden or archived. There is no client-supplied exemption for a newly selected hidden/archived destination.

Mutations lock the relevant Creature roots in ID order and validate the path's source and version. Reordering requires the complete current list with versions, rejects missing/duplicate/foreign/stale rows, and changes positions without replacing identities. Stale operations fail visibly and the UI offers **Reload Evolutions**. Source cloning locks its root consistently with these mutations. Root locks use `FOR NO KEY UPDATE`, preserving foreign-key key-share compatibility while serializing edits and archive changes.

The dialogs use native modal behavior, shared semantic theme variables, guided fields, visible errors, and a viewport-bounded scroll area. No master-library layout rules were changed.

## Variant, Form, and lifecycle behavior

- **Exact source:** Reads query only the requested saved Creature ID. There is no parent-chain inheritance or merge. Adding a path to a parent later does not alter existing variants.
- **Clone as Variant:** The existing independent-copy action copies the saved source's outgoing paths in the same transaction. Each copy receives a fresh path ID, revision and timestamps; destination IDs and descriptive content are retained. Retained archived destinations are copied consistently with existing owned-authoring references. Editing either copy leaves the other unchanged. No corresponding destination variant is inferred.
- **Forms:** Form definitions, transformation rules, access rules, snapshots and previews stay separate. The existing Form clone runs as before. Evolution paths are not added to `CreatureDraft` or individual NPC snapshots.
- **Archive:** Either Creature can be archived without losing paths. An archived source is readable and must be restored before mutation. An archived destination remains readable and can stay on its original path while other fields are edited. New paths and retargeted paths cannot newly select it.
- **Restore:** Restoring either side retains the same path rows and identities. Restored destinations become eligible for discovery under the current catalog view.
- **Delete source:** Outgoing paths are owned authoring rows, like Forms. The shared lifecycle review lists their count, the existing explicit deletion workflow records the dependency summary, and the source foreign key cascades their removal. Other blockers still apply.
- **Delete destination:** Incoming paths are blocking dependencies in the lifecycle preview. The restrictive foreign key independently prevents deletion. Archive the destination or explicitly resolve those references first.
- **Remove a path:** Only that authored path is deleted; neither Creature definition nor any individual is changed.

## Individual and runtime boundary

The new mutation service writes only `creature_evolution_paths`. It does not write `campaign_character`, `owner_character_id`, `campaign_creature_npc_profile.creature_id`, baseline/current snapshots, names, notes/history, health, injuries, conditions, equipment, inventory custody, Shop records, or encounters. Ordinary Creature saves preserve authored Evolution paths without loading or replacing them.

There is no Evolution execution command, automatic healing, NPC reconstruction, Form transition, requirement evaluator, or encounter integration. Future execution can query paths by the individual's existing profile `creature_id` while retaining its `campaign_character` identity; this pass does not perform that query in runtime code.

## Files

| Area | Files |
| --- | --- |
| Schema/migration | `src/db/creature-schema.ts`; `drizzle/0082_creature_evolutions.sql`; `drizzle/meta/0082_snapshot.json`; `drizzle/meta/_journal.json` |
| Domain/persistence | `src/features/creatures/creature-evolutions.ts`; `creature-evolution-service.ts` |
| Server actions/variant hook | `src/app/heavens/creatures/evolution-actions.ts`; `actions.ts` |
| UI | `src/app/heavens/creatures/creature-evolutions-editor.tsx`; `creature-evolutions.module.css`; `creature-workspace.tsx` |
| Shared integration | `src/features/lifecycle/lifecycle-service.ts`; `src/features/guidance/page-help.ts` |
| Tests | `src/features/creatures/creature-evolutions.test.ts`; `scripts/creature-evolution-db.test.mjs`; `scripts/creature-evolution-disposable.test.ts`; `scripts/creature-evolution-browser.test.ts` |
| Handoff | This report |
| Test output exclusions | `.gitignore` adds the two dedicated Next test output directories. |

## Verification

All database writes for verification target isolated temporary PostgreSQL clusters. The runner verifies both the fresh 83-migration chain and a populated upgrade through 0082. It compares all 185 pre-existing public tables before and after upgrade, including owned NPC identity, snapshots, damage, Forms, variants, equipment and grant listings; all remain equal and the new path table is empty.

The focused Evolution database suite covers branching, multi-stage paths, stable edit/reorder/remove identities, SQL/server self-edge rejection, missing/foreign IDs, concurrent stale edits, exact variant destinations, independent cloning, absence of inherited or Form-inferred paths, archive/restore, deletion protection, Player denial, current author permissions, hidden retained references, and ordinary-save preservation. Its authoring-only test compares every existing non-Evolution public table before and after path changes, including an injured owned Creature with a condition and worn equipment.

| Check | Result |
| --- | --- |
| Focused Creature authoring, Forms, NPC, lifecycle, catalog and shared-library authorization units (`node --import ./scripts/register-test-css.mjs --import tsx --test` over the relevant feature suites) | 216 passed. |
| `node --import tsx scripts/creature-evolution-disposable.test.ts` | 9 Evolution, 21 Creature Forms/variants, 6 Ownership Pass 1, 16 Ownership Pass 2/commerce/equipment/Item use, and 2 lifecycle/migration tests passed (54 total), plus fresh/populated migration checks. |
| `node --import tsx scripts/catalog-visibility-disposable-db.test.ts` | 33 existing catalog, classification, account, authorization and Derived Ability regression tests passed, plus migration preservation checks. |
| `node --import tsx scripts/creature-evolution-disposable.test.ts --focused --browser --build` | 9 Evolution cases and migration checks passed again after the lock refinement; Chrome desktop and 390px browser workflow passed; production build passed with 28 static pages generated. |
| TypeScript, changed-file ESLint, `npx.cmd drizzle-kit check`, whitespace checks | Passed. |

Browser checks exercised add/edit/reorder/reload/remove through the real Creature authoring route, exact variant labels, archived target retention and exclusion from new choices, dialog scrolling, Escape/help behavior, and an alternate scoped appearance preset. Existing Forms and NPC snapshot rows remained equal. There were no browser page errors. Screenshots were visually inspected. Local output and screenshots are under the ignored `artifacts/guidance/` directory (`evolution-*.log` and `creature-evolutions/`).

The first fixture runs exposed missing test inventory charges and the NPC constructor's `{ characterId }` return shape; those fixtures were corrected before the passing runs. PostgreSQL initialization required running the disposable harness outside the Windows sandbox. No real database was substituted. These automated checks are not a user playtest or physical-device/Firefox/Safari acceptance.

## Next pass considerations

Requirements should attach relationally to the stable path `id`, following the same exact-source authorization and independent-copy rules. Path label/target edits and ordering preserve IDs; future requirements must participate in the same transaction and version checks. A cloned path will also need independent requirement rows when those exist.

Do not interpret today's path existence as eligibility to evolve. Archived/hidden destinations remain valid historical authoring references, so future eligibility and execution must explicitly define destination availability. There is no implied reverse behavior or automatic chain traversal.

Before execution or execution history is added, define how path removal/source deletion interacts with that history; restrictive historical references may become appropriate then. Retaining a path ID or its authoring version alone does not define HP, anatomy, Forms, attacks, abilities, Skills, protection or other state translation. Those rules need explicit authoring and validation before any persistent individual can change definition. No new NPC is required by this model.

Migration 0082 is supplied with the code and tested in disposable databases. It has not been applied to DEV or production by this pass. Application deployment is separate from this handoff.

# Evolution Pass 4: safe destination creation

Implemented against approved baseline `04e27acdec329f28679b93e8d977b4ec9f451b89`. The release commit is the commit containing this report; its SHA is supplied in the completion message.

Race and Creature Evolutions now offer **Create Evolution Destination** as the primary action. It copies the saved source into a complete independent definition, creates one ordinary source-to-destination path, and opens the destination's normal full editor. **Link Existing Destination** remains the secondary action. This pass changes library authoring only.

## Authoritative transaction

`prepareEvolutionDestination` reads an authorized, active exact source in a read-only repeatable-read transaction. It returns the source name, a SHA-256 fingerprint of its saved authored mechanics, and a request identity. It creates no records. Creature canonical IDs use the existing system-owned `CREATURE-{UUID}` convention and are visible but read-only in the dialog. Races use their normal generated numeric identity.

`createEvolutionDestination` performs the following in one database transaction:

1. Validate the exact source, required names, generated canonical identity, request identity and source fingerprint shape. Hash the normalized request together with the authenticated actor.
2. Acquire an advisory transaction lock for the request identity; inspect any existing durable receipt and reject reuse with different details or a different actor.
3. Read and share-lock the current account and role rows. Lock the exact source root with `FOR NO KEY UPDATE`, then enforce the existing shared-library edit permissions and active status. Normal authoring locks the same root before editing child mechanics.
4. For a completed identical request, verify that its destination/path still exist and return the original IDs. If a created record was subsequently removed, report that fact and never recreate it.
5. For a new request, compare the current complete authored source fingerprint with the prepared fingerprint. A concurrent edit that completed first causes an explicit stale-source error. Check Creature canonical uniqueness.
6. Call the shared normal definition-copy primitive with a null parent and outgoing Evolution copying disabled.
7. Insert one normal Evolution path through the same insertion primitive used by Link Existing Destination. Append its sort order and use the normal initial version and requirement defaults.
8. Insert the durable receipt containing the actor, request hash and returned identities, and commit all writes together.

Any failure rolls back the definition, its owned rows, the path and the receipt. Source mechanics remain unchanged. The transaction uses a three-second lock timeout and a twenty-second statement timeout; conflicts and busy/stale conditions have readable errors. Account/role loss, source archival and edits that win a concurrent lock race are checked against current persisted state before copying.

## Complete copies and independent identities

The existing Creature Variant copy implementation was extracted from the server action into `creature-clone-service.ts`. The existing Race Variant service now exposes its reusable copy operation. Destination creation and ordinary Variant creation call those same operations with explicit parentage and Evolution-copy options.

| Content | Creature destination | Race destination |
| --- | --- | --- |
| Core definition | Family/type, size, multiplier/movement/magic steps, CR fields, descriptions, behavior, ecology, notes, Interaction Rules | Size, base magic, anatomy JSON, Interaction Rules, age, descriptions, quirks, languages, culture and other ordinary root fields |
| Attributes | Owned Attribute rows, values, notes and order | Attribute cap rows and order |
| Health/anatomy | Pools and locations with new row/canonical identities and remapped pool references; existing HP normalization recomputes derived maxima | Independent anatomy JSON with local pool/location keys retained |
| Movement | Owned movement rows, initiative, requirements, notes and order | Owned movement modes, bases, notes and order |
| Attacks | Legacy fields and full authored mechanics, with fresh row/canonical identities | Full Natural Attack authoring with new owned row identities |
| Abilities/Skills | Abilities, mechanical-effect rows, authoring JSON and Skill relationships | Existing racial Skill/Special Ability relationships/grants |
| Protection/uses | Defenses/protections, CR authoring and uses | Natural Protection and coverage |
| Forms | Independent Forms, mechanics, Access and transformation authoring; owned Ability references are remapped | Independent Forms, mechanics, Access and transformation authoring |

Creature HP and reward calculations retain the canonical clone service's existing normalization; this is not a raw copy of stale calculated totals. Owned database rows receive fresh IDs. Stable local keys inside their independent definition JSON remain local keys. Shared Skill references remain references to the same Skill definitions, including retained archived references, as in ordinary cloning.

Both destination parent fields are **null**, including when the source itself is a Variant. Evolution stages are independent definitions connected by an Evolution path. Ordinary Create Variant still assigns its source parent and copies its normal outgoing Evolution authoring exactly as before. Neither workflow introduces runtime inheritance.

The destination receives **no outgoing paths, path requirements or execution history** from the source. The newly inserted source-to-destination path is the only new Evolution relationship. No Characters, NPCs, inventory, ownership, health, conditions, active Forms or execution records are created or changed.

## Catalog and author metadata

New destinations are ordinary user-created, active definitions. `createdByUserId` is the current authenticated actor. `isSystemCanon` is false; canon marker identity/time, archive attribution/time, import source, and Race external import identity are cleared. Root creation/update timestamps and owned row IDs are regenerated. Ordinary mechanical classification such as Creature family/type is copied. The current Race/Creature clone model has no separate tag assignment set to copy.

Copying a System Canon source never designates the destination as canon. Existing shared-library rules remain authoritative: imported/system-owned/ambiguous legacy sources require the G.O.D. role; ordinary user-created sources require their G.O.D. creator or an Administrator. Administrator status alone does not grant protected-source mechanical editing. Creature ownership and Character play permissions confer no library authoring authority. Direct opening uses the newly returned exact ID, so a canon-only browsing preference cannot hide the successful editor navigation; catalog searches themselves retain their normal visibility rules.

## Ordinary path behavior

The path lives in the existing Race or Creature relational path table, has a fresh stable path ID, begins at version 1 and defaults to Unrestricted with no copied requirements. A new Race path has a null permanent transition. Permanent individual Attribute/step adjustments are subsequently authored on that path, never on the destination Race.

The normal path services still handle names, descriptions, notes, order, requirements, Race permanent adjustments, eligibility and the existing out-of-Encounter execution API. Editing retains the path ID and uses existing version checks. There is no separate generated-path type and no conversion/backfill of existing paths.

Link Existing Destination keeps exact saved IDs, catalog filtering, archived-new-selection rejection and retained archived references. Both search and server validation exclude direct self-links. The dialog explicitly explains that the current definition is excluded because Evolution must lead to another saved definition.

## Retry persistence and migration

Migration **0086_evolution_destination_creation.sql** adds only `evolution_destination_creation`. The need for this small forward-only migration was explained before implementation: Race definitions have no unique canonical identifier that can safely serve as a receipt, and an in-memory or browser-only flag cannot prevent duplicates after an uncertain committed response. Permanent server receipts are required to guarantee the requested retry behavior for both types.

The table stores request key, actor ID, normalized request hash, result snapshot and creation time. It is not a new relationship or definition provenance authority. Snapshot IDs intentionally have no foreign keys: deleting an account, path or destination must not erase the evidence that an old request already committed. The existing path tables remain authoritative. No prior migrations, existing paths or history are rewritten.

The browser writes the exact request to `sessionStorage` before sending and disables changes during an uncertain result. A reload in the same tab resumes that request. Duplicate submissions and concurrent identical requests return the same destination/path IDs. Changed-payload reuse is rejected. After an error, the server performs a fresh serialized receipt lookup before allowing the browser to release its pending request; if that lookup cannot confirm the outcome, the original request remains pending. This also protects a lost commit acknowledgement. Opening the editor can be retried without copying again.

Definition names are not unique in the existing schema; duplicate display names remain allowed and exact IDs distinguish them. Creature canonical collisions are rejected, roll back everything, and explain how to obtain a fresh generated identity. Retrying an already committed request after a source edit returns the original result; archive or permission loss is still enforced. Clearing browser storage or deliberately starting another request is a new operation, not a retry of the original one.

## Editor navigation and guidance

Success opens the ordinary full destination editor directly and names the source, destination and exact path ID. A contextual **Return to source Evolutions** control returns to the source's Evolutions tab, using the existing Keep Editing/Discard unsaved-change guard. The context is temporary workspace UI, not inheritance or mechanical state. Manual navigation or a page reload does not promise persistent provenance UI; the relational path remains saved.

The dialog uses the existing semantic theme, GuidedField descriptions and scrollable native dialog layout. It asks for the new definition name, shows the Creature canonical ID, prefills `Evolve into {name}`, and allows optional path description/notes. The destination can then be edited using all ordinary Race/Creature tabs.

## Shared read model

`readEvolutionPathReferencesInTransaction(tx, kind, sourceId)` is a server-only, read-only exact-source helper. Its caller must supply authorization appropriate to its own boundary. It returns kind, stable path ID/version/name, exact source/destination IDs, destination name, requirement mode, source/destination archive flags and definition availability. Availability is not individual eligibility. It performs no parent-path merging, trigger evaluation, execution or state mutation and is not wired into tabletop/combat.

## Verification

- **565/565 unit checks passed** across Evolutions, Race/Creature mechanics/authoring, Forms, NPCs, Active State/Health, Items, lifecycle, catalog visibility and shared-library authorization.
- **122/122 disposable database checks passed** in the combined Evolution harness: Pass 1 (9), Pass 2 (9), Pass 3 plus supplemental Race permanent mechanics (15), Pass 4 (10), Race Forms/mechanics/preview (34), Creature Forms/Access (21), Ownership Pass 1 (6), Ownership Pass 2 commerce/equipment/item use (16), lifecycle (1), and populated lifecycle migration rehearsal (1).
- **33/33 additional catalog database checks passed**, covering visibility, System Canon, authorization, embedded discovery/retained references and existing Derived Ability behavior.
- Pass 4 cases cover complete independent copies in both directions, metadata, Form Access/Ability remapping, ordinary path editing, null parent semantics, unchanged Variant cloning, canonical collisions, duplicate names, duplicate requests, concurrent different requests, stale content including Form edits, permission loss, source archival, deleted receipt targets, read-only path retrieval, and rollback on forced path/receipt insertion failures.
- Fresh replay of **87 migrations** and populated staged upgrade through the latest migration passed. Existing path identities/versions and 185 prior public tables were checked; no inferred paths/requirements or history were introduced. The new migration itself is a single additive `CREATE TABLE`.
- Authenticated Chromium exercised both types at **1365px and 390px**: primary/advanced choices, readable validation, scrollable dialogs, canon-only discovery, destination editor navigation, dirty return guard, normal path editing and no page errors. Phone tests let the server commit, then abort the response, reload the page and verify exactly one destination/path after retry. Representative screenshots were visually inspected.
- The combined harness's **production build passed**, including its TypeScript compilation.
- The full **Race authoring harness passed**: 44 database cases, independent Variant and normal authoring browser workflows, Natural Attacks, Forms/Access/transformation/preview at desktop and 390px, role revocation, lifecycle, and 116 existing runtime/gameplay regression cases. No runtime implementation was changed.
- The full **Creature authoring harness passed**: populated migration preservation, 21 Forms/Access database cases, normal Creature and individual NPC authoring, independent Variants, protection/health, legacy records, save/reload, archive/restore, native Form/Access previews and desktop/390px layouts. It reported no browser errors.
- **Standalone typecheck passed. Changed-file lint passed with zero warnings. Drizzle metadata and whitespace checks passed.**

Three unit source-inspection assertions were updated to follow the extracted clone implementation. The older Creature authoring migration test was corrected to isolate migration 0076 before later ownership columns, and to expect existing canon defaults during its full upgrade. The Race upgrade fixture now expects the already-approved nullable ownership column. The protection browser check selects the exact Creature name, avoiding the Variant row that also displays that parent name. Form screenshot capture performs a user scroll to release recent-save scroll restoration and waits for responsive layout before capturing; its viewport assertions remain intact. These changes preserve the original behavior assertions.

Local evidence is under ignored `artifacts/guidance/evolution-pass-four-*.log` and `artifacts/guidance/creature-evolutions/`. Browser automation used Chromium; these checks are not a claim of manual user acceptance or other-browser coverage.

## DEV and production

A read-only audit on 2026-09-28 confirmed both `serrian_tide_dev` and `serrian_tide_prod` have **86 applied migrations through 0085**, with matching hashes for Evolution migrations 0082–0085. **0086 is pending in both databases.** No live migration, data mutation or deployment was performed in this pass. Apply 0086 to the intended environment before using destination creation there.

## Files changed

| Area | Files |
| --- | --- |
| Destination model, transaction and read helper | `src/features/evolutions/evolution-destination.ts`, `evolution-destination-service.ts`, `evolution-path-references.ts` |
| Reused Creature copying and path insertion | `src/features/creatures/creature-clone-service.ts`, `creature-evolution-service.ts`; `src/app/heavens/creatures/actions.ts` |
| Reused Race copying and path insertion | `src/features/races/race-variant-service.ts`, `race-evolution-service.ts` |
| Shared creation UI/actions | `src/app/heavens/evolution-destination-actions.ts`, `evolution-destination-dialog.tsx` |
| Normal editor integration | `src/app/heavens/creatures/creature-evolutions-editor.tsx`, `creature-workspace.tsx`; `src/app/heavens/races/race-evolutions-editor.tsx`, `race-workspace.tsx` |
| Guidance | `src/features/guidance/page-help.ts`; this report |
| Receipt schema/migration | `src/db/evolution-destination-schema.ts`, `drizzle.config.ts`, `drizzle/0086_evolution_destination_creation.sql`, `drizzle/meta/0086_snapshot.json`, `drizzle/meta/_journal.json` |
| Tests | `scripts/evolution-pass-four-db.test.mjs`, `creature-evolution-disposable.test.ts`, `creature-evolution-browser.test.ts`, `creature-authoring-disposable.test.ts`, `race-authoring-disposable.test.ts`, `protection-layer-checks.ts`, `forms-audit-browser.ts`; `src/features/creatures/creature-ability.test.ts`, `creature-size-rules.test.ts` |

Pass 4 stops here. It adds no Character/NPC sheet Evolution controls, de-evolution execution, item/spell triggers, encounter/tabletop integration or runtime Form changes. Pass 3's immutable before/after history and reversal provenance remain intact.

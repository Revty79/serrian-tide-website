# Evolution Pass 5 — individual controls, historical Return and Form references

Pass 5 adds out-of-Encounter Evolution and Return to the existing persistent individual sheets. Character Form reference printing is included. No Form execution, encounter integration, automatic triggers or new progression counter is introduced.

## Individual sheets

- Player Characters and detailed Race NPCs: **G.O.D. tab → Evolution** in the shared Character editor.
- Detailed Creature NPCs: **Evolution tab** in the existing individual editor, including owned Creatures.
- The panel shows the exact current definition, its outgoing paths, prior-state candidate and expandable immutable history. A review is bound to the individual already open; there is no second individual search.
- Forward execution reuses Pass 3. After either operation the existing sheet refresh reloads mechanics, health, equipment, current definition, Forms, print choices, outgoing paths and history. Unsaved sheet edits must be saved first.
- Only the current Campaign-owning G.O.D. can read private Evolution evidence or execute. Every service checks current persisted roles and ownership. Player ownership, Admin-only access and foreign G.O.D. status grant no Evolution authority.
- Player sheets show their updated normal Character. Animals & Companions reads the same Creature ID and current definition/health, with no private snapshots, requirements or Evolution controls. Ownership and the existing limited companion controls remain intact.

## Return and history

The server selects the most recent unreversed **forward event whose destination is the exact current definition**. Clients cannot choose an arbitrary historical target. No candidate means no Return. Both Race and Creature chains support A→B→C, then C→B→A; evolving A→B again creates a new forward event.

Migration **0087_evolution_history_returns** adds `operation` and a typed, same-table `reverses_event_id` to both history tables. Existing rows default to `evolution`; no reversal is inferred. A partial unique index permits one Return per original event. Checks and insertion triggers enforce forward/Return shape and matching individual, Campaign, path/version and reversed source/destination. Existing update-immutability triggers remain. `NO ACTION` self-references preserve provenance while allowing the explicit Campaign graph deletion to delete that Campaign's history together. Ordinary source, path and individual deletion remains protected.

### Race mathematics

For every persisted Attribute and HP/movement/magic step:

`Return value = current saved value − original event's actual applied contribution`

An authored Set records its actual delta. For example, STR 30→40 contributes +10; a later saved STR of 48 returns to 38. HP steps 2→0 contribute −2; a later saved value of 3 returns to 5. Later advancement survives. Current path authoring is never used to compute the reversal. Legacy events without explicit applied deltas use their own exact `after − before` evidence, with finite-value, duplicate-Attribute and whole-step validation. Invalid, negative or nonfinite outcomes reject atomically; nothing is clamped.

The exact historical Race supplies its current definition-owned mechanics. Its archived status or removal from Campaign creation lists produces a warning, not a substituted Race. A narrow reader/save exception retains only the individual's current Race proven by its latest Return event. It does not add creation choices for other individuals or modify Campaign allowlists.

### Creature snapshots

Return restores the original event's **source baseline and source current snapshots**. Today's master Creature is not substituted. Prior individual edits return. The historical current snapshot is normalized with the individual's **current HP Adjustment**, which remains unchanged. Post-Evolution mechanical edits are compared against the recorded destination current snapshot with HP Adjustment normalized to zero; replacing meaningful edits requires explicit confirmation. No speculative merging occurs.

Identity, name, owner, notes, progression, purchased allocations, inventory, exact Item instances, custody, equipment, charges, firearm state, effects, conditions and health records survive. Maxima/anatomy are projected through the existing health resolver. Stored total/pool damage and injuries are untouched; removed pools remain historical/orphaned and new pools have no invented damage. The review shows before/after health, warns about harmful maxima and equipment fit, and requires acknowledgement. Neither direction heals, rescales damage, remaps injuries or reconciles equipment automatically.

## Transactions and interrupted requests

Forward and Return share the existing Pass 3 transaction fence: deterministic fail-fast locks over authoritative fact tables, fresh authorization, Campaign/individual/owner/profile/Encounter locks and a durable request advisory lock. Active or frozen Encounters and prepared runtime state block both directions. Planned/completed Encounter records remain unchanged. An event insertion failure rolls back every mechanical write.

The sheet stores the exact confirmed request and preview in session storage before sending. Lost responses, closing/reopening the panel and page reloads resume that original request. A serialized receipt check distinguishes known rollback from uncertain acknowledgement. Identical retries return the original event; changed input cannot reuse its key. New operations stay unavailable while acknowledgement is pending.

## Character / Race Form printing

**Print / Export → Print options → Form references** lists every Form of the saved exact current Race, with individual checkboxes and **Include all authored Forms**. Selection is independent of View Form and applies to every existing preset. All presets retain their normal behavior and default to no Form pages; users explicitly select additions. Normal printing always uses normal saved Character values.

The printable model calls `resolveCharacterFormPreview` and the existing saved-state Access evaluator. It contains no second mechanics calculator. Available, Locked and Needs G.O.D. Review Forms can all be printed; each includes its requirements, failures or review explanation. Printing grants no access and performs no mutation.

Each selected Form starts its own paper section with Character, Race and Form names, **REFERENCE ONLY — NOT CURRENT FORM STATE**, page identifiers and continuation pagination. Effective content includes:

- Description, notes, size; normal/delta/effective Attributes, modifiers, roll targets and authored Attribute references.
- Maximum HP, anatomy/pools/percentages, hit locations and effects; movement values and Initiative.
- Natural Protection/coverage; Natural Attacks, range, Skills, Initiative, anatomical prerequisites, hit effects and Magic Construction details.
- Skill calculations/additions and granted ability descriptions; Interaction Rules and inheritance/replacement labels.
- Manipulation, speech and equipment restrictions; complete transformation entry/exit timing, costs, conditions, involuntary triggers, duration, use limits, cooldown/recovery, equipment notes and other transformation notes.

Every Form reference states: “Current damage and injuries remain recorded on the Character. This page is a Form mechanical reference; no damage redistribution has occurred.” It creates no Form health, equipment or runtime state.

Evolution/Return clears former Form selections and refreshes an open print menu from the new exact Race while retaining print preset/appearance choices. Stale saved-Race snapshots cannot print former Forms. Race NPCs reuse the same authorized saved Character printing. Creature Form viewing remains intact; there is no established full Creature NPC print system to extend, so Creature Form printing remains deferred to broader NPC/runtime printing.

## Verification

- **737 unit/source tests passed**, covering Evolutions, Characters/printing, Races, Creatures, Forms/Access, ownership/NPCs, Items/equipment, active health/effects, lifecycle, catalog visibility and authorization.
- **14 new Pass 5 database tests passed**, alongside Evolution Passes 1–4. Tests include both chain types, real saved PC/Race NPC printing, exact historical contribution/snapshot restoration, all unrelated public-table preservation, archived/nonallowlisted Race reading, authorization, same-key concurrent replay, stale previews, every active Encounter kind, concurrent writers, insert-failure rollback, SQL provenance/immutability and actual Campaign deletion.
- Fresh **88-migration** chain and populated **0086→0087** upgrade passed, retaining every prior public-table value and original forward event. Migrations 0082–0086 are unchanged.
- Full Forms/Access, Creature Ownership Passes 1/2, companion equipment and Item use, and lifecycle regressions passed in disposable databases.
- Actual browser: PC, Race NPC and Creature NPC Evolution/Return; prebound reviews; immediate current definition/Form/print refresh; Player privacy; desktop and 390px controls; lost Return response with page-reload replay. Passes 1–4 authoring/execution browser checks also passed.
- Actual Chrome PDFs: **3 packets / 27 pages**, **196 paragraphs and 185 table rows** checked against rendered content; no missing text, clipped bounds, unreadable font sizes, blank spill pages or pagination failures. Dedicated selected-Form starts verified. Page images and contact sheets inspected.
- Race and Creature authoring disposable/browser suites passed, including Race gameplay compatibility (116 tests), Forms and frozen NPC snapshots.
- Existing saved Character printing passed across presets, all eight themes, standalone books, mixed supernatural systems, unsaved-edit confirmation and mobile controls without data changes. Twenty-two fresh baseline PDFs were exported; the 24-file / 73-page review set (including two retained Adrian examples) passed PDF verification.
- Typecheck, changed-file lint, Drizzle check, production build and whitespace checks passed.

Validation used disposable databases. It does not claim physical-printer, Firefox, Safari or full combat acceptance. Reproduction: `scripts/creature-evolution-disposable.test.ts --browser --build`; `SERRIAN_EVOLUTION_SHEET_ONLY=true` limits its browser phase to Pass 5 after prior authoring checks. `scripts/verify-evolution-form-pdfs.py` verifies the exported PDFs. Review artifacts are under `artifacts/guidance/creature-evolutions`.

## Live migration status and rollout

Read-only verification on 2026-09-28 found the configured **DEV (`localhost:5432/serrian_tide_dev`) through 0086**, with all applied hashes matching. Its exact pending migration is **0087_evolution_history_returns**.

The user confirms the production database exists in pgAdmin. No production-named database was exposed by the configured localhost server over IPv4 or IPv6, so its current ledger could not be reverified from this connection. Do not infer that production is missing or that its ledger matches DEV. Production needs the new 0087 rollout, with 0086 already applied as its prerequisite; check that server's ledger for any earlier pending migrations.

**No DEV or production migration was performed.** The user will apply the migration later. Apply required migrations before using Pass 5 in that environment. No deployment was performed. Commit and Git synchronization are reported in the final handoff.

## Main implementation files

| Area | Files |
| --- | --- |
| Execution, Return, locking, history | `src/features/evolutions/evolution-execution-service.ts`, `evolution-execution.ts`, `evolution-execution-locks.ts`; `src/features/races/race-evolution-transition.ts` |
| Historical Race access | `src/features/evolutions/retained-historical-race.ts`; `src/app/characters/actions.ts` |
| Individual controls | `src/app/heavens/individual-evolution-panel.tsx`, `evolution-execution-dialog.tsx`, `evolution-execution-actions.ts`; Character editor and Creature NPC workspace |
| Schema | `src/db/evolution-event-schema.ts`; `drizzle/0087_evolution_history_returns.sql`, snapshot and journal |
| Printing | `src/features/characters/character-form-print.ts`, `paper-character.ts`, `character-print-options.ts`; `src/app/characters/character-print-center.tsx`, `paper-form-reference.tsx`, paper renderer/CSS |
| Focused verification | `scripts/evolution-pass-five-db.test.mjs`, `evolution-pass-five-browser.ts`, `evolution-return-upgrade.ts`, `verify-evolution-form-pdfs.py`; Character Form print and Race Return unit tests |

Pass 5 stops at permanent non-runtime Evolution/Return and reference-only printing.

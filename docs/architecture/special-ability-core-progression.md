# Special Ability core progression contract

Approved October 2, 2026. This supersedes the provisional progression language in the earlier Special Ability mechanics passes, including [Pass 5](special-ability-mechanics-pass-5.md). It does not enable mechanics execution.

## Current score and possession

The owning Special Ability's current Skill number is its progression value, from 0 through 100. The saved Normal Character adapter uses the greatest saved investment for that Skill across allocation paths, plus the existing current Race contribution. It does not use Attribute modifiers, parent Skill Rank, temporary modifiers, or other Special Abilities' scores.

Possession and score are distinct. Beginning Character creation may purchase a new Special Ability. After completion, Player XP advancement may only raise one already possessed. A positive saved allocation, an explicit G.O.D. assignment on the existing allocation, or a current Race link establishes possession. A Race or G.O.D. grant may establish possession at zero. An ordinary zero-point structural allocation does not establish possession. Temporary Form grants remain outside this saved Normal projection; this pass does not add unsupported grant sources.

Advancement uses the existing normal Skill XP calculation. For example, 25 to 26 costs 25 XP, and 26 to 27 costs 26 XP. The existing first-point rule remains 10 XP for 0 to 1. No Variant Rule multiplier is introduced.

## Acquisition audit and repaired gaps

The existing creation purchase, post-creation new-acquisition rejection, and positive-point G.O.D. assignment paths were retained. No second assignment table or acquisition workflow was added.

Three enforcement gaps were confirmed and repaired:

- Race links already established zero-point possession in the mechanics reader, but XP advancement required positive purchased points. Both the advancement UI and server now recognize saved possession, including Race and G.O.D. grants.
- Setting a G.O.D.-assigned ability to zero removed its allocation in the editor. The existing allocation now has a `special_ability_granted` flag, defaulting to false. G.O.D. point edits retain possession at zero; the existing Skill row also offers explicit assignment/removal. Players cannot forge or remove that flag. Old positive allocations continue to establish possession without a backfill.
- G.O.D. full-record saves bypassed the Special Ability maximum. The save boundary now checks the effective score, including Race points. Existing creation and advancement caps remain in place. Ordinary Skill caps are unchanged.

The full Character save also checks the locked creation-completion timestamp and preserves it, preventing a stale creation draft from reopening or overwriting a completed record.

## Score-changing routes

`saveCharacter` remains the allocation write path for creation, random creation drafts, and manager adjustments. `advanceCharacterSkills` remains the XP write path; the single-Skill wrapper delegates to it. The advancement eligibility check uses original saved allocations and the current Race, never projected purchases in the same batch. Failed plans leave allocations and both XP totals unchanged.

Migration `0091_special_ability_zero_point_assignment.sql` adds the allocation flag and deferred database checks. Those checks validate final scores after allocation writes, Character Race changes (including Evolution), Race grant edits, and Skill reclassification. They also cover direct copying/importing into those tables. They permit a transaction to adjust multiple related rows before validating its final state. No saved mechanics documents or existing allocations are rewritten. Existing invalid records are not silently repaired; subsequent relevant writes must satisfy the contract.

The migration must be applied before running this code against a shared database. Verification applies it only to disposable databases; no shared DEV or Production migration is part of this pass.

## Authoring and historical documents

The condition editor offers **Current Special Ability Score** with the existing six comparisons: at least, more than, at most, less than, equal to, and not equal to. Each Mechanics Rule owns its conditions. Authors can choose any finite benchmark from 0 through 100; there are no fixed tiers, formulas, or executable expressions. Existing AND/OR qualification groups are retained.

New or explicitly edited mechanics documents reject out-of-range benchmarks. Historical v1/v2 documents remain readable with their original numeric values and original stored bytes. Opening a document or saving unrelated core fields does not rewrite it. A historical out-of-range condition can be opened for review and corrected explicitly before saving mechanics. Future and malformed documents retain their existing preservation protections.

Capability, Manual / G.O.D., Resource, Modifier, Interaction, Activated / Triggered, Rule Override, and Choice / Binding definitions remain supported. Existing score-based amount definitions remain preserved; amount execution remains deferred. This pass adds no balance limits on authored effects, runtime effects, resource spending, rolls, passive reconciliation, triggers, Rule Override authority, or Character choice bindings. It makes no Worlds or Super Power catalog changes.

## Verification

- Normal unit command: **1,812 passing tests across 207 feature files**, including score semantics, six comparison operators, independent 30/55/80/100 examples, zero-point grant advancement, and historical document preservation.
- Disposable Special Ability database harness: **15 passing tests**, including real creation purchases, atomic rejection of new post-creation acquisition, structural zero rejection, G.O.D. positive/zero assignment, Race-zero advancement, normal XP costs, manager/XP/direct-write/Race-change caps, and unchanged ordinary Skill caps.
- Disposable authoring browser: **10 passing check groups**, including numerical condition creation/editing, invalid-range rejection, retained saved data, all mechanics families, and desktop/390px layouts.
- Disposable Character harness: **14 passing action tests and 9 browser check groups**, including G.O.D. zero-score save/reload, Character/tabletop/combat inspection, and read-only snapshots unchanged across 88 tables.
- Generated Quick Print and Universal/Plain reference PDFs pass paragraph, page-boundary, text-size, and clipping checks: **3 PDFs, 14 pages**. Rendered contact sheets were visually inspected.
- Typecheck, lint, whitespace, and Drizzle migration metadata checks pass. The disposable database matches `0091_snapshot.json`: **199 tables, 2,306 columns, 1,489 constraints, 404 explicit indexes, and 51 enums**.

Evidence is under the ignored `artifacts/guidance/special-ability-pass-4/` and `special-ability-pass-5/` directories. Repeat database verification with `node --import tsx --test scripts/special-ability-foundation-disposable.test.ts`; authoring verification with `node --import tsx scripts/special-ability-authoring-disposable.test.ts`; and Character reading verification by setting `SERRIAN_SPECIAL_ABILITY_READ_ONLY=true` before running `node --import tsx --test scripts/character-sheet-pass-one-disposable.test.ts`. Browser harnesses run sequentially because they restore shared Next configuration. PDF verification uses `scripts/verify-special-ability-pdfs.py` with PyMuPDF and Pillow.

These automated checks do not constitute human acceptance. No runtime execution pass, shared database migration, deployment, or push is included.

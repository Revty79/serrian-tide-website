# Final Forms architecture audit and authoring cleanup

Audited the combined Forms foundation at `4d7bd8bd41541e5f4be78a07867de8e321ed12f9`, including all six preceding Race/Creature passes. This document describes the current combined system and supersedes earlier handoffs' statements that a subsequent completed Forms pass is still unstarted. It does not authorize another feature pass.

## What the system provides

A **Variant** is an independently editable Race or Creature definition. Cloning starts it with a copy of its parent's content; later edits do not propagate between them. A **Form** is an alternate body or state belonging to one exact Race or Creature. Forms do not inherit from one another or search a Variant's parent chain. The Race or Creature itself is Normal; there is no synthetic Normal Form row.

There is no fixed limit on the number of Forms. Each has a stable owner-local identity, database ID, name, description, notes and order. Editing or reordering keeps surviving Form IDs. Removing one does not recreate its siblings. Old callers that omit Forms preserve them.

**Access** answers who qualifies to use a Form. **Transformation** describes how and when a qualified individual could change or return. **Evolution** would be a lasting change to an individual's identity or progression, potentially changing the available Forms. It remains a separate future system.

### Race Forms

Race authors can describe Size, six signed Attribute changes, body/HP pools/hit locations, movement, Natural Protection, Natural Attacks, Skill predispositions and granted Special Abilities, Interaction Rules, use of hands/tools/objects, speech, equipment behavior and other restrictions. Natural Attacks retain their existing shared Initiative, attack type, range, magical status, on-hit effects and Magic Construction. Their intended Skill and required body parts remain separate from Creature fixed attack percentages.

The six Attribute entries are changes to a Character's normal score. Strength +5 means normal Strength plus 5 in the preview. Zero means unchanged. They do not replace Race caps, write Character Attributes or grant creation points. Race Size does not use Creature Size scaling.

### Creature Forms

Creature authors use the existing Creature controls for base Attributes, Size and exceptional steps, movement, HP pools/hit locations, Natural Armor and Soak, attacks, abilities, defenses and Skills. Attack percentages and native ability costs, conditions, effects and Magic Construction remain native Creature data. These are not converted into Race or Character mechanics.

Creature Form Attribute entries are replacement base scores, followed by the existing Creature Size multiplier. A blank score is unknown. This distinction is stated immediately above the Form Attribute controls as well as in Size guidance. CR/XP remain the Normal Creature's values; Form preview does not calculate a new CR.

### Deterministic choices

| Category | Keep normal choices | Different or additional choices |
| --- | --- | --- |
| Race Size | Blank follows the Race | One selected Race Size, without Creature scaling |
| Race Attributes | Six zero changes | Add each signed change to the corresponding normal Character score |
| Race body | Follow Race anatomy, including its humanoid default | Use the Form body; humanoid is also a valid explicitly chosen Form body |
| Race movement, protection, attacks | Use the complete normal Race list | Use the complete Form list; an empty list means none |
| Race Skills/Abilities | Keep Race grants and learned Skills | Add Form grants/predispositions; learned Skills remain; existing rank and point helpers calculate the display |
| Creature Size and exceptional steps | Blank follows the Creature | Use the entered value; zero steps explicitly means zero |
| Creature Attributes, movement, attacks, abilities, defenses | Use the complete normal Creature category | Use the complete Form category; an empty list means none, not an implicit merge |
| Creature body | Keep normal pools and locations | Replace pools and locations together; locations must refer to pools in this body |
| Creature Skills | Keep normal Skills | Add keeps unrelated Skills and uses the Form Rank for a repeated Skill; Form-only uses only its list, including none |
| Both owners' Interaction Rules | Keep normal rules | Additional rules follow normal rules; Form-only replaces them, including an empty list. This does not invent stacking rules |
| Physical capabilities | Same as the normal Race/Creature | Describe the Form's limitations and equipment behavior; no inventory or speech changes execute |

Returning a section to normal choices clears its alternate authoring values in the editor. Server validation rejects contradictory hidden data. Race protection and attack anatomy requirements are checked against the chosen Form body, including retained normal attacks/protection. Creature Forms reuse the native definition validator. Merely changing the selected preview always starts again from Normal, not from the previous Form.

## Access and transformation

Each **way to qualify** contains requirements that must all be met. Meeting any complete way is enough. A failed automatic requirement makes that way Locked even if it also contains a G.O.D. ruling. An entirely passing way makes the Form Available. With no passing way, a way that only needs an unresolved ruling produces **Needs G.O.D. Review**. Manual notes never count as approval.

New/legacy unspecified Access has no requirements. Explicit malformed Access remains Locked rather than silently granting eligibility. Requirement-based Access with no requirements is rejected.

Character checks use the saved normal Attributes, purchased Skill points, Race grants and resolved Derived Ability possession. A granted Special Ability with zero minimum counts as possessed without an allocation. Numeric Skill comparisons use the highest saved purchased investment along an existing path, not Rank, racial points or a sum of paths. Derived Ability possession is distinct from whether its live conditions currently allow use. Unsaved Race changes require saving before requirement-based eligibility can be established.

Creature checks use saved normal native Attributes after Size scaling, listed Skills and normal Creature Ability identities. Creature textual Rank is not interpreted as Character Skill points. NPC checks use its saved normal snapshot and frozen Form requirements. A Form's own Attribute, Skill or Ability benefits cannot unlock it. Missing normal Attributes require a G.O.D. ruling rather than an invented score.

Transformation records control over entry, entry/return timing, resource costs, conditions, forced triggers, duration, ways to return, use limits, waiting time, equipment notes and general rulings. An undecided cost/timing is not inferred to be free or instant. Existing shared cost/condition/use-limit validation remains in force. Conditions and triggers may need notes explaining combinations; no execution policy is inferred from that text.

## Preview and save safety

The Character viewer shows preview Attributes, modifiers, roll targets and available Attribute reference facts; Initiative and maximum HP; body and hit locations; movement; protection; complete authored attacks; learned Skill calculations; retained and Form-granted Special Abilities; Interaction Rules; Size/capabilities/restrictions; Access; and transformation rules. Unknown reference facts remain unrecorded rather than extrapolated.

The Creature-NPC viewer shows its frozen native Form data: base/effective Attributes, multipliers, maximum HP/pools/locations, Armor/Soak, movement, attacks, abilities, defenses, Skills, Interaction Rules, capabilities, transformation and Access. It does not fetch a changed library Form to fill in or replace snapshot data.

Both viewers keep selection in local component state and accept no mutation callback. Normal is the default; reopening/reset returns to Normal. Locked Forms remain inspectable with an explicit warning. Maximum HP is not current health, and damage is never redistributed by preview. Character creation, advancement, readiness, budgets, normal editing, inventory, equipment, Mana, Active Effects, printing and combat do not consume preview values. An unrelated Character Story save or Creature-NPC personality save writes the normal editable data while a preview is open.

Server NPC saves restore the stored frozen Forms from the locked snapshot, including keeping the property absent for old snapshots. Forged or unrelated saves cannot replace those Forms. Baseline and current snapshot responsibilities remain separate.

### Runtime search and boundaries

Searched `src` and `scripts` for active/current Form fields, Form timing/cooldown state, Transform actions and involuntary transformation execution, then inspected the callers of the Form projection, Access and transformation modules. Database schemas contain library Form definitions and their relationships, not individual active Form state. Projection callers are authoring validation/editors and the two display resolvers. Access callers provide saved normal facts. Transformation is normalization, storage and display only.

No active/current Character or NPC Form field, combat Form state, transformation action, automatic spending, timer, cooldown counter, involuntary executor, equipment mutation or incoming-effect Form consumer was found. Encounter construction may carry frozen Form metadata; its combat readers do not select or execute it. Existing non-Form combat, equipment and incoming-effect systems remain separate.

## Storage, lifecycle and copying

Identity and exact ownership are relational. Race mechanical child lists and both owners' Skill/Access references retain their existing relational tables. Cohesive body/capability/attack/transformation/native Creature configuration uses versioned, validated JSON. JSON column checks enforce envelopes; the shared service normalizers validate the contents. This is deliberately not a claim that a database JSON check validates every nested rule.

Skill and Derived Ability references have restrictive FKs and lifecycle dependency reporting. Owned Form children cascade on eligible Form/root destruction. Archived references already used can be retained/copied; new archived assignments reject. Tests exercise exact-owner validation, rollback, reference deletion protection and root cleanup.

Creature Ability prerequisites intentionally retain portable canonical IDs validated against the exact owner's final normal Ability list. Saving rejects foreign, missing or Form-only abilities. Removing a referenced Ability requires changing/removing its prerequisite in the same transaction. Derived Creature cloning remaps to the copied normal Ability. Frozen snapshots need no live library row to evaluate it. Replacing this with a mandatory live-library FK would damage that independence, so this boundary is preserved. Direct SQL bypasses service validation and is not an authoring workflow.

Variant/derived-Creature copies receive new owned rows and independent configuration. Form-local keys inside copied JSON do not represent shared mutable child rows. Existing snapshots without Forms, and Forms without Access, remain compatible and are not rewritten merely by being read/saved.

**No migration is required.** No schema, migration, journal or snapshot file changed. The corrections use existing columns. All database mutation for validation occurred in disposable PostgreSQL; this audit did not migrate a configured development or production database.

## Defects corrected

1. **Derived Creature structured details were lost.** The clone SQL copied legacy attack/ability fields but omitted `authoring_json`. It now copies those columns, so a Form keeping normal attacks/abilities retains Initiative, ranges, costs, conditions, limits and other structured details. A real database test checks reload, fallback preview and independence from later child edits.
2. **Large native row IDs could collide during cloning.** PostgreSQL `lpad(text, 4, ...)` truncates strings longer than four digits. Clone identities, copied effect joins and prerequisite remapping now pad to at least the actual length. The regression creates multiple attack/ability rows at IDs 10,000 and above and checks distinct copies, effects and remapped access.
3. **Retained zero-minimum Race Special Abilities were absent from preview.** The old display depended on positive-point allocations or Form-only additions. The resolver now includes granted abilities from both normal Race and Form choices, deduplicates by saved Skill identity and marks their origin. Pure and real-browser tests prove visibility, no extra allocations and independent Form switching.
4. **Race attack preview omitted authored details.** Required body parts/hit locations, on-hit effects and Magic Construction are now visible. The two viewers share the existing recursive read-only detail display, avoiding two versions of that presentation. The browser opens a persisted on-hit effect and verifies the required body part; a render regression checks nested detail preservation and hidden storage keys.
5. **Creature Form rule help incorrectly claimed live combat behavior.** It now passes the existing authoring-only option, matching Race Forms. The common help explicitly says these Form rules appear in preview without being applied during play.

The clone corrections affect future copies. They do not reconstruct details already omitted from older derived Creatures or rewrite existing NPC snapshots; doing so would require a separate, explicit data-repair decision.

## Authoring language inventory

Stored enums, operators, grouping, fallback choices, validation rules and calculations retain their meanings. Changes below are presentation changes except for the defects listed above. Normal non-Form Skill-link labels are retained; Form controls use the new wording. The shared Interaction Rule match options are clearer for both owners and still store `ANY`/`ALL`.

### Access

| Previous wording | Current wording/meaning |
| --- | --- |
| Access mode | Who can use this Form? |
| Unrestricted | Anyone with this Race/Creature can use it |
| Requirements | Only those who meet specific requirements |
| Access group / Group N | Way to qualify #N |
| Add AND requirement | Add another requirement that must also be met |
| Add OR group | Add another way to qualify |
| Remove access requirement | Remove this requirement |
| Remove access group | Remove this way to qualify |
| AND/OR explanation | All requirements in this section must be met; OR identifies another way to unlock the Form |
| Access comparison | What must be true? |
| ≥, >, ≤, <, =, ≠ | Is at least, Is greater than, Is at most, Is less than, Equals, Does not equal |
| Possessed / Not possessed | Has this Skill or Ability / Does not have this Skill or Ability |
| Search access references | Find a Skill or Ability |
| Choose a saved definition | Choose a Skill or Ability |
| Manual / G.O.D. | G.O.D. approval or story event |
| Manual access requirement | What must the G.O.D. confirm? |
| Access notes | Requirement notes |
| Manual Review | Needs G.O.D. Review |
| Invalid access definition | The access requirements need correction |
| Access group satisfied / alternative | Meets a complete way to qualify / one way still needs a ruling |
| Normal value not authored | Normal value has not been recorded |
| Creature Ability ID beside every option | Named Ability; identity is shown only to distinguish duplicate names |

Guidance now explains the saved normal check, why a Form cannot unlock itself, Race grants including zero-minimum abilities, purchased points versus Rank, native Creature Skill presence and the meaning of unknown data. Owner-specific editor and result text says Race, Character or Creature as appropriate. Locked-preview warnings retain their safety meaning. Search help describes library entries and retained archived choices instead of implementation references.

### Normal choices and physical details

| Previous wording | Current wording/meaning |
| --- | --- |
| Form Anatomy source | Body and hit locations in this Form |
| Form Movement / Natural Protection / Natural Attacks source | Movement / Natural Protection / Natural Attacks in this Form |
| Form Skills source | Skills and Abilities in this Form |
| Creature category or Body source | Named category or Body in this Form |
| Use Race definition / Using Race definition | Use the Race's normal named category / Same as the normal Race |
| Override for this Form / Overridden | Define different choices for this Form / Different in this Form |
| Use Creature definition | Use the Creature's normal choices |
| Add to Creature definition | Keep the normal choices and add more |
| Replace Creature definition | Use only these choices while in this Form |
| Race Skills/Abilities add | Keep the normal Skills and Abilities and add more |
| Interaction Rules source | Interaction Rules in this Form |
| Race/Creature Interaction Rules add/replace | Keep normal rules and add more / Use only these rules while in this Form |
| ANY / ALL match options and Match ANY/ALL preview | At least one condition must apply / Every condition must apply; preview says any one or all of these must apply |
| Strength etc. adjustment | Strength etc. change while in this Form |
| Absolute/native Creature values | Replacement base scores, then Size scaling; blank means unknown |
| Link Type in Form Skills | What does this Form provide? / What this Form provides |
| Skill / Granted in Form Skills | Skill predisposition / Granted Special Ability |
| Add Link in Form Skills | Add Skill or Ability |
| Link Value in Form Skills | Form Skill points |
| Physical capabilities / equipment | Using the body and equipment |
| Form-specific intent | Different in this Form |
| Manipulation / Form manipulation | Using hands, tools & objects; matching notes label |
| Full / limited / no functional manipulation | Can use hands, tools and objects normally / Limited use / Cannot use hands, tools or objects |
| Creature Form speech/equipment | Speech in this Form / Equipment in this Form; matching notes labels |
| Use Race/Creature capability / follows owner | Same as the normal Race/Creature |
| Retained normally / unusable | Equipment stays with the body as normal / stays but cannot be used |
| Dropped / Merges | Equipment falls to the ground / merges with the body and cannot be reached |
| Defense defenseType / against / value / notes | Defense type / What does it protect against? / Protection amount / Defense notes |
| Form Skills link replacement in viewer | Normal Skills remain; a Form's Rank is used for the same Skill, or only the Form list is used |

Fallback help explicitly explains whole-list choices, clearing alternate entries when returning to normal, and empty lists meaning none. Race body help says body parts rather than authored identities/override. Protection help asks which hit locations are protected. Skill help explains extra points alongside purchases/normal grants and zero-minimum granted abilities. CR help calls out reference-only impact. Capability, equipment and restriction help describes choices without promising automatic effects. Creature Interaction Rules now use the shared preview-only warning.

### Transformation

| Previous wording | Current wording/meaning |
| --- | --- |
| Authored definition / Unspecified section | Rules recorded / No rules recorded |
| Entry method | Who controls changing into this Form? |
| Voluntary / Involuntary / Either | By choice / Forced by a trigger / By choice or forced by a trigger |
| Custom | G.O.D. ruling described in notes |
| Unspecified choice | Not decided |
| Entry/Exit timing method | How long does entry/exit take? |
| Entry/Exit timing group | Time needed for entry/exit |
| Initiative / Time | Costs Initiative / Takes time; Instant remains explicit |
| Entry/Exit non-combat time | Time for entry/exit outside combat |
| Entry/Exit costs | Does entry/exit cost resources? |
| Authored costs | List resource costs |
| Health / Resource | HP / Named resource |
| Entry requirements | Conditions needed before changing |
| Involuntary triggers | What can force the change? |
| Add entry requirements / involuntary triggers | Add a condition for changing / Add a trigger for a forced change |
| Manual / State condition | G.O.D. ruling / Current circumstances |
| Condition fact | What circumstance matters? |
| Comparison | What should be true? |
| Form duration | How long does this Form last? |
| Voluntary End / Fixed / Condition End | Until choosing to return / For a set length of time / Until an ending condition is met |
| Scene / Encounter duration | For the scene / For the encounter |
| Persistent | Continues until a return rule ends it |
| Exit rules | Ways to return from this Form |
| Duration End / Resource Depletion / Action | When its time runs out / When the required resource runs out / By taking a return action |
| Use limits | How often can this change happen? |
| Unlimited / Authored limits | No limit on uses / Limit the number of uses |
| Custom use limits | G.O.D. ruling described below |
| Refresh scope | When do uses return? |
| Round / Encounter / Scene refresh | Each round / Each encounter / Each scene |
| Manual / Event / Never refresh | When the G.O.D. restores them / After the named event / Never |
| Refresh key | Event that restores uses |
| Cooldown / custom limit | Waiting time between changes or other limits |
| Equipment entry/exit notes | What happens to equipment when changing/returning? |
| Clear transformation definition | Clear transformation rules |

Every transformation group retains help for what it records, when to use it and what undecided/empty means. Help removes claims about shared vocabulary, keys and runtime events. It explains positive costs, named resources, combined conditions in notes, explicit instant changes, unknown rules, resource restoration, and equipment notes supplementing the one physical equipment choice. Nothing is automatically evaluated, spent, counted or restored.

The summary uses **Who controls the change?**, **Time/Costs to change**, **Conditions needed before changing**, **What can force the change?**, **Ways to return**, **Time/Costs to return**, **How often changes are allowed**, **Waiting time or other limits**, and **Equipment when changing/returning**. Summary options use the same display labels as the editor, with separate labels for duration and restoring uses.

### Preview, empty states and validation

- “Current runtime state” becomes “actual state”; the warning remains prominent for both viewers. “Normal draft” becomes “normal Creature values.” Preview-only warnings no longer describe implementation machinery.
- “Transformation definition” becomes “Transformation rules.” No transformation rules explicitly leaves changing, returning, costs and limits undecided.
- “No Forms authored / normal definition” becomes “No alternate Forms; uses its normal body and abilities.” Both owners explain that describing and previewing Forms does not automate changing during play. The Race Forms page guide now summarizes these rules and Access in ordinary language.
- “No movement modes” becomes “No movement is listed for this Form.” Empty additional Skills retain normal Skills. Empty restrictions say none are recorded and the other capability choices still apply.
- The Character viewer separates **Granted Special Abilities**, **Kept from the normal Race / Available in this Form**, and **Additional Skill predispositions**. No granted abilities and no extra predispositions have distinct empty messages.
- The Race attack viewer adds **Required body parts**, **Required hit locations**, and **Effects on a hit and Magic Construction**, with unrecorded requirements stated explicitly. Creature attack “Mode” becomes “Attack type.”
- Shared nested details hide storage IDs/versions/order fields. Labels clarify **How it is used**, **Resource name**, **When uses return**, **Event that restores uses**, **Required circumstance**, **What must be true**, **Required number/text**, **Effects on a hit**, **Magic Construction**, **Spell details**, and **Type**. Unknown/empty detail values read **Not recorded / None recorded**.
- Access errors ask the author to choose who can use the Form, add a requirement, select a Skill/Ability, explain a ruling, or remove/re-add a damaged requirement. Duplicate positions/identities no longer demand database knowledge. Owner/type and possession errors ask for an offered requirement or presence/absence choice. Invalid explicit Access still fails closed.
- Form/Transformation format errors ask for reload/review rather than `schemaVersion`, objects or ordered lists. Hidden-data errors ask for the corresponding different/additional choices, **List resource costs**, or **Limit the number of uses**. Invalid protection coverage asks for a hit location that exists in this Form. Repeated restrictions ask to remove/re-add the duplicate. Numeric/canonical diagnostics shared with other established systems remain where they identify a concrete invalid value.
- Shared controls retain semantic theme colors, visible validation, keyboard guidance and help descriptions. Long buttons wrap within the Form panel. No independent palette or duplicate editor was introduced.

## Future owned Creatures and Evolutions

No Forms-specific blocker was found for a future persistent owned Creature. An individual can already retain its own identity, damage/current state and copied definition containing Forms. A future ownership system still needs its own authorization, transfer, health/state and definition-version policy; it should use individual identity rather than treating a library Form or Variant as the individual. This audit adds none of that system.

Evolution remains separate. Branching progression can later change an individual's Race/Creature definition and offered Forms without making Forms into progression nodes. That work must explicitly decide how to retain history and map old/new Forms and Ability prerequisites while preserving the same individual. Exact-owner IDs and frozen snapshots should not silently retarget to a new library owner. No current restriction prevents that explicit design, and no Evolution tables or speculative abstractions were added.

Deferred runtime decisions include transformation authorization/enforcement, cost payment, timing/interruptions, duration and cooldown tracking, forced-trigger combinations, health mapping between bodies, equipment consequences and how future temporary effects combine with a Form. Notes and previews do not settle these rules. Existing older clones that lost structured data require a deliberate repair plan if repair is desired.

## Validation

| Check | Final result |
| --- | --- |
| Combined Race, Creature, attack, mechanical-effect, lifecycle, Character, Derived Ability, Forms and requirement domain/render tests | **500 passed**; includes Character creation/advancement, printing, equipment/ammunition and the added preview regressions |
| Full Race disposable harness | **44 database cases passed**: 10 Natural Attack, 10 Form identity, 11 mechanics, 13 transformation/preview/Access; full browser workflow passed |
| Incoming-effect target, Pass 5 runtime and Pass 6 gameplay database suites | **116 passed**, through the full Race harness |
| Full Creature disposable harness | **21 database cases passed**, including structured clone preservation and large IDs; existing authoring, NPC/direct encounter and new Forms browser workflows passed |
| Full containment/inventory/lifecycle/firearm disposable harness | **232 passed** across 12 scripts, including 99 physical/magical/custody/passive cases, 32 foundation/locking cases and root deletion guards |
| Desktop and 390px browser checks | Both authoring owners, multiple ways to qualify, transformation, both viewers, guidance, save/reload, independent previews and unrelated-save safety passed; no browser JavaScript errors |
| TypeScript | `npm.cmd run typecheck` passed |
| Changed TypeScript/TSX/MJS ESLint | Passed with `--max-warnings 0` |
| Drizzle metadata | `npx.cmd drizzle-kit check` passed; no migration/schema changes |
| Production build | `npm.cmd run build` passed, including TypeScript and all 27 static pages |
| Whitespace | `git diff --check` passed; staged check repeated before commit |

Database suites use fresh local PostgreSQL clusters. Existing migration-preservation comparisons passed, including old Form owners and frozen NPC JSON. Browser assertions compare all relevant stored runtime rows before/after preview, observe zero mutation requests from selection, retain actual saved damage and equipped inventory, and verify unrelated saves. Existing permissions, archive/restore, lifecycle, inventory, firearms and incoming-effect checks remained green.

The domain/render command uses the existing local CSS import hook because direct Node rendering does not process CSS modules. It does not replace product code or skip assertions. Initial failures from old UI/error-text assertions were updated to match the deliberate wording changes; three unescaped JSX apostrophes were corrected. Final checks above are passing runs.

### Screenshot review

Actual headless Chromium screenshots were inspected at **1440px desktop** and **390px narrow width**, with existing Creature workflow coverage also at 1365px. Inspected both editors' Access paths, the conversational all/any explanation, wrapped add/remove buttons, transformation sections, Race signed Attribute guidance, Creature replacement/base-score guidance, and both viewer warnings/Access/mechanics. Viewport captures center the inspected section so sticky navigation does not conceal its heading. Long sections remain scrollable; buttons wrap, and page/panel overflow assertions pass.

Evidence is kept locally under `artifacts/race-authoring/forms-final-audit/` for logs, `artifacts/race-authoring/forms-final-*.png` plus the existing mechanics captures, and `artifacts/creature-authoring/forms-final-*.png`. These are ignored artifacts. This is automated browser verification with screenshot review, not a claim of human tabletop acceptance, physical-device testing, Firefox or Safari coverage.

The Forms authoring, storage, Access and preview foundation is ready to support separately scoped future owned-Creature/pet and Evolution work. Those features, active transformations and their gameplay policies are not implemented by this audit.

## Exact changed files

The manifest below includes the handoff itself. No database schema, migration, lockfile or package changes are included.

36 files:

- `docs/architecture/forms-final-audit.md`
- `scripts/creature-forms-browser-checks.ts`
- `scripts/creature-forms-db.test.mjs`
- `scripts/forms-audit-browser.ts`
- `scripts/race-form-mechanics-browser.ts`
- `scripts/race-form-mechanics-db.test.mjs`
- `scripts/race-form-preview-browser.ts`
- `scripts/race-forms-browser.ts`
- `src/app/characters/character-form-preview.tsx`
- `src/app/heavens/creatures/actions.ts`
- `src/app/heavens/creatures/creature-forms-editor.tsx`
- `src/app/heavens/interaction-rules-editor.tsx`
- `src/app/heavens/npcs/[npcId]/creature-form-preview.tsx`
- `src/app/heavens/races/race-anatomy-editor.tsx`
- `src/app/heavens/races/race-form-mechanics-editor.tsx`
- `src/app/heavens/races/race-forms-editor.tsx`
- `src/app/heavens/races/race-natural-protection-editor.tsx`
- `src/app/heavens/races/race-skill-links-editor.tsx`
- `src/components/forms/form-access-editor.tsx`
- `src/components/forms/form-access-summary.tsx`
- `src/components/forms/form-preview.tsx`
- `src/components/forms/form-transformation-editor.tsx`
- `src/components/forms/forms.module.css`
- `src/features/characters/character-form-preview.test.ts`
- `src/features/characters/character-form-preview.ts`
- `src/features/creatures/creature-forms.ts`
- `src/features/forms/form-access.test.ts`
- `src/features/forms/form-access.ts`
- `src/features/forms/form-capabilities.ts`
- `src/features/forms/form-language.ts`
- `src/features/forms/form-preview.test.ts`
- `src/features/forms/form-transformation.ts`
- `src/features/guidance/page-help.ts`
- `src/features/races/race-form-mechanics.test.ts`
- `src/features/races/race-form-mechanics.ts`
- `src/features/races/race-form-transformation.test.ts`

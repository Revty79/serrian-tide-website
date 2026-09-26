# Race improvements Pass 3: Form mechanical definitions

Implemented against `c921a0c974b0d0ea203c5cd3e10e55665c34e950`, retaining Pass 1 Natural Attacks and Pass 2 stable Race-owned Forms. Includes the explicit clarification requiring six signed Form Attribute adjustments.

## Scope

Forms now describe alternate mechanical states as authoring data. Every Form belongs to one exact Race and conceptually falls back to that Race. Forms never inherit from other Forms. No active Character Form, Character Sheet Form display, transformation action, inventory mutation, combat availability or runtime resolver was added. The Race remains the normal state.

## Storage and migration

`0073_race_form_mechanics.sql` adds a nullable versioned `mechanics_json` profile to `race_forms` and five owned child tables:

- `race_form_movement_modes`: stable Form-local key, Movement Mode, Base Movement, Notes and order.
- `race_form_natural_protections`: stable key, name, Natural Soak, coverage kind and order.
- `race_form_natural_protection_locations`: selected location relationships under a Form protection.
- `race_form_natural_attacks`: the Pass 1 attack fields and shared typed attack/Anatomy definitions, plus optional restrictive Skill reference.
- `race_form_skill_links`: existing Skill/Granted link concepts, optional value and order, with a restrictive Skill reference.

Each child belongs to the stable Form primary key; protection locations belong to their stable protection primary key. Ownership FKs cascade. Local keys and Skill-link composite keys preserve child IDs during saves. Only removed definitions are deleted; existing coverage relationships are retained when unchanged.

The Form profile stores category source modes, Size, six Attribute adjustments, shared Race Anatomy JSON, shared Interaction Rule JSON, structured capabilities and named restrictions with stable local keys/notes. These definitions belong to the Form row, not the Race. No duplicate attack, Anatomy or Interaction Rule language was introduced.

Existing Pass 2 Forms retain all original columns/IDs and receive `mechanics_json = null`. Reads interpret this as Use Race throughout, zero Attribute adjustments, unchanged capabilities and no restrictions. The migration infers nothing from names, inserts no mechanical children and changes no existing Race, Creature or Character definitions. Migration execution was confined to disposable databases; no persistent database or production deployment was changed.

## Authored semantics

| Category | Use Race / unchanged | Form-specific intent |
| --- | --- | --- |
| Size | `null` | One existing Race Size; no Creature size scaling |
| Attributes | All six numeric adjustments are zero | Signed changes keyed by existing `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHR` identities |
| Anatomy | `anatomyMode: race` | `override` uses independent shared Race Anatomy; null within an override explicitly means standard humanoid |
| Movement | `movementMode: race` | Complete replacement collection; empty means no movement modes |
| Natural Protection | `protectionMode: race` | Complete replacement collection; empty means no natural protection |
| Natural Attacks | `attacksMode: race` | Complete replacement collection; empty means no Natural Attacks |
| Skills / Abilities | `skillsMode: race` | `add` records Form-specific Skill predispositions or Granted Special Abilities alongside Race grants |
| Interaction Rules | `interactionMode: race` | `add` records Form rules after Race rules; `replace` substitutes the collection, including an empty collection |
| Manipulation | `race` | Full, limited or none, with Notes |
| Speech | `race` | Normal, limited or no normal speech, with Notes |
| Equipment | `race` | Retained, retained but unusable, dropped, merged/inaccessible or custom G.O.D. ruling, with Notes |
| Other physical restrictions | Empty list | Named, ordered restrictions with stable keys and Notes |

No collections merge implicitly. Rule additions retain their source ownership; identical local keys in separate sources do not identify the same rule. This pass does not invent rule stacking or execute combinations. Skill additions do not suppress learned Character knowledge, replace Race grants or apply points now. The existing Race eligibility restriction remains Tier 1 Skills or Special Abilities, with Granted limited to Special Abilities. Natural Attack Skill bases retain Pass 1's ability to reference any Skill tier. Saved archived references remain retainable and cloneable; new archived assignments reject.

Attribute adjustments are finite signed numbers in the existing Attribute score units, not roll modifiers or replacement scores. Zero means no change. The authoring UI accepts blank as zero. Positive, negative and unchanged values persist and deep-copy to variants. Nothing clamps, calculates or applies them to a Character, Race Cap, Character Creation or combat. Future runtime work must define interactions with caps and other active modifiers; no such calculation was guessed here.

## Anatomy, protection and attacks

The Form chooses its own Anatomy or the saved underlying Race Anatomy. Form attacks use the existing Natural Attack normalizer against that effective authored source. Form protection uses the existing Soak/coverage normalizer plus a check that selected roll numbers exist in that Anatomy. An overridden Form body must also support any Race attacks/protection that the author chooses to retain; otherwise the save asks the author to revise the reference or override that category. Empty replacements can deliberately remove inherited attacks/protection.

Editing Form Anatomy or attacks never writes Race Anatomy or Race attacks. Existing Race saves revalidate retained Form references against the newly saved Race definition, even when an older caller omits Forms, so a Race body edit cannot orphan authored Form requirements. Incomplete Anatomy remains supported under the existing Race rules; only explicit invalid references are rejected.

## Authoring and ownership

The existing Forms tab keeps each Form's identity fields and adds collapsible Body, Attributes, Movement, Protection, Natural Attacks, Skills/Abilities, Interaction Rules and Physical capabilities/equipment sections. Summary labels show Use Race, override or additions; Attributes summarize signed changes. Shared GuidedField guidance and semantic appearance variables are used throughout. Returning a section to Use Race clears its Form-specific override, as explained in its help.

Anatomy, protection, Natural Attacks and Interaction Rules reuse existing editors with Form-specific authoring-only guidance. Movement and Skill-link controls were extracted from the Race workspace into components reused by both Race and Form authoring. HTTP-safe temporary identities continue to use `crypto.getRandomValues`.

All changes save inside the existing authorized, root-locked Race transaction. A failed reference or mechanical validation rolls back the entire save. Missing Form mechanics from an older caller preserve the saved profile and children; an explicit default profile returns to Race behavior. Existing identity-only normalization remains backward-compatible.

Clone as Variant copies the saved profile and all mechanical children under fresh Form/child database IDs, preserving local keys, authored values and order. It does not link mechanics back to the parent. Archive/restore preserve all rows. Form deletion and eligible Race deletion remove every owned mechanical row and coverage relationship. Skill lifecycle previews now include blocking Form Skill additions and Form attack bases, matching their restrictive FKs.

## Validation

| Check | Result |
| --- | --- |
| Race, Creature, attack, mechanical-effect and lifecycle unit suites | 235 passed, including 6 new Form mechanics tests |
| New disposable Form mechanics database cases | 11 passed |
| Pass 1 Natural Attack and Pass 2 Forms database cases | 20 passed |
| Existing Character Creation, Attribute and print unit suite | 37 passed |
| Full Race authoring/browser and existing runtime database suites | Passed, including 116 runtime database tests and Pass 1–2 browser regressions |
| Multi-system Form authoring browser, desktop/390px | Passed; signed Attributes and shared editors save/reload/clone; no horizontal overflow |
| Existing Creature migration/authoring/browser/NPC snapshot suite | Passed; no browser JavaScript errors |
| TypeScript | Passed |
| Changed-file ESLint | Passed with zero warnings |
| Drizzle check and snapshot chain/schema preservation | Passed |
| Production build and final diff check | Passed; new-file whitespace checked as well |

The new database fixture authors Wolf Form with Size, alternate Anatomy, Land/Swim movement, location-specific fur, Bite and Skill basis, Skill and Special Ability additions, Interaction Rules, positive/negative/zero Attributes, manipulation, speech, equipment and restrictions. It is disposable test data only. Cases verify exact persistence, fallback/empty-replacement intent, validation against both Anatomy sources, transactional rollback, stale/archived references, stable IDs during reorder/edit, sibling and Race independence, deep variant copies, archive/restore and complete child cleanup. A real Character read before/after Form authoring remains exactly equal, and Character profile, Attribute, Skill and inventory storage remains unchanged.

Migration coverage pauses at 0072 with existing Forms and Character data, then compares all prior values after 0073. Existing Form IDs/text/order stay identical, the new profile is null and child tables are empty. Snapshot comparison confirms only the new profile/constraint and five child tables were added.

The larger fixture set exceeded the Race library's first 40-record page. Browser helpers now search for their intended Race, including the phone guidance workflow, instead of assuming its presence on page one. This was a test lookup correction, not a pagination behavior change.

Commands:

- `node --import tsx --test --test-reporter=tap` with all unit files under `src/features/{races,creatures,attacks,mechanical-effects,lifecycle}`.
- `node --import tsx --test scripts/race-authoring-disposable.test.ts`; set `RACE_FORM_MECHANICS_ONLY=1` for migration plus Pass 1–3 database cases.
- `node --import tsx --test scripts/creature-authoring-disposable.test.ts`.
- `npm.cmd run validate:character`; `npm.cmd run typecheck`; changed-file `npx.cmd eslint ... --max-warnings 0`; `npm.cmd run build`.
- `node node_modules/drizzle-kit/bin.cjs check`; 0072/0073 snapshot comparison; `git diff --check`.

Logs/screenshots are ignored local artifacts under `artifacts/race-authoring/form-mechanics-*`. Browser checks use Chrome automation, not production deployment or human tabletop acceptance.

Desktop and phone captures were inspected. Tall phone element captures include the site's sticky header over part of the captured area; interactive field/help checks and document overflow assertions passed. No Firefox, Safari or physical-device testing was performed.

## Remaining boundary

No unresolved tabletop decision blocks this authoring pass. Applying Attribute adjustments, combining other temporary effects, transformation conditions/costs, live equipment consequences and active Form resolution remain later work. Pass 4 transformation authoring and Character Sheet visibility have not begun.

## Exact file manifest

- `docs/architecture/race-form-mechanics-pass-three.md`
- `drizzle/0073_race_form_mechanics.sql`
- `drizzle/meta/0073_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/guidance-browser-checks.ts`
- `scripts/race-authoring-browser.ts`
- `scripts/race-authoring-disposable.test.ts`
- `scripts/race-form-mechanics-browser.ts`
- `scripts/race-form-mechanics-db.test.mjs`
- `scripts/race-form-mechanics-fixture.ts`
- `scripts/race-forms-browser.ts`
- `scripts/race-natural-attacks-browser.ts`
- `src/app/heavens/interaction-rules-editor.tsx`
- `src/app/heavens/races/actions.ts`
- `src/app/heavens/races/race-anatomy-editor.tsx`
- `src/app/heavens/races/race-form-mechanics-editor.tsx`
- `src/app/heavens/races/race-forms-editor.module.css`
- `src/app/heavens/races/race-forms-editor.tsx`
- `src/app/heavens/races/race-movement-editor.tsx`
- `src/app/heavens/races/race-natural-attacks-editor.tsx`
- `src/app/heavens/races/race-natural-protection-editor.tsx`
- `src/app/heavens/races/race-skill-links-editor.tsx`
- `src/app/heavens/races/race-workspace.tsx`
- `src/db/race-schema.ts`
- `src/features/guidance/page-help.ts`
- `src/features/lifecycle/lifecycle-service.ts`
- `src/features/races/race-form-mechanics-service.ts`
- `src/features/races/race-form-mechanics.test.ts`
- `src/features/races/race-form-mechanics.ts`
- `src/features/races/race-form-service.ts`
- `src/features/races/race-forms.ts`
- `src/features/races/race-variant-service.ts`

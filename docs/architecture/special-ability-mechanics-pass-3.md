# Special Ability Mechanics: Pass 3 authoring interface

September 30, 2026. Built on reviewed foundation commit `659705a2464a236b0b871c136794d41196733873` and the [Pass 2 contract](special-ability-mechanics-pass-2.md). This is the completion report and handoff for Pass 3. Pass 4 is not implemented.

## Interface and workflows

The existing Skill Creator now includes **Special Ability Mechanics** alongside Core Details, Pathing, Construction and Preview. The tab is available through the existing semantic Special Ability classification predicate, including its singular/plural handling. An ordinary Skill without mechanics has no mechanics tab. A Skill being changed away from Special Ability classification keeps the tab only so the author can inspect and explicitly detach its attached mechanics; active rule editing is disabled in that state.

Opening a Skill does not attach, infer or generate anything. Definition-only abilities stay definition-only. **Add Structured Mechanics** intentionally creates an empty v1 document in the draft; **Save Skill** persists it. An attached empty document has a clear explanation and remains valid. This pass uses the existing Skill save and explicit per-family mutation contract throughout.

**Detach Mechanics** opens an inline confirmation with **Keep Mechanics** and **Confirm Detach Mechanics**. Confirming stages an explicit removal; Save Skill commits it. The Definition and unrelated extensions remain intact. Invalid and unsupported documents also offer deliberate detach without mounting an editor over their content. Omission is never removal.

The editor adds exactly two rule workflows:

- **Add Capability Rule:** title, description, descriptive domain (Sense, Movement, Breathing, Communication, Other), qualification, optional limitations/notes and documentation references. Visible guidance explains that categories do not apply game mechanics.
- **Add Manual / G.O.D. Rule:** title, description, qualification, required G.O.D. Determination, optional limitations/notes and references. This is a legitimate authored rule, with no automatic interpretation of its prose.

Rule cards show type/domain, title, a short description, qualification summary, limitations and manual determination where relevant. Edit/Collapse Rule controls manage long forms. Move Rule Up/Down are native buttons; Remove Rule requires explicit confirmation. Full text remains available in the editor and Preview even when the list uses a shortened summary.

New rules begin with blank required text and an unfinished Requirements selection. Authors must supply their own text and deliberately choose Always or build qualification groups. No numerical values, thresholds, costs or catalog-specific mechanics are invented.

## Qualification and reference authoring

**Applies When** offers Always, when possessed, or Requirements. Requirements contain labeled **Way to qualify** groups separated by OR; conditions within a group are separated by AND. Authors can add, remove and reorder ways and conditions, and move a condition into another way. Empty groups remain visible and invalid, rather than silently becoming Always. Switching populated requirements to Always explicitly confirms removal of the groups.

New condition choices are Skill possession, Derived Ability possession and Manual / G.O.D. A possession condition uses an exact definition picker and Possessed/Not Possessed operator. Manual conditions require authored text. These are the existing v1 kinds, not new mechanics families.

**Self-progression cannot be newly authored or numerically edited.** Existing saved conditions display their operator and value with “Provisional — purchased-point interpretation not yet finalized.” Their keys, values and Pass 2 interpretation are preserved during unrelated edits and reorder. An author can explicitly remove one. There is no admin toggle that presents provisional purchased points as settled canon. Form Access, Rank, roll targets and `resolveSpecialAbilityProgression()` are unchanged.

Both possession clauses and documentation links use the same typed Skill/Derived Ability picker. It searches available names and saves exact IDs. Skill classification is a secondary label; duplicate names receive a secondary record identity to disambiguate them. Documentation links explain that they do not grant, execute, copy or transfer the referenced definition.

The server action authenticates G.O.D./admin access and uses existing `catalogCandidateWhere` discovery preferences. Archived retained IDs come from the actual saved mechanics document, never an arbitrary caller-supplied list. New archived choices are excluded; selected historical archived records show an explicit retained label. Missing saved choices stay visible as unavailable rather than being silently replaced. Pass 2's transactional validation remains authoritative, including when a target is archived after the picker loads. The UI retains the rejected draft for correction.

Keys are random local identities minted once for genuinely new rules, groups and conditions. Generation uses Web Crypto `getRandomValues`, including plain HTTP LAN contexts where `randomUUID` may be unavailable. Rename, text/operator/reference changes, reorder and condition moves preserve keys. A definition reference itself remains identified by its typed target identity; v1 does not add a new reference-child key or change its schema.

## Preview, validation and concurrency

**Special Ability Mechanics Preview** appears in the existing Preview tab. It calls the shared pure resolver with no owner facts and renders rule descriptions, qualification, limitations, notes, adjudication and resolved reference labels. It explicitly identifies itself as a definition preview: no Character has been evaluated and no mechanic applied. It does not mark authored rules Active or expose runtime controls.

The Pass 2 codec remains the validation authority. Draft editing keeps unfinished text instead of coercing or deleting it. The editor surfaces the codec's error with human-readable rule/group/condition locations. Inputs provide labels, shared field guidance and appropriate format limits. Server failures remain visible through the Skill workspace. An invalid draft's Preview explains that attention is required and leaves the text available in the editor.

Loaded invalid or newer documents display diagnostics and stay protected. The v1 rule editor is not mounted over them. Skill core edits preserve their exact bytes, as well as unrelated Spell Construction and unknown extension rows. Reading or opening does not repair, normalize, upgrade or attach a document.

A stale save keeps the current draft and the existing server revision error. **Review Reload of Saved Skill** leads to the existing discard confirmation; Keep Editing preserves the draft, while Discard Changes deliberately loads the saved version. The interface tells the author to review/copy local edits first. It performs no automatic merge or overwrite. Editor fields are disabled while saving so a returned saved draft cannot replace edits typed during that request.

Classification changes retain the attached document and show a visible warning until classification is restored or mechanics are explicitly detached. Existing server classification and structural-change confirmation safeguards remain intact.

## Changed files

All paths are relative to the repository root.

| Files | Change |
| --- | --- |
| `src/features/special-abilities/authoring.ts` | Typed editor state, stable-key creation, pure reorder/move helpers and readable codec validation |
| `src/features/special-abilities/editor-actions.ts` | Authorized catalog discovery with server-derived retained reference IDs |
| `src/features/special-abilities/mechanics-editor.tsx` | Attach/detach, rule cards and Capability/Manual authoring |
| `src/features/special-abilities/mechanics-conditions-editor.tsx` | Always/Requirements, OR/AND editing, identity-preserving movement and provisional condition display |
| `src/features/special-abilities/mechanics-reference-picker.tsx` | Typed searchable pickers, archived/unavailable labels and exact selection |
| `src/features/special-abilities/mechanics-preview.tsx` | Shared summaries and pure definition-only preview |
| `src/features/special-abilities/mechanics.css` | Responsive layouts using shared semantic theme variables |
| `src/app/heavens/skills/skill-editor.tsx` | Tab, reference loading, classification guidance, save-time disabling and stale reload guidance |
| `src/app/heavens/skills/skill-preview.tsx`, `skills-workspace.tsx` | Preview integration, reference action wiring and deliberate reload |
| `src/features/guidance/page-help.ts` | Skill-specific authoring/reference/stale-draft help |
| `src/features/special-abilities/authoring.test.ts` | Seven focused domain/render tests |
| `scripts/special-ability-foundation-db.test.mjs` | Real picker authorization, archive retention and visibility scenario |
| `scripts/special-ability-authoring-disposable.test.ts`, `special-ability-authoring-browser.test.ts` | Isolated database/server and real desktop/mobile browser workflow |
| `.gitignore` | Excludes the isolated Next test output |
| This document; `docs/architecture/special-ability-mechanics-pass-2.md` | Completion report and handoff link |

## Verification

- **414/414 affected regression tests passed**, including 18 Special Ability tests (seven new authoring tests), plus Skills, Forms, Derived Abilities, Character rules, lifecycle, Spell Construction, authorization, guidance and catalog visibility.
- **10/10 disposable database scenarios passed** inside the foundation harness. The new scenario verifies reference discovery permissions, exact archived retention, exclusion of unselected archived targets, catalog visibility and canon discovery; existing persistence, concurrency and read-only projection scenarios remain covered.
- **Seven browser scenario groups passed** in real Chrome at desktop **1365 × 950** and narrow **390 × 844**. These cover classification visibility/no auto-attachment; deliberate empty attachment; unfinished-rule rejection; Capability/Manual authoring; AND/OR groups and typed pickers; stable keys through edits/reorder; rule removal; definition preview; newly archived target rejection with draft retention; provisional conditions; historical archived labels; invalid/future preservation; stale-save recovery; classification/detach confirmation; and independent Spell Construction/unknown extensions.
- Screenshots were captured and visually inspected for desktop and mobile. Narrow rendering was checked for page horizontal overflow; browser page errors were also checked.
- TypeScript, changed-file ESLint, documentation links and `git diff --check` passed.

Reproduction:

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/special-abilities/*.test.ts src/features/skills/*.test.ts src/features/forms/*.test.ts src/features/derived-abilities/*.test.ts src/features/characters/*.test.ts src/features/lifecycle/*.test.ts src/features/spell-construction/*.test.ts src/features/authorization/shared-library-access.test.ts src/features/guidance/*.test.ts src/features/catalog-visibility/*.test.ts
node --import tsx --test scripts/special-ability-foundation-disposable.test.ts
node --import tsx scripts/special-ability-authoring-disposable.test.ts
npm.cmd run typecheck
```

The browser harness guards its disposable marker and exact loopback database name, creates a fresh PostgreSQL cluster, applies the existing migrations there, and seeds synthetic fixtures. Next runs with the disposable database URL and test auth settings explicitly overriding local configuration. The harness shuts down its own server and cluster and removes the temporary database directory, restoring Next-generated TypeScript configuration changes. Browser artifacts are ignored under `artifacts/guidance/special-ability-pass-3/`: `report.json`, desktop/mobile screenshots and `server.log`. The database harness is separately disposable. Windows `initdb`/Chrome execution required approved execution outside the restricted token.

An initial browser run rejected the synthetic username; the fixture was corrected to use email login. An initial picker database fixture omitted required canon audit fields; it was corrected to satisfy the existing constraint. Neither required weakening product validation.

These checks do not claim a production build, Firefox/Safari coverage, physical-device testing or human acceptance. No gameplay execution was exercised or added.

## Data boundary and unresolved decisions

**No new migration. No shared DEV or Production writes. No Production content conversion or mechanics authoring.** Only disposable databases received synthetic writes and the existing migration chain. No new rule family, resource, Form, runtime source, Character mutation, effect execution or ability-specific code was added. The Production matrix remains a requirements inventory.

Brannan and Ember still need to settle Special Ability progression before numerical authoring can be enabled. They also retain all decisions about actual ability rules, resource values, attack ownership, resistance integration, bindings and any future rule family. This pass supplies the v1 toolbox only.

Reference choices are snapshots; a later archive/delete can still cause a save rejection, which the server safely reports. Stale recovery is an explicit reload, not a merge editor. Skill/Derived catalog mutation serialization and conservative deletion blocking for unreadable documents remain the documented Pass 2 tradeoffs. Native Creature and active Form context adapters remain deferred. No requirement has been silently satisfied by inventing facts for those contexts.

## Exact recommended Pass 4

Recommend a **read-only Character display pass** using `getSpecialAbilityMechanicsProjection`: show authored Capability/Manual information on the saved Normal Character sheet and its printable reference, under existing Character permissions. Reuse the same possession gate, provisional progression label, qualification explanations, archived/missing-reference diagnostics, and legacy/empty/invalid/unsupported states. Do not parse raw mechanics JSON separately in each consumer.

Keep unsupported native Creature/active Form contexts explicitly definition-only or unavailable until their adapters are deliberately specified. Use synthetic data for permission, zero-purchase racial possession, manual conditions, unknown/future versions and print/layout checks. Do not add acquisition, activation, effects, resources, new rule families, real ability authoring or Production writes. Broader Form/tabletop consumers can follow after that bounded display work is reviewed.

Pass 3 stops for Brannan and Ember review; this recommendation does not authorize Pass 4. Commit, push and sync are part of completing this pass under the user's standing instruction; the final response records the verified Git result.

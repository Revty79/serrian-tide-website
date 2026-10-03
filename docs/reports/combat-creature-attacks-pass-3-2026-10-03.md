# Combat Runtime Completion — Creature Attacks, Pass 3

Starting revision: `979040d95b4a9b64c5fa059a6a34cf415f007548`.

## Audit recorded before implementation

The modern declaration path already preserves `creature-attack` and its canonical Attack ID, freezes the selected definition, uses the shared percentile Roll and ordinary attack consequences, and sends numeric damage through the Pass 1 incoming-effect pipeline. Structured on-hit Health damage, conditions and modifiers already use shared effect planning and receipts. This pass extends that path.

| Authored field | Existing execution | Gap / approved boundary |
| --- | --- | --- |
| Attack % | Numeric target for shared Roll | Keep exact authored target; missing/invalid value needs G.O.D. ruling |
| Initiative | Structured value, then name/damage fallback | Restrict fallback to snapshots without structured authoring; identify it |
| Damage | Numeric base plus shared extra successes and hit location | Expressions remain manual; exclude Character damage bonuses for both Creature owners |
| Damage Type | Shared frozen incoming facts | Preserve independently of Magical |
| Attack Mode | Saved but not enforced by Creature resolver | Use shared melee/ranged/hybrid range and explicit AoE target rulings |
| Reach / Range | Saved but not enforced | Use authored units/bands; never parse range prose |
| Magical | Shared source facts already read authoring | Display exact true/false/unknown; construction also establishes Magical |
| On-hit Mechanical Effects | Shared ordinary-hit planning and effect application | Verify both ownership forms, misses, defenses and retries |
| Magic Construction | Frozen in definition; establishes Magical | Display deferred execution; no construction effects in this pass |
| Special Effect | Frozen; ordinary consequences require ruling | Surface text; never execute prose |
| Requirements | Frozen only | Surface as G.O.D. review information; no automatic restriction |
| Required Anatomy | Frozen only | No exact structured Attack/body binding exists; manual review |
| Uses / Recharge | Descriptive string | No Attack resource/use ledger; manual review only |
| Notes | Frozen only | Display; no geometry or mechanics inferred |

Ownership audit found two readers preferring encounter snapshot JSON without first enforcing the owner discriminator. Current database constraints normally keep that occurrence field empty for positive participants; the readers now encode the ownership contract directly. They must use the current individual profile; negative occurrences retain their exact frozen snapshot. The owner discriminator must exclude Race NPCs and PCs even if stray Creature JSON exists. Neither route needs the Creature master.

## Legacy paths

`resolveCreatureAttackInitiativeCost` contains old natural-name and numeric-damage timing. Keep it only for attacks whose snapshot has no structured authoring, with compatibility evidence. Structured authoring with missing timing requires a ruling.

`startEncounterCreatureAttack` / `startCreatureAttackInTransaction` remains an exported old entry point, with no current combat-screen caller. It creates an old authored binding. `resolveAuthoredActionInTransaction` resolves those bindings using supplied final damage and a compatibility Health path. Existing pending/history records must remain readable; new supported Creature attacks must enter the declaration/effect/protection path. These exported starters are retirement candidates, not a second supported executor.

The current combat screen, declaration source resolver, ordinary consequences and Pass 1 incoming effects are the live supported path. Shared legacy calculation branches remain historical compatibility, not the calculation for new declarations.

| Runtime path | Classification after this pass |
| --- | --- |
| Combat screen ? declaration ? Roll ? ordinary consequences ? shared incoming effects | Current live path for all new Creature attacks |
| `readEncounterCreatureAttacksInTransaction` | Current reader using exact owner and the shared timing contract |
| `startEncounterCreatureAttack` | Obsolete entry-point candidate; authenticated rejection directs callers to the current path |
| Internal `startCreatureAttackInTransaction` | Legacy compatibility fixture helper; structured attacks rejected |
| `resolveAuthoredActionInTransaction` old Creature bindings | Required historical compatibility; retained supplied-final-damage calculation |
| Natural-name / numeric-damage timing on snapshots without authoring | Labeled legacy compatibility; retire only with a separate historical migration decision |

## Completion contract

1. **Already working:** canonical Creature Attack identity, frozen source definition, authored numeric Attack %, shared percentile history/extra successes, numeric ordinary damage/location, Pass 1 protections and shared on-hit effects. These services remain the executor.
2. **Added/fixed:** exact owner-based snapshot selection; structured timing/range enforcement; missing-target commit rejection; source-specific target/timing/AoE rulings; descriptive preview/report evidence; new-definition authoring envelopes; an AoE defense submission bypass; and ranged G.O.D. controls that previously checked the draft's default melee value instead of the authored ranged mode.
3. **Source:** `creature-attack`, exact canonical Attack ID and exact owner participant. No Weapon/Item/firing-mode identity is accepted. No ammunition cost is invented. Race NPCs and PCs cannot acquire Creature attacks through a profile or stray snapshot.
4. **Ownership:** positive Creature NPCs read their current individual profile; negative participants read only their frozen occurrence. Neither reads the master. The chosen definition freezes at declaration lock, so subsequent individual/occurrence/master edits cannot rewrite committed source, Roll or effects. Persistent and occurrence-local state keep their existing ownership.
5. **Roll / Initiative:** a finite numeric authored Attack % governs the existing Roll; Skill/Attribute substitution and replacement of a valid target are rejected. Missing/invalid targets require a recorded G.O.D. ruling before commitment. Structured positive Initiative wins. Null/absent authoring alone permits the labeled legacy natural-name/numeric-damage fallback; an older explicit positive top-level Initiative is also preserved. Current missing timing requires a positive ruling. New master/individual attacks cannot silently become legacy by omitting authoring, and existing structured authoring cannot be cleared to enable fallback. Rulings bind the exact definition and repeated identical submissions reuse the receipt.
6. **Mode / Range:** melee Reach, authored units, ranged Short/Medium/Long modifiers and Beyond Long rulings use the shared range service. Hybrid requires the execution mode and retains both options. AoE uses an exact G.O.D.-confirmed target set; description/Notes never infer geometry or membership. Per-target outcomes remain manual. Ordinary Dodge/Block/Parry cannot decide an entire AoE through either preview or direct submission. Legacy positioning remains visibly manual where structured range is absent.
7. **Damage:** clean numeric base plus existing extra successes; shared hit-location and Called Shot handling. Both Creature owner forms exclude Character Attribute damage bonuses. Expressions, unknown location and critical outcomes retain shared ruling boundaries. A damage rider is a separate effect and does not duplicate base damage.
8. **Protections:** new attacks use Worn Armor and its typed modifier, Interaction Requirements/Immunity/Absorption/Resistance/Vulnerability, Creature Natural Armor + Soak or Race Natural Soak, temporary signed Soak, and final Health through Pass 1. Tests cover Creature-to-Character and Creature-to-Creature targets, including persistent Creature anatomy.
9. **Magical:** exact true/false/unknown survives separately from Damage Type. Attached construction establishes Magical; names, CR, Origin and descriptive text never do. Unknown facts still require the existing Interaction ruling.
10. **Effects:** condition, modifier and Health-damage riders use the shared successful-hit gate and application receipts. Misses and successful Dodge/Block/Parry suppress riders. Manual/unsupported effects remain reviewable; retries do not duplicate Rolls, Initiative, damage or effects.
11. **Descriptive boundaries:** Special Effect, Requirements, Required Anatomy, Notes and Reach/Range prose are frozen and shown as G.O.D. review information. Special Effect retains its explicit outcome boundary. Descriptive anatomy alone does not prohibit an attack; no exact structured Attack/body restriction was found to safely automate.
12. **Uses / Recharge:** text only. It remains descriptive/manual; no hidden resource or persistent use ledger was created. Creature Ability lifecycle/recharge remains outside this pass.
13. **Attached Magic:** exact construction is frozen and establishes Magical, with a visible deferral. Its damage/effects do not execute or get copied into the attack's separately authored on-hit effects.
14. **Historical compatibility:** the public legacy Creature starter now authenticates and directs stale clients to the combat screen; it cannot start new bypass actions. The internal legacy starter rejects structured definitions and remains for old compatibility fixtures. Existing authored bindings and their old supplied-final-damage resolution remain readable/resolvable. These internal paths and labeled timing fallbacks are retirement candidates after historical migration; no history was deleted. Current screen/declaration/effect/protection services are the supported live path.
15. **Verification:** see the recorded results below. Automated checks do not constitute Brannan/Ember gameplay acceptance.
16. **Pass 4:** attached Attack/Ability Magic Construction execution and broader Magic Combat completion remain deferred. Do not begin automatically. Forms, Evolution, Special Abilities, companions, Worlds and Creature Ability lifecycle/use ledgers were not implemented.

## Verification results

- Full unit suite: **1,835 / 1,835**, 209 feature test files, including Creature authoring/snapshots, source/declaration, range, ordinary damage, defense, incoming protections, Active Health and injury rules.
- Full combat disposable harness: **504 / 504 cases across 30 scripts**, including **53 Creature Attack cases**. A fresh localhost database applied and verified all 93 existing migrations. Earlier failures were corrected: the missing-target commit gap, incomplete synthetic anatomy/damage values, and old protection fixtures missing newly required range data.
- Combat browser: the four final direct/persistent/ranged/ruled Creature flows passed, including phone previews, real authentication, exact source/Initiative/Roll/Health receipts and reload. Hybrid and Beyond Long controls also passed in a subsequent isolated run: **six Creature combat flows** total. The Hybrid test needed a role-based dropdown selector; no Hybrid runtime failure was found. Existing Race Player/G.O.D. attacks plus protection, normal location and the combined encounter walkthrough: **16 checks passed**, no browser errors.
- Creature authoring disposable run: **21 database cases passed**, legacy save, structured attack authoring, individual NPC editing, direct spawning and protection browser checks passed. The extended Forms capture encountered collapsed sections after save; only the test interaction was corrected to reopen them. The complete rerun passed, including the extended browser checks, with no browser errors. No Forms product behavior was changed.
- Full lint passed without warnings; migration metadata check passed. Next route type generation, final TypeScript check and whitespace verification passed after browser harnesses restored their generated-file changes.
- No schema change or migration was created for this pass. Shared DEV/Production data was not modified. Pass 2 migration 0092 still needs its separately authorized shared-environment application.
- No production build or human acceptance session was run. Browser coverage is automated Chromium at desktop and 390px.

Local evidence: `artifacts/guidance/creature-pass3-*.log`; combat screenshots/results are retained under `artifacts/guidance/creature-pass3/`. Creature authoring evidence remains under ignored `artifacts/creature-authoring/`.

The completion is a local commit only. No push, deployment or Pass 4 work is authorized.

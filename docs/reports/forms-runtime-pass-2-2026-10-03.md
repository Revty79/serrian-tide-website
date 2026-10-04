# Forms Runtime Pass 2: effective runtime mechanics

Started from `ee49594b2b7ef1090670baf1b7dbbc0a96a825ee`. Current Form now governs the effective body used by new runtime operations. Normal editing/advancement and all existing Pass 1 lifecycle authorities remain in place. No Production data, shared migrations, deployment or push are included.

## 1. Central effective resolver

`effective-form-service.ts` is the transaction reader. Shared pure Race mechanics were extracted from `resolveCharacterFormPreview`; Creature runtime reuses `projectCreatureFormDefinition` and native normalization. Character/NPC display projections consume those same mechanics. Narrow Attribute reads share the same pure calculation, rather than duplicating a calculator.

## 2. Frozen Form and live Normal base

The exact entry event supplies the frozen Form definition. Current saved Attributes, permanent steps, allocations, Race defaults and the current individual Creature snapshot supply inherited values. Library edits affect the next entry. Creature master edits do not replace the individual snapshot or frozen Form. Negative occurrences never read persistent Form state.

## 3. Race Attributes

All six effective Attributes are saved values plus frozen signed Form adjustments, without creation caps or Creature Size scaling. Legitimate saved advancement remains effective while transformed. Return removes only the adjustment. No saved Attribute or purchased value is overwritten.

## 4. Creature Attributes and Size

Retain/replace collections, Size and HP/movement/magic steps use native Creature projection, scaling and normalization. Replacement Attributes are not deltas. The individual's current HP Adjustment remains in the Health calculation. Explicit empty overrides remain empty.

## 5. Health and anatomy

Active Health uses effective CON, Character permanent HP steps, Form/inherited anatomy, or the projected Creature HP model. Stored total damage, exact pool keys, injuries, limb state and history remain unchanged. New pools receive no redistributed damage; absent old pools remain orphaned and reappear by exact identity on Return. No display-name mapping or healing occurs. Existing zero-remaining-Health consequences remain authoritative.

## 6. Movement

Current Race/native Creature modes are inherited or replaced as authored. Empty override supplies no movement modes. Permanent Character movement steps, effective DEX, Creature Size/steps and existing movement/Initiative calculations apply through their existing owners. Active movement modifiers remain separate.

## 7. Natural protection

Race single Natural Soak and Creature Natural Armor/Soak come from the effective body with effective location coverage. Empty protection overrides remove that category. Retired Race Armor is not restored. Worn equipment and temporary protection remain owned by their existing services.

## 8. Interaction Rules

Inherit and replace retain their exact source-local profiles. When both profiles contain rules, Add combines Normal followed by Form rules with distinct `normal:`/`form:` keys and copied local key/order provenance. Identical local keys cannot overwrite one another. Existing Requirement, Immunity, Absorption, Resistance and Vulnerability precedence remains unchanged.

## 9. Race Natural Attacks

New choices inherit or replace the Race collection, including empty override. Existing Combat Pass 2 execution handles governance, timing, range, anatomy requirements, damage, extra successes, on-hit effects and protection. Attached construction Magic executes through existing Pass 4. References and snapshots include the active entry even for inherited attacks. Return restores Normal choices.

## 10. Creature attacks, Abilities and defenses

Persistent active Forms use their effective attack, Ability and defense collections. Existing Creature attack/Ability and Magic executors remain authoritative. Dodge/Block/Parry responses consume effective native defenses and freeze Form evidence. Missing defense cost still requires an explicit G.O.D. ruling; no cost is inferred. Normal and negative occurrence paths retain previous behavior. Passive Ability lifecycle/recharge remains deferred.

A real Block/Parry test proved the need for migration **0094**: the old reaction check only allowed item-free defenses for negative occurrences. The new check also accepts positive Creature Form defense evidence with a valid entry identity and positive cost. It changes one constraint, without tables, columns or backfill. See [schema proof](../architecture/forms-runtime-pass-2-audit.md#schema-proof).

## 11. Effective Character Skills and Attributes

Common lineage, ordinary rolls, called checks, defenses and declaration readers receive effective Character facts. Temporary Tier 1 Form predispositions use the existing preview semantics with explicit Form source evidence, not saved allocations or awarded points. Saved allocations retain their exact ancestry. Existing active Modifiers remain in their normal runtime owners and are not copied into Form state.

## 12. Temporary grants

`Granted` links appear as authoritative temporary possession evidence in the effective Race links, frozen source facts and Current Form grant display. Return removes the Form contribution. No permanent Skill/Special Ability ownership is created. Integrating these temporary sources into the separate Special Ability ownership/qualification read model remains part of that later project; no Special Ability execution is fabricated here.

## 13. Weapon, firearm, spell and defense governance

Existing governance receives effective Attributes/Skills where supported. Firearm DEX, weapon damage Attribute inputs, spell governing Skills and defensive selections use these facts. Readiness, ammunition, charges and magazine state keep their existing owners. Creature textual Skill ranks are not converted into Character allocations. Existing unsupported manufactured-weapon governance for Creature NPCs remains a ruling boundary.

## 14. Manipulation

Full/inherited manipulation uses existing behavior. None blocks active weapon/firearm/Item/tool and physical handling operations. Natural Attacks remain available when their anatomy permits. Limited manipulation requires a Campaign-owning G.O.D. reason; applicable source approvals are bound to the current entry, rechecked on the server and frozen with the action. Descriptive notes are not parsed into rules.

## 15. Speech

Current Form speech and manipulation are exposed as typed runtime facts alongside `state.form-active`. Normal, limited, none and inherited authored states remain explicit. The current source model has no universal typed verbal requirement; generic component prose is not a verbal gate. Silent Forms can use spells that do not author such a structured requirement. Named restrictions remain visible review information.

## 16. Active equipment usability

Retained/inherited equipment remains usable. Unusable, merged and authored-to-drop equipment is unavailable for active use. Custom equipment requires G.O.D. review. Server guards cover declarations, defenses, drawing, preparation, Item activation, equipment handling, containers, custody and magazine operations. Existing controls accept operation-specific reasons. Combat weapon preparation, drawing, magazine filling and inventory handling also let the G.O.D. record entry-bound physical-use approval without selecting the Player's action. Inventory approvals bind the operation, exact copy/stack, quantity and location; magazine approvals bind the copy, ammunition and rounds. The controller submits the action through its existing authority and Initiative engine. Pending completion retains the frozen G.O.D. reason; altered operations and later Form entries require fresh review.

## 17. Passive armor and physical consequences

Recorded Worn Armor still protects according to existing equipment state, including while active use is blocked. Current Form UI explicitly explains this temporary boundary. Enter/Return do not drop, merge, unequip, resize, transfer or destroy items. Forced physical reconciliation belongs to Pass 3.

## 18. Incoming effects

New incoming target snapshots contain effective anatomy, natural protection, Interaction Rules, body facts and full Form identity. Resolution remains Worn Armor -> Interaction Rules -> Natural Protection -> temporary/other Soak -> Health. Integration tests cover that order under retained, unusable, merged and dropped equipment states.

## 19. Frozen history

Completed declarations, Rolls, effects and effect plans retain copied source/target evidence. Return does not recalculate them. Tests execute Form Natural Attacks with attached Magic against both Normal and transformed targets, apply effects, Return and compare persisted history. Stale actor/target Form identities reject a declaration commit; source/distance/Called Shot approval cannot cross a different Form entry.

## 20. Initiative

Transforming does not reposition existing participants, change round/step/timeline or grant a turn. Hold/Pass and enrollment remain exact. Actual new-Encounter initialization while transformed uses effective DEX through the existing capacity service. Existing Form transformation costs still belong exclusively to Pass 1's authored timing/resource contract.

## 21. State and UI preservation

Pass 1's transaction/fencing/idempotency/authority and shared transition boundary remain in force. Successful retries return the existing receipt; no duplicate event, cost or refresh is introduced. Damage, injuries, Conditions, Modifiers, duration bindings, periodic effects, Mana spent, XP, equipment, ownership and Normal saved data remain intact. Active/pending Forms still block permanent Evolution/Return and Race reassignment.

Character, Race NPC and Creature NPC controls show effective mechanics beside the Normal editor, including Normal/adjustment/effective Attribute values, Health, anatomy, Size, movement, protection, attacks, Skills/grants, rules and capabilities. Existing live events refresh combat choices on Enter/Return. Detached View Form and optional printed references remain previews. Existing lifecycle, costs, clean-boundary blockers, history and lost-response recovery remain available.

## 22. Verification

Database and browser commands use guarded disposable localhost clusters, never the configured shared/Production database.

| Verification | Result |
| --- | --- |
| Forms Runtime Pass 1 | Passed 64/64 |
| New effective runtime matrix | Passed 87/87 |
| Evolution Passes 1-5 and Runtime Passes 1-2 | Passed 94/94 |
| Authoring/preview/Access/snapshot/ownership/commerce/lifecycle | Passed 79/79 |
| Full combat harness | Passed 522/522 across 30 suites, including the final equipment-path rerun |
| Normal unit suite | Passed 1,883/1,883 across 210 files |
| Forms browsers | Passed Player PC, G.O.D. Race NPC and Creature NPC; desktop/390px; entry/Return, effective Attributes, source refresh, history, theme, freeze, Initiative/Mana, lost response/reload; 390px G.O.D. approval without Player action takeover |
| Existing Evolution/Return/print browsers | Passed authoring, permanent Evolution, live Evolution/Return, history, retry/reload and three read-only PDFs at desktop/390px |
| Typegen/typecheck/lint/Drizzle/whitespace | Passed typegen, typecheck, full lint, Drizzle check and whitespace; generation reports no schema diff; fresh 95-migration chain and populated upgrade rehearsals passed |

The new matrix also covers exact damage/injury preservation, live advancement, all collection modes, colliding rules, temporary Skills/grants, full/none/limited manipulation, equipment modes, passive Armor order, source/target history, speech facts, actual spell and native defense execution, stale distance approvals, actual new-Encounter initialization, active Modifiers applying once, and approved Player drawing/inventory handling through pending completion and durable replay. The 64 lifecycle cases compare populated unrelated tables and retain concurrency/replay/closeout checks. Automated results do not substitute for hands-on Brannan/Ember acceptance.

Reproduce with `node --import tsx scripts/creature-evolution-disposable.test.ts --browser`, `node --import tsx --test scripts/combat-completion-disposable-db.test.ts`, and `npm.cmd run validate:unit`. `EVOLUTION_CASE_FILTER=forms-effective-runtime-db` with `--focused` selects the new matrix. Logs/screenshots/PDFs are under ignored `artifacts/guidance/`; `forms-pass2-evolution-complete.log`, `forms-pass2-physical-complete.log`, `forms-pass2-combat-complete.log`, `forms-pass2-browser-verified.log`, `forms-pass2-unit-complete.log`, and the corresponding static-check logs retain the final evidence.

Shared rollout must include unapplied **0087**, **0092**, **0093**, and new **0094** before deploying this pass. No shared migration was applied automatically. No push or deployment occurred.

## 23. Exact remaining Pass 3 work

Automatic involuntary triggers; fixed/scene/Encounter/condition-end/resource-depletion Return; use-limit and cooldown ledgers/refresh; forced dropping/merging/unequipping and physical equipment/custody reconciliation; explicit active Form coordination with permanent Evolution/Return. Each requires its own authored authority and acceptance. Special Ability runtime and companion combat remain separate projects. Do not start Pass 3 or push automatically.

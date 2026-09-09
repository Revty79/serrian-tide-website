# What remains before human combat testing

Prepared 9 September 2026 from the current checkout, a read-only audit of the loopback development catalog, and Brannan's latest instructions. Updated with learned-spell casting, automatic spell hit locations, and temporary AoE reports. Firearms still require catalog completion and preparation work below. No live campaign or catalog records were changed.

The intended flow is: choose a legal action and target, Roll, let the engine advance time and calculate the result, review the requested damage/location report once, and continue. Routine eligibility, percentages, success counts, costs, ammunition, HP, conditions and timing belong to the engine. Missing implementation or incomplete catalog data should be repaired at their source instead of becoming repeated G.O.D. rulings during combat.

## Already settled

| Rule or behavior | Authority and present state |
| --- | --- |
| A combat spell is a Skill the character owns, with its own percentage | Implemented: resolve the exact owned catalog spell allocation through the existing Skill service. Its percentage governs the casting Roll without a routine G.O.D. source ruling. Saved documents without an owned spell Skill are unavailable in the combat menu. |
| Spell success counts include the initial success | Confirmed: against 40, 50 is two successes and 60 is three. This matches the existing shared success-count calculation. Ordinary percentile rules remain shared; a second spell Roll engine is unnecessary. |
| Spell effect scaling | Confirmed: multiply effects marked per-success; keep effects marked static fixed. Do not make every spell effect scale merely because its casting Roll has multiple successes. |
| Cast costs and timing | Existing casting calculations and one-time Mana expenditure at declaration remain authoritative. Failed/interrupted casts retain spent Mana; effects wait for completion. |
| Spell hit location | Confirmed and implemented: ordinary damaging spells use the original casting Roll's ones digit and the target's authored anatomy. The caster no longer chooses a damage location before rolling. |
| Temporary AoE resolution | Confirmed and implemented: calculate the effect amount in the authored area, record the report, and complete the action automatically. No individual combatants are selected or have HP/effects changed by this report. Mapped area membership remains deferred. Failed and critical Rolls still produce a completed report. |
| Head and whole-body health | Head 0 causes unconsciousness; -1 or below causes death. A single whole-body target such as Slime is incapacitated at 0 and dead at -1 or below. Implemented and service/browser tested. |
| Limb health and alerts | Limb HP at 0 or below records incapacity. G.O.D. sees affected actors; Players see their own character's alerts. Implemented. Specific restrictions on actions using that limb still need rules/data, below. |
| No armor/soak | Blank creature protection blocks zero damage. Implemented for ordinary attacks and firearms. |
| Routine attack review | One ordinary attack or direct-spell report and one approval applies the recorded location/damage/effects. Automatic timing and calculation precede review. AoE-only reports complete without approval. Firearm result simplification remains below. |
| Absolute end control | G.O.D. can force end combat, including frozen combat or unfinished choices/actions. Existing damage, spent resources and history remain. Implemented and browser tested. |

## Magic: implementation and remaining limits

| Gap | Required fix | What Brannan still needs to decide |
| --- | --- | --- |
| Learned-spell Roll | Implemented using the exact owned Skill allocation and calculated percentage; Mana and timing stay with the existing casting service. | No further general rule needed. |
| Saved documents without learned Skills | The combat menu and server reject unlinked personal/raw sources with a specific learn-the-spell explanation. Existing saved documents and historical service paths are retained. | A deliberately supported unlearned-casting exception would need a separate rule, if wanted. It does not block learned-spell testing. |
| Effect multiplication | Implemented and tested with the shared success count. Per Success Assignment scales numerical effects; Static Assignment keeps them fixed, using the existing spell-wide modifier rules. | Answered. |
| Spell damage location | Implemented from the original Roll; browser-supplied damage locations cannot replace it. Location-specific healing retains its authored application selection. | Answered. |
| Target selection and review | Redundant target controls removed. Direct effects show one report with Roll, total successes, location and calculated amounts, followed by one approval. | Exceptional effects outside the Mechanical Effects vocabulary still need implementation or their existing specific ruling. |
| AoE before mapped tabletop | Area-only casts calculate and report the authored area/effect, then finish automatically without applying HP to selected occupants. | Mapped placement, who is in the area, and applying outcomes to occupants are deferred by request. |

The new learned-spell browser fixture uses an actual Skill allocation with canonical parent ancestry and no preinstalled G.O.D. source ruling. The earlier no-roll fixture has been replaced. Automated browser verification does not substitute for Brannan's human walkthrough.

## Firearms: what the current data actually contains

The [read-only catalog audit](combat-firearm-readiness-audit-2026-09-09.json) found **81 weapon profiles** selected by the current firearm-routing rule and **81 firing modes**. This population includes bows, crossbows, explosives, energy weapons and some melee weapons; it is not a count of 81 actual guns.

All 81 profiles have empty structured capacity, readiness relationship, draw, ready, reload, unload and mode-change timing fields. All 81 modes lack structured cycling, recoil, delivery cadence and rounds-per-cadence values and remain marked review-required. The development database has **zero initialized owned firearm states**.

Several needed values already exist in older text fields:

| Catalog entry | Existing capacity text | Existing reload text | What this tells us |
| --- | --- | --- | --- |
| 9×19 mm Semi-Automatic Pistol | 15 | 3 | Capacity and a reload number already exist; the structured fields used by combat are empty. |
| 5.56 mm Semi-Automatic Rifle | 30 | 3 | Same data-connection gap. |
| Heavy Crossbow | 1 bolt | 6 | Ysra's weapon has usable capacity/reload evidence, but no ready/load state or complete firing mechanics. |
| Repeating Crossbow | 5 bolts | 2 | Capacity exists; loading mechanism and reload meaning need to be represented correctly. |
| Lever-Action Rifle | 6 rounds | 1 per round | A single total reload-cost field cannot faithfully represent this rule for different quantities. |
| Shotgun | 5 shells | 1 per shell | Requires per-shell timing and partial reload behavior. |
| Submachine Gun | 100 rounds | 4 | Existing text lists Full-Auto and “Sustained fire / Initiative”, but provides no numeric rounds per Initiative. The catalog value is not a new claim about a real-world weapon. |

Unambiguous existing values should be transferred into the appropriate structured representation with before/after evidence. Text such as “1 per shell” must not be flattened into a cost of 1 for an entire reload. Existing rate-of-fire text must be reconciled with trigger/cycling/recoil timing so the engine does not charge the same work twice. No unknown value should silently become zero, a full magazine, or an invented rule.

### What the Weapon / Ammunition editor already supports

Brannan's latest direction is to review and fill out the Weapon / Ammunition section. The current editor already exposes the structured fields, and its save action writes the fields read by combat:

| Editor field/group | Purpose |
| --- | --- |
| **Capacity (Rounds)** | Numeric loaded capacity. Basic magazine size can be entered here; a new size field is not required for the existing single-count model. The separate **Legacy Capacity Text** field does not populate this value automatically. |
| **Readiness relationship** | Drawing also readies, or a separate ready action. |
| **Draw / Ready / Load-Reload / Unload / Change Mode Initiative** | Numeric preparation costs. The current fixed Load / Reload field does not express a per-shell/per-round cost basis. |
| **Structured Firing Modes** | Mode name, Cycling Initiative Cost, Recoil Reset Initiative Cost, Delivery Cadence, and Rounds Per Cadence. |
| **Ammunition relationship and ammunition profile** | Exact compatible ammunition, damage and ammunition timing modifiers. |

Thus filling these fields will supply much of the missing catalog data. This is verified from the editor/save/runtime code, not a newly executed browser authoring test. It does not automatically populate a character's currently loaded rounds, repair equipment classification, or add unsupported per-round reload behavior. Those are remaining implementation work.

## Firearm decisions and the changes they unlock

These are rules/catalog-authoring decisions made once and reused. They are not proposed G.O.D. prompts for every shot.

| Priority | Missing decision or distinction | Current support and required work |
| --- | --- | --- |
| Optional expansion | **Separate chambered rounds?** | Current capacity is one total loaded-round limit. Use that existing model for initial testing. A separate magazine capacity plus chambered round needs a further rule and model change only if Brannan wants that distinction. |
| Optional expansion | **Individual magazine items?** | Current runtime tracks a loaded ammunition identity and count against inventory. It does not identify individual partially filled magazines. Continue with that existing model for initial testing; separate magazine ownership/counts are not prerequisites unless requested. |
| First | **How does loading work for each weapon family?** Magazine swap, individual round/shell insertion, or one projectile/load at a time? | Preserve existing fixed versus per-round/per-shell reload text. Add structured reload method and cost basis. Define whether completed inserted rounds become available if reloading stops early; a magazine swap must not produce a partly completed magazine change by accident. |
| First | **When is the weapon ready?** Does drawing ready it, and when are cocking/chambering or another ready action needed? What do these actions cost? | The engine supports draw-is-ready or a separate ready action, but these fields are blank. Populate an approved rule by weapon/family. An empty weapon-state record should be created automatically when sufficient equipment data exists; starting loaded/readied state must come from actual equipment choices. |
| First | **What is the timing between shots?** Cycling, recoil recovery, and whether they are mandatory or affect an optional choice. | Existing engine code uses a 1-Initiative ordinary trigger plus authored cycling/recoil preparation. Their values are absent. Reconcile that representation with authored shots-per-Initiative text and the intended rules before populating costs. |
| Next | **How many rounds does each mode deliver?** Fixed burst count, full-auto rounds per Initiative, and when the shooter chooses to stop. | Single, burst/per-trigger and sustained firing machinery exists, but the actual catalog modes are incomplete. Do not derive numeric cadence from names such as “Full-Auto”. Test partial ammunition and interrupted sustained fire. |
| Next | **Which equipment belongs in each attack path?** Bows/crossbows, cartridge guns, energy weapons, explosives and powered melee weapons have different requirements. | Current routing treats an ammunition link or firing-mode row as sufficient. Replace this broad classification with explicit equipment behavior. An energy sword or grenade must not inherit cartridge loading requirements merely because it has a firing-mode record. |
| Next | **How are different loads represented?** Compatible ammo types, shells/pellets, batteries/charges and partial loads retained during a change. | The firearm runtime currently requires one exact ammunition identity. Inspect each intended test weapon's damage, compatibility and Skill mapping; author alternatives or special behavior only where needed. Retain/discard partial loads is supported internally but not fully exposed in the compact screen. |

Basic magazine size therefore does **not** require creating an entirely new capacity system. The main immediate problems are unconnected existing values, incomplete timing, and unclear loading/readiness rules. Individual magazines, chambers and per-round interrupted loading may require targeted model changes once their intended behavior is settled.

## Other combat interruptions to address

| Interruption | Desired handling or remaining question |
| --- | --- |
| Repeated awareness checks | Define a reusable normal-awareness rule so an ordinary observable attack can offer the defender their choice automatically. Ask G.O.D. about actual uncertainty such as an ambush or an attack the target cannot perceive. Pending: is an observable attack against a capable target ordinarily eligible for a response without confirmation? |
| A zero-HP limb can still be associated with an action | The incapacity state and alerts exist, but actions are not mapped to required limbs. Specify what one disabled arm/leg prevents, changes for two-handed weapons, movement with one disabled leg, and any spell component requirements. Then enforce those rules automatically using explicit equipment/anatomy data. |
| Criticals and exceptional effects | Current ordinary critical and exceptional recovery rules still request G.O.D. decisions. Preserve settled rules. During testing, distinguish an actual narrative decision from mathematics that the engine already knows; only the former should need a ruling. |
| Missing catalog data discovered mid-fight | Identify incomplete combat sources during equipment/spell setup, with a precise repair location. Distinguish “not loaded”, “not your turn”, “missing catalog timing” and “this event needs a narrative decision”. These are different situations. |
| Too many result controls | Use the same single report across ordinary attacks, spells and firearm results. Show the Roll, success count, defense, location, damage/effects and resource change together. Preserve one original Roll and one application on retries. |

## Questions to answer in manageable groups

1. **Magic:** governing Skill, success counts, effect scaling, ordinary hit location, and temporary AoE reporting are answered and implemented. Use the walkthrough to identify any unsupported authored effects in the actual selected spell.
2. **Firearm catalog:** Brannan will review the existing Weapon / Ammunition section. Enter numeric Capacity (Rounds), complete readiness/preparation costs and structured modes using the intended rules. Basic magazine size already has a field. The current single loaded-round count is sufficient for initial testing unless separate chambers/magazines are requested.
3. **Firearm action timing:** identify any missing rule while filling the catalog. Per-round/per-shell loading and interrupted reload behavior need an explicit implementation beyond filling a fixed-cost field. Use existing values wherever they already answer the question.
4. **Other automatic decisions:** settle ordinary awareness and the mechanical effects of disabled limbs. Keep exceptional decisions separate from routine bookkeeping.

Brannan does not need to select a test firearm before reviewing these gaps. Once the first groups are settled, choose an existing simple weapon whose missing fields can be completed honestly; add other firing mechanisms as their rules are ready.

## Route into human testing

1. Walk through a learned spell's Roll and single result approval, plus an AoE report. These routes now use the actual Skill and existing casting calculations. Confirm the experience against the intended human flow.
2. Reconcile the selected weapon's existing catalog fields, add only the required missing model distinctions, and complete its approved timing/mode values. Connect normal equipment preparation to its persistent loaded/readied state.
3. Verify from the actual Player and G.O.D. screens: choose, Roll, respond, advance automatically, review once, apply HP/conditions, reload or cast again, and force end when requested. Include a failed Roll and refresh/retry; check that Mana, ammunition and damage are not repeated.
4. Begin the user-led walkthrough immediately after those representative routes work. Stop at each discrepancy, record the intended rule, fix the owning service/interface, and resume at that step. Passing service tests alone does not establish human usability.

The health/report/override changes and subsequent spell work retain their validation evidence in the [implementation report](combat-health-and-attack-reports-2026-09-09.md). The catalog audit and decision list do not establish that all equipment families are ready.

## Code evidence

- Spell availability and personal-versus-catalog sources: `src/features/tabletop-operations/player-tabletop-console.ts` (`assemblePlayerTabletopSpells`).
- Owned spell Skill, effect scaling and area-report source: `src/features/tabletop-operations/action-source-resolver-service.ts` (`resolveSpell`).
- Automatic spell anatomy: `src/features/tabletop-operations/combat-spell-location-service.ts`; area calculation/application receipt: `action-effect-bridge.ts` and `action-effect-plan-service.ts`.
- Existing success calculation: `src/features/tabletop-operations/percentile-resolution.ts` (`resolvePercentileCheck`, `calculatePerSuccessQuantity`).
- Exact owned Skill calculations: `src/features/items/character-weapon-governance.ts` and its service.
- Firearm catalog fields: `src/db/item-schema.ts`; per-owned-weapon state and preparations: `src/db/tabletop-operations-schema.ts`.
- Existing authoring controls and save path: `src/app/heavens/items/item-workspace.tsx` (`Weapon`) and `src/app/heavens/items/actions.ts`.
- Broad equipment routing, preparation and initialization: `src/features/tabletop-operations/firearm-readiness-service.ts`.
- Firing timing and ammunition/damage calculations: `src/features/items/firearm-timing.ts`, `src/features/tabletop-operations/firearm-attack.ts` and `firearm-attack-service.ts`.
- Visible Roll/setup/report gates: `src/features/combat-screen/command-panel.tsx`, `firearm-controls.tsx`, `next-input.ts` and `operation-actions.ts`.

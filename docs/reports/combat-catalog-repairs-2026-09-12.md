# Combat catalog repair locations

Read-only development audit on 12 September; no catalog values were changed. This is not a production audit. [Exact firearm rows and missing fields](combat-firearm-readiness-audit-2026-09-12.json).

## Firearms

The explicit firearm families currently identify 22 profiles in the development catalog. Ammunition links alone previously routed 81 profiles, including bows, explosives and energy weapons, into firearm controls. Other ranged families remain unavailable to this firearm workflow; they cannot fall through to an ordinary attack that omits ammunition consumption.

In **Heavens → Items / Equipment → select the exact item → Weapon / Ammunition**, review:

- Weapon Type and Handedness.
- Reload Type: Single uses the authored reload Initiative for each inserted round; Magazine uses it for a complete swap.
- Capacity (Rounds) for Single loading. Magazine capacity comes from the attached magazine model.
- Drawing/readying relationship, Draw, Ready, Reload, Unload and Mode Change Initiative costs.
- Exact Ammunition Item and approved weapon Skill paths.
- Each Firing Mode's delivery cadence, rounds per cadence, base cycling cost and base recoil-reset cost. Zero is an explicit authored value; blank is unresolved.
- Ammunition Profile damage and damage type where the weapon uses ammunition damage.

For example, **5.56 mm Semi-Automatic Rifle (Item 1)** and **9×19 mm Carbine (Item 2)** have ammunition damage but lack structured reload type, capacity/readiness/preparation values and firing delivery/timing fields. Their legacy prose/numbers have not been promoted into authoritative fields.

In **Magazine**, set capacity, compatible ammunition, and the new **Fill Initiative per Round**. In the weapon editor, select physically compatible magazine models separately. Matching ammunition does not establish physical fit.

In **Character → Sheet → Equipment State → Firearm setup**, initialize the owned copy explicitly as empty, load Single ammunition or attach a prepared magazine, and ready a wielded firearm outside combat. Active encounters require the combat preparation controls. Combat **Item → Fill magazine** uses the magazine's separate cost per inserted round.

## Progressive spell examples

**Flaming Dart (Skill 718)** and **Stone Pebble (Skill 692)** have Novice descriptions mentioning per-success damage and Short range (30 feet), but their saved progressive milestones contain no structured changes. The runtime now correctly uses an authored active tier's scaling modifiers; it does not infer executable changes from prose.

Repair location: **Heavens → Skills → exact Skill → Spell Construction → Progressive Spell → Novice**. Review adding the Per Success Assignment modifier and changing the target container to Short range. Keep this review separate from the higher tiers: their multi-target/dart quantities and damage descriptions do not by themselves settle whether every later effect is fixed or per success.

The current codec and modifier rules apply modifiers spell-wide. The user is reviewing whether mixed static/per-success scope still exists. No container-scope inheritance rule, bulk spell repair, or historical-warning-based rewrite was introduced.

## Installation and validation boundary

New additive migrations: `0047_single_reload_timing` (Single insertion progress and magazine fill cost) and `0048_combat_magazine_attachment` (exact attachment identity and ownership/conservation guards). After disposable checks and a backup, both were applied to the verified loopback `serrian_tide_dev` database. All 49 ledger entries match; values/counts across all 146 prior tables are unchanged. [Migration verification](../../artifacts/combat-dev-migration-verification.json).

Validation passed: 1,295 unit tests, 169 service tests across 19 scripts, four firearm/magazine browser scenarios, typecheck, lint, production build, Drizzle consistency and whitespace checks. Human acceptance and production application remain separate; see [COMBAT-RESUME.md](../../COMBAT-RESUME.md).

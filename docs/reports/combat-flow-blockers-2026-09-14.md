# Combat flow audit and proposed catalog timing

Recorded 14 September 2026. Target: **loopback localhost:5432/serrian_tide_dev**. No production access.

## Completed

- Recovered the uncommitted melee draw implementation after the power outage; added Tabletop Equipment readiness before combat and existing Initiative-based preparation during combat.
- Browser verified exact-copy and stack readiness, timed drawing, live completion, and choosing the weapon under Attack at 1440, 390 and 320px.
- Corrected M4 Carbine / 3rd Burst (Item 1045, Profile 260, Mode 83) from **2 to 3 rounds per trigger**, explicitly confirmed by Brannan. Existing cycling/recoil costs, saved Rolls, ammunition and committed snapshots were preserved.
- Applied only that one field after a full custom-format DEV backup and successful full archive decode. All 52 migration hashes/timestamps matched. Exact catalog comparison and protected-table digests passed. Backup restore was not rehearsed.
- Application receipt: `artifacts\player-tabletop-tabs\combat-flow/applied-1789416118800.json`.

## Current blockers

- Of 205 active Weapon profiles, **200 have no Draw Initiative**. Of those, 180 are Equipment weapons eligible for the proposed fill. The other 20 are inventory-only items with weapon profiles; reclassifying ownership scope is outside this timing proposal.
- Current owned melee examples: **Baton** and **Survival Knife** lack draw and attack timing; **Longsword** has authored attack cost 6 but lacks draw timing. Proposed values: Baton/Survival Knife draw 1 and attack 4; Longsword draw 2, keeping attack 6.
- **M4 Carbine has no authored weapon Skill mapping**. Its corrected burst count alone does not make it a valid attack source. The exact governing path still needs authoring.
- The current owned **.357 Revolver is a stack**, while firearm loading/firing requires an exact tracked copy. Changing owned inventory requires a separate conversion decision; this audit did not create or replace copies.
- **Heavy Machine Gun, Machine Gun and Submachine Gun** lack authored Full-Auto delivery/recovery settings. No rounds-per-Initiative rate was invented.
- **Harpoon Gun** has incomplete capacity/loading/ammunition/governing-path configuration. Unsupported special, thrown, energy and control mechanics remain explicit ruling boundaries.
- No active encounters were present during this read-only audit. There was no live stuck encounter to repair.

## Approval required before applying the remaining proposal

**None of the following 379 field changes has been applied.** Automatic approval review rejected the earlier combined 380-field update because its timing defaults exceeded the authorization it considered sufficiently narrow. The explicitly approved M4 correction was then applied alone.

The following values are proposed editable catalog defaults, not recovered canon or new runtime fallback rules. Existing non-null values remain unchanged. No Character allocations, owned quantities, loaded copies, Skill mappings, damage, capacity, readiness flags, history, or schema are included.

| Proposed field | Changes |
| --- | ---: |
| `draw_initiative_cost` | 180 |
| `initiative_cost` | 62 |
| `reload_initiative_cost` | 20 |
| `unload_initiative_cost` | 27 |
| `base_cycling_initiative_cost` | 16 |
| `base_recoil_reset_initiative_cost` | 16 |
| `delivery_cadence` | 16 |
| `rounds_per_cadence` | 16 |
| `mechanics_review_required` | 16 |
| `fill_initiative_cost_per_round` | 10 |

- Draw: small one-handed weapons 1; standard two-handed/versatile weapons 2; large/cumbersome weapons 3.
- Ordinary approved melee paths: light weapons 4, standard weapons 6, heavy/polearm weapons 8, greatsword 10. Already authored values, including Longsword 6 and Greatsword 10, are preserved.
- Load: copy the existing unambiguous legacy Reload Initiative. **Single loading charges per inserted round**; Magazine loading charges the swap operation.
- Unload: 1. Magazine fill: 1 per inserted cartridge/bolt; already authored zero costs stay zero.
- Missing Single recovery: cycling 1 plus recoil 1. Missing Semi recovery: cycling 0.5 plus recoil 0.5. Existing Single/Semi names and one-shot-per-trigger catalog text supply one round per trigger. Only fully specified modes lose their mechanics-review flag.
- Full-Auto rates, unsupported mechanics and exact Skill choices remain unresolved; authoring a draw cost does not certify an attack.

Current reviewed plan digest: `04dd6c02bd8f7521be04511b0e26381b0ccbfe95267329a72015f52e0a6f8927`.

After approval, re-read the plan; changed catalog data invalidates its digest. The guarded runner creates/decodes a new backup, checks all migration hashes, compares the exact expected catalog, and verifies every other public table by count and digest before committing.

```powershell
node --import tsx scripts/combat-flow-catalog-dev.ts --plan
node --import tsx scripts/combat-flow-catalog-dev.ts --apply 04dd6c02bd8f7521be04511b0e26381b0ccbfe95267329a72015f52e0a6f8927
```

## Exact pending changes

Every listed field currently contains NULL unless explicitly shown otherwise. Grouped by exact table and record identity.

| Table / record | Item or mode | Proposed saved fields |
| --- | --- | --- |
| `weapon_profiles` id 4 | Acid Grenade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 5 | Acid Sprayer | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 6 | Baton | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 7 | Battleaxe | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 8 | Bio-Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 9 | Blackjack | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 10 | Blunderbuss | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 8; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 4 | Blunderbuss / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 11 | Bo Staff | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 12 | Boarding Axe | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 13 | Boomerang | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 14 | Bowie Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 15 | Brass Knuckles | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 16 | Cannon | `draw_initiative_cost`: NULL ? 3; `reload_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 5 | Cannon / Semi-Auto | `base_cycling_initiative_cost`: NULL ? 0.5; `base_recoil_reset_initiative_cost`: NULL ? 0.5; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 17 | Chainsaw Sword | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 18 | Claw Gauntlets | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 19 | Combat Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 20 | Composite Bow | `draw_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 21 | Concealed Blade | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 22 | Cryo Blaster | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 23 | Cryo Grenade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 24 | Cutlass | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 25 | Dagger | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 26 | Derringer Pistol | `draw_initiative_cost`: NULL ? 1; `reload_initiative_cost`: NULL ? 3; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 9 | Derringer Pistol / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 27 | Disintegrator Ray | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 28 | Disruptor Grenade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 29 | Disruptor Pistol | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 30 | Electro Net | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 31 | Electro-Gauntlets | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 32 | Electroshock Stun Device | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 33 | Energy Baton | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 34 | Energy Blaster | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 35 | Energy Chakram | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 36 | Energy Pistol | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 37 | Energy Sword | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 38 | Energy Whip | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 39 | Falchion | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 40 | Flail | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 41 | Flamethrower | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 42 | Flare Gun | `draw_initiative_cost`: NULL ? 1; `reload_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 19 | Flare Gun / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 43 | Flintlock Pistol | `draw_initiative_cost`: NULL ? 1; `reload_initiative_cost`: NULL ? 8; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 20 | Flintlock Pistol / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 44 | Frag Grenade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 45 | Fungal Spore Launcher | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 46 | Garrote Wire | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 47 | Gauss Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 48 | Gladius | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 49 | Glaive | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 50 | Gravity Hammer | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 52 | Grenade Launcher | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 53 | Halberd | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 54 | Hand Cannon | `draw_initiative_cost`: NULL ? 3; `reload_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 24 | Hand Cannon / Semi-Auto | `base_cycling_initiative_cost`: NULL ? 0.5; `base_recoil_reset_initiative_cost`: NULL ? 0.5; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 55 | Hand Crossbow | `draw_initiative_cost`: NULL ? 1; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 56 | Hand Mortar | `draw_initiative_cost`: NULL ? 3; `reload_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 26 | Hand Mortar / Semi-Auto | `base_cycling_initiative_cost`: NULL ? 0.5; `base_recoil_reset_initiative_cost`: NULL ? 0.5; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 57 | Handaxe | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 58 | Harpoon | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 59 | Harpoon Gun | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 4; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 60 | Heavy Crossbow | `draw_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 61 | Heavy Machine Gun | `draw_initiative_cost`: NULL ? 3; `reload_initiative_cost`: NULL ? 5; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 63 | Hunting Rifle | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 3; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 30 | Hunting Rifle / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 64 | Ion Cannon | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 65 | Javelin | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 67 | Laser Cannon | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 68 | Laser Carbine | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 69 | Laser Lance | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 70 | Laser Pistol | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 71 | Laser Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 72 | Laser Sword | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 73 | Lasso | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 74 | Lead Pipe | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 75 | Lever-Action Rifle | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 1; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 36 | Lever-Action Rifle / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 76 | Light Crossbow | `draw_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 77 | Longbow | `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 79 | Lucerne Hammer | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 80 | Mace | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 81 | Machete | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 82 | Machine Gun | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 4; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 83 | Meteor Hammer | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 84 | Molotov Cocktail | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 85 | Monofilament Whip | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 86 | Morningstar | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 87 | Musket | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 8; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 41 | Musket / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 88 | Nanite Swarm Grenade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 89 | Particle Cannon | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 90 | Particle Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 91 | Partisan | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 92 | Pepper Spray | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 93 | Plasma Blaster | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 94 | Plasma Knife | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 95 | Plasma Pistol | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 96 | Plasma Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 97 | Plasma Thrower | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 98 | Poleaxe | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 99 | Powder Bomb | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 100 | Power Fists | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 101 | Pulse Blade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 102 | Pulse Cannon | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 103 | Pulse Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 104 | Quarterstaff | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 105 | Rail Cannon | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 106 | Rail Pistol | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 107 | Rapier | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 108 | Repeating Crossbow | `draw_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 109 | Repeating Musket | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 6; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 57 | Repeating Musket / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 110 | Retractable Baton | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 111 | Retractable Staff | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 113 | Rocket Launcher | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 114 | Rocket Spear | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 115 | Sabre | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 116 | Scimitar | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 117 | Shortbow | `draw_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 119 | Shotgun | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 1; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 60 | Shotgun / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 120 | Sling | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 121 | Slingshot | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 122 | Sludge Launcher | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 123 | Sniper Rifle | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 3; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 63 | Sniper Rifle / Single | `base_cycling_initiative_cost`: NULL ? 1; `base_recoil_reset_initiative_cost`: NULL ? 1; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 124 | Sonic Blaster | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 125 | Sonic Cannon | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 126 | Spear | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 127 | Spetum | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 128 | Stasis Ray Gun | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 129 | Steam Gauntlets | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 130 | Steam Rifle | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 67 | Steam Rifle / Semi-Auto | `base_cycling_initiative_cost`: NULL ? 0.5; `base_recoil_reset_initiative_cost`: NULL ? 0.5; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 131 | Stiletto Dagger | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 132 | Stun Baton | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 133 | Stun Blaster | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 134 | Submachine Gun | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 4; `unload_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 136 | Switchblade | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 137 | Tanto | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 138 | Tesla Coil Gauntlet | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 139 | Tesla Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 140 | Throwing Axe | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 142 | Throwing Spear | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 143 | Throwing Stars | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 144 | Throwing Tomahawk | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 145 | Tranquilizer Dart Gun | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 147 | Tribal Blowgun | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 148 | Trident | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 149 | Tuning Fork Blade | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 150 | War Club | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 151 | Warhammer | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 152 | Warp Rifle | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 153 | Whip | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 154 | Wooden Stake | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 172 | Magic Wand | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 173 | Bone Saw | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 174 | Chainsaw | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 175 | Cleaver | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 176 | Crowbar | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 177 | Fire Axe | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 178 | Fire Poker | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 179 | Fishing Spear | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 180 | Frying Pan | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 181 | Harpoon Spear | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 182 | Hatchet | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 183 | Ice Pick | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 184 | Kitchen Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 185 | Large Wrench | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 186 | Locking Utility Blade | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 187 | Meat Hook | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 188 | Meat Tenderizer | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 189 | Pickaxe | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 190 | Pipe Wrench | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 191 | Pitchfork | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 192 | Pocket Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 193 | Scalpel | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 194 | Scythe | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 195 | Shovel | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 196 | Sickle | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 197 | Sledgehammer | `draw_initiative_cost`: NULL ? 3; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 198 | Staple Gun | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 199 | Steam Drill | `draw_initiative_cost`: NULL ? 2 |
| `weapon_profiles` id 200 | Tire Iron | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 201 | Whaling Gun | `draw_initiative_cost`: NULL ? 2; `reload_initiative_cost`: NULL ? 2; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 74 | Whaling Gun / Semi-Auto | `base_cycling_initiative_cost`: NULL ? 0.5; `base_recoil_reset_initiative_cost`: NULL ? 0.5; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 224 | 9mm Luger | `draw_initiative_cost`: NULL ? 1; `reload_initiative_cost`: NULL ? 3; `unload_initiative_cost`: NULL ? 1 |
| `weapon_firing_modes` id 80 | 9mm Luger / Semi | `base_cycling_initiative_cost`: NULL ? 0.5; `base_recoil_reset_initiative_cost`: NULL ? 0.5; `delivery_cadence`: NULL ? per-trigger; `rounds_per_cadence`: NULL ? 1; `mechanics_review_required`: true ? false |
| `weapon_profiles` id 229 | Shortsword | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 6 |
| `weapon_profiles` id 230 | Hunting Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 231 | Survival Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 232 | Throwing Knife | `draw_initiative_cost`: NULL ? 1 |
| `weapon_profiles` id 233 | Trench Knife | `draw_initiative_cost`: NULL ? 1; `initiative_cost`: NULL ? 4 |
| `weapon_profiles` id 236 | Katana | `draw_initiative_cost`: NULL ? 2; `initiative_cost`: NULL ? 8 |
| `weapon_profiles` id 238 | Greatsword | `draw_initiative_cost`: NULL ? 3 |
| `weapon_profiles` id 239 | Longsword | `draw_initiative_cost`: NULL ? 2 |
| `magazine_profiles` item_id 1021 | 5.56x45 mm magazine 5rd | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1035 | 5.56 mm Rifle Magazine (30 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1036 | 9x19 mm Carbine Magazine (30 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1037 | 9mm Luger Magazine (15 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1038 | Repeating Crossbow Magazine (5 bolts) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1039 | Heavy Machine Gun Feed Box (100 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1040 | Heavy Machine Gun Belt Can (500 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1041 | Machine Gun Feed Box (100 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1042 | Steam Rifle Magazine (30 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |
| `magazine_profiles` item_id 1043 | Submachine Gun Drum (100 rounds) | `fill_initiative_cost_per_round`: NULL ? 1 |

## Unresolved catalog review

The audit found 99 Equipment weapons with at least one remaining governance or special-mechanic issue. These categories overlap: 90 special/thrown/unresolved-mechanism entries, 81 without a valid default Skill path, three Full-Auto modes without delivery/recovery settings, and one incomplete supported ammunition profile. Exact paths and intended mechanics must be resolved individually.

| Item | Weapon | Remaining issue |
| ---: | --- | --- |
| 4 | Acid Grenade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 5 | Acid Sprayer | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 8 | Bio-Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 13 | Boomerang | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 15 | Brass Knuckles | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 16 | Cannon | No valid approved default Skill path; exact governing Skill needs authoring. |
| 17 | Chainsaw Sword | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 18 | Claw Gauntlets | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 22 | Cryo Blaster | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 23 | Cryo Grenade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 27 | Disintegrator Ray | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 28 | Disruptor Grenade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 29 | Disruptor Pistol | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 30 | Electro Net | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 31 | Electro-Gauntlets | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 32 | Electroshock Stun Device | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 33 | Energy Baton | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 34 | Energy Blaster | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 35 | Energy Chakram | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 36 | Energy Pistol | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 37 | Energy Sword | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 38 | Energy Whip | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 41 | Flamethrower | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 44 | Frag Grenade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 45 | Fungal Spore Launcher | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 46 | Garrote Wire | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 47 | Gauss Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 50 | Gravity Hammer | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 52 | Grenade Launcher | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 56 | Hand Mortar | No valid approved default Skill path; exact governing Skill needs authoring. |
| 58 | Harpoon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 59 | Harpoon Gun | No valid approved default Skill path; exact governing Skill needs authoring. Capacity, loading type, or exact ammunition definition is incomplete. |
| 61 | Heavy Machine Gun | Full-Auto: firing rate/recovery settings need an explicit choice. |
| 64 | Ion Cannon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 65 | Javelin | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 67 | Laser Cannon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 68 | Laser Carbine | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 69 | Laser Lance | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 70 | Laser Pistol | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 71 | Laser Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 72 | Laser Sword | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 73 | Lasso | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 82 | Machine Gun | Full-Auto: firing rate/recovery settings need an explicit choice. |
| 83 | Meteor Hammer | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 84 | Molotov Cocktail | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 85 | Monofilament Whip | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 88 | Nanite Swarm Grenade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 89 | Particle Cannon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 90 | Particle Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 92 | Pepper Spray | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 93 | Plasma Blaster | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 94 | Plasma Knife | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 95 | Plasma Pistol | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 96 | Plasma Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 97 | Plasma Thrower | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 99 | Powder Bomb | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 100 | Power Fists | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 101 | Pulse Blade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 102 | Pulse Cannon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 103 | Pulse Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 105 | Rail Cannon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 106 | Rail Pistol | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 113 | Rocket Launcher | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 114 | Rocket Spear | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 120 | Sling | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 121 | Slingshot | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 122 | Sludge Launcher | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 124 | Sonic Blaster | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 125 | Sonic Cannon | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 128 | Stasis Ray Gun | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 129 | Steam Gauntlets | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 130 | Steam Rifle | No valid approved default Skill path; exact governing Skill needs authoring. |
| 132 | Stun Baton | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 133 | Stun Blaster | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 134 | Submachine Gun | Full-Auto: firing rate/recovery settings need an explicit choice. |
| 138 | Tesla Coil Gauntlet | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 139 | Tesla Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 140 | Throwing Axe | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 142 | Throwing Spear | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 143 | Throwing Stars | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 144 | Throwing Tomahawk | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 145 | Tranquilizer Dart Gun | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 147 | Tribal Blowgun | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 149 | Tuning Fork Blade | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 152 | Warp Rifle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 153 | Whip | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 154 | Wooden Stake | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 341 | Magic Wand | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 364 | Chainsaw | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 386 | Fire Poker | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 411 | Harpoon Spear | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 437 | Meat Hook | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 475 | Shovel | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 476 | Sickle | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. |
| 488 | Staple Gun | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 489 | Steam Drill | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 507 | Whaling Gun | No valid approved default Skill path; exact governing Skill needs authoring. |
| 141 | Throwing Knife | Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow. No valid approved default Skill path; exact governing Skill needs authoring. |
| 1045 | M4 Carbine | No valid approved default Skill path; exact governing Skill needs authoring. |

## Validation

- Tabletop workflow: all nine focused disposable database cases; all 1,332 feature tests; typecheck; whole-repository lint; Drizzle consistency; whitespace check; production build. The build needed a network-enabled retry for the existing Google Fonts.
- Disposable Chrome: before-combat readiness for stack and exact copy; Initiative-based draw from Tabletop; live completion; subsequent Attack source; 1440/390/320px and no browser runtime errors. An initial exact-label locator was corrected.
- Catalog proposal: two self-contained tests verify preservation and no repeat writes. The M4-only application verified all non-target catalog fields and all other public tables.
- All 23 disposable combat service scripts passed, covering Initiative, simultaneous choices, attacks, firearms, conditions, interruption, recovery and closeout.
- Automated verification is not Brannan's human gameplay acceptance. No commit, push or deployment was performed.

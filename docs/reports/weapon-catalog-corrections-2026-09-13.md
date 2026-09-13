# Weapon catalog repair and correction list

Recorded 2026-09-13T15:23:48.891Z. Database: **localhost:5432/serrian_tide_dev**. Production was not accessed.

## What changed

- Added 105 approved default Skill mappings, validated through the current exact canonical ancestry. Existing six mappings are unchanged.
- Filled capacity, loading type and confirmed preparation cost on six bow/crossbow profiles: 18 previously blank fields. Longbow's newer authored values, including preparation cost 2, are preserved.
- Created 12 weapon-specific ammunition Items and 12 Ammunition profiles; changed the corresponding 12 weapon ammunition links away from generic Item 163. All retain the previous 8 Piercing damage and 1-credit price. These are user-authorized catalog identities, not asserted real-world calibers or a damage rebalance.
- No magazine Items created. No costs guessed. No Skill definitions, allocations, owned stock, loaded copies, encounters or history changed. Full backup decoded before the transaction; protected rows checked by count and digest.
- 111 of 204 weapons now have approved valid default paths; 93 still need review. This is **not** a claim that 111 weapons are gameplay-ready.

Exact receipt: [applied-1789313028907.json](../../artifacts/weapon-catalog-repair/applied-1789313028907.json). It records every inserted mapping ID, before/after profile values, created Item/profile IDs and preservation checks.
Backup: `C:\Users\birev\AppData\Local\Temp\serrian-before-weapon-catalog-y8wTSE\serrian_tide_dev.dump`; SHA-256 `5cd8f47a45f38260f10c97b9065805d01a5c8b63aff5c1b9b5508baf0ab5e700`. Full archive decode passed; a full restore rehearsal was not performed.

## Fill In These Values

**TBD means unconfirmed, not zero.** Edit the Equipment catalog in Heavens > Equipment > Weapon / Ammunition. Keep this checklist as the decision record. Listed legacy values below are evidence for your review, not automatically approved rules. A sole firing mode does not need a mode-change cost. Magazine fill is separate from weapon reload/swap.

### Firearms, Bows and Crossbows

Bow shot cost includes nock/draw/release; Crossbow release and firearm trigger cost are 1. Draw means drawing a stowed weapon, not drawing a bowstring. Readiness choices are draw-is-ready or separate-ready-action. Single loading means inserting rounds individually, not capacity one.

| Item / Profile | Weapon | Capacity | Load Type | Readiness | Draw | Ready | Load / Nock-Draw-Shoot | Unload | Change Mode | Legacy Capacity / Reload |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 / 1 | 5.56 mm Semi-Automatic Rifle | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 30 / 3 |
| 2 / 2 | 9×19 mm Carbine | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 30 rounds / 2 |
| 3 / 224 | 9mm Luger | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 15 / 3 |
| 10 / 10 | Blunderbuss | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 1 round / 8 |
| 16 / 16 | Cannon | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 15 rounds / 2 |
| 20 / 20 | Composite Bow | 1 | Single | **TBD** | **TBD** | **TBD** | 1 | **TBD** | N/A: sole mode | 1 arrow / 1 |
| 26 / 26 | Derringer Pistol | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 2 rounds / 3 |
| 42 / 42 | Flare Gun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 1 cartridge / 2 |
| 43 / 43 | Flintlock Pistol | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 1 round / 8 |
| 54 / 54 | Hand Cannon | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 15 rounds / 2 |
| 55 / 55 | Hand Crossbow | 1 | Single | **TBD** | **TBD** | **TBD** | 3 | **TBD** | N/A: sole mode | 1 bolt / 3 |
| 56 / 56 | Hand Mortar | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 15 rounds / 2 |
| 59 / 59 | Harpoon Gun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 1 bolt / 4 |
| 60 / 60 | Heavy Crossbow | 1 | Single | **TBD** | **TBD** | **TBD** | 6 | **TBD** | N/A: sole mode | 1 bolt / 6 |
| 61 / 61 | Heavy Machine Gun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 100 rounds / 5 |
| 63 / 63 | Hunting Rifle | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 5 rounds / 3 |
| 75 / 75 | Lever-Action Rifle | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 6 rounds / 1 per round |
| 76 / 76 | Light Crossbow | 1 | Single | **TBD** | **TBD** | **TBD** | 4 | **TBD** | N/A: sole mode | 1 bolt / 4 |
| 77 / 77 | Longbow | 1 | Single | draw-is-ready | 2 | 2 | 2 | **TBD** | N/A: sole mode | 1 arrow / 1 |
| 82 / 82 | Machine Gun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 100 rounds / 4 |
| 87 / 87 | Musket | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 1 round / 8 |
| 108 / 108 | Repeating Crossbow | 5 | Magazine | **TBD** | **TBD** | **TBD** | 2 | **TBD** | N/A: sole mode | 5 bolts / 2 |
| 109 / 109 | Repeating Musket | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 6 rounds / 6 |
| 112 / 242 | .357 Revolver | 6 | Single | draw-is-ready | 2 | 2 | 4 | 2 | N/A: sole mode | 6 rounds / 4 |
| 117 / 117 | Shortbow | 1 | Single | **TBD** | **TBD** | **TBD** | 1 | **TBD** | N/A: sole mode | 1 arrow / 1 |
| 119 / 119 | Shotgun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 5 shells / 1 per shell |
| 123 / 123 | Sniper Rifle | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 5 rounds / 3 |
| 130 / 130 | Steam Rifle | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 30 rounds / 2 |
| 134 / 134 | Submachine Gun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 100 rounds / 4 |
| 507 / 201 | Whaling Gun | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | **TBD** | N/A: sole mode | 15 rounds / 2 |

### Firearm Mode Costs

Complete every TBD cell. Cadence choices are per-trigger or sustained-per-initiative; rounds are whole cartridges. Cycling and recoil costs accept decimals. Bow/crossbow Single mode uses its dedicated one-projectile runtime timing and does not require these firearm mechanics; existing mode identities and fields were not rewritten.

| Item | Weapon | Mode ID / Name | Cycling | Recoil Reset | Cadence | Rounds / Cadence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 5.56 mm Semi-Automatic Rifle | 1 / Semi | **TBD** | **TBD** | **TBD** | **TBD** |
| 2 | 9×19 mm Carbine | 2 / Semi-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 3 | 9mm Luger | 80 / Semi | **TBD** | **TBD** | **TBD** | **TBD** |
| 10 | Blunderbuss | 4 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 16 | Cannon | 5 / Semi-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 26 | Derringer Pistol | 9 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 42 | Flare Gun | 19 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 43 | Flintlock Pistol | 20 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 54 | Hand Cannon | 24 / Semi-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 56 | Hand Mortar | 26 / Semi-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 61 | Heavy Machine Gun | 29 / Full-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 63 | Hunting Rifle | 30 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 75 | Lever-Action Rifle | 36 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 82 | Machine Gun | 39 / Full-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 87 | Musket | 41 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 109 | Repeating Musket | 57 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 112 | .357 Revolver | 81 / Single | 1 | 1 | per-trigger | 1 |
| 119 | Shotgun | 60 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 123 | Sniper Rifle | 63 / Single | **TBD** | **TBD** | **TBD** | **TBD** |
| 130 | Steam Rifle | 67 / Semi-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 134 | Submachine Gun | 69 / Full-Auto | **TBD** | **TBD** | **TBD** | **TBD** |
| 507 | Whaling Gun | 74 / Semi-Auto | **TBD** | **TBD** | **TBD** | **TBD** |

### Other Attack Costs and Family Review

An Initiative cost alone does not implement throwing/recovery, explosives/area effects, control, energy-charge delivery, or other special mechanics. Ordinary melee attacks use the weapon's positive structured attack cost. Every weapon outside the supported firearm/bow/crossbow family is listed here so no missing cost disappears from the audit.

| Item / Profile | Weapon | Attack Initiative | Approved Default Skill | Open Review |
| --- | --- | --- | --- | --- |
| 4 / 4 | Acid Grenade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 5 / 5 | Acid Sprayer | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 6 / 6 | Baton | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 7 / 7 | Battleaxe | **TBD** | 121: Axes | Any special/control/energy effects remain separate rulings |
| 8 / 8 | Bio-Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 9 / 9 | Blackjack | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 11 / 11 | Bo Staff | **TBD** | 130: Staves | Any special/control/energy effects remain separate rulings |
| 12 / 12 | Boarding Axe | **TBD** | 121: Axes | Any special/control/energy effects remain separate rulings |
| 13 / 13 | Boomerang | **TBD** | **TBD** | Thrown-only delivery and recovery are unsupported; do not expose throwing as melee proficiency. |
| 14 / 14 | Bowie Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 15 / 15 | Brass Knuckles | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 17 / 17 | Chainsaw Sword | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 18 / 18 | Claw Gauntlets | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 19 / 19 | Combat Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 21 / 21 | Concealed Blade | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 22 / 22 | Cryo Blaster | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 23 / 23 | Cryo Grenade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 24 / 24 | Cutlass | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 25 / 25 | Dagger | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 27 / 27 | Disintegrator Ray | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 28 / 28 | Disruptor Grenade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 29 / 29 | Disruptor Pistol | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 30 / 30 | Electro Net | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 31 / 31 | Electro-Gauntlets | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 32 / 32 | Electroshock Stun Device | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 33 / 33 | Energy Baton | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 34 / 34 | Energy Blaster | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 35 / 35 | Energy Chakram | **TBD** | **TBD** | Thrown energy disc needs delivery, recovery and energy rules. |
| 36 / 36 | Energy Pistol | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 37 / 37 | Energy Sword | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 38 / 38 | Energy Whip | **TBD** | 64: Whips | Any special/control/energy effects remain separate rulings |
| 39 / 39 | Falchion | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 40 / 40 | Flail | **TBD** | 62: Flails | Any special/control/energy effects remain separate rulings |
| 41 / 41 | Flamethrower | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 44 / 44 | Frag Grenade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 45 / 45 | Fungal Spore Launcher | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 46 / 46 | Garrote Wire | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 47 / 47 | Gauss Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 48 / 48 | Gladius | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 49 / 49 | Glaive | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 50 / 50 | Gravity Hammer | **TBD** | 125: Hammers | Any special/control/energy effects remain separate rulings |
| 51 / 238 | Greatsword | 10 | 120: Swords | Any special/control/energy effects remain separate rulings |
| 52 / 52 | Grenade Launcher | **TBD** | **TBD** | Grenade-launcher delivery and area payload mechanics need separate runtime support. |
| 53 / 53 | Halberd | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 57 / 57 | Handaxe | **TBD** | 121: Axes | Any special/control/energy effects remain separate rulings |
| 58 / 58 | Harpoon | **TBD** | **TBD** | Description explicitly says ranged use; Spears is a melee path. Confirm thrusting versus throwing. |
| 62 / 230 | Hunting Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 64 / 64 | Ion Cannon | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 65 / 65 | Javelin | **TBD** | **TBD** | Description explicitly says thrown javelin; Spears is a melee path. Confirm intended uses. |
| 66 / 236 | Katana | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 67 / 67 | Laser Cannon | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 68 / 68 | Laser Carbine | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 69 / 69 | Laser Lance | **TBD** | 128: Spears | Any special/control/energy effects remain separate rulings |
| 70 / 70 | Laser Pistol | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 71 / 71 | Laser Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 72 / 72 | Laser Sword | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 73 / 73 | Lasso | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 74 / 74 | Lead Pipe | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 78 / 239 | Longsword | 6 | 120: Swords | Any special/control/energy effects remain separate rulings |
| 79 / 79 | Lucerne Hammer | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 80 / 80 | Mace | **TBD** | 126: Maces | Any special/control/energy effects remain separate rulings |
| 81 / 81 | Machete | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 83 / 83 | Meteor Hammer | **TBD** | 65: Tethered Weapons | Any special/control/energy effects remain separate rulings |
| 84 / 84 | Molotov Cocktail | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 85 / 85 | Monofilament Whip | **TBD** | 64: Whips | Any special/control/energy effects remain separate rulings |
| 86 / 86 | Morningstar | **TBD** | 126: Maces | Any special/control/energy effects remain separate rulings |
| 88 / 88 | Nanite Swarm Grenade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 89 / 89 | Particle Cannon | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 90 / 90 | Particle Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 91 / 91 | Partisan | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 92 / 92 | Pepper Spray | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 93 / 93 | Plasma Blaster | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 94 / 94 | Plasma Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 95 / 95 | Plasma Pistol | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 96 / 96 | Plasma Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 97 / 97 | Plasma Thrower | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 98 / 98 | Poleaxe | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 99 / 99 | Powder Bomb | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 100 / 100 | Power Fists | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 101 / 101 | Pulse Blade | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 102 / 102 | Pulse Cannon | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 103 / 103 | Pulse Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 104 / 104 | Quarterstaff | **TBD** | 130: Staves | Any special/control/energy effects remain separate rulings |
| 105 / 105 | Rail Cannon | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 106 / 106 | Rail Pistol | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 107 / 107 | Rapier | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 110 / 110 | Retractable Baton | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 111 / 111 | Retractable Staff | **TBD** | 130: Staves | Any special/control/energy effects remain separate rulings |
| 113 / 113 | Rocket Launcher | **TBD** | **TBD** | Rocket-launcher delivery and area payload mechanics need separate runtime support. |
| 114 / 114 | Rocket Spear | **TBD** | **TBD** | Propelled one-use spear is not established as a melee thrusting weapon. |
| 115 / 115 | Sabre | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 116 / 116 | Scimitar | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 118 / 229 | Shortsword | **TBD** | 120: Swords | Any special/control/energy effects remain separate rulings |
| 120 / 120 | Sling | **TBD** | **TBD** | Sling ammunition delivery is unsupported; keep the proposed Sling path pending. |
| 121 / 121 | Slingshot | **TBD** | **TBD** | Slingshot ammunition delivery is unsupported; keep the proposed Slingshots path pending. |
| 122 / 122 | Sludge Launcher | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 124 / 124 | Sonic Blaster | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 125 / 125 | Sonic Cannon | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 126 / 126 | Spear | **TBD** | 128: Spears | Any special/control/energy effects remain separate rulings |
| 127 / 127 | Spetum | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 128 / 128 | Stasis Ray Gun | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 129 / 129 | Steam Gauntlets | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 131 / 131 | Stiletto Dagger | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 132 / 132 | Stun Baton | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 133 / 133 | Stun Blaster | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 135 / 231 | Survival Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 136 / 136 | Switchblade | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 137 / 137 | Tanto | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 138 / 138 | Tesla Coil Gauntlet | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 139 / 139 | Tesla Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 140 / 140 | Throwing Axe | **TBD** | **TBD** | Thrown Axes must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 141 / 232 | Throwing Knife | **TBD** | **TBD** | Thrown Blades must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 142 / 142 | Throwing Spear | **TBD** | **TBD** | Thrown Spears must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 143 / 143 | Throwing Stars | **TBD** | **TBD** | Thrown Blades must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 144 / 144 | Throwing Tomahawk | **TBD** | **TBD** | Thrown Axes must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 145 / 145 | Tranquilizer Dart Gun | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 146 / 233 | Trench Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 147 / 147 | Tribal Blowgun | **TBD** | **TBD** | Blowgun ammunition delivery and its prose damage override are unsupported. |
| 148 / 148 | Trident | **TBD** | 128: Spears | Any special/control/energy effects remain separate rulings |
| 149 / 149 | Tuning Fork Blade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 150 / 150 | War Club | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 151 / 151 | Warhammer | **TBD** | 125: Hammers | Any special/control/energy effects remain separate rulings |
| 152 / 152 | Warp Rifle | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 153 / 153 | Whip | **TBD** | 64: Whips | Any special/control/energy effects remain separate rulings |
| 154 / 154 | Wooden Stake | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 341 / 172 | Magic Wand | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 359 / 173 | Bone Saw | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 364 / 174 | Chainsaw | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 366 / 175 | Cleaver | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 373 / 176 | Crowbar | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 384 / 177 | Fire Axe | **TBD** | 121: Axes | Any special/control/energy effects remain separate rulings |
| 386 / 178 | Fire Poker | **TBD** | **TBD** | Fire Poker: clarify striking versus point use before choosing Clubs or a thrusting path. |
| 391 / 179 | Fishing Spear | **TBD** | 128: Spears | Any special/control/energy effects remain separate rulings |
| 398 / 180 | Frying Pan | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 411 / 181 | Harpoon Spear | **TBD** | 128: Spears | Any special/control/energy effects remain separate rulings |
| 412 / 182 | Hatchet | **TBD** | 121: Axes | Any special/control/energy effects remain separate rulings |
| 423 / 183 | Ice Pick | **TBD** | 60: Picks | Any special/control/energy effects remain separate rulings |
| 425 / 184 | Kitchen Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 428 / 185 | Large Wrench | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 433 / 186 | Locking Utility Blade | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 437 / 187 | Meat Hook | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 438 / 188 | Meat Tenderizer | **TBD** | 125: Hammers | Any special/control/energy effects remain separate rulings |
| 452 / 189 | Pickaxe | **TBD** | 60: Picks | Any special/control/energy effects remain separate rulings |
| 453 / 190 | Pipe Wrench | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 454 / 191 | Pitchfork | **TBD** | 128: Spears | Any special/control/energy effects remain separate rulings |
| 459 / 192 | Pocket Knife | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 470 / 193 | Scalpel | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 473 / 194 | Scythe | **TBD** | 129: Polearms | Any special/control/energy effects remain separate rulings |
| 475 / 195 | Shovel | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 476 / 196 | Sickle | **TBD** | 59: Hooked Blades | Any special/control/energy effects remain separate rulings |
| 480 / 197 | Sledgehammer | **TBD** | 125: Hammers | Any special/control/energy effects remain separate rulings |
| 488 / 198 | Staple Gun | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 489 / 199 | Steam Drill | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 498 / 200 | Tire Iron | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 562 / 202 | Baseball Bat | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 563 / 203 | Billiard Cue | **TBD** | 130: Staves | Any special/control/energy effects remain separate rulings |
| 565 / 204 | Brick | **TBD** | **TBD** | Brick: confirm improvised striking versus throwing; solid object is not automatically club technique. |
| 575 / 205 | Heavy Chains | **TBD** | 64: Whips | Any special/control/energy effects remain separate rulings |
| 577 / 206 | Laptop | **TBD** | **TBD** | Laptop: ordinary-function description does not establish a canonical club-like combat technique. |
| 581 / 207 | Rebar Club | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 582 / 208 | Refrigerator Door | **TBD** | **TBD** | Refrigerator Door: unwieldy smash use needs an improvised-weapon ruling, not automatic Clubs. |
| 584 / 209 | Rust Sawblade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 585 / 210 | Rusty Pipe | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 586 / 211 | Sharpened Bone | **TBD** | 122: Short Blades | Any special/control/energy effects remain separate rulings |
| 588 / 212 | Spiked Bat | **TBD** | 124: Clubs | Any special/control/energy effects remain separate rulings |
| 591 / 213 | Toilet Lid | **TBD** | **TBD** | Toilet Lid: confirm the intended improvised combat technique. |
| 592 / 214 | Traffic Sign | **TBD** | **TBD** | Traffic Sign: description says swung like a blade; reconcile that with proposed Clubs. |
| 612 / 215 | Mantrap Jaw | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 615 / 216 | Remote-Detonated Explosive | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 616 / 217 | Shrapnel Mine | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 665 / 218 | Flashbang | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 705 / 219 | Poison Gas Grenade | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 719 / 220 | Smoke Bomb | **TBD** | **TBD** | Mechanism / intended-use / governing-path review required. |
| 816 / 221 | Chair | **TBD** | **TBD** | Chair: ordinary-function description does not establish a canonical club-like combat technique. |

## Ammunition Authored

These definitions belong in Inventory with an Ammunition profile. Owned generic rounds were not converted, exchanged or granted. New inventory must be acquired normally. None of the affected guns had initialized copies at application; the repair refuses a changed link if one has appeared.

| Weapon Item | Weapon | New Ammo Item / Profile | Ammunition | Damage | Credits |
| --- | --- | --- | --- | --- | --- |
| 10 | Blunderbuss | 1023 / 247 | Blunderbuss Shot Charge | 8 Piercing | 1 |
| 26 | Derringer Pistol | 1024 / 248 | Derringer Cartridge | 8 Piercing | 1 |
| 54 | Hand Cannon | 1025 / 249 | Hand Cannon Ball Charge | 8 Piercing | 1 |
| 56 | Hand Mortar | 1026 / 250 | Hand Mortar Projectile | 8 Piercing | 1 |
| 61 | Heavy Machine Gun | 1027 / 251 | Heavy Machine Gun Cartridge | 8 Piercing | 1 |
| 63 | Hunting Rifle | 1028 / 252 | Hunting Rifle Cartridge | 8 Piercing | 1 |
| 75 | Lever-Action Rifle | 1029 / 253 | Lever-Action Rifle Cartridge | 8 Piercing | 1 |
| 82 | Machine Gun | 1030 / 254 | Machine Gun Cartridge | 8 Piercing | 1 |
| 123 | Sniper Rifle | 1031 / 255 | Sniper Rifle Cartridge | 8 Piercing | 1 |
| 130 | Steam Rifle | 1032 / 256 | Steam Rifle Projectile | 8 Piercing | 1 |
| 134 | Submachine Gun | 1033 / 257 | Submachine Gun Cartridge | 8 Piercing | 1 |
| 507 | Whaling Gun | 1034 / 258 | Whaling Gun Harpoon | 8 Piercing | 1 |

- Item 56: A projectile for the catalog Hand Mortar. Payload and blast behavior remain unconfirmed; this definition does not grant area damage. The retained damage is still a balance-review value, not approval of additional effects.
- Item 130: A projectile for the catalog pressurized Steam Rifle. Pressure supply and loading mechanism remain unconfirmed. The retained damage is still a balance-review value, not approval of additional effects.
- Item 507: A tethered harpoon projectile for the catalog Whaling Gun. Tether handling requires a G.O.D. ruling and is not automated by this definition. The retained damage is still a balance-review value, not approval of additional effects.
- Harpoon Gun 59 still has no ammunition link. Its launcher mechanism and exact projectile specification remain separate from Whaling Gun 507; do not infer interchangeability.
- Flintlock Pistol 43 links to Musket Ball 166 (10 Piercing), while its prose says 6. The current firearm attack reads linked ammunition damage; it does not execute this prose override. Choose a dedicated 6-damage load or an explicit supported output-override implementation before treating the prose as active.

## Magazines and Loading Decisions

| Magazine Item | Model | Capacity | Fill Initiative / Round | Ammo Items | Physical Weapon Profiles |
| --- | --- | --- | --- | --- | --- |
| 1021 | 5.56x45 mm magazine 5rd | 5 | **TBD** | 155 | **TBD** |
| 1022 | 357 revolver drum | 6 | 0 | 1008 | 242 |

- **Confirmed revolver decision:** .357 Revolver 112 retains six-round capacity and Single loading. Insert individual rounds; firing does not require a reload after each shot. Existing draw 2, ready 2, reload 4, unload 2 and Single mode 1/1 remain unchanged. Drum 1022 stays in the catalog with explicit fill cost 0, but is not enabled as a swappable magazine.
- Rifle 1, Carbine 2 and Luger 3 need exact detachable models. Provide each model's capacity, price, fill cost and weapon fit; existing ammo links are 155,156,156 respectively. Model 1021 remains five rounds, with no confirmed fit; it was not resized to 30 or linked by caliber alone.
- Repeating Crossbow 108 uses Magazine, capacity 5, swap cost 2. Provide a five-bolt model's price and fill cost; no owned magazine is manufactured. Its exact physical link and Bolt 159 compatibility can then be authored together.
- Hand Cannon 54 says single-shot but legacy capacity/mode says 15/Semi-Auto. Cannon 16 and Hand Mortar 56 also have suspicious 15/Semi-Auto entries. Confirm capacity and mechanism before filling structured fields.
- Confirm internal, detachable, belt or other feed for remaining guns. Current runtime supports Single insertion and exact detachable magazines, not an automatically inferred belt/pressure/energy system.

## Deferred Proposed Mappings

| Item | Weapon | Proposed Skill | Why Deferred |
| --- | --- | --- | --- |
| 13 | Boomerang | 78 | Thrown-only delivery and recovery are unsupported; do not expose throwing as melee proficiency. |
| 35 | Energy Chakram | 78 | Thrown energy disc needs delivery, recovery and energy rules. |
| 52 | Grenade Launcher | 74 | Grenade-launcher delivery and area payload mechanics need separate runtime support. |
| 58 | Harpoon | 128 | Description explicitly says ranged use; Spears is a melee path. Confirm thrusting versus throwing. |
| 65 | Javelin | 128 | Description explicitly says thrown javelin; Spears is a melee path. Confirm intended uses. |
| 113 | Rocket Launcher | 75 | Rocket-launcher delivery and area payload mechanics need separate runtime support. |
| 114 | Rocket Spear | 128 | Propelled one-use spear is not established as a melee thrusting weapon. |
| 120 | Sling | 137 | Sling ammunition delivery is unsupported; keep the proposed Sling path pending. |
| 121 | Slingshot | 138 | Slingshot ammunition delivery is unsupported; keep the proposed Slingshots path pending. |
| 140 | Throwing Axe | 142 | Thrown Axes must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 141 | Throwing Knife | 143 | Thrown Blades must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 142 | Throwing Spear | 141 | Thrown Spears must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 143 | Throwing Stars | 143 | Thrown Blades must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 144 | Throwing Tomahawk | 142 | Thrown Axes must not grant ordinary melee eligibility; use-specific governance/delivery is pending. |
| 147 | Tribal Blowgun | 139 | Blowgun ammunition delivery and its prose damage override are unsupported. |
| 386 | Fire Poker | 124 | Fire Poker: clarify striking versus point use before choosing Clubs or a thrusting path. |
| 565 | Brick | 124 | Brick: confirm improvised striking versus throwing; solid object is not automatically club technique. |
| 577 | Laptop | 124 | Laptop: ordinary-function description does not establish a canonical club-like combat technique. |
| 582 | Refrigerator Door | 124 | Refrigerator Door: unwieldy smash use needs an improvised-weapon ruling, not automatic Clubs. |
| 591 | Toilet Lid | 124 | Toilet Lid: confirm the intended improvised combat technique. |
| 592 | Traffic Sign | 124 | Traffic Sign: description says swung like a blade; reconcile that with proposed Clubs. |
| 816 | Chair | 124 | Chair: ordinary-function description does not establish a canonical club-like combat technique. |

The other 71 originally unassigned unusual/control/tool/energy/explosive records remain intentionally unassigned. Their complete item-level status is in the receipt's catalogAudit and the cost/review tables above. No blanket CQB paths or thrown-as-melee approvals were added.

## Validation Boundary

The repair test loads a sanitized copy of the reviewed catalog into a disposable migrated database, applies all repairs, reads every new mapping through the authoritative governance service, checks exact ancestry/mode inheritance, retries with zero changes, rejects stale/unauthorized requests, and rolls back a simulated mid-repair failure. Broader service results are recorded in COMBAT-RESUME.md after execution.

These checks do not certify a live weapon with TBD fields as usable. Gameplay fixtures and human acceptance are distinct from catalog authoring. No shared DEV encounter was driven or rewritten for verification.

## Repeatable Commands

```powershell
node --import tsx scripts/repair-weapon-catalog-dev.ts --plan
node --import tsx scripts/repair-weapon-catalog-dev.ts --apply <reviewed-plan-digest> <administrator-user-id>
node --import tsx --test scripts/weapon-catalog-repair.test.ts
$env:COMBAT_COMPLETION_CASE_FILTER='weapon-catalog-repair'
npm.cmd run validate:combat-completion-db
```

The reviewed snapshot is immutable and capture uses exclusive creation. Re-running a completed repair is a no-op. Later human catalog changes require re-review, never restoring the old snapshot. No schema migration is introduced; the existing 50 migration hashes were verified.

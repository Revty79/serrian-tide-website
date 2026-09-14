# Magazine and ammunition genre tags

## Applied scope

The user requested fitting genre tags for all magazines. Reviewed all 11 active
magazine catalog entries in local `serrian_tide_dev`. Added 10 existing tag links
to the eight entries that still had no tags at application time.

Assignments follow the compatible weapons' existing genre tags and the tag
catalog's descriptions. Ordinary contemporary ammunition equipment uses Modern;
the catalog does not require adding Sci-Fi or Post-Apocalyptic to every ordinary
modern item. Existing user-assigned tags were preserved, not normalized away.

## Added tags

| Item ID | Magazine | Added tags |
| --- | --- | --- |
| 1036 | 9x19 mm Carbine Magazine (30 rounds) | Modern |
| 1037 | 9mm Luger Magazine (15 rounds) | Modern |
| 1038 | Repeating Crossbow Magazine (5 bolts) | Fantasy, Historical |
| 1039 | Heavy Machine Gun Feed Box (100 rounds) | Modern |
| 1040 | Heavy Machine Gun Belt Can (500 rounds) | Modern |
| 1041 | Machine Gun Feed Box (100 rounds) | Modern |
| 1042 | Steam Rifle Magazine (30 rounds) | Fantasy, Historical |
| 1043 | Submachine Gun Drum (100 rounds) | Modern |

Items 1021, 1022, and 1035 already had genre tags when the additions were applied.
Their complete existing tag sets were preserved. Item 1021 was tagged during the
review; the initial stale-count guard stopped before any mutation, and its new
tags were included in the refreshed review.

## Verification

- Confirmed exact magazine IDs/canonical IDs and existing tag identities.
- Applied only the missing `item_tag_links` rows in one transaction.
- Compared the full tag-link set: exactly the planned 10 additions, no removals
  or unrelated changes.
- Verified unchanged fingerprints for `items`, `item_tags_catalog`,
  `magazine_profiles`, `magazine_ammunition`, `weapon_magazines`, and
  `weapon_profiles`.
- Verified all 11 active magazines have a genre/era, genre-pack, or global tag.
- Confirmed the repeated plan has no missing links and checked saved links after
  commit.
- No inventory, prices, capacities, compatibility, or combat behavior was edited.
- No production access, schema changes, or application code changes. Validation
  was by database assertions, not a browser rehearsal or a broad test run.

## Recovery record

Applied at `2026-09-13T21:26:23.882Z` to local `serrian_tide_dev`.

Original magazine tags and the exact additions:
`C:\Users\birev\AppData\Local\Temp\serrian-magazine-genre-tags-NHVX5B\before.json`

Verified application receipt:
`C:\Users\birev\AppData\Local\Temp\serrian-magazine-genre-tags-NHVX5B\applied.json`

## Ammunition follow-up

The user then approved tagging ammunition as well. Expanded the review beyond
the four untagged ammunition types used by magazines to all 30 active ammunition
entries, including ammunition linked directly from weapons.

Found 12 entries with no tags and three entries missing genre tags used by their
linked weapons. Added 17 links across these 15 entries, preserving all existing
tags. Only genre/era, genre-pack, and global tags were considered for matching;
market and theme overlays were not automatically copied.

| Item ID | Ammunition | Added tags |
| --- | --- | --- |
| 160 | Dart | Fantasy, Historical |
| 167 | Net Projectile | Sci-Fi |
| 168 | Pellet | Historical |
| 1023 | Blunderbuss Shot Charge | Historical |
| 1024 | Derringer Cartridge | Modern |
| 1025 | Hand Cannon Ball Charge | Historical |
| 1026 | Hand Mortar Projectile | Historical |
| 1027 | Heavy Machine Gun Cartridge | Modern |
| 1028 | Hunting Rifle Cartridge | Modern |
| 1029 | Lever-Action Rifle Cartridge | Modern |
| 1030 | Machine Gun Cartridge | Modern |
| 1031 | Sniper Rifle Cartridge | Modern |
| 1032 | Steam Rifle Projectile | Fantasy, Historical |
| 1033 | Submachine Gun Cartridge | Modern |
| 1034 | Whaling Gun Harpoon | Modern |

Dart retains Modern for tranquilizer dart guns and gains Fantasy/Historical for
the tribal blowgun. Net Projectile retains Modern and gains Sci-Fi for the Electro
Net. Pellet retains Modern and gains Historical for the Slingshot.

Verified the exact reviewed item/canonical IDs and tag identities before updating.
The full `item_tag_links` set changed by exactly the 17 planned additions. All
six catalog tables listed in the magazine verification retained their original
fingerprints, and the magazine tags remained unchanged. Every active ammunition
entry now has a genre tag, and no genre tag required by an active linked weapon
is missing from its ammunition. Post-commit reads and a repeated missing-link
query passed. No application code, compatibility, ammunition definition, damage,
price, or inventory quantity was changed; no broad test run or browser rehearsal
was needed for this tags-only update.

Applied at `2026-09-13T21:30:01.414Z` to local `serrian_tide_dev`.

Original ammunition tags and the exact additions:
`C:\Users\birev\AppData\Local\Temp\serrian-ammunition-genre-tags-d1bk9x\before.json`

Verified application receipt:
`C:\Users\birev\AppData\Local\Temp\serrian-ammunition-genre-tags-d1bk9x\applied.json`

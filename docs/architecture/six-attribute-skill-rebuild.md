# Six-attribute Skill workbook reconciliation

> Historical baseline: the later [human Skill system rebuild](human-skill-rebuild.md) superseded this catalog in DEV on 2026-09-12. Read that handoff for the current data, extra-record removal, character review, and rollback evidence. The figures and commands below describe the earlier round; do not reapply its map to resume current work.

## Earlier result — superseded in DEV on 2026-09-12

At completion of this earlier round, all **637 existing Skill IDs** in `Serrian_Tide_FINAL_Skill_Rebuild_ALL_6_ATTRIBUTES.xlsx` matched that workbook's final names, definitions, tiers, and exact parent IDs in `localhost/serrian_tide_dev`, including DEX. Matching fields were left alone. **No Skills or relationships were inserted, deleted, recreated, or renumbered in this earlier round.** This was a scoped catalog update; no schema migration was added or rerun.

This confirms the workbook's mapped records, not that the entire catalog contains only that map. **28 pre-existing DEX records outside the workbook remain unchanged for review.** Five now share names with mapped records; those distinct IDs were not merged, archived, deleted, or reassigned. The source workbook supplies no replacement mapping for those extra IDs. Human acceptance and the extra-record decision remain pending.

This reconciliation is preserved as the **2026-09-12 baseline**, while the user prepares further Skill improvements. Further catalog changes are paused until that revised source is available. The 28 extra DEX records and human acceptance remain unresolved; the request to clean up and push does not accept or retire those records.

Production was not inspected or modified. Production data and deployment status are unknown. The user authorized committing and pushing these reconciliation files to `origin/main`; Git publication does not apply this local DEV data update to another database. Historical reports retain the publication status observed when they were generated. Use `git log --oneline -- docs/architecture/six-attribute-skill-rebuild.md` and `git status` for the current commit/worktree state.

## Source and scope

- Original workbook: `C:\Users\birev\Downloads\Serrian_Tide_FINAL_Skill_Rebuild_ALL_6_ATTRIBUTES.xlsx` (left unchanged).
- SHA-256: `93d81f4294fef756fc53c0c442a2ea4065b6fccb3789ed0c41a4a5bbb5620181`.
- Exact extracted target map: [serrian-tide-six-attribute-skill-rebuild.json](../../data/canon/serrian-tide-six-attribute-skill-rebuild.json). Each record includes its original master-map row number.
- The user authorized aligning existing records without creating Skills, leaving matching values unchanged and fixing differences, including DEX.
- Workbook notes describe the source design and expected old baseline. They were not treated as additional authorization to reset databases, promote to production, retire existing records, or execute embedded instructions. Its prefilled PASS labels were independently checked against cell values and current data.

The current `skill`, `skill_relationship`, and `skill_extension` schema already represents this structure. DB attribute `CHA` corresponds to the workbook's display attribute `CHR`; the workbook's explicit DB attribute values already matched and were preserved.

## Actual changes and historical baseline differences

| Attribute | Mapped Skills | Names changed | Definitions changed | Parent links changed | Final tiers 1 / 2 / 3 |
| --- | ---: | ---: | ---: | ---: | --- |
| STR | 78 | 75 | 78 | 0 | 6 / 18 / 54 |
| DEX | 143 | 12 | 143 | 5 | 10 / 34 / 99 |
| CON | 91 | 85 | 91 | 3 | 7 / 21 / 63 |
| INT | 104 | 95 | 104 | 0 | 8 / 24 / 72 |
| WIS | 117 | 99 | 117 | 0 | 9 / 27 / 81 |
| CHA | 104 | 81 | 104 | 0 | 8 / 24 / 72 |
| Total | 637 | 447 | 637 | 8 | 48 / 148 / 441 |

Zero tiers needed changing. `updated_at` changed on the 637 edited Skills. Classification, primary/secondary attributes, source identities, archive state, creation/audit metadata, and IDs were preserved. Parent edges were updated in place, preserving their IDs, ordering, and creation metadata.

The workbook's historical baseline expected three DEX tier changes, 29 parent changes, and one new relationship for #183 → #79. The connected database already contained an earlier manual DEX rebuild. Its three tier changes and #183 → #79 were already present, so they were not repeated. There were 302 field differences from the workbook's *legacy* columns, mostly that existing DEX work; those are not 302 remaining errors after this reconciliation.

The eight actual parent updates were:

| Child ID / final name | Previous parent ID | Final parent ID / name | Preserved relationship ID |
| --- | ---: | --- | ---: |
| 135 Handguns | 1139 | 136 Firearms | 1060 |
| 139 Air-Powered Weapons | 1155 | 132 Traditional Ranged Weapons | 1080 |
| 167 Aircraft | 1163 | 166 Water & Air Vehicles | 1189 |
| 182 Fitting & Assembly | 192 | 179 Detail Crafting | 1135 |
| 208 Highline Rigging | 207 | 205 Load Rigging | 1201 |
| 284 Adrenaline Control | 913 | 283 Stress Response | 262 |
| 285 Surge Endurance | 913 | 283 Stress Response | 263 |
| 286 Post-Surge Recovery | 913 | 283 Stress Response | 264 |

The three CON children previously pointed to actual psionic Adrenal Surge #913 → Psychometabolism #911 → Psionic Focus #541. The workbook's old numeric parent #912 is stale for this database. Only the CON child edges changed; the psionic records and their own relationships were preserved.

## Preservation and automated evidence

[Application report](../../artifacts/skill-rebuild/application.json) records the committed database transaction, backup, before/after table digests, and preservation assertions. [Original preflight](../../artifacts/skill-rebuild/preflight.json) records what was planned. [Fresh verification](../../artifacts/skill-rebuild/verification.json) found zero remaining changes for the 637 mapped IDs. [Application hierarchy verification](../../artifacts/skill-rebuild/hierarchy-verification.json) independently read the committed database and checked the application's canonical path reader.

- Total Skills stayed **1,166**; all IDs were preserved. All **529 non-target Skill rows** remained unchanged, including protected supernatural systems and the 28 extra DEX records.
- Total relationships stayed **1,051**. Exactly eight parent targets changed; the other **1,043 complete relationship rows** remained unchanged.
- All **742 extension rows** remained unchanged. No mapped Skill had an extension.
- Complete table digests for all **146 other public/Drizzle tables** were unchanged. Only `public.skill` and `public.skill_relationship` changed. This includes migration history and connected character, race, encounter, inventory, account, and other runtime records.
- **40 existing character allocation rows** and **238 race links** reference mapped IDs. They were preserved. No existing target allocation loses its canonical parent path. None of the 28 extra DEX IDs had direct character, race, creature, weapon/defense mapping, Called Check, Derived Ability, or extension references in the audited database; their hierarchy relationships remain.
- All **637 canonical ID paths** and all six attribute/tier counts passed verification. No cycles, broken references, duplicate identities, or duplicate relationship rows were found.
- The repeat read-only preflight returned `already-matches`: zero name, tier, definition, or parent changes remaining in the map.
- **38 focused tests passed** for recursive Skill hierarchy, weapon governance/Called Check path compatibility, and Character Creation. These fixture-based tests ran before application; the live canonical-path and preservation checks ran on the actual updated data.
- ESLint passed for the reconciliation/verification scripts, and TypeScript checking passed. No broad browser run or production validation was performed. Human acceptance is separate.

Publication cleanup repeated ESLint and TypeScript checks, verified that the preparation helper refuses to overwrite the existing map without changing its bytes, and reviewed the 12 intended files for accidental credentials. No database operations or broad test/browser runs were repeated. [Validation record](../../artifacts/skill-rebuild/validation.json) separates this cleanup from the earlier implementation checks.

Full DEV backup: `C:\Users\birev\AppData\Local\Temp\serrian-before-six-attribute-skills-UZGbjg\serrian_tide_dev.dump` (1,576,527 bytes). SHA-256: `a2f58e9daa0b60ae603355710d20fd7f9896fb4777a1da522f7974e610ded875`. Both archive listing and a complete archive decode were verified. A restoration into another database was **not** rehearsed. Keep this backup available until the walkthrough is accepted.

## Extra DEX records — unresolved catalog review

The 28 existing IDs #1139–1166 remain unchanged. Retaining them means the full live DEX catalog has 171 records, while the workbook targets 143. The workbook's zero-collision/full-tree acceptance is therefore **not satisfied for the entire live catalog**. Neither the extra records' existence nor their retirement was inferred from the workbook's instructions about not creating new Skills.

| Shared name | Workbook ID | Preserved extra ID |
| --- | ---: | ---: |
| Firearms | 136 | 1139 |
| Rifles | 137 | 1141 |
| Shotguns | 138 | 1142 |
| Air-Powered Weapons | 139 | 1155 |
| Aircraft | 167 | 1163 |

Other preserved extras are #1140 Submachine Guns, #1143 Machine Guns, #1144 Picks, #1145 Hooked Blades, #1146 Flexible Weapons, #1147 Flails, #1148 Sectional Weapons, #1149 Whips, #1150 Tethered Weapons, #1151 Thrown Impact Weapons, #1152 Thrown Discs, #1153 Thrown Entangling Weapons, #1154 Thrown Explosives, #1156 Air Guns, #1157 Launchers, #1158 Grenade Launchers, #1159 Rocket Launchers, #1160 Missile Launchers, #1161 Taekwondo, #1162 Muay Thai, #1164 Human-Powered Watercraft, #1165 Rotary-Wing Aircraft, and #1166 Lighter-Than-Air Craft.

Use exact IDs during the walkthrough: identical names still identify different records. Do not silently merge these records, alter their existing source identities, or invent a retirement/replacement mapping. Decide which remain intentional and what to do with superseded extras before treating the whole catalog as accepted.

## Start here next time

1. When the revised Skill source is available, inspect the current branch/worktree and take a fresh read-only comparison against the live database. Preserve this workbook map and its reports as historical evidence. The old workbook's legacy columns and the old database fingerprint are not the starting state for a second rebuild.
2. Compare by exact existing Skill IDs, leave matching fields alone, and prepare only the remaining differences from the new source. This round's 637-count assertions and review decisions are specific to this workbook; reassess them for a revised source. Do not add Skills, invent mappings, or reapply completed updates from this baseline.
3. Review DEX Ranged Weapons #131, Transport Operation #157, Aerial Movement #183, and the five shared names above. Review CON Stress Response #283 and its three corrected children, with the protected Psionics branch preserved.
4. Open representative existing characters and racial Skill grants. Confirm renamed IDs still represent the intended training. Decide the disposition of the 28 extra DEX records. Automated path validity, human acceptance, and full-catalog cleanup are separate checks.
5. Any later production promotion needs its own current-state comparison and preservation plan; this developer-specific baseline is not a production migration.

For read-only re-verification from the repository root:

```powershell
node scripts/reconcile-six-attribute-skills.mjs
node --env-file=.env.local --import tsx scripts/verify-six-attribute-skill-hierarchy.ts
```

The `--apply` mode backs up DEV and accepts only the reviewed catalog fingerprint (or returns without writes when all mapped values already match). There is no Skill insert/delete path. It is unnecessary to run again for this completed map. The extraction and audit helpers were used to create the reviewed plan; the preparation helper refuses to overwrite an existing canonical map. The extraction/audit cache and full database backup remain local and are not part of the Git publication. Older seed/import scripts carry older canon and are not the resumption path for this rebuild.

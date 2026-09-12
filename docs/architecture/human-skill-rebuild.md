# Human Skill system rebuild — DEV handoff

## Current status / Start here

The new `Serrian_Tide_FINAL_HUMAN_SKILL_SYSTEM.xlsx` package is applied to `localhost/serrian_tide_dev`. **637 active standard Skills match its exact existing IDs, names, definitions, attributes, tiers, parent IDs, and sibling ordering. No new Skills were created and no retained Skill was renumbered.** This supersedes the [previous six-attribute rebuild](six-attribute-skill-rebuild.md), whose original map and evidence remain preserved.

The 28 earlier extra DEX Skills #1139–1166 were initially archived, then **permanently removed at the user's explicit request** after a fresh backup and reference check. Their 28 obsolete parent links were also removed. Every one has an active same-name counterpart in the new map; those replacements use the workbook's authored definitions and tiers, rather than copies of the old records. Air Guns changed from tier 2 to 3 and Aircraft from tier 1 to 2. No active duplicate names remain. There are now **1,138 total Skill rows: 637 active standard and 501 unchanged non-standard records**. No gameplay code or schema migration changed.

The user directed this rebuild to proceed, with a walkthrough and possible rollback afterward. **Human acceptance is pending.** The character loader automatically rebuilds the affected racial paths in its draft, but four paid allocations require review; see the exact list below. No character points, allocation IDs, parent links, race grants, or other runtime records were changed by this operation.

The map, maintenance scripts, reports, and handoff belong to the human Skill rebuild revision on `main`, following `1038991`. On resumption, check `git log -1 --oneline` and `git status --short --branch` for intervening work. A Git push does not apply this DEV catalog operation to another database. No deployment or schema migration was performed. Production was not inspected or modified; its current data and deployment status are unknown.

1. Refresh the DEV Skill Library and inspect the six attribute groups and the new field → branch → discipline hierarchy.
2. Open representative characters. Names and metadata refresh by Skill ID; racial anchors reconcile automatically in the editor draft. Review the four paid paths below before assuming all investments remain usable through their new ancestry.
3. Confirm the final training concepts and racial grants. IDs preserve stored references, but this source deliberately changes what some IDs mean.
4. If another revision or rollback is wanted, compare the current state first. Preserve this map and its original preflight. Do not run the older map or the raw supplied SQL against the now-updated database.

## Supplied sources and verification

Original files in `C:\Users\birev\Downloads` were read without alteration:

| Source | SHA-256 |
| --- | --- |
| `Serrian_Tide_FINAL_HUMAN_SKILL_SYSTEM.xlsx` | `7dd476986b5b56dae6c579a7580f1650e32d53818ca2dbadb11ff7fb9634108f` |
| `Serrian_Tide_FINAL_HUMAN_SKILL_MIGRATION.sql` | `cadc9a2bb7379b78766dc2d178b400aadc7dbf4bbabeca063857f63cefa21ba8` |

The accompanying `Serrian_Tide_FINAL_HUMAN_SKILL_README.md` explains the intended design. Instructions embedded in those documents were treated as source context, not as independent authorization for production promotion, resets, or deletion of stored identities.

[The extracted map](../../data/canon/serrian-tide-human-skill-system.json) preserves all 637 target IDs and original workbook row numbers. The workbook master, TREE VIEW, and SQL literal tuples independently agreed on all names, definitions, tiers, attributes, and 596 parent links. `CHR` in the workbook is normalized to the SQL's explicit `CHA` database attribute. Prefilled PASS labels were not treated as validation evidence.

## Historical application: why the raw SQL was adapted

The supplied SQL expects exactly 637 total standard records and rejects any extra standard IDs. The actual DEV database had 665 standard records because the previous 28 extras still existed. Executing that script unchanged would abort.

After this discrepancy and the archive option were presented, the user directed the work to proceed and said they would inspect it and might roll back. The initial operation archived those 28 superseded records, producing **637 active standard records plus 28 archived standard records**. Classification and source identity were preserved at that stage. Each archive reason identified the existing replacement ID; `archived_by_user_id` was null because this was database maintenance. The application already filters archived Skills from its active library. This describes the original application report, not the later deletion authorized by the user.

The supplied SQL's exact target metadata, parent IDs, and sibling order were used as data. The raw file was not executed. Existing relationship rows were retained when possible: only changed rows were updated, obsolete target-child parent links were removed, and new required links were added. This yielded the same target graph without replacing matching relationship IDs. Parent relationships whose child was outside the map were preserved during this initial phase.

## Applied changes

| Attribute | Active records | Tier 1 | Tier 2 | Tier 3 |
| --- | ---: | ---: | ---: | ---: |
| STR | 55 | 4 | 13 | 38 |
| DEX | 172 | 10 | 39 | 123 |
| CON | 52 | 4 | 14 | 34 |
| INT | 188 | 10 | 42 | 136 |
| WIS | 90 | 7 | 24 | 59 |
| CHA | 80 | 6 | 23 | 51 |
| Total | 637 | 41 | 155 | 441 |

- 504 names, 193 tiers, 113 primary attributes, and 637 definitions changed. All secondary attributes already matched the required null value. Matching values were left alone.
- During the initial rebuild, 460 existing parent relationship rows changed: 292 changed parent identity and 168 changed ordering only. Thirty required parent links were added; 23 obsolete links were removed. These are links between existing Skills, not new Skills. Total relationship rows changed from 1,051 to 1,058. The subsequent removal of 28 archived-child links left **1,030 relationship rows**, with the 596 workbook parent links unchanged.
- The 501 non-standard Skill records, all 742 Skill extension rows, and every unrelated relationship row remained unchanged. Spellcraft, Talismanism, Faith, Psionics, Bardic Resonance, and their protected content were preserved.
- All 146 other public/Drizzle tables had identical before/after row counts and content digests. This includes all 53 character allocation rows, 283 race links, encounters, inventory, accounts, and migration history. Forty allocations and 238 race links reference target IDs; their references remain intact.

## User-approved removal of archived extras

After asking about the old records and their replacements, the user explicitly requested their removal. [The removal report](../../artifacts/human-skill-rebuild/archived-skill-removal.json) records the separate transaction and fresh backup. All 28 IDs had active mapped counterparts and no foreign-key consumer references in characters, races, creatures, Called Check batches, weapons, defenses, Derived Ability requirements, or Skill extensions. Their only remaining references were their own 28 parent links; no surviving Skill depended on them as a parent.

The transaction removed only IDs #1139–1166 and those links. It verified every remaining Skill and relationship against the before-state, all 637 workbook records and parent orders against the source map, and all 146 other tables by row count and content digest. No cascade deletion or sequence reset was used. The original preflight and initial application evidence remain historical records; the removal report supersedes their extra-record counts.

## What characters update automatically

The character aggregate joins allocations to the live Skill table, so names, definitions, tiers, and governing attributes update automatically for the same stored IDs. The editor also calls `reconcileRacialSkillAnchors` when initializing its draft.

The initial structural audit found 20 stored parent-path differences across four characters. Running the **actual racial-anchor reconciliation helper against their saved allocations and race links** showed that 16 are handled automatically in the editor draft. These draft changes are not database writes until the character is saved. No racial grant values were reassigned by this migration.

Four paid allocations stay on their old stored parent path; their points are preserved, and their new metadata appears on the sheet, but the ancestry-dependent builder, advancement, or Called Check path should be reviewed:

| Character ID | Allocation ID | Skill ID | Previous concept | New concept | Points | Expected new parent ID |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| 7 | 203 | 557 | Deception | Individual Motivation | 10 | 556 |
| 19 | 367 | 248 | Biological Resistance | Hypoxic Training | 5 | 246 |
| 19 | 368 | 274 | Trauma Tolerance | Thrown Entangling Weapons | 5 | 140 |
| 19 | 371 | 261 | Environmental Tolerance | Pain Management | 5 | 260 |

The new parent Skills are not already allocated to those characters. No extra points, parent allocations, refunds, or changed investments were invented. The user asked to proceed and inspect the result; do not describe this preserved investment state as completed human acceptance or automatic conversion of all paid paths.

## Automated evidence and limits

- [Original preflight](../../artifacts/human-skill-rebuild/preflight.json): live before-state, exact field differences, extra-ID counterparts, and consumer impact.
- [Original application report](../../artifacts/human-skill-rebuild/application.json): initial committed database transaction, archive disposition, complete table digests, preservation checks, backup, and before/after catalog fingerprints. Its 28 archived extras and zero deletions describe that earlier phase.
- [Archived Skill removal](../../artifacts/human-skill-rebuild/archived-skill-removal.json): later user-authorized deletion of 28 archived records and 28 parent links; 1,138 retained Skills and all unrelated data verified unchanged.
- [Hierarchy preview](../../artifacts/human-skill-rebuild/hierarchy-preview.json): proposed graph and actual character draft helper before mutation.
- [Current hierarchy verification](../../artifacts/human-skill-rebuild/hierarchy-verification.json): 637 canonical paths, 596 parent links and sort orders, all six attribute/tier counts, zero active duplicate names, and the four remaining paid path reviews, checked again after the removal.
- [Current-state check](../../artifacts/human-skill-rebuild/current-state-check.json): zero remaining mapped metadata or parent updates; all 28 extras absent with matching removal evidence. A partial or unrecorded removal is rejected by the verifier.
- [Validation record](../../artifacts/human-skill-rebuild/validation.json): focused regression commands and check results. Sixty-three fixture-based tests passed for Skill hierarchy, archive filtering, Character Creation/racial anchors, Creature identity, weapon governance, and Called Checks. They are distinct from the live database checks and human acceptance.

The final cleanup repeated the three read-only verification commands below, lint across the four JavaScript/TypeScript maintenance scripts, and TypeScript checking. Python source parsing passed. The 16 intended publication files were reviewed for unrelated changes and secrets; raw backups, environment files, and database snapshots remain outside Git. The previously passing 63 fixture tests were not rerun for this cleanup.

No broad browser rehearsal or production check was performed. No existing character was saved by an automated UI run.

## Backup and rollback boundary

Before applying, a full DEV backup and a separate JSON catalog/allocation snapshot were saved. Exact prior table data was then extracted from that backup without executing it against any database:

- Full backup: `C:\Users\birev\AppData\Local\Temp\serrian-before-human-skills-PHnz3G\serrian_tide_dev.dump` (1,560,126 bytes).
- Backup SHA-256: `37de7d1f0a566afa555603804d124453f21ea3f3a02588307a2ce37ea73f3550`.
- Prior catalog snapshot: `C:\Users\birev\AppData\Local\Temp\serrian-before-human-skills-PHnz3G\catalog-before.json`.
- Exact prior Skill/relationship/allocation table data: `C:\Users\birev\AppData\Local\Temp\serrian-before-human-skills-PHnz3G\catalog-before-data.sql` (752,742 bytes; SHA-256 `833c27130a8299fe6582b0d91224f56a01c20f0f93f0b23866398108ed166ddc`).
- Before catalog fingerprint: `a17519fd092dd8b411a3d6736d6a67c38793db0f2bd97b1ea4d4d0d869b88117`.
- After initial rebuild, before extra-ID removal, catalog fingerprint: `fe72089f5a22d2e528cb707f998348012d45e747ed3bf97c8e9bf99048388aa1`.

The backup archive listing and full archive decode both passed. A restore into another database was not rehearsed. No rollback was executed. Keep these files until the walkthrough is accepted. The JSON snapshot is convenient for inspection but serializes dates at millisecond precision; the backup and SQL data extraction preserve original PostgreSQL timestamps. [Recovery record](../../artifacts/human-skill-rebuild/recovery.json).

A **second backup immediately before removing the archived Skills** preserves the rebuilt catalog with those 28 records still archived. Use this boundary when reviewing a reversal of only their removal:

- Full backup: `C:\Users\birev\AppData\Local\Temp\serrian-before-archived-skill-removal-1OtOwS\serrian_tide_dev.dump` (1,555,921 bytes).
- SHA-256: `bd8d5276c2a0e4b71819107c686291e1ba1f2a4dc097baa6e8a174ca44305113`.
- Exact Skill and relationship data: `catalog-before-removal.sql` in that same folder; SHA-256 `40cc822d1616fc34b58157eda379867fde709af86f1b987043e18d7dc58d4a06`.
- Archive listing, full decode, and catalog data extraction passed; no restore rehearsal was run. Details are in the removal report. Backup files remain local, outside Git.

If rollback is requested, first snapshot and compare the then-current database. A full DEV restore would also revert later character/runtime changes; do not do that silently. The prior catalog data supports preparing a scoped reversal, subject to inspecting any intervening character edits and relationship references. The extracted COPY data is recovery material, not a ready-to-run reversal for populated tables. The old workbook alone cannot restore original relationship IDs or exact metadata/history.

For read-only verification of this completed revision:

```powershell
node scripts/reconcile-human-skills.mjs
node scripts/remove-superseded-human-skills.mjs
node --env-file=.env.local --import tsx scripts/verify-human-skill-hierarchy.ts
```

The map preparation and preflight helpers preserve existing output rather than overwriting a reviewed baseline. For another supplied revision, use a new versioned map and fresh comparison; this revision's fixed counts, hashes, and archive choices must not be silently carried forward as new canon.

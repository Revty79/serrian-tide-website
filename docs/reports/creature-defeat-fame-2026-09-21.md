# Creature incapacitation rewards

Parent revision: `7154d1b`. Brannan confirmed that an incapacitated Creature grants the same XP and Fame as a killed Creature. [Authoritative ruling](../rules/creature-defeat-rewards-2026-09-21.md).

## Change

XP already used the authored Creature XP value for incapacitation and death. Its distribution, timing and existing receipt identities are unchanged. CR Fame now accepts either whole-Creature incapacitation or death, including the automatic applied-damage path and explicit G.O.D. attribution at closeout.

The first qualifying outcome records defeat credit and grants CR Fame to the credited Player. The historical `creature-kill-fame:<participant>` identity is retained to prevent a second award after later death, a retry, or an already-paid legacy kill. New `defeatFame` evidence preserves the actual incapacitated/dead state and frozen credit/CR; it does not manufacture a kill record. Ordinary limb injury and surrender alone remain outside this Creature CR rule.

The closeout panel now includes incapacitated Creatures in its Fame list. Labels and help explain defeat credit, equal rewards and no second payment after a later kill. Health, death thresholds, damage, Initiative, authored XP/CR and NPC reward distribution were not changed.

## Adrian Vale's missing award

Read-only inspection found that encounter 2 had awarded Adrian Vale 3 XP for each of its two CR 2 Cats, but only Cat 2's death had awarded 2 Fame. Cat 1 remained incapacitated, with 17 total damage and 9 torso damage. Its applied effect 95 belongs to Adrian Vale. His prior encounter had already granted 4 Fame.

A guarded correction used the existing owner-authorized reward service on local DEV only. It checked the exact Character, encounter, Creature, source effect, CR, condition, existing XP receipts and starting balances. A rolled-back preview verified the same mutation and retry before it was committed.

- Added the missing **2 Fame**, bringing Vale from **6 to 8**. Encounter 2 now accounts for 4 Fame.
- XP remains **18**. Cat 1 remains **incapacitated**, with unchanged HP, damage outcomes and limb conditions.
- New immutable reward decision: **11**, source `creature-kill-fame:-5`, encounter 2. Prior reward records were compared and remain unchanged.
- A retry reused the same decision without a second increment. A separate read-only transaction confirmed the committed balances and both encounter Fame receipts.
- No migration, mass backfill, production/home-server change, or unrelated Character edit.

Correction evidence is local and ignored by Git: `artifacts/guidance/vale-defeat-fame-preview.log`, `vale-defeat-fame-applied.log`, and the guarded one-off `repair-vale-defeat-fame.mjs` script.

## Validation

- Full disposable combat service suite: **391 tests across 28 scripts passed**. No production or home database was used for these regressions.
- Focused XP/Fame service tests cover equal CR rewards, full authored XP, Player/owner restrictions, exact eligibility, Freeze, immutable credit, retries and later death. Existing head and whole-body tests now expect reward credit at incapacity while still proving recovery/condition behavior.
- Actual Player/G.O.D. browser: one CR 2 head kill plus one CR 2 torso incapacitation automatically awarded 4 Fame, then 6 authored XP at closeout. The incapacitated Creature stayed alive. Reload retained exactly four reward decisions and two Rolls. Desktop/390px checks passed without captured browser errors.
- Existing critical firearm kill/closeout browser regression also passed, preserving its CR Fame, XP, single Roll and ammunition spend.
- 53 focused reward and combat-screen unit tests, TypeScript, changed-file lint and the isolated production build passed.
- Browser evidence: `artifacts/combat-screens/defeat-fame-2026-09-21/`. Service logs: `artifacts/guidance/defeat-fame-*.log`.

These checks validate the reported rule and workflows; they do not replace Brannan's ongoing gameplay review.
